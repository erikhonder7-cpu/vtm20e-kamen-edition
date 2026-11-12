// tools/e2e.mjs — автотесты в браузере против песочницы Foundry:
//   node tools/e2e.mjs [--url http://localhost:30002] [--user Gamemaster] [--headed] [--sync <папка системы в песочнице>] [--only "часть названия|другая"] [--group vampire,mage,werewolf,fallen,hunter,combat,creator,city,npc]
// Входит рассказчиком, открывает лист, бросает черту, открывает окна системы (опыт, библиотеку, охоту,
// опасности, урон, диаблери, справочник кланов, ночь простоя, реестр услуг), ставит и снимает паузу; проверяет
// толпу статистов, сроки сил и чтение ритуала, торпор и Окончательную смерть, охоту с карты (угодья и домен),
// жар Маскарада и звуки интерфейса; «Город» без модуля Парижа (новый мир) и автовключение модуля в старом мире; всё это время ловит ошибки в консоли. Браузер — установленный Edge (playwright-core, channel «msedge»), ничего не скачивается.
// В CI не запускается: там нет Foundry. packs в песочнице — своя копия, а не ссылка, поэтому её можно поднимать
// и при открытом Foundry пользователя (компендии системы при этом не пересобирать).
// --sync копирует vtm20.mjs и system.json в песочницу: там это копии, остальное (кроме packs) подключено ссылкой.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const URL = arg("--url", "http://localhost:30002").replace(/\/$/, "");
const USER = arg("--user", "Gamemaster");
const HEADED = process.argv.includes("--headed");
const SYNC = arg("--sync", "");
// --only «часть названия»: только эти проверки (вход, загрузка системы и уборка — всегда); несколько — через «|»
const ONLY = arg("--only", "").toLowerCase().split("|").map(x => x.trim()).filter(Boolean);
const ALWAYS = ["Вход рассказчиком", "Система загружена"];
// --group «имя,имя»: проверки одной линейки или области по словам в названии (быстрый прогон вместо полного, ~15 минут).
// Отметку для релиза (tools/.cache/e2e-ok.json) ставит только полный прогон — без --only и --group.
const GROUPS = {
  mage: /(^|[^а-яё])маг|колдун|нефанд|чуд(о|а|ес)(?![а-яё])/i,
  werewolf: /гару|оборот|фера|дух умбры|родн|ками|фомор|тотем/i,
  fallen: /падш|слуг|привязан|вера против|муки|тело-носитель/i,
  hunter: /охотник|свидетел/i,
  combat: /бой|ход боя|инициатив|урон|стремительност|мощь/i,
  creator: /мастер|создани|становлени/i,
  city: /город|карт|стратег|домен|маскарад|париж|песочниц|мир:|нексус|час|календар/i,
  npc: /нпс|статист|толпа|групп/i,
  wraith: /призрак|арканос|пафос|катарсис/i
};
// vampire — всё остальное: лист, броски, Дисциплины через HUD, кровь, узы, торпор (то, что не попало в группы выше)
const inGroup = (g, name) => g === "vampire" ? !Object.values(GROUPS).some(rx => rx.test(name)) : GROUPS[g].test(name);
const GROUP = arg("--group", "").toLowerCase().split(",").map(x => x.trim()).filter(Boolean);
for (const g of GROUP) if (g !== "vampire" && !GROUPS[g]) { console.error(`Нет группы «${g}». Есть: vampire, ${Object.keys(GROUPS).join(", ")}`); process.exit(1); }
const PARTIAL = ONLY.length > 0 || GROUP.length > 0;
/** Идёт ли проверка в этом прогоне: полный — все; иначе по словам --only или по группе. */
const wanted = name => !PARTIAL || ALWAYS.includes(name) || ONLY.some(x => name.toLowerCase().includes(x)) || GROUP.some(g => inGroup(g, name));

// Шум, который к системе не относится
const IGNORE = [/Cannot set language/i, /hardware acceleration/i, /favicon\.ico/i, /WebGL/i];

if (SYNC) for (const f of ["vtm20.mjs", "system.json"]) fs.copyFileSync(path.join(ROOT, f), path.join(SYNC, f));

const results = [];
const errors = [];
let page, step = "запуск";

async function check(name, fn) {
  if (!wanted(name)) return;
  step = name;
  const before = errors.length;
  try {
    // зависшая проверка (окно ждёт ответа и т. п.) не должна вешать весь прогон
    let timer;
    await Promise.race([fn(), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("зависла: нет ответа за 3 минуты")), 180000); })])
      .finally(() => clearTimeout(timer));
    process.stdout.write(`… ${name}\n`);
    const fresh = errors.length - before;
    results.push({ name, ok: !fresh, note: fresh ? `ошибок в консоли: ${fresh}` : "" });
  } catch (e) {
    results.push({ name, ok: false, note: String(e.message ?? e).split("\n")[0] });
  }
}

/** Открыть окно вызовом в странице и дождаться его элемента; затем закрыть. */
async function opens(name, js, selector) {
  await check(name, async () => {
    await page.evaluate(js);
    await page.waitForSelector(selector, { timeout: 10000 });
    await page.waitForTimeout(400);
    await page.evaluate(sel => {
      for (const app of foundry.applications.instances.values()) if (app.element?.matches?.(sel)) app.close();
    }, selector);
  });
}

/** Перезагрузить мир и дождаться готовности (система может перезагрузить его ещё раз сама — ждём через навигации). */
async function reloadUntil(predicate, arg, timeout = 120000) {
  await page.reload({ waitUntil: "domcontentloaded" });
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await page.evaluate(predicate, arg)) return; } catch { /* мир перезагружается */ }
    await page.waitForTimeout(1000);
  }
  throw new Error("мир не дошёл до нужного состояния после перезагрузки");
}
const CITY_MODULE = "vtm20e-kamen-city";

/** Вход на /join: список пользователей (обычно) или поле имени (если список скрыт настройкой сервера). */
async function joinAs(p, { name, id }) {
  if (await p.$("select[name=userid]")) await p.selectOption("select[name=userid]", id ?? { label: name });
  else await p.fill("input[name=username]", name);
  await p.click("button[name=join]");
}

// Edge из Windows; если его нет — Chromium Playwright (один раз: npx playwright install chromium)
const browser = await chromium.launch({ channel: "msedge", headless: !HEADED })
  .catch(e => { console.warn(`Edge не найден (${String(e.message).split("\n")[0]}) — Chromium Playwright`); return chromium.launch({ headless: !HEADED }); });
try {
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  // со стеком: по одному сообщению не понять, чей это код
  page.on("pageerror", e => {
    const where = String(e.stack ?? "").split("\n").slice(1, 3).map(x => x.trim()).join(" ← ");
    // гонка ядра: уведомление пришло, пока мир перезагружается после смены настроек и панели уведомлений ещё нет
    if (/#postNotification/.test(where)) return;
    errors.push({ step, text: String(e.message ?? e), where });
  });
  page.on("console", m => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (!IGNORE.some(re => re.test(text))) errors.push({ step, text });
  });

  await check("Вход рассказчиком", async () => {
    await page.goto(`${URL}/join`, { waitUntil: "networkidle", timeout: 60000 });
    if (page.url().includes("/join")) {
      await joinAs(page, { name: USER });
    }
    await page.waitForFunction(() => window.game?.ready === true, null, { timeout: 120000 });
  });
  if (!results[0].ok) throw new Error(`не удалось войти: ${results[0].note}`);

  await check("Система загружена", async () => {
    const v = await page.evaluate(() => [game.system.id, game.system.version, !!game.vtm20]);
    if (v[0] !== "vtm20e-kamen-edition" || !v[2]) throw new Error(`система ${v[0]}, game.vtm20 ${v[2]}`);
    // окно «Справочник обновился» (offerWorldRefresh) — не мешает проверкам, которые жмут кнопки диалогов
    await page.waitForTimeout(1500);
    await page.evaluate(async () => {
      for (const app of [...foundry.applications.instances.values()]) if (app.element?.classList.contains("r-refresh")) await app.close();
      await game.settings.set(game.system.id, "refreshChecked", game.system.version);
      // хвосты прерванного прогона: начатый бой держит лимит крови за ход и ломает проверки сил, жетоны без персонажа мешают целям
      const stale = n => /^(E2E|QA) — /.test(n ?? "");
      for (const c of [...game.combats]) if (!c.combatants.size || c.combatants.every(x => stale(x.name) || !x.actor)) await c.delete();
      for (const s of game.scenes) { const ids = s.tokens.filter(tk => stale(tk.name) || !tk.actor).map(tk => tk.id); if (ids.length) await s.deleteEmbeddedDocuments("Token", ids); }
      const old = game.actors.filter(x => x.getFlag("world", "e2e")).map(x => x.id);
      if (old.length) await Actor.deleteDocuments(old);
      // окна «Против правил» (apps/rule-gate.mjs): по умолчанию «Отмена», globalThis.__e2eGate = "yes" — «Всё равно»
      Hooks.on("renderDialogV2", app => { if (app.element?.classList.contains("r-gate")) setTimeout(() =>
        app.element?.querySelector(`button[data-action="${globalThis.__e2eGate === "yes" ? "yes" : "no"}"]`)?.click(), 50); });
    });
  });

  // Персонаж для проверок: первый вампир мира, иначе временный (удаляется в конце)
  const actorId = await page.evaluate(async () => {
    let a = game.actors.find(x => x.type === "vampire" && x.isOwner && !x.getFlag("world", "e2e"));
    if (!a) { a = await Actor.create({ name: "E2E — проверка", type: "vampire" }); a.setFlag("world", "e2e", true); }
    window._e2e = { actor: a, messages: game.messages.size };
    return a.id;
  });

  await check("Лист персонажа", async () => {
    await page.evaluate(() => window._e2e.actor.sheet.render({ force: true }));
    await page.waitForSelector(`.application.sheet[id$="${actorId}"]`, { timeout: 15000 });
  });

  await check("Бросок черты из листа", async () => {
    const sheet = `.application.sheet[id$="${actorId}"]`;
    await page.evaluate(sel => document.querySelector(`${sel} a[data-action=rollTrait]`).click(), sheet);
    await page.waitForSelector(".r-roll-dialog", { timeout: 10000 });
    const n = await page.evaluate(() => game.messages.size);
    await page.click(".r-roll-dialog button[type=submit]");
    await page.waitForFunction(n => game.messages.size > n, n, { timeout: 15000 });
  });

  await opens("Окно опыта", `document.querySelector('.application.sheet[id$="${actorId}"] [data-action=openXp]').click()`, ".r-xp-app");
  await opens("Библиотека достоинств", "game.vtm20.openLibrary({ actor: window._e2e.actor, kind: 'merit' })", ".r-library");
  await opens("Охота", "game.vtm20.openHunt(window._e2e.actor)", ".r-hunt-dialog");
  await opens("Опасности", "game.vtm20.openHazard(window._e2e.actor)", ".r-hazard");
  await opens("Урон", "game.vtm20.openDamageDialog(window._e2e.actor)", ".r-damage");
  await opens("Диаблери", "game.vtm20.openDiablerie(window._e2e.actor)", ".r-diablerie");
  await opens("Справочник кланов", "game.vtm20.openClans(window._e2e.actor.system.clan)", "#r-clans");
  await opens("Ночь простоя", "game.vtm20.openDowntime(window._e2e.actor)", ".r-downtime-dialog");

  await check("Реестр услуг", async () => {
    await page.evaluate(async () => {
      const a = window._e2e.actor, { addBoon } = await import(`/systems/${game.system.id}/module/apps/boons.mjs`);
      window._e2e.boons = foundry.utils.deepClone(a._source.system.boons ?? []);
      await addBoon(a, "owe");
      const list = foundry.utils.deepClone(a._source.system.boons);
      list.at(-1).name = "E2E — кредитор";
      await a.update({ "system.boons": list });
      game.vtm20.openBoons();
    });
    await page.waitForSelector("#r-boons .r-bn-row", { timeout: 10000 });
    const found = await page.evaluate(() => [...document.querySelectorAll("#r-boons .r-bn-row")].some(li => li.textContent.includes("E2E — кредитор")));
    await page.evaluate(async () => { foundry.applications.instances.get("r-boons")?.close(); await window._e2e.actor.update({ "system.boons": window._e2e.boons }); });
    if (!found) throw new Error("услуга с листа не попала в реестр");
  });

  await check("Пауза «Капля»", async () => {
    await page.evaluate(() => game.togglePause(true, { broadcast: false }));
    await page.waitForSelector("#r-pause", { timeout: 5000 });
    await page.evaluate(() => game.togglePause(false, { broadcast: false }));
    await page.waitForSelector("#r-pause", { state: "detached", timeout: 6000 });
  });

  // Новое с 0.11: статисты и толпы, сроки по часам хроники, торпор, охота с карты, Маскарад.
  // Каждая проверка заводит своего временного персонажа с флагом world.e2e — уборка ниже удалит всех.
  const temp = (name, type = "vampire") => page.evaluate(async ([name, type]) => {
    const a = await Actor.create({ name, type, flags: { world: { e2e: true } } });
    return a.id;
  }, [name, type]);

  await check("Толпа: общее здоровье и бонус к атаке", async () => {
    const id = await temp("E2E — толпа", "mortal");
    const st = await page.evaluate(async id => {
      const a = game.actors.get(id), X = await import(`/systems/${game.system.id}/module/apps/extras.mjs`);
      await X.makeExtra(a, { mob: 4 });
      const before = X.mobState(a);
      await a.applyDamage(4, "lethal");
      return { before, after: X.mobState(a) };
    }, id);
    if (st.before?.size !== 4 || st.before.bonus !== 3) throw new Error(`толпа из 4: ${JSON.stringify(st.before)}`);
    if (st.after.alive !== 3 || st.after.bonus !== 2) throw new Error(`после 4 урона: ${JSON.stringify(st.after)}`);
    await page.evaluate(id => game.actors.get(id).sheet.render({ force: true }), id);
    await page.waitForSelector(".r-extra-sheet", { timeout: 10000 });
    await page.evaluate(id => game.actors.get(id).sheet.close(), id);
  });

  await check("Пути Просветления: деградация, Инстинкты, столп, переход с Человечности", async () => {
    const id = await temp("E2E — путник");
    const r = await page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id), wait = ms => new Promise(res => setTimeout(res, ms)), out = {};
      const { Codex } = await import(`/systems/${SYS}/module/data/codex.mjs`);
      const V = await import(`/systems/${SYS}/module/dice/virtue-checks.mjs`), P = await import(`/systems/${SYS}/module/apps/path-shift.mjs`);
      const { RollDialog } = await import(`/systems/${SYS}/module/dice/dialog.mjs`);
      // деградация: неудача — Путь −1; провал — ещё и Совесть −1
      await a.update({ "system.morality.value": 7, "system.virtues.conscience.value": 3 });
      await V.degenerate(a, { successes: 0, outcome: "failure" }); out.fail = a.system.morality.value;
      await V.degenerate(a, { successes: 0, outcome: "botch" }); out.botch = `${a.system.morality.value}/${a.system.virtues.conscience.value}`;
      await V.degenerate(a, { successes: 2, outcome: "success" }); out.kept = a.system.morality.value;
      // столп: Человечность 10 — −2 к сложности социального броска, галочкой
      await a.update({ "system.morality.value": 10 });
      const dlg = new RollDialog(a, { trait1: "attributes.charisma", trait2: "abilities.empathy", difficulty: 6 });
      out.bearing = dlg.compute().diffSit.find(d => d.kind === "bearing")?.value ?? null;
      // переход с Человечности: 3 успеха — Путь 2, новые Добродетели по 1
      const path = Codex.paths.find(p => p.virtues.includes("conviction") && p.virtues.includes("instinct"));
      await a.update({ "system.morality.value": 3, "system.virtues.conscience.value": 1, "system.virtues.selfControl.value": 1 });
      await P.settle(a, path, { successes: 3, outcome: "success" });
      out.shift = `${a.system.morality.path === path.key}/${a.system.morality.value}/${a.virtueKey("conscience")}/${a.virtueKey("selfControl")}`;
      // Инстинкты: проверки нет — окно с выбором; повод ниже Инстинктов разрешает «не поддаться»
      await a.update({ "system.virtues.selfControl.value": 4, "system.clan": "toreador" });   // без поправки Бруха (+2)
      V.rollVirtueCheck(a, "frenzy", { difficulty: 3 });
      let box = null;
      for (let i = 0; i < 30 && !box; i++) { await wait(100); box = document.querySelector(".application.r-instinct"); }
      out.instinct = !!box && !box.querySelector("button[data-action=resist]")?.disabled;
      box?.querySelector("button[data-action=resist]")?.click(); await wait(400);
      out.calm = !a.statuses.has("r-frenzy");
      return out;
    }, id);
    if (r.fail !== 6 || r.botch !== "5/2" || r.kept !== 5) throw new Error(`деградация: неудача ${r.fail}, провал ${r.botch}, успех ${r.kept}`);
    if (r.bearing !== -2) throw new Error(`столп при Человечности 10: ${r.bearing}`);
    if (r.shift !== "true/2/conviction/instinct") throw new Error(`переход на Путь: ${r.shift}`);
    if (!r.instinct || !r.calm) throw new Error(`Инстинкты: окно ${r.instinct}, без ярости ${r.calm}`);
  });

  await check("Становление Сородича и особые сосуды: кровь оборотня, алкоголь, болезнь крови", async () => {
    const sireId = await temp("E2E — сир"), mortalId = await temp("E2E — смертный", "mortal");
    const r = await page.evaluate(async ([sireId, mortalId]) => {
      const SYS = game.system.id, sire = game.actors.get(sireId), m = game.actors.get(mortalId), out = {};
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const until = async f => { for (let i = 0; i < 40; i++) { const x = f(); if (x) return x; await wait(100); } return null; };
      const E = await import(`/systems/${SYS}/module/apps/embrace.mjs`), N = await import(`/systems/${SYS}/module/apps/night.mjs`);
      const { RollDialog } = await import(`/systems/${SYS}/module/dice/dialog.mjs`), { getClock } = await import(`/systems/${SYS}/module/apps/calendar.mjs`);
      const T = await import(`/systems/${SYS}/module/apps/timers.mjs`);
      await sire.update({ "system.clan": "toreador", "system.generation": 9 });
      // Становление: сир из мира — клан и поколение от него; Ангра-Майнью — предупреждение
      E.embrace(m);
      const dlg = await until(() => document.querySelector(".r-embrace"));
      const sel = dlg.querySelector("[name=sire]"); sel.value = sire.id; sel.dispatchEvent(new Event("change"));
      const clan = dlg.querySelector("[name=clan]"); out.gen = dlg.querySelector("[name=gen]").value;
      clan.value = "angraMaynyu"; clan.dispatchEvent(new Event("change")); out.warn = !dlg.querySelector("[data-warn]").hidden;
      clan.value = "toreador"; clan.dispatchEvent(new Event("change"));
      dlg.querySelector("button[data-action=ok]").click();
      await until(() => game.actors.get(mortalId)?.type === "vampire" && game.actors.get(mortalId).items.some(i => i.type === "discipline"));
      const v = game.actors.get(mortalId);
      // запись дитяти у сира идёт последней — дождаться и её, иначе на медленной машине гонка
      await until(() => sire.system.bonds.some(b => b.role === "thrall" && b.name === v.name));
      out.embraced = `${v.type}/${v.system.clan}/${v.system.generation}/${v.system.details.sire}`;
      out.bond = v.system.bonds.find(b => b.role === "regnant")?.rating; out.childe = sire.system.bonds.find(b => b.role === "thrall")?.name === v.name;
      out.discs = v.items.filter(i => i.type === "discipline").length; out.pool = v.system.blood.value;
      // оборотень: 20 пунктов, алкоголь ×3 — −3 к Ловкости, через 3 часа хроники снимается
      await v.update({ "system.blood.value": 0 });
      out.drank = await N.drinkVessel(v, { n: 20, vessel: "werewolf", substance: "alcohol", dose: 3, noStop: true });
      out.dex = new RollDialog(v, { trait1: "attributes.dexterity", difficulty: 6 }).compute().breakdown.find(b => b.label.startsWith("Алкоголь"))?.value ?? 0;
      await T.expireTimers(getClock() + 3 * 3600000 + 1000); out.sober = !v.effects.some(e => e.flags?.[SYS]?.substance);
      // болезнь крови: заметил — не пьёт; не заметил и провалил Выносливость — «Разносчик заразы»
      await v.update({ "system.blood.value": 2 });
      await N.drinkVessel(v, { n: 2, vessel: "human", ill: true, look: { outcome: "success" } }); out.noticed = v.system.blood.value;
      await N.drinkVessel(v, { n: 2, vessel: "human", ill: true, look: { outcome: "failure" }, resist: { outcome: "success" }, noStop: true });
      out.clean = !v.items.some(i => i.name === "Разносчик заразы");
      await N.drinkVessel(v, { n: 1, vessel: "bag", ill: true, look: { outcome: "failure" }, resist: { outcome: "failure" }, noStop: true });
      out.carrier = v.items.some(i => i.type === "flaw" && i.name === "Разносчик заразы");
      return out;
    }, [sireId, mortalId]);
    if (r.gen !== "10" || !r.warn) throw new Error(`окно Становления: поколение ${r.gen}, предупреждение Ангра-Майнью ${r.warn}`);
    if (r.embraced !== "vampire/toreador/10/E2E — сир" || r.bond !== 1 || !r.childe || r.discs !== 3 || !(r.pool >= 1 && r.pool <= 10))
      throw new Error(`Становление: ${JSON.stringify(r)}`);
    if (r.drank !== 13 || r.dex !== -3 || !r.sober) throw new Error(`кровь оборотня: выпито ${r.drank} (предел 13), алкоголь ${r.dex}, снят ${r.sober}`);
    if (r.noticed !== 2 || !r.clean || !r.carrier) throw new Error(`болезнь крови: заметил ${r.noticed}, чист ${r.clean}, разносчик ${r.carrier}`);
  });

  await check("Гару: восстановление Гнозиса — охота, медитация раз в день", async () => {
    const id = await temp("E2E — Гару Гнозис", "werewolf");
    const r = await page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id), out = {}, wait = ms => new Promise(res => setTimeout(res, ms));
      const W = await import(`/systems/${SYS}/module/apps/werewolf.mjs`);
      const until = async f => { for (let i = 0; i < 40; i++) { const x = f(); if (x) return x; await wait(100); } return null; };
      const pick = async key => { const b = await until(() => document.querySelector(`.r-wc-dlg [data-pick="${key}"]:not([disabled])`)); b?.click(); await wait(400); return !!b; };
      await a.update({ "system.werewolf.gnosis": { permanent: 5, value: 1 } });
      W.regainGnosis(a); out.hunt = await pick("hunt");
      // окно закрывается с анимацией, запись идёт следом — ждём самого значения, а не срока
      await until(() => a.system.werewolf.gnosis.value === 5); out.full = a.system.werewolf.gnosis.value;
      await a.update({ "system.werewolf.gnosis.value": 1 });
      W.regainGnosis(a); out.med = await pick("meditate");
      const d = await until(() => [...foundry.applications.instances.values()].find(x => x.constructor.name === "RollDialog"));
      out.diff = d?.values?.difficulty; await d?.cfg.onRolled?.({ successes: 2, outcome: "success" }); await d?.close();
      out.after = a.system.werewolf.gnosis.value;
      W.regainGnosis(a); await until(() => document.querySelector(".r-wc-dlg [data-pick=meditate]"));
      out.again = !!document.querySelector(".r-wc-dlg [data-pick=meditate][disabled]");
      document.querySelector(".r-wc-dlg [data-action=cancel]")?.click(); await wait(300);
      return out;
    }, id);
    if (!r.hunt || r.full !== 5) throw new Error(`священная охота: ${r.full}`);
    if (!r.med || r.diff !== 8 || r.after !== 3 || !r.again) throw new Error(`медитация: сл. ${r.diff}, Гнозис ${r.after}, второй раз закрыта ${r.again}`);
  });

  await check("Дух Умбры: свой лист, тема «Пенумбра», урон по Эссенции, переключение на лист существа", async () => {
    const id = await page.evaluate(async () => {
      const W = await import(`/systems/${game.system.id}/module/apps/werewolf.mjs`);
      const key = W.W().spirits[0].key, a = await W.createSpirit(key, "E2E — дух");
      await a.setFlag("world", "e2e", true);
      return a.id;
    });
    const r = await page.evaluate(async id => {
      const a = game.actors.get(id), wait = ms => new Promise(res => setTimeout(res, ms)), out = {};
      await a.sheet.render(true); await wait(900);
      out.sheet = a.sheet.constructor.name; out.theme = a.sheet.element.classList.contains("r-type-spirit");
      out.traits = a.sheet.element.querySelectorAll(".r-sp-trait").length; out.rail = !!a.sheet.element.querySelector(".r-rail .r-rtab");
      // любой урон снимает Эссенцию, здоровье не трогается (W20, гл. 11)
      const e0 = a.system.spirit.essence.value;
      await a.applyDamage(3, "aggravated");
      out.essence = e0 - a.system.spirit.essence.value; out.health = a.system.health.aggravated;
      await a.sheet.close();
      // свой тип «Дух»; переключатель «Дух» — только у существа (прежние духи): снят — лист существа, поставлен — лист духа
      out.type = a.type;
      const old = await Actor.create({ name: "E2E — дух-существо", type: "creature", flags: { world: { e2e: true } }, system: { spirit: { on: true } } });
      out.oldSheet = old.sheet.constructor.name;
      await old.update({ "system.spirit.on": false }); await wait(400); out.off = old.sheet.constructor.name;
      await old.update({ "system.spirit.on": true }); await wait(400); out.on = old.sheet.constructor.name;
      await old.delete();
      return out;
    }, id);
    if (r.sheet !== "SpiritSheet" || !r.theme || r.traits !== 3) throw new Error(`лист духа: ${JSON.stringify(r)}`);
    if (r.essence !== 3 || r.health !== 0) throw new Error(`урон духу: Эссенция −${r.essence}, губительных ${r.health}`);
    if (r.type !== "spirit" || r.oldSheet !== "SpiritSheet" || r.off !== "VtMActorSheet" || r.on !== "SpiritSheet") throw new Error(`тип и переключение: ${r.type}, ${r.oldSheet}, ${r.off} / ${r.on}`);
  });

  await check("Маскарад: охотники при огласке — карточка, «Не нужно», настройка", async () => {
    const r = await page.evaluate(async () => {
      const SYS = game.system.id, raw0 = foundry.utils.deepClone(game.settings.get(SYS, "cityMap") ?? {}), on0 = game.settings.get(SYS, "huntersAlert");
      if (raw0.v !== 2 || !raw0.cities?.[raw0.current]) return { skip: true };
      const wait = ms => new Promise(res => setTimeout(res, ms)), out = {};
      const M = await import(`/systems/${SYS}/module/ui/masquerade.mjs`), { getClock } = await import(`/systems/${SYS}/module/apps/calendar.mjs`);
      try {
        // огласка: три свежих нарушения — жар 14, верхняя ступень
        const raw = foundry.utils.deepClone(raw0), c = raw.cities[raw.current];
        c.breaches = [5, 5, 4].map((level, i) => ({ id: `e2e${i}`, lat: 48.85 + i * .003, lng: 2.34 + i * .003, level, at: getClock(), text: "", gmOnly: true }));
        delete c.huntersWave;
        await game.settings.set(SYS, "cityMap", raw);
        await game.settings.set(SYS, "huntersAlert", false);
        let n = game.messages.size; await M.huntersAlert(); out.off = game.messages.size - n;
        await game.settings.set(SYS, "huntersAlert", true);
        n = game.messages.size; await M.huntersAlert(); await M.huntersAlert(); out.on = game.messages.size - n;   // вторая — та же волна, карточки нет
        const msg = game.messages.contents.at(-1); await wait(400);
        const el = document.querySelector(`[data-message-id="${msg.id}"]`);
        out.buttons = el ? el.querySelectorAll("[data-r-hunters]").length : 0;
        el?.querySelector("[data-r-hunters=skip]")?.click(); await wait(600);
        out.skipped = !game.messages.get(msg.id);
      } finally {
        await game.settings.set(SYS, "cityMap", raw0);
        await game.settings.set(SYS, "huntersAlert", on0);
      }
      return out;
    });
    if (r.skip) return;
    if (r.off !== 0 || r.on !== 1 || r.buttons !== 3 || !r.skipped) throw new Error(`охотники: выкл ${r.off}, вкл ${r.on}, кнопок ${r.buttons}, «Не нужно» ${r.skipped}`);
  });

  await check("Гару: остаться в строю и шрам, Ярость по Луне, отказ фетиша, Харано, тотем стаи", async () => {
    const id = await temp("E2E — Гару в строю", "werewolf"), packId = await temp("E2E — стая", "coterie");
    const r = await page.evaluate(async ([id, packId]) => {
      const SYS = game.system.id, a = game.actors.get(id), pack = game.actors.get(packId), out = {};
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const W = await import(`/systems/${SYS}/module/apps/werewolf.mjs`), C = await import(`/systems/${SYS}/module/apps/coterie.mjs`);
      const until = async f => { for (let i = 0; i < 40; i++) { const x = f(); if (x) return x; await wait(100); } return null; };
      // бросок без кубиков: окно броска открыто — его onRolled вызывается с нужным итогом
      const rolled = async res => { const d = await until(() => [...foundry.applications.instances.values()].find(x => x.constructor.name === "RollDialog"));
        await d?.cfg.onRolled?.(res); await d?.close(); return !!d; };
      const pick = async key => { const b = await until(() => document.querySelector(`.r-wc-dlg [data-pick="${key}"]:not([disabled])`)); b?.click(); await wait(400); return !!b; };
      await a.update({ "system.werewolf": { breed: "homid", auspice: "ahroun", tribe: "fianna", rage: { permanent: 5, value: 1 } },
        "system.health": { lethal: 7, bashing: 0, aggravated: 0 } });
      // остаться в строю: 2 успеха — два уровня вылечено, раз в сцену, шрам — карточкой (+1 Слава у глубокого)
      W.stayUp(a); out.stay = await rolled({ successes: 2, outcome: "success" });
      out.scarPick = await pick("scar-2");
      out.health = a.system.health.lethal; out.scars = a.system.werewolf.scars.join(); out.glory = a.system.werewolf.renown.glory.temporary;
      // Ярость по Луне: первый взгляд за ночь — прибавка, второй раз карточка закрыта
      W.regainRage(a); out.moon = await pick("moon"); out.rage = a.system.werewolf.rage.value;
      W.regainRage(a); await until(() => document.querySelector(".r-wc-dlg [data-pick=moon]"));
      out.moonAgain = !!document.querySelector(".r-wc-dlg [data-pick=moon][disabled]");
      document.querySelector(".r-wc-dlg [data-action=cancel]")?.click(); await wait(300);
      // фетиш: провал настройки — «отверг», повторной настройки нет до примирения
      const f = W.W().fetishes.find(x => x.kind !== "talen");
      await a.update({ "system.werewolf.fetishes": [{ key: f.key, attuned: false, n: 1 }] });
      W.attuneFetish(a, 0); await rolled({ successes: 0, outcome: "botch" });
      out.rejected = a.system.werewolf.fetishes[0].rejected;
      await W.reconcileFetish(a, 0); out.reconciled = !a.system.werewolf.fetishes[0].rejected;
      // Харано: кнопка только с недостатком; неудача броска Воли — отметка Харано
      out.proneBefore = W.haranoProne(a);
      await a.createEmbeddedDocuments("Item", [{ name: W.HARANO_FLAW, type: "flaw" }]);
      out.prone = W.haranoProne(a);
      W.haranoCheck(a); await pick("roll"); await rolled({ successes: 0, outcome: "failure" }); await wait(300);
      out.harano = a.statuses.has("r-harano");
      // тотем стаи: Сокол — +2 Чести при принятии и 4 Воли на историю; потом Паук-ловушка — +1 Ловкость, Честь второй раз не даётся
      await pack.update({ "system.kind": "pack", "system.members": [a.id], "system.totem": "falcon" });
      const honor = a.system.werewolf.renown.honor.temporary;
      await C.acceptTotem(pack); out.honor = a.system.werewolf.renown.honor.temporary - honor;
      out.pool = C.totemPools(pack).willpower?.max;
      const dex = a.system.attributes.dexterity.total;
      await pack.update({ "system.totem": "trapdoor-spider" }); await C.acceptTotem(pack); await C.acceptTotem(pack);
      out.dex = a.system.attributes.dexterity.total - dex; out.effects = a.effects.filter(e => e.flags?.[SYS]?.totem).length;
      await C.spendTotemPool(pack, "willpower", a); out.left = C.totemPools(pack).willpower.left;
      await C.setTotemBan(pack, true); out.banDex = a.system.attributes.dexterity.total - dex; out.banTraits = C.totemTraits(a);
      await C.setTotemBan(pack, false); await C.refillTotemPools(pack); out.refilled = C.totemPools(pack).willpower.left;
      return out;
    }, [id, packId]);
    if (!r.stay || !r.scarPick || r.health !== 5 || r.scars !== "scar-2" || r.glory !== 1) throw new Error(`остаться в строю: ${JSON.stringify(r)}`);
    if (!r.moon || r.rage <= 1 || !r.moonAgain) throw new Error(`Ярость по Луне: ${r.rage}, второй раз закрыта ${r.moonAgain}`);
    if (!r.rejected || !r.reconciled) throw new Error(`фетиш: отверг ${r.rejected}, примирение ${r.reconciled}`);
    if (r.proneBefore || !r.prone || !r.harano) throw new Error(`Харано: недостаток ${r.proneBefore}/${r.prone}, отметка ${r.harano}`);
    if (r.honor !== 2 || r.pool !== 4) throw new Error(`Сокол: Честь +${r.honor}, Воля тотема ${r.pool}`);
    if (r.dex !== 1 || r.effects !== 1 || r.left !== 3) throw new Error(`Паук-ловушка: Ловкость +${r.dex}, эффектов ${r.effects}, запас ${r.left}`);
    if (r.banDex !== 0 || r.banTraits !== null || r.refilled !== 4) throw new Error(`запрет: Ловкость +${r.banDex}, черты ${JSON.stringify(r.banTraits)}, после истории ${r.refilled}`);
  });

  await check("Сроки: сила на час и чтение ритуала", async () => {
    const id = await temp("E2E — сроки");
    const r = await page.evaluate(async id => {
      const a = game.actors.get(id), sys = p => import(`/systems/${game.system.id}/${p}`);
      const { getClock } = await sys("module/apps/calendar.mjs"), T = await sys("module/apps/timers.mjs");
      const now = getClock();
      const fx = await a.startPower("quietus:1", { blood: 0 });      // Безмолвие смерти — на час
      const until = fx?.getFlag(game.system.id, "until") ?? 0;
      // порядок созданных предметов не обязан совпадать с порядком в запросе — ритуал ищем по типу
      const ritual = (await a.createEmbeddedDocuments("Item", [
        { name: "E2E — Тауматургия", type: "discipline", system: { key: "thaumaturgy", value: 1 } },
        { name: "E2E — ритуал", type: "ritual", system: { discipline: "thaumaturgy", level: 1 } }])).find(i => i.type === "ritual");
      await T.toggleRitualReading(a, ritual);
      const reading = T.readingRituals(a).length;
      const n = game.messages.size;
      await T.expireTimers(now + 2 * 3600000);
      const card = game.messages.contents.slice(n).find(m => m.flags?.[game.system.id]?.timers);
      return { hour: Math.round((until - now) / 60000), reading, left: a.effects.size, button: !!card?.content.includes("data-r-ritual"),
        otherGm: !game.users.activeGM?.isSelf ? game.users.activeGM?.name ?? "?" : "" };
    }, id);
    // сроки гасит только активный рассказчик — если в мире сидит другой ГМ, проверка ничего не скажет о сроках
    if (r.otherGm) throw new Error(`активный рассказчик — «${r.otherGm}», не тест: выйдите из мира под ним и повторите`);
    if (r.hour !== 60) throw new Error(`срок силы на час: ${r.hour} мин.`);
    if (r.reading !== 1) throw new Error("ритуал не начал читаться");
    if (r.left !== 0) throw new Error(`после срока осталось эффектов: ${r.left}`);
    if (!r.button) throw new Error("нет карточки с кнопкой броска ритуала");
  });

  await check("Торпор и Окончательная смерть", async () => {
    const id = await temp("E2E — торпор");
    const r = await page.evaluate(async id => {
      const a = game.actors.get(id), P = await import(`/systems/${game.system.id}/module/apps/torpor.mjs`);
      await P.enterTorpor(a, "wounds");
      const sleep = !!P.torporOf(a) && a.statuses.has("r-torpor");
      await a.sheet.render({ force: true });
      await new Promise(res => setTimeout(res, 800));
      // у нового персонажа вместо шкал — вход в мастер создания, поэтому смотрим метку торпора на самом листе
      const plate = !!a.sheet.element?.classList.contains("is-torpor");
      await a.sheet.close();
      await P.wakeFromTorpor(a, { byBlood: true });
      const woke = !P.torporOf(a) && !a.statuses.has("r-torpor");
      await P.finalDeath(a);
      const dead = !!P.deathOf(a) && a.statuses.has("dead");
      await P.undoDeath(a);
      return { sleep, plate, woke, dead, back: !P.deathOf(a) && !a.statuses.has("dead") };
    }, id);
    for (const [k, msg] of [["sleep", "не уснул"], ["plate", "лист не знает о торпоре"], ["woke", "не проснулся кровью"], ["dead", "нет Окончательной смерти"], ["back", "«Вернуть» не сняло смерть"]])
      if (!r[k]) throw new Error(msg);
  });

  await check("Охота с карты: угодья и свой домен", async () => {
    const id = await temp("E2E — охотник");
    const r = await page.evaluate(async id => {
      const sys = p => import(`/systems/${game.system.id}/${p}`), C = await sys("module/ui/citymap.mjs");
      await game.vtm20.openCity();
      for (let i = 0; i < 60 && !game.vtm20.cityMap()?.loaded?.(); i++) await new Promise(res => setTimeout(res, 500));
      const cm = game.settings.get(game.system.id, "cityMap"), cityId = cm?.current ?? Object.keys(cm?.cities ?? {})[0];
      const [lat, lng] = cm?.cities?.[cityId]?.center ?? [48.8566, 2.3522], d = .002;
      const square = [[lat - d, lng - d], [lat - d, lng + d], [lat + d, lng + d], [lat + d, lng - d]];
      window._e2e.domains = foundry.utils.deepClone(game.user.getFlag(game.system.id, "cityDomains") ?? null);
      await game.user.setFlag(game.system.id, "cityDomains", { [cityId]: [{ id: "e2e-domain", owner: id, points: square, text: "" }] });
      const place = C.huntPlace({ name: "E2E — угодья", grounds: "slums", points: square }, [lat, lng]);
      // домен-актёр из обведённого домена одной кнопкой (план 1): привязка, хозяин, в списке мест листа, охота видит размер
      await C.makeDomainFor("domain", { id: "e2e-domain", owner: id, points: square });
      const da = C.domainActorOn("e2e-domain");
      const linked = `${!!da}:${da?.system.owner === id}:${C.citySpots().domains.some(x => x.id === "e2e-domain")}:${C.huntPlace({ grounds: "slums", points: square }, [lat, lng]).domain?.id === da?.id}`;
      for (const w of [...foundry.applications.instances.values()].filter(x => x.document === da)) await w.close();
      await da?.delete();
      game.vtm20.closeCity();
      return { cityId, place, linked };
    }, id);
    if (!r.cityId) throw new Error("в мире нет города");
    if (r.place?.ground !== "slums" || r.place.owner?.id !== id) throw new Error(`место охоты: ${JSON.stringify(r.place)}`);
    if (r.linked !== "true:true:true:true") throw new Error(`домен-актёр с карты (создан:хозяин:в листе:в охоте): ${r.linked}`);
    await page.evaluate(([id, place]) => game.vtm20.openHunt(game.actors.get(id), place), [id, r.place]);
    await page.waitForSelector(".r-hunt-dialog .r-hunt-place", { timeout: 10000 });
    const own = await page.evaluate(() => !document.querySelector(".r-hunt-dialog .r-hunt-place").classList.contains("is-foreign"));
    await page.evaluate(async () => {
      for (const app of foundry.applications.instances.values()) if (app.element?.matches?.(".r-hunt-dialog")) app.close();
      const was = window._e2e.domains;
      if (was) await game.user.setFlag(game.system.id, "cityDomains", was);
      else await game.user.unsetFlag(game.system.id, "cityDomains");
    });
    if (!own) throw new Error("свой домен показан как чужой");
  });

  await check("Маскарад: жар у нарушения и остывание", async () => {
    const r = await page.evaluate(async () => {
      const M = await import(`/systems/${game.system.id}/module/ui/masquerade.mjs`), { getClock } = await import(`/systems/${game.system.id}/module/apps/calendar.mjs`);
      const now = getClock(), city = { breaches: [{ id: "e2e", level: 4, lat: 48.86, lng: 2.35, at: now, gmOnly: false, text: "" }] };
      return { here: M.masqueradeAt(city, 48.86, 2.35, now).diff, far: M.masqueradeAt(city, 48.9, 2.45, now).diff,
        later: M.masqueradeAt(city, 48.86, 2.35, now + 13 * 86400000).diff, step: M.cityHeat(city, now).step };
    });
    if (r.here !== 2) throw new Error(`надбавка у нарушения тяжести 4: ${r.here}`);
    if (r.far !== 0) throw new Error(`надбавка вдали: ${r.far}`);
    if (r.later !== 0) throw new Error(`жар не остыл за 13 ночей: ${r.later}`);
    if (!r.step) throw new Error("общий жар города не вырос");
  });

  await check("Звуки интерфейса", async () => {
    const n = await page.evaluate(async () => {
      if (!game.settings.get(game.system.id, "uiSounds")) return -1;
      window._e2e.snd = 0;
      const P = AudioContext.prototype, f = P.createOscillator;
      P.createOscillator = function () { window._e2e.snd++; return f.call(this); };
      try { (await import(`/systems/${game.system.id}/module/ui/sounds.mjs`)).playSound("success"); }
      finally { P.createOscillator = f; }
      return window._e2e.snd;
    });
    if (n === 0) throw new Error("звук не синтезировался");
  });

  await check("Мастер создания: секты", async () => {
    const id = await temp("E2E — секты");
    const r = await page.evaluate(async id => {
      const { VtMCreator } = await import(`/systems/${game.system.id}/module/apps/creator.mjs`);
      const app = new VtMCreator(game.actors.get(id)), nums = () => [app.rules.disc, app.rules.bg, app.rules.virt].join("/");
      const out = {};
      for (const k of ["camarilla", "sabbat", "anarchs"]) { app.st.sectKey = k; out[k] = nums(); }
      app.st.sectKey = "camarilla"; app.st.clan = "brujah";
      out.banned = app.bannedDisc("obtenebration") && !app.bannedDisc("potence");
      // взятые «Союзники» — одной карточкой (одноимённые Факты охотников и оборотней не подмешиваются)
      app.st.bg["Союзники"] = 1; app.step = app.steps.indexOf("advantages");
      out.allies = ((await app._prepareContext({})).bgCards ?? []).filter(b => b.name === "Союзники").length;
      return out;
    }, id);
    if (r.allies !== 1) throw new Error(`карточек «Союзники» после выбора: ${r.allies}`);
    if (r.camarilla !== "3/5/7" || r.anarchs !== "3/5/7") throw new Error(`числа Камарильи и анархов: ${r.camarilla}, ${r.anarchs}`);
    if (r.sabbat !== "4/0/5") throw new Error(`числа Шабаша: ${r.sabbat}`);
    if (!r.banned) throw new Error("Камарилье доступно внеклановое Затмение");
  });

  await check("Винкулум: Братание стаи", async () => {
    const ids = [await temp("E2E — шабашит А"), await temp("E2E — шабашит Б")];
    await page.evaluate(async ids => {
      for (const id of ids) await game.actors.get(id).update({ "system.details.sect": "Шабаш" });
      (await import(`/systems/${game.system.id}/module/apps/vaulderie.mjs`)).openVaulderie(game.actors.get(ids[0]));
    }, ids);
    await page.waitForSelector(".r-vinc-dialog input[name=pick]", { timeout: 10000 });
    await page.evaluate(ids => {
      for (const x of document.querySelectorAll(".r-vinc-dialog input[name=pick]")) x.checked = ids.includes(x.value);
      document.querySelector(".r-vinc-dialog footer button").click();
    }, ids);
    await page.waitForFunction(ids => ids.every(id => (game.actors.get(id).system.vinculi ?? []).length === 1), ids, { timeout: 10000 });
    const ok = await page.evaluate(ids => ids.every(id => { const v = game.actors.get(id).system.vinculi[0]; return v.rating >= 1 && v.rating <= 10; }), ids);
    if (!ok) throw new Error("сила братских уз вне 1–10");
  });

  await check("Узы крови: испить у Сородича", async () => {
    const [drinker, donor] = [await temp("E2E — пьющий"), await temp("E2E — сюзерен")];
    await page.evaluate(async ([d, s]) => {
      await game.actors.get(d).update({ "system.blood.value": 2 }); await game.actors.get(s).update({ "system.blood.value": 8 });
      window._e2e.feed = (await import(`/systems/${game.system.id}/module/apps/bonds.mjs`)).feedFrom(game.actors.get(d));
    }, [drinker, donor]);
    await page.waitForSelector(".application.dialog select[name=donor]", { timeout: 10000 });
    await page.evaluate(s => {
      const dlg = [...document.querySelectorAll(".application.dialog")].at(-1);
      dlg.querySelector("select[name=donor]").value = s; dlg.querySelector("input[name=amount]").value = 3;
      dlg.querySelector("footer button").click();
    }, donor);
    const r = await page.evaluate(async ([d, s]) => {
      await window._e2e.feed;
      const a = game.actors.get(d), b = game.actors.get(s);
      return { blood: a.system.blood.value, donor: b.system.blood.value, bond: a.system.bonds[0], thrall: b.system.bonds[0] };
    }, [drinker, donor]);
    if (r.blood !== 5 || r.donor !== 5) throw new Error(`кровь: у пьющего ${r.blood}, у донора ${r.donor}`);
    if (r.bond?.role !== "regnant" || r.bond.rating !== 1) throw new Error(`узы пьющего: ${JSON.stringify(r.bond)}`);
    if (r.thrall?.role !== "thrall") throw new Error("у донора нет записи о вассале");
  });

  await check("Доход от Богатства раз в месяц", async () => {
    const id = await temp("E2E — богач");
    const r = await page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id), player = game.users.find(u => !u.isGM);
      if (!player) return { skip: true };
      await a.update({ [`ownership.${player.id}`]: 3 });
      await a.createEmbeddedDocuments("Item", [{ name: "Богатство", type: "background", system: { value: 1 } }]);
      const I = await import(`/systems/${SYS}/module/apps/income.mjs`), { getClock } = await import(`/systems/${SYS}/module/apps/calendar.mjs`);
      const was = game.settings.get(SYS, "incomePaid"), d = new Date(getClock());
      await game.settings.set(SYS, "incomePaid", `${d.getFullYear() - 1}-${String(d.getMonth() + 1).padStart(2, "0")}`);   // год назад
      const before = a.system.money.amount;
      await I.checkIncome();
      const after = a.system.money.amount;
      await I.checkIncome();                                   // тот же месяц — второй раз не платит
      const again = a.system.money.amount;
      await game.settings.set(SYS, "incomePaid", was);
      return { gain: after - before, again: again - after, per: I.incomeFor(1, (await import(`/systems/${SYS}/module/data/money.mjs`)).currencyOf(a)) };
    }, id);
    if (r.skip) return;
    if (r.gain !== r.per * 12) throw new Error(`за 12 месяцев начислено ${r.gain}, ждали ${r.per * 12}`);
    if (r.again) throw new Error("доход начислен дважды за месяц");
  });

  await check("Котерия: общие факты и основа", async () => {
    const [a, b] = [await temp("E2E — котерия А"), await temp("E2E — котерия Б")];
    const r = await page.evaluate(async ([a, b]) => {
      const SYS = game.system.id, C = await import(`/systems/${SYS}/module/apps/coterie.mjs`);
      window._e2e.coteries = foundry.utils.deepClone(game.settings.get(SYS, "coteries"));
      const c = { id: "e2e", name: "E2E — котерия", members: [a, b], primary: "Домен", lost: {},
        pools: { "Домен": { [a]: 2, [b]: 1 }, "Стадо": { [a]: 3, [b]: 2 } } };
      await game.settings.set(SYS, "coteries", [...window._e2e.coteries, c]);
      const out = { dom: C.poolValue(c, "Домен"), herd: C.poolValue(c, "Стадо"), forA: C.coterieBg(game.actors.get(a), "Стадо") };
      C.openCoterie(game.actors.get(a));
      return out;
    }, [a, b]);
    await page.waitForSelector(".r-cot-app .r-cot-pool", { timeout: 10000 });
    await page.evaluate(async () => { foundry.applications.instances.get("r-coterie")?.close(); await game.settings.set(game.system.id, "coteries", window._e2e.coteries); });
    if (r.dom !== 3) throw new Error(`Домен котерии ${r.dom}, ждали 3`);
    if (r.herd !== 3) throw new Error(`Стадо (вложено 5) должно быть не выше основы 3, а стало ${r.herd}`);
    if (r.forA !== 3) throw new Error(`участнику котерии доступно Стадо ${r.forA}`);
  });

  await check("Летопись сессии: сводка из чата", async () => {
    const id = await temp("E2E — летописец");
    const r = await page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id), since = Date.now() - 1;
      const sp = ChatMessage.getSpeaker({ actor: a });
      await ChatMessage.create({ speaker: sp, content: "<div>E2E</div>", flags: { [SYS]: { roll: { title: "E2E — провал", kind: "check", values: [1, 3], difficulty: 6, pool: 2 } } } });
      await ChatMessage.create({ speaker: sp, content: "<div>E2E</div>", flags: { [SYS]: { roll: { title: "E2E — ярость", kind: "frenzy", values: [2, 4], difficulty: 6, pool: 2 } } } });
      const { collectSession, openChronicle } = await import(`/systems/${SYS}/module/apps/chronicle.mjs`);
      const S = collectSession(since);
      openChronicle();
      return { rolls: S.rolls, botches: S.botches.length, breaks: S.breaks.length };
    }, id);
    await page.waitForSelector(".r-chron-app textarea[name=chron-text]", { timeout: 10000 });
    await page.evaluate(() => foundry.applications.instances.get("r-chronicle")?.close());
    if (r.rolls !== 2 || r.botches !== 1 || r.breaks !== 1) throw new Error(`сводка: ${JSON.stringify(r)}`);
  });

  await check("Раздатка игрокам из журнала", async () => {
    await page.evaluate(async () => {
      const j = await JournalEntry.create({ name: "E2E — раздатка", flags: { world: { e2e: true } } });
      await j.createEmbeddedDocuments("JournalEntryPage", [{ name: "E2E — письмо", type: "text",
        text: { content: "<p>Открытый текст.</p><section class=\"secret\"><p>E2E-ТАЙНА</p></section>" } }]);
      window._e2e.journal = j.id;
      window._e2e.handout = game.vtm20.giveHandout(j.pages.contents[0]);
    });
    await page.waitForSelector(".application.dialog select[name=style]", { timeout: 10000 });
    await page.evaluate(() => [...document.querySelectorAll(".application.dialog")].at(-1).querySelector("footer button").click());
    await page.waitForSelector(".r-handout-app .r-ho-paper.is-kindred", { timeout: 10000 });
    const secret = await page.evaluate(async () => {
      await window._e2e.handout;
      const el = document.querySelector(".r-handout-app"), leak = el.innerHTML.includes("E2E-ТАЙНА");
      for (const w of [...foundry.applications.instances.values()]) if (w.element?.classList.contains("r-handout-app")) await w.close();
      await game.journal.get(window._e2e.journal)?.delete();
      return leak;
    });
    if (secret) throw new Error("секрет страницы попал игрокам");
  });

  await check("Лист Пути с листа персонажа", async () => {
    const id = await temp("E2E — путник");
    const name = await page.evaluate(async id => {
      const a = game.actors.get(id);
      await a.setFlag(game.system.id, "created", true);
      await a.update({ "system.morality.path": "night" });
      await a.sheet.render({ force: true });
      for (let i = 0; i < 20 && !a.sheet.element?.querySelector("[data-action=openPath]"); i++) await new Promise(r => setTimeout(r, 250));
      a.sheet.element.querySelector("[data-action=openPath]").click();
      let j = null;
      for (let i = 0; i < 40 && !j; i++) { await new Promise(r => setTimeout(r, 250)); j = [...foundry.applications.instances.values()].find(w => w.document?.documentName === "JournalEntry" && w.rendered); }
      const n = j?.document?.name; await j?.close(); await a.sheet.close();
      return n;
    }, id);
    if (name !== "Путь Ночи") throw new Error(`открылось: ${name ?? "ничего"}`);
  });

  await check("Падший: кость Муки, форма, рост Муки, Знания", async () => {
    const id = await temp("E2E — падший", "demon");
    const r = await page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id), out = {};
      const { rollPool } = await import(`/systems/${SYS}/module/dice/roll.mjs`);
      const T = await import(`/systems/${SYS}/module/apps/torment.mjs`);
      await a.setFlag(SYS, "created", true);
      await a.update({ "system.house": "devils", "system.faith.permanent": 3, "system.faith.temporary": 3,
        "system.torment.permanent": 4, "system.torment.temporary": 9 });
      await a.createEmbeddedDocuments("Item", [{ name: "Знание Пламени", type: "lore", system: { key: "flame", value: 2 } }]);
      // призыв: кость Муки или раскладка успехов по errata — что-то из двух
      const res = await rollPool({ actor: a, title: "E2E", pool: 4, difficulty: 6, kind: "check", extra: { torment: a.system.torment.permanent } });
      out.die = res.state.extra.tormentDie ?? res.state.extra.tormentLow ?? null;
      // апокалиптическая форма: тяжёлые поглощаются Выносливостью
      out.soak0 = a.soakPool("lethal");
      await a.update({ "system.apocalyptic": true });
      out.soak1 = a.soakPool("lethal");
      // десятая временная Мука превращается в постоянную
      await T.gainTorment(a, 1, "E2E");
      out.torment = [a.system.torment.permanent, a.system.torment.temporary];
      await a.sheet.render({ force: true });
      for (let i = 0; i < 20 && !a.sheet.element?.querySelector(".r-actor"); i++) await new Promise(r => setTimeout(r, 250));
      a.sheet.changeTab("disciplines", "primary");
      await new Promise(r => setTimeout(r, 400));
      out.lores = a.sheet.element.querySelectorAll(".r-lores .r-trait, .r-lores [data-item-id]").length;
      out.seal = !!a.sheet.element.closest(".r-type-demon") || a.sheet.element.classList.contains("r-type-demon");
      await a.sheet.close();
      return out;
    }, id);
    if (r.die == null) throw new Error("нет кости Муки");
    if (!(r.soak1 > r.soak0)) throw new Error(`форма не прибавила поглощения: ${r.soak0} → ${r.soak1}`);
    if (r.torment[0] !== 5 || r.torment[1] !== 0) throw new Error(`Мука ${r.torment.join("/")} вместо 5/0`);
    if (!r.lores) throw new Error("на вкладке нет Знаний");
    if (!r.seal) throw new Error("лист без темы падших");
  });

  await check("Падший: слуги, Перебор, черты формы", async () => {
    const id = await temp("E2E — хозяин", "demon"), slave = await temp("E2E — слуга", "mortal");
    const r = await page.evaluate(async ([id, slave]) => {
      const SYS = game.system.id, a = game.actors.get(id), m = game.actors.get(slave), out = {};
      const T = await import(`/systems/${SYS}/module/apps/torment.mjs`);
      await m.update({ "system.willpower.permanent": 3, "system.willpower.temporary": 1 });
      await a.update({ "system.faith.permanent": 4, "system.faith.temporary": 1, "system.thralls": [
        { name: "", uuid: m.uuid, faith: 3, share: 2, will: 0, wounds: 0, lost: 0, terms: "", gifts: "" },
        { name: "Без листа", uuid: "", faith: 2, share: 1, will: 2, wounds: 0, lost: 0, terms: "", gifts: "" }] });
      await T.pactFaith(a);
      out.faith = a.system.faith.temporary;                          // 1 + 2 + 1
      // Перебор на 2 кубика: раскладка по умолчанию — поровну; у слуги с листом Воли 1 → 1 тяжёлое
      const pay = T.overdrawPay(a, 2, { outcome: "botch" });
      await new Promise(r => setTimeout(r, 600));
      [...foundry.applications.instances.values()].find(x => x.constructor.name === "DialogV2" && x.rendered)?.element.querySelector("footer button")?.click();
      await pay;
      out.slave = [m.system.willpower.temporary, m.system.health.lethal];
      out.row = a.system.thralls[1].will;
      out.botch = a.system.faith.temporary;                          // провал — −1 Вера
      // форма: Облик Небожителей, Мука 8 → две черты высокой Муки; Чешуя даёт +4 к поглощению
      await a.update({ "system.visage": "celestials", "system.torment.permanent": 8 });
      await a.setFlag(SYS, "formHigh", [0, 1]);
      const soak0 = a.soakPool("bashing");
      await a.update({ "system.apocalyptic": true });
      out.soak = a.soakPool("bashing") - soak0;
      out.claws = a.system.formFx.weapons.map(w => w.name);
      return out;
    }, [id, slave]);
    if (r.faith !== 4) throw new Error(`Вера по договорам: ${r.faith} вместо 4`);
    // раскладка 2 кубиков поровну: по пункту Воли с каждого
    if (r.slave[0] !== 0 || r.row !== 1) throw new Error(`Воля слуг после Перебора: лист ${r.slave[0]}, без листа ${r.row}`);
    if (r.botch !== 3) throw new Error(`провал Перебора не снял Веру: ${r.botch}`);
    if (r.soak !== 4) throw new Error(`броня формы: +${r.soak} вместо +4`);
    if (!r.claws.length) throw new Error("нет оружия формы");
  });

  await check("Мастер: Привязанный", async () => {
    const id = await temp("E2E — Привязанный", "demon");
    const r = await page.evaluate(async id => {
      const { VtMCreator } = await import(`/systems/${game.system.id}/module/apps/creator.mjs`);
      const a = game.actors.get(id), app = new VtMCreator(a), out = {};
      Object.assign(app.st, { house: "fiends", visage: "patterns", earthbound: true, reliquary: "natural" });
      Object.assign(app.st.virt, { conscience: 2, selfControl: 1, courage: 0 });     // +3: Плоть 3, Мысль 2, Эмоция 1
      out.rules = [app.rules.attr.join(","), app.rules.free, app.morality].join("/");
      out.darkBlocked = !!game.i18n.localize("VTM20.Creator.DarkFreeOnly");
      app.step = app.steps.length - 1;
      await app.render({ force: true });
      await new Promise(r => setTimeout(r, 400));
      const el = app.element;
      out.summary = [...el.querySelectorAll(".r-cr-sum-item")].map(x => x.textContent.replace(/\s+/g, " ").trim());
      out.urgeHead = [...el.querySelectorAll(".r-cr-sumgrid h4")].map(h => h.textContent.trim());
      const L = k => game.i18n.localize(`VTM20.${k}`);
      out.labels = { torment: L("Demon.Torment"), rel: L("Demon.Reliquary"), urges: L("Demon.Urges") };
      el.querySelector('[data-action="finish"]').click();
      await new Promise(r => setTimeout(r, 600));
      [...foundry.applications.instances.values()].find(x => x.constructor.name === "DialogV2" && x.rendered)
        ?.element.querySelector('[data-action="yes"]')?.click();
      for (let i = 0; i < 30 && !a.system.earthbound; i++) await new Promise(r => setTimeout(r, 200));
      const s = a.system;
      out.sys = { eb: s.earthbound, torment: s.torment.permanent, rel: s.reliquary?.kind, urges: [s.urges.flesh, s.urges.thought, s.urges.emotion].join(","),
        virt: s.virtues.conscience.value + s.virtues.selfControl.value + s.virtues.courage.value, faith: s.faith.permanent, will: s.willpower.permanent };
      a.sheet?.close();
      return out;
    }, id);
    if (r.rules !== "8,6,4/21/4") throw new Error(`правила Earthbound: ${r.rules}`);
    const flat = x => x.replace(/\s+/g, "");
    if (!r.summary.map(flat).includes(flat(`${r.labels.torment}10`)) || !r.summary.some(x => x.startsWith(r.labels.rel))) throw new Error(`итог: ${r.summary.join(" | ")}`);
    if (!r.urgeHead.includes(r.labels.urges)) throw new Error(`в итоге нет Потребностей: ${r.urgeHead.join(", ")}`);
    const s = r.sys;
    if (!s.eb || s.torment !== 10 || s.rel !== "natural") throw new Error(`лист: ${JSON.stringify(s)}`);
    if (s.urges !== "3,2,1" || s.virt !== 0) throw new Error(`Потребности/Добродетели: ${s.urges}, ${s.virt}`);
    if (s.faith !== 4 || s.will !== 5) throw new Error(`Вера ${s.faith}, Воля ${s.will} (нужно 4 и 5)`);
  });

  await check("Мастер: слуга падшего", async () => {
    const master = await temp("E2E — хозяин слуги", "demon"), id = await temp("E2E — слуга", "mortal");
    const r = await page.evaluate(async ([id, master]) => {
      const SYS = game.system.id;
      const { VtMCreator } = await import(`/systems/${SYS}/module/apps/creator.mjs`);
      const a = game.actors.get(id), d = game.actors.get(master), app = new VtMCreator(a), out = {};
      app.st.thrall = true;
      out.rules = [app.rules.attr.join(","), app.rules.abil.join(","), app.rules.bg, app.rules.free].join("/");
      Object.assign(app.st.virt, { conscience: 1, selfControl: 2, courage: 0 });       // Совесть 2, Убеждённость 3, Мужество 1
      app.st.free.morality = 2;                                                         // Вера слуги 3
      app.st.bg = { "Приобщение": 2 };
      Object.assign(app.st.pact, { master: d.uuid, terms: "служить", gifts: "сила", attr: { strength: 2 } });
      out.steps = app.steps.join(",");
      out.bgBanned = ["Высокое положение", "Наследие", "Договоры", "Совершенство"].filter(n => Object.keys(app.st.bg).includes(n)).length;
      out.pact = [app.morality, app.pactShare, app.giftPoints, app.giftUsed].join(",");
      app.step = app.steps.length - 1;
      await app.render({ force: true });
      await new Promise(r => setTimeout(r, 400));
      app.element.querySelector('[data-action="finish"]').click();
      await new Promise(r => setTimeout(r, 600));
      [...foundry.applications.instances.values()].find(x => x.constructor.name === "DialogV2" && x.rendered)
        ?.element.querySelector('[data-action="yes"]')?.click();
      for (let i = 0; i < 30 && !a.system.thrall.master; i++) await new Promise(r => setTimeout(r, 200));
      const s = a.system;
      out.sys = { master: s.thrall.master === d.uuid, faith: s.thrall.faith, will: s.willpower.permanent, str: s.attributes.strength.value,
        vk: a.virtueKey("selfControl"), thrall: a.isThrall, bg: a.items.find(i => i.type === "background")?.name ?? "",
        gifts: (s.thrall.gifts ?? []).map(g => `${g.kind}:${g.key}:${g.dots}`).join(",") };
      out.row = d.system.thralls.map(x => [x.uuid === a.uuid, x.faith, x.share, x.gifts].join("|"));
      // грех слуги: бросок Добродетели, сл. 7, без Воли — Воля не растёт и падает только по исходу
      const T = await import(`/systems/${SYS}/module/apps/torment.mjs`);
      const w0 = s.willpower.temporary, p0 = s.willpower.permanent;
      const pr = T.thrallSin(a);
      await new Promise(r => setTimeout(r, 600));
      [...foundry.applications.instances.values()].find(x => x.constructor.name === "DialogV2" && x.rendered)?.element.querySelector("footer button")?.click();
      const res = await pr;
      out.sin = { outcome: res?.outcome, ok: res?.outcome === "botch" ? a.system.willpower.permanent === p0 - 1
        : res?.successes > 0 ? a.system.willpower.temporary === w0 : a.system.willpower.temporary === w0 - 1 };
      a.sheet?.close();
      return out;
    }, [id, master]);
    if (r.rules !== "6,4,3/11,7,4/5/15") throw new Error(`числа слуги: ${r.rules}`);
    if (!r.steps.includes("pact")) throw new Error(`нет шага договора: ${r.steps}`);
    if (r.pact !== "3,2,1,1") throw new Error(`Вера/доля/дары: ${r.pact}`);
    const s = r.sys;
    if (!s.master || !s.thrall || s.faith !== 3 || s.will !== 5 || s.str !== 3 || s.vk !== "conviction") throw new Error(`лист слуги: ${JSON.stringify(s)}`);
    if (s.bg !== "Приобщение") throw new Error(`факт биографии слуги: ${s.bg}`);
    if (s.gifts !== "attr:attributes.strength:2") throw new Error(`дары слуги: ${s.gifts}`);
    if (r.row.length !== 1 || !r.row[0].startsWith("true|3|2|")) throw new Error(`договор у хозяина: ${r.row.join("; ")}`);
    if (!r.sin.ok) throw new Error(`грех слуги: ${JSON.stringify(r.sin)}`);
  });

  // Уборка до перезагрузок мира: сообщения бросков и временные персонажи
  await page.evaluate(async () => {
    const extra = game.messages.contents.slice(window._e2e.messages).map(m => m.id);
    if (extra.length) await ChatMessage.deleteDocuments(extra);
    window._e2e.actor.sheet?.close();
    const temp = game.actors.filter(x => x.getFlag("world", "e2e")).map(x => x.id);
    if (temp.length) await Actor.deleteDocuments(temp);
  });

  // «Город» и Париж (vtm20.mjs, keepParis): новый мир — пустой «Город»; старый (до 0.8.0) — модуль включается сам.
  // Состояние песочницы запоминаем и возвращаем.
  const saved = await page.evaluate(id => ({ mod: game.settings.get("core", "moduleConfiguration")[id] ?? false,
    installed: !!game.modules.get(id), paris: game.settings.get(game.system.id, "cityParis"), migrated: game.settings.get(game.system.id, "migrated") }), CITY_MODULE);
  const setWorld = (mod, paris, migrated) => page.evaluate(async ([id, mod, paris, migrated]) => {
    const cfg = foundry.utils.deepClone(game.settings.get("core", "moduleConfiguration"));
    cfg[id] = mod;
    await game.settings.set("core", "moduleConfiguration", cfg);
    await game.settings.set(game.system.id, "cityParis", paris);
    await game.settings.set(game.system.id, "migrated", migrated);
  }, [CITY_MODULE, mod, paris, migrated]);

  // ── 1.0.0: дары слуг, тело-носитель, журнал Муки, завладение, культ, Вложения ──
  /** Нажать кнопку открытого окна-подтверждения (DialogV2) по действию: yes, ok, spend… */
  const clickDialog = action => page.evaluate(async action => {
    for (let i = 0; i < 30; i++) {
      const b = document.querySelector(`dialog[open] [data-action="${action}"]`);
      if (b) { b.click(); return true; }
      await new Promise(r => setTimeout(r, 150));
    }
    return false;
  }, action);

  await check("Слуга: дары хозяина", async () => {
    const id = await temp("E2E — хозяин даров", "demon"), sid = await temp("E2E — слуга даров", "mortal");
    const r = await page.evaluate(async ([id, sid]) => {
      const SYS = game.system.id, d = game.actors.get(id), m = game.actors.get(sid), out = {};
      const G = await import(`/systems/${SYS}/module/apps/thrall-gifts.mjs`);
      await m.update({ "system.thrall.master": d.uuid, "system.thrall.faith": 5, "system.attributes.strength.value": 2,
        "system.willpower.permanent": 6, "system.willpower.temporary": 6,
        "system.thrall.gifts": [{ kind: "innate", key: "soak", name: "", dots: 0, high: false, cost: 1, note: "" },
          { kind: "form", name: "Когти", key: "", dots: 0, high: true, cost: 1, note: "" },
          { kind: "attr", key: "attributes.strength", name: "", dots: 2, high: false, cost: 0, note: "" }] });
      await d.update({ "system.thralls": [{ name: m.name, uuid: m.uuid, faith: 5, share: 2, will: 6, wounds: 0, lost: 0, terms: "", gifts: "" }] });
      out.budget = G.giftBudget(m);
      await G.useGift(m, 0);                                   // поглощение — 2 Воли
      out.will1 = m.system.willpower.temporary;
      const t0 = d.system.torment.temporary;
      await G.useGift(m, 1);                                   // черта высокой Муки — 1 Воля и Мука хозяину
      out.will2 = m.system.willpower.temporary;
      out.torment = d.system.torment.temporary - t0;
      await m.update({ "system.attributes.strength.value": 4 });
      await G.giftsRevoke(m);                                  // разрыв — прибавка уходит
      out.str = m.system.attributes.strength.value;
      out.left = m.system.thrall.gifts.length;
      return out;
    }, [id, sid]);
    if (r.budget.total !== 3 || r.budget.used !== 3) throw new Error(`бюджет даров: ${JSON.stringify(r.budget)}`);
    if (r.will1 !== 4 || r.will2 !== 3) throw new Error(`Воля за дары: ${r.will1}, ${r.will2}`);
    if (r.torment !== 1) throw new Error(`Мука хозяину за черту высокой Муки: ${r.torment}`);
    if (r.str !== 2 || r.left !== 0) throw new Error(`разрыв договора: Сила ${r.str}, даров ${r.left}`);
  });

  await check("Падший: тело-носитель", async () => {
    const id = await temp("E2E — без тела", "demon");
    const p = page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id), out = {};
      const H = await import(`/systems/${SYS}/module/apps/host.mjs`);
      await a.update({ "system.faith.permanent": 5, "system.faith.temporary": 5, "system.torment.permanent": 3,
        "system.thralls": [{ name: "Верный", uuid: "", faith: 3, share: 1, will: 3, wounds: 0, lost: 0, terms: "", gifts: "" }] });
      await H.loseHost(a, "death");
      out.lost = [a.system.hostless, a.system.apocalyptic];
      window._e2eHost = H.newHost(a);
      return out;
    }, id);
    const r = await p;
    // новое тело: слуга по доброй воле — без броска
    await page.evaluate(async () => {
      for (let i = 0; i < 30 && !document.querySelector("dialog[open] input[value=thrall]"); i++) await new Promise(r => setTimeout(r, 150));
      const d = document.querySelector("dialog[open] input[value=thrall]").closest("dialog");
      d.querySelector("input[value=thrall]").checked = true;
      d.querySelector("[name=willing]").checked = true;
      d.querySelector('[data-action="ok"]').click();
    });
    const after = await page.evaluate(async id => { await window._e2eHost; const s = game.actors.get(id).system;
      return [s.hostless, s.faith.permanent, s.torment.permanent]; }, id);
    if (!r.lost[0] || !r.lost[1]) throw new Error(`тело погибло, а падший не без тела: ${r.lost}`);
    if (after[0] || after[1] !== 4 || after[2] !== 4) throw new Error(`новое тело: без тела ${after[0]}, Вера ${after[1]}, Мука ${after[2]}`);
  });

  await check("Падший: журнал Муки", async () => {
    const id = await temp("E2E — журнал Муки", "demon");
    const r = await page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id), T = await import(`/systems/${SYS}/module/apps/torment.mjs`);
      await a.update({ "system.torment.permanent": 4, "system.torment.temporary": 9 });
      // запись о подготовительной правке пишется вдогонку — дождаться её, потом очистить журнал
      for (let i = 0; i < 20 && !a.system.tormentLog.length; i++) await new Promise(r => setTimeout(r, 150));
      await a.update({ "system.tormentLog": [] });
      const since = Date.now();
      await T.gainTorment(a, 1, "сжёг приют");
      for (let i = 0; i < 20 && !a.system.tormentLog.some(x => x.reason === "сжёг приют"); i++) await new Promise(r => setTimeout(r, 150));
      const C = await import(`/systems/${SYS}/module/apps/chronicle.mjs`);
      const S = C.collectSession(since);
      return { log: a.system.tormentLog.map(x => [x.reason, x.temp, x.perm, x.before]), chron: S.torment.find(x => x.who === a.name) };
    }, id);
    // запись о подготовительной правке листа может дописаться позже очистки — берём запись по причине
    const [reason, dt, dp, before] = r.log.find(x => x[0] === "сжёг приют") ?? [];
    if (reason !== "сжёг приют" || dt !== 1 || dp !== 1 || before !== "4/9") throw new Error(`запись журнала: ${JSON.stringify(r.log)}`);
    if (!r.chron || r.chron.from !== "4/9" || r.chron.to !== "5/0") throw new Error(`Мука в летописи: ${JSON.stringify(r.chron)}`);
  });

  await check("Привязанный: завладение и культ", async () => {
    const id = await temp("E2E — Привязанный в теле", "demon");
    const r = await page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id), out = {};
      const P = await import(`/systems/${SYS}/module/apps/possession.mjs`), T = await import(`/systems/${SYS}/module/apps/torment.mjs`);
      const { getClock } = await import(`/systems/${SYS}/module/apps/calendar.mjs`);
      await a.update({ "system.earthbound": true, "system.faith.permanent": 6, "system.faith.temporary": 4, "system.reliquary.faith": 2 });
      await a.createEmbeddedDocuments("Item", [{ name: "Культ", type: "background", system: { value: 2 } }, { name: "Поклонение", type: "background", system: { value: 3 } }]);
      await a.update({ "system.possession": { name: "Сторож", uuid: "", start: getClock(), spent: 0, extended: 0, banned: [] } });
      out.h0 = P.hoursLeft(a);
      await a.update({ "system.reliquary.faith": 0 });         // 2 Веры в теле — 2 часа жизни тела
      for (let i = 0; i < 20 && !a.system.possession.spent; i++) await new Promise(r => setTimeout(r, 150));
      out.h1 = P.hoursLeft(a);
      await P.leave(a);
      out.left = a.system.possession.name;
      await T.worshipRitual(a);                                 // Поклонение 3 — 6 Веры в реликварий
      out.rel = a.system.reliquary.faith;
      return out;
    }, id);
    if (r.h0 !== 48 || r.h1 !== 46) throw new Error(`срок тела: ${r.h0} → ${r.h1}`);
    if (r.left !== "") throw new Error("не покинул тело");
    if (r.rel !== 6) throw new Error(`ритуал поклонения: ${r.rel} Веры в реликварии`);
  });

  await check("Слуга Привязанного: наделение, силы, стигматы", async () => {
    const id = await temp("E2E — Привязанный-хозяин", "demon"), sid = await temp("E2E — сектант", "mortal");
    const p = page.evaluate(async ([id, sid]) => {
      const SYS = game.system.id, d = game.actors.get(id), m = game.actors.get(sid);
      await d.update({ "system.earthbound": true, "system.reliquary.faith": 2, "system.faith.temporary": 1 });
      await m.update({ "system.willpower.permanent": 5, "system.willpower.temporary": 5 });
      const E = await import(`/systems/${SYS}/module/apps/eb-servant.mjs`);
      window._e2eEbs = E.empower(m);
      for (let i = 0; i < 30 && !document.querySelector("dialog[open] select[name=master]"); i++) await new Promise(r => setTimeout(r, 150));
      const dlg = document.querySelector("dialog[open] select[name=master]").closest("dialog");
      dlg.querySelector("select[name=master]").value = d.uuid;
      dlg.querySelector('[data-action="ok"]').click();
      await window._e2eEbs;
      await m.update({ "system.ebServant.powers": [{ key: "berserk", cost: 3, note: "" }], "system.ebServant.stigmata": [{ key: "major", cost: 2, note: "" }],
        "system.ebServant.boosts": [{ key: "attributes.strength", dots: 2 }] });
      const b = E.ebBudget(m), w0 = m.system.willpower.temporary;
      await E.usePower(m, "berserk");
      for (const w of [...foundry.applications.instances.values()]) if (w.id === `r-ebs-${m.id}`) await w.close();
      return { n: m.system.ebServant.empowerments, perm: m.system.willpower.permanent, rel: d.system.reliquary.faith, b, will: w0 - m.system.willpower.temporary };
    }, [id, sid]);
    const r = await p;
    if (r.n !== 1 || r.perm !== 4 || r.rel !== 1) throw new Error(`наделение: ${r.n}, Воля ${r.perm}, реликварий ${r.rel}`);
    if (r.b.total !== 15 || r.b.used !== 13 || r.b.stigmaNeed !== 3 || r.b.stigmaUsed !== 2) throw new Error(`пункты: ${JSON.stringify(r.b)}`);
    if (r.will !== 1) throw new Error(`Бешенство: Воли −${r.will}`);
  });

  await check("Вампир: Вложения и договоры", async () => {
    const id = await temp("E2E — инферналист");
    const p = page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id);
      const { Codex } = await import(`/systems/${SYS}/module/data/codex.mjs`), { LibraryItems } = await import(`/systems/${SYS}/module/apps/library.mjs`);
      const I = await import(`/systems/${SYS}/module/apps/infernal.mjs`);
      await Codex.load();
      await a.update({ "system.blood.value": 10, "system.willpower.permanent": 5,
        "system.pacts": [{ demon: "Бельфегор", form: "foedus", terms: "", price: "", deed: "", thrall: true, obligation: 3, frequency: 3, consequence: 2, broken: false }] });
      const x = Codex.investments.find(v => v.en === "Insidious Whispers");
      const [it] = await a.createEmbeddedDocuments("Item", [LibraryItems.investment(x)]);
      window._e2eInv = I.useInvestment(a, it);
      return { n: Codex.investments.length, limit: I.investmentLimit(a), value: I.pactValue(a.system.pacts[0]) };
    }, id);
    const r = await p;
    await clickDialog("yes");
    const blood = await page.evaluate(async id => { await window._e2eInv; return game.actors.get(id).system.blood.value; }, id);
    if (r.n !== 33) throw new Error(`Вложений в справочнике: ${r.n}`);
    if (r.limit.v20 !== 1 || r.limit.max !== 5) throw new Error(`предел Вложений: ${JSON.stringify(r.limit)}`);
    if (r.value !== 2) throw new Error(`рейтинг договора: ${r.value}`);
    if (blood !== 8) throw new Error(`Коварный шёпот: крови ${blood} вместо 8`);
  });

  await check("Смертный: вера против падших", async () => {
    const id = await temp("E2E — экзорцист", "mortal"), did = await temp("E2E — изгоняемый", "demon");
    const r = await page.evaluate(async ([id, did]) => {
      const SYS = game.system.id, m = game.actors.get(id), d = game.actors.get(did), wait = ms => new Promise(r => setTimeout(r, ms));
      await m.update({ "system.trueFaith": 2, "system.willpower.permanent": 5, "system.willpower.temporary": 1, "system.exorcist.target": d.uuid });
      await d.update({ "system.torment.permanent": 5 });
      const { openExorcist } = await import(`/systems/${SYS}/module/apps/exorcist.mjs`);
      await openExorcist(m);
      let el; for (let i = 0; i < 30 && !(el = document.getElementById(`r-exorcist-${m.id}`)); i++) await wait(150);
      const n0 = game.messages.size;
      el.querySelector('[data-action="pray"][data-kind="bind"]').click();
      // ищем карточку молитвы среди новых сообщений: в чат могут успеть упасть и чужие (предыдущие проверки)
      const prayCard = () => game.messages.contents.slice(n0).find(m => m.flags?.[SYS]?.roll?.kind === "prayer");
      for (let i = 0; i < 40 && !prayCard(); i++) await wait(150);
      const prayed = prayCard()?.flags?.[SYS]?.roll?.kind;
      el.querySelector('[data-action="michael"]').click();
      for (let i = 0; i < 30 && m.system.willpower.temporary !== 5; i++) await wait(150);
      el.querySelector('[data-action="researchAdd"]').click();
      for (let i = 0; i < 30 && !m.system.exorcist.research.length; i++) await wait(150);
      // ритуал Зар позади: гибель тела — сразу Бездна
      const { getClock } = await import(`/systems/${SYS}/module/apps/calendar.mjs`), { loseHost } = await import(`/systems/${SYS}/module/apps/host.mjs`);
      await d.update({ "system.zar": getClock() + 3600000 });
      await loseHost(d);
      for (const w of [...foundry.applications.instances.values()]) if (w.id === `r-exorcist-${m.id}`) await w.close();
      return { prayed, will: m.system.willpower.temporary, research: m.system.exorcist.research.length, abyss: d.system.abyss, zar: d.system.zar };
    }, [id, did]);
    if (r.prayed !== "prayer") throw new Error(`молитва: карточка ${r.prayed}`);
    if (r.will !== 5) throw new Error(`молитва св. Михаилу: Воля ${r.will}`);
    if (r.research !== 1) throw new Error("поиск не добавлен");
    if (!r.abyss || r.zar !== 0) throw new Error(`Зар: Бездна ${r.abyss}, zar ${r.zar}`);
  });

  await check("Охотник: мастер, Грани, Убеждённость, второе зрение", async () => {
    const id = await temp("E2E — охотник", "hunter");
    const r = await page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id), wait = ms => new Promise(r => setTimeout(r, ms));
      const C = await import(`/systems/${SYS}/module/apps/creator.mjs`), H = await import(`/systems/${SYS}/module/apps/hunter.mjs`);
      await C.openCreator(a);
      let w; for (let i = 0; i < 30 && !(w = [...foundry.applications.instances.values()].find(x => x instanceof C.VtMCreator && x.actor === a)); i++) await wait(150);
      Object.assign(w.st, { creed: "judgment", virt: { conscience: 1, selfControl: 0, courage: 2 }, edges: ["judgment|1", "martyrdom|1"] });
      w.st.free.morality = 2;
      const steps = w.steps.join(","), noEdge = w.edgeIssues("judgment|3").length;
      await w.close();
      // как мастер пишет охотника — без диалога «есть замечания»
      await a.update({ "system.hunter": { creed: w.st.creed, mercy: w.hunterVirtue("mercy"), vision: w.hunterVirtue("vision"), zeal: w.hunterVirtue("zeal"),
        conviction: w.morality, edges: [...w.st.edges] } });
      await a.setFlag(SYS, "created", true);
      const before = a.system.hunter.conviction;
      await H.secondSight(a);
      const sight = before - a.system.hunter.conviction;
      const reasons = H.edgeReasons(a, "vengeance|1");          // Рвение 2 уже занято Гранью Суда I (1) — Мщение I ещё влезает
      const reasons2 = H.edgeReasons(a, "judgment|2");          // 1 + 2 > 2
      await a.sheet.render(true); await wait(800);
      const tab = !!a.sheet.element.querySelector('nav [data-tab="disciplines"]'), card = !!a.sheet.element.querySelector(".r-vc-hunter");
      await a.sheet.close();
      return { steps, noEdge, conv: before, sight, reasons: reasons.length, reasons2: reasons2.length, tab, card, cls: a.sheet.options.classes };
    }, id);
    if (!r.steps.includes("edges")) throw new Error(`шаги мастера: ${r.steps}`);
    if (!r.noEdge) throw new Error("Грань III без II и без очков — должна быть недоступна");
    if (r.conv !== 5) throw new Error(`Убеждённость Судьи 3 + 2 = ${r.conv}`);
    if (r.sight !== 1) throw new Error(`второе зрение: −${r.sight}`);
    if (r.reasons !== 0 || r.reasons2 === 0) throw new Error(`бюджет Граней: ${r.reasons}/${r.reasons2}`);
    if (!r.tab || !r.card) throw new Error("лист охотника без Граней или Убеждённости");
  });

  // Потерянные кредо (Players Guide; Hunter Book: Hermit): Отшельник — свой путь Одиночества, чужие Грани без потолка,
  // Покровители 3 и «Шум Вестников» в окне броска; Скиталец — без различающих Граней, второе зрение всегда
  await check("Охотник: Отшельник и Скиталец", async () => {
    const id = await temp("E2E — отшельник", "hunter");
    const r = await page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id), wait = ms => new Promise(r => setTimeout(r, ms));
      const H = await import(`/systems/${SYS}/module/apps/hunter.mjs`), D = await import(`/systems/${SYS}/module/dice/dialog.mjs`);
      await a.update({ "system.hunter": { creed: "hermit", mercy: 1, vision: 3, zeal: 1, conviction: 3, edges: ["hermit|1"] } });
      await a.setFlag(SYS, "created", true);
      const own = H.edgeReasons(a, "hermit|2").length;                // Прозрение 3: Одиночество I (1) + II (2) — влезает
      const other = H.edgeReasons(a, "visionary|1").length;          // чужая Грань I без потолка по своему пути
      await a.sheet.render(true); await wait(700);
      const rules = !!a.sheet.element.querySelector(".r-vc-hunter .fa-satellite-dish");
      await a.sheet.close();
      const noise = new D.RollDialog(a, { trait1: "attributes.perception", trait2: "abilities.alertness" }).compute().diffSit.some(d => d.kind === "hermit");
      await a.update({ "system.hunter.creed": "wayward", "system.hunter.edges": [] });
      const barred = H.edgeReasons(a, "judgment|1").length, ok = H.edgeReasons(a, "defense|1").length;
      const vis4 = H.edgeReasons(a, "hermit|1").length;              // чужому кредо Одиночество — с Прозрения 4
      return { own, other, rules, noise, barred, ok, vis4, sightAlways: H.hunterInfo(a, () => []).sightAlways };
    }, id);
    if (r.own || r.other) throw new Error(`Отшельник: своя II — ${r.own}, чужая I — ${r.other} замечаний`);
    if (!r.rules) throw new Error("на листе нет пометки правил потерянного кредо");
    if (!r.noise) throw new Error("в окне броска Отшельника нет «Шума Вестников»");
    if (!r.barred || r.ok) throw new Error(`Скиталец: Распознание ${r.barred ? "закрыто" : "открыто"}, Ограждение — ${r.ok} замечаний`);
    if (!r.vis4) throw new Error("Скитальцу с Прозрением 3 открыта Грань Одиночества");
    if (!r.sightAlways) throw new Error("у Скитальца второе зрение не помечено постоянным");
  });

  // Дампир (Accursed Heirs): гуль с типом «dhampir» — кровь 10, Дисциплины до 1, Кровные права на вкладке Дисциплин,
  // шаг мастера, «Безумие страсти» в панели проверок, без Ротшрека; черты дампиров — только дампиру
  await check("Дампир: кровь, Кровные права, мастер, Безумие страсти", async () => {
    const id = await temp("E2E — дампир", "ghoul");
    const r = await page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id), wait = ms => new Promise(r => setTimeout(r, ms));
      const C = await import(`/systems/${SYS}/module/apps/creator.mjs`), L = await import(`/systems/${SYS}/module/apps/library.mjs`);
      await a.update({ "system.ghoulType": "dhampir", "system.blood.value": 10, "system.dhampir.antecedentClan": "brujah" });
      await a.createEmbeddedDocuments("Item", [{ name: "Мощь", type: "discipline", system: { key: "potence", value: 1 } }]);
      await a.update({ "system.dhampir.bloodrights.thew": 2, "system.dhampir.bloodrights.consanguinity": 1 });
      const out = { max: a.system.blood.max, value: a.system.blood.value, cap: a.system.disciplineMax };
      await C.openCreator(a);
      let w; for (let i = 0; i < 30 && !(w = [...foundry.applications.instances.values()].find(x => x instanceof C.VtMCreator && x.actor === a)); i++) await wait(150);
      out.steps = w.steps.join(","); out.free = w.rules.free;
      w.st.bloodrights = { abjurence: 2 }; out.extra = w.bloodrightExtra;
      w.st.antecedentClan = "brujah"; w.st.dhSwap = true;
      out.swap = { potence: w.base("disc", "potence"), disc: w.rules.disc, xp: w.xpCostOf("disc", "presence", 1, 1) };
      await w.close();
      out.clanDisc = a.clanDisciplines.includes("presence"); out.xpPresence = a.xpCost("discipline", 1, { key: "presence" });
      const { Codex } = await import(`/systems/${SYS}/module/data/codex.mjs`);
      out.elder = Codex.merits.some(m => m.era === "elder-only" && Codex.visible(m));
      await a.setFlag(SYS, "created", true);
      await a.sheet.render(true); await wait(900);
      const el = a.sheet.element;
      out.rights = el.querySelectorAll(".r-bloodright").length;
      out.rapture = !!el.querySelector('[data-kind="rapture"]'); out.rot = !!el.querySelector('[data-kind="rotschreck"]');
      out.cls = el.classList.contains("is-dhampir");
      await a.sheet.close();
      const lib = L.openLibrary({ actor: a, kind: "merit" }); await wait(1200);
      out.dhMerits = lib.element.textContent.includes("Кулак Бога");
      await lib.close();
      return out;
    }, id);
    if (r.max !== 10 || r.value !== 10) throw new Error(`кровь дампира ${r.value}/${r.max}`);
    if (r.cap !== 1) throw new Error(`предел Дисциплин дампира ${r.cap}`);
    if (!r.steps.includes("bloodrights") || r.free !== 18) throw new Error(`мастер: шаги ${r.steps}, свободных ${r.free}`);
    if (r.extra !== 1) throw new Error(`мастер: точек Кровных прав сверх бесплатной ${r.extra}`);
    if (r.swap.potence !== 0 || r.swap.disc !== 2 || r.swap.xp !== 15) throw new Error(`замена Мощи: ${JSON.stringify(r.swap)}`);
    if (!r.clanDisc || r.xpPresence !== 15) throw new Error(`Дисциплины клана Предка: ${r.clanDisc}, цена ${r.xpPresence}`);
    if (!r.elder) throw new Error("черты «Старейшинам» скрыты");
    if (r.rights !== 2) throw new Error(`на листе Кровных прав: ${r.rights}`);
    if (!r.rapture || r.rot) throw new Error(`панель проверок: Безумие страсти ${r.rapture}, Ротшрек ${r.rot}`);
    if (!r.cls) throw new Error("лист без класса is-dhampir");
    if (!r.dhMerits) throw new Error("в библиотеке дампира нет его черт (Кулак Бога)");
  });

  // Опыт: покупка точки Дисциплины и Кровного права списывает опыт по ценам (V20 / Accursed Heirs), журнал пополняется
  await check("Опыт: покупка Дисциплины и Кровного права", async () => {
    const id = await temp("E2E — опыт", "vampire");
    const r = await page.evaluate(async id => {
      const a = game.actors.get(id);
      await a.update({ "system.clan": "brujah", "system.experience.total": 60 });
      const [d] = await a.createEmbeddedDocuments("Item", [{ name: "Мощь", type: "discipline", system: { key: "potence", value: 1 } }]);
      const c1 = await a.buyWithXp({ doc: d, path: "system.value", kind: "discipline", confirm: false });
      const out = { c1, val: d.system.value, spent: a.system.experience.spent, log: a.system.experience.log.length };
      const g = await Actor.create({ name: "E2E — опыт дампира", type: "ghoul", system: { ghoulType: "dhampir", experience: { total: 20 } }, flags: { world: { e2e: true } } });
      out.b1 = await g.buyWithXp({ path: "system.dhampir.bloodrights.abjurence", kind: "bloodright", label: "Отречение", confirm: false });
      out.b2 = await g.buyWithXp({ path: "system.dhampir.bloodrights.abjurence", kind: "bloodright", label: "Отречение", confirm: false });
      out.lvl = g.system.dhampir.bloodrights.abjurence; out.left = g.system.experience.available;
      await g.delete();
      return out;
    }, id);
    if (r.c1 !== 5 || r.val !== 2 || r.spent !== 5 || r.log < 1) throw new Error(`Мощь клана 1→2: ${JSON.stringify(r)}`);
    if (r.b1 !== 7 || r.b2 !== 5 || r.lvl !== 2 || r.left !== 8) throw new Error(`Кровное право: ${JSON.stringify(r)}`);
  });

  // Силы против цели (Доминирование, Величие 2–3, Помешательство, Телепатия): сложность с отмеченной цели,
  // запрет Доминирования против более низкого поколения, Устрашающий взор и Очарование — эффекты на цели
  await check("Силы против цели: сложность с цели, поколение, взор и Очарование", async () => {
    const r = await page.evaluate(async () => {
      const sys = p => import(`/systems/${game.system.id}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs"), { rollPowerRef } = await sys("module/sheets/actor-sheet.mjs");
      const { getClock } = await sys("module/apps/calendar.mjs"), T = await sys("module/apps/timers.mjs"), { endScene } = await sys("module/apps/night.mjs");
      const mk = (name, type, system) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — доминатор", "vampire", { generation: 10 });
      const elder = await mk("E2E — старейшина", "vampire", { generation: 8 });
      const m = await mk("E2E — смертный", "mortal", { willpower: { permanent: 6, temporary: 4 }, attributes: { wits: { value: 3 } }, virtues: { courage: { value: 2 } } });
      await a.createEmbeddedDocuments("Item", [["dominate", 4], ["presence", 3]].map(([key, value]) => ({ name: `E2E — ${key}`, type: "discipline", system: { key, value } })));
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made0 = await scene.createEmbeddedDocuments("Token", [await elder.getTokenDocument({ x: 100, y: 100 }), await m.getTokenDocument({ x: 300, y: 100 })]);
      const te = made0.find(tk => tk.actorId === elder.id), tm = made0.find(tk => tk.actorId === m.id);   // порядок созданных жетонов не гарантирован
      const target = async td => { for (let i = 0; i < 30 && !canvas.tokens.get(td.id); i++) await new Promise(res => setTimeout(res, 100));
        await new Promise(res => setTimeout(res, 300)); canvas.tokens.get(td.id)?.setTarget(true, { releaseOthers: true }); await new Promise(res => setTimeout(res, 300)); };
      const D = game.vtm20Codex.discipline("dominate"), P = game.vtm20Codex.discipline("presence");
      const idx = (d, en) => d.powers.findIndex(p => p.en === en);
      const out = {};
      // Приказ против старейшины — запрет; против смертного — сложность = текущая Воля (4)
      await target(te);
      out.elder = TP.prepareTargetPower(a, "dominate", D.powers[idx(D, "Command")], TP.TARGET_POWERS["dominate|Command"])?.blocked?.code === "domGeneration";
      await target(tm);
      await rollPowerRef(a, `dominate|${idx(D, "Command")}`);
      let dlg = null;
      for (let i = 0; i < 30 && !dlg; i++) { await new Promise(res => setTimeout(res, 100)); dlg = [...foundry.applications.instances.values()].find(x => x.constructor.name === "RollDialog" && x.actor === a); }
      out.cmd = [dlg?.values.difficulty, dlg?.cfg.extra?.targetPower?.key];
      await dlg?.close();
      // Устрашающий взор: Смекалка + Смелость = 5; 2 успеха — −2 куб. до конца сцены (вне боя)
      const dg = TP.prepareTargetPower(a, "presence", P.powers[idx(P, "Dread Gaze")], TP.TARGET_POWERS["presence|Dread Gaze"]);
      out.dreadDiff = dg?.difficulty;
      const state = key => ({ actorUuid: a.uuid, extra: { targetPower: { key, target: m.uuid, targetName: m.name, powerName: key, actorName: a.name } } });
      const msg = { isOwner: false };
      await TP.applyTargetPower(msg, state("presence|Dread Gaze"), { successes: 2, outcome: "success" });
      out.dread = TP.dreadDice(m).map(d => d.value);
      // Очарование: 2 успеха — на сутки; срок гасит таймер хроники
      await TP.applyTargetPower(msg, state("presence|Entrancement"), { successes: 2, outcome: "success" });
      const ent = m.effects.find(e => e.flags?.[game.system.id]?.mind === "presence|Entrancement");
      out.entHours = ent ? Math.round((ent.flags[game.system.id].until - getClock()) / 3600000) : null;
      await endScene();
      out.afterScene = [TP.dreadDice(m).length, !!m.effects.find(e => e.flags?.[game.system.id]?.mind === "presence|Entrancement")];
      await T.expireTimers(getClock() + 2 * 86400000);
      out.expired = !m.effects.some(e => e.flags?.[game.system.id]?.mind);
      out.label = TP.targetPowerLabel(state("presence|Entrancement").extra, { outcome: "success" }).length > 0;
      // снять цель и дождаться конца анимации стрелок, иначе удалённый жетон ломает отрисовку Foundry
      [...game.user.targets].forEach(tk => tk.setTarget(false, { releaseOthers: false }));
      await new Promise(res => setTimeout(res, 800));
      await scene.deleteEmbeddedDocuments("Token", [te.id, tm.id]);
      await Actor.deleteDocuments([a.id, elder.id, m.id]);
      return out;
    });
    const want = { elder: true, cmd: [4, "dominate|Command"], dreadDiff: 5, dread: [-2], entHours: 24, afterScene: [0, true], expired: true, label: true };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Глаза змеи, Касание скорпиона, Усмирение и Отчуждение Зверя (apps/target-powers.mjs)
  await check("Взгляд и яд: Глаза змеи, Касание скорпиона, Усмирение и Отчуждение Зверя", async () => {
    const r = await page.evaluate(async () => {
      const sys = p => import(`/systems/${game.system.id}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs"), { rollPowerRef } = await sys("module/sheets/actor-sheet.mjs");
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — змей", "vampire", { generation: 9 });
      const v = await mk("E2E — сородич-цель", "vampire", { generation: 11 });
      const m = await mk("E2E — смертный-цель", "mortal", { attributes: { stamina: { value: 3 } }, willpower: { permanent: 5, temporary: 5 } });
      await a.createEmbeddedDocuments("Item", [["serpentis", 1], ["animalism", 5], ["quietus", 2]].map(([key, value]) => ({ name: `E2E — ${key}`, type: "discipline", system: { key, value } })));
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made1 = await scene.createEmbeddedDocuments("Token", [await v.getTokenDocument({ x: 100, y: 300 }), await m.getTokenDocument({ x: 300, y: 300 })]);
      const tv = made1.find(tk => tk.actorId === v.id), tm = made1.find(tk => tk.actorId === m.id);
      const target = async td => { for (let i = 0; i < 30 && !canvas.tokens.get(td.id); i++) await new Promise(res => setTimeout(res, 100));
        await new Promise(res => setTimeout(res, 300)); canvas.tokens.get(td.id)?.setTarget(true, { releaseOthers: true }); await new Promise(res => setTimeout(res, 300)); };
      const C = game.vtm20Codex, idx = (k, en) => C.discipline(k).powers.findIndex(p => p.en === en);
      const dialog = async () => { let d = null; for (let i = 0; i < 30 && !d; i++) { await new Promise(res => setTimeout(res, 100)); d = [...foundry.applications.instances.values()].find(x => x.constructor.name === "RollDialog" && x.actor === a); } return d; };
      const out = {}, sid = game.system.id;
      // Глаза змеи: смертный — карточка без броска, «наложить» — недвижим; сородич — Воля змея, сл. 9
      await target(tm);
      const n0 = game.messages.size;
      await rollPowerRef(a, `serpentis|${idx("serpentis", "Eyes of the Serpent")}`);
      const card = game.messages.contents.slice(n0).find(x => x.getFlag(sid, "targetApply"));
      await TP.applyFromCard(card);
      out.eyesMortal = [!!card, !!canvas.tokens.get(tm.id)?.actor?.statuses.has("r-held")];   // жетон не связан с актёром — эффект на актёре жетона
      await target(tv);
      await rollPowerRef(a, `serpentis|${idx("serpentis", "Eyes of the Serpent")}`);
      let dlg = await dialog();
      out.eyesKindred = [dlg?.values.difficulty, dlg?.values.trait1];
      await dlg?.close();
      // Усмирение Зверя: на Сородича нельзя; против смертного — продолжительный до постоянной Воли (5)
      out.quellKindred = !!TP.prepareTargetPower(a, "animalism", C.discipline("animalism").powers[idx("animalism", "Quell the Beast")], TP.TARGET_POWERS["animalism|Quell the Beast"])?.blocked;
      await target(tm);
      // сначала окно «как подавить Зверя» (страх или успокоение) — выбрать и подтвердить, бросок не ждём
      rollPowerRef(a, `animalism|${idx("animalism", "Quell the Beast")}`);
      let way = null;
      for (let i = 0; i < 30 && !way; i++) { await new Promise(res => setTimeout(res, 100)); way = [...foundry.applications.instances.values()].find(x => x instanceof foundry.applications.api.DialogV2); }
      way?.element.querySelector('button[data-action="ok"]')?.click();
      dlg = await dialog();
      out.quell = [dlg?.values.contest, dlg?.values.need, dlg?.values.difficulty];
      await dlg?.close();
      const link = key => ({ key, target: m.uuid, targetName: m.name, powerName: key, actorName: a.name });
      out.quellLabel = [!!TP.targetPowerLabel({ targetPower: link("animalism|Quell the Beast"), extended: { need: 5, prev: 3 } }, { outcome: "success", successes: 2 }),
        !!TP.targetPowerLabel({ targetPower: link("animalism|Quell the Beast"), extended: { need: 5, prev: 0 } }, { outcome: "success", successes: 2 })];
      // Касание скорпиона: 2 крови в яд, 10 успехов (сопротивление их не снимет) — Выносливость 3 → 1 навсегда
      const sta0 = m.system.attributes.stamina.total;
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: { targetPower: { ...link("quietus|Scorpion's Touch"), poison: 2 } } }, { successes: 10, outcome: "success" });
      out.poison = [sta0, m.system.attributes.stamina.total, m.effects.find(e => e.flags?.[sid]?.attrMod)?.flags[sid].mode];
      // Отчуждение Зверя: бешенство вампира переходит на цель
      await a.toggleStatusEffect("r-frenzy", { active: true });
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: { targetPower: link("animalism|Drawing Out the Beast") } }, { successes: 3, outcome: "success" });
      out.beast = [a.statuses.has("r-frenzy"), m.statuses.has("r-frenzy")];
      [...game.user.targets].forEach(tk => tk.setTarget(false, { releaseOthers: false }));
      await new Promise(res => setTimeout(res, 800));
      await scene.deleteEmbeddedDocuments("Token", [tv.id, tm.id]);
      await Actor.deleteDocuments([a.id, v.id, m.id]);
      return out;
    });
    const want = { eyesMortal: [true, true], eyesKindred: [9, "willpower.permanent"], quellKindred: true, quell: ["extended", 5, 7],
      quellLabel: [true, false], poison: [3, 1, "manual"], beast: [false, true] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Затмение 1–5 и Сокрытие 4–5: режимы Театра теней, Чёрный метаморфоз, Сумеречный облик, Покрывало ночи,
  // Руки Бездны, Исчезновение из виду, Тайное собрание
  await check("Тела и тьма: Затмение 1–5, Исчезновение, Тайное собрание", async () => {
    const r = await page.evaluate(async () => {
      const sys = p => import(`/systems/${game.system.id}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs"), { rollPowerRef } = await sys("module/sheets/actor-sheet.mjs");
      const { soakAndApply } = await sys("module/dice/roll.mjs"), { openAttack } = await sys("module/combat/combat.mjs"), { endScene } = await sys("module/apps/night.mjs");
      const sid = game.system.id, mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — ласомбра", "vampire", { generation: 8, blood: { value: 15 }, abilities: { stealth: { value: 2 }, brawl: { value: 3 } } });
      const ally = await mk("E2E — спутник", "mortal");
      await a.createEmbeddedDocuments("Item", [["obtenebration", 5], ["obfuscate", 5], ["potence", 1], ["celerity", 2]].map(([key, value]) => ({ name: `E2E — ${key}`, type: "discipline", system: { key, value } })));
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made2 = await scene.createEmbeddedDocuments("Token", [await a.getTokenDocument({ x: 500, y: 500 }), await ally.getTokenDocument({ x: 700, y: 500 })]);
      const ta = made2.find(tk => tk.actorId === a.id), tl = made2.find(tk => tk.actorId === ally.id);
      for (let i = 0; i < 30 && !canvas.tokens.get(tl.id); i++) await new Promise(res => setTimeout(res, 100));
      const out = {}, hp = x => [x.system.health.bashing, x.system.health.lethal, x.system.health.aggravated].join("/");
      // Театр теней (укрыться): +1 куб к Скрытности, стрелкам +1; Чёрный метаморфоз: +3 к Запугиванию, щупальца, тёмное зрение
      await a.startPower("obtenebration:1", { variant: "shroud" });
      await a.startPower("obtenebration:4");
      out.fx = [a.system.fx.dice?.stealth?.[0]?.value, a.system.fx.diff?.rangedHit?.[0]?.value, a.system.fx.dice?.intimidation?.[0]?.value,
        a.items.some(i => i.name === "Щупальца тьмы"), !!a.system.fx.darkvision];
      // Сумеречный облик: физический урон не проходит, атаковать нельзя, огонь — полностью
      await a.startPower("obtenebration:5");
      await soakAndApply(a, 2, "lethal", { soak: false });
      out.shadow = [!!a.system.fx.shadowForm, (await openAttack(a)) === null, hp(a)];
      await soakAndApply(a, 1, "aggravated", { soak: false, fire: true });
      out.shadowFire = hp(a);
      const link = key => ({ key, target: a.uuid, targetName: a.name, powerName: key, actorName: a.name });
      const apply = (key, n) => TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: { targetPower: link(key) } }, { successes: n, outcome: "success" });
      // Покрывало ночи: 2 успеха — облако 6 м (радиус 3); Руки Бездны: 2 щупальца, Сила 5+1, Ловкость 5+2
      await apply("obtenebration|Shroud of Night", 2);
      const light = scene.lights.find(l => l.getFlag(sid, "abyss"));
      out.shroud = [!!light, light?.config.negative, light?.config.dim];
      await apply("obtenebration|Arms of the Abyss", 2);
      const arms = () => game.actors.filter(x => x.getFlag(sid, "abyssArm") === a.uuid);
      out.arms = [arms().length, arms()[0]?.system.attributes.strength.value, arms()[0]?.system.attributes.dexterity.value, scene.tokens.filter(tk => arms().some(x => x.id === tk.actorId)).length];
      await arms()[0].update({ "system.health.lethal": 4 });
      for (let i = 0; i < 30 && arms().length > 1; i++) await new Promise(res => setTimeout(res, 100));
      out.armGone = arms().length;
      // Исчезновение из виду: 2 успеха — силуэт, 4 — Незримое присутствие
      await apply("obfuscate|Vanish from the Mind's Eye", 2);
      out.vanish2 = a.effects.some(e => e.flags?.[sid]?.mind === "obfuscate|Vanish from the Mind's Eye");
      await apply("obfuscate|Vanish from the Mind's Eye", 4);
      out.vanish4 = a.powerEffects.some(e => e.power === "obfuscate:2");
      // Тайное собрание: Сокрытие ложится на отмеченного спутника
      canvas.tokens.get(tl.id)?.setTarget(true, { releaseOthers: true });
      await new Promise(res => setTimeout(res, 300));
      const gi = game.vtm20Codex.discipline("obfuscate").powers.findIndex(p => p.en === "Cloak the Gathering");
      await rollPowerRef(a, `obfuscate|${gi}`);
      const allyActor = canvas.tokens.get(tl.id)?.actor;
      out.gather = !!allyActor?.effects.some(e => e.flags?.[sid]?.mind === "obfuscate|Cloak the Gathering");
      [...game.user.targets].forEach(tk => tk.setTarget(false, { releaseOthers: false }));
      await new Promise(res => setTimeout(res, 800));
      // Конец сцены: тьма и щупальца исчезают
      await endScene();
      out.afterScene = [!!scene.lights.find(l => l.getFlag(sid, "abyss")), arms().length];
      await scene.deleteEmbeddedDocuments("Token", [ta.id, tl.id].filter(id => scene.tokens.get(id)));
      await Actor.deleteDocuments([a.id, ally.id]);
      return out;
    });
    const want = { fx: [1, 1, 3, true, true], shadow: [true, true, "0/0/0"], shadowFire: "0/0/1", shroud: [true, true, 3], arms: [2, 6, 7, 2], armGone: 1,
      vanish2: true, vanish4: true, gather: true, afterScene: [false, 0] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Путь Крови (Тауматургия 1–5): Вкус крови, Неистовство, Могущество, Хищение, Котёл крови
  await check("Путь Крови: Вкус, Неистовство, Могущество, Хищение, Котёл", async () => {
    const r = await page.evaluate(async () => {
      const sys = p => import(`/systems/${game.system.id}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs"), { rollPowerRef } = await sys("module/sheets/actor-sheet.mjs");
      const CP = await sys("module/data/combat-powers.mjs"), { getClock } = await sys("module/apps/calendar.mjs"), T = await sys("module/apps/timers.mjs");
      const sid = game.system.id, mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — тремер", "vampire", { generation: 10, blood: { value: 5 } });
      const v = await mk("E2E — жертва крови", "vampire", { generation: 12, blood: { value: 5 } });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — thaumaturgy", type: "discipline", system: { key: "thaumaturgy", value: 5 } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const [tv] = await scene.createEmbeddedDocuments("Token", [await v.getTokenDocument({ x: 900, y: 300 })]);
      for (let i = 0; i < 30 && !canvas.tokens.get(tv.id); i++) await new Promise(res => setTimeout(res, 100));
      await new Promise(res => setTimeout(res, 300));
      canvas.tokens.get(tv.id)?.setTarget(true, { releaseOthers: true });
      await new Promise(res => setTimeout(res, 300));
      const vt = () => canvas.tokens.get(tv.id)?.actor;          // жетон не связан: кровь и эффекты — у актёра жетона
      const out = {}, path = game.vtm20Codex.discipline("thaumaturgy").paths.findIndex(p => p.en === "Path of Blood");
      const dialog = async () => { let d = null; for (let i = 0; i < 30 && !d; i++) { await new Promise(res => setTimeout(res, 100)); d = [...foundry.applications.instances.values()].find(x => x.constructor.name === "RollDialog" && x.actor === a); } return d; };
      // Вкус крови: бросок чародейства с целью (Воля, сл. 4)
      await rollPowerRef(a, `thaumaturgy|path|${path}|0`);
      let dlg = await dialog();
      out.taste = [dlg?.values.difficulty, dlg?.cfg.kind, dlg?.cfg.extra?.targetPower?.key];
      await dlg?.close();
      const link = key => ({ key, target: vt().uuid, targetName: vt().name, powerName: key, actorName: a.name });
      const apply = (key, n, self = false) => TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: { targetPower: self ? { ...link(key), target: a.uuid } : link(key) } }, { successes: n, outcome: "success" });
      // Неистовство крови: 3 успеха — цель тратит 3 крови, +3 к сложности ярости
      await apply("thaumaturgy|Blood Rage", 3);
      out.rage = [vt().system.blood.value, TP.frenzyDiff(vt(), "frenzy").map(d => d.value)];
      // Хищение крови: 4 успеха, у цели 2 — переходит 2
      await apply("thaumaturgy|Theft of Vitae", 4);
      out.theft = [vt().system.blood.value, a.system.blood.value];
      // Могущество крови: 1 успех — поколение 10 → 9 на час, запас 13 → 14; второй раз за ночь — нельзя
      await apply("thaumaturgy|Blood of Potency", 1, true);
      out.potency = [a.system.effectiveGeneration, a.system.blood.max];
      const before = [...foundry.applications.instances.values()].length;
      await rollPowerRef(a, `thaumaturgy|path|${path}|2`);
      await new Promise(res => setTimeout(res, 400));
      out.once = [...foundry.applications.instances.values()].filter(x => x.constructor.name === "RollDialog" && x.actor === a).length;
      await a.update({ "system.blood.value": 14 });
      await T.expireTimers(getClock() + 2 * 3600000);
      for (let i = 0; i < 30 && a.system.blood.value > 13; i++) await new Promise(res => setTimeout(res, 100));
      out.spill = [a.system.effectiveGeneration, a.system.blood.value];
      // Котёл крови: 2 успеха — 2 губительных (Стойкости нет) и 2 крови вскипают
      await vt().update({ "system.blood.value": 4 });
      const n0 = game.messages.size;
      await CP.powerHit(null, { actorUuid: a.uuid, extra: { power: { disc: "thaumaturgy", path: "Путь Крови", level: 5, name: "Котёл крови" } } }, { successes: 2, outcome: "success" });
      const card = game.messages.contents.slice(n0).find(m => m.getFlag(sid, "fixedDamage"));
      await CP.applyFixedDamage(card);
      out.cauldron = [vt().system.health.aggravated, vt().system.blood.value];
      [...game.user.targets].forEach(tk => tk.setTarget(false, { releaseOthers: false }));
      await new Promise(res => setTimeout(res, 800));
      await scene.deleteEmbeddedDocuments("Token", [tv.id]);
      await Actor.deleteDocuments([a.id, v.id]);
      return out;
    });
    const want = { taste: [4, "magic", "thaumaturgy|A Taste for Blood"], rage: [2, [3]], theft: [0, 7], potency: [9, 14], once: 0, spill: [10, 13], cauldron: [2, 2] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Тело и душа, Преображение, Анимализм: Вселение, Проекция, Сердце тьмы, Облик крови, Искусство тканей,
  // Язык животных, Зов (звери справочника), Поглощение духа
  await check("Вселение, Проекция, Сердце тьмы, Преображение, Анимализм", async () => {
    const r = await page.evaluate(async () => {
      const sys = p => import(`/systems/${game.system.id}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs"), { rollPowerRef } = await sys("module/sheets/actor-sheet.mjs");
      const { openAttack } = await sys("module/combat/combat.mjs"), { endScene } = await sys("module/apps/night.mjs"), NG = await sys("module/apps/npc-gen.mjs");
      const sid = game.system.id, mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — цимисх", "vampire", { generation: 9 });
      const m = await mk("E2E — сосуд", "mortal", { willpower: { permanent: 4, temporary: 0 }, attributes: { appearance: { value: 3 }, strength: { value: 3 } } });
      const wolf = await mk("E2E — Волк", "creature", { supernatural: false, blood: { max: 5, value: 5 } });
      await a.createEmbeddedDocuments("Item", [["dominate", 5], ["auspex", 5], ["serpentis", 5], ["vicissitude", 5], ["animalism", 5]].map(([key, value]) => ({ name: `E2E — ${key}`, type: "discipline", system: { key, value } })));
      const out = {};
      const link = (key, x, extra = {}) => ({ key, target: x.uuid, targetName: x.name, powerName: key, actorName: a.name, ...extra });
      const apply = (key, x, n, extra) => TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: { targetPower: link(key, x, extra) } }, { successes: n, outcome: "success" });
      // Вселение: у сосуда Воли 0 — разум открыт, оба получают эффект
      await apply("dominate|Possession", m, 2);
      out.possess = [m.effects.some(e => e.flags?.[sid]?.mind === "dominate|Possession"), a.effects.some(e => e.flags?.[sid]?.mind === "dominate|Possession")];
      // Психическая проекция: тело в оцепенении до конца сцены
      await apply("auspex|Psychic Projection", a, 1);
      out.project = a.effects.some(e => e.flags?.[sid]?.mind === "auspex|Psychic Projection");
      // Сердце тьмы: кол не парализует, −2 к ярости; Облик крови — физическая атака невозможна
      await a.startPower("serpentis:5");
      await a.toggleStatusEffect("r-staked", { active: true });
      out.heart = [a.statuses.has("r-staked"), TP.frenzyDiff(a, "frenzy").map(d => d.value)];
      await a.startPower("vicissitude:5");
      out.bloodform = [!!a.system.fx.shadowForm, (await openAttack(a)) === null];
      // Искусство тканей: −2 Привлекательности; укрепление — Сила 3 → 1, +2 к поглощению
      await apply("vicissitude|Fleshcraft", m, 2, { flesh: "lower" });
      const soak0 = m.soakPool("bashing");
      await apply("vicissitude|Fleshcraft", m, 2, { flesh: "armor" });
      out.flesh = [m.system.attributes.appearance.value, m.system.attributes.strength.value, m.soakPool("bashing") - soak0];
      // укрепление без цены Силы (решение рассказчика): Сила та же, +1 к поглощению
      await apply("vicissitude|Fleshcraft", m, 1, { flesh: "armor", fleshFree: true });
      out.fleshFree = [m.system.attributes.strength.value, m.soakPool("bashing") - soak0];
      // Поглощение духа: 2 успеха — только Ясновидение; Доминирование заблокировано
      await apply("animalism|Subsume the Spirit", wolf, 2);
      out.subsume = [TP.subsumeBlocks(a, "dominate"), TP.subsumeBlocks(a, "auspex")];
      const dIdx = game.vtm20Codex.discipline("dominate").powers.findIndex(p => p.en === "Command");
      await rollPowerRef(a, `dominate|${dIdx}`);
      await new Promise(res => setTimeout(res, 400));
      out.subsumeBlocked = ![...foundry.applications.instances.values()].some(x => x.constructor.name === "RollDialog" && x.actor === a);
      // Язык животных: волк — хищник, сложность 6 (нужна отмеченная цель)
      for (const e of a.effects.filter(e => e.flags?.[sid]?.subsume)) await e.delete();
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const [tw] = await scene.createEmbeddedDocuments("Token", [await wolf.getTokenDocument({ x: 1100, y: 300 })]);
      for (let i = 0; i < 30 && !canvas.tokens.get(tw.id); i++) await new Promise(res => setTimeout(res, 100));
      await new Promise(res => setTimeout(res, 300));
      canvas.tokens.get(tw.id)?.setTarget(true, { releaseOthers: true });
      await new Promise(res => setTimeout(res, 300));
      const wIdx = game.vtm20Codex.discipline("animalism").powers.findIndex(p => p.en === "Feral Whispers");
      await rollPowerRef(a, `animalism|${wIdx}`);
      let dlg = null;
      for (let i = 0; i < 30 && !dlg; i++) { await new Promise(res => setTimeout(res, 100)); dlg = [...foundry.applications.instances.values()].find(x => x.constructor.name === "RollDialog" && x.actor === a); }
      out.whisper = dlg?.values.difficulty;
      await dlg?.close();
      [...game.user.targets].forEach(tk => tk.setTarget(false, { releaseOthers: false }));
      await new Promise(res => setTimeout(res, 800));
      await scene.deleteEmbeddedDocuments("Token", [tw.id]);
      // Зов: звери справочника есть и создаются по статблоку
      const animals = await NG.animalTemplates();
      const beast = await NG.spawnFromTemplate(animals[0], { name: "E2E — зверь Зова" });
      out.beckon = [animals.length > 0, beast?.type];
      await endScene();
      out.afterScene = a.effects.some(e => e.flags?.[sid]?.mind === "auspex|Psychic Projection");
      await Actor.deleteDocuments([a.id, m.id, wolf.id, beast?.id].filter(Boolean));
      return out;
    });
    const want = { possess: [true, true], project: true, heart: [false, [-2]], bloodform: [true, true], flesh: [1, 1, 2], fleshFree: [1, 3],
      subsume: [true, false], subsumeBlocked: true, whisper: 6, beckon: [true, "creature"], afterScene: false };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Пути Тауматургии (data/path-powers.mjs): бросок Воли (уровень + 3), эффекты на цели и на себе, урон за ход, призыв
  await check("Пути Тауматургии: смертная оболочка, проклятия, Нептун, Марс, разум, Флора, погода", async () => {
    const r = await page.evaluate(async () => {
      const sys = p => import(`/systems/${game.system.id}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs"), { rollPowerRef } = await sys("module/sheets/actor-sheet.mjs");
      const { AttackDialog } = await sys("module/combat/combat.mjs"), CP = await sys("module/data/combat-powers.mjs"), { endScene } = await sys("module/apps/night.mjs");
      const sid = game.system.id, mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — маг", "vampire", { generation: 9, willpower: { permanent: 6, temporary: 6 }, abilities: { brawl: { value: 3 } } });
      const m = await mk("E2E — подопытный", "mortal", { attributes: { strength: { value: 3 }, dexterity: { value: 3 }, stamina: { value: 3 } } });
      const v = await mk("E2E — сородич-жертва", "vampire", { generation: 11, blood: { value: 6 } });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — thaumaturgy", type: "discipline", system: { key: "thaumaturgy", value: 5 } }]);
      const out = {};
      const link = (key, x) => ({ key, target: x.uuid, targetName: x.name, powerName: key, actorName: a.name });
      const apply = (key, x, n) => TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: { targetPower: link(key, x) } }, { successes: n, outcome: "success" });
      // бросок пути: Воля, сложность уровень + 3 (Головокружение — 1 → 4)
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const [tm] = await scene.createEmbeddedDocuments("Token", [await m.getTokenDocument({ x: 1300, y: 300 })]);
      for (let i = 0; i < 30 && !canvas.tokens.get(tm.id); i++) await new Promise(res => setTimeout(res, 100));
      await new Promise(res => setTimeout(res, 300));
      canvas.tokens.get(tm.id)?.setTarget(true, { releaseOthers: true });
      await new Promise(res => setTimeout(res, 300));
      const th = game.vtm20Codex.discipline("thaumaturgy"), shell = th.paths.findIndex(p => p.en === "Mastery of the Mortal Shell");
      await rollPowerRef(a, `thaumaturgy|path|${shell}|0`);
      let dlg = null;
      for (let i = 0; i < 30 && !dlg; i++) { await new Promise(res => setTimeout(res, 100)); dlg = [...foundry.applications.instances.values()].find(x => x.constructor.name === "RollDialog" && x.actor === a); }
      out.roll = [dlg?.values.trait1, dlg?.values.difficulty, dlg?.cfg.kind];
      await dlg?.close();
      [...game.user.targets].forEach(tk => tk.setTarget(false, { releaseOthers: false }));
      await new Promise(res => setTimeout(res, 800));
      await scene.deleteEmbeddedDocuments("Token", [tm.id]);
      // Головокружение: +1 к сложности физических; Недуг: −2 к Силе/Ловкости/Выносливости
      await apply("thaumaturgy|Vertigo", m, 1);
      await apply("thaumaturgy|Malady", m, 2);
      out.shell = [TP.mindDiff(m, { physical: true }).reduce((s, d) => s + d.value, 0), m.system.attributes.strength.total];
      // Отказ тела: в конце хода цели — 1 тяжёлое (смертный не поглощает)
      await apply("thaumaturgy|Body Failure", m, 3);
      const combat = await Combat.create({ scene: scene?.id ?? null, active: true });
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: m.id, name: m.name, initiative: 20 }, { actorId: a.id, name: a.name, initiative: 1 }]);
      await combat.startCombat();
      await combat.nextTurn();
      for (let i = 0; i < 30 && !m.system.health.lethal; i++) await new Promise(res => setTimeout(res, 100));
      out.dot = m.system.health.lethal;
      await new Promise(res => setTimeout(res, 1500));
      await combat.delete();
      // Разбавление крови: у сородича 2 крови стали водой — штраф ран 2 уровней
      await apply("thaumaturgy|Blood to Water", v, 2);
      out.water = [v.system.blood.value, TP.dreadDice(v).map(d => d.value)];
      // Сосредоточение на сородиче: штрафы к пулам снимаются
      await apply("thaumaturgy|Centering", v, 2);
      out.centered = TP.dreadDice(v).length;
      // Совершенная ясность: −2 ко всем; Храброе сердце: +1 к Силе; Боевой товарищ — передать союзнику
      await apply("thaumaturgy|Perfect Clarity", a, 1);
      await apply("thaumaturgy|Fearless Heart", a, 1);
      out.self = [TP.mindDiff(a, {}).reduce((s, d) => s + d.value, 0), a.system.attributes.strength.total];
      await apply("thaumaturgy|Comrades at Arms", v, 1);
      out.comrade = v.effects.some(e => e.flags?.[sid]?.mars);
      // Разъедающее касание: безоружный удар — губительный
      await apply("thaumaturgy|Acidic Touch", a, 1);
      out.acid = new AttackDialog(a, { maneuver: "punch" }).choice.type;
      // Танец лозы: существо у мага; с концом сцены уходит. Молния — урон пулом 10, броня не защищает
      await apply("thaumaturgy|Dance of Vines", a, 2);
      const vines = () => game.actors.filter(x => x.getFlag(sid, "summoned") === a.uuid);
      out.vines = [vines().length, vines()[0]?.system.attributes.strength.value];
      out.bolt = [CP.combatPowerOf({ disc: "thaumaturgy", path: "Управление Погодой", level: 5 })?.kind, CP.combatPowerOf({ disc: "thaumaturgy", path: "Управление Погодой", level: 5 })?.pool];
      // Тауматургическая защита 3: готовый пул 6 кубиков
      const cm = th.paths.findIndex(p => p.en === "Thaumaturgical Countermagic");
      await rollPowerRef(a, `thaumaturgy|path|${cm}|2`);
      dlg = null;
      for (let i = 0; i < 30 && !dlg; i++) { await new Promise(res => setTimeout(res, 100)); dlg = [...foundry.applications.instances.values()].find(x => x.constructor.name === "RollDialog" && x.actor === a); }
      out.counter = dlg?.cfg.pool;
      await dlg?.close();
      await endScene();
      out.afterScene = vines().length;
      await Actor.deleteDocuments([a.id, m.id, v.id]);
      return out;
    });
    const want = { roll: ["willpower.permanent", 4, "magic"], shell: [1, 1], dot: 1, water: [4, [-1]], centered: 0, self: [-2, 2], comrade: true,
      acid: "aggravated", vines: [1, 3], bolt: ["pool", 10], counter: 6, afterScene: 0 };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Анимализм через интерфейс: кнопки сил на листе и в HUD → нужное окно; Усмирение — выбор способа, Сородич в бешенстве;
  // гибель зверя с вампиром внутри — торпор
  await check("Анимализм через лист и HUD", async () => {
    const r = await page.evaluate(async () => {
      const sys = p => import(`/systems/${game.system.id}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs");
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms));
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — гангрел", "vampire", { generation: 9, clan: "gangrel" });
      await a.setFlag(sid, "created", true);   // иначе лист — «ворота» мастера создания
      const m = await mk("E2E — смертный под зверем", "mortal", { willpower: { permanent: 4, temporary: 4 } });
      const v = await mk("E2E — сородич в ярости", "vampire", { generation: 12 });
      const wolf = await mk("E2E — Волк", "creature", { supernatural: false });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — animalism", type: "discipline", system: { key: "animalism", value: 5 } }]);
      await v.toggleStatusEffect("r-frenzy", { active: true });
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([[a, 100], [m, 300], [v, 500], [wolf, 700]].map(([x, px]) => x.getTokenDocument({ x: px, y: 900 }))));
      const toks = [a, m, v, wolf].map(x => made.find(tk => tk.actorId === x.id));   // порядок созданных жетонов не гарантирован
      for (let i = 0; i < 30 && !canvas.tokens.get(toks[3].id); i++) await wait(100);
      await wait(400);
      const mark = async td => { canvas.tokens.get(td.id)?.setTarget(true, { releaseOthers: true }); await wait(300); };
      const rollDlg = async () => { let d = null; for (let i = 0; i < 30 && !d; i++) { await wait(100); d = [...foundry.applications.instances.values()].find(x => x.constructor.name === "RollDialog" && (x.actor === a || x.actor?.id === a.id)); } return d; };
      const dialogV2 = async () => { let d = null; for (let i = 0; i < 30 && !d; i++) { await wait(100); d = [...foundry.applications.instances.values()].find(x => x instanceof foundry.applications.api.DialogV2); } return d; };
      const out = {};
      // лист: вкладка Дисциплин, кнопка силы «Язык животных» на волка — сложность 6
      await a.sheet.render({ force: true }); await wait(800);
      a.sheet.changeTab?.("disciplines", "primary"); await wait(500);
      const btn = lvl => [...a.sheet.element.querySelectorAll('[data-action="rollPower"]')].find(b => b.dataset.ref?.startsWith("animalism|") && game.vtm20Codex.discipline("animalism").powers[Number(b.dataset.ref.split("|")[1])]?.level === lvl);
      out.sheetButtons = [1, 2, 3, 4, 5].filter(l => btn(l)).length;
      await mark(toks[3]);
      btn(1)?.click();
      let d = await rollDlg();
      out.whisper = d?.values.difficulty;
      await d?.close();
      // HUD: печать Анимализма → список сил → «Усмирение Зверя» на смертного — выбор способа, продолжительный до 4
      canvas.tokens.get(toks[0].id)?.control({ releaseOthers: true }); await wait(600);
      const hud = document.getElementById("r-hud");
      hud?.querySelector('[data-act="tab"][data-tab="powers"]')?.click(); await wait(400);
      document.getElementById("r-hud")?.querySelector('[data-act="pop"][data-pop*="animalism"]')?.click(); await wait(400);
      const rows = [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')];
      out.hudRows = rows.length;
      await mark(toks[1]);
      rows.find(x => /Усмирение/.test(x.textContent))?.click();
      const way = await dialogV2();
      const sel = way?.element.querySelector('select[name="w"]'); if (sel) sel.value = "calm";
      way?.element.querySelector('button[data-action="ok"]')?.click();
      d = await rollDlg();
      out.quell = [d?.values.trait2, d?.values.contest, d?.values.need, d?.values.difficulty];
      await d?.close();
      // Сородич в бешенстве: Усмирение не блокируется, способ — только успокоить, бросок простой
      await mark(toks[2]);
      document.getElementById("r-hud")?.querySelector('[data-act="pop"][data-pop*="animalism"]')?.click(); await wait(400);   // список сил закрылся после выбора — открыть снова
      document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]').forEach(x => { if (/Усмирение/.test(x.textContent)) x.click(); });
      d = await rollDlg();
      out.quellKindred = [d?.values.trait2, d?.values.contest];
      await d?.close();
      // Поглощение духа: зверь погибает — вампир возвращается в тело и в торпор
      const link = { key: "animalism|Subsume the Spirit", target: wolf.uuid, targetName: wolf.name, powerName: "Поглощение духа", actorName: a.name };
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: { targetPower: link } }, { successes: 3, outcome: "success" });
      out.subsume = a.effects.some(e => e.flags?.[sid]?.subsume);
      await wolf.update({ "system.health.lethal": 7 });
      for (let i = 0; i < 30 && !a.statuses.has("r-torpor"); i++) await wait(100);
      out.death = [a.statuses.has("r-torpor"), a.effects.some(e => e.flags?.[sid]?.subsume)];
      await a.sheet.close();
      [...game.user.targets].forEach(tk => tk.setTarget(false, { releaseOthers: false }));
      canvas.tokens.releaseAll();
      await wait(800);
      await scene.deleteEmbeddedDocuments("Token", toks.map(x => x.id));
      await Actor.deleteDocuments([a.id, m.id, v.id, wolf.id]);
      return out;
    });
    const want = { sheetButtons: 5, whisper: 6, hudRows: 5, quell: ["abilities.empathy", "extended", 4, 7], quellKindred: ["abilities.empathy", "simple"], subsume: true, death: [true, false] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Величие через HUD: Благоговение по охвату и Воле, невосприимчивость, Очарование не повторяется, Приглашение, Преклонение
  await check("Величие через HUD", async () => {
    const r = await page.evaluate(async () => {
      const sys = p => import(`/systems/${game.system.id}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs");
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms));
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — тореадор", "vampire", { generation: 9 });
      const crowd = [await mk("E2E — слабый", "mortal", { willpower: { permanent: 2, temporary: 2 } }),
        await mk("E2E — средний", "mortal", { willpower: { permanent: 5, temporary: 5 } }),
        await mk("E2E — стойкий", "mortal", { willpower: { permanent: 8, temporary: 8 } })];
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — presence", type: "discipline", system: { key: "presence", value: 5 } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([a, ...crowd].map((x, i) => x.getTokenDocument({ x: 100 + i * 200, y: 1100 }))));
      const tok = x => made.find(tk => tk.actorId === x.id);
      for (let i = 0; i < 30 && !canvas.tokens.get(tok(crowd[2]).id); i++) await wait(100);
      await wait(400);
      const rollDlg = async () => { let d = null; for (let i = 0; i < 30 && !d; i++) { await wait(100); d = [...foundry.applications.instances.values()].find(x => x.constructor.name === "RollDialog" && (x.actor === a || x.actor?.id === a.id)); } return d; };
      const closeAll = async () => { for (const x of [...foundry.applications.instances.values()]) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const openPop = async () => { await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
        document.querySelector('#r-hud [data-act="pop"][data-pop*="presence"]')?.click(); await wait(400); };
      const row = re => [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => re.test(x.textContent));
      const out = {};
      canvas.tokens.get(tok(a).id)?.control({ releaseOthers: true }); await wait(600);
      // Благоговение: отмечены все трое, 2 успеха — поддаются двое с меньшей Волей
      crowd.forEach((x, i) => canvas.tokens.get(tok(x).id)?.setTarget(true, { releaseOthers: i === 0 }));
      await wait(400);
      await openPop(); row(/Благоговение/)?.click();
      let d = await rollDlg();
      const link = d?.cfg.extra?.targetPower;
      out.awe = [d?.values.difficulty, link?.crowd?.length];
      await d?.close();
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: { targetPower: link } }, { successes: 2, outcome: "success" });
      out.aweHit = crowd.map(x => canvas.tokens.get(tok(x).id)?.actor.effects.some(e => e.flags?.[sid]?.awe) ?? false);
      // Устрашающий взор: цель с невосприимчивостью ко всему Величию — окно не открывается
      const weak = canvas.tokens.get(tok(crowd[0]).id).actor;
      await weak.createEmbeddedDocuments("ActiveEffect", [{ name: "E2E — иммунитет", flags: { [sid]: { presImmune: { by: a.uuid, power: "all" } } } }]);
      canvas.tokens.get(tok(crowd[0]).id)?.setTarget(true, { releaseOthers: true }); await wait(300);
      await openPop(); row(/Устрашающий/)?.click(); await wait(600);
      out.dreadBlocked = ![...foundry.applications.instances.values()].some(x => x.constructor.name === "RollDialog");
      // Очарование: уже очарован этим вампиром — повторно нельзя
      const mid = canvas.tokens.get(tok(crowd[1]).id).actor;
      await mid.createEmbeddedDocuments("ActiveEffect", [{ name: "E2E — очарован", flags: { [sid]: { mind: "presence|Entrancement", by: a.uuid, mode: "scene" } } }]);
      canvas.tokens.get(tok(crowd[1]).id)?.setTarget(true, { releaseOthers: true }); await wait(300);
      await openPop(); row(/Очарование/)?.click(); await wait(600);
      out.entranceBlocked = ![...foundry.applications.instances.values()].some(x => x.constructor.name === "RollDialog");
      // Приглашение: знакомство поверхностное — сложность 7; 4 успеха — до рассвета, «быстро преодолевает»
      canvas.tokens.get(tok(crowd[2]).id)?.setTarget(true, { releaseOthers: true }); await wait(300);
      await openPop(); row(/Приглашение/)?.click();
      let ask = null; for (let i = 0; i < 30 && !ask; i++) { await wait(100); ask = [...foundry.applications.instances.values()].find(x => x instanceof foundry.applications.api.DialogV2); }
      const opt7 = ask?.element.querySelector('.r-ask-opt[data-v="7"]'); if (opt7) opt7.click(); const sel = ask?.element.querySelector("select"); if (sel) sel.value = "7";
      ask?.element.querySelector('button[data-action="ok"]')?.click();
      d = await rollDlg();
      out.call = d?.values.difficulty;
      const callLink = d?.cfg.extra?.targetPower;
      await d?.close();
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: { targetPower: callLink } }, { successes: 4, outcome: "success" });
      const strong = canvas.tokens.get(tok(crowd[2]).id).actor;
      out.callFx = !!strong.effects.find(e => e.flags?.[sid]?.mind === "presence|Summon")?.flags[sid].until;
      // Преклонение: без силы — нападать можно; кто уже преодолел — без новой проверки
      out.majesty = [await TP.majestyCheck(strong, a)];
      await a.startPower("presence:5");
      await strong.createEmbeddedDocuments("ActiveEffect", [{ name: "E2E — преодолел", flags: { [sid]: { majestyPassed: a.uuid } } }]);
      out.majesty.push(await TP.majestyCheck(strong, a));
      [...game.user.targets].forEach(x => x.setTarget(false, { releaseOthers: false }));
      canvas.tokens.releaseAll();
      await wait(800);
      await scene.deleteEmbeddedDocuments("Token", made.map(x => x.id));
      await Actor.deleteDocuments([a.id, ...crowd.map(x => x.id)]);
      return out;
    });
    const want = { awe: [7, 3], aweHit: [true, true, false], dreadBlocked: true, entranceBlocked: true, call: 7, callFx: true, majesty: [true, true] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Доминирование через HUD: сложность и невосприимчивость, чужое порабощение +2, программа Внушения, Порабощение, Вселение
  await check("Доминирование через HUD", async () => {
    const r = await page.evaluate(async () => {
      const sys = p => import(`/systems/${game.system.id}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs");
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms));
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — вентру", "vampire", { generation: 9, willpower: { permanent: 7, temporary: 7 } });
      const m = await mk("E2E — слуга", "mortal", { willpower: { permanent: 4, temporary: 4 }, virtues: { selfControl: { value: 1 } } });
      const g1 = await mk("E2E — чужой гуль", "ghoul", { domitor: "Кто-то другой" });
      const g2 = await mk("E2E — свой гуль", "ghoul", { domitor: "E2E — вентру" });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — dominate", type: "discipline", system: { key: "dominate", value: 5 } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([a, m, g1, g2].map((x, i) => x.getTokenDocument({ x: 100 + i * 200, y: 1300 }))));
      const tok = x => made.find(tk => tk.actorId === x.id);
      for (let i = 0; i < 30 && !canvas.tokens.get(tok(g2).id); i++) await wait(100);
      await wait(400);
      const inst = () => [...foundry.applications.instances.values()];
      const closeAll = async () => { for (const x of inst()) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const rollDlg = async () => { let d = null; for (let i = 0; i < 30 && !d; i++) { await wait(100); d = inst().find(x => x.constructor.name === "RollDialog"); } return d; };
      const answer = async fill => { let d = null; for (let i = 0; i < 30 && !d; i++) { await wait(100); d = inst().find(x => x instanceof foundry.applications.api.DialogV2); }
        fill?.(d?.element); d?.element.querySelector('button[data-action="ok"]')?.click(); await wait(400); return !!d; };
      const mark = async x => { canvas.tokens.get(tok(x).id)?.setTarget(true, { releaseOthers: true }); await wait(300); };
      const hudPower = async re => { await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
        document.querySelector('#r-hud [data-act="pop"][data-pop*="dominate"]')?.click(); await wait(400);
        [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => re.test(x.textContent))?.click(); };
      const out = {};
      canvas.tokens.get(tok(a).id)?.control({ releaseOthers: true }); await wait(600);
      const mt = () => canvas.tokens.get(tok(m).id).actor;
      // Приказ: сложность — текущая Воля (4); чужое порабощение — +2; невосприимчивость — окна нет
      await mark(m); await hudPower(/Приказ/);
      let d = await rollDlg(); out.cmd = d?.values.difficulty;
      await mt().createEmbeddedDocuments("ActiveEffect", [{ name: "E2E — чужой хозяин", flags: { [sid]: { conditioned: "Actor.someoneElse" } } }]);
      await hudPower(/Приказ/); d = await rollDlg(); out.cmdSlave = d?.values.difficulty;
      const imm = await mt().createEmbeddedDocuments("ActiveEffect", [{ name: "E2E — иммунитет", flags: { [sid]: { presImmune: { by: a.uuid, power: "all", disc: "dominate" } } } }]);
      await hudPower(/Приказ/); await wait(600); out.immune = !inst().some(x => x.constructor.name === "RollDialog");
      await mt().deleteEmbeddedDocuments("ActiveEffect", [imm[0].id, ...mt().effects.filter(e => e.flags?.[sid]?.conditioned).map(e => e.id)]);
      await closeAll();
      // Внушение: 3 успеха — программа; 2 — прежняя остаётся; 4 — заменяет
      const link = key => ({ key, target: mt().uuid, targetName: m.name, powerName: key, actorName: a.name });
      const apply = (key, n) => TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: { targetPower: link(key) } }, { successes: n, outcome: "success" });
      const prog = () => mt().effects.filter(e => e.flags?.[sid]?.program).map(e => e.flags[sid].program);
      for (const n of [3, 2, 4]) { const pr = apply("dominate|Mesmerize", n); await answer(el => { if (el) el.querySelector("textarea").value = `E2E — приказ ${n}`; }); await pr; }
      out.program = prog();
      // Порабощение: Самоконтроль 1, ×5 — нужно 5; 3 + 3 — порабощён
      let pr = apply("dominate|Conditioning", 3); await answer(el => { const o = el?.querySelector('.r-ask-opt[data-v="5"]'); if (o) o.click(); const s = el?.querySelector("select"); if (s) s.value = "5"; }); await pr;
      out.condMid = mt().getFlag(sid, "conditioning")?.total;
      await apply("dominate|Conditioning", 3);
      out.condDone = mt().effects.some(e => e.flags?.[sid]?.conditioned);
      // Вселение: чужой гуль — нельзя, свой — можно; после захвата — проверка доступа
      const P = game.vtm20Codex.discipline("dominate").powers.find(x => x.en === "Possession"), PT = TP.TARGET_POWERS["dominate|Possession"];
      await mark(g1); out.ghoulOther = TP.prepareTargetPower(a, "dominate", P, PT)?.blocked?.code === "ghoulOwn";
      await mark(g2); out.ghoulOwn = !TP.prepareTargetPower(a, "dominate", P, PT)?.blocked;
      await mt().update({ "system.willpower.temporary": 0 });
      const n0 = game.messages.size;
      await apply("dominate|Possession", 2);
      const card = game.messages.contents.slice(n0).find(x => x.getFlag(sid, "possessRoll"));
      await TP.possessAccess(card);
      d = await rollDlg(); out.access = [d?.values.trait1, d?.values.difficulty];
      await closeAll();
      [...game.user.targets].forEach(x => x.setTarget(false, { releaseOthers: false }));
      canvas.tokens.releaseAll();
      await wait(800);
      await scene.deleteEmbeddedDocuments("Token", made.map(x => x.id));
      await Actor.deleteDocuments([a.id, m.id, g1.id, g2.id]);
      return out;
    });
    const want = { cmd: 4, cmdSlave: 6, immune: true, program: [4], condMid: 3, condDone: true, ghoulOther: true, ghoulOwn: true, access: ["attributes.manipulation", 7] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Затмение через HUD: силы-эффекты без броска включаются кликом, Чёрный метаморфоз — бросок запускает эффект,
  // Театр теней «опутать» — на цели Выносливость −1
  await check("Затмение через HUD", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms));
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — ласомбра HUD", "vampire", { generation: 8, blood: { value: 15 } });
      const m = await mk("E2E — жертва тени", "mortal", { attributes: { stamina: { value: 3 } } });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — obtenebration", type: "discipline", system: { key: "obtenebration", value: 5 } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([a, m].map((x, i) => x.getTokenDocument({ x: 100 + i * 200, y: 1500 }))));
      const tok = x => made.find(tk => tk.actorId === x.id);
      for (let i = 0; i < 30 && !canvas.tokens.get(tok(m).id); i++) await wait(100);
      await wait(400);
      const inst = () => [...foundry.applications.instances.values()];
      const closeAll = async () => { for (const x of inst()) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const hudPower = async re => { await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
        document.querySelector('#r-hud [data-act="pop"][data-pop*="obtenebration"]')?.click(); await wait(400);
        [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => re.test(x.textContent))?.click(); await wait(600); };
      const at = () => canvas.tokens.get(tok(a).id).actor, mt = () => canvas.tokens.get(tok(m).id).actor;
      const out = {};
      canvas.tokens.get(tok(a).id)?.control({ releaseOthers: true }); await wait(600);
      canvas.tokens.get(tok(m).id)?.setTarget(true, { releaseOthers: true }); await wait(300);
      // Театр теней: окно режима, «опутать» — на цели Выносливость 3 → 2
      await hudPower(/Театр теней/);
      const dlg = inst().find(x => x instanceof foundry.applications.api.DialogV2);
      const sel = dlg?.element.querySelector('select[name="variant"]'); if (sel) sel.value = "smother";
      dlg?.element.querySelector('button[data-action="ok"]')?.click(); await wait(800);
      out.smother = [!!dlg, !inst().some(x => x.constructor.name === "RollDialog"), mt().system.attributes.stamina.total];
      // Сумеречный облик: клик — облик включён, окна броска нет
      await hudPower(/Сумеречный/);
      out.tenebrous = [!!at().system.fx?.shadowForm, !inst().some(x => x.constructor.name === "RollDialog")];
      // Чёрный метаморфоз: окно броска; успех — эффект без второй оплаты
      await hudPower(/Чёрный метаморфоз/);
      const rd = inst().find(x => x.constructor.name === "RollDialog");
      const blood = at().system.blood.value;
      await rd?.cfg.onRolled?.({ successes: 2, outcome: "success" });
      out.black = [rd?.values.difficulty, at().powerEffects.some(x => x.power === "obtenebration:4"), at().system.blood.value === blood];
      await closeAll();
      // Покрывало ночи: бросок Манипуляция + Оккультизм (сл. 7)
      await hudPower(/Покрывало ночи/);
      out.shroud = inst().find(x => x.constructor.name === "RollDialog")?.values.difficulty;
      await closeAll();
      [...game.user.targets].forEach(x => x.setTarget(false, { releaseOthers: false }));
      canvas.tokens.releaseAll();
      await wait(800);
      await scene.deleteEmbeddedDocuments("Token", made.map(x => x.id));
      await Actor.deleteDocuments([a.id, m.id]);
      return out;
    });
    const want = { smother: [true, true, 2], tenebrous: [true, true], black: [7, true, true], shroud: 7 };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Преображение через HUD: Искусство костей — когти и шипы ценой ран, удар в сердце, шипы против голых рук;
  // Чудовищный облик — Запугивание Силой
  await check("Преображение через HUD: кости и Чудовищный облик", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms));
      const sys = p => import(`/systems/${sid}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs"), CP = await sys("module/data/combat-powers.mjs");
      const CB = await sys("module/combat/combat.mjs"), RD = await sys("module/dice/dialog.mjs");
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — цимисх HUD", "vampire", { generation: 8, blood: { value: 15 },
        attributes: { strength: { value: 2 }, charisma: { value: 3 } }, abilities: { intimidation: { value: 2 } } });
      const m = await mk("E2E — смертный для костей", "mortal", { attributes: { strength: { value: 2 } } });
      const v = await mk("E2E — вампир для костей", "vampire", { generation: 10, blood: { value: 10 } });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — vicissitude", type: "discipline", system: { key: "vicissitude", value: 4 } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([a, m, v].map((x, i) => x.getTokenDocument({ x: 100 + i * 200, y: 1700 }))));
      const tok = x => made.find(tk => tk.actorId === x.id);
      for (let i = 0; i < 30 && !canvas.tokens.get(tok(v).id); i++) await wait(100);
      await wait(400);
      const inst = () => [...foundry.applications.instances.values()];
      const dialogs = () => inst().filter(x => x instanceof foundry.applications.api.DialogV2);
      const closeAll = async () => { for (const x of inst()) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const pick = async val => { const d = dialogs().at(-1); const opt = d?.element.querySelector(`.r-ask-opt[data-v="${val}"]`); if (opt) { opt.click(); await wait(500); return; } const s = d?.element.querySelector("select"); if (s) s.value = val;
        d?.element.querySelector('button[data-action="ok"]')?.click(); await wait(500); return !!d; };
      const bone = async (mode, diff) => { await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
        document.querySelector('#r-hud [data-act="pop"][data-pop*="vicissitude"]')?.click(); await wait(400);
        [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => /Искусство костей/.test(x.textContent))?.click(); await wait(600);
        await pick(mode); if (diff) await pick(diff);
        return inst().find(x => x.constructor.name === "RollDialog"); };
      const actorOf = x => canvas.tokens.get(tok(x).id).actor;
      const target = x => { if (x) canvas.tokens.get(tok(x).id)?.setTarget(true, { releaseOthers: true }); else [...game.user.targets].forEach(t => t.setTarget(false, { releaseOthers: false })); };
      const out = {};
      canvas.tokens.get(tok(a).id)?.control({ releaseOthers: true }); await wait(600);
      // Когти смертному: сл. по выбору (6), без кнопки урона; наложение — 1 губительное и оружие Сила +1
      target(m); await wait(300);
      let rd = await bone("claws", "6");
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 2, outcome: "success" });
      const claw = actorOf(m).items.find(i => i.type === "weapon" && /Костяные когти/.test(i.name));
      out.claws = [rd?.values.difficulty, !!rd?.cfg.extra?.power?.noHit, actorOf(m).system.health.lethal, claw?.system.damage, claw?.system.damageType];
      // Шипы себе (цель снята): 2 успеха — цена 3 губительных, шипы на листе
      target(null); await wait(300);
      rd = await bone("spikes", "7");
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 2, outcome: "success" });
      out.spikes = [rd?.values.difficulty, actorOf(a).system.health.lethal, !!actorOf(a).system.fx?.spikes];
      // Клинч шипастого: +2 куба урона (Сила 2 + 2)
      out.clinch = new CB.AttackDialog(actorOf(a), { maneuver: "clinch" }).compute().damage;
      // Безоружный попал по шипастому 2 успехами — урон его Силой по нему самому
      const n0 = game.messages.size;
      await CB.resolveAttack({ id: `e2e-spikes-${Date.now()}`, getFlag: () => ({ attacker: actorOf(m).uuid, attackerName: m.name, target: actorOf(a).uuid, targetName: a.name,
        weaponName: "кулак", successes: 2, damagePool: 2, damageType: "bashing", unarmed: true }) }, 0, "none");
      const back = game.messages.contents.slice(n0).find(x => x.getFlag(sid, "roll")?.extra?.target === actorOf(m).uuid || x.flags?.[sid]?.roll?.extra?.target === actorOf(m).uuid);
      out.back = !!back || game.messages.contents.slice(n0).some(x => /Костяные шипы/.test(x.content ?? "") || /Костяные шипы/.test(x.flavor ?? ""));
      // Удар костями по вампиру: сл. 7; 5 успехов — рёбра в сердце, половина крови
      target(v); await wait(300);
      rd = await bone("weapon");
      const n1 = game.messages.size;
      await CP.powerHit(null, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 5, outcome: "success" });
      const card = game.messages.contents.slice(n1).find(x => x.getFlag(sid, "fixedDamage"));
      if (card) await CP.applyFixedDamage(card);
      out.heart = [rd?.values.difficulty, !!card?.getFlag(sid, "fixedDamage")?.heart, actorOf(v).system.blood.value];
      // Шипы смертному, провал: смерть
      target(m); await wait(300);
      rd = await bone("spikes", "5");
      const n2 = game.messages.size;
      await rd?.cfg.onRolled?.({ successes: 0, outcome: "botch" });
      const before = actorOf(m).system.health.lethal;
      const bcard = game.messages.contents.slice(n2).find(x => x.getFlag(sid, "targetApply"));
      if (bcard) await TP.applyFromCard(bcard);
      out.botch = [before, actorOf(m).system.health.lethal];
      await closeAll();
      // Своя работа себе: клинок Сила +2 тяжёлые, сл. 8, цена 3 минус успехи, +1 к прочности
      target(null); await wait(300);
      await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
      document.querySelector('#r-hud [data-act="pop"][data-pop*="vicissitude"]')?.click(); await wait(400);
      [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => /Искусство костей/.test(x.textContent))?.click(); await wait(600);
      await pick("custom");
      const cf = dialogs().at(-1)?.element;
      const radio = (n, v) => cf?.querySelector(`[name="${n}"][value="${v}"]`)?.click();
      if (cf) { cf.querySelector('[name="name"]').value = "Костяной клинок"; radio("diff", 8); cf.querySelector('.r-bw-dot[data-n="3"]')?.click();
        cf.querySelector('[name="minus"]').click(); radio("wtype", "lethal"); radio("wkind", "melee"); radio("wdmg", 2); radio("soak", 1);
        cf.querySelector('[name="blood"]')?.closest(".r-bw-step")?.querySelector('[data-d="1"]')?.click();
        cf.querySelector('[name="attr.strength"]')?.closest(".r-bw-step")?.querySelector('[data-d="1"]')?.click();
        cf.querySelector('[name="spikes"]').click(); radio("grapple", 1); cf.querySelector('[name="save"]').click(); }
      out.sum = cf?.querySelector(".r-bw-sum")?.textContent ?? "";
      cf?.querySelector('button[data-action="ok"]')?.click();
      await wait(600);
      rd = inst().find(x => x.constructor.name === "RollDialog");
      await actorOf(a).update({ "system.health.lethal": 0 });
      const str0 = actorOf(a).system.attributes.strength.total;
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 1, outcome: "success" });
      const blade = actorOf(a).items.find(i => i.type === "weapon" && i.name === "Костяной клинок");
      const work = actorOf(a).effects.find(e => e.flags?.[sid]?.boneWork === "Костяной клинок");
      // работа — отдельно: шипы остались; Сила +1, кубы в клинче: шипы 2 + работа 1
      out.custom = [rd?.values.difficulty, rd?.cfg.bloodCost, actorOf(a).system.health.lethal, blade?.system.damage, blade?.system.damageType, blade?.system.kind,
        TP.soakDice(actorOf(a)), actorOf(a).powerEffects.some(x => x.power === "vicissitude:3"), actorOf(a).system.attributes.strength.total - str0, actorOf(a).system.fx?.grappleDice];
      // снять работу — оружие уходит
      await work?.delete(); await wait(500);
      out.customOff = [actorOf(a).items.some(i => i.name === "Костяной клинок"), actorOf(a).system.attributes.strength.total - str0];
      await closeAll();
      // шаблон сохранён у персонажа: в списке режимов; открывается заполненным; удаляется кнопкой
      const tpl = actorOf(a).getFlag(sid, "boneTemplates") ?? [];
      document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
      document.querySelector('#r-hud [data-act="pop"][data-pop*="vicissitude"]')?.click(); await wait(400);
      [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => /Искусство костей/.test(x.textContent))?.click(); await wait(600);
      const hasTpl = !![...(dialogs().at(-1)?.element.querySelectorAll(".r-ask-opt") ?? [])].find(o => o.dataset.v === "tpl:0" && /Костяной клинок/.test(o.textContent));
      await pick("tpl:0");
      const tf = dialogs().at(-1)?.element;
      const filled = [tf?.querySelector('[name="name"]')?.value, tf?.querySelector('[name="diff"]:checked')?.value, tf?.querySelector('[name="cost"]')?.value];
      tf?.querySelector('button[data-action="forget"]')?.click(); await wait(600);
      out.tpl = [tpl.length, tpl[0]?.weapon?.damage, hasTpl, ...filled, (actorOf(a).getFlag(sid, "boneTemplates") ?? []).length];
      await closeAll();
      // Чудовищный облик: Харизма 0, Запугивание — Силой (2 + 3)
      target(null); await actorOf(a).update({ "system.health.lethal": 0 });
      await actorOf(a).startPower("vicissitude:4");
      const dlg = new RD.RollDialog(actorOf(a), { trait1: "attributes.charisma", trait2: "abilities.intimidation" });
      const dlg2 = new RD.RollDialog(actorOf(a), { trait1: "attributes.charisma", trait2: "abilities.empathy" });
      const withStr = dlg.compute().pool; dlg.values.horrid = false;
      out.horrid = [actorOf(a).system.attributes.charisma.total, withStr, dlg2.compute().pool, dlg.compute().pool];
      canvas.tokens.releaseAll();
      await wait(800);
      await scene.deleteEmbeddedDocuments("Token", made.map(x => x.id));
      await Actor.deleteDocuments([a.id, m.id, v.id]);
      return out;
    });
    const want = { claws: [6, true, 1, 1, "lethal"], spikes: [7, 3, true], clinch: 4, back: true, heart: [7, true, 5], botch: [1, 7],
      custom: [8, 2, 2, 2, "lethal", "melee", 1, true, 1, 3], customOff: [false, 0], tpl: [1, 2, true, "Костяной клинок", "8", "3", 0], horrid: [0, 7, 0, 2] };
    if (!/Костяной клинок.*сл\. 8.*3 тяжёлые минус успехи.*\+1 крови.*Сила \+2.*Сила \+1.*\+1 к прочности.*колется.*\+1 к урону в захвате/i.test(r.sum)) throw new Error(`итог окна: ${r.sum}`);
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Серпентис: Облик кобры — 3 хода превращения, только укус без захвата, слух −2 куба, Дисциплины кроме требующих рук
  await check("Серпентис: Облик кобры", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, sys = p => import(`/systems/${sid}/${p}`);
      const CB = await sys("module/combat/combat.mjs"), RD = await sys("module/dice/dialog.mjs"), PE = await sys("module/apps/power-effects.mjs");
      const EF = await sys("module/data/effects.mjs");
      const a = await Actor.create({ name: "E2E — сетит-кобра", type: "vampire", flags: { world: { e2e: true } },
        system: { generation: 9, blood: { value: 12 }, attributes: { perception: { value: 3 } }, abilities: { alertness: { value: 2 } } } });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — serpentis", type: "discipline", system: { key: "serpentis", value: 4 } },
        { name: "E2E — protean", type: "discipline", system: { key: "protean", value: 2 } }]);
      await a.startPower("serpentis:4");
      const out = { form: [a.system.fx?.beastForm, EF.POWER_EFFECTS["serpentis:4"].transformTurns, a.system.blood.value] };
      const atk = new CB.AttackDialog(a, {});
      const c = atk.compute().choice;
      out.bite = [atk.v.pick, /без предварительного захвата/.test(c.note)];
      // прочие приёмы не спрятаны, а приглушены
      const actx = await atk._prepareContext({});
      out.dim = [actx.maneuvers.find(x => x.key === "m:punch")?.dim, actx.maneuvers.find(x => x.key === "m:bite")?.dim];
      await PE.togglePowerEffect(a, "protean:2");
      await PE.togglePowerEffect(a, "serpentis:2");
      out.powers = [a.powerEffects.some(x => x.power === "protean:2"), a.powerEffects.some(x => x.power === "serpentis:2")];
      const dlg = new RD.RollDialog(a, { trait1: "attributes.perception", trait2: "abilities.alertness" });
      const before = dlg.compute().pool;
      const sit = dlg.compute().diffSit.find(d => d.kind === "hearing");
      dlg.values.fxOn = [`hearing:${sit?.label}`];
      out.hearing = [before, dlg.compute().pool, dlg.compute().effDifficulty];
      await Actor.deleteDocuments([a.id]);
      return out;
    });
    const want = { form: ["cobra", 3, 11], bite: ["m:bite", true], dim: [true, false], powers: [false, true], hearing: [5, 3, 6] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Сокрытие через HUD: Маска тысячи лиц — бросок включает маску с качеством по успехам; атака срывает Плащ и Тайное собрание
  await check("Сокрытие через HUD: маска и срыв атакой", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms));
      const PE = await import(`/systems/${sid}/module/apps/power-effects.mjs`);
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — малкавиан в тени", "vampire", { generation: 9, blood: { value: 12 }, abilities: { stealth: { value: 2 } } });
      const b = await mk("E2E — спутник в тени", "mortal");
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — obfuscate", type: "discipline", system: { key: "obfuscate", value: 5 } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const [ta] = await scene.createEmbeddedDocuments("Token", [await a.getTokenDocument({ x: 100, y: 1900 })]);
      for (let i = 0; i < 30 && !canvas.tokens.get(ta.id); i++) await wait(100);
      await wait(400);
      const inst = () => [...foundry.applications.instances.values()];
      const closeAll = async () => { for (const x of inst()) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const at = () => canvas.tokens.get(ta.id).actor;
      canvas.tokens.get(ta.id)?.control({ releaseOthers: true }); await wait(600);
      await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
      document.querySelector('#r-hud [data-act="pop"][data-pop*="obfuscate"]')?.click(); await wait(400);
      [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => /Маска тысячи лиц/.test(x.textContent))?.click(); await wait(600);
      const rd = inst().find(x => x.constructor.name === "RollDialog");
      await rd?.cfg.onRolled?.({ successes: 3, outcome: "success" });
      const mask = at().powerEffects.find(x => x.power === "obfuscate:3");
      const out = { mask: [rd?.values.difficulty, !!mask, /3 успеха/.test(mask?.effect.description ?? "")] };
      await closeAll();
      // Плащ теней и спутник в Тайном собрании; атака — всё спадает, маска остаётся
      await at().startPower("obfuscate:1");
      await b.createEmbeddedDocuments("ActiveEffect", [{ name: "E2E собрание", flags: { [sid]: { mind: "obfuscate|Cloak the Gathering", by: at().uuid, mode: "scene" } } }]);
      const broke = await PE.breakObfuscate(at(), "атака");
      out.broken = [broke, at().powerEffects.some(x => x.power === "obfuscate:1"), b.effects.size, at().powerEffects.some(x => x.power === "obfuscate:3")];
      canvas.tokens.releaseAll();
      await wait(600);
      await scene.deleteEmbeddedDocuments("Token", [ta.id]);
      await Actor.deleteDocuments([a.id, b.id]);
      return out;
    });
    const want = { mask: [7, true, true], broken: [true, false, 0, true] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Упокоение: Зов Дагона — Выносливость против текущей Воли жертвы, сопротивление и урон изнутри; яд до Выносливости 0 — торпор
  await check("Упокоение: Зов Дагона и яд до нуля", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs"), { rollPowerRef } = await sys("module/sheets/actor-sheet.mjs");
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — ассамит", "vampire", { generation: 9, blood: { value: 12 }, willpower: { permanent: 6, temporary: 5 }, attributes: { stamina: { value: 3 } } });
      const m = await mk("E2E — жертва Дагона", "mortal", { attributes: { stamina: { value: 1 } }, willpower: { permanent: 4, temporary: 4 } });
      const v = await mk("E2E — жертва яда", "vampire", { generation: 10, blood: { value: 8 }, attributes: { stamina: { value: 2 } } });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — quietus", type: "discipline", system: { key: "quietus", value: 3 } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const [tm] = await scene.createEmbeddedDocuments("Token", [await m.getTokenDocument({ x: 300, y: 2100 })]);
      for (let i = 0; i < 30 && !canvas.tokens.get(tm.id); i++) await wait(100);
      canvas.tokens.get(tm.id)?.setTarget(true, { releaseOthers: true }); await wait(300);
      const inst = () => [...foundry.applications.instances.values()];
      const idx = game.vtm20Codex.discipline("quietus").powers.findIndex(p => p.en === "Dagon's Call");
      await rollPowerRef(a, `quietus|${idx}`);
      let rd = null;
      for (let i = 0; i < 30 && !rd; i++) { await wait(100); rd = inst().find(x => x.constructor.name === "RollDialog" && x.actor === a); }
      const out = { roll: [rd?.values.trait1, rd?.values.difficulty, !!rd?.cfg.willpowerCost, rd?.cfg.extra?.targetPower?.key] };
      await rd?.close();
      const n0 = game.messages.size;
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: { targetPower: rd?.cfg.extra?.targetPower } }, { successes: 4, outcome: "success" });
      const card = game.messages.contents.slice(n0).find(x => x.getFlag(sid, "fixedDamage"));
      const fd = card?.getFlag(sid, "fixedDamage");
      out.dagon = [!!card, fd?.type, !!fd?.internal, (fd?.amount ?? 0) >= 3];
      // Касание скорпиона: 3 пункта яда навсегда у вампира с Выносливостью 2 — торпор
      const link = { key: "quietus|Scorpion's Touch", target: v.uuid, targetName: v.name, powerName: "Касание скорпиона", actorName: a.name, poison: 3 };
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: { targetPower: link } }, { successes: 10, outcome: "success" });
      out.zero = [v.system.attributes.stamina.total <= 0, v.statuses.has("r-torpor")];
      [...game.user.targets].forEach(x => x.setTarget(false, { releaseOthers: false }));
      await wait(500);
      await scene.deleteEmbeddedDocuments("Token", [tm.id]);
      await Actor.deleteDocuments([a.id, m.id, v.id]);
      return out;
    });
    const want = { roll: ["attributes.stamina", 4, true, "quietus|Dagon's Call"], dagon: [true, "lethal", true, true], zero: [true, true] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Ясновидение через HUD: Психометрия — сложность по следу; Телепатия — чтение вампира стоит Волю; Проекция — сложность по месту
  await check("Ясновидение через HUD", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms));
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — тореадор-провидец", "vampire", { generation: 9, blood: { value: 12 }, willpower: { permanent: 6, temporary: 6 } });
      const v = await mk("E2E — читаемый вампир", "vampire", { generation: 10, willpower: { permanent: 5, temporary: 4 } });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — auspex", type: "discipline", system: { key: "auspex", value: 5 } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([a, v].map((x, i) => x.getTokenDocument({ x: 100 + i * 200, y: 2300 }))));
      const tok = x => made.find(tk => tk.actorId === x.id);
      for (let i = 0; i < 30 && !canvas.tokens.get(tok(v).id); i++) await wait(100);
      await wait(400);
      const inst = () => [...foundry.applications.instances.values()];
      const dialogs = () => inst().filter(x => x instanceof foundry.applications.api.DialogV2);
      const closeAll = async () => { for (const x of inst()) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const pick = async val => { const d = dialogs().at(-1); const opt = d?.element.querySelector(`.r-ask-opt[data-v="${val}"]`); if (opt) { opt.click(); await wait(500); return; } const s = d?.element.querySelector("select"); if (s) s.value = val;
        d?.element.querySelector('button[data-action="ok"]')?.click(); await wait(500); };
      const hud = async re => { await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
        document.querySelector('#r-hud [data-act="pop"][data-pop*="auspex"]')?.click(); await wait(400);
        [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => re.test(x.textContent))?.click(); await wait(600); };
      const rollDlg = () => inst().find(x => x.constructor.name === "RollDialog");
      const at = () => canvas.tokens.get(tok(a).id).actor;
      canvas.tokens.get(tok(a).id)?.control({ releaseOthers: true }); await wait(600);
      const out = {};
      await hud(/Психометрия|Прикосновение духа/); await pick("4");
      out.psycho = rollDlg()?.values.difficulty;
      canvas.tokens.get(tok(v).id)?.setTarget(true, { releaseOthers: true }); await wait(300);
      const w0 = at().system.willpower.temporary;
      await hud(/Телепатия/); await pick("read");
      out.tele = [rollDlg()?.values.difficulty, w0 - at().system.willpower.temporary];
      [...game.user.targets].forEach(x => x.setTarget(false, { releaseOthers: false })); await wait(300);
      await hud(/Психическая проекция/); await pick("9");
      out.project = rollDlg()?.values.difficulty;
      await closeAll();
      canvas.tokens.releaseAll(); await wait(600);
      await scene.deleteEmbeddedDocuments("Token", made.map(x => x.id));
      await Actor.deleteDocuments([a.id, v.id]);
      return out;
    });
    const want = { psycho: 4, tele: [4, 1], project: 9 };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Фантасмагория через HUD: иллюзии без броска (цена списана, на листе), Анимация и Постоянство к выбранной;
  // Кошмар наяву — 2 Воли, урон без поглощения и не до смерти
  await check("Фантасмагория через HUD", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs");
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — равнос", "vampire", { generation: 9, blood: { value: 12 }, willpower: { permanent: 7, temporary: 7 } });
      const m = await mk("E2E — жертва кошмара", "mortal", { attributes: { perception: { value: 2 } } });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — chimerstry", type: "discipline", system: { key: "chimerstry", value: 5 } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([a, m].map((x, i) => x.getTokenDocument({ x: 100 + i * 200, y: 2500 }))));
      const tok = x => made.find(tk => tk.actorId === x.id);
      for (let i = 0; i < 30 && !canvas.tokens.get(tok(m).id); i++) await wait(100);
      await wait(400);
      const inst = () => [...foundry.applications.instances.values()];
      const dialogs = () => inst().filter(x => x instanceof foundry.applications.api.DialogV2);
      const closeAll = async () => { for (const x of inst()) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const hud = async re => { await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
        document.querySelector('#r-hud [data-act="pop"][data-pop*="chimerstry"]')?.click(); await wait(400);
        [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => re.test(x.textContent))?.click(); await wait(600); };
      const answer = async val => { const d = dialogs().at(-1); const opt = d?.element.querySelector(`.r-ask-opt[data-v="${val}"]`); if (opt) { opt.click(); await wait(600); return; } const f = d?.element.querySelector("select, input[type=text]"); if (f) f.value = val;
        d?.element.querySelector('button[data-action="ok"]')?.click(); await wait(600); };
      const at = () => canvas.tokens.get(tok(a).id).actor, mt = () => canvas.tokens.get(tok(m).id).actor;
      canvas.tokens.get(tok(a).id)?.control({ releaseOthers: true }); await wait(600);
      const w0 = at().system.willpower.temporary, b0 = at().system.blood.value;
      await hud(/Фата/); await answer("Кирпичная стена");
      const ill = () => at().effects.filter(e => e.flags?.[sid]?.illusion);
      const out = { fata: [ill().length, w0 - at().system.willpower.temporary, b0 - at().system.blood.value, !inst().some(x => x.constructor.name === "RollDialog")] };
      await hud(/Анимация/); await answer(ill()[0]?.id);
      await hud(/Постоянство/); await answer(ill()[0]?.id);
      out.steps = [!!ill()[0]?.flags[sid].animate, !!ill()[0]?.flags[sid].permanent, b0 - at().system.blood.value];
      // Кошмар наяву: 2 Воли, сложность — Восприятие + Самоконтроль
      canvas.tokens.get(tok(m).id)?.setTarget(true, { releaseOthers: true }); await wait(300);
      const w1 = at().system.willpower.temporary;
      await hud(/Кошмар наяву/); await answer("lethal");
      const rd = inst().find(x => x.constructor.name === "RollDialog");
      const sc = mt().system.virtues?.selfControl?.value ?? 0;
      out.night = [rd?.values.difficulty === Math.min(10, 2 + sc), w1 - at().system.willpower.temporary];
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 9, outcome: "success" });
      const h = mt().system.health;
      out.nightHit = [h.lethal, mt().effects.some(e => e.flags?.[sid]?.nightmare)];
      await closeAll();
      [...game.user.targets].forEach(x => x.setTarget(false, { releaseOthers: false }));
      canvas.tokens.releaseAll(); await wait(600);
      await scene.deleteEmbeddedDocuments("Token", made.map(x => x.id));
      await Actor.deleteDocuments([a.id, m.id]);
      return out;
    });
    const want = { fata: [1, 1, 1, true], steps: [true, true, 3], night: [true, 2], nightHit: [7, true] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Сила без броска (кровные линии): окно «Применить» — цена правится, списывается, карточка в чат; «Бросок» — обычное окно
  await check("Сила без броска: «Применить»", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const { rollPowerRef } = await sys("module/sheets/actor-sheet.mjs");
      const a = await Actor.create({ name: "E2E — сангвинарий", type: "vampire", flags: { world: { e2e: true } },
        system: { generation: 10, blood: { value: 10 }, willpower: { permanent: 5, temporary: 5 } } });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — bardo", type: "discipline", system: { key: "bardo", value: 10 } }]);
      const inst = () => [...foundry.applications.instances.values()];
      const use = () => inst().find(x => x.element?.classList.contains("r-use-dialog"));
      const idx = game.vtm20Codex.discipline("bardo").powers.findIndex(p => p.en === "Boon of Anubis");
      const n0 = game.messages.size;
      rollPowerRef(a, `bardo|${idx}`); await wait(700);
      const dlg = use()?.element;
      const out = { open: !!dlg, noRoll: !inst().some(x => x.constructor.name === "RollDialog") };
      if (dlg) { dlg.querySelector('[name="b"]').value = "2"; dlg.querySelector('[name="w"]').value = "1"; dlg.querySelector('[name="n"]').value = "на быка";
        dlg.querySelector('button[data-action="use"]').click(); }
      await wait(800);
      out.paid = [10 - a.system.blood.value, 5 - a.system.willpower.temporary, game.messages.contents.slice(n0).some(x => /на быка/.test(x.content))];
      // «Бросок» — обычное окно
      rollPowerRef(a, `bardo|${idx}`); await wait(700);
      use()?.element.querySelector('button[data-action="roll"]')?.click(); await wait(700);
      const rd = inst().find(x => x.constructor.name === "RollDialog");
      out.roll = !!rd; await rd?.close();
      await a.delete();
      return out;
    });
    const want = { open: true, noRoll: true, paid: [2, 1, true], roll: true };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Мистификация через HUD: Чепуха без броска; Печать фей — 2 + Воля, −2 к Интеллекту на срок; Волшебная загадка — жертва замирает и решает
  await check("Мистификация через HUD", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs");
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — киасид", "vampire", { generation: 9, blood: { value: 12 } });
      const m = await mk("E2E — гость киасида", "mortal", { willpower: { permanent: 3, temporary: 3 }, attributes: { intelligence: { value: 3 } } });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — mytherceria", type: "discipline", system: { key: "mytherceria", value: 5 } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([a, m].map((x, i) => x.getTokenDocument({ x: 100 + i * 200, y: 2700 }))));
      const tok = x => made.find(tk => tk.actorId === x.id);
      for (let i = 0; i < 30 && !canvas.tokens.get(tok(m).id); i++) await wait(100);
      await wait(400);
      const inst = () => [...foundry.applications.instances.values()];
      const closeAll = async () => { for (const x of inst()) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const hud = async re => { await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
        document.querySelector('#r-hud [data-act="pop"][data-pop*="mytherceria"]')?.click(); await wait(400);
        [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => re.test(x.textContent))?.click(); await wait(600); };
      const rollDlg = () => inst().find(x => x.constructor.name === "RollDialog");
      const at = () => canvas.tokens.get(tok(a).id).actor, mt = () => canvas.tokens.get(tok(m).id).actor;
      canvas.tokens.get(tok(a).id)?.control({ releaseOthers: true }); await wait(600);
      await hud(/Чепуха/);
      const out = { folderol: [at().powerEffects.some(x => x.power === "mytherceria:1"), !rollDlg()] };
      canvas.tokens.get(tok(m).id)?.setTarget(true, { releaseOthers: true }); await wait(300);
      const int0 = mt().system.attributes.intelligence.total;
      await hud(/Печать фей/);
      let rd = rollDlg();
      out.wardDiff = rd?.values.difficulty;
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 2, outcome: "success" });
      out.ward = [int0 - mt().system.attributes.intelligence.total, mt().effects.some(e => e.flags?.[sid]?.mind === "mytherceria|Chanjelin Ward" && e.flags[sid].until)];
      await hud(/Волшебная загадка/);
      rd = rollDlg();
      out.riddleDiff = rd?.values.difficulty;
      const n0 = game.messages.size;
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 2, outcome: "success" });
      const card = game.messages.contents.slice(n0).find(x => x.getFlag(sid, "riddleRoll"));
      out.held = [mt().statuses.has("r-held"), mt().effects.find(e => e.flags?.[sid]?.riddle)?.flags[sid].riddle.need];
      await closeAll();
      await TP.riddleRoll(card); await wait(500);
      let solve = rollDlg();
      out.solveRoll = [solve?.values.trait1, solve?.values.trait2, solve?.values.difficulty];
      await solve?.cfg.onRolled?.({ successes: 4, outcome: "success" }); await solve?.close();
      out.progress = mt().effects.find(e => e.flags?.[sid]?.riddle)?.flags[sid].riddle.got;
      await TP.riddleRoll(card); await wait(500);
      solve = rollDlg();
      await solve?.cfg.onRolled?.({ successes: 2, outcome: "success" }); await solve?.close();
      out.solved = [!mt().effects.some(e => e.flags?.[sid]?.riddle), !mt().statuses.has("r-held")];
      [...game.user.targets].forEach(x => x.setTarget(false, { releaseOthers: false }));
      canvas.tokens.releaseAll(); await wait(600);
      await scene.deleteEmbeddedDocuments("Token", made.map(x => x.id));
      await Actor.deleteDocuments([a.id, m.id]);
      return out;
    });
    const want = { folderol: [true, true], wardDiff: 5, ward: [2, true], riddleDiff: 3, held: [true, 6],
      solveRoll: ["attributes.wits", "abilities.occult", 8], progress: 4, solved: [true, true] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Бардо через HUD: Возрождение Человечности, Обелиск Осириса (−3 к мистическим), Парадокс (самая сильная Воля, +1 вредить)
  await check("Бардо через HUD", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs"), RD = await sys("module/dice/dialog.mjs"), CB = await sys("module/combat/combat.mjs");
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — дитя Осириса", "vampire", { generation: 9, blood: { value: 5 }, morality: { value: 6 }, willpower: { permanent: 6, temporary: 6 },
        virtues: { conscience: { value: 3 } } });
      const m1 = await mk("E2E — слушатель 1", "mortal", { willpower: { permanent: 3, temporary: 3 } });
      const m2 = await mk("E2E — слушатель 2", "mortal", { willpower: { permanent: 5, temporary: 5 } });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — bardo", type: "discipline", system: { key: "bardo", value: 5 } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([a, m1, m2].map((x, i) => x.getTokenDocument({ x: 100 + i * 200, y: 2900 }))));
      const tok = x => made.find(tk => tk.actorId === x.id);
      for (let i = 0; i < 30 && !canvas.tokens.get(tok(m2).id); i++) await wait(100);
      await wait(400);
      const inst = () => [...foundry.applications.instances.values()];
      const dialogs = () => inst().filter(x => x instanceof foundry.applications.api.DialogV2);
      const closeAll = async () => { for (const x of inst()) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const pick = async val => { const d = dialogs().at(-1); const opt = d?.element.querySelector(`.r-ask-opt[data-v="${val}"]`); if (opt) { opt.click(); await wait(500); return; } const s = d?.element.querySelector("select"); if (s) s.value = val;
        d?.element.querySelector('button[data-action="ok"]')?.click(); await wait(500); };
      const hud = async re => { await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
        document.querySelector('#r-hud [data-act="pop"][data-pop*="bardo"]')?.click(); await wait(400);
        [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => re.test(x.textContent))?.click(); await wait(700); };
      const rollDlg = () => inst().find(x => x.constructor.name === "RollDialog");
      const at = () => canvas.tokens.get(tok(a).id).actor;
      canvas.tokens.get(tok(a).id)?.control({ releaseOthers: true }); await wait(600);
      // Возрождение Человечности: вся кровь, Совесть, сложность 7
      await hud(/Возрождение Человечности/);
      let rd = rollDlg();
      const out = { hum: [rd?.values.trait1, rd?.values.difficulty, at().system.blood.value] };
      await rd?.cfg.onRolled?.({ successes: 1, outcome: "success" }); await closeAll();
      out.hum.push(at().system.morality.value);
      // Обелиск Осириса: место 5, 1 Воля, постоянная Воля; успех — сень Обелиска, −3 к мистическим
      const w0 = at().system.willpower.temporary;
      await hud(/Обелиск Осириса/); await pick("5");
      rd = rollDlg();
      out.pillar = [rd?.values.trait1, rd?.values.difficulty, w0 - at().system.willpower.temporary];
      await rd?.cfg.onRolled?.({ successes: 1, outcome: "success" }); await closeAll();
      const mystic = new RD.RollDialog(at(), { trait1: "attributes.dexterity", trait2: "abilities.occult", extra: { power: { disc: "bardo", level: 2 } } }).compute().diffAuto;
      const plain = new RD.RollDialog(at(), { trait1: "attributes.dexterity", trait2: "abilities.occult" }).compute().diffAuto;
      out.pillar.push(mystic.some(d => d.value === -3), !plain.some(d => d.value === -3));
      // Парадокс: двое слушателей, сложность — Воля 5
      canvas.tokens.get(tok(m1).id)?.setTarget(true, { releaseOthers: true });
      canvas.tokens.get(tok(m2).id)?.setTarget(true, { releaseOthers: false }); await wait(300);
      await hud(/Парадокс/);
      rd = rollDlg();
      out.paradox = rd?.values.difficulty;
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 1, outcome: "success" });
      const t1 = canvas.tokens.get(tok(m1).id).actor, t2 = canvas.tokens.get(tok(m2).id).actor;
      out.held = [t1.statuses.has("r-held"), t2.statuses.has("r-held")];
      await closeAll();
      // слушатель бьёт вампира — +1 к сложности
      const atk = new CB.AttackDialog(t1, {}); atk.v.foe = at().uuid;
      const base = new CB.AttackDialog(canvas.tokens.get(tok(a).id).actor, {}); base.v.foe = t1.uuid;
      out.harm = atk.compute().difficulty - base.compute().difficulty;
      [...game.user.targets].forEach(x => x.setTarget(false, { releaseOthers: false }));
      canvas.tokens.releaseAll(); await wait(600);
      await scene.deleteEmbeddedDocuments("Token", made.map(x => x.id));
      await Actor.deleteDocuments([a.id, m1.id, m2.id]);
      return out;
    });
    const want = { hum: ["virtues.conscience", 7, 0, 7], pillar: ["willpower.permanent", 5, 1, true, true], paradox: 5, held: [true, true], harm: 1 };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Валерен через HUD: Биение жизни, Обезболивающее касание (ходы без штрафа ран), Обжигающее касание, Броня гнева Каинова, Месть Самиэля
  await check("Валерен через HUD", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs"), RD = await sys("module/dice/dialog.mjs");
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — салюбри", "vampire", { generation: 9, blood: { value: 15 }, health: { lethal: 3 } });
      const m = await mk("E2E — пациент", "mortal", { health: { bashing: 2 } });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — valeren", type: "discipline", system: { key: "valeren", value: 5 } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([a, m].map((x, i) => x.getTokenDocument({ x: 100 + i * 200, y: 3100 }))));
      const tok = x => made.find(tk => tk.actorId === x.id);
      for (let i = 0; i < 30 && !canvas.tokens.get(tok(m).id); i++) await wait(100);
      await wait(400);
      const inst = () => [...foundry.applications.instances.values()];
      const dialogs = () => inst().filter(x => x instanceof foundry.applications.api.DialogV2);
      const closeAll = async () => { for (const x of inst()) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const pick = async val => { const d = dialogs().at(-1); const opt = d?.element.querySelector(`.r-ask-opt[data-v="${val}"]`); if (opt) { opt.click(); await wait(500); return; } const s = d?.element.querySelector("select"); if (s) s.value = val;
        d?.element.querySelector('button[data-action="ok"]')?.click(); await wait(500); };
      const hud = async re => { await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
        document.querySelector('#r-hud [data-act="pop"][data-pop*="valeren"]')?.click(); await wait(400);
        [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => re.test(x.textContent))?.click(); await wait(700); };
      const rollDlg = () => inst().find(x => x.constructor.name === "RollDialog");
      const at = () => canvas.tokens.get(tok(a).id).actor, mt = () => canvas.tokens.get(tok(m).id).actor;
      canvas.tokens.get(tok(a).id)?.control({ releaseOthers: true }); await wait(600);
      const out = {};
      // Биение жизни по пациенту: 3 успеха — природа, раны, кровь (шёпотом)
      canvas.tokens.get(tok(m).id)?.setTarget(true, { releaseOthers: true }); await wait(300);
      await hud(/Биение жизни/);
      const n0 = game.messages.size;
      await rollDlg()?.cfg.onRolled?.({ successes: 3, outcome: "success" });
      const vit = game.messages.contents.slice(n0).find(x => /Раны:/.test(x.content));
      out.vit = [!!vit, /Крови/.test(vit?.content ?? ""), !/Болезни/.test(vit?.content ?? "")];
      // Обжигающее касание: 2 крови — −4 куба к пулам цели
      await hud(/Обжигающее касание/); await pick("2");
      out.burn = TP.dreadDice(mt()).reduce((s, d) => s + d.value, 0);
      // Обезболивающее касание себе: 2 успеха — 2 хода без штрафа ран
      [...game.user.targets].forEach(x => x.setTarget(false, { releaseOthers: false })); await wait(300);
      const pen = at().system.health.penalty;
      await hud(/Обезболивающее касание/); await pick("pain");
      let rd = rollDlg();
      out.anestDiff = rd?.values.difficulty;
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 2, outcome: "success" });
      const dlg = new RD.RollDialog(at(), { trait1: "attributes.dexterity", trait2: "abilities.athletics" });
      out.pain = [pen < 0, !dlg.compute().breakdown.some(b => b.value === pen && /ран/i.test(b.label)), TP.painless(at())];
      await closeAll();
      // Броня гнева Каинова: 3 успеха — броня +3
      const arm0 = at().armor.rating;
      await hud(/Броня гнева Каинова/);
      await rollDlg()?.cfg.onRolled?.({ successes: 3, outcome: "success" });
      out.caine = at().armor.rating - arm0;
      await closeAll();
      // Месть Самиэля: 3 крови, эффект на следующую атаку
      const b0 = at().system.blood.value;
      await hud(/Месть Самиэля/);
      out.samiel = [b0 - at().system.blood.value, at().effects.some(e => e.flags?.[sid]?.samiel), !rollDlg()];
      canvas.tokens.releaseAll(); await wait(600);
      await scene.deleteEmbeddedDocuments("Token", made.map(x => x.id));
      await Actor.deleteDocuments([a.id, m.id]);
      return out;
    });
    const want = { vit: [true, true, true], burn: -4, anestDiff: 6, pain: [true, true, true], caine: 3, samiel: [3, true, true] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Висцератика через HUD: Шкура хамелеона (+5 к маскировке), Доспех Терры (прочность, раны), Слияние с камнем (×3, выброс),
  // Перемещение сквозь камень (сквозь стену — Сила + Мощь, сл. 8)
  await check("Висцератика через HUD", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const R = await sys("module/dice/roll.mjs");
      const a = await Actor.create({ name: "E2E — горгулья", type: "vampire", flags: { world: { e2e: true } },
        system: { generation: 10, blood: { value: 15 }, attributes: { stamina: { value: 3 } }, health: { bashing: 2 } } });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — visceratika", type: "discipline", system: { key: "visceratika", value: 5 } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const [ta] = await scene.createEmbeddedDocuments("Token", [await a.getTokenDocument({ x: 100, y: 3300 })]);
      for (let i = 0; i < 30 && !canvas.tokens.get(ta.id); i++) await wait(100);
      await wait(400);
      const inst = () => [...foundry.applications.instances.values()];
      const dialogs = () => inst().filter(x => x instanceof foundry.applications.api.DialogV2);
      const closeAll = async () => { for (const x of inst()) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const pick = async val => { const d = dialogs().at(-1); const opt = d?.element.querySelector(`.r-ask-opt[data-v="${val}"]`); if (opt) { opt.click(); await wait(500); return; } const s = d?.element.querySelector("select"); if (s) s.value = val;
        d?.element.querySelector('button[data-action="ok"]')?.click(); await wait(500); };
      const hud = async re => { await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
        document.querySelector('#r-hud [data-act="pop"][data-pop*="visceratika"]')?.click(); await wait(400);
        [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => re.test(x.textContent))?.click(); await wait(700); };
      const at = () => canvas.tokens.get(ta.id).actor;
      canvas.tokens.get(ta.id)?.control({ releaseOthers: true }); await wait(600);
      const out = {};
      await hud(/Шкура хамелеона/);
      out.skin = (at().system.fx?.dice?.stealth ?? []).reduce((s, d) => s + d.value, 0);
      const pen0 = at().system.health.penalty, bash0 = at().soakPool("bashing"), leth0 = at().soakPool("lethal");
      await hud(/Доспех Терры/);
      out.terra = [at().soakPool("bashing") - bash0, at().soakPool("lethal") - leth0, at().system.health.penalty - pen0];
      const pool1 = at().soakPool("lethal");
      await hud(/Слияние с камнем/);
      out.stone = at().soakPool("lethal") / pool1;
      // одна атака на 3 тяжёлых без прочности — выбрасывает из камня
      await R.soakAndApply(at(), 3, "lethal", { soak: false });
      out.eject = !at().system.fx?.stoneMeld;
      await hud(/Перемещение сквозь камень/); await pick("wall");
      const rd = inst().find(x => x.constructor.name === "RollDialog");
      out.wall = [rd?.values.difficulty, rd?.cfg.bloodCost, rd?.values.trait1];
      await closeAll();
      canvas.tokens.releaseAll(); await wait(500);
      await scene.deleteEmbeddedDocuments("Token", [ta.id]);
      await a.delete();
      return out;
    });
    const want = { skin: 5, terra: [2, 1, 1], stone: 3, eject: true, wall: [8, 1, "attributes.strength"] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Демонион через HUD: Запах греха (4 + Самоконтроль), Низменный страх (сопротивление Сородича), Всесожжение (губительные огнём),
  // Психомахия (бросок жертвы), Проклятие (тяжесть и срок; Хитрость +3; любая неудача — провал)
  await check("Демонион через HUD", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs"), RD = await sys("module/dice/dialog.mjs"), R = await sys("module/dice/roll.mjs");
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — баали", "vampire", { generation: 9, blood: { value: 15 }, willpower: { permanent: 7, temporary: 7 } });
      const m = await mk("E2E — грешник", "mortal", { willpower: { permanent: 4, temporary: 4 }, virtues: { selfControl: { value: 2 }, courage: { value: 3 } } });
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — daimoinon", type: "discipline", system: { key: "daimoinon", value: 5 } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([a, m].map((x, i) => x.getTokenDocument({ x: 100 + i * 200, y: 3500 }))));
      const tok = x => made.find(tk => tk.actorId === x.id);
      for (let i = 0; i < 30 && !canvas.tokens.get(tok(m).id); i++) await wait(100);
      await wait(400);
      const inst = () => [...foundry.applications.instances.values()];
      const dialogs = () => inst().filter(x => x instanceof foundry.applications.api.DialogV2);
      const closeAll = async () => { for (const x of inst()) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const pick = async val => { const d = dialogs().at(-1); const opt = d?.element.querySelector(`.r-ask-opt[data-v="${val}"]`); if (opt) { opt.click(); await wait(500); return; } const s = d?.element.querySelector("select"); if (s) s.value = val;
        d?.element.querySelector('button[data-action="ok"]')?.click(); await wait(500); };
      const hud = async re => { await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
        document.querySelector('#r-hud [data-act="pop"][data-pop*="daimoinon"]')?.click(); await wait(400);
        [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => re.test(x.textContent))?.click(); await wait(700); };
      const rollDlg = () => inst().find(x => x.constructor.name === "RollDialog");
      const mt = () => canvas.tokens.get(tok(m).id).actor;
      canvas.tokens.get(tok(a).id)?.control({ releaseOthers: true }); await wait(600);
      canvas.tokens.get(tok(m).id)?.setTarget(true, { releaseOthers: true }); await wait(300);
      const out = {};
      await hud(/Запах греха/);
      out.sin = rollDlg()?.values.difficulty;
      await hud(/Низменный страх/);
      let rd = rollDlg();
      out.voidDiff = rd?.values.difficulty;
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 2, outcome: "success" });
      out.void = mt().statuses.has("r-rotschreck");
      await hud(/Всесожжение/); await pick("2");
      rd = rollDlg();
      out.conflag = [rd?.cfg.bloodCost, rd?.values.difficulty];
      const n0 = game.messages.size;
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 1, outcome: "success" });
      const fd = game.messages.contents.slice(n0).find(x => x.getFlag(sid, "fixedDamage"))?.getFlag(sid, "fixedDamage");
      out.conflag.push(fd?.amount, fd?.type, !!fd?.fire);
      const n1 = game.messages.size;
      await hud(/Психомахия/);
      const pcard = game.messages.contents.slice(n1).find(x => x.getFlag(sid, "targetApply"));
      out.psycho = [!!pcard, !rollDlg()];
      await hud(/Проклятие/);
      rd = rollDlg();
      out.condemnDiff = rd?.values.difficulty;
      const ap = TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 2, outcome: "success" });
      await wait(500); await pick("1"); await ap;
      const sub = new RD.RollDialog(mt(), { trait1: "attributes.manipulation", trait2: "abilities.subterfuge" }).compute().diffAuto;
      out.condemn = [sub.some(d => d.value === 3), !!mt().effects.find(e => e.flags?.[sid]?.diffTraits)?.flags[sid].until];
      out.cursed = R.evaluate([2, 3, 4], { difficulty: 6, cursed: true }).outcome;
      await closeAll();
      [...game.user.targets].forEach(x => x.setTarget(false, { releaseOthers: false }));
      canvas.tokens.releaseAll(); await wait(600);
      await scene.deleteEmbeddedDocuments("Token", made.map(x => x.id));
      await Actor.deleteDocuments([a.id, m.id]);
      return out;
    });
    const want = { sin: 6, voidDiff: 7, void: true, conflag: [2, 6, 2, "aggravated", true], psycho: [true, true], condemnDiff: 4, condemn: [true, true], cursed: "botch" };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Кровные линии через HUD: Корпоре сано (кровь — рана), Алые узоры (раны, Ротшрек, кубы урона), Иссушение Земли (источник → запас
  // кубов в окне броска), Гниение (сл. Выносливость + Стойкость, Привлекательность −1), Ретроспектива (сл. Воля, транс),
  // Дар Клото (действия), Духовный голод (Воля), Мадригал (ансамбль снижает сложность)
  await check("Кровные линии через HUD", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs"), RD = await sys("module/dice/dialog.mjs");
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — кровная линия", "vampire", { generation: 9, blood: { value: 14 }, willpower: { permanent: 7, temporary: 3 }, health: { lethal: 2 } });
      const m = await mk("E2E — жертва линии", "mortal", { willpower: { permanent: 4, temporary: 4 }, attributes: { stamina: { value: 3 } } });
      await a.createEmbeddedDocuments("Item", ["obeah", "ogham", "thanatosis", "temporis", "spiritus", "melpominee"]
        .map(k => ({ name: `E2E — ${k}`, type: "discipline", system: { key: k, value: 5 } })));
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([a, m].map((x, i) => x.getTokenDocument({ x: 100 + i * 200, y: 3900 }))));
      const tok = x => made.find(tk => tk.actorId === x.id);
      for (let i = 0; i < 30 && !canvas.tokens.get(tok(m).id); i++) await wait(100);
      await wait(400);
      const inst = () => [...foundry.applications.instances.values()];
      const dialogs = () => inst().filter(x => x instanceof foundry.applications.api.DialogV2);
      const closeAll = async () => { for (const x of inst()) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const pick = async val => { const d = dialogs().at(-1); d?.element.querySelector(`.r-ask-opt[data-v="${val}"]`)?.click(); await wait(500); };
      const hud = async (disc, re) => { await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
        document.querySelector(`#r-hud [data-act="pop"][data-pop*="${disc}"]`)?.click(); await wait(400);
        [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => re.test(x.textContent))?.click(); await wait(700); };
      const rollDlg = () => inst().find(x => x.constructor.name === "RollDialog");
      const at = () => canvas.tokens.get(tok(a).id).actor, mt = () => canvas.tokens.get(tok(m).id).actor;
      canvas.tokens.get(tok(a).id)?.control({ releaseOthers: true }); await wait(600);
      const out = {};
      // без цели — на себя: одно тяжёлое за 1 кровь
      await hud("obeah", /Корпоре сано/); await wait(800);
      out.sano = [at().system.health.lethal, at().system.blood.value];
      await hud("ogham", /Алые узоры/);
      await rollDlg()?.cfg.onRolled?.({ successes: 2 }); await wait(600);
      const woad = at().effects.find(e => e.flags?.[sid]?.woadDice);
      out.woad = [woad?.flags[sid].woadDice, TP.frenzyDiff(at(), "rotschreck")[0]?.value, at().system.fx?.woundEase];
      await hud("ogham", /Иссушение Земли/); await pick("link"); await pick("3"); await wait(500);
      await hud("ogham", /Иссушение Земли/); await pick("draw");
      out.drainDiff = rollDlg()?.values.difficulty;
      await rollDlg()?.cfg.onRolled?.({ successes: 2 }); await wait(600);
      const pool = at().effects.find(e => e.flags?.[sid]?.drainPool);
      const rd0 = new RD.RollDialog(at(), { trait1: "attributes.strength" }), base = rd0.compute().pool;
      rd0.values.pools = { [pool?.id]: 3 };
      out.drain = [pool?.flags[sid].bonusPool, at().effects.find(e => e.flags?.[sid]?.drainSrc)?.flags[sid].drainSrc.left, rd0.compute().pool - base];
      await hud("temporis", /Дар Клото/);
      await rollDlg()?.cfg.onRolled?.({ successes: 2 }); await wait(600);
      out.clotho = at().powerEffects.find(e => e.power === "temporis:5")?.effect.flags[sid].clotho;
      await hud("spiritus", /Духовный голод/);
      await rollDlg()?.cfg.onRolled?.({ successes: 2 }); await wait(600);
      out.engling = at().system.willpower.temporary;
      await hud("melpominee", /Мадригал/); await pick("2"); await pick("joy");
      out.madrigal = rollDlg()?.values.difficulty;
      // на отмеченную цель
      canvas.tokens.get(tok(m).id)?.setTarget(true, { releaseOthers: true }); await wait(300);
      await hud("thanatosis", /Гниение/);
      let rd = rollDlg();
      out.putrefyDiff = rd?.values.difficulty;
      const n0 = game.messages.size;
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 1, outcome: "success" });
      out.putrefy = [mt().effects.find(e => e.flags?.[sid]?.attrMod)?.flags[sid].attrMod.appearance, game.messages.contents.slice(n0).some(x => x.getFlag(sid, "fixedDamage")?.type === "lethal")];
      await hud("temporis", /Ретроспектива/); await pick("plain");
      rd = rollDlg();
      out.recurDiff = rd?.values.difficulty;
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 2, outcome: "success" });
      out.recur = mt().statuses.has("r-held");
      await closeAll();
      [...game.user.targets].forEach(x => x.setTarget(false, { releaseOthers: false }));
      canvas.tokens.releaseAll(); await wait(600);
      await scene.deleteEmbeddedDocuments("Token", made.map(x => x.id));
      await Actor.deleteDocuments([a.id, m.id]);
      return out;
    });
    const want = { sano: [1, 13], woad: [2, -2, 2], drainDiff: 7, drain: [4, 26, 3], clotho: 2, engling: 5, madrigal: 5, putrefyDiff: 3, putrefy: [-1, true], recurDiff: 4, recur: true };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Хвосты кровных линий: Виртуозность (кровь за пятёрки слушателей → Незримый собеседник), Октопод (кровь за части, эффекты у обоих),
  // Кровное единство (3 крови с каждого, правит старший по крови, поколение от младшего, +кубы; повтор — распад), жетон Тотемного зверя
  await check("Кровные линии: Виртуозность, Октопод, Кровное единство, жетон зверя", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs"), RD = await sys("module/dice/dialog.mjs");
      const mk = (name, gen, system = {}) => Actor.create({ name, type: "vampire", flags: { world: { e2e: true } }, system: { generation: gen, blood: { value: 10 }, ...system } });
      const a = await mk("E2E — сирена круга", 9, { attributes: { stamina: { value: 3 } }, abilities: { performance: { value: 3 } } });
      const b = await mk("E2E — брат круга", 11);
      await a.createEmbeddedDocuments("Item", ["melpominee", "sanguinus", "spiritus"].map(k => ({ name: `E2E — ${k}`, type: "discipline", system: { key: k, value: 5 } })));
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([a, b].map((x, i) => x.getTokenDocument({ x: 100 + i * 200, y: 4100 }))));
      const tok = x => made.find(tk => tk.actorId === x.id);
      for (let i = 0; i < 30 && !canvas.tokens.get(tok(b).id); i++) await wait(100);
      await wait(400);
      const inst = () => [...foundry.applications.instances.values()];
      const dialogs = () => inst().filter(x => x instanceof foundry.applications.api.DialogV2);
      const closeAll = async () => { for (const x of inst()) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const pick = async val => { dialogs().at(-1)?.element.querySelector(`.r-ask-opt[data-v="${val}"]`)?.click(); await wait(500); };
      const ok = async fill => { const d = dialogs().at(-1); if (d && fill) fill(d.element); d?.element.querySelector('button[data-action="ok"]')?.click(); await wait(700); };
      const hud = async (disc, re) => { await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
        document.querySelector(`#r-hud [data-act="pop"][data-pop*="${disc}"]`)?.click(); await wait(400);
        [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => re.test(x.textContent))?.click(); await wait(700); };
      const rollDlg = () => inst().find(x => x.constructor.name === "RollDialog");
      const at = () => canvas.tokens.get(tok(a).id).actor, bt = () => canvas.tokens.get(tok(b).id).actor;
      canvas.tokens.get(tok(a).id)?.control({ releaseOthers: true }); await wait(600);
      const out = {};
      // Виртуозность без отмеченных: 6 слушателей — 1 кровь сверху, дальше окно Незримого собеседника (своя 1 кровь)
      let b0 = at().system.blood.value;
      await hud("melpominee", /Виртуозность/); await pick("phantom"); await pick("6");
      out.virt = [b0 - at().system.blood.value, rollDlg()?.cfg.bloodCost, rollDlg()?.cfg.title];
      // Октопод: две руки брату
      canvas.tokens.get(tok(b).id)?.setTarget(true, { releaseOthers: true }); await wait(300);
      b0 = at().system.blood.value;
      await hud("sanguinus", /Октопод/);
      await ok(el => { el.querySelector('input[name="arm"]').value = 2; }); await wait(600);
      out.octo = [b0 - at().system.blood.value, !!at().effects.find(e => e.flags?.[sid]?.octoTo), bt().effects.some(e => /Октопод/.test(e.name))];
      // Кровное единство: по 3 крови, правит 9-е поколение, чудовище — 11 − 1 = 10-е
      b0 = [at().system.blood.value, bt().system.blood.value];
      const base = new RD.RollDialog(at(), { trait1: "attributes.strength" }).compute().pool;
      await hud("sanguinus", /Кровное единство/); await wait(800);
      out.entity = [b0[0] - at().system.blood.value, b0[1] - bt().system.blood.value, at().system.effectiveGeneration, bt().statuses.has("r-held"),
        new RD.RollDialog(at(), { trait1: "attributes.strength" }).compute().pool - base];
      await hud("sanguinus", /Кровное единство/); await wait(1200);
      out.entityEnd = [at().powerEffects.some(e => e.power === "sanguinus:5"), bt().statuses.has("r-held")];
      // Тотемный зверь: кнопка на карточке ставит жетон
      [...game.user.targets].forEach(x => x.setTarget(false, { releaseOthers: false }));
      await hud("spiritus", /Призыв тотемного зверя/);
      const rd = rollDlg(), n0 = scene.tokens.size;
      const ap = TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: rd?.cfg.extra }, { successes: 3, outcome: "success" });
      await wait(900); await ok(); await ap; await wait(600);
      out.beast = scene.tokens.size - n0;
      const spirits = game.actors.filter(x => x.name.includes("E2E — сирена круга)"));
      await closeAll();
      canvas.tokens.releaseAll(); await wait(600);
      await scene.deleteEmbeddedDocuments("Token", scene.tokens.filter(tk => made.some(m => m.id === tk.id) || spirits.some(sp => sp.id === tk.actorId)).map(tk => tk.id));
      await Actor.deleteDocuments([a.id, b.id, ...spirits.map(x => x.id)]);
      return out;
    });
    const want = { octo: [2, true, true], entity: [3, 3, 10, true, 2], entityEnd: [false, false], beast: 1 };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (r.virt?.[0] !== 1 || r.virt?.[1] !== 1) bad.push("virt");
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k] ?? [1, 1])}`).join("; "));
  });

  // Ход боя других линеек: заявка «сила» называется по линейке (Дар, Знание, Грань); Гару объявляет Ярость на действия в заявке —
  // они встают в фазу дополнительных действий после обычных; перебор сверх Ловкости и Смекалки — +3 к сложностям
  await check("Ход боя: Гару, падший и охотник — заявки и действия за Ярость", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const T = await sys("module/combat/turn.mjs"), RD = await sys("module/dice/dialog.mjs"), WW = await sys("module/apps/werewolf.mjs");
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const w = await mk("E2E — Гару боя", "werewolf", { attributes: { dexterity: { value: 2 }, wits: { value: 2 } }, werewolf: { rage: { permanent: 6, value: 5 } } });
      const d = await mk("E2E — падший боя", "demon"), h = await mk("E2E — охотник боя", "hunter");
      const actors = [w, d, h];
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const toks = await scene.createEmbeddedDocuments("Token", await Promise.all(actors.map((a, i) => a.getTokenDocument({ x: 100 + i * 200, y: 4300 }))));
      await wait(600);
      for (const c of game.combats.filter(c => c.scene?.id === scene.id && !c.started)) await c.delete();
      const combat = await getDocumentClass("Combat").create({ scene: scene.id, active: true });
      await combat.createEmbeddedDocuments("Combatant", toks.map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId })));
      await combat.startCombat(); await wait(1500);
      const act = a => combat.combatants.find(c => c.actorId === a.id).actor;
      const dlg = () => [...foundry.applications.instances.values()].filter(x => x instanceof foundry.applications.api.DialogV2).at(-1);
      const out = { init: combat.turns.every(c => Number.isFinite(c.initiative)), phase: T.phaseOf(combat)?.phase };
      const label = async a => { const pr = T.openDeclare(act(a), combat); await wait(600);
        const txt = dlg()?.element.querySelector('.r-decl-kind input[value="power"]')?.closest("label").querySelector("b")?.textContent; await dlg()?.close(); await pr; return txt; };
      out.labels = [await label(d), await label(h)];
      // Гару: заявка с двумя действиями за Ярость
      const pr = T.openDeclare(act(w), combat); await wait(600);
      const el = dlg().element;
      out.labels.push(el.querySelector('.r-decl-kind input[value="power"]')?.closest("label").querySelector("b")?.textContent);
      for (let i = 0; i < 2; i++) el.querySelector('.r-decl-rage button[data-d="1"]').click();
      el.querySelector('button[data-action="ok"]').click(); await pr; await wait(600);
      const flag = () => act(w).getFlag(sid, "celerity");
      out.rage = [act(w).system.werewolf.rage.value, flag()?.n, !!flag()?.rage, !!flag()?.fast, T.declarationOf(act(w))?.kind];
      // третье действие — сверх меньшего из Ловкости и Смекалки (2): +3 к сложностям; больше взять нельзя (половина постоянной Ярости)
      await WW.spendRageActions(act(w), 1); await wait(500);
      out.fast = [flag()?.n, new RD.RollDialog(act(w), { trait1: "attributes.strength" }).compute().diffAuto.some(x => x.value === 3), WW.rageActionsCap(act(w))];
      // конец хода: вместо следующего — фаза дополнительных действий с Гару в очереди
      await combat.nextRound(); await wait(1500);
      const ph = () => combat.getFlag(sid, "celerityPhase");
      out.queue = [!!ph()?.active, ph()?.queue?.[0]?.actorUuid === act(w).uuid, ph()?.queue?.[0]?.remaining, combat.round];
      for (let i = 0; i < 3; i++) { await act(w).consumeCelerityAction(); await wait(700); }
      await wait(1200);
      out.after = [combat.round, !!ph()?.active];
      await combat.delete();
      await scene.deleteEmbeddedDocuments("Token", toks.map(t => t.id));
      await Actor.deleteDocuments(actors.map(a => a.id));
      return out;
    });
    const want = { init: true, phase: "declare", labels: ["Знание", "Грань", "Дар"], rage: [3, 2, true, false, "attack"], fast: [3, true, 0], queue: [true, true, 3, 1], after: [2, false] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Итоги ночи: «Ночь» делает снимок; сводка показывает, что изменилось (кровь, Воля, раны) и действующие эффекты
  await check("Итоги ночи: снимок и сводка", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms));
      const N = await import(`/systems/${sid}/module/apps/night.mjs`);
      const player = game.users.find(u => !u.isGM);
      const a = await Actor.create({ name: "E2E — итоги ночи", type: "vampire", flags: { world: { e2e: true } }, ownership: player ? { [player.id]: 3 } : {},
        system: { generation: 10, blood: { value: 10 }, willpower: { permanent: 5, temporary: 5 } } });
      const before = game.settings.get(sid, "nightSnapshot");
      await game.settings.set(sid, "nightSnapshot", { at: Date.now(), actors: { [a.id]: { blood: 10, will: 5, rage: null, gnosis: null, faith: null, torment: null, conviction: null, b: 0, l: 0, a: 0 } } });
      await a.update({ "system.blood.value": 6, "system.willpower.temporary": 4, "system.health.lethal": 2 });
      await a.createEmbeddedDocuments("ActiveEffect", [{ name: "E2E — эффект ночи" }]);
      const n0 = game.messages.size;
      await N.nightSummary(); await wait(500);
      const card = game.messages.contents.slice(n0).find(m => /r-night-sum/.test(m.content));
      const html = card?.content ?? "", li = (html.match(/<li>[\s\S]*?<\/li>/g) ?? []).find(x => x.includes("E2E — итоги ночи")) ?? "";
      const out = { has: player ? !!li : true, blood: !player || /10 → <b>6<\/b>/.test(li), will: !player || /5 → <b>4<\/b>/.test(li),
        hurt: !player || /\+2/.test(li), fx: !player || li.includes("E2E — эффект ночи") };
      await card?.delete();
      await game.settings.set(sid, "nightSnapshot", before ?? {});
      await a.delete();
      return out;
    });
    const bad = Object.entries(r).filter(([, v]) => v !== true).map(([k]) => k);
    if (bad.length) throw new Error(`нет в сводке: ${bad.join(", ")}`);
  });

  // Ход боя V20: инициатива каждый ход (карточка), заявки от низшей к высшей, выжидание — в конец хода,
  // множественные действия делят пул в окнах, защита без заявки — отмена действия (Воля)
  await check("Ход боя: инициатива, заявки, выжидание, отмена ради защиты", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const T = await sys("module/combat/turn.mjs"), RD = await sys("module/dice/dialog.mjs"), CB = await sys("module/combat/combat.mjs");
      const mk = (name, dex, wits) => Actor.create({ name, type: "vampire", flags: { world: { e2e: true } },
        system: { generation: 10, blood: { value: 10 }, willpower: { permanent: 4, temporary: 4 }, attributes: { dexterity: { value: dex }, wits: { value: wits } } } });
      const actors = [await mk("E2E — боец A", 4, 3), await mk("E2E — боец B", 2, 2), await mk("E2E — боец C", 1, 1)];
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const toks = await scene.createEmbeddedDocuments("Token", await Promise.all(actors.map((a, i) => a.getTokenDocument({ x: 100 + i * 200, y: 3700 }))));
      await wait(600);
      for (const c of game.combats.filter(c => c.scene?.id === scene.id && !c.started)) await c.delete();
      const combat = await getDocumentClass("Combat").create({ scene: scene.id, active: true });
      await combat.createEmbeddedDocuments("Combatant", toks.map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId })));
      const n0 = game.messages.size;
      await combat.startCombat(); await wait(1500);
      const act = name => combat.combatants.find(c => c.name === name).actor;
      const out = { cls: combat.constructor.name, init: combat.turns.every(c => Number.isFinite(c.initiative)),
        card: game.messages.contents.slice(n0).some(m => /r-turn-card/.test(m.content)), phase: T.phaseOf(combat)?.phase };
      // заявляет низшая инициатива (боец C почти наверняка: 1+1)
      const lowFirst = [...combat.turns].reverse()[0].name;
      out.first = T.currentDeclarer(combat)?.name === lowFirst;
      const declare = (n, d) => act(n).setFlag(sid, "declared", { combat: combat.id, round: combat.round, ...d });
      await declare("E2E — боец C", { kind: "delay" }); await wait(300);
      await declare("E2E — боец B", { kind: "multi", actions: 3 }); await wait(300);
      out.multi = [new RD.RollDialog(act("E2E — боец B"), { trait1: "attributes.dexterity" }).values.actions, new CB.AttackDialog(act("E2E — боец B"), {}).v.actions];
      await declare("E2E — боец A", { kind: "attack" }); await wait(1500);
      out.act = T.phaseOf(combat)?.phase;
      out.delayLast = combat.turns.at(-1).name;
      // боец A заявил атаку — защита только через отмену: 1 Воля
      const pr = T.abortForDefense(act("E2E — боец A")); await wait(600);
      [...foundry.applications.instances.values()].find(x => x instanceof foundry.applications.api.DialogV2)?.element.querySelector('button[data-action="spend"]')?.click();
      out.abort = [await pr, act("E2E — боец A").system.willpower.temporary, T.declarationOf(act("E2E — боец A"))?.kind];
      // следующий ход: инициатива заново, снова заявки
      await combat.nextRound(); await wait(1500);
      out.next = [combat.round, T.phaseOf(combat)?.phase, T.phaseOf(combat)?.round];
      await combat.delete();
      await scene.deleteEmbeddedDocuments("Token", toks.map(t => t.id));
      await Actor.deleteDocuments(actors.map(a => a.id));
      return out;
    });
    const want = { cls: "VtmCombat", init: true, card: true, phase: "declare", first: true, multi: [3, 3], act: "act", delayLast: "E2E — боец C",
      abort: [true, 3, "defense"], next: [2, "declare", 2] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Удобство боя: противники рядом, дальность по жетонам, клинч между ходами, лечение кровью в бою, Ротшрек от огня,
  // сводка хода, «выбыл» сам, заявки статистов разом
  await check("Бой: толпа, дальность, клинч, лечение, Ротшрек, сводка, статисты", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const CB = await sys("module/combat/combat.mjs"), R = await sys("module/dice/roll.mjs"), T = await sys("module/combat/turn.mjs");
      const mk = (name, extra = {}) => Actor.create({ name, type: "vampire", flags: { world: { e2e: true } },
        system: { generation: 10, blood: { value: 10 }, willpower: { permanent: 4, temporary: 4 }, attributes: { strength: { value: 2 }, stamina: { value: 2 } }, ...extra } });
      const hero = await mk("E2E — герой"), f1 = await mk("E2E — громила 1"), f2 = await mk("E2E — громила 2"), f3 = await mk("E2E — громила 3");
      await hero.createEmbeddedDocuments("Item", [{ name: "E2E — револьвер", type: "weapon", system: { kind: "firearms", damage: 4, damageType: "lethal", difficulty: 6, range: "12", equipped: true } }]);
      const scene = game.scenes.viewed ?? game.scenes.contents[0], g = canvas.grid.size, X = 300, Y = 3900;
      const at = (a, dx, dy, disp) => a.getTokenDocument({ x: X + dx * g, y: Y + dy * g, disposition: disp });
      const H = CONST.TOKEN_DISPOSITIONS;
      const toks = await scene.createEmbeddedDocuments("Token", [await at(hero, 0, 0, H.FRIENDLY), await at(f1, 1, 0, H.HOSTILE), await at(f2, 0, 1, H.HOSTILE), await at(f3, 20, 0, H.HOSTILE)]);
      await wait(800);
      const tk = a => canvas.tokens.placeables.find(t => t.document.actorId === a.id);
      const A = a => tk(a).actor;
      const out = {};
      // двое рядом — +1 к сложности в ближнем бою
      const atk = new CB.AttackDialog(A(hero), {});
      out.crowd = [CB.crowdAround(A(hero)), atk.v.foes];
      // револьвер по дальнему (~20 клеток): дальность по расстоянию
      const gun = A(hero).items.find(i => i.type === "weapon");
      const far = new CB.AttackDialog(A(hero), { weapon: gun.id }); far.v.foe = A(f3).uuid;
      far.compute();
      out.range = far.v.range;
      // клинч: эффекты на обоих, «Вырваться»
      await CB.setGrapple(A(hero), A(f1), "clinch");
      out.clinch = [CB.grapplesOf(A(hero))[0]?.role, CB.grapplesOf(A(f1))[0]?.role];
      // бой: начало — инициатива; следующий ход — клинч бьёт, сводка
      const combat = await getDocumentClass("Combat").create({ scene: scene.id, active: true });
      await combat.createEmbeddedDocuments("Combatant", toks.map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId })));
      await combat.startCombat(); await wait(1500);
      // статисты разом: все не-игровые — атака
      const pd = T.declareNpcs(combat); await wait(700);
      const dlg = [...foundry.applications.instances.values()].find(x => x.element?.classList.contains("r-declare-dialog"));
      dlg?.element.querySelector('button[data-action="ok"]')?.click(); await pd; await wait(1500);
      out.npcs = combat.combatants.filter(c => T.declarationOf(c.actor, combat)?.kind === "attack").length;
      out.phase = T.phaseOf(combat)?.phase;
      await A(f2).applyDamage(2, "lethal");
      const n0 = game.messages.size;
      await combat.nextRound(); await wait(2500);
      const msgs = game.messages.contents.slice(n0);
      out.tick = msgs.filter(m => /Клинч/.test(m.content ?? "") || /Клинч/.test(m.flavor ?? "")).length >= 2 || msgs.filter(m => m.flags?.[sid]?.roll?.extra?.damage).length >= 2;
      out.summary = msgs.some(m => /Итог хода 1/.test(m.content));
      // лечение в бою: окно выбора, «весь ход лечусь»
      await A(hero).update({ "system.health.lethal": 1 });
      const ph = A(hero).bloodHeal("lethal"); await wait(700);
      const hd = [...foundry.applications.instances.values()].find(x => x instanceof foundry.applications.api.DialogV2 && /Лечение кровью/.test(x.title));
      hd?.element.querySelector('button[data-action="focus"]')?.click(); await ph;
      out.heal = [!!hd, A(hero).system.health.lethal];
      // огонь по вампиру — предложение Ротшрека (сл. 8)
      const n1 = game.messages.size;
      await R.soakAndApply(A(f1), 1, "aggravated", { soak: false, fire: true });
      out.fear = game.messages.contents.slice(n1).find(m => m.flags?.[sid]?.checkPrompt)?.flags[sid].checkPrompt.difficulty;
      // торпор — выбыл сам
      await A(f2).toggleStatusEffect("r-torpor", { active: true }); await wait(800);
      out.defeated = combat.combatants.find(c => c.actorId === f2.id)?.defeated;
      // вырваться из клинча (исход случаен — проверяем, что бросок прошёл)
      const n2 = game.messages.size;
      await CB.breakGrapple(A(f1));
      out.broke = game.messages.contents.slice(n2).some(m => /вырыва|не вырвался/.test(m.content));
      await combat.delete(); await wait(600);
      out.cleared = !CB.grapplesOf(A(hero)).length;
      await scene.deleteEmbeddedDocuments("Token", toks.map(t => t.id));
      await Actor.deleteDocuments([hero.id, f1.id, f2.id, f3.id]);
      return out;
    });
    const want = { crowd: [1, 1], range: "long", clinch: ["holder", "held"], npcs: 4, phase: "act", tick: true, summary: true,
      heal: [true, 0], fear: 8, defeated: true, broke: true, cleared: true };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Подсказки: «?» на плашке открывает окно; разделы, переход по разделу, поиск по всем
  await check("Подсказки: окно, разделы, поиск", async () => {
    const r = await page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      document.querySelector("[data-np-help]")?.click(); await wait(800);
      const el = () => document.querySelector("#r-help");
      const out = { open: !!el(), tabs: el()?.querySelectorAll("[data-sec]").length, items: el()?.querySelectorAll(".r-help-list li").length };
      el()?.querySelector('[data-sec="turn"]')?.click(); await wait(500);
      out.turn = /Ход боя/.test(el()?.querySelector(".r-help-head b")?.textContent ?? "");
      const q = el()?.querySelector('[name="q"]'); if (q) { q.value = "клинч"; q.dispatchEvent(new Event("input", { bubbles: true })); }
      await wait(700);
      out.found = el()?.querySelectorAll(".r-help-list li").length > 0 && /клинч/i.test(el()?.querySelector(".r-help-list")?.textContent ?? "");
      out.keys = !/VTM20\.Help\./.test(el()?.textContent ?? "");
      await [...foundry.applications.instances.values()].find(x => x.id === "r-help")?.close();
      return out;
    });
    const want = { open: true, tabs: 8, items: 6, turn: true, found: true, keys: true };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Помешательство через HUD: Око хаоса — сложность по задаче, Голос безумия — смертный сразу, вампир — проверка +2;
  // Метаморфозы: в облике тумана силы со взглядом недоступны
  await check("Помешательство через HUD и туман без взгляда", async () => {
    const r = await page.evaluate(async () => {
      const sys = p => import(`/systems/${game.system.id}/${p}`);
      const TP = await sys("module/apps/target-powers.mjs"), { rollPowerRef } = await sys("module/sheets/actor-sheet.mjs");
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms));
      const mk = (name, type, system = {}) => Actor.create({ name, type, flags: { world: { e2e: true } }, system });
      const a = await mk("E2E — малкавианин", "vampire", { generation: 8, blood: { value: 15 } });
      const m = await mk("E2E — слушатель", "mortal");
      const v = await mk("E2E — слушатель-сородич", "vampire", { generation: 12 });
      await a.createEmbeddedDocuments("Item", [["dementation", 5], ["protean", 5], ["dominate", 1]].map(([key, value]) => ({ name: `E2E — ${key}`, type: "discipline", system: { key, value } })));
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([a, m, v].map((x, i) => x.getTokenDocument({ x: 100 + i * 200, y: 1700 }))));
      const tok = x => made.find(tk => tk.actorId === x.id);
      for (let i = 0; i < 30 && !canvas.tokens.get(tok(v).id); i++) await wait(100);
      await wait(400);
      const inst = () => [...foundry.applications.instances.values()];
      const closeAll = async () => { for (const x of inst()) if (x.constructor.name === "RollDialog" || x instanceof foundry.applications.api.DialogV2) await x.close(); };
      const answer = async val => { let d = null; for (let i = 0; i < 30 && !d; i++) { await wait(100); d = inst().find(x => x instanceof foundry.applications.api.DialogV2); }
        const opt = d?.element.querySelector(`.r-ask-opt[data-v="${val}"]`); if (opt) { opt.click(); await wait(500); return; } const s = d?.element.querySelector("select"); if (s) s.value = val; d?.element.querySelector('button[data-action="ok"]')?.click(); await wait(500); };
      const hudPower = async re => { await closeAll(); document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
        document.querySelector('#r-hud [data-act="pop"][data-pop*="dementation"]')?.click(); await wait(400);
        [...document.querySelectorAll('#r-hud .rh-pop-row[data-act="power"]')].find(x => re.test(x.textContent))?.click(); };
      const out = {};
      canvas.tokens.get(tok(a).id)?.control({ releaseOthers: true }); await wait(600);
      // Око хаоса: «близкий друг» — сложность 6
      await hudPower(/Око хаоса/); await answer("6");
      out.chaos = inst().find(x => x.constructor.name === "RollDialog")?.values.difficulty;
      // Голос безумия: оба отмечены, ярость; 2 успеха — смертный в ярости, сородичу — проверка сл. 8
      canvas.tokens.get(tok(m).id)?.setTarget(true, { releaseOthers: true });
      canvas.tokens.get(tok(v).id)?.setTarget(true, { releaseOthers: false }); await wait(300);
      await hudPower(/Голос безумия/); await answer("frenzy");
      const rd = inst().find(x => x.constructor.name === "RollDialog");
      const link = rd?.cfg.extra?.targetPower;
      out.voice = [rd?.values.difficulty, link?.crowd?.length, link?.mode];
      await closeAll();
      const n0 = game.messages.size;
      await TP.applyTargetPower({ isOwner: false }, { actorUuid: a.uuid, extra: { targetPower: link } }, { successes: 2, outcome: "success" });
      const prompt = game.messages.contents.slice(n0).find(x => x.getFlag(sid, "checkPrompt"));
      out.voiceHit = [canvas.tokens.get(tok(m).id).actor.statuses.has("r-frenzy"), prompt?.getFlag(sid, "checkPrompt")?.difficulty];
      // туман: Доминирование (взгляд) — окна нет
      await a.startPower("protean:5", { blood: 3 });
      canvas.tokens.get(tok(m).id)?.setTarget(true, { releaseOthers: true }); await wait(300);
      await rollPowerRef(a, `dominate|${game.vtm20Codex.discipline("dominate").powers.findIndex(p => p.en === "Command")}`); await wait(500);
      out.mistEyes = !inst().some(x => x.constructor.name === "RollDialog");
      await closeAll();
      // «Всё равно»: рассказчик разрешил — окно броска есть, в чате пометка об обходе
      globalThis.__e2eGate = "yes";
      const ng = game.messages.size;
      await rollPowerRef(a, `dominate|${game.vtm20Codex.discipline("dominate").powers.findIndex(p => p.en === "Command")}`); await wait(500);
      out.mistAnyway = [inst().some(x => x.constructor.name === "RollDialog"), game.messages.contents.slice(ng).some(x => /обходит правило/.test(x.content))];
      await closeAll();
      // без цели: простой бросок без автоматики
      [...game.user.targets].forEach(x => x.setTarget(false, { releaseOthers: false })); await wait(300);
      await rollPowerRef(a, `dominate|${game.vtm20Codex.discipline("dominate").powers.findIndex(p => p.en === "Command")}`); await wait(500);
      const plain = inst().find(x => x.constructor.name === "RollDialog");
      out.plain = [!!plain, !plain?.cfg.extra?.targetPower];
      globalThis.__e2eGate = "no";
      await closeAll();
      [...game.user.targets].forEach(x => x.setTarget(false, { releaseOthers: false }));
      canvas.tokens.releaseAll();
      await wait(800);
      await scene.deleteEmbeddedDocuments("Token", made.map(x => x.id));
      await Actor.deleteDocuments([a.id, m.id, v.id]);
      return out;
    });
    const want = { chaos: 6, voice: [7, 2, "frenzy"], voiceHit: [true, 8], mistEyes: true, mistAnyway: [true, true], plain: [true, true] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Гуль-слуга: галочка на листе, не игровой персонаж, половина опыта домитора (остаток копится)
  await check("Гуль-слуга: не игровой, половина опыта домитора", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms));
      const player = game.users.find(u => !u.isGM);
      const own = player ? { default: 0, [player.id]: 3 } : { default: 0 };
      const mk = (name, type, system = {}) => Actor.create({ name, type, ownership: own, flags: { world: { e2e: true }, [sid]: { created: true } }, system });
      const v = await mk("E2E — хозяин", "vampire");
      const g = await mk("E2E — слуга", "ghoul", { domitor: "E2E — хозяин", retainer: true });
      const free = await mk("E2E — вольный гуль", "ghoul", { domitor: "E2E — хозяин" });
      const out = { player: !!player };
      await g.sheet.render({ force: true }); await wait(800);
      out.checkbox = !!g.sheet.element.querySelector('input[name="system.retainer"]')?.checked;
      await g.sheet.close();
      out.pc = [v.isPlayerCharacter, g.isPlayerCharacter, free.isPlayerCharacter];
      out.retainers = v.retainers.map(x => x.name);
      const xp = () => g.system.experience.total;
      const x0 = xp();
      await v.shareXpWithRetainers(3);
      const x1 = xp();
      await v.shareXpWithRetainers(3);
      out.share = [x1 - x0, xp() - x0, free.system.experience.total];
      // окно опыта: начисление домитору — слуге половина
      const { openXp } = await import(`/systems/${sid}/module/apps/xp.mjs`);
      const app = await openXp(v); await wait(800);
      const f = app?.element?.querySelector(".r-xw-grant");
      if (f) { f.querySelector("[name=amount]").value = "4"; f.querySelector("[name=reason]").value = "E2E"; f.querySelector('[data-action="grant"]')?.click(); }
      for (let i = 0; i < 30 && xp() - x0 < 5; i++) await wait(100);
      out.window = xp() - x0;
      await app?.close();
      await Actor.deleteDocuments([v.id, g.id, free.id]);
      return out;
    });
    const want = { player: true, checkbox: true, pc: [true, false, true], retainers: ["E2E — слуга"], share: [1, 3, 0], window: 5 };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Кошелёк (ливры): монеты лежат как внесены — без самовольного размена; трата — сперва мелочь, сдача — по нужде
  await check("Кошелёк: ливры, су и денье без авторазмена", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms));
      const M = await import(`/systems/${sid}/module/data/money.mjs`);
      const a = await Actor.create({ name: "E2E — кошелёк", type: "vampire", flags: { world: { e2e: true } }, system: { money: { currency: "livre" } } });
      const coins = () => { const c = a.system.money.coins; return [c.l, c.s, c.d]; };
      // окно: прибавить 30 су — так и лежат 30 су, не «1 ливр 10 су»
      const use = async (op, l, s, d) => {
        const p = M.openMoney(a);
        let dlg = null; for (let i = 0; i < 30 && !dlg; i++) { await wait(100); dlg = [...foundry.applications.instances.values()].find(x => x.element?.classList.contains("r-money-dialog")); }
        const f = dlg?.element.querySelector("form") ?? dlg?.element;
        f.querySelector(`input[name="op"][value="${op}"]`).checked = true;
        for (const [k, v] of [["l", l], ["s", s], ["d", d]]) if (v != null) f.querySelector(`input[name="${k}"]`).value = String(v);
        dlg.element.querySelector('button[data-action="apply"]').click();
        await p; await wait(300);
      };
      const out = {};
      await use("1", null, 30, null);
      out.add = [coins(), a.system.money.amount];
      // отнять 5 денье: денье нет — разменяет один су: 29 су 7 денье
      await use("-1", null, null, 5);
      out.pay = coins();
      // доход 2,5 ливра (как от Ресурсов) — ложится монетами: +2 л. +10 с.
      await M.changeMoney(a, 2.5);
      out.income = coins();
      // задать ровно: 1 л. 0 с. 0 д.
      await use("0", 1, 0, 0);
      out.set = [coins(), a.system.money.amount];
      // не хватает — отказ
      out.short = await M.changeMoney(a, -5);
      await a.delete();
      return out;
    });
    const want = { add: [[0, 30, 0], 1.5], pay: [0, 29, 7], income: [2, 39, 7], set: [[1, 0, 0], 1], short: false };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Метаморфозы 3, 5 и Модифицированный Облик Зверя (2.7.0): Слияние с землёй (солнце не вредит, угроза будит),
  // Туманная форма (обычный урон не проходит, огонь — да; атаковать нельзя), две формы Гангрела из Clanbook
  await check("Метаморфозы: туман, Слияние с землёй, Модифицированный Облик", async () => {
    const r = await page.evaluate(async () => {
      const sys = p => import(`/systems/${game.system.id}/${p}`);
      const { soakAndApply } = await sys("module/dice/roll.mjs");
      const { openAttack } = await sys("module/combat/combat.mjs");
      const { togglePowerEffect } = await sys("module/apps/power-effects.mjs");
      const mk = (name, clan) => Actor.create({ name, type: "vampire", flags: { world: { e2e: true } },
        system: { generation: 8, clan, attributes: { strength: { value: 2 }, dexterity: { value: 2 }, stamina: { value: 2 } }, blood: { value: 10 } } });
      const a = await mk("E2E — туман и земля", "nosferatu");
      await a.createEmbeddedDocuments("Item", [{ name: "E2E — protean", type: "discipline", system: { key: "protean", value: 5 } },
        { name: "E2E — броня", type: "armor", system: { rating: 2, penalty: 0, equipped: true } }]);
      const out = {}, hp = () => [a.system.health.bashing, a.system.health.lethal, a.system.health.aggravated].join("/");
      // Слияние с землёй: другие силы недоступны, солнце не вредит, иной урон будит
      await a.startPower("protean:3");
      out.earth = [!!a.system.fx?.earthMeld, (await togglePowerEffect(a, "protean:1")) === undefined || !a.powerEffects.some(x => x.power === "protean:1")];
      await soakAndApply(a, 3, "aggravated", { soak: false, sun: true });
      out.earthSun = [hp(), a.powerEffects.some(x => x.power === "protean:3")];
      await soakAndApply(a, 1, "lethal", { soak: false });
      out.earthWake = [hp(), a.powerEffects.some(x => x.power === "protean:3")];
      // Туманная форма: броня не в счёт, атаковать нельзя, обычный урон не проходит, огонь — проходит
      await a.startPower("protean:5", { blood: 3 });
      out.mist = [!!a.system.fx?.mistForm, a.armor.rating, (await openAttack(a)) === null];
      await soakAndApply(a, 2, "lethal", { soak: false });
      out.mistHit = hp();
      await soakAndApply(a, 1, "aggravated", { soak: false, fire: true });
      out.mistFire = hp();
      // Модифицированный Облик: только Гангрелам (ветви тоже); боевая форма — точки к Силе и т.д., когти и укус
      const v = await mk("E2E — вентру", "ventrue");
      const warned = await togglePowerEffect(v, "protean:Модифицированный Облик Зверя");
      out.ventrueBlocked = !v.powerEffects.length && !v.getFlag(game.system.id, "proteanModifiedForms") && warned !== null;
      const g = await mk("E2E — городской гангрел", "gorodskieGangrely");
      const cfg = { battle: { animal: "волк", attr: { strength: 2, dexterity: 1, stamina: 2 }, sense: "smell" },
        escape: { animal: "ворон", flying: true, large: false, sense: "vision" } };
      await g.setFlag(game.system.id, "proteanModifiedForms", cfg);
      const pending = togglePowerEffect(g, "protean:Модифицированный Облик Зверя");   // ветвь Гангрелов — открывается выбор формы
      let dlg = null;
      for (let i = 0; i < 40 && !dlg; i++) { await new Promise(res => setTimeout(res, 100)); dlg = [...foundry.applications.instances.values()].find(x => x.element?.classList.contains("r-protean-dialog")); }
      out.branchDialog = !!dlg;
      await dlg?.close(); await pending;
      const str0 = g.system.attributes.strength.total;
      await g.startPower("protean:Модифицированный Облик Зверя", { variant: "battle", blood: 2, shapeConfig: cfg });
      out.battle = [g.system.fx?.beastForm, g.system.attributes.strength.total - str0,
        g.items.filter(i => i.type === "weapon" && /\(волк\)/.test(i.name)).length];
      await Actor.deleteDocuments([a.id, v.id, g.id]);
      return out;
    });
    const want = { earth: [true, true], earthSun: ["0/0/0", true], earthWake: ["0/0/0", false], mist: [true, 0, true],
      mistHit: "0/0/0", mistFire: "0/0/1", ventrueBlocked: true, branchDialog: true, battle: ["modified", 2, 2] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Физические Дисциплины и Метаморфозы (2.7.0): Стойкость в прочности, Мощь до конца сцены, Когти Зверя,
  // Облик Зверя превращается за ходы в бою, Стремительность — своя фаза доп. действий после раунда
  await check("Мощь, Стойкость, Метаморфозы и фаза Стремительности", async () => {
    const r = await page.evaluate(async () => {
      const sys = p => import(`/systems/${game.system.id}/${p}`);
      const wait = async (fn, ms = 6000) => { for (let i = 0; i < ms / 100 && !fn(); i++) await new Promise(res => setTimeout(res, 100)); return fn(); };
      const a = await Actor.create({ name: "E2E — Метаморфозы", type: "vampire", flags: { world: { e2e: true } },
        system: { generation: 8, attributes: { strength: { value: 2 }, dexterity: { value: 2 }, stamina: { value: 3 } }, blood: { value: 10 } } });   // 8-е: 3 крови за ход
      const dummy = await Actor.create({ name: "E2E — статист боя", type: "mortal", flags: { world: { e2e: true } } });
      await a.createEmbeddedDocuments("Item", [["potence", 3], ["fortitude", 2], ["celerity", 2], ["protean", 5]]
        .map(([key, value]) => ({ name: `E2E — ${key}`, type: "discipline", system: { key, value } })));
      const out = {};
      // Стойкость: губительный — только Стойкость, летальный — Выносливость + Стойкость
      out.soak = [a.soakPool("aggravated"), a.soakPool("lethal")];
      // Мощь вне боя: автоуспехи Силы, «Конец сцены» снимает
      const { endScene } = await sys("module/apps/night.mjs");
      await a.togglePotence();
      out.potence = [a.potenceActive, a.physicalAuto("strength"), a.physicalDisciplineBonus("strength")];
      // Когти Зверя вне боя — готовы сразу, оружие в инвентаре; с концом сцены исчезают
      await a.startPower("protean:2");
      out.claws = [a.items.some(i => i.type === "weapon" && i.name === "Когти Зверя"), !!a.system.fx?.clawsFortitudeOnly];
      await endScene();
      out.afterScene = [a.potenceActive, a.items.some(i => i.name === "Когти Зверя")];
      // Бой: свой ход — Облик волка за 3 крови (1 ход) и 2 действия Стремительности за 1 кровь
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const combat = await Combat.create({ scene: scene?.id ?? null, active: true });
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: a.id, name: a.name, initiative: 20 }, { actorId: dummy.id, name: dummy.name, initiative: 1 }]);
      await combat.startCombat();
      out.myTurn = combat.combatant?.actor?.id === a.id;
      await a.startPower("protean:4", { variant: "wolf", blood: 3 });
      out.wolfBefore = [a.powerEffects.find(x => x.power === "protean:4")?.effect.getFlag(game.system.id, "ready"), a.system.fx?.beastForm ?? null];
      out.celerity = [await a.buyCelerityActions(2), a.celerityActions, a.physicalDisciplineBonus("dexterity"), a.system.blood.value];
      await combat.nextTurn();
      await wait(() => a.system.fx?.beastForm === "wolf");
      out.wolfAfter = [a.system.fx?.beastForm, a.armor.rating];
      // конец раунда: вместо 2-го раунда — фаза Стремительности; два действия — и раунд идёт дальше
      await combat.nextTurn();
      const phase = () => combat.getFlag(game.system.id, "celerityPhase");
      await wait(() => phase()?.active);
      out.phase = [!!phase()?.active, combat.round];
      await a.consumeCelerityAction();
      await wait(() => (phase()?.queue?.[0]?.remaining ?? 0) === 1);
      await a.consumeCelerityAction();
      await wait(() => combat.round === 2);
      out.after = [combat.round, !!phase()?.active];
      await new Promise(res => setTimeout(res, 1500));   // новый ход (инициатива, заявки) успевает записаться до удаления боя
      await combat.delete();
      await Actor.deleteDocuments([a.id, dummy.id]);
      return out;
    });
    const want = { soak: [2, 5], potence: [true, 3, 0], claws: [true, true], afterScene: [false, false], myTurn: true,
      wolfBefore: [false, null], celerity: [true, 2, 0, 4], wolfAfter: ["wolf", 0], phase: [true, 1], after: [2, false] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Бой нескольких участников: инициатива у всех, порядок по убыванию, ход переходит
  await check("Бой: инициатива и ходы трёх участников", async () => {
    const r = await page.evaluate(async () => {
      const make = n => Actor.create({ name: `E2E — бой ${n}`, type: "vampire", flags: { world: { e2e: true } } });
      const actors = [await make(1), await make(2), await make(3)];
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const combat = await Combat.create({ scene: scene?.id ?? null, active: true });
      await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id, name: a.name })));
      await combat.rollAll();
      await combat.startCombat();
      const inits = combat.turns.map(c => c.initiative);
      const first = combat.combatant?.id; await combat.nextTurn();
      const out = { n: combat.combatants.size, all: inits.every(v => Number.isFinite(v)),
        sorted: inits.every((v, i) => i === 0 || inits[i - 1] >= v), moved: combat.combatant?.id !== first, round: combat.round };
      await combat.delete(); await Actor.deleteDocuments(actors.map(a => a.id));
      return out;
    });
    if (r.n !== 3 || !r.all || !r.sorted || !r.moved) throw new Error(JSON.stringify(r));
  });

  // Карта города: открывается и закрывается без ошибок
  await check("Карта города открывается", async () => {
    const r = await page.evaluate(async () => {
      const C = await import(`/systems/${game.system.id}/module/ui/citymap.mjs`);
      await C.openCity();
      // первая загрузка карты бывает долгой — ждать открытия, а не фиксированное время
      let el = null;
      for (let i = 0; i < 40 && !(el = document.querySelector(".vtm20.r-city"))?.classList.contains("open"); i++) await new Promise(res => setTimeout(res, 200));
      const open = !!el?.classList.contains("open");
      C.closeCity(); await new Promise(res => setTimeout(res, 400));
      return { open };
    });
    if (!r.open) throw new Error("карта не открылась");
  });

  // Дампир-гуль и правило «кому видна черта»
  // Оборотень (W20): формы меняют итог Атрибутов (и после перезагрузки данных), смена формы за Ярость, Дар списывает свою цену
  // Стратегия города (module/ui/strategy.mjs): полный ход через доску — заявка, «Провести ход», отчёт с личной страницей,
  // нарушение договора → большая услуга, рост тренда, польза сектора, сдвиг часов при публикации и его отмена; всё убирается за собой
  await check("Стратегия города: ход, отчёт, договор, тренд, часы", async () => {
    const a = await temp("E2E — стратег"), b = await temp("E2E — соперник");
    const r = await page.evaluate(async ([a, b]) => {
      const SYS = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), out = {};
      const A = game.actors.get(a), B = game.actors.get(b);
      const saved = foundry.utils.deepClone(game.settings.get(SYS, "strategy") ?? {});
      const { getClock, setClock } = await import(`/systems/${SYS}/module/apps/calendar.mjs`), c0 = getClock();
      const msgs = new Set(game.messages.map(m => m.id));
      try {
        await game.settings.set(SYS, "strategy", { spheres: [{ key: "x", name: "Сфера", color: "#777777" }],
          sectors: [{ key: "s1", name: "Порт", sphere: "x", q: 0, r: 0, perk: "herd" }, { key: "s2", name: "Пресса", sphere: "x", q: 1, r: 0, perk: "hunt" },
            { key: "s3", name: "Окраины", sphere: "x", q: 2, r: 0, perk: "caern" }],
          tokens: { s1: { [a]: 3, [b]: 2 }, s3: { [a]: 4 } }, trends: [{ id: "t1", sector: "s2", name: "Бунт", level: 2, grow: 1 }],
          pacts: [{ id: "p1", a, b, scope: "*", kind: "peace", note: "" }], turn: { n: 1, label: "", open: true, shift: { n: 3, unit: "days" } } });
        await A.setFlag(SYS, "strategy", { turn: 1, done: true, bids: [{ id: "x1", sector: "s1", kind: "attention", intent: "undermine", target: b,
          attr: "manipulation", ability: "subterfuge", text: "", proxy: "", crude: false }] });
        const S = await import(`/systems/${SYS}/module/ui/strategy.mjs`);
        out.perk = S.perkBonus(A, "herd").dice;
        out.caern = S.perkBonus(A, "caern").dice;           // каэрн в секторе: Преграда −2 при 4 фишках
        out.sheet = !!S.sheetStrategy(A)?.sectors?.length;
        const C = await import(`/systems/${SYS}/module/ui/citymap.mjs`);
        await C.openCity(); await wait(1500);
        const root = document.getElementById("r-citymap"), click = sel => root.querySelector(sel)?.click();
        click('.rc-modes [data-mode=strategy]'); await wait(300);
        // масштаб соты: «+» сужает видимую область, «вся сота» возвращает исходную; без выбранного гекса — обзор города
        const vb = () => root.querySelector(".rs-map svg")?.getAttribute("viewBox")?.split(" ").map(Number) ?? [0, 0, 0, 0];
        const w0 = vb()[2]; click('[data-rs=zoom][data-d=in]'); await wait(100); const w1 = vb()[2];
        click('[data-rs=zoom][data-d=fit]'); await wait(100);
        out.zoom = w0 > 0 && w1 < w0 && Math.abs(vb()[2] - w0) < 1;
        out.overview = !!root.querySelector(".rs-overview .rs-ovsph li");
        click('[data-rs=view][data-v=turn]'); await wait(300);
        click('[data-rs=resolve]'); await wait(2000);
        out.draft = !!root.querySelector(".rs-draft");
        click('[data-rs=publish]'); await wait(1000);
        [...foundry.applications.instances.values()].find(x => x.constructor.name === "DialogV2" && x.rendered)?.element.querySelector("button[data-action=shift]")?.click();
        await wait(2500);
        const st = game.settings.get(SYS, "strategy"), rep = st.reports.at(-1);
        Object.assign(out, { turn: st.turn.n, pacts: st.pacts.length, trend: st.trends[0]?.level, shift: Math.round((getClock() - c0) / 86400000),
          boon: A.system.boons.some(x => x.dir === "owe" && x.level === "major") && B.system.boons.some(x => x.dir === "owed" && x.level === "major") });
        const je = rep && await fromUuid(rep.uuid);
        out.pages = je?.pages.size ?? 0;
        click('[data-rs=view][data-v=reports]'); await wait(300);
        click('[data-rs=clockUndo]'); await wait(800);
        document.querySelector(".application.dialog button[data-action=yes]")?.click(); await wait(1500);
        out.back = Math.round((getClock() - c0) / 86400000);
        await je?.delete();
        await C.closeCity?.();
      } finally {
        if (getClock() !== c0) await setClock(c0);
        await game.settings.set(SYS, "strategy", saved);
        const fresh = game.messages.filter(m => !msgs.has(m.id)).map(m => m.id);
        if (fresh.length) await ChatMessage.deleteDocuments(fresh);
      }
      return out;
    }, [a, b]);
    if (r.perk !== 2 || !r.sheet || r.caern !== 2) throw new Error(`польза сектора ${r.perk}, каэрн ${r.caern}, лист ${r.sheet}`);
    if (!r.draft || r.turn !== 2 || r.pages !== 2) throw new Error(`ход: черновик ${r.draft}, ход ${r.turn}, страниц отчёта ${r.pages}`);
    if (!r.zoom || !r.overview) throw new Error(`сота: масштаб ${r.zoom}, обзор города ${r.overview}`);
    if (r.pacts !== 0 || !r.boon) throw new Error(`договор: осталось ${r.pacts}, услуги ${r.boon}`);
    if (r.trend !== 3) throw new Error(`тренд не вырос: ${r.trend}`);
    if (r.shift !== 3 || r.back !== 0) throw new Error(`часы: сдвиг ${r.shift} дн., после отмены ${r.back}`);
  });

  // План 2: стратегия ↔ домен (правило системы) — квартал домена, Защищённость по фишкам, события ↔ тренды
  await check("Стратегия: Конвенции Технократии одной кнопкой", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), saved = foundry.utils.deepClone(game.settings.get(sid, "strategy") ?? {}), out = {};
      try {
        const R = await import(`/systems/${sid}/module/ui/strategy-rules.mjs`), S = await import(`/systems/${sid}/module/ui/strategy.mjs`);
        await game.settings.set(sid, "strategy", { spheres: R.MODERN.spheres, sectors: R.MODERN.sectors, tokens: {}, owners: {} });
        await S.openStrategy(); await wait(1200);
        document.querySelector("[data-rs=view][data-v=setup]")?.click(); await wait(400);
        document.querySelector("[data-rs=facTech]")?.click(); await wait(1000);
        const s = game.settings.get(sid, "strategy");
        out.owners = Object.keys(s.owners).filter(k => k.startsWith("f:conv-")).length;
        out.tokens = [s.tokens.media?.["f:conv-new-world-order"], s.tokens.finance?.["f:conv-syndicate"], s.tokens.university?.["f:conv-void-engineers"]];
        (await import(`/systems/${sid}/module/ui/citymap.mjs`)).closeCity(); await wait(400);
      } finally { await game.settings.set(sid, "strategy", saved); }
      return out;
    });
    if (r.owners !== 5 || r.tokens.join() !== "2,2,2") throw new Error(`Конвенции: ${JSON.stringify(r)}`);
  });

  await check("Стратегия и домен: квартал, Защищённость, события и тренды", async () => {
    const a = await temp("E2E — хозяин домена"), b = await temp("E2E — соперник в квартале");
    const r = await page.evaluate(async ([a, b]) => {
      const SYS = game.system.id, sys = p => import(`/systems/${SYS}/${p}`), out = {};
      const St = await sys("module/ui/strategy.mjs"), { EXT } = await sys("module/ui/city-ext.mjs");
      const saved = foundry.utils.deepClone(game.settings.get(SYS, "strategy") ?? {}), flags = foundry.utils.deepClone(game.user.getFlag(SYS, "cityDomains") ?? null);
      const cm = game.settings.get(SYS, "cityMap"), cityId = cm?.current ?? Object.keys(cm?.cities ?? {})[0];
      const [lat, lng] = cm?.cities?.[cityId]?.center ?? [48.8566, 2.3522], d = .002;
      const fake = () => [{ key: "e2e-q", name: "E2E — квартал", lat, lng }];
      EXT.strategy.districts.push(fake);
      let da;
      try {
        await game.user.setFlag(SYS, "cityDomains", { [cityId]: [{ id: "e2e-dom", owner: a, points: [[lat - d, lng - d], [lat - d, lng + d], [lat + d, lng + d], [lat + d, lng - d]] }] });
        await game.settings.set(SYS, "strategy", { ...saved, trends: [], sectors: [{ key: "e2e-s", sphere: "power", q: 0, r: 0, name: "E2E — сектор", about: "", perk: "", district: "e2e-q" }],
          tokens: { "e2e-s": { [a]: 2, [b]: 1 } } });
        da = await Actor.create({ name: "E2E — домен в квартале", type: "domain", flags: { world: { e2e: true } }, system: { owner: a, zone: "e2e-dom", security: 2 } });
        const w = St.domainSway(da);
        out.sway = `${w?.district}:${w?.mine}:${w?.best}:${w?.d}`;
        await da.sheet.render({ force: true }); out.sheet = da.sheet.element.textContent.includes("E2E — квартал"); await da.sheet.close();
        out.lines = (await St.domainSecurity(St.strat())).length;
        out.sec = `${da.system.security}:${da.system.events.at(-1)?.key}`;
        const tr = await St.domainEventTrend(da, "brigands", "");
        out.trend = `${tr?.sector}:${St.strat().trends.length}`;
        await St.trendToDomains({ id: "t2", sector: "e2e-s", name: "E2E — тренд", level: 1 }, St.strat());
        out.journal = da.system.events.at(-1)?.key;
      } finally {
        EXT.strategy.districts.splice(EXT.strategy.districts.indexOf(fake), 1);
        await da?.delete();
        await game.settings.set(SYS, "strategy", saved);
        if (flags) await game.user.setFlag(SYS, "cityDomains", flags); else await game.user.unsetFlag(SYS, "cityDomains");
      }
      return out;
    }, [a, b]);
    if (r.sway !== "E2E — квартал:2:1:1" || !r.sheet) throw new Error(`расклад квартала (квартал:хозяин:соперник:сдвиг): ${r.sway}; на листе домена: ${r.sheet}`);
    if (r.lines !== 1 || r.sec !== "3:strategy") throw new Error(`Защищённость по ходу: строк ${r.lines}, ${r.sec}`);
    if (r.trend !== "e2e-s:1" || r.journal !== "trend") throw new Error(`событие → тренд: ${r.trend}; тренд → журнал: ${r.journal}`);
  });

  // План 17: панель сессии рассказчика — персонаж игрока с 1 кровью и в бешенстве попадает в тревоги
  await check("Панель сессии: запасы, состояния, тревоги", async () => {
    const id = await temp("E2E — в бешенстве");
    const r = await page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id), wait = ms => new Promise(res => setTimeout(res, ms));
      const pl = game.users.find(u => !u.isGM);
      if (pl) await a.update({ [`ownership.${pl.id}`]: 3 });
      await a.update({ "system.blood.value": 1 }); await a.toggleStatusEffect("r-frenzy", { active: true });
      const P = await import(`/systems/${SYS}/module/apps/session-panel.mjs`);
      const app = P.openSessionPanel(); await wait(800);
      app.filter = "alert"; await app.render(); await wait(400);
      const row = [...app.element.querySelectorAll(".r-sp-row.is-alert")].find(x => x.textContent.includes("E2E — в бешенстве"));
      const out = { player: !!pl, row: !!row, low: !!row?.querySelector(".r-sp-pool.is-low"), state: !!row?.querySelector(".r-sp-state") };
      await app.close();
      return out;
    }, id);
    if (!r.player) throw new Error("в песочнице нет пользователя-игрока");
    if (!r.row || !r.low || !r.state) throw new Error(`панель сессии: строка ${r.row}, мало крови ${r.low}, бешенство ${r.state}`);
  });

  // Оборотни, часть 2: мастер создания Гару (W20, гл. 3), фетиши и талены, Бред по Силе воли, дух Умбры (существо с Чарами)
  await check("Оборотень: мастер создания, фетиши, Бред, дух Умбры, Родня, тотем стаи", async () => {
    const id = await temp("E2E — новый Гару", "werewolf"), sp = await temp("E2E — дух", "creature");
    const r = await page.evaluate(async ([id, sp]) => {
      const SYS = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), out = {};
      const a = game.actors.get(id), s = game.actors.get(sp);
      // общий мастер создания (creator.mjs): у Гару шаги «Порода и племя» и «Дары», Слава вместо Добродетелей
      const C = await import(`/systems/${SYS}/module/apps/creator.mjs`), WW = await import(`/systems/${SYS}/module/apps/werewolf.mjs`);
      await C.openCreator(a);
      let app; for (let i = 0; i < 30 && !(app = [...foundry.applications.instances.values()].find(x => x instanceof C.VtMCreator && x.actor === a)); i++) await wait(150);
      const D = WW.W(), br = D.breeds.find(x => x.key === "lupus"), au = D.auspices.find(x => x.key === "theurge"), tr = D.tribes[0];
      Object.assign(app.st.ww, { breed: "lupus", auspice: "theurge", tribe: tr.key, gifts: { breed: br.startGifts[0], auspice: au.startGifts[0], tribe: tr.startGifts[0] } });
      // разложить точки по правилам: 7/5/3, 13/9/5 (не выше 3), 5 Фактов
      Object.assign(app.st.attr, { strength: 3, dexterity: 3, stamina: 1, charisma: 2, manipulation: 2, appearance: 1, perception: 1, intelligence: 1, wits: 1 });
      const abil = CONFIG.VTM20.abilitiesForEra(game.settings.get(SYS, "era"), "werewolf");
      for (const g of app.st.abilPrio) { let left = app.abilLimit(g); for (const k of abil[g]) { const n = Math.min(3, left); if (n > 0) { app.st.abil[k] = n; left -= n; } } }
      app.st.bg[(await import(`/systems/${SYS}/module/data/codex.mjs`)).Codex.backgrounds.find(b => CONFIG.VTM20.backgroundAllowed(b, "werewolf")).name] = 5;
      // 15 бонусных: Воля +5 (по 1) и Восприятие +2 (по 5) — Ярость и Гнозис остаются по аугурии и породе
      app.st.free.will = 5; app.st.free.attr.perception = 2;
      out.steps = app.steps.join(",");
      // каждый шаг рисуется без ошибок
      for (let i = 0; i < app.steps.length; i++) { app.step = i; await app.render({ force: true }); await wait(120); }
      out.tiles = (app.step = app.steps.indexOf("garou"), await app.render(), await wait(200), app.element.querySelectorAll("[data-action=garouPick][data-what=tribe]").length);
      out.problems = app.problems(app.remaining()).join(" | ");
      app.step = app.steps.length - 1; await app.render(); await wait(200);
      app.element.querySelector("[data-action=finish]").click(); await wait(1800);
      Object.assign(out, { created: !!a.getFlag(SYS, "created"), rage: a.system.werewolf.rage.permanent, gnosis: a.system.werewolf.gnosis.permanent,
        wisdom: a.system.werewolf.renown.wisdom.permanent, gifts: a.system.werewolf.gifts.length, form: a.system.werewolf.form });
      await WW.addFetish(a, "baneskin"); await WW.addFetish(a, "gaia-s-breath"); await WW.addFetish(a, "gaia-s-breath");
      out.fetishes = a.system.werewolf.fetishes.map(f => `${f.key}:${f.n}`).join(",");
      const d = WW.deliriumOf(7); out.delirium = `${d.key}:${d.forgets}`;
      await s.update({ "system.spirit": { on: true, rage: 4, gnosis: 6, willpower: 5 } });
      await WW.spiritEssenceReset(s); out.essence = s.system.spirit.essence.max; out.spiritRoll = s.traitValue("spirit.gnosis");
      await s.sheet.render(true); await wait(900); out.card = s.sheet.constructor.name === "SpiritSheet" && !!s.sheet.element.querySelector(".r-sp-trait") && !!s.sheet.element.querySelector('[data-action="spTpl"]') && WW.spiritTplGroups().some(g => g.list.some(x => x.key === "bane-halassh")); await s.sheet.close();
      await WW.applySpiritTpl(s, "bane-halassh");
      out.spTpl = `${s.system.spirit.rage}:${s.system.spirit.charms.join() === WW.spiritTplOf("bane-halassh").charms.join()}`;
      // Родня Гару: Дар за опыт (свой — 15), блок на листе
      const k = await Actor.create({ name: "E2E — Родня", type: "mortal", flags: { world: { e2e: true }, [SYS]: { created: true } },
        system: { experience: { total: 20 }, kinfolk: { on: true, tribe: "boneGnawers", breed: "homid" } } });
      const ki = WW.kinfolkInfo(k), own = ki.avail.find(x => x.xp === 15);
      await WW.kinAddGift(k, own.key, true);
      out.kin = `${k.system.kinfolk.gifts.length}:${k.system.experience.spent}:${ki.avail.length > 5}`;
      // нумины Родни: Прорицание до 3 точек, на листе — 3 открытых уровня; бросок — Восприятие + Оккультизм
      await WW.kinAddNumen(k, "divination"); await WW.kinNumenDots(k, "divination", 3);
      await k.sheet.render({ force: true }); await wait(300); out.kinBlock = !!k.sheet.element.querySelector(".r-kin");
      out.numen = `${k.system.kinfolk.numina[0]?.dots}:${k.sheet.element.querySelectorAll(".r-kin-numina li li:not(.is-locked)").length}:${WW.numenOf("divination")?.roll?.trait2}`;
      await k.sheet.close();
      // Ками: «Берсерк» даёт 5 Ярости, «Размер» покупается повторно, сила за опыт — (число сил × 3); животное-Ками не видит Бреда
      await k.update({ "system.kami": { on: true, kind: "animal" }, "system.experience.total": 40 });
      await WW.kamiAdd(k, "berserker"); await WW.kamiAdd(k, "Размер"); await WW.kamiAdd(k, "Размер");
      const xp0 = k.system.experience.spent; await WW.kamiAdd(k, "Мягкие лапы", true);
      await k.sheet.render({ force: true }); await wait(300);
      out.kami = `${k.system.kami.rage}:${k.system.kami.powers.find(p => p.key === "Размер")?.n}:${k.system.experience.spent - xp0}:${WW.kamiDeliriumImmune(k)}:${k.sheet.element.querySelectorAll(".r-kami-powers .r-sn-item").length}`;
      await k.sheet.close();
      // фомор: порода Нормалитов — Воля 3 и 4 силы (с Иммунитетом к Бреду), блок на листе
      await k.update({ "system.fomor.on": true }); await WW.fomorBreed(k, "normalites");
      await k.sheet.render({ force: true }); await wait(300);
      out.fomor = `${k.system.willpower.permanent}:${k.system.fomor.powers.length}:${k.sheet.element.querySelectorAll(".r-fomor-powers .r-sn-item").length}`;
      await k.sheet.close();
      // кин-фетч: Огненное крещение создаёт существо-духа по образцу (особая Чара «Клеймо фетча» с текстом), Перемена сжигает клеймо
      await WW.bindFetch(k, "fetch-Кин-фетч"); const fa = await fromUuid(k.system.kinfolk.fetch);
      out.fetch = `${!!fa?.system.spirit.on}:${fa?.system.spirit.willpower}:${!!WW.charmOf(fa?.system.spirit.charms.find(c => c.startsWith("~")))?.text}`;
      await WW.burnFetch(k); out.fetch += `:${k.system.kinfolk.fetch === ""}`; await fa?.delete();
      // стая: котерия с Гару и тотемом — тотем на карточке
      const cots = foundry.utils.deepClone(game.settings.get(SYS, "coteries") ?? []);
      try {
        await game.settings.set(SYS, "coteries", [...cots, { id: "e2e-pack", name: "E2E — стая", members: [id], pools: {}, lost: {}, totem: "falcon" }]);
        const Co = await import(`/systems/${SYS}/module/apps/coterie.mjs`);
        out.totem = Co.totemOf(a)?.totem?.name ?? "";
        await a.sheet.render(true); await wait(900); out.totemHint = /Сокол/.test(a.sheet.element.querySelector(".r-ww-where")?.textContent ?? ""); await a.sheet.close();
      } finally { await game.settings.set(SYS, "coteries", cots); }
      return out;
    }, [id, sp]);
    if (!r.created || r.rage !== 2 || r.gnosis !== 5 || r.wisdom !== 3 || r.gifts !== 3 || r.form !== "lupus") throw new Error(`мастер создания: ${JSON.stringify(r)}`);
    if (!/concept,garou,attributes,abilities,gifts,advantages/.test(r.steps) || r.tiles < 13 || r.problems) throw new Error(`шаги мастера Гару: ${r.steps}; племён ${r.tiles}; замечания: ${r.problems}`);
    if (r.fetishes !== "baneskin:1,gaia-s-breath:2") throw new Error(`фетиши: ${r.fetishes}`);
    if (r.delirium !== "controlled:false") throw new Error(`Бред: ${r.delirium}`);
    if (r.essence !== 15 || r.spiritRoll !== 6 || !r.card) throw new Error(`дух: Эссенция ${r.essence}, Гнозис ${r.spiritRoll}, карточка ${r.card}`);
    if (r.kin !== "1:15:true" || !r.kinBlock) throw new Error(`Родня: ${r.kin}, блок ${r.kinBlock}`);
    if (r.fomor !== "3:4:4") throw new Error(`фомор (Воля:сил:на листе): ${r.fomor}`);
    if (r.fetch !== "true:5:true:true") throw new Error(`кин-фетч (дух:Воля:особая Чара:клеймо сгорело): ${r.fetch}`);
    if (r.spTpl !== "8:true") throw new Error(`образец духа (Ярость Халасша:Чары по образцу): ${r.spTpl}`);
    if (r.kami !== "5:2:9:true:3") throw new Error(`Ками (Ярость:Размер:опыт за силу:без Бреда:на листе): ${r.kami}`);
    if (r.numen !== "3:3:abilities.occult") throw new Error(`нумины Родни (точки:открытых уровней:вторая черта): ${r.numen}`);
    if (r.totem !== "Сокол" || !r.totemHint) throw new Error(`тотем стаи: ${r.totem}, на карточке ${r.totemHint}`);
  });

  await check("Оборотень: формы, Ярость, Дары, лист", async () => {
    const id = await temp("E2E — Гару", "werewolf");
    const r = await page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id), wait = ms => new Promise(res => setTimeout(res, ms));
      const WW = await import(`/systems/${SYS}/module/apps/werewolf.mjs`);
      await a.update({ "system.attributes.strength.value": 3, "system.attributes.appearance.value": 3, "system.werewolf": {
        breed: "homid", auspice: "ahroun", tribe: "getOfFenris", rank: 1, rage: { permanent: 5, value: 5 }, gnosis: { permanent: 3, value: 3 },
        gifts: ["razor-claws"], form: "crinos" } });
      const out = { str: a.system.attributes.strength.total, app: a.system.attributes.appearance.total, img: a.img };
      a.prepareData(); out.strAgain = a.system.attributes.strength.total;
      const p = WW.changeForm(a, "lupus"); await wait(600);
      [...foundry.applications.instances.values()].find(x => x.constructor.name === "DialogV2" && x.rendered)?.element.querySelector("[data-pick=rage]")?.click();
      await p; await wait(300);
      Object.assign(out, { form: a.system.werewolf.form, rage: a.system.werewolf.rage.value, strLupus: a.system.attributes.strength.total });
      WW.rollGift(a, "razor-claws"); await wait(800);
      const rd = [...foundry.applications.instances.values()].find(x => x.constructor.name === "RollDialog" && x.rendered);
      out.giftRoll = !!rd; await rd?.close(); out.rageGift = a.system.werewolf.rage.value;
      await a.sheet.render(true); await wait(900);
      const el = a.sheet.element;
      Object.assign(out, { cls: el.classList.contains("r-type-werewolf"), card: !!el.querySelector(".r-vc-garou"), formMark: !!el.querySelector(".r-form-badge.is-up") && !!el.querySelector(".r-dot.is-gain"),
        tab: !!el.querySelector('[data-tab="disciplines"] .r-ww-forms') });
      await a.sheet.close();
      const { openLibrary } = await import(`/systems/${SYS}/module/apps/library.mjs`);
      for (const kind of ["gift", "rite"]) {
        const lib = await openLibrary({ actor: a, kind }); await wait(900);
        out[`${kind}Entries`] = lib.element.querySelectorAll("[data-entry]").length;
        lib.element.querySelector("[data-entry] [data-action=take]")?.click(); await wait(700);
        await lib.close();
      }
      Object.assign(out, { gifts: a.system.werewolf.gifts.length, rites: a.system.werewolf.rites.length });
      const pack = game.packs.get(`${SYS}.werewolf-rules`);
      out.rulesBooks = pack ? (await pack.getIndex()).size : 0;
      const { Codex } = await import(`/systems/${SYS}/module/data/codex.mjs`);
      out.wwTraits = Codex.merits.filter(m => CONFIG.VTM20.traitFor(m, { type: "werewolf" })).length;
      out.wwBackgrounds = Codex.backgrounds.filter(b => CONFIG.VTM20.backgroundAllowed(b, "werewolf")).length;
      await a.update({ "system.werewolf.form": "crinos", "system.attributes.stamina.value": 2 });
      out.soak = ["bashing", "lethal", "aggravated"].map(k => a.soakPool(k)).join("/") + " " + a.soakPool("lethal", { silver: true });
      out.natural = a.system.formFx.weapons.map(w => `${w.key}:${w.type}`).join(",");
      const { soakAndApply } = await import(`/systems/${SYS}/module/dice/roll.mjs`);
      await a.update({ "system.health.bashing": 0, "system.health.lethal": 0, "system.health.aggravated": 0 });
      await soakAndApply(a, 2, "lethal", { silver: true }); out.silverAgg = a.system.health.aggravated;
      await a.update({ "system.health.aggravated": 0, "system.health.lethal": 1 }); await WW.regenerate(a); out.regen = a.system.health.lethal;
      await a.update({ "system.werewolf.form": "homid" });
      out.soakHomid = ["bashing", "lethal"].map(k => a.soakPool(k)).join("/");
      out.xp = [a.xpCost("rage", 5), a.xpCost("gnosis", 3), a.xpCost("gift", 0, { level: 2, own: true }), a.xpCost("gift", 0, { level: 2, own: false })].join(",");
      // Фера (Changing Breeds): род Корвы — первая форма, Кринос рода (+3 Восприятие), свои Дары — только рода
      const per0 = a.system.attributes.perception.total;
      await a.update({ "system.werewolf.fera": "corax" }); const feraForm = a.system.werewolf.form;
      await a.update({ "system.werewolf.form": "f1" });
      const feraOwn = WW.giftsView(a).avail.every(g => WW.W().gifts.find(x => x.key === g.key)?.groups.some(x => x.kind === "fera" && x.key === "corax"));
      out.fera = `${feraForm}:${a.system.formData?.name}:${a.system.attributes.perception.total - per0}:${feraOwn}`;
      await a.update({ "system.werewolf.fera": "" }); out.feraBack = a.system.werewolf.form;
      // уродства метиса (Changing Ways): Грубая шкура — +1 к поглощению, Внешность не выше 1; без клыков — укус Криноса ударный; на листе блок
      await a.update({ "system.werewolf.breed": "metis", "system.werewolf.form": "crinos", "system.werewolf.deformities": ["tough-hide", "no-fangs"], "system.attributes.appearance.value": 3 });
      out.deform = `${a.soakPool("bashing")}:${a.system.formFx.weapons.find(w => w.key === "bite")?.type}`;
      await a.update({ "system.werewolf.form": "homid" }); out.deform += `:${a.system.attributes.appearance.total}`;
      await a.sheet.render(true); await wait(900); out.deformBlock = a.sheet.element.querySelectorAll(".r-ww-deforms .r-edge").length; await a.sheet.close();
      out.denyGift = !!WW.W().gifts.find(g => g.key === "deny-the-birthright")?.groups.some(x => x.key === "metis");
      await a.update({ "system.werewolf.breed": "homid", "system.werewolf.form": "homid", "system.werewolf.deformities": [] });
      // Танцоры Чёрной Спирали — племя: Дары изгоев blackSpiralDancers свои, 5 начальных; приёмы Первобытного инстинкта с бросками
      const tribe0 = a.system.werewolf.tribe; await a.update({ "system.werewolf.tribe": "blackSpiralDancers" });
      out.bsd = `${WW.ownGift(a.system.werewolf, WW.W().gifts.find(g => g.key === "bsd-bane-protector"))}:${WW.W().tribes.find(x => x.key === "blackSpiralDancers")?.startGifts.length}:${WW.W().primalUses.filter(u => u.roll).length}`;
      await a.update({ "system.werewolf.tribe": tribe0 });
      return out;
    }, id);
    if (r.giftEntries < 300 || r.riteEntries < 50 || r.gifts !== 2 || r.rites !== 1) throw new Error(`библиотека: Даров ${r.giftEntries}, ритуалов ${r.riteEntries}, взято ${r.gifts}/${r.rites}`);
    if (r.wwTraits < 119 || r.wwBackgrounds !== 12) throw new Error(`черты Гару: ${r.wwTraits}, Факты: ${r.wwBackgrounds}`);
    if (r.fera !== "f0:Кринос:3:true" || r.feraBack !== "homid") throw new Error(`Фера: ${r.fera}, назад в Гару — ${r.feraBack}`);
    if (r.bsd !== "true:5:5") throw new Error(`Танцоры (свой Дар:начальных:приёмов Инстинкта): ${r.bsd}`);
    if (r.deform !== "6:bashing:1" || r.deformBlock !== 2 || !r.denyGift) throw new Error(`уродства метиса (поглощение:укус:Внешность): ${r.deform}, на листе ${r.deformBlock}, Дар «Отринуть наследие» ${r.denyGift}`);
    if (r.xp !== "5,6,6,10") throw new Error(`цены опыта Гару (Ярость, Гнозис, Дар свой/чужой): ${r.xp}`);
    if (r.soak !== "5/5/5 0" || r.soakHomid !== "2/0") throw new Error(`прочность Гару: Кринос ${r.soak}, Хомид ${r.soakHomid}`);
    if (r.natural !== "bite:aggravated,claw:aggravated") throw new Error(`когти и укус Криноса: ${r.natural}`);
    if (r.silverAgg !== 2 || r.regen !== 0) throw new Error(`серебро: губительных ${r.silverAgg}; регенерация: осталось летальных ${r.regen}`);
    if (r.rulesBooks < 9) throw new Error(`компендий правил оборотней: ${r.rulesBooks} книг`);
    if (r.str !== 7 || r.app !== 0 || r.strAgain !== 7) throw new Error(`Кринос: Сила ${r.str}/${r.strAgain}, Внешность ${r.app}`);
    if (r.form !== "lupus" || r.rage !== 4 || r.strLupus !== 4) throw new Error(`смена формы за Ярость: ${r.form}, Ярость ${r.rage}, Сила ${r.strLupus}`);
    if (!r.giftRoll || r.rageGift !== 3) throw new Error(`Дар: окно броска ${r.giftRoll}, Ярость после Дара ${r.rageGift}`);
    if (!r.cls || !r.card || !r.formMark || !r.tab) throw new Error(`лист: тема ${r.cls}, карточка ${r.card}, поправка формы ${r.formMark}, вкладка ${r.tab}`);
    if (!/wolf-howl-moon-forest-blue\.webp$/.test(r.img)) throw new Error(`значок: ${r.img}`);
  });

  await check("Генератор НПС: все подвиды, роли, сила; Фера с племенем", async () => {
    const r = await page.evaluate(async () => {
      const SYS = game.system.id, B = await import(`/systems/${SYS}/module/apps/npc-build.mjs`), R = await import(`/systems/${SYS}/module/apps/npc-roles.mjs`);
      const out = { built: 0, errs: [] };
      for (const k of B.KINDS.filter(k => k.actor)) for (const p of R.POWERS) for (const role of ["", R.ROLES[0].key, R.ROLES.at(-1).key]) {
        try { const d = B.buildNpc({ kind: k.key, role, power: p.key, params: {} }); B.npcView(d); out.built++; } catch (e) { out.errs.push(`${k.key}/${p.key}: ${e.message}`); }
      }
      // выбранное — соблюдается: клан и поколение, племя Бастет и поправки форм по племени
      const v = B.buildNpc({ kind: "vampire", role: "schemer", power: "veteran", params: { clan: "toreador", generation: "9" } });
      out.vamp = `${v.system.clan}:${v.system.generation}:${v.roleLabel ? 1 : 0}`;
      const f = B.buildNpc({ kind: "fera", role: "assassin", power: "normal", params: { fera: "bastet", sub: { tribe: "khan", breed: "feline" } } });
      const a = await B.createNpc(f, { name: "E2E — Фера НПС" });
      await a.update({ "flags.world.e2e": true });
      out.fera = `${a.system.werewolf.fera}:${a.system.werewolf.feraSub.tribe}:${a.system.werewolf.feraSub.breed}`;
      await a.update({ "system.werewolf.form": "f2" });           // Кринос Хана: Сил +3
      out.khanCrinos = a.system.formData?.mods?.strength ?? 0;
      await a.delete();
      return out;
    });
    if (r.errs.length || r.built < 200) throw new Error(`собрано ${r.built}; ошибки: ${r.errs.slice(0, 3).join(" | ")}`);
    if (r.vamp !== "toreador:9:1") throw new Error(`выбор вампира: ${r.vamp}`);
    if (r.fera !== "bastet:khan:feline" || r.khanCrinos !== 3) throw new Error(`Фера: ${r.fera}, Кринос Хана Сила +${r.khanCrinos}`);
    return `${r.built} черновиков`;
  });

  await check("Котерия и домен, группы НПС, поколение, Фера в бою, тотем, узы", async () => {
    const r = await page.evaluate(async () => {
      const SYS = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), out = {}, made = [];
      const mk = async (data) => { const a = await Actor.create({ ...data, flags: { world: { e2e: true }, [SYS]: { created: true } } }); made.push(a); return a; };
      try {
        const v1 = await mk({ name: "E2E — котерия 1", type: "vampire" }), v2 = await mk({ name: "E2E — котерия 2", type: "vampire" });
        const cot = await mk({ name: "E2E — котерия", type: "coterie", system: { members: [v1.id, v2.id], pools: { "Домен": { [v1.id]: 2 } }, primary: "Домен" } });
        const dom = await mk({ name: "E2E — домен", type: "domain", system: { owner: cot.id, rating: 3, security: 2, guests: [] } });
        const D = await import(`/systems/${SYS}/module/apps/domain.mjs`), C = await import(`/systems/${SYS}/module/apps/coterie.mjs`);
        out.rating = D.domainRating(v2);
        out.coteriesOf = C.coteriesOf(v1).some(c => c.actorId === cot.id);
        await cot.sheet.render(true); await wait(900); out.cards = cot.sheet.element?.querySelectorAll(".r-gs-card").length ?? 0; await cot.sheet.close();
        await dom.sheet.render(true); await wait(900); out.owner = !!dom.sheet.element?.querySelector(".r-gs-owner-name"); await dom.sheet.close();
        // группа целиком
        const B = await import(`/systems/${SYS}/module/apps/npc-build.mjs`);
        out.cell = B.buildGroup("cell", "normal").map(d => d.actor).join(",");
        // поколение → факт «Поколение»
        await v1.update({ "system.generation": 10 }); await wait(700);
        out.genBg = v1.items.find(i => i.type === "background" && /Поколение|Generation/.test(i.name))?.system.value ?? 0;
        // Фера в бою: Кринос Бастет — укус и когти
        const f = await mk({ name: "E2E — Бастет", type: "werewolf", system: { werewolf: { fera: "bastet", form: "f2" } } });
        out.feraNatural = (f.system.formFx?.weapons ?? []).map(w => w.key).sort().join(",");
        // тотем стаи: Химера даёт Загадки 3
        const g = await mk({ name: "E2E — Гару тотема", type: "werewolf" });
        const pack = await mk({ name: "E2E — стая", type: "coterie", system: { kind: "pack", members: [g.id], totem: "chimera" } });
        out.totem = C.totemTraits(g)?.traits?.["abilities.enigmas"] ?? 0;
        // узы: таймер ослабления
        const Bo = await import(`/systems/${SYS}/module/apps/bonds.mjs`), Cal = await import(`/systems/${SYS}/module/apps/calendar.mjs`);
        out.fade = Bo.bondFade(v2, { role: "regnant", rating: 2, last: Cal.ymd(new Date(Cal.getClock())) });
      } finally {
        await Actor.deleteDocuments(made.map(a => a.id).filter(id => game.actors.get(id)));
      }
      return out;
    });
    if (r.rating !== 3 || !r.coteriesOf || r.cards !== 2 || !r.owner) throw new Error(`котерия/домен: рейтинг ${r.rating}, котерии ${r.coteriesOf}, карточек ${r.cards}, хозяин ${r.owner}`);
    if (r.cell !== "hunter,hunter,hunter,hunter") throw new Error(`группа: ${r.cell}`);
    if (r.genBg !== 3) throw new Error(`факт «Поколение» после 10-го поколения: ${r.genBg}`);
    if (r.feraNatural !== "bite,claw" || r.totem !== 3) throw new Error(`Фера: ${r.feraNatural}; тотем Химеры: ${r.totem}`);
    if (!(r.fade >= 1 && r.fade <= 12)) throw new Error(`таймер уз: ${r.fade}`);
  });

  await check("Компендии оборотней: перетаскивание на листы Гару, духа, Родни, Ками, фомора и стаи", async () => {
    const r = await page.evaluate(async () => {
      const SYS = game.system.id, out = { empty: [] }, made = [];
      const mk = async (data) => { const a = await Actor.create({ ...data, flags: { world: { e2e: true }, [SYS]: { created: true } } }); made.push(a); return a; };
      const P = n => game.packs.get(`${SYS}.werewolf-${n}`);
      for (const n of ["gifts", "rites", "fetishes", "totems", "spirits", "scars", "caerns", "kinfolk", "kami", "fomori"]) if (!(P(n)?.index.size)) out.empty.push(n);
      // первая запись компендия нужного вида (flags.<система>.ww.kind)
      const one = async (n, kind) => { const idx = await P(n).getIndex({ fields: [`flags.${SYS}.ww`] }); const e = idx.find(x => x.flags?.[SYS]?.ww?.kind === kind); return e ? P(n).getDocument(e._id) : null; };
      const drop = async (a, n, kind) => { const it = await one(n, kind); if (it) await a.sheet._onDropItem(new Event("drop"), it); return it; };
      try {
        const g = await mk({ name: "E2E — Гару компендиев", type: "werewolf" });
        for (const [n, k] of [["gifts", "gift"], ["rites", "rite"], ["fetishes", "fetish"], ["scars", "scar"], ["scars", "deformity"], ["caerns", "caern"]]) await drop(g, n, k);
        const w = g.system.werewolf;
        out.garou = [w.gifts.length, w.rites.length, w.fetishes.length, w.scars.length, w.deformities.length, g.items.size].join(",");
        const sp = await mk({ name: "E2E — дух", type: "creature" });
        const tpl = await drop(sp, "spirits", "spirit");
        out.spirit = !!sp.system.spirit.on && sp.system.kind.includes(tpl?.name ?? "—");
        const before = sp.system.spirit.charms.length, charm = (await P("spirits").getIndex({ fields: [`flags.${SYS}.ww`] }))
          .find(x => x.flags?.[SYS]?.ww?.kind === "charm" && !sp.system.spirit.charms.includes(x.flags[SYS].ww.key));
        if (charm) await sp.sheet._onDropItem(new Event("drop"), await P("spirits").getDocument(charm._id));
        out.charm = sp.system.spirit.charms.length - before;
        const kin = await mk({ name: "E2E — Родня", type: "mortal", system: { kinfolk: { on: true, tribe: "fianna" } } });
        await drop(kin, "kinfolk", "kinGift"); await drop(kin, "kinfolk", "numen");
        out.kin = `${kin.system.kinfolk.gifts.length},${kin.system.kinfolk.numina.length}`;
        const kami = await mk({ name: "E2E — Ками", type: "mortal", system: { kami: { on: true } } });
        await drop(kami, "kami", "kami"); out.kami = kami.system.kami.powers.length;
        const fo = await mk({ name: "E2E — фомор", type: "mortal", system: { fomor: { on: true } } });
        await drop(fo, "fomori", "fomorPower"); out.fomor = fo.system.fomor.powers.length;
        const pack = await mk({ name: "E2E — стая компендиев", type: "coterie", system: { kind: "pack" } });
        const totem = await one("totems", "totem"); await pack.sheet._onDropItem(new Event("drop"), totem);
        out.totem = pack.system.totem === totem?.flags?.[SYS]?.ww?.key && !!pack.system.totem;
      } finally {
        await Actor.deleteDocuments(made.map(a => a.id).filter(id => game.actors.get(id)));
      }
      return out;
    });
    if (r.empty.length) throw new Error(`пустые компендии: ${r.empty.join(", ")}`);
    if (r.garou !== "1,1,1,1,1,0") throw new Error(`Гару (Дары, ритуалы, фетиши, шрамы, уродства, предметы): ${r.garou}`);
    if (!r.spirit || r.charm !== 1) throw new Error(`дух: образец ${r.spirit}, Чары +${r.charm}`);
    if (r.kin !== "1,1" || r.kami !== 1 || r.fomor !== 1 || !r.totem) throw new Error(`Родня ${r.kin}, Ками ${r.kami}, фомор ${r.fomor}, тотем ${r.totem}`);
  });

  await check("Дампир: витэ гуля, траты, видимость черт", async () => {
    const r = await page.evaluate(async () => {
      const { Codex } = await import(`/systems/${game.system.id}/module/data/codex.mjs`);
      const { GHOUL_PROVOCATIONS } = await import(`/systems/${game.system.id}/module/dice/virtue-checks.mjs`);
      const g = await Actor.create({ name: "E2E — гуль-дампир", type: "ghoul", system: { ghoulType: "dhampir", blood: { value: 10 } }, flags: { world: { e2e: true } } });
      await g.drinkVitae(1);
      const out = { vitae: g.system.dhampir.vitae, gast: g.system.gast };
      await g.update({ "system.blood.value": 0 });
      out.spent = await g.spendBlood(1, { limit: false }); out.vitaeAfter = g.system.dhampir.vitae;
      await g.delete();
      const see = (who, f) => Codex.merits.some(m => f(m) && VTM20.traitFor(m, who));
      const VTM20 = CONFIG.VTM20;
      out.vampGhoul = see({ type: "vampire" }, m => m.ghoul); out.ghoulGhoul = see({ type: "ghoul" }, m => m.ghoul);
      out.dhGhoul = see({ type: "ghoul", dhampir: true }, m => m.ghoul); out.dhOwn = see({ type: "ghoul", dhampir: true }, m => m.dhampir);
      out.vampMortal = see({ type: "vampire" }, m => m.mortal); out.mortalMortal = see({ type: "mortal" }, m => m.mortal);
      out.prov = GHOUL_PROVOCATIONS.length;
      return out;
    });
    if (r.vitae !== 1 || !r.gast) throw new Error(`витэ гуля: ${r.vitae}, гуль ${r.gast}`);
    if (!r.spent || r.vitaeAfter !== 0) throw new Error(`трата из витэ: ${r.spent}, осталось ${r.vitaeAfter}`);
    if (r.vampGhoul || !r.ghoulGhoul || r.dhGhoul || !r.dhOwn) throw new Error(`черты гулей/дампиров: ${JSON.stringify(r)}`);
    if (r.vampMortal || !r.mortalMortal) throw new Error(`«только для смертных»: ${JSON.stringify(r)}`);
    if (r.prov !== 10) throw new Error(`поводов к Безумию ${r.prov}`);
  });

  await check("Свидетель: мастер, Добродетели, рассудок, без Граней", async () => {
    const id = await temp("E2E — свидетель", "hunter");
    const r = await page.evaluate(async id => {
      const SYS = game.system.id, a = game.actors.get(id), wait = ms => new Promise(r => setTimeout(r, ms));
      const C = await import(`/systems/${SYS}/module/apps/creator.mjs`), H = await import(`/systems/${SYS}/module/apps/hunter.mjs`);
      await C.openCreator(a);
      let w; for (let i = 0; i < 30 && !(w = [...foundry.applications.instances.values()].find(x => x instanceof C.VtMCreator && x.actor === a)); i++) await wait(150);
      Object.assign(w.st, { creed: "bystander", virt: { conscience: 2, selfControl: 2, courage: 3 } });
      const steps = w.steps.join(","), virt = w.rules.virt, conv = w.morality, left = w.remaining().virt;
      await w.close();
      await a.update({ "system.hunter": { creed: "bystander", conviction: 10, edges: [], bystander: { reason: 2, selfControl: 2, courage: 3 } } });
      await a.setFlag(SYS, "created", true);
      const edge = H.edgeReasons(a, "defense|1").length;
      const xp = a.xpCost("lostVirtue", 3);
      await a.sheet.render(true); await wait(800);
      const tab = !!a.sheet.element.querySelector('nav [data-tab="disciplines"]'), card = !!a.sheet.element.querySelector(".r-vc-hunter.is-lost");
      await a.sheet.close();
      return { steps, virt, conv, left, edge, xp, tab, card };
    }, id);
    if (r.steps.includes("edges")) throw new Error(`у Свидетеля шаг Граней: ${r.steps}`);
    if (r.virt !== 7 || r.left !== 0) throw new Error(`Добродетели Свидетеля: ${r.virt}, осталось ${r.left}`);
    if (r.conv !== 10) throw new Error(`Убеждённость Свидетеля ${r.conv}`);
    if (!r.edge) throw new Error("Свидетель может взять Грань");
    if (r.xp !== 6) throw new Error(`опыт за Добродетель 3 → 4: ${r.xp}`);
    if (r.tab || !r.card) throw new Error("лист Свидетеля: вкладка Граней или нет карточки рассудка");
  });

  // ── Права игрока: второй сеанс браузера входит игроком (без пароля), рассказчик даёт ему свой лист ──────
  // Свой лист — правится, бросается, пополняется из библиотеки и обновляется из справочника; чужой — нет;
  // пунктов меню рассказчика у игрока нет. Персонажи проверки удаляются в конце.
  // временный пользователь с ролью игрока (у пользователей мира может быть роль помощника — для ядра это тоже рассказчик)
  const player = await page.evaluate(async () => {
    const u = await User.create({ name: "E2E — игрок", role: CONST.USER_ROLES.PLAYER, password: "" });
    return u ? { id: u.id, name: u.name } : null;
  });
  const own = player && await page.evaluate(async uid => {
    const mine = await Actor.create({ name: "E2E — лист игрока", type: "vampire", ownership: { default: 0, [uid]: 3 },
      flags: { world: { e2e: true } } });
    await mine.createEmbeddedDocuments("Item", [{ name: "Каскадёр", type: "merit",
      system: { cost: 3, category: "physical", source: "Daredevil", description: "<p>Старый текст без разделов.</p>" } },
      // клановая черта, взятая до категории «Клановые»
      { name: "Убийца на тысячу метров", type: "merit", system: { cost: 2, category: "physical", source: "Thousand Meter Killer", description: "<p>Старый текст.</p>" } }]);
    const other = await Actor.create({ name: "E2E — чужой лист", type: "vampire", ownership: { default: 0 }, flags: { world: { e2e: true } } });
    // дампир и охотник игрока: Кровные права за опыт, витэ, Грани по бюджету Добродетели (в т. ч. из книги кредо)
    const SYS = game.system.id, mk = async (name, type, system) => {
      const x = await Actor.create({ name, type, system, ownership: { default: 0, [uid]: 3 }, flags: { world: { e2e: true } } });
      await x.setFlag(SYS, "created", true);
      return x;
    };
    const dh = await mk("E2E — дампир игрока", "ghoul", { ghoulType: "dhampir", experience: { total: 7 }, blood: { value: 5 },
      dhampir: { antecedentClan: "brujah", bloodrights: {} } });
    // Мощь 1 — у дампира с создания; «Мощь тела» (thew) без неё игроку не купить
    await dh.createEmbeddedDocuments("Item", [{ name: "Мощь", type: "discipline", system: { key: "potence", value: 1 } }]);
    const hu = await mk("E2E — охотник игрока", "hunter", { hunter: { creed: "visionary", mercy: 1, vision: 3, zeal: 1, conviction: 5, edges: [] } });
    return { mine: mine.id, other: other.id, dh: dh.id, hu: hu.id };
  }, player.id);
  let pp = null;
  if (player) await check(`Игрок: вход (${player.name})`, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    pp = await ctx.newPage();
    pp.on("pageerror", e => errors.push({ step, text: `[игрок] ${String(e.message ?? e)}` }));
    pp.on("console", m => { if (m.type() === "error" && !IGNORE.some(re => re.test(m.text()))) errors.push({ step, text: `[игрок] ${m.text()}` }); });
    await pp.goto(`${URL}/join`, { waitUntil: "networkidle", timeout: 60000 });
    await joinAs(pp, { name: player.name, id: player.id });
    await pp.waitForFunction(() => window.game?.ready === true, null, { timeout: 120000 }).catch(() => {
      throw new Error("не вошёл — у игрока пароль? проверки игрока пропущены");
    });
  });
  else results.push({ name: "Игрок: права", ok: true, note: "пропущено — в мире нет свободного игрока" });

  if (pp && results.at(-1)?.ok) {
    await check("Игрок: свой лист правится и бросается", async () => {
      const r = await pp.evaluate(async id => {
        const a = game.actors.get(id), n = game.messages.size;
        await a.sheet.render({ force: true });
        await new Promise(res => setTimeout(res, 800));
        await a.update({ "system.attributes.strength.value": 3 });
        return { owner: a.isOwner, editable: a.sheet.isEditable, str: a.system.attributes.strength.value, n,
          controls: a.sheet._getHeaderControls().map(c => c.action) };
      }, own.mine);
      if (!r.owner || !r.editable || r.str !== 3) throw new Error(`владение ${r.owner}, правка ${r.editable}, Сила ${r.str}`);
      if (r.controls.includes("makeExtra")) throw new Error("у игрока пункт рассказчика «Сделать статистом»");
      if (!r.controls.includes("refreshCodex")) throw new Error("у игрока нет «Обновить из справочника»");
      await pp.evaluate(id => document.querySelector(`.application.sheet[id$="${id}"] a[data-action=rollTrait]`).click(), own.mine);
      await pp.waitForSelector(".r-roll-dialog", { timeout: 10000 });
      await pp.click(".r-roll-dialog button[type=submit]");
      await pp.waitForFunction(n => game.messages.size > n, r.n, { timeout: 15000 });
    });

    await check("Игрок: библиотека пополняет свой лист", async () => {
      const r = await pp.evaluate(async id => {
        const a = game.actors.get(id), before = a.items.size;
        const { openLibrary } = await import(`/systems/${game.system.id}/module/apps/library.mjs`);
        const app = openLibrary({ actor: a, kind: "derangement" });
        await new Promise(res => setTimeout(res, 1500));
        const btn = app.element.querySelector("[data-can='1'] [data-action=take]");
        if (!btn) { await app.close(); return { skip: true }; }
        btn.click();
        await new Promise(res => setTimeout(res, 1200));
        await app.close();
        return { added: a.items.size - before };
      }, own.mine);
      if (!r.skip && r.added !== 1) throw new Error(`взято записей: ${r.added}`);
    });

    await check("Игрок: «Обновить из справочника»", async () => {
      await pp.evaluate(async id => {
        const { refreshActor } = await import(`/systems/${game.system.id}/module/apps/codex-refresh.mjs`);
        refreshActor(game.actors.get(id));
      }, own.mine);
      await pp.waitForSelector(".r-refresh .r-refresh-row", { timeout: 10000 });
      await pp.click(".r-refresh button[data-action=ok]");
      await pp.waitForFunction(id => /class="r-sec"/.test(game.actors.get(id).items.getName("Каскадёр")?.system.description ?? ""),
        own.mine, { timeout: 10000 });
      const k = await pp.evaluate(id => game.actors.get(id).items.getName("Убийца на тысячу метров")?.system, own.mine);
      if (k?.category !== "clan" || k?.clan !== "assamite") throw new Error(`клановая черта: категория ${k?.category}, клан ${k?.clan}`);
    });

    await check("Игрок: чужой лист закрыт", async () => {
      const r = await pp.evaluate(async id => {
        const a = game.actors.get(id);
        if (!a) return { hidden: true };
        // сама попытка правки пишет отказ ядра в консоль — проверяем право, а не ошибку
        return { owner: a.isOwner, canUpdate: a.canUserModify(game.user, "update"), visible: a.visible };
      }, own.other);
      if (!r.hidden && (r.owner || r.canUpdate || r.visible)) throw new Error(`владение ${r.owner}, правка ${r.canUpdate}, виден ${r.visible}`);
    });

    await check("Игрок: дампир — Кровное право за опыт, витэ", async () => {
      const r = await pp.evaluate(async id => {
        const SYS = game.system.id, a = game.actors.get(id), wait = ms => new Promise(res => setTimeout(res, ms));
        const D = await import(`/systems/${SYS}/module/apps/dhampir.mjs`);
        await a.sheet.render({ force: true }); await wait(800);
        const out = { cls: a.sheet.element.classList.contains("is-dhampir"), list: !!a.sheet.element.querySelector(".r-dh-add") };
        // покупка за опыт — окно подтверждения, жмём «да»
        const buy = D.addBloodright(a, "thew"); await wait(600);
        [...foundry.applications.instances.values()].find(x => x.constructor.name === "DialogV2" && x.rendered)?.element.querySelector("button[data-action=yes], footer button")?.click();
        await buy; await wait(300);
        out.thew = a.system.dhampir.bloodrights.thew ?? 0; out.xp = a.system.experience.available;
        // опыта больше нет — игроку даром не выдаётся
        await D.addBloodright(a, "fettle"); await wait(300);
        out.free = a.system.dhampir.bloodrights.fettle ?? 0;
        const b0 = a.system.blood.value; await a.drinkVitae(1); out.blood = a.system.blood.value - b0;
        await a.sheet.close();
        return out;
      }, own.dh);
      if (!r.cls || !r.list) throw new Error(`лист дампира у игрока: класс ${r.cls}, список прав ${r.list}`);
      if (r.thew !== 1 || r.xp !== 0) throw new Error(`Кровное право за опыт: уровень ${r.thew}, опыта осталось ${r.xp}`);
      if (r.free) throw new Error("игроку без опыта Кровное право выдано даром");
      if (r.blood !== 1) throw new Error(`витэ не восполнило кровь: ${r.blood}`);
    });

    await check("Игрок: охотник — Грани по бюджету, Грань из книги кредо, второе зрение", async () => {
      const r = await pp.evaluate(async id => {
        const SYS = game.system.id, a = game.actors.get(id);
        const H = await import(`/systems/${SYS}/module/apps/hunter.mjs`);
        const out = {};
        out.book = await H.takeEdge(a, "visionary|1|vb");                // Сосредоточение (Hunter Book: Visionary), 1 очко Прозрения
        out.two = await H.takeEdge(a, "visionary|2");                   // прошлый уровень закрыт Гранью из книги; 1 + 2 = 3
        out.three = H.edgeReasons(a, "visionary|3").length;              // бюджет Прозрения исчерпан
        out.edges = [...a.system.hunter.edges];
        const c0 = a.system.hunter.conviction; await H.secondSight(a); out.conv = c0 - a.system.hunter.conviction;
        return out;
      }, own.hu);
      if (!r.book || !r.two) throw new Error(`Грани: из книги ${r.book}, II уровень ${r.two} (${r.edges.join(", ")})`);
      if (!r.three) throw new Error("Грань III взята сверх бюджета Прозрения");
      if (r.conv !== 1) throw new Error(`второе зрение: −${r.conv} Убеждённости`);
    });
    await pp.context().close();
  }
  if (own) await page.evaluate(ids => Actor.deleteDocuments([ids.mine, ids.other, ids.dh, ids.hu].filter(id => game.actors.has(id))), own);
  if (player) await page.evaluate(id => game.users.get(id)?.delete(), player.id);
  // Маг (M20): мастер (фракция, Дом, Квинтэссенция за свободные пункты, Факты Технократии), лист Нефанда с Квлифами,
  // чародейство одной карточкой, худ («Магия», ротэ), справочники линеек, генератор НПС
  await check("Маг: мастер, Нефанди, чародейство, худ, справочники, генератор НПС", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const out = {}, inst = () => [...foundry.applications.instances.values()];
      const mk = (name, system = {}) => Actor.create({ name, type: "mage", flags: { world: { e2e: true }, [sid]: { created: true } }, system });
      // мастер
      const raw = await Actor.create({ name: "E2E — ученик Гермеса", type: "mage", flags: { world: { e2e: true } } });
      await game.vtm20.openCreator(raw); await wait(700);
      const cr = inst().find(x => x.constructor.name === "VtMCreator");
      Object.assign(cr.st.mg, { faction: "order-of-hermes", group: "traditions", sub: "flambeau", essence: "dynamic", affinity: "forces" });
      const ctx = await cr._prepareContext({});
      out.steps = cr.steps.includes("mage");
      out.subs = ctx.mage?.subs?.length >= 10 && ctx.mage.subs.some(x => x.active && x.sym);
      out.techBgHidden = !(ctx.bgCards ?? []).some(b => /Requisitions|Secret Weapons/.test(b.en ?? ""));
      const left0 = cr.freeLeft; cr.st.free.quint = 2;
      out.quint = [left0 - cr.freeLeft, cr.mageQuint - cr.mageAvatar];
      cr.st.mg.faction = "iteration-x";
      out.techBgShown = (await cr._prepareContext({})).bgCards.some(b => /Requisitions/.test(b.en ?? ""));
      cr.st.mg.faction = "infernalists";
      out.fallen = [cr.mageFallen, cr.mageTech];
      await cr.close(); await raw.delete();
      // лист Нефанда: гамма, Квлифы у Сфер, знак открывает справочник
      const a = await mk("E2E — малфеан", { willpower: { permanent: 6, temporary: 6 }, mage: { faction: "malfeans", arete: 3, affinity: "entropy", quintessence: 4,
        spheres: { entropy: 3, life: 1 }, rotes: [{ name: "E2E — гниль", spheres: "Энтропия 2", text: "" }] } });
      await a.sheet.render(true); await wait(700); a.sheet.changeTab("disciplines", "primary"); await wait(500);
      const el = a.sheet.element;
      out.sheet = [el.classList.contains("r-mage-fallen"), el.querySelectorAll(".r-qliph").length, el.querySelector(".r-rail-sigil")?.dataset.action];
      await a.sheet.close();
      // черты Падших — только Нефанду
      const C = game.vtm20Codex, V = CONFIG.VTM20 ?? game.vtm20.config, nm = C.merits.find(m => m.nephandi);
      out.traits = [!!nm, V.traitFor(nm, { type: "mage", nephandi: true }), V.traitFor(nm, { type: "mage" })];
      // чародейство: окно → бросок → одна карточка с блоком мага
      const Mg = await sys("module/apps/mage.mjs"), n0 = game.messages.size;
      Mg.castRote(a, 0); await wait(800);
      const dlg = inst().find(x => x.element?.classList.contains("r-cast-dialog"));
      out.castDlg = [!!dlg, !!dlg?.element.classList.contains("r-mage-fallen")];
      dlg?.element.querySelector('button[data-action="ok"]')?.click(); await wait(1500);
      const msgs = game.messages.contents.slice(n0);
      out.cast = [msgs.length, !!msgs[0]?.flags?.[sid]?.roll?.extra?.mage];
      // худ: вкладка «Магия» и ротэ
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const [td] = await scene.createEmbeddedDocuments("Token", [await a.getTokenDocument({ x: 300, y: 2900 })]);
      for (let i = 0; i < 30 && !canvas.tokens.get(td.id); i++) await wait(100);
      canvas.tokens.get(td.id)?.control({ releaseOthers: true }); await wait(600);
      document.querySelector('#r-hud [data-act="tab"][data-tab="magic"]')?.click(); await wait(300);
      const q0 = canvas.tokens.get(td.id).actor.system.mage.quintessence;
      document.querySelector('#r-hud [data-act="mageQuint"][data-d="1"]')?.click(); await wait(500);
      out.hud = [document.querySelector("#r-hud").classList.contains("is-fallen"), !!document.querySelector('#r-hud [data-act="mageCast"]'), canvas.tokens.get(td.id).actor.system.mage.quintessence - q0];
      document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
      document.querySelector('#r-hud [data-act="pop"][data-pop="rotes"]')?.click(); await wait(300);
      out.hudRote = !!document.querySelector('#r-hud .rh-pop-row[data-act="rote"]');
      document.querySelector('#r-hud [data-act="popClose"]')?.click();
      await scene.deleteEmbeddedDocuments("Token", [td.id]);
      // справочники
      const am = await game.vtm20.openAtlas("mage", "order-of-hermes"); await wait(600);
      out.atlasMage = [am.element.querySelectorAll(".r-cl-groups a").length, am.element.querySelectorAll(".r-at-row").length, am.element.querySelector(".r-cl-head h2")?.textContent.trim()];
      am.show("qliph:10"); await wait(400);
      out.atlasQliph = am.element.querySelector(".r-cl-head h2")?.textContent.trim();
      await am.close();
      const aw = await game.vtm20.openAtlas("werewolf", "bastet"); await wait(600);
      out.atlasWolf = [aw.element.querySelectorAll(".r-cl-groups a").length, aw.element.querySelector(".r-cl-head h2")?.textContent.trim(), aw.element.querySelectorAll(".r-cl-trait").length > 5];
      await aw.close();
      // генератор НПС: маг, технократ, Нефанд — Сферы не выше Арете, точка в родовой, Квинтэссенция по Аватару
      const B = await sys("module/apps/npc-build.mjs"), groups = { mage: ["traditions", "disparates"], technocrat: ["technocracy"], nephandus: ["nephandi"] };
      out.npc = [];
      for (const [k, gs] of Object.entries(groups)) for (const power of ["mook", "veteran"]) {
        const d = B.buildNpc({ kind: k, power }), m = d.system.mage, f = C.mage.factions.find(x => x.key === m.faction);
        out.npc.push(gs.includes(f?.group) && Math.max(...Object.values(m.spheres)) <= m.arete && m.spheres[m.affinity] >= 1 && m.quintessence >= 1 && m.arete <= d.system.willpower.permanent);
      }
      const made = await B.createNpc(B.buildNpc({ kind: "nephandus", power: "seasoned" }), { name: "E2E — НПС Нефанд" });
      await made.setFlag("world", "e2e", true);
      out.npcMade = [made.type, !made.sheet.needsCreation, made.items.some(i => /Аватар|Гений/.test(i.name))];
      await ChatMessage.deleteDocuments(game.messages.contents.slice(n0).map(m => m.id));
      await Actor.deleteDocuments([a.id, made.id]);
      return out;
    });
    const want = { steps: true, subs: true, techBgHidden: true, quint: [2, 8], techBgShown: true, fallen: [true, false], sheet: [true, 9, "lineAtlas"], traits: [true, true, false],
      castDlg: [true, true], cast: [1, true], hud: [true, true, 1], hudRote: true, atlasMage: [14, 11, "Орден Гермеса"], atlasQliph: "Лилит", atlasWolf: [4, "Бастет", true],
      npc: [true, true, true, true, true, true], npcMade: ["mage", true, true] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  await check("Маг: ротэ одним броском, Резонанс, Безмолвие, Изъяны, Поиск, Чудеса, Мародёр, перетаскивание из компендиев", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const out = {}, inst = () => [...foundry.applications.instances.values()], n0 = game.messages.size;
      const Mg = await sys("module/apps/mage.mjs"), St = await sys("module/apps/mage-state.mjs"), C = game.vtm20Codex.mage;
      const mk = (name, mage) => Actor.create({ name, type: "mage", flags: { world: { e2e: true }, [sid]: { created: true } },
        system: { willpower: { permanent: 6, temporary: 6 }, experience: { total: 60 }, mage: { arete: 3, affinity: "forces", quintessence: 5, spheres: { forces: 3, prime: 2 }, ...mage } } });
      const a = await mk("E2E — гермет", { faction: "order-of-hermes", rotes: [{ name: "E2E — шар", spheres: "Силы 3, Первоначало 2", text: "", kind: "vulgar" }],
        resonances: [{ name: "Яростный", flavor: "temperamental", value: 4 }], quiet: { level: 2, kind: "madness" } });
      // данные справочника
      out.data = [C.wonders.length > 40, C.merits.filter(m => m.investment).length, C.factions.filter(f => f.group === "marauders").length, C.quiet.levels.length, C.pflaws.length];
      // ротэ: вид со Сферами и сложностью; быстрый бросок — без окна, вид магии из записи
      const rv = Mg.roteView(a, a.system.mage.rotes[0], 0);
      out.roteView = [rv.chips.length, rv.kind, rv.difficulty];
      const roll = await Mg.castRote(a, 0, { fast: true }); await wait(400);
      const x = roll?.message?.flags?.[sid]?.roll?.extra?.mage;
      out.roteFast = [!inst().some(w => w.element?.classList.contains("r-cast-dialog")), x?.kind, x?.high, roll?.difficulty ?? roll?.message?.flags?.[sid]?.roll?.difficulty];
      // окно: Резонанс даёт кубики раз за историю, «запомнить как ротэ» пишет запись
      await a.update({ "system.mage.paradox": 0 });
      Mg.castEffect(a, { sphere: "forces", name: "E2E — молния" }); await wait(700);
      const dlg = inst().find(w => w.element?.classList.contains("r-cast-dialog")), el = dlg.element;
      const res = el.querySelector('[name="res"]'), save = el.querySelector('[name="save"]');
      res.checked = true; res.dispatchEvent(new Event("change")); save.checked = true; save.dispatchEvent(new Event("change"));
      out.resDice = Number(el.querySelector("[data-pool]").textContent);
      el.querySelector('button[data-action="ok"]').click(); await wait(1500);
      out.resUsed = [a.system.mage.resUsed, a.system.mage.rotes.length, a.system.mage.rotes[1]?.name, a.system.mage.rotes[1]?.kind];
      // Безмолвие: выход тратит Волю и бросает Волю
      const w0 = a.system.willpower.temporary, m0 = game.messages.size;
      await St.quietExit(a); await wait(600);
      out.quiet = [w0 - a.system.willpower.temporary, game.messages.size - m0 >= 2, St.quietLevelFor(12), St.flawGradeFor(7)?.key];
      // вкладка: блоки состояний рисуются
      await a.sheet.render(true); await wait(700); a.sheet.changeTab("disciplines", "primary"); await wait(500);
      out.sheet = [a.sheet.element.querySelectorAll(".r-mstate").length, a.sheet.element.querySelectorAll(".r-mstate-row").length >= 5, !!a.sheet.element.querySelector('[data-action="mageQuietExit"]')];
      // Поиск: без него Арете за опыт не купить; Принятие открывает покупку, покупка «расходует» Поиск
      await a.update({ "system.mage.seeking": true });
      const before = a.system.mage.arete;
      await a.buyWithXp({ doc: a, path: "system.mage.arete", kind: "mageArete", label: "Арете", confirm: false });
      out.seeking = [a.system.mage.arete - before];
      // Чудеса: перетаскивание из компендия, вид на листе, бросок Арете Чуда тратит его запас
      const pack = game.packs.get(`${sid}.mage-wonders`), idx = await pack.getIndex();
      const lash = await pack.getDocument(idx.find(i => i.name === "Плеть Галлу")._id), tass = await pack.getDocument(idx.find(i => i.name === "Золотой Тасс")._id);
      await a.sheet._onDropItem(new DragEvent("drop"), lash); await a.sheet._onDropItem(new DragEvent("drop"), tass); await wait(300);
      const wv = St.wondersView(a);
      out.wonders = [wv.length, wv.find(w => w.name === "Плеть Галлу")?.chips.length, wv.find(w => w.name === "Плеть Галлу")?.canUse, wv.find(w => w.name === "Золотой Тасс")?.holds];
      const q0 = a.system.mage.quintessence, tItem = a.items.getName("Золотой Тасс");
      await St.wonderQuint(a, tItem.id, 1);
      out.wonderQuint = [a.system.mage.quintessence - q0, tItem.system.quintessence];
      St.useWonder(a, a.items.getName("Плеть Галлу").id); await wait(700);
      const wd = inst().find(w => w.element?.classList.contains("r-cast-dialog"));
      out.wonderDlg = [!!wd, Number(wd?.element.querySelector("[data-pool]")?.textContent), !wd?.element.querySelector('[name="save"]')];
      await wd?.close(); await wait(200);
      // перетаскивание Достоинства и Факта из компендиев магов — обычные предметы листа
      for (const [p, type] of [["mage-merits", "merit"], ["mage-backgrounds", "background"]]) {
        const pk = game.packs.get(`${sid}.${p}`), ix = await pk.getIndex(), doc = await pk.getDocument(ix.find(i => i.type === type)._id);
        await a.sheet._onDropItem(new DragEvent("drop"), doc);
      }
      await wait(300);
      out.drop = [a.items.filter(i => i.type === "merit").length, a.items.filter(i => i.type === "background").length];
      await a.sheet.close();
      // Чудо с постоянным Парадоксом занимает колесо владельца
      await a.items.getName("Плеть Галлу").update({ "system.paradoxPerm": 2 });
      out.perm = [Mg.permOf(a), Mg.paradoxOf(a) >= 2];
      await a.items.getName("Плеть Галлу").update({ "system.paradoxPerm": 0 });
      // Инвестиции Падшего: Регенерация лечит рану за Волю
      const fl = await mk("E2E — падший", { faction: "malfeans" });
      const mp = game.packs.get(`${sid}.mage-merits`), mi = await mp.getIndex(), reg = await mp.getDocument(mi.find(i => i.name === "Регенерация")._id);
      await fl.createEmbeddedDocuments("Item", [reg.toObject()]);
      await fl.update({ "system.health.lethal": 2 });
      const iv = St.investmentsView(fl), w1 = fl.system.willpower.temporary;
      await St.useMageInvestment(fl, iv[0].id, iv[0].act); await wait(300);
      out.invest = [iv.length, iv[0].act, w1 - fl.system.willpower.temporary, fl.system.health.lethal];
      // Пакты: очки по уровню и вложенное; Очарование — социальный бросок со сложностью 4; маг-гуль получает Могущество
      await fl.update({ "system.mage.pacts": [{ level: 5, patron: "E2E", terms: "" }] });
      const pv = St.pactsView(fl);
      out.pact = [pv.total, pv.spent, pv.over];
      const charm = await mp.getDocument(mi.find(i => i.name === "Люциферианское очарование")._id);
      await fl.createEmbeddedDocuments("Item", [charm.toObject()]);
      const { RollDialog } = await sys("module/dice/dialog.mjs");
      out.charm = [new RollDialog(fl, { trait1: "attributes.charisma" }).values.difficulty, new RollDialog(fl, { trait1: "attributes.strength" }).values.difficulty];
      await St.toggleGhoul(fl); await wait(300);
      out.ghoul = [fl.system.mage.ghoul.on, fl.system.mage.ghoul.vitae, fl.discipline("potence")];
      // Дух Парадокса листом духа и создание Чуда (окна выбора подменяем ответом)
      const DV = foundry.applications.api.DialogV2, dp0 = DV.prompt, dw0 = DV.wait;
      DV.prompt = async () => "hex"; const psp = await St.paradoxSpirit(a); DV.prompt = dp0;
      await a.update({ "system.mage.quintessence": 8 });
      DV.wait = async () => ({ name: "E2E — жезл", kind: "talisman", value: 1, spheres: "Силы 1" }); const crafted = await St.craftWonder(a); DV.wait = dw0;
      out.craft = [psp?.system.spirit.on, a.system.mage.quintessence, crafted?.system.arete];
      await psp?.delete();
      // Царство Парадокса — запись в чат; Пакт через окно; маг-гуль лечит рану кровью
      const nr = game.messages.size;
      DV.prompt = async () => "time"; const realm = await St.paradoxRealm(a); DV.prompt = dp0;
      DV.prompt = async () => ({ level: 3, patron: "E2E — Патрон", terms: "служба" }); await St.addPact(fl); DV.prompt = dp0;
      await fl.update({ "system.mage.ghoul.vitae": 2, "system.health.lethal": 1 });
      await St.ghoulHeal(fl); await wait(300);
      out.more = [!!realm && game.messages.size > nr, fl.system.mage.pacts.length, fl.system.mage.pacts.at(-1)?.level, St.pactsView(fl).total,
        fl.system.mage.ghoul.vitae, fl.system.health.lethal];
      // данные: Духи и Царства Парадокса; мастер: Резонанс за свободные пункты (новая степень × 3)
      out.spirits = [C.paradoxSpirits.length >= 8, Object.keys(C.realms).length];
      const raw = await Actor.create({ name: "E2E — резонанс", type: "mage", flags: { world: { e2e: true } } });
      await game.vtm20.openCreator(raw); await wait(700);
      const cr = inst().find(w => w.constructor.name === "VtMCreator"), l0 = cr.freeLeft;
      cr.st.free.res = 2;
      out.crRes = [cr.mageRes, l0 - cr.freeLeft];
      await cr.close(); await raw.delete();
      // кабал: лист в гамме магов, маг вбирает из запаса чантри, неделя Узла пополняет запас
      const cab = await Actor.create({ name: "E2E — кабал", type: "coterie", flags: { world: { e2e: true } }, system: { kind: "cabal", members: [a.id], chantry: { points: 34, node: 3, quint: 1 } } });
      await cab.sheet.render(true); await wait(700);
      const cq = a.system.mage.quintessence;
      cab.sheet.element.querySelector('[data-action="nodeDraw"]').click(); await wait(500);
      cab.sheet.element.querySelector('[data-action="nodeWeek"]').click(); await wait(600);
      out.cabal = [cab.sheet.element.classList.contains("r-type-mage"), a.system.mage.quintessence - cq, cab.system.chantry.quint, cab.system.chantry.tass];
      await cab.sheet.close(); await cab.delete();
      // откат: кнопки рассказчика — Изъян по степени, постоянный Парадокс
      await a.update({ "system.mage.paradox": 6 });
      const bl = await Mg.paradoxBacklash(a); await wait(500);
      out.backlash = !!bl?.message?.flags?.[sid]?.roll?.extra?.backlash;
      // Мародёр: совпадение без Парадокса даже при провале, вульгарная магия без «автоматического» очка
      const mar = await mk("E2E — мародёр", { faction: "marauder", quiet: { level: 3, kind: "" } });
      const sv = St.stateView(mar, () => []);
      out.marauder = [Mg.isMarauder(mar), sv.quiet.insulate, Mg.factionGlyph(Mg.factionOf(mar))];
      await ChatMessage.deleteDocuments(game.messages.contents.slice(n0).map(m => m.id));
      await Actor.deleteDocuments([a.id, mar.id, fl.id]);
      return out;
    });
    const want = { data: [true, 16, 3, 6, 5], roteView: [2, "vulgar", 7], roteFast: [true, "vulgar", 3, 7], resDice: 5, resUsed: [true, 2, "E2E — молния", "coincidental"],
      quiet: [1, true, 4, "minor"], sheet: [2, true, true], seeking: [1], wonders: [2, 5, true, true], wonderQuint: [1, 14], wonderDlg: [true, 3, true],
      drop: [1, 1], perm: [2, true], invest: [1, "regen", 1, 1], pact: [5, 9, true], charm: [4, 6], ghoul: [true, 1, 1], more: [true, 2, 3, 8, 1, 0], craft: [true, 3, 1], spirits: [true, 9], crRes: [3, 15], cabal: [true, 1, 3, 3], backlash: true, marauder: [true, 15, "group-marauders"] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Маг против мира и мага (apps/mage-duel.mjs): шаг в сторону длительным броском, контрмагия, сертамен;
  // справочник охотника по знаку листа; «Моя ночь» — сводка игрока шёпотом
  await check("Маг: шаг в сторону, контрмагия, сертамен; справочник охотника; «Моя ночь»", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const out = {}, inst = () => [...foundry.applications.instances.values()], n0 = game.messages.size;
      const mk = (name, mage) => Actor.create({ name, type: "mage", flags: { world: { e2e: true }, [sid]: { created: true } },
        system: { willpower: { permanent: 7, temporary: 7 }, attributes: { wits: { value: 4 } }, mage } });
      const a = await mk("E2E — странник", { faction: "dreamspeakers", arete: 5, affinity: "spirit", quintessence: 6, spheres: { spirit: 3, prime: 2, forces: 3 } });
      const b = await mk("E2E — соперник в круге", { faction: "order-of-hermes", arete: 3, affinity: "forces", quintessence: 20, spheres: { forces: 2 } });
      const D = await sys("module/apps/mage-duel.mjs");
      const dlg = () => inst().find(x => x.element?.classList.contains("r-mduel"));
      const go = async (fn, pickKey, fill) => { fn(); await wait(600); const d = dlg(); if (!d) return false;
        if (pickKey) { const i = d.element.querySelector(`input[name="v"][value="${pickKey}"]`); if (i) i.checked = true; } fill?.(d.element);
        d.element.querySelector('button[data-action="ok"]').click(); await wait(1300); return true; };
      const last = () => game.messages.contents.at(-1)?.flags?.[sid]?.roll;
      // шаг в сторону: без Духа 3 — отказ; у Узла (сл. 3, 1 успех) — до успеха, потом возврат
      const weak = await mk("E2E — без Духа", { arete: 2, spheres: { spirit: 1 } });
      await D.stepSideways(weak); await wait(300); out.needSpirit = !dlg();
      let tries = 0; const par0 = a.system.mage.paradox;
      while (!D.inUmbra(a) && tries++ < 8) { await go(() => D.stepSideways(a), "node"); if (dlg()) await dlg().close(); }
      out.step = [D.inUmbra(a), last()?.extra?.mduel?.kind, a.system.mage.paradox - par0];
      await D.stepSideways(a); await wait(400); out.back = !D.inUmbra(a);
      // контрмагия: развеять — минус 1 Квинтэссенция, сложность 8; блок карточки с чипами
      const q0 = a.system.mage.quintessence;
      await go(() => D.counterMagic(a), "dispel");
      const cm = last(); out.counter = [cm?.extra?.mduel?.mode, cm?.difficulty, q0 - a.system.mage.quintessence >= 1];
      // сертамен: цель — соперник; сложность — его высшая Сфера + 3; успехи переносят Квинтэссенцию
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const made = await scene.createEmbeddedDocuments("Token", await Promise.all([a, b].map((x, i) => x.getTokenDocument({ x: 300 + i * 200, y: 3100 }))));
      for (let i = 0; i < 30 && !canvas.tokens.get(made[1].id); i++) await wait(100);
      canvas.tokens.get(made[1].id)?.setTarget(true, { releaseOthers: true }); await wait(300);
      const qa = a.system.mage.quintessence, qb = b.system.mage.quintessence;
      await go(() => D.certamen(a), "forces");
      const ce = last(), ev = (await sys("module/dice/roll.mjs")).evaluate(ce.values, ce);
      out.certamen = [ce?.extra?.mduel?.kind, ce?.difficulty, ce?.pool, qb - b.system.mage.quintessence === Math.min(ev.successes ?? 0, qb) && a.system.mage.quintessence - qa === Math.min(ev.successes ?? 0, qb)];
      canvas.tokens.get(made[1].id)?.setTarget(false); await scene.deleteEmbeddedDocuments("Token", made.map(x => x.id));
      out.cards = game.messages.contents.slice(n0).every(m => !m.flags?.[sid]?.roll?.extra?.mduel || /r-line-chip/.test(m.content));
      // справочник охотника: знак листа открывает его на кредо
      const h = await Actor.create({ name: "E2E — мститель", type: "hunter", flags: { world: { e2e: true }, [sid]: { created: true } }, system: { hunter: { creed: "vengeance" } } });
      await h.sheet.render(true); await wait(700);
      out.hunterSigil = h.sheet.element.querySelector(".r-rail-sigil")?.dataset.action;
      h.sheet.element.querySelector(".r-rail-sigil")?.click(); await wait(900);
      const at = foundry.applications.instances.get("r-atlas-hunter");
      out.hunterAtlas = [!!at, at?.element.querySelectorAll(".r-cl-groups a").length, at?.element.querySelectorAll(".r-cl-trait").length >= 5, at?.element.classList.contains("r-type-hunter")];
      await at?.close(); await h.sheet.close();
      // «Моя ночь»: карточка шёпотом себе, с Квинтэссенцией мага
      const m0 = game.messages.size; await game.vtm20.myNight(); await wait(500);
      const mn = game.messages.contents.at(-1);
      out.myNight = [game.messages.size - m0, mn?.whisper?.length === 1 && mn.whisper[0] === game.user.id, /r-night-sum/.test(mn?.content ?? "")];
      await ChatMessage.deleteDocuments(game.messages.contents.slice(n0).map(m => m.id));
      await Actor.deleteDocuments([a.id, b.id, weak.id, h.id]);
      return out;
    });
    const want = { needSpirit: true, step: [true, "step", 1], back: true, counter: ["dispel", 8, true], certamen: ["certamen", 5, 7, true], cards: true,
      hunterSigil: "lineAtlas", hunterAtlas: [true, 2, true, true], myNight: [1, true, true] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Колдун и консор (apps/sorcerer.mjs): отметка на листе смертного, нумины с пределами, бросок Пути и феномена за Волю, генератор НПС
  await check("Колдун и консор: нумины, пределы, бросок Пути и феномена, генератор НПС", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const out = {}, inst = () => [...foundry.applications.instances.values()], S = await sys("module/apps/sorcerer.mjs");
      const a = await Actor.create({ name: "E2E — колдун Арканума", type: "mortal", flags: { world: { e2e: true }, [sid]: { created: true } },
        system: { willpower: { permanent: 6, temporary: 6 }, attributes: { intelligence: { value: 4 } }, abilities: { occult: { value: 3 } }, sorcerer: { on: true, affiliation: "the-arcanum", attr: "intelligence" } } });
      out.data = [S.S().paths.length, S.S().psychic.length, S.S().affiliations.length >= 15, S.S().consor.roles.length];
      await S.addNumen(a, "hellfire"); await S.numenAbility(a, "hellfire", "occult"); await S.numenDots(a, "hellfire", 4);
      await S.addNumen(a, "telepathy"); await S.numenDots(a, "telepathy", 2);
      await a.update({ "system.consor": { on: true, kind: "acolyte", role: "cleaners", faction: "order-of-hermes" } });
      await a.sheet.render(true); await wait(700); a.sheet.changeTab("advantages", "primary"); await wait(500);
      const el = a.sheet.element;
      // Адское пламя 4 при Оккультизме 3 — выше предела; Телепатия 2 при Воле 6 — в пределе (3)
      out.sheet = [el.querySelectorAll(".is-sorc .r-sn-item").length, el.querySelectorAll(".is-sorc .r-sn-item.is-over").length, !!el.querySelector(".is-consor .r-sn-body")];
      await a.sheet.close();
      const dlg = () => inst().find(x => x.constructor.name === "RollDialog");
      S.useNumen(a, "hellfire"); await wait(700);
      let d = dlg(); const c1 = d?.compute?.(); out.path = [c1?.pool, c1?.effDifficulty ?? d?.values?.difficulty]; await d?.close();
      S.useNumen(a, "telepathy"); await wait(700);
      d = dlg(); const c2 = d?.compute?.(); out.psy = [c2?.pool, c2?.effDifficulty ?? d?.values?.difficulty]; await d?.close();
      const B = await sys("module/apps/npc-build.mjs");
      const sd = B.buildNpc({ kind: "sorcerer", power: "veteran" }), cd = B.buildNpc({ kind: "consor", power: "normal" });
      out.npc = [sd.actor, sd.system.sorcerer.on && sd.system.sorcerer.numina.length >= 1 && sd.system.sorcerer.numina.every(n => n.ability && n.dots <= (sd.system.abilities[n.ability]?.value ?? 0)),
        cd.system.consor.on && !!cd.system.consor.role];
      await a.delete();
      return out;
    });
    const want = { data: [21, 22, true, 10], sheet: [2, 1, true], path: [7, 8], psy: [6, 5], npc: ["mortal", true, true] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  await check("Колдун в мастере, Чудо в бою, недельный такт магов", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), sys = p => import(`/systems/${sid}/${p}`);
      const out = {}, inst = () => [...foundry.applications.instances.values()], n0 = game.messages.size;
      const St = await sys("module/apps/mage-state.mjs"), cal = await sys("module/apps/calendar.mjs");
      // мастер: отметка «колдун» даёт шаг нумин — 5 точек, 7 за свободный пункт, Воля 5; Пути и феномены не смешиваются
      const raw = await Actor.create({ name: "E2E — колдун", type: "mortal", flags: { world: { e2e: true } } });
      await game.vtm20.openCreator(raw); await wait(700);
      const cr = inst().find(w => w.constructor.name === "VtMCreator");
      cr.st.mark = "sorcerer"; cr.st.sorcAff = "aoar";
      out.rules = [cr.isSorcerer, cr.rules.disc, cr.rules.cost.disc, cr.steps.includes("disciplines"), cr.willpowerBase];
      cr.st.disc.alchemy = 3; cr.st.disc.divination = 2;
      out.rem = [cr.remaining().disc, cr.sorcIssues.length];
      const psy = game.vtm20Codex.mage.sorcerer.psychic[0].key;
      cr.st.disc[psy] = 1; out.mixed = cr.sorcIssues.length; delete cr.st.disc[psy];
      out.cards = (await cr._prepareContext({})).discCards.length >= 40;
      const w = cr.sorcWrite({});
      out.write = [w.on, w.affiliation, w.numina.length, w.numina.find(n => n.key === "alchemy")?.dots];
      await cr.close(); await raw.delete();
      // опыт колдуна: рост Пути × 7, первая нумина второго вида — 21, ритуал за опыт — его уровень
      const so = await Actor.create({ name: "E2E — колдун опыта", type: "mortal", flags: { world: { e2e: true }, [sid]: { created: true } },
        system: { experience: { total: 100 }, abilities: { occult: { value: 3 } }, sorcerer: { on: true, numina: [{ key: "alchemy", dots: 2, ability: "occult" }, { key: psy, dots: 0 }] } } });
      await so.buyWithXp({ doc: so, path: "system.sorcerer.numina.alchemy", kind: "sorcNumen", label: "A", confirm: false });
      await so.buyWithXp({ doc: so, path: `system.sorcerer.numina.${psy}`, kind: "sorcNumen", label: "B", confirm: false });
      const Sc = await sys("module/apps/sorcerer.mjs"), DVx = foundry.applications.api.DialogV2, dpx = DVx.prompt;
      DVx.prompt = async () => ({ name: "E2E — ритуал", path: "alchemy", level: 2, xp: true, text: "" }); await Sc.addRitual(so); DVx.prompt = dpx;
      out.sorcXp = [so.system.sorcerer.numina.map(n => n.dots).join(","), so.system.experience.spent, so.system.sorcerer.rituals.length];
      // худ: нумины и ритуалы колдуна
      const scene = game.scenes.viewed ?? game.scenes.contents[0];
      const [tk] = await scene.createEmbeddedDocuments("Token", [await so.getTokenDocument({ x: 300, y: 2900 })]);
      for (let i = 0; i < 30 && !canvas.tokens.get(tk.id); i++) await wait(100);
      canvas.tokens.get(tk.id)?.control({ releaseOthers: true }); await wait(600);
      document.querySelector('#r-hud [data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
      out.hudSorc = [!!document.querySelector('#r-hud [data-pop="numina"]'), !!document.querySelector('#r-hud [data-pop="sorcRituals"]')];
      await scene.deleteEmbeddedDocuments("Token", [tk.id]); await so.delete();
      // Чудо в бою: связанное оружие листа, уходит вместе с Чудом
      const a = await Actor.create({ name: "E2E — маг с клинком", type: "mage", flags: { world: { e2e: true }, [sid]: { created: true } }, system: { mage: { arete: 2, paradox: 3, spheres: { forces: 2 } } } });
      const [wd] = await a.createEmbeddedDocuments("Item", [{ name: "E2E — клинок", type: "wonder", system: { kind: "talisman", value: 2, arete: 2 } }]);
      const DV = foundry.applications.api.DialogV2, dp = DV.prompt;
      DV.prompt = async () => ({ as: "melee", damage: 3, strength: true, type: "aggravated", penalty: 0 });
      await St.armWonder(a, wd.id); DV.prompt = dp; await wait(300);
      const wp = a.items.find(i => i.type === "weapon");
      out.arm = [wp?.system.damage, wp?.system.damageType, St.wondersView(a)[0].armed];
      await wd.delete(); await wait(600);
      out.unlinked = a.items.filter(i => i.type === "weapon").length;
      // неделя хроники: Узел кабала отдаёт выработку, Парадокс ниже 5 утекает
      const cab = await Actor.create({ name: "E2E — кабал Узла", type: "coterie", flags: { world: { e2e: true } }, system: { kind: "cabal", chantry: { node: 2 } } });
      const week0 = game.settings.get(sid, "mageWeek"), c0 = cal.getClock();
      try {
        await game.settings.set(sid, "mageWeek", Math.floor((cal.nightNumber() - 1) / 7));
        await cal.setClock(c0 + 8 * 86400000); await St.mageWeekTick(); await wait(600);
        out.week = [cab.system.chantry.quint, cab.system.chantry.tass, a.system.mage.paradox];
      } finally { await cal.setClock(c0); await game.settings.set(sid, "mageWeek", week0); }
      await ChatMessage.deleteDocuments(game.messages.contents.slice(n0).map(m => m.id));
      // Безмолвие: гоблин листом существа, мир-разум — срок по Парадоксу, выход очищает Парадокс (кроме постоянного)
      await a.update({ "system.mage.paradox": 6, "system.mage.paradoxPerm": 1, "system.mage.quiet.level": 2 });
      const gob = await St.spawnHobgoblin(a);
      const v0 = await St.mindView(a);
      await a.update({ "system.mage.quiet.mind": cal.getClock() + 3 * 86400000 });
      const v1 = await St.mindView(a);
      await a.update({ "system.mage.quiet.mind": cal.getClock() - 1000 }); await St.mindExit(a);
      out.quiet = [gob?.type, v0.days, v1.left, a.system.mage.paradox, a.system.mage.quiet.level, a.system.mage.quiet.mind];
      await gob?.delete();
      await Actor.deleteDocuments([a.id, cab.id]);
      return out;
    });
    const want = { sorcXp: ["3,1", 37, 1], quiet: ["creature", 6, 3, 1, 0, null], hudSorc: [true, true], rules: [true, 5, 7, true, 5], rem: [0, 0], mixed: 1, cards: true, write: [true, "aoar", 2, 3], arm: [3, "aggravated", true], unlinked: 0, week: [2, 2, 2] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  await check("Голконда: условия, поиск учения, Отдохновение, невосприимчивость, кровь раз в неделю, потеря", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), out = {}, n0 = game.messages.size;
      const G = await import(`/systems/${sid}/module/apps/golconda.mjs`), V = await import(`/systems/${sid}/module/dice/virtue-checks.mjs`);
      const a = await Actor.create({ name: "E2E — ищущий Голконду", type: "vampire", flags: { world: { e2e: true }, [sid]: { created: true } },
        system: { generation: 13, blood: { value: 10 }, morality: { path: "humanity", value: 8 }, virtues: { conscience: { value: 4 } } } });
      out.elig = [G.golcondaEligible(a), a.system.traitMax];
      // Отдохновение — рассказчик: окно подменяем ответом «пройдено»
      await a.update({ "system.golconda.stage": "suspire" });
      const DV = foundry.applications.api.DialogV2, w0 = DV.wait; DV.wait = async () => "pass"; await G.suspire(a); DV.wait = w0;
      out.attained = [a.system.golconda.stage, a.system.traitMax];
      const m0 = game.messages.size; await V.rollVirtueCheck(a, "rotschreck"); out.shield = game.messages.size - m0;
      const b0 = a.system.blood.value; await a.awaken({ quiet: true }); await a.awaken({ quiet: true }); out.blood = b0 - a.system.blood.value;
      await a.update({ "system.attributes.strength.value": 7 }); await a.update({ "system.virtues.conscience.value": 3 }); await wait(600);
      out.lost = [G.golcondaActive(a), a.system.attributes.strength.value];
      await ChatMessage.deleteDocuments(game.messages.contents.slice(n0).map(m => m.id));
      await a.delete();
      return out;
    });
    const want = { elig: [true, 5], attained: ["attained", 10], shield: 1, blood: 1, lost: [false, 5] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  await check("Оборотни: вызов на Ранг и клайв; вампир: «Наложить бешенство»; обучение между историями", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), out = {}, n0 = game.messages.size;
      const CH = await import(`/systems/${sid}/module/apps/werewolf/challenge.mjs`), FE = await import(`/systems/${sid}/module/apps/werewolf/fetishes.mjs`);
      const TR = await import(`/systems/${sid}/module/apps/training.mjs`), { rollPool } = await import(`/systems/${sid}/module/dice/roll.mjs`);
      const g = await Actor.create({ name: "E2E — Гару на вызов", type: "werewolf", flags: { world: { e2e: true } },
        system: { werewolf: { auspice: "ahroun", rank: 1, gnosis: { permanent: 5, value: 5 }, renown: { glory: { permanent: 4, temporary: 0 }, honor: { permanent: 1, temporary: 0 }, wisdom: { permanent: 1, temporary: 0 } } } } });
      out.ready = CH.rankReady(g);
      const m = await ChatMessage.create({ content: `<div class="r-notice"><div class="r-card-buttons"><button type="button" data-r-challenge="Won">W</button></div></div>`,
        flags: { [sid]: { rankChallenge: { actor: g.uuid, to: 2, passage: false, unfair: false, target: "" } } } });
      await wait(400); document.querySelector(`[data-message-id="${m.id}"] [data-r-challenge]`)?.click(); await wait(1200);
      out.rank = [g.system.werewolf.rank, g.system.werewolf.renown.glory.temporary, g.system.werewolf.renown.honor.temporary];
      await FE.addFetish(g, "klaive"); await wait(1000);
      const k = g.items.find(i => i.type === "weapon");
      out.klaive = [k?.system.damage, k?.system.damageType, k?.system.silver, g.traitValue("werewolf.gnosis")];
      await FE.removeFetish(g, 0); await wait(1000);
      out.unklaive = [g.items.filter(i => i.type === "weapon").length, g.traitValue("werewolf.gnosis")];
      const v = await Actor.create({ name: "E2E — вампир в бешенстве", type: "vampire", flags: { world: { e2e: true } } });
      let rr; for (let i = 0; i < 10; i++) { rr = await rollPool({ actor: v, title: "E2E", pool: 1, difficulty: 10, kind: "frenzy" }); if (rr.outcome !== "success") break; }
      await wait(500);
      const mm = game.messages.contents.at(-1); document.querySelector(`[data-message-id="${mm.id}"] [data-r-action="succumb"]`)?.click(); await wait(1200);
      out.frenzy = v.statuses.has("r-frenzy");
      await v.update({ "system.experience.total": 30 });
      const ref = "a:system.attributes.strength.value:attribute";
      await TR.planTraining(v, ref, "Сила"); await TR.setMentor(v, ref, "Сир");
      const s0 = v.system.attributes.strength.value; await TR.finishTraining(v, ref);
      out.train = [v.system.attributes.strength.value - s0, TR.trainingOf(v).length, /×/.test(v.system.experience.log[0]?.reason) && /Сир/.test(v.system.experience.log[0]?.reason)];
      await ChatMessage.deleteDocuments(game.messages.contents.slice(n0).map(x => x.id));
      await Actor.deleteDocuments([g.id, v.id]);
      return out;
    });
    const want = { ready: true, rank: [2, 1, 2], klaive: [2, "aggravated", true, 4], unklaive: [0, 5], frenzy: true, train: [1, 0, true] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // Призрак (apps/wraith.mjs): лист с вкладкой Арканоев (известные половинки рангов: Аргос 3 — Общие I–III и Посвящённый I), уровень Арканоса (Пафос, Корпус), лечение Пафосом, Страсть,
  // Корпус до колебания и Испытание, Катарсис (Ангст выше Воли), Тёмная Страсть — шёпотом ведущему
  await check("Призрак: мастер создания — Легион, Гильдия, Арканои, Страсти и Оковы, торг с Тенью, Тень", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), out = {}, inst = () => [...foundry.applications.instances.values()];
      const a = await Actor.create({ name: "E2E — новопреставленный", type: "wraith", flags: { world: { e2e: true } } });
      out.gate = a.sheet.needsCreation;
      await game.vtm20.openCreator(a); await wait(700);
      const cr = inst().find(x => x.constructor.name === "VtMCreator" && x.actor === a);
      out.steps = ["wraith", "passions", "shadow"].every(k => cr.steps.includes(k)) && !cr.steps.includes("merits");
      Object.assign(cr.st.wr, { legion: "grim", guild: "argos", faction: "renegade", death: "E2E — выстрел", archetype: "Режиссёр",
        passions: [{ text: "Найти убийцу", emotion: "Месть", value: 4 }, { text: "Беречь сестру", emotion: "Любовь", value: 6 }],
        fetters: [{ text: "Сестра", value: 5 }, { text: "Дом", value: 5 }],
        dark: [{ text: "Погубить сестру", emotion: "Зависть", value: 7 }], angstRoll: 3, angstTemp: 3, thorns: { nightmares: 1, shadowtraits: 1, mirrormirror: 1 } });
      cr.st.disc.argos = 3; cr.st.disc.outrage = 2;
      // торг с Тенью: +2 её очков взаймы — у Психеи +2 свободных (−1 на Пафос: +2 точки); у Тени 12: Ангст 3 × 2 + три Шипа по 2
      const free0 = cr.freeLeft; cr.st.free.trade = 2; cr.st.free.pathos = 1;
      out.trade = [cr.freeLeft - free0, cr.shadowPool, cr.wraithPathos];
      out.issues = cr.wraithAllIssues;
      const ctx = await cr._prepareContext({});
      out.ctx = [ctx.wraith?.legions?.some(l => l.active && l.sym), ctx.wraith?.guilds?.length];
      await cr.write(); await cr.close(); await wait(500);
      const w = a.system.wraith;
      out.written = [w.legion, w.guild, w.arcanoi.argos.value, w.arcanoi.outrage.value, w.passions.length, w.fetters.map(f => f.value).join(","),
        w.pathos.value, w.shadow.archetype, w.shadow.angst.permanent, w.shadow.angst.temporary, w.shadow.darkPassions.length, w.shadow.thorns[0]?.key];
      out.created = !a.sheet.needsCreation;
      await a.delete();
      return out;
    });
    const want = { gate: true, steps: true, trade: [1, 12, 7], issues: [], ctx: [true, 4],
      written: ["grim", "argos", 3, 2, 2, "5,5", 7, "Режиссёр", 3, 3, 1, "nightmares"], created: true };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  await check("Призрак: Покров сцены — Истерия, сверхъестественные рядом, Обиталище, сложность сквозь Покров", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, W = await import(`/systems/${sid}/module/apps/wraith.mjs`), out = {}, scene = game.scenes.viewed;
      const saved = scene.getFlag(sid, "shroud");
      await scene.unsetFlag(sid, "shroud");
      const a = await Actor.create({ name: "E2E — призрак под Покровом", type: "wraith", flags: { world: { e2e: true }, [sid]: { created: true } },
        system: { wraith: { arcanoi: { outrage: { value: 4, initiate: [], skip: [] } } } } });
      await a.createEmbeddedDocuments("Item", [{ name: "Обиталище", type: "background", system: { value: 3 } }]);
      const near = W.shroudOf(a).near ? 2 : 0, exp = n => Math.max(4, n);
      out.def = [W.shroudOf(a).value === exp(7 - near), W.shroudOf(a).set];
      await W.setShroud("base", 2); await W.setShroud("hysteria", 1); await W.setShroud("hysteria", 1); await W.setShroud("hysteria", 1); await W.setShroud("hysteria", 1);
      out.hyst = [W.shroudOf(a).base, W.shroudOf(a).hysteria, W.shroudOf(a).value === exp(9 - 3 - near)];
      await a.setFlag(sid, "inHaunt", true);
      out.haunt = W.shroudOf(a).value === exp(9 - 3 - near);   // в Обиталище Истерии нет, минус рейтинг
      await a.unsetFlag(sid, "inHaunt");
      const lv = (k, n, kind) => W.arcanosOf(k).levels.find(l => l.level === n && l.kind === kind);
      out.diff = [W.artDifficulty(lv("outrage", 4, "common"), a).diff === W.shroudOf(a).value, W.artDifficulty(lv("phantasm", 5, "common"), a).diff === Math.max(8, W.shroudOf(a).value),
        W.artDifficulty(lv("argos", 1, "common"), a).diff];
      await W.setShroud("base", -10);
      out.floor = W.shroudOf(a).value;
      await a.delete();
      if (saved) await scene.setFlag(sid, "shroud", saved); else await scene.unsetFlag(sid, "shroud");
      return out;
    });
    const want = { def: [true, false], hyst: [9, 3, true], haunt: true, diff: [true, true, 6], floor: 4 };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  await check("Призрак: Спектр — каста, Ангст вместо Пафоса, Психея, Тёмные Арканои, Краткая жизнь, Катарсис Психеи", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), out = {}, n0 = game.messages.size;
      const SP = await import(`/systems/${sid}/module/apps/spectre.mjs`), W = await import(`/systems/${sid}/module/apps/wraith.mjs`);
      const { rollPool } = await import(`/systems/${sid}/module/dice/roll.mjs`);
      const a = await Actor.create({ name: "E2E — Спектр", type: "wraith", flags: { world: { e2e: true }, [sid]: { created: true } },
        system: { willpower: { permanent: 4, temporary: 4 }, wraith: { pathos: { value: 6 } } } });
      // «Пал в Забвение»: окно касты подменяем ответом «Шейды»
      const DV = foundry.applications.api.DialogV2, w0 = DV.wait;
      DV.wait = async o => { const el = document.createElement("div"); el.innerHTML = o.content; o.render?.(null, { element: el, close() {} }); el.querySelector('[data-pick="shade"]')?.click(); return "cancel"; };
      await SP.becomeSpectre(a); DV.wait = w0;
      const sp = a.system.wraith.spectre;
      out.become = [sp.on, sp.caste, sp.angst, sp.dark.collogue];
      out.xp = [a.xpCost("arcanos", 0), a.xpCost("arcanos", 2), a.xpCost("attribute", 2)];
      await W.spendPathos(a, 2); await W.gainPathos(a, 1);
      out.angst = [a.system.wraith.spectre.angst, a.system.wraith.pathos.value];
      await W.gainAngst(a, 2, { reason: "E2E" });
      out.psyche = a.system.wraith.spectre.psyche.pool;
      // Краткая жизнь: ботч Спектра — минус постоянный Корпус
      let botch = false;
      for (let i = 0; i < 60 && !botch; i++) botch = (await rollPool({ actor: a, title: "E2E ботч", pool: 2, difficulty: 10, kind: "check" })).outcome === "botch";
      await wait(1200);
      out.brief = [botch, a.system.wraith.corpus < 10];
      await a.update({ "system.wraith.spectre.psyche.pool": 6 });
      out.cath = a.system.wraith.spectre.psyche.canCatharsis;
      await a.sheet.render(true); await wait(800); a.sheet.changeTab("disciplines", "primary"); await wait(600);
      const el = a.sheet.element;
      out.sheet = [el.querySelectorAll(".r-wr-dark").length >= 1, !!el.querySelector(".r-vc-psyche"), !!el.querySelector(".r-assignat.is-spectre"), !!el.querySelector(".r-wr-spectre-bar")];
      await a.sheet.close();
      await ChatMessage.deleteDocuments(game.messages.contents.slice(n0).map(m => m.id));
      await a.delete();
      return out;
    });
    const want = { become: [true, "shade", 5, 1], xp: [6, 4, 6], angst: [4, 6], psyche: 2, brief: [true, true], cath: true, sheet: [true, true, true, true] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  await check("Призрак: Восставший — тело, лишний Ангст, штраф губительного урона, «Дисциплины», обморок, свои Арканои", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), out = {}, n0 = game.messages.size;
      const W = await import(`/systems/${sid}/module/apps/wraith.mjs`), R = await import(`/systems/${sid}/module/apps/risen.mjs`);
      const inst = () => [...foundry.applications.instances.values()];
      const a = await Actor.create({ name: "E2E — Восставший", type: "wraith", flags: { world: { e2e: true }, [sid]: { created: true } },
        system: { attributes: { dexterity: { value: 3 }, strength: { value: 3 }, stamina: { value: 3 }, manipulation: { value: 3 } }, willpower: { permanent: 6, temporary: 6 },
          wraith: { pathos: { value: 7 }, arcanoi: { argos: { value: 1, initiate: [], skip: [] } },
            risen: { on: true, body: true, conduit: "кольцо", arcanoi: { fascinate: 1 }, disc: { potence: 2 } } } } });
      const a0 = a.system.wraith.shadow.angst.temporary;
      W.rollArt(a, "argos", 1, "common"); await wait(700);
      for (const x of inst()) if (x.constructor.name === "RollDialog") await x.close();
      out.angst = a.system.wraith.shadow.angst.temporary - a0;
      await a.update({ "system.health.aggravated": 2 }); out.pen = a.system.health.penalty;
      await a.update({ "system.health.aggravated": 0 });
      const p0 = a.system.wraith.pathos.value; await R.risenDisc(a, "potence"); out.disc = p0 - a.system.wraith.pathos.value;
      await W.corpusDamage(a, 10, "lethal"); await wait(700);
      const down = inst().find(x => x.constructor.name === "RollDialog"); out.down = !!down; await down?.close();
      await a.update({ "system.health.lethal": 0 });
      await a.sheet.render(true); await wait(800); a.sheet.changeTab("disciplines", "primary"); await wait(600);
      out.sheet = [!!a.sheet.element.querySelector(".r-wr-risen-bar"), a.sheet.element.querySelectorAll(".r-wr-dark.is-risen").length];
      await a.sheet.close();
      await ChatMessage.deleteDocuments(game.messages.contents.slice(n0).map(m => m.id));
      await a.delete();
      return out;
    });
    const want = { angst: 1, pen: -2, disc: 1, down: true, sheet: [true, 1] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  await check("Призрак: проектор «Орфея» — Оттенок и опыт, Живучесть, Пятна, Эмблема защиты, Испытание возвращает в тело", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), out = {}, n0 = game.messages.size;
      const W = await import(`/systems/${sid}/module/apps/wraith.mjs`), P = await import(`/systems/${sid}/module/apps/projector.mjs`);
      const a = await Actor.create({ name: "E2E — проектор", type: "wraith", flags: { world: { e2e: true }, [sid]: { created: true } },
        system: { attributes: { stamina: { value: 3 } }, willpower: { permanent: 4, temporary: 4 },
          wraith: { pathos: { value: 5 }, shadow: { angst: { permanent: 5, temporary: 2 } },
            projector: { on: true, shade: "wisp", stains: [{ key: "brutish", shown: false }] } } } });
      out.xp = [a.xpCost("arcanos", 1, { key: "argos" }), a.xpCost("arcanos", 1, { key: "puppetry" }), a.xpCost("arcanos", 1, { key: "outrage" })];
      out.slots = a.system.wraith.projector.stainSlots;
      await a.update({ "system.health.lethal": 7 }); out.cap = a.system.wraith.pathos.max;
      await a.update({ "system.health.lethal": 0 });
      await P.stain(a, 0); out.stain = [a.system.wraith.projector.stains[0].shown, a.system.wraith.shadow.angst.temporary];
      await P.project(a); await P.emblem(a); out.emblem = [a.system.wraith.projector.emblem, a.soakPool("lethal"), a.system.wraith.pathos.value];
      await W.harrowing(a, "corpus"); out.harrow = [a.system.wraith.projector.projecting, a.system.health.aggravated];
      await a.sheet.render(true); await wait(800); a.sheet.changeTab("disciplines", "primary"); await wait(600);
      out.sheet = !!a.sheet.element.querySelector(".r-wr-proj-bar");
      await a.sheet.close();
      await ChatMessage.deleteDocuments(game.messages.contents.slice(n0).map(m => m.id));
      await a.delete();
      return out;
    });
    const want = { xp: [2, 4, 3], slots: 2, cap: 3, stain: [true, 1], emblem: [true, 5, 3], harrow: [false, 1], sheet: true };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  await check("Призрак: другие Тёмные Царства — Пути Нефритовой Империи, Смещение, Повеление: пул, бросок, лист", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), out = {}, n0 = game.messages.size;
      const R = await import(`/systems/${sid}/module/apps/realms.mjs`), inst = () => [...foundry.applications.instances.values()];
      out.data = ["scholar", "artisan", "farmer", "merchant", "soul", "chains", "displace", "behest"].every(k => R.realmArtOf(k)?.levels?.length >= 5);
      const a = await Actor.create({ name: "E2E — книжник", type: "wraith", flags: { world: { e2e: true }, [sid]: { created: true } },
        system: { attributes: { perception: { value: 3 } }, abilities: { empathy: { value: 2 } }, wraith: { pathos: { value: 5 }, realm: { kingdom: "jade", arcanoi: { scholar: 2 } } } } });
      out.trait = [a.traitValue("realm.scholar"), a.traitLabel("realm.scholar")];
      R.rollRealmArt(a, "scholar", 0); await wait(700);
      const d = inst().find(x => x.constructor.name === "RollDialog"); out.dlg = !!d; await d?.close();
      await a.sheet.render(true); await wait(800); a.sheet.changeTab("disciplines", "primary"); await wait(600);
      out.sheet = a.sheet.element.querySelectorAll(".r-wr-dark.is-realm").length;
      await a.sheet.close();
      await ChatMessage.deleteDocuments(game.messages.contents.slice(n0).map(m => m.id));
      await a.delete();
      return out;
    });
    const want = { data: true, trait: [2, "Путь Книжника"], dlg: true, sheet: 1 };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  await check("Призрак: худ — подпись, Пафос и Тень, вкладка «Призрак», Арканои группами", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), out = {};
      const a = await Actor.create({ name: "E2E — призрак в худе", type: "wraith", flags: { world: { e2e: true }, [sid]: { created: true } },
        system: { wraith: { legion: "grim", guild: "argos", pathos: { value: 6 }, arcanoi: { argos: { value: 2, initiate: [], skip: [] } } } } });
      const [tk] = await canvas.scene.createEmbeddedDocuments("Token", [{ ...(await a.getTokenDocument()).toObject(), x: 300, y: 300 }]);
      await wait(500); canvas.tokens.get(tk.id)?.control({ releaseOthers: true }); await wait(600);
      (await import(`/systems/${sid}/module/ui/hud.mjs`)).renderHud(); await wait(400);
      const hud = document.getElementById("r-hud");
      out.kind = hud?.classList.contains("rh-t-wraith");
      out.sub = hud?.querySelector(".rh-ribbon small")?.textContent;
      out.tab = !!hud?.querySelector('[data-act="tab"][data-tab="wraith"]');
      hud?.querySelector('[data-act="tab"][data-tab="powers"]')?.click(); await wait(300);
      document.querySelector('#r-hud [data-pop="w:argos"]')?.click(); await wait(300);
      out.rows = document.querySelectorAll('#r-hud .rh-pop-row[data-act="wrArt"]').length;
      await canvas.scene.deleteEmbeddedDocuments("Token", [tk.id]);
      await a.delete();
      return out;
    });
    const want = { kind: true, sub: "Мрачный · Вестники", tab: true, rows: 2 };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  await check("Призрак: генератор НПС — призрак, Спектр, Восставший, проектор", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, B = await import(`/systems/${sid}/module/apps/npc-build.mjs`), out = {};
      const d = k => B.buildNpc({ kind: k, power: "seasoned" });
      const w = d("wraith"), sp = B.buildNpc({ kind: "spectre", power: "normal", params: { caste: "shade" } }), rs = d("risen"), pj = d("projector");
      out.wraith = [w.actor, w.system.wraith.passions.length, w.powers.length > 0];
      out.spectre = [sp.system.wraith.spectre.on, sp.system.wraith.spectre.dark.collogue >= 1, Object.values(sp.system.wraith.arcanoi).every(x => !x.value)];
      out.risen = [rs.system.wraith.risen.on, rs.system.wraith.arcanoi.puppetry.value >= 1, rs.c.attrs.strength >= 3];
      out.projector = [pj.system.wraith.projector.on, !!pj.system.wraith.projector.shade];
      const a = await B.createNpc(w, { name: "E2E — призрак из генератора" });
      out.created = [a.type, a.system.wraith.legion !== "", a.system.wraith.passions.length];
      await a.delete();
      return out;
    });
    const want = { wraith: ["wraith", 3, true], spectre: [true, true, true], risen: [true, true, true], projector: [true, true], created: ["wraith", true, 3] };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  await check("Призрак: лист и Арканои, Пафос, Страсть, Корпус до колебания и Испытание, Катарсис", async () => {
    const r = await page.evaluate(async () => {
      const sid = game.system.id, wait = ms => new Promise(res => setTimeout(res, ms)), WR = await import(`/systems/${sid}/module/apps/wraith.mjs`);
      const inst = () => [...foundry.applications.instances.values()], n0 = game.messages.size, out = {};
      const rollDlg = async () => { for (let i = 0; i < 40; i++) { const d = inst().find(x => x.constructor.name === "RollDialog" && x.rendered); if (d) return d; await wait(100); } return null; };
      const submit = async () => { const d = await rollDlg(); if (!d) return null; const v = { diff: d.values.difficulty, bd: d.compute().breakdown.map(b => b.value) };
        d.element.querySelector("button[type=submit]")?.click(); await wait(1200); return v; };
      const pickCard = async key => { for (let i = 0; i < 40; i++) { const b = document.querySelector(`.r-wc-dlg [data-pick="${key}"]`); if (b) { b.click(); await wait(300); return; } await wait(100); } };
      const a = await Actor.create({ name: "E2E — призрак", type: "wraith", flags: { world: { e2e: true } },
        system: { attributes: { perception: { value: 3 }, wits: { value: 3 }, stamina: { value: 2 } }, willpower: { permanent: 6, temporary: 6 },
          wraith: { legion: "grim", guild: "argos", pathos: { value: 7 }, arcanoi: { argos: { value: 3, initiate: [1], skip: [] } },
            passions: [{ text: "Защитить сестру", emotion: "Любовь", value: 4 }], shadow: { angst: { permanent: 4, temporary: 3 },
              darkPassions: [{ text: "Утопить чужую радость", emotion: "Зависть", value: 2 }] } } } });
      await a.createEmbeddedDocuments("Item", [{ name: "Эйдолон", type: "background", system: { value: 1, source: "Eidolon" } }]);
      // лист: вкладка Арканоев, кнопки уровней (Аргос 3: Общие I–III и Посвящённый I)
      await a.sheet.render({ force: true }); await wait(900); a.sheet.changeTab("disciplines", "primary"); await wait(500);
      out.sheet = [a.sheet.element.querySelectorAll(".r-wr-half.is-known").length, !!a.sheet.element.querySelector(".r-vc-shadow"), a.sheet.element.querySelectorAll(".r-vc-health .r-hbox").length];
      // карточка Арканоса сворачивается как Дисциплина: по умолчанию свёрнута, щелчок по шапке раскрывает
      try { localStorage.removeItem(`vtm20.arcanoi.${a.id}`); } catch {}
      await a.sheet.render(); await wait(500);
      const card = () => a.sheet.element.querySelector(".r-wr-arc");
      const shut0 = card()?.classList.contains("is-shut");
      card()?.querySelector(".r-wr-arc-head")?.click(); await wait(200);
      out.fold = [shut0, card()?.classList.contains("is-open")];
      try { localStorage.removeItem(`vtm20.arcanoi.${a.id}`); } catch {}
      await a.sheet.close();
      // Око погоды: Восприятие 3 + Аргос 3, сл. 6, 1 Пафос; Укрыться Бурей (Посвящённый): 1 Корпус — ударная отметка
      let p = WR.rollArt(a, "argos", 1, "common"); out.art = await submit(); await p;
      p = WR.rollArt(a, "argos", 1, "initiate"); out.art2 = (await submit())?.diff; await p;
      out.paid = [a.system.wraith.pathos.value, a.system.health.bashing];
      await WR.pathosHeal(a); await wait(300); out.heal = [a.system.health.bashing, a.system.wraith.pathos.value];
      p = WR.rollPassion(a, 0); await pickCard("8"); out.passion = (await submit())?.diff; await p;
      // 10 ударных — колебание; летальный сверху — Испытание: постоянная Воля, сл. 9
      await a.applyDamage(10, "bashing"); await wait(300); out.wavering = [a.system.wraith.wavering, a.system.health.status];
      await a.applyDamage(1, "lethal"); out.harrow = (await submit())?.diff; await wait(500);
      out.afterHarrow = [[10, 9].includes(a.system.wraith.corpus), a.statuses.has("r-harrowing"), a.system.health.bashing];
      // Катарсис: Ангст 9 выше Воли 6 — Тень тратит 1; Психея бросает Волю 6 + Эйдолон 1
      await a.update({ "system.wraith.shadow.angst.temporary": 9 });
      p = WR.catharsis(a); out.cath = (await submit())?.bd; await p; out.angst = a.system.wraith.shadow.angst.temporary;
      p = WR.rollDarkPassion(a, 0); await pickCard("9"); await submit(); await p;
      const msgs = game.messages.contents.slice(n0), roll = k => msgs.find(m => m.flags?.[sid]?.roll?.extra?.wraith?.kind === k);
      out.cards = ["art", "passion", "harrowing", "catharsis"].map(k => !!roll(k)?.content.includes("r-line-result"));
      out.darkGM = !!roll("dark")?.whisper?.length;
      await ChatMessage.deleteDocuments(msgs.map(m => m.id));
      await Actor.deleteDocuments([a.id]);
      return out;
    });
    const want = { sheet: [4, true, 10], fold: [true, true], art: { diff: 6, bd: [3, 3] }, art2: 7, paid: [6, 1], heal: [0, 5], passion: 8, wavering: [true, "wavering"], harrow: 9,
      afterHarrow: [true, false, 0], cath: [6, 1], angst: 8, cards: [true, true, true, true], darkGM: true };
    const bad = Object.keys(want).filter(k => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error(bad.map(k => `${k}: ${JSON.stringify(r[k])} вместо ${JSON.stringify(want[k])}`).join("; "));
  });

  // вторая уборка: временные персонажи проверок после первой (стратегия, оборотни, панель сессии…)
  await page.evaluate(async () => {
    const temp = game.actors.filter(x => x.getFlag("world", "e2e")).map(x => x.id);
    if (temp.length) await Actor.deleteDocuments(temp);
  });

  await check("Новый мир: «Город» без Парижа", async () => {
    await setWorld(false, "", await page.evaluate(() => game.system.version));
    // game.ready встаёт раньше, чем отработает асинхронный ready системы (Codex.load, keepParis): ждём решения
    await reloadUntil(() => game.ready === true && !!game.settings.get(game.system.id, "cityParis"));
    const st = await page.evaluate(id => [game.settings.get(game.system.id, "cityParis"), !!game.modules.get(id)?.active], CITY_MODULE);
    if (st[0] !== "new" || st[1]) throw new Error(`cityParis=${st[0]}, модуль ${st[1] ? "включился" : "выключен"}`);
    await page.evaluate(() => game.vtm20.openCity());
    await page.waitForFunction(() => !!game.vtm20.cityMap()?.loaded?.(), null, { timeout: 30000 });
    const styles = await page.evaluate(async () => (await import(`/systems/${game.system.id}/module/ui/citymap.mjs`)).CITY_STYLES());
    if (styles.includes("plan")) throw new Error("без модуля в стилях есть старинный план");
    await page.evaluate(() => game.vtm20.closeCity());
  });

  if (saved.installed) await check("Старый мир: модуль Парижа включается сам", async () => {
    await setWorld(false, "", "0.7.0");
    await reloadUntil(id => game.ready === true && !!game.modules.get(id)?.active && game.settings.get(game.system.id, "cityParis") === "on", CITY_MODULE);
  });
  else if (!PARTIAL) results.push({ name: "Старый мир: модуль Парижа включается сам", ok: true, note: "пропущено — модуль не установлен в песочнице" });

  await check("Песочница возвращена как была", async () => {
    await setWorld(saved.mod, saved.paris, saved.migrated);
    // модуль, включённый в настройках, но не установленный в песочнице, активным не станет
    await reloadUntil(([id, mod]) => game.ready === true && !!game.modules.get(id)?.active === mod, [CITY_MODULE, !!saved.mod && saved.installed]);
  });

} catch (e) {
  // провал проверки уже записан — не дублировать
  if (results.at(-1)?.name !== step || results.at(-1)?.ok) results.push({ name: step, ok: false, note: String(e.message ?? e).split("\n")[0] });
} finally {
  await browser.close();
}

for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.note ? ` — ${r.note}` : ""}`);
if (errors.length) {
  console.log("\nОшибки в консоли:");
  for (const e of errors.slice(0, 20)) console.log(`  [${e.step}] ${e.text.split("\n")[0].slice(0, 300)}${e.where ? `\n      ${e.where.slice(0, 300)}` : ""}`);
}
const failed = results.filter(r => !r.ok).length;
console.log(failed ? `\nНе прошло: ${failed} из ${results.length}.` : `\nВсё в порядке: ${results.length} проверок.`);
// отметка для релиза (tools/release.mjs): полный прогон на этом коммите, без незакоммиченных правок кода (компендии и новые файлы не в счёт)
if (!PARTIAL) {
  const { execFileSync } = await import("node:child_process");
  const git = args => { try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } };
  const dirty = git(["status", "--porcelain", "--", ".", ":!packs"]).split("\n").filter(l => l && !l.startsWith("??")).length > 0;
  fs.mkdirSync(path.join(ROOT, "tools/.cache"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "tools/.cache/e2e-ok.json"), JSON.stringify({ head: git(["rev-parse", "HEAD"]), dirty, ok: !failed, n: results.length, at: new Date().toISOString() }));
}
process.exit(failed ? 1 : 0);
