// tools/check.mjs — проверка перед коммитом: node tools/check.mjs
// 1) синтаксис всех модулей .mjs (в том числе повторные объявления имён — из-за такой ошибки листы
//    не открывались, а песочница её не показала); 2) тесты подсчёта броска (evaluate) и шансов (odds)
//    по правилам V20; 3) все data/*.json и lang/ru.json читаются; 4) свои значки предметов на месте.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error("✗", msg); } };

// ── 1. Синтаксис ──────────────────────────────────────────────────────────
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? (["node_modules", ".git", "books"].includes(e.name) ? [] : walk(path.join(dir, e.name)))
    : e.name.endsWith(".mjs") ? [path.join(dir, e.name)] : []);
const files = [path.join(ROOT, "vtm20.mjs"), ...walk(path.join(ROOT, "module")), ...walk(path.join(ROOT, "tools"))];
for (const f of files) {
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
  catch (e) { ok(false, `синтаксис ${path.relative(ROOT, f)}:\n${String(e.stderr).split("\n").slice(0, 4).join("\n")}`); }
}
console.log(`Синтаксис: ${files.length} модулей`);

// ── 2. Броски ─────────────────────────────────────────────────────────────
// roll.mjs импортирует config.mjs — ему хватает заглушек глобалов Foundry
globalThis.game = { i18n: { lang: "ru", localize: k => k, format: k => k }, settings: { get: () => "" } };
globalThis.foundry = { utils: {}, applications: { handlebars: {} } };
globalThis.Hooks = { on() {}, once() {} };
globalThis.CONFIG = {};
Math.clamp ??= (n, a, b) => Math.min(Math.max(n, a), b);
const { evaluate, odds } = await import(pathToFileURL(path.join(ROOT, "module/dice/roll.mjs")).href);

const ev = (values, o = {}) => evaluate(values, { difficulty: 6, ...o });
ok(ev([7, 8, 3]).successes === 2 && ev([7, 8, 3]).outcome === "success", "два успеха");
ok(ev([7, 1, 3]).successes === 0 && ev([7, 1, 3]).outcome === "failure", "единица отменяет успех — неудача, не провал");
ok(ev([2, 1, 3]).outcome === "botch", "ни одного успеха и единица — провал");
ok(ev([2, 1, 3], { willpower: true }).outcome === "success", "воля спасает от провала и даёт успех");
ok(ev([10, 4], { specialty: true }).successes === 2, "со специализацией 10 — два успеха");
ok(ev([10, 1], { specialty: true }).successes === 1, "специализация: 10 = 2, минус единица = 1");
ok(ev([5, 6], { difficulty: 6 }).successes === 1, "сложность 6: шестёрка — успех, пятёрка — нет");
ok(ev([1, 1, 2], { auto: 1 }).outcome === "success", "автоуспех не отменяется единицами");

const near = (a, b) => Math.abs(a - b) < 1e-9;
const o1 = odds({ pool: 1, difficulty: 6 });
ok(near(o1.success, .5) && near(o1.botch, .1) && near(o1.failure, .4) && near(o1.mean, .5), "шансы одного куба на сл. 6");
for (const pool of [1, 3, 5, 8]) for (const difficulty of [3, 6, 9]) for (const specialty of [false, true]) {
  const o = odds({ pool, difficulty, specialty });
  ok(near(o.success + o.failure + o.botch, 1), `сумма шансов = 1 (пул ${pool}, сл. ${difficulty})`);
}
ok(near(odds({ pool: 5, difficulty: 6, willpower: true }).success, 1), "с волей успех гарантирован");
ok(odds({ pool: 0 }).failure === 1, "пустой пул — неудача");
// перебор всех исходов трёх кубов совпадает с odds()
{
  let s = 0, b = 0, n = 0;
  for (let x = 1; x <= 10; x++) for (let y = 1; y <= 10; y++) for (let z = 1; z <= 10; z++) {
    const r = ev([x, y, z], { difficulty: 7, specialty: true }); n++;
    if (r.outcome === "success") s++; else if (r.outcome === "botch") b++;
  }
  const o = odds({ pool: 3, difficulty: 7, specialty: true });
  ok(near(o.success, s / n) && near(o.botch, b / n), "odds() совпадает с полным перебором evaluate() (3 куба, сл. 7, специализация)");
}
console.log("Броски: evaluate и odds проверены");

// ── 3. Данные ─────────────────────────────────────────────────────────────
for (const f of [...fs.readdirSync(path.join(ROOT, "data")).filter(f => f.endsWith(".json")).map(f => path.join(ROOT, "data", f)), path.join(ROOT, "lang/ru.json"), path.join(ROOT, "system.json")]) {
  try { JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { ok(false, `JSON ${path.relative(ROOT, f)}: ${e.message}`); }
}
console.log("Данные: JSON читаются");

// ── 4. Свои значки предметов ──────────────────────────────────────────────
{
  const { OWN_ICON_FILES } = await import(pathToFileURL(path.join(ROOT, "module/data/icons.mjs")).href);
  const miss = OWN_ICON_FILES.filter(p => !fs.existsSync(path.join(ROOT, p)));
  ok(!miss.length, `нет значков: ${miss.join(", ")}`);
  console.log(`Значки: ${OWN_ICON_FILES.length} файлов`);
}

if (failed) { console.error(`\nПРОВАЛЕНО проверок: ${failed}`); process.exit(1); }
console.log("\nВсё в порядке.");
