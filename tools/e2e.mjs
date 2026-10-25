// tools/e2e.mjs — автотесты в браузере против песочницы Foundry:
//   node tools/e2e.mjs [--url http://localhost:30002] [--user Gamemaster] [--headed] [--sync <папка системы в песочнице>]
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

// Шум, который к системе не относится
const IGNORE = [/Cannot set language/i, /hardware acceleration/i, /favicon\.ico/i, /WebGL/i];

if (SYNC) for (const f of ["vtm20.mjs", "system.json"]) fs.copyFileSync(path.join(ROOT, f), path.join(SYNC, f));

const results = [];
const errors = [];
let page, step = "запуск";

async function check(name, fn) {
  step = name;
  const before = errors.length;
  try {
    await fn();
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

const browser = await chromium.launch({ channel: "msedge", headless: !HEADED });
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
      await page.selectOption("select[name=userid]", { label: USER });
      await page.click("button[name=join]");
    }
    await page.waitForFunction(() => window.game?.ready === true, null, { timeout: 120000 });
  });
  if (!results[0].ok) throw new Error(`не удалось войти: ${results[0].note}`);

  await check("Система загружена", async () => {
    const v = await page.evaluate(() => [game.system.id, game.system.version, !!game.vtm20]);
    if (v[0] !== "vtm20e-kamen-edition" || !v[2]) throw new Error(`система ${v[0]}, game.vtm20 ${v[2]}`);
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

  await check("Сроки: сила на час и чтение ритуала", async () => {
    const id = await temp("E2E — сроки");
    const r = await page.evaluate(async id => {
      const a = game.actors.get(id), sys = p => import(`/systems/${game.system.id}/${p}`);
      const { getClock } = await sys("module/apps/calendar.mjs"), T = await sys("module/apps/timers.mjs");
      const now = getClock();
      const fx = await a.startPower("quietus:3");                    // Зов Дагона — на час, без цены
      const until = fx?.getFlag(game.system.id, "until") ?? 0;
      const [, ritual] = await a.createEmbeddedDocuments("Item", [
        { name: "E2E — Тауматургия", type: "discipline", system: { key: "thaumaturgy", value: 1 } },
        { name: "E2E — ритуал", type: "ritual", system: { discipline: "thaumaturgy", level: 1 } }]);
      await T.toggleRitualReading(a, ritual);
      const reading = T.readingRituals(a).length;
      const n = game.messages.size;
      await T.expireTimers(now + 2 * 3600000);
      const card = game.messages.contents.slice(n).find(m => m.flags?.[game.system.id]?.timers);
      return { hour: Math.round((until - now) / 60000), reading, left: a.effects.size, button: !!card?.content.includes("data-r-ritual") };
    }, id);
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
      game.vtm20.closeCity();
      return { cityId, place };
    }, id);
    if (!r.cityId) throw new Error("в мире нет города");
    if (r.place?.ground !== "slums" || r.place.owner?.id !== id) throw new Error(`место охоты: ${JSON.stringify(r.place)}`);
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
      return out;
    }, id);
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
  else results.push({ name: "Старый мир: модуль Парижа включается сам", ok: true, note: "пропущено — модуль не установлен в песочнице" });

  await check("Песочница возвращена как была", async () => {
    await setWorld(saved.mod, saved.paris, saved.migrated);
    await reloadUntil(([id, mod]) => game.ready === true && !!game.modules.get(id)?.active === mod, [CITY_MODULE, !!saved.mod]);
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
process.exit(failed ? 1 : 0);
