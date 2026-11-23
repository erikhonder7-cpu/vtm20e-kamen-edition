// tools/check-numbers.mjs — сверка цифр в строках справочников с текстом правил.
//   node tools/check-numbers.mjs [--verbose]
// Строка Дара или уровня Арканоса в справочнике (module/apps/atlas.mjs) показывает бросок, сложность и цену из полей данных
// (roll, cost у Даров; attr, diff, pathos у уровней Арканоев). Текст той же записи и книга правил пишут их прозой.
// Проверка ищет расхождения:
//   Дары Гару (data/werewolf.json)  — сложность в roll против «сложность N» / «сл. N» в тексте; цена в cost против «N Гнозиса/Ярости/Воли»;
//   Арканои (data/wraith.json)      — diff уровня против сложностей в его тексте; pathos против «N Пафоса»;
//                                     и то же против глав книги призраков (data/wraith-books.json, «Арканои (часть 1–3)»).
//   Прочее (поле против текста той же записи): Воля уровней Арканоев; Тёмные Арканои, Арканои Тёмных Царств и Восставших;
//   реликвии призраков; кантрипы Dark Ages: Fae; Реды химер; Нумины, фетиши и духи оборотней; Чудеса магов.
//   Законные расхождения (в тексте сложность ищущих, запас кристалла…) — список KNOWN с объяснением.
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

/* ── Прочие записи: поле против текста той же записи ───────────
   cost  — «N слово» (цена: «1 Пафос», «2 Воли»); stat — «слово N» (черта: «Ярость 6», «Гнозис 4»); diff — «сложность N». */
const C = data("changeling.json"), M = data("mage.json");
const RULES = [
  // [название, записи, поле, вид, слово, текст]
  ["Арканос", (WR.arcanoi ?? []).flatMap(a => (a.levels ?? []).map(l => ({ ...l, where: `${a.name}: «${l.name}»` }))), "willpower", "cost", "Вол[иья]", "html"],
  ...["darkArcanoi", "realmArcanoi", "risenArcanoi"].flatMap(k => {
    const list = (WR[k] ?? []).flatMap(a => (a.levels ?? []).map(l => ({ ...l, where: `${a.name}: «${l.name}»` })));
    return [["", list, "diff", "diff", "", "html"], ["", list, "pathos", "cost", "Пафос", "html"], ["", list, "willpower", "cost", "Вол[иья]", "html"]];
  }),
  ["Реликвия", WR.relics ?? [], "pathos", "cost", "Пафос", "text"],
  ["Кантрип Тёмных веков", C.daf?.cantrips ?? [], "diff", "diff", "", "text"],
  ["Ред химеры", C.redes ?? [], "cost", "cost", "", "text", /цена\s*(\d+)/gi],
  ["Нумина", (W.numina ?? []).flatMap(n => (n.levels ?? []).map(l => ({ ...l, name: l.name || `${n.name} ${l.level ?? ""}`.trim() }))), "difficulty", "diff", "", "text"],
  ["Фетиш", W.fetishes ?? [], "gnosis", "stat", "Гнозис", "text"],
  ["Дух", W.spirits ?? [], "rage", "stat", "(?:Ярость|Яр\\.?)", "text"],
  ["Дух", W.spirits ?? [], "gnosis", "stat", "(?:Гнозис|Гн\\.?)", "text"],
  ["Дух", W.spirits ?? [], "willpower", "stat", "(?:Воля|Вол\\.?)", "text"],
  ["Чудо", M.wonders ?? [], "quintessence", "stat", "Квинтэссенция", "html"]
];
/** Законные расхождения: в тексте другая сложность или число относится не к самой силе. */
const KNOWN = new Map([
  ["Кантрип Тёмных веков «Родня пламени»|diff", "сложность 8 — если кантрип творят на другого"],
  ["Кантрип Тёмных веков «Гламур зимы»|diff", "сложность 8 — у бросков ищущих"],
  ["Кантрип Тёмных веков «Земляное убежище»|diff", "сложность 8 — у бросков ищущих"],
  ["Кантрип Тёмных веков «Сокрытие»|diff", "сложность 10 — у Узрения ищущих"],
  ["Кантрип Тёмных веков «Память деревьев»|diff", "сложность 3 + успехи — чтобы выйти из транса"],
  ["Реликвия «Маска мягкого огня»|pathos", "10 Пафоса — запас кристалла, цена — 1 за применение"],
  ["Коннесанс: «Взаимодействие»|diff", "сложность 5 + число целей: с одной целью — 6"]
]);
let others = 0;
for (const [label, list, field, kind, word, tk, own] of RULES) for (const x of list) {
  const want = x[field];
  if (typeof want !== "number" || !want) continue;
  const t = plain(x[tk]);
  const seen = own ? [...t.matchAll(own)].map(m => +m[1])
    : kind === "diff" ? diffs(t)
    : kind === "cost" ? costs(t, word)
    : [...t.matchAll(new RegExp(`(?<![${L}])${word}(?![${L}])\\s*:?\\s*(\\d+)`, "gi"))].map(m => +m[1]);
  others++;
  const where = x.where ?? `${label} «${x.name}»`;
  if (KNOWN.has(`${where}|${field}`)) continue;
  if (seen.length && !seen.includes(want)) add(where, `в данных ${field} ${want}, в тексте ${[...new Set(seen)].join("/")}`);
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

console.log(`Даров: ${gifts}, уровней Арканоев: ${levels}, сверено с книгой: ${bookHits}, прочих записей: ${others}.`);
if (!issues.length) { console.log("Расхождений нет."); process.exit(0); }
console.log(`Расхождений: ${issues.length}`);
for (const s of VERBOSE ? issues : issues.slice(0, 40)) console.log(`  • ${s}`);
if (!VERBOSE && issues.length > 40) console.log(`  … ещё ${issues.length - 40} (--verbose — все)`);
process.exit(1);
