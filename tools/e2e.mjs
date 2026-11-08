// tools/e2e.mjs — автотесты в браузере против песочницы Foundry:
//   node tools/e2e.mjs [--url http://localhost:30002] [--user Gamemaster] [--headed] [--sync <папка системы в песочнице>] [--only "часть названия|другая"]
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

// Шум, который к системе не относится
const IGNORE = [/Cannot set language/i, /hardware acceleration/i, /favicon\.ico/i, /WebGL/i];

if (SYNC) for (const f of ["vtm20.mjs", "system.json"]) fs.copyFileSync(path.join(ROOT, f), path.join(SYNC, f));

const results = [];
const errors = [];
let page, step = "запуск";

async function check(name, fn) {
  if (ONLY.length && !ALWAYS.includes(name) && !ONLY.some(x => name.toLowerCase().includes(x))) return;
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
      W.regainGnosis(a); out.hunt = await pick("hunt"); out.full = a.system.werewolf.gnosis.value;
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
      await a.update({ "system.spirit.on": false }); await wait(400); out.off = a.sheet.constructor.name;
      await a.update({ "system.spirit.on": true }); await wait(400); out.on = a.sheet.constructor.name;
      return out;
    }, id);
    if (r.sheet !== "SpiritSheet" || !r.theme || r.traits !== 3) throw new Error(`лист духа: ${JSON.stringify(r)}`);
    if (r.essence !== 3 || r.health !== 0) throw new Error(`урон духу: Эссенция −${r.essence}, губительных ${r.health}`);
    if (r.off !== "VtMActorSheet" || r.on !== "SpiritSheet") throw new Error(`переключение: ${r.off} / ${r.on}`);
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
      const fx = await a.startPower("quietus:3");                    // Зов Дагона — на час, без цены
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
      const [te, tm] = await scene.createEmbeddedDocuments("Token", [await elder.getTokenDocument({ x: 100, y: 100 }), await m.getTokenDocument({ x: 300, y: 100 })]);
      const target = async td => { for (let i = 0; i < 30 && !canvas.tokens.get(td.id); i++) await new Promise(res => setTimeout(res, 100));
        await new Promise(res => setTimeout(res, 300)); canvas.tokens.get(td.id)?.setTarget(true, { releaseOthers: true }); await new Promise(res => setTimeout(res, 300)); };
      const D = game.vtm20Codex.discipline("dominate"), P = game.vtm20Codex.discipline("presence");
      const idx = (d, en) => d.powers.findIndex(p => p.en === en);
      const out = {};
      // Приказ против старейшины — запрет; против смертного — сложность = текущая Воля (4)
      await target(te);
      out.elder = TP.prepareTargetPower(a, "dominate", D.powers[idx(D, "Command")], TP.TARGET_POWERS["dominate|Command"]) === null;
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
      const [tv, tm] = await scene.createEmbeddedDocuments("Token", [await v.getTokenDocument({ x: 100, y: 300 }), await m.getTokenDocument({ x: 300, y: 300 })]);
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
      out.quellKindred = TP.prepareTargetPower(a, "animalism", C.discipline("animalism").powers[idx("animalism", "Quell the Beast")], TP.TARGET_POWERS["animalism|Quell the Beast"]) === null;
      await target(tm);
      await rollPowerRef(a, `animalism|${idx("animalism", "Quell the Beast")}`);
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
      const [ta, tl] = await scene.createEmbeddedDocuments("Token", [await a.getTokenDocument({ x: 500, y: 500 }), await ally.getTokenDocument({ x: 700, y: 500 })]);
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
      out.shadow = [!!a.system.fx.shadowForm, openAttack(a) === null, hp(a)];
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
      out.mist = [!!a.system.fx?.mistForm, a.armor.rating, openAttack(a) === null];
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
      await C.openCity(); await new Promise(res => setTimeout(res, 2500));
      const el = document.querySelector(".vtm20.r-city"), open = !!el?.classList.contains("open");
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
      await s.sheet.render(true); await wait(900); out.card = s.sheet.constructor.name === "SpiritSheet" && !!s.sheet.element.querySelector(".r-sp-trait") && !!s.sheet.element.querySelector(".r-sp-tpl option[value='bane-halassh']"); await s.sheet.close();
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
  else if (!ONLY.length) results.push({ name: "Старый мир: модуль Парижа включается сам", ok: true, note: "пропущено — модуль не установлен в песочнице" });

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
if (!ONLY.length) {
  const { execFileSync } = await import("node:child_process");
  const git = args => { try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } };
  const dirty = git(["status", "--porcelain", "--", ".", ":!packs"]).split("\n").filter(l => l && !l.startsWith("??")).length > 0;
  fs.mkdirSync(path.join(ROOT, "tools/.cache"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "tools/.cache/e2e-ok.json"), JSON.stringify({ head: git(["rev-parse", "HEAD"]), dirty, ok: !failed, n: results.length, at: new Date().toISOString() }));
}
process.exit(failed ? 1 : 0);
