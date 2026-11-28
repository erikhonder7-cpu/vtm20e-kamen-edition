// tools/check-terms.mjs — старые термины в данных и в интерфейсе: node tools/check-terms.mjs [--verbose]
// Система говорит словами своего листа и интерфейса: лёгкие / тяжёлые / губительные раны, прочность, провал (botch)
// и неудача (обычный промах), Воля, Обаяние, Манипуляция, Смекалка, Привлекательность, Фоны. Проверка ищет в data/*.json
// и в строках lang/ru.json старые слова: «ударный / летальный урон», «поглощение» урона, «ботч», «Сила воли», «Харизма»,
// «Манипулирование», «Сообразительность», «Остроумие», «Предыстория», и английские пулы («Wits + Occult»).
// Законные случаи — список KNOWN (файл и кусок текста) с объяснением. Код выхода 1, если что-то нашлось. Ничего не меняет.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERBOSE = process.argv.includes("--verbose");
const L = "\\p{L}";
const DMG = `(?:урон|ран|повреждени|уровн)`;

const RULES = [
  ["«ударный / летальный» урон — «лёгкий / тяжёлый»", new RegExp(`(?<!${L})(?:ударн|летальн)${L}*(?:\\s*(?:,|и|или|\\/)\\s*${L}+)?\\s+${DMG}`, "giu")],
  ["«поглощение» урона — «прочность»", new RegExp(`(?<!${L})(?:куб${L}*|брос${L}*|пул${L}*)\\s+поглощени${L}*|(?<!${L})поглощени${L}*\\s+(?:${L}+\\s+)?${DMG}`, "giu")],
  ["«аггравированный / отягчённый» — «губительный»", new RegExp(`(?<!${L})(?:не)?(?:аг?гравированн|отягч[её]нн)${L}*`, "giu")],
  ["«ботч» — «провал»", new RegExp(`(?<!${L})ботч${L}*|(?<![A-Za-z])[Bb]otch(?![a-z])`, "gu")],
  ["«Сила воли» — «Воля»", new RegExp(`(?<!${L})[Сс]ил(?:а|ы|е|у|ой) [Вв]оли(?!${L})`, "gu")],
  ["Атрибуты — как на листе", new RegExp(`(?<!${L})(?:Харизм(?:а|ы|е|у|ой)|Манипулировани${L}*|Сообразительност${L}*|Остроуми(?:е|я|ю|ем))(?!${L})`, "gu")],
  ["«Предыстория» — «Фон»", new RegExp(`(?<!${L})Предыстори${L}*`, "gu")],
  ["английский пул — по-русски", /(?<![A-Za-z])(?:Strength|Dexterity|Stamina|Charisma|Manipulation|Appearance|Perception|Intelligence|Wits)\s*\+\s*[A-Z][a-z]+|[А-Яа-яЁё]+ \+ (?:Alertness|Athletics|Awareness|Brawl|Empathy|Expression|Intimidation|Leadership|Streetwise|Subterfuge|Crafts|Drive|Etiquette|Firearms|Larceny|Melee|Performance|Stealth|Survival|Academics|Computer|Finance|Investigation|Law|Medicine|Occult|Politics|Science|Technology|Collogue|Contaminate|Corruption|Maleficence|Tempestos|Usury|Behest|Displace|Fascinate|Serendipity)(?![a-z])/g]
];

/** Законные случаи: [файл, кусок текста рядом, почему]. */
const KNOWN = [
  ["data/wraith.json", "Ремесленники", "«Поглощение» — имя силы, не прочность"],
  ["data/disciplines.json", "Массовое Манипулирование", "имя силы Доминирования (Mass Manipulation), не Атрибут"],
  ["data/werewolf.json", "Сила воли", "имя Дара (Strength of Will), не черта"]
];

const issues = [];
const files = [...fs.readdirSync(path.join(ROOT, "data")).filter(f => f.endsWith(".json")).map(f => `data/${f}`), "lang/ru.json"];
// только текстовые значения: ключи JSON и английские поля (en, key, id, img…) не смотрим
const SKIP = new Set(["en", "key", "id", "img", "icon", "src", "source", "uuid", "_id", "path"]);
function* strings(o, k = "") {
  if (typeof o === "string") { if (!SKIP.has(k)) yield o; return; }
  if (Array.isArray(o)) { for (const x of o) yield* strings(x, k); return; }
  if (o && typeof o === "object") for (const [kk, v] of Object.entries(o)) yield* strings(v, kk);
}
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
  for (const s of strings(data)) for (const [label, re] of RULES) for (const m of s.matchAll(re)) {
    const ctx = s.slice(Math.max(0, m.index - 50), m.index + m[0].length + 30).replace(/\s+/g, " ");
    if (KNOWN.some(([kf, piece]) => kf === f && ctx.includes(piece))) continue;
    issues.push({ f, label, hit: m[0], ctx });
  }
}
const by = {};
for (const i of issues) (by[i.label] ??= []).push(i);
if (!issues.length) { console.log(`Термины: ${files.length} файлов — старых слов нет.`); process.exit(0); }
console.log(`Старые термины: ${issues.length}`);
for (const [label, list] of Object.entries(by)) {
  console.log(`  ${label}: ${list.length}`);
  for (const i of VERBOSE ? list : list.slice(0, 3)) console.log(`    • ${i.f}: «${i.hit}» — …${i.ctx}…`);
}
process.exit(1);
