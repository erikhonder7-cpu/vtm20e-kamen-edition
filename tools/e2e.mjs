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
process.exit(failed ? 1 : 0);
