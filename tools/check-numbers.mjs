// tools/check-numbers.mjs — сверка цифр в строках справочников с текстом правил.
//   node tools/check-numbers.mjs [--verbose]
// Строка Дара или уровня Арканоса в справочнике (module/apps/atlas.mjs) показывает бросок, сложность и цену из полей данных
// (roll, cost у Даров; attr, diff, pathos у уровней Арканоев). Текст той же записи и книга правил пишут их прозой.
// Проверка ищет расхождения:
//   Дары Гару (data/werewolf.json)  — сложность в roll против «сложность N» / «сл. N» в тексте; цена в cost против «N Гнозиса/Ярости/Воли»;
//   Арканои (data/wraith.json)      — diff уровня против сложностей в его тексте; pathos против «N Пафоса»;
//                                     и то же против глав книги призраков (data/wraith-books.json, «Арканои (часть 1–3)»).
// Код выхода 1, если есть расхождения. Ничего не меняет.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = f => JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"));
const VERBOSE = process.argv.includes("--verbose");
const plain = h => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const L = "А-Яа-яЁё";
/** Все сложности в тексте: «сложность 7», «сл. 7», «(сложность 6)»; «сложность по цели» — особый случай. */
const diffs = t => [...t.matchAll(new RegExp(`(?<![${L}])(?:сложност[ьи]|сл\\.)\\s*(\\d{1,2})(?!\\d)`, "g"))].map(m => +m[1]);
/** Цены в тексте: «1 Гнозис», «2 Ярости», «1 Воли», «1 Пафоса», «1 пункт Гнозиса». */
const costs = (t, word) => [...t.matchAll(new RegExp(`(\\d+)\\s*(?:пункт\\S*\\s+|очк\\S*\\s+|временн\\S*\\s+)?${word}`, "gi"))].map(m => +m[1]);

const issues = [];
const add = (where, what) => issues.push(`${where}: ${what}`);

/* ── Дары Гару ─────────────────────────────────────────────── */
const W = data("werewolf.json");
let gifts = 0;
for (const g of W.gifts ?? []) {
  gifts++;
  const t = plain(g.text);
  const want = g.roll?.difficulty, byTarget = g.roll?.byTarget;
  const seen = diffs(t);
  if (want && !byTarget && seen.length && !seen.includes(want)) add(`Дар «${g.name}»`, `в строке сложность ${want}, в тексте ${[...new Set(seen)].join("/")}`);
  for (const [k, word] of [["gnosis", "Гнозис"], ["rage", "Ярост"], ["willpower", "Вол[иья]"]]) {
    const n = g.cost?.[k], inText = costs(t, word);
    if (n && inText.length && !inText.includes(n)) add(`Дар «${g.name}»`, `в строке цена ${n} (${k}), в тексте ${[...new Set(inText)].join("/")}`);
  }
}

/* ── Арканои: данные ───────────────────────────────────────── */
const WR = data("wraith.json");
let levels = 0;
const arcLevels = [];
for (const a of WR.arcanoi ?? []) for (const l of a.levels ?? []) {
  levels++;
  arcLevels.push({ arc: a, l });
  const t = plain(l.html), seen = diffs(t);
  if (l.diff && seen.length && !seen.includes(l.diff)) add(`${a.name}: «${l.name}»`, `в строке сложность ${l.diff}, в тексте ${[...new Set(seen)].join("/")}`);
  const pt = costs(t, "Пафос");
  if (l.pathos && pt.length && !pt.includes(l.pathos)) add(`${a.name}: «${l.name}»`, `в строке ${l.pathos} Пафоса, в тексте ${[...new Set(pt)].join("/")}`);
}

/* ── Арканои: книга призраков (главы 04–06) ────────────────── */
const book = data("wraith-books.json").filter(c => /Арканои \(часть/.test(c.name));
let bookHits = 0;
for (const c of book) for (const pg of c.pages) {
  const arc = (WR.arcanoi ?? []).find(a => pg.name.startsWith(a.name));
  if (!arc) continue;
  // уровни в книге: «• Око погоды (О).…» — до следующего уровня
  const t = plain(pg.html);
  const parts = t.split(/(?<!•)(?=•{1,5}\s+[А-ЯЁ«])/);
  for (const part of parts) {
    const m = /^(•{1,5})\s+(.+?)\s*\((О|П)\)/.exec(part);
    if (!m) continue;
    const lvl = m[1].length, name = m[2].trim();
    const nm = x => x.toLowerCase().replace(/ё/g, "е").replace(/\s*\(.*$/, "").trim();
    const l = (arc.levels ?? []).find(x => x.level === lvl && nm(x.name) === nm(name));
    if (!l) continue;
    bookHits++;
    const seen = diffs(part);
    if (l.diff && seen.length && !seen.includes(l.diff)) add(`Книга, ${arc.name}: «${name}»`, `в строке сложность ${l.diff}, в книге ${[...new Set(seen)].join("/")}`);
    const pt = costs(part, "Пафос");
    if (l.pathos && pt.length && !pt.includes(l.pathos)) add(`Книга, ${arc.name}: «${name}»`, `в строке ${l.pathos} Пафоса, в книге ${[...new Set(pt)].join("/")}`);
  }
}

console.log(`Даров: ${gifts}, уровней Арканоев: ${levels}, сверено с книгой: ${bookHits}.`);
if (!issues.length) { console.log("Расхождений нет."); process.exit(0); }
console.log(`Расхождений: ${issues.length}`);
for (const s of VERBOSE ? issues : issues.slice(0, 40)) console.log(`  • ${s}`);
if (!VERBOSE && issues.length > 40) console.log(`  … ещё ${issues.length - 40} (--verbose — все)`);
process.exit(1);
