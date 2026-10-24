// tools/e2e.mjs — автотесты в браузере против песочницы Foundry:
//   node tools/e2e.mjs [--url http://localhost:30002] [--user Gamemaster] [--headed] [--sync <папка системы в песочнице>]
// Входит рассказчиком, открывает лист, бросает черту, открывает окна системы (опыт, библиотеку, охоту,
// опасности, урон, диаблери, справочник кланов), ставит и снимает паузу; всё это время ловит ошибки
// в консоли. Браузер — установленный Edge (playwright-core, channel «msedge»), ничего не скачивается.
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

  await check("Пауза «Капля»", async () => {
    await page.evaluate(() => game.togglePause(true, { broadcast: false }));
    await page.waitForSelector("#r-pause", { timeout: 5000 });
    await page.evaluate(() => game.togglePause(false, { broadcast: false }));
    await page.waitForSelector("#r-pause", { state: "detached", timeout: 6000 });
  });

  // Уборка: сообщения бросков и временный персонаж
  await page.evaluate(async () => {
    const extra = game.messages.contents.slice(window._e2e.messages).map(m => m.id);
    if (extra.length) await ChatMessage.deleteDocuments(extra);
    const a = window._e2e.actor;
    a.sheet?.close();
    if (a.getFlag("world", "e2e")) await a.delete();
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
