// tools/game_icons.mjs — значки game-icons.net (CC BY 3.0) вместо тематических значков Font Awesome.
//   node tools/game_icons.mjs <папка клона github.com/game-icons/icons>
// Таблица — tools/game-icons.json: [класс Font Awesome без «fa-», «автор/имя» в наборе, где стоит, true — менять и в знаках сил].
// Пишет очищенные SVG (без чёрного фона, знак чёрным — для маски) в assets/icons/gi/ и правила в styles/r-icons.css:
// у <i class="fa-solid fa-X"> внутри окон системы, худа и чата знак Font Awesome заменяется маской со своим SVG, цвет — currentColor.
// Значки управления (крестик, плюс, минус, стрелки, корзина, перо правки) не трогаем — им нужна понятность, а не стиль.
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) { console.error("Укажите папку клона game-icons/icons"); process.exit(2); }
const map = JSON.parse(fs.readFileSync("tools/game-icons.json", "utf8"));
const OUT = "assets/icons/gi";
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f));
const authors = new Set(), files = new Map();
for (const [, src] of map) {
  if (files.has(src)) continue;
  const text = fs.readFileSync(path.join(SRC, `${src}.svg`), "utf8")
    .replace(/<path d="M0 0h512v512H0z"\/>/, "").replace(/fill="#fff"/g, 'fill="#000"');
  const name = src.replace("/", "-");
  fs.writeFileSync(path.join(OUT, `${name}.svg`), text);
  files.set(src, name); authors.add(src.split("/")[0]);
}
const scope = sel => [".vtm20", "#r-hud", ".chat-message", "#r-citymap"].map(s => `${s} .fa-${sel}::before`).join(", ");
const css = [`/* Значки game-icons.net (CC BY 3.0; авторы — assets/icons/SOURCES.md) вместо тематических значков Font Awesome.
   Собрано tools/game_icons.mjs из tools/game-icons.json — правьте таблицу, а не этот файл. */`,
  // :where — без веса (в списке есть #r-hud), чтобы уточнения ниже (вкладки, знаки сил) перебивали общее правило
  // старый глиф остаётся (прозрачным) и держит ту же геометрию, что была у Font Awesome: ширину, высоту строки, выравнивание;
  // новый знак ложится поверх по центру этого места — в кружке вкладки, в кнопке и в строке текста одинаково
  `:where(.vtm20, #r-hud, .chat-message, #r-citymap) :is(${map.map(([fa]) => `.fa-${fa}`).join(", ")}) { position: relative; }
:where(.vtm20, #r-hud, .chat-message, #r-citymap) :is(${map.map(([fa]) => `.fa-${fa}`).join(", ")})::before { color: transparent; }
:where(.vtm20, #r-hud, .chat-message, #r-citymap) :is(${map.map(([fa]) => `.fa-${fa}`).join(", ")})::after {
  content: ""; position: absolute; left: 50%; top: 50%; width: 1.25em; height: 1.25em; transform: translate(-50%, -50%); pointer-events: none;
  background-color: currentColor; -webkit-mask: var(--gi) center / contain no-repeat; mask: var(--gi) center / contain no-repeat;
}`,
  ...map.map(([fa, src]) => `${scope(fa).replaceAll("::before", "::after")} { --gi: url("../assets/icons/gi/${files.get(src)}.svg"); }`),
  // в кружках вкладок листа знак крупнее: силуэты game-icons тоньше залитых глифов Font Awesome
  `.vtm20 :is(.r-rtab-coin, .r-rail-tool) i::after { width: 1.5em; height: 1.5em; }`,
  // знаки Дисциплин, Граней, Арканоев, медали и печати — официальные символы линеек: если у силы нет своего знака
  // и в кружке стоит значок Font Awesome, он остаётся как был (подмена его не трогает)
  `/* знаки сил и линеек в кружках, медалях и печатях — без подмены */
:is(.vtm20, #r-hud, .chat-message, #r-citymap) :is([class*="sigil"], [class*="-sym"], [class*="medal"], [class*="seal"]) :is(${map.filter(([, , , inSigils]) => !inSigils).map(([fa]) => `.fa-${fa}`).join(", ")})::before {
  color: inherit;
}
:is(.vtm20, #r-hud, .chat-message, #r-citymap) :is([class*="sigil"], [class*="-sym"], [class*="medal"], [class*="seal"]) :is(${map.filter(([, , , inSigils]) => !inSigils).map(([fa]) => `.fa-${fa}`).join(", ")})::after { content: none; }`].join("\n");
fs.writeFileSync("styles/r-icons.css", css + "\n");
const credits = `# Значки game-icons.net

Тематические значки системы — из набора [game-icons.net](https://game-icons.net) (github.com/game-icons/icons),
лицензия [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Авторы: ${[...authors].map(a => ({ lorc: "Lorc", delapouite: "Delapouite", skoll: "Skoll" })[a] ?? a).join(", ")}.
Изменения: убран чёрный фон, знак перекрашен для маски. Файлы — assets/icons/gi/, соответствия — tools/game-icons.json.
`;
fs.writeFileSync("assets/icons/gi/SOURCES.md", credits);
console.log(`значков: ${files.size}, правил: ${map.length}, авторы: ${[...authors].join(", ")}`);
