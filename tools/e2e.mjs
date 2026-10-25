// tools/e2e.mjs — автотесты в браузере против песочницы Foundry:
//   node tools/e2e.mjs [--url http://localhost:30002] [--user Gamemaster] [--headed] [--sync <папка системы в песочнице>]
// Входит рассказчиком, открывает лист, бросает черту, открывает окна системы (опыт, библиотеку, охоту,
// опасности, урон, диаблери, справочник кланов, ночь простоя, реестр услуг), ставит и снимает паузу; проверяет
// «Город» без модуля Парижа (новый мир) и автовключение модуля в старом мире; всё это время ловит ошибки в консоли. Браузер — установленный Edge (playwright-core, channel «msedge»), ничего не скачивается.
// В CI не запускается: там нет Foundry. Песочницу не поднимать, пока открыт Foundry пользователя —
// они делят компендии системы.
// --sync копирует vtm20.mjs и system.json в песочницу: там это копии, остальное подключено ссылкой.

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
  page.on("pageerror", e => errors.push({ step, text: String(e.message ?? e) }));
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
    let a = game.actors.find(x => x.type === "vampire" && x.isOwner);
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

  // Уборка до перезагрузок мира: сообщения бросков и временный персонаж
  await page.evaluate(async () => {
    const extra = game.messages.contents.slice(window._e2e.messages).map(m => m.id);
    if (extra.length) await ChatMessage.deleteDocuments(extra);
    const a = window._e2e.actor;
    a.sheet?.close();
    if (a.getFlag("world", "e2e")) await a.delete();
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
  for (const e of errors.slice(0, 20)) console.log(`  [${e.step}] ${e.text.split("\n")[0].slice(0, 300)}`);
}
const failed = results.filter(r => !r.ok).length;
console.log(failed ? `\nНе прошло: ${failed} из ${results.length}.` : `\nВсё в порядке: ${results.length} проверок.`);
process.exit(failed ? 1 : 0);
