// tools/ui-audit.mjs — обход интерфейса: снимки окон и проверка текста в них, со сравнением «до» и «после».
//
//   node tools/ui-audit.mjs [режим] [что] [--url http://localhost:30002] [--user Gamemaster] [--width 720]
//                           [--baseline] [--compare] [--threshold 0.05] [--headed]
//
// Режимы: compare (только сравнить уже снятое с образцом), sheets (листы НПС по видам генератора, все вкладки; «что» — виды через запятую: vampire,mage…),
//         apps (окна: lib,npcgen,lore,atlas,xp,roll,items,creator), chat (карточки чата), journals (журналы компендиев),
//         all (всё по очереди; по умолчанию).
// Проверка текста: утёкшие ключи VTM20.*, undefined/NaN/null, [object …], неподставленные {x}, сырые сущности и теги,
//         «..», пробел перед знаком, молча обрезанный текст, вылезшее за край окна; ошибки консоли и 404.
// Снимки и отчёты — tools/.cache/ui-audit/current. Сравнение:
//   --baseline  — после обхода сделать этот прогон образцом (tools/.cache/ui-audit/baseline);
//   --compare   — сравнить прогон с образцом: новые и ушедшие замечания и изменившиеся снимки (доля другого
//                 по пикселям, карта отличий — красным); сводка — tools/.cache/ui-audit/compare.html.
// Обычный порядок: перед большой правкой — `ui-audit all --baseline`, после — `ui-audit all --compare`.
// --threshold — сколько процентов точек может измениться, чтобы снимок считался тем же (0,05).
// Чем отличается от tools/e2e-shots.mjs: тот — быстрая проверка десятка окон на заданных данных (порог, провал);
// этот — полный обход всех вкладок, окон, шагов мастера и журналов с проверкой текста, для осмотра после больших правок.
// Генератор НПС случаен — на время сборки листа Math.random подменяется на зерно от вида, чтобы листы совпадали
// от прогона к прогону. Нужен запущенный Foundry с тестовым миром (как для tools/e2e.mjs), Edge.

import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = path.join(ROOT, "tools/.cache/ui-audit");
const CUR = path.join(BASE, "current"), REF = path.join(BASE, "baseline");
const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--url", "--user", "--width", "--threshold"].includes(args[i - 1])));
const [MODE = "all", ONLY = ""] = positional;
const URL = opt("--url", "http://localhost:30002").replace(/\/$/, "");
const USER = opt("--user", "Gamemaster");
const WIDTH = Number(opt("--width", process.env.AUDIT_WIDTH ?? 0)) || 0;
const THRESHOLD = (Number(opt("--threshold", 0.05)) || 0.05) / 100;     // доля изменившихся точек, ниже — снимок «тот же»
const MODES = MODE === "all" ? ["sheets", "apps", "chat", "journals"] : [MODE];

// без обхода: `ui-audit compare` сравнивает уже снятое с образцом
if (MODE === "compare") { await compare(); process.exit(process.exitCode ?? 0); }
if (MODES.some(m => !["sheets", "apps", "chat", "journals"].includes(m))) { console.error(`Неизвестный режим: ${MODE}`); process.exit(2); }

// прогон с частью режимов не стирает остальные снимки current — сравнение по тем отчётам, что сняты
fs.mkdirSync(CUR, { recursive: true });
if (!ONLY) for (const m of MODES) for (const f of fs.readdirSync(CUR)) if (f.startsWith(m === "sheets" ? "sheet-" : m === "apps" ? "app-" : m === "chat" ? "chat" : "journal-")
  || f === `report-${m}.json` || (m === "apps" && f.startsWith("creator-"))) fs.rmSync(path.join(CUR, f), { force: true });

const browser = await chromium.launch({ channel: "msedge", headless: !flag("--headed") });
const p = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
let errs = [];
p.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); });
p.on("pageerror", e => errs.push(String(e).slice(0, 300)));
p.on("response", r => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url().slice(0, 200)}`); });
await p.goto(`${URL}/join`, { waitUntil: "networkidle", timeout: 90000 });
if (p.url().includes("/join")) { await p.selectOption("select[name=userid]", { label: USER }); await p.click("button[name=join]"); }
await p.waitForFunction(() => globalThis.game?.ready, null, { timeout: 120000 });
await p.waitForTimeout(1500);

// проверка текста внутри элемента
await p.addScriptTag({ content: `
window.__lint = function (root) {
  const out = [], seen = new Set();
  const add = (kind, text, el) => { const k = kind + "|" + text; if (seen.has(k)) return; seen.add(k);
    out.push({ kind, text: String(text).replace(/\s+/g, " ").slice(0, 160), where: (el?.className?.baseVal ?? el?.className ?? "").toString().slice(0, 60) }); };
  const RX = [["ключ", /\\bVTM20\\.[A-Za-z][\\w.]+/], ["undefined", /\\bundefined\\b/], ["NaN", /\\bNaN\\b/], ["null", /(^|[\\s:(])null($|[\\s,.)])/],
    ["object", /\\[object [A-Za-z]+\\]/], ["{x}", /\\{[a-zA-Z]{2,}\\}/], ["сущность", /&(lt|gt|amp|quot|nbsp|#\\d+);/], ["тег", /<\\/?(p|b|em|strong|i|br|span|div|li|ul)\\b[^>]*>/i],
    ["двойная точка", /[а-яё]\\.\\.(?!\\.)/i], ["пробел перед знаком", /[а-яё] [,.:;!?](\\s|$)/i]];
  const check = (s, el, attr) => { if (!s) return; for (const [k, rx] of RX) { if (attr && k === "тег") continue; const m = s.match(rx); if (m) add((attr ? "подсказка: " : "") + k, s.slice(Math.max(0, m.index - 40), m.index + 60), el); } };
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const el = n.parentElement; if (!el || el.closest("script,style,template,datalist")) continue; check(n.nodeValue, el); }
  for (const el of root.querySelectorAll("[data-tooltip],[placeholder],[title],[aria-label]"))
    for (const a of ["data-tooltip", "placeholder", "title", "aria-label"]) { const v = el.getAttribute(a); if (v) check(v, el, true); }
  const box = root.getBoundingClientRect();
  for (const el of root.querySelectorAll("*")) {
    if (!el.offsetParent || el.children.length > 3) continue;
    const cs = getComputedStyle(el), txt = (el.innerText ?? "").trim();
    if (!txt || txt.length < 2) continue;
    if (cs.opacity === "0" || el.closest("[aria-hidden=true], .r-vs-sum")) continue;
    // обрезка в несколько строк (-webkit-line-clamp) — намеренная: превью раскрывается по щелчку
    // и карточка броска в чате: полосы по краям выходят за неё на несколько точек нарочно
    const clamped = (cs.webkitLineClamp && cs.webkitLineClamp !== "none") || el.matches(".r-roll-card, .message-content:has(> .r-roll-card)");
    if (el.scrollWidth > el.clientWidth + 3 && ["hidden", "clip"].includes(cs.overflowX) && cs.textOverflow !== "ellipsis" && !clamped && el.tagName !== "SELECT" && el.tagName !== "INPUT")
      add("обрезано", txt.slice(0, 80), el);
    const r = el.getBoundingClientRect();
    // в рамке с прокруткой или обрезкой внутри окна (широкая таблица журнала) — не «за краем»: её листают
    let framed = false;
    for (let a = el.parentElement; a && a !== root; a = a.parentElement) if (getComputedStyle(a).overflowX !== "visible") { framed = true; break; }
    if (r.width > 0 && r.right > box.right + 2 && cs.position !== "fixed" && !framed) add("за краем окна", txt.slice(0, 80), el);
  }
  return out;
};
// зерно для генератора НПС: одинаковые листы от прогона к прогону
window.__seeded = function (seedText, fn) {
  let h = 2166136261; for (const c of seedText) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let s = h >>> 0; const orig = Math.random;
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { return fn(); } finally { Math.random = orig; }
};` });

/** Снять окно во всю высоту содержимого и проверить его текст. */
async function shotApp(appId, file) {
  const box = await p.evaluate(async ([id, W]) => {
    const app = foundry.applications.instances.get(id), el = app.element;
    app.setPosition({ top: 10, left: 10, ...(W ? { width: W } : {}) }); await new Promise(r => setTimeout(r, 400));
    // растить окно, пока внутри есть прокрутка (прокручивается не окно, а вкладка или панель внутри)
    for (let i = 0; i < 4; i++) {
      let more = 0;
      for (const x of el.querySelectorAll("*")) {
        if (!x.offsetParent) continue;
        const oy = getComputedStyle(x).overflowY;
        if ((oy === "auto" || oy === "scroll") && x.scrollHeight > x.clientHeight + 4) more = Math.max(more, x.scrollHeight - x.clientHeight);
      }
      if (!more) break;
      app.setPosition({ height: Math.min(5000, el.getBoundingClientRect().height + more + 8) });
      await new Promise(r => setTimeout(r, 300));
    }
    const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, [appId, WIDTH]);
  await p.setViewportSize({ width: 1700, height: Math.max(1100, Math.ceil(box.y + box.height + 20)) });
  await p.waitForTimeout(250);
  await p.screenshot({ path: path.join(CUR, file), clip: box, animations: "disabled", caret: "hide" });
  return p.evaluate(id => window.__lint(foundry.applications.instances.get(id).element), appId);
}

const cleanup = () => p.evaluate(async () => { for (const a of game.actors.filter(a => a.name.startsWith("AUDIT —"))) { await a.sheet?.close(); await a.delete(); } });

async function sheets(report) {
  const KINDS = (ONLY || "vampire,ghoul,revenant,dhampir,mortal,faithful,hunter,garou,fera,kinfolk,spirit,demon,earthbound,thrall,mage,technocrat,nephandus,sorcerer,wraith,spectre,risen,changeling,kinain").split(",");
  for (const kind of KINDS) {
    await cleanup();
    const info = await p.evaluate(async (kind) => {
      const SYS = game.system.id, wait = ms => new Promise(r => setTimeout(r, ms));
      const NB = await import(`/systems/${SYS}/module/apps/npc-build.mjs`);
      const d = window.__seeded(`audit:${kind}`, () => NB.buildNpc({ kind, power: "veteran" }));
      const a = await NB.createNpc(d, { name: `AUDIT — ${kind}` });
      await a.setFlag(SYS, "created", true);
      await a.sheet.render(true); await wait(1500);
      const tabs = [...a.sheet.element.querySelectorAll('[data-action="tab"][data-group="primary"]')].map(x => x.dataset.tab);
      return { id: a.sheet.id, tabs, type: a.type };
    }, kind);
    for (const tab of info.tabs) {
      await p.evaluate(async ([id, tab]) => { foundry.applications.instances.get(id).changeTab(tab, "primary"); await new Promise(r => setTimeout(r, 900)); }, [info.id, tab]);
      const file = `sheet-${kind}-${tab}.png`, lint = await shotApp(info.id, file);
      report.push({ where: `лист ${kind} (${info.type}) · ${tab}`, file, lint });
      console.log(`  ${kind}/${tab}: ${lint.length}`);
    }
  }
  await cleanup();
}

async function apps(report) {
  // открыть окно (код в странице), снять все новые окна, закрыть
  async function shoot(name, code) {
    const ids = await p.evaluate(async (code) => {
      const SYS = game.system.id, wait = ms => new Promise(r => setTimeout(r, ms));
      const before = new Set(foundry.applications.instances.keys());
      try { await (new Function("SYS", "wait", `return (async () => { ${code} })()`))(SYS, wait); } catch (e) { return { err: String(e).slice(0, 200) }; }
      await wait(1400);
      return [...foundry.applications.instances.keys()].filter(k => !before.has(k) && foundry.applications.instances.get(k).rendered
        && !/^(chat-popout|notifications|tooltip)/.test(k));
    }, code);
    if (ids.err) { report.push({ where: name, lint: [{ kind: "ошибка открытия", text: ids.err }] }); console.log(`  ${name}: ОШИБКА ${ids.err}`); return; }
    for (const [i, id] of ids.entries()) {
      const file = `app-${name}${ids.length > 1 ? "-" + i : ""}.png`, lint = await shotApp(id, file);
      report.push({ where: name, file, lint }); console.log(`  ${name}: ${lint.length}`);
    }
    await p.evaluate(async (ids) => { for (const id of ids) await foundry.applications.instances.get(id)?.close(); }, ids);
  }
  await cleanup();
  await p.evaluate(async () => {
    const SYS = game.system.id, NB = await import(`/systems/${SYS}/module/apps/npc-build.mjs`);
    for (const k of ["vampire", "mage", "garou", "hunter", "demon", "wraith", "changeling"]) {
      const d = window.__seeded(`audit-app:${k}`, () => NB.buildNpc({ kind: k, power: "veteran" }));
      const a = await NB.createNpc(d, { name: `AUDIT — ${k}` }); await a.setFlag(SYS, "created", true);
    }
  });
  const A = k => `game.actors.getName("AUDIT — ${k}")`;
  const list = ONLY && MODE === "apps" ? ONLY.split(",") : ["lib", "npcgen", "lore", "atlas", "xp", "roll", "items", "creator"];
  if (list.includes("lib")) for (const [k, who] of [["discipline", "vampire"], ["path", "vampire"], ["ritual", "vampire"], ["combo", "vampire"], ["merit", "vampire"], ["flaw", "vampire"], ["background", "vampire"], ["derangement", "vampire"], ["investment", "vampire"], ["pact", "vampire"], ["edge", "hunter"], ["gift", "garou"], ["rite", "garou"]])
    await shoot(`lib-${k}`, `game.vtm20.openLibrary({ kind: "${k}", actor: ${A(who)} });`);
  if (list.includes("npcgen")) await shoot("npcgen", `game.vtm20.openNpcGenerator();`);
  if (list.includes("lore")) await shoot("lore", `game.vtm20.openLoreSearch();`);
  if (list.includes("atlas")) {
    const lines = await p.evaluate(async () => (await import(`/systems/${game.system.id}/module/apps/atlas.mjs`)).ATLAS_LINES.map(x => x.line));
    for (const l of lines) await shoot(`atlas-${l}`, `await game.vtm20.openAtlas("${l}");`);
  }
  if (list.includes("xp")) for (const k of ["vampire", "mage"]) await shoot(`xp-${k}`, `const { openXp } = await import("/systems/" + SYS + "/module/apps/xp.mjs"); openXp(${A(k)});`);
  if (list.includes("roll")) {
    await shoot("roll", `game.vtm20.RollDialog.prompt(${A("vampire")}, { trait1: "attributes.strength", trait2: "abilities.brawl" });`);
    await shoot("attack", `game.vtm20.openAttack(${A("vampire")});`);
  }
  if (list.includes("items")) for (const t of ["discipline", "power", "merit", "flaw", "background", "weapon", "derangement", "ritual", "thaumPath"])
    await shoot(`item-${t}`, `const it = game.actors.filter(a => a.name.startsWith("AUDIT —")).flatMap(a => [...a.items]).find(i => i.type === "${t}")
      ?? (await (await game.packs.find(p => p.metadata.type === "Item" && p.index.some(e => e.type === "${t}")).getDocuments()).find(i => i.type === "${t}")); await it?.sheet.render(true);`);
  if (list.includes("creator")) for (const t of ["vampire", "mage", "werewolf", "hunter", "demon", "wraith", "changeling", "mortal", "ghoul"]) {
    const n = await p.evaluate(async (t) => {
      const SYS = game.system.id, a = await Actor.create({ name: `AUDIT — cr-${t}`, type: t });
      const { openCreator } = await import(`/systems/${SYS}/module/apps/creator.mjs`); const cr = await openCreator(a);
      await new Promise(r => setTimeout(r, 1200)); window.__cr = cr ?? [...foundry.applications.instances.values()].find(x => x.constructor.name === "VtMCreator");
      return window.__cr.steps.length;
    }, t);
    for (let i = 0; i < n; i++) {
      const id = await p.evaluate(async (i) => { const cr = window.__cr; cr.step = i; await cr.render(); await new Promise(r => setTimeout(r, 900)); return cr.id; }, i);
      const step = await p.evaluate(() => window.__cr.stepKey);
      const file = `creator-${t}-${i}-${step}.png`, lint = await shotApp(id, file);
      report.push({ where: `мастер ${t} · ${step}`, file, lint }); console.log(`  мастер ${t}/${step}: ${lint.length}`);
    }
    await p.evaluate(async () => { await window.__cr.close(); });
  }
  await cleanup();
}

async function chat(report) {
  // типичные карточки чата: бросок, бросок черты, трата крови, урон, гуль-смертный, лечение витэ
  await cleanup();
  await p.evaluate(async () => {
    const SYS = game.system.id, wait = ms => new Promise(r => setTimeout(r, ms)), NB = await import(`/systems/${SYS}/module/apps/npc-build.mjs`);
    window.__chatBefore = new Set(game.messages.keys());
    const v = await NB.createNpc(window.__seeded("audit-chat", () => NB.buildNpc({ kind: "vampire", power: "veteran" })), { name: "AUDIT — chat" });
    await game.vtm20.rollPool({ actor: v, pool: 6, difficulty: 6, label: "Сила + Драка", speaker: ChatMessage.getSpeaker({ actor: v }) }); await wait(600);
    await game.vtm20.rollPool({ actor: v, pool: 3, difficulty: 8, label: "Восприятие + Бдительность", speaker: ChatMessage.getSpeaker({ actor: v }) }); await wait(600);
    await v.spendBlood(2, { reason: "проверка" }); await wait(400);
    await v.update({ "system.health.bashing": 2 }); await wait(300);
    const G = await import(`/systems/${SYS}/module/apps/ghouled.mjs`);
    const m = await Actor.create({ name: "AUDIT — chat2", type: "mortal" }); await G.toggleGhouled(m, "ghoul"); await wait(400);
    await m.update({ "system.ghouled.vitae": 2, "system.health.lethal": 1 }); await G.ghouledHeal(m); await wait(400);
    ui.sidebar.changeTab?.("chat", "primary"); ui.sidebar.expand?.(); await wait(800);
  });
  await p.waitForTimeout(1200);
  const box = await p.evaluate(() => { const el = document.querySelector("#chat") ?? document.querySelector("#sidebar"); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  await p.screenshot({ path: path.join(CUR, "chat.png"), clip: box, animations: "disabled", caret: "hide" });
  // проверять только карточки этого обхода: старые сообщения мира (прогоны e2e) — не его забота
  const lint = await p.evaluate(() => [...document.querySelectorAll("#chat .chat-log [data-message-id]")]
    .filter(el => !window.__chatBefore.has(el.dataset.messageId)).flatMap(el => window.__lint(el))
    .filter((x, i, a) => a.findIndex(y => y.kind === x.kind && y.text === x.text) === i));
  report.push({ where: "чат", file: "chat.png", lint }); console.log(`  чат: ${lint.length}`);
  // убрать за собой сообщения обхода
  await p.evaluate(async () => {
    for (const m of game.messages.contents.filter(m => !window.__chatBefore.has(m.id))) await m.delete();
  });
  await cleanup();
}

async function journals(report) {
  const packs = await p.evaluate(() => game.packs.filter(x => x.metadata.packageName === game.system.id && x.documentName === "JournalEntry").map(x => x.collection));
  for (const col of packs) {
    const id = await p.evaluate(async (col) => {
      const pack = game.packs.get(col), idx = await pack.getIndex(), list = idx.contents.sort((a, b) => a.name.localeCompare(b.name));
      const e = list[Math.floor(list.length / 2)] ?? list[0];
      const doc = await pack.getDocument(e._id); await doc.sheet.render(true); await new Promise(r => setTimeout(r, 1800)); return doc.sheet.id;
    }, col);
    const name = col.split(".").pop(), file = `journal-${name}.png`, lint = await shotApp(id, file);
    report.push({ where: `журнал ${name}`, file, lint }); console.log(`  журнал ${name}: ${lint.length}`);
    await p.evaluate(async (id) => foundry.applications.instances.get(id)?.close(), id);
  }
}

const RUN = { sheets, apps, chat, journals };
let total = 0;
for (const m of MODES) {
  console.log(`▸ ${m}`);
  errs = [];
  const report = [];
  await RUN[m](report);
  // ошибки консоли и загрузки (404) — с адресом
  report.push({ where: `консоль (${m})`, lint: errs.map(t => ({ kind: "ошибка", text: t })) });
  fs.writeFileSync(path.join(CUR, `report-${m}.json`), JSON.stringify({ mode: m, only: ONLY, width: WIDTH, at: new Date().toISOString(), report }, null, 1));
  const n = report.reduce((s, r) => s + r.lint.length, 0); total += n;
  console.log(`  — ${report.length - 1} снимков, ${n} замечаний`);
}
await browser.close();
console.log(`Итого замечаний: ${total}. Снимки и отчёты: ${path.relative(ROOT, CUR)}`);

if (flag("--baseline")) {
  fs.mkdirSync(REF, { recursive: true });
  for (const f of fs.readdirSync(CUR)) if (/\.(png|json)$/.test(f)) fs.copyFileSync(path.join(CUR, f), path.join(REF, f));
  console.log(`Образец обновлён: ${path.relative(ROOT, REF)}`);
}
if (flag("--compare")) await compare();

/** Сравнить current с baseline: замечания и снимки. */
async function compare() {
  if (!fs.existsSync(REF)) { console.error("Образца нет: сначала прогон с --baseline."); process.exitCode = 1; return; }
  const read = (dir, f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } };
  const reports = fs.readdirSync(CUR).filter(f => /^report-.+\.json$/.test(f));
  const rows = [];
  const DIFF = path.join(BASE, "diff");
  fs.rmSync(DIFF, { recursive: true, force: true }); fs.mkdirSync(DIFF, { recursive: true });
  const b = await chromium.launch({ channel: "msedge" }), pg = await b.newPage();
  await pg.setContent("<canvas></canvas>");
  for (const f of reports) {
    const cur = read(CUR, f), ref = read(REF, f);
    if (!ref) { console.log(`  ${f}: в образце нет — пропущено`); continue; }
    const key = r => r.file ?? r.where;
    const refBy = new Map(ref.report.map(r => [key(r), r]));
    const seenRef = new Set();
    for (const r of cur.report) {
      const o = refBy.get(key(r)); seenRef.add(key(r));
      const sig = x => `${x.kind}|${x.text}`;
      const before = new Set((o?.lint ?? []).map(sig)), after = new Set(r.lint.map(sig));
      const added = r.lint.filter(x => !before.has(sig(x))), gone = (o?.lint ?? []).filter(x => !after.has(sig(x)));
      let img = null;
      if (r.file && o?.file && fs.existsSync(path.join(CUR, r.file)) && fs.existsSync(path.join(REF, o.file))) {
        img = await pg.evaluate(async ([a, z]) => {
          const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
          const [A, Z] = await Promise.all([load(a), load(z)]);
          const w = Math.max(A.width, Z.width), h = Math.max(A.height, Z.height);
          const grab = im => { const c = new OffscreenCanvas(w, h), x = c.getContext("2d"); x.drawImage(im, 0, 0); return x.getImageData(0, 0, w, h).data; };
          const da = grab(A), dz = grab(Z), c = new OffscreenCanvas(w, h), cx = c.getContext("2d"), out = cx.createImageData(w, h);
          let diff = 0;
          for (let i = 0; i < da.length; i += 4) {
            const d = Math.abs(da[i] - dz[i]) + Math.abs(da[i + 1] - dz[i + 1]) + Math.abs(da[i + 2] - dz[i + 2]) + Math.abs(da[i + 3] - dz[i + 3]);
            const g = (dz[i] + dz[i + 1] + dz[i + 2]) / 12;   // тусклая подложка «после»
            if (d > 48) { diff++; out.data[i] = 255; out.data[i + 1] = 30; out.data[i + 2] = 30; out.data[i + 3] = 255; }
            else { out.data[i] = out.data[i + 1] = out.data[i + 2] = g; out.data[i + 3] = 255; }
          }
          const ratio = diff / (w * h);
          let png = null;
          if (diff) { cx.putImageData(out, 0, 0); const blob = await c.convertToBlob(); png = [...new Uint8Array(await blob.arrayBuffer())]; }
          return { ratio, sized: A.width !== Z.width || A.height !== Z.height, before: [A.width, A.height], after: [Z.width, Z.height], png };
        }, [`data:image/png;base64,${fs.readFileSync(path.join(REF, o.file)).toString("base64")}`, `data:image/png;base64,${fs.readFileSync(path.join(CUR, r.file)).toString("base64")}`]);
        if (img.png) { fs.writeFileSync(path.join(DIFF, r.file), Buffer.from(img.png)); img.png = true; }
      }
      const changed = img && (img.ratio > THRESHOLD || img.sized);
      if (added.length || gone.length || changed || !o) rows.push({ where: r.where, file: r.file, isNew: !o, added, gone, img });
    }
    // «пропало» — только при полном обходе режима: частичный (`sheets vampire`) снимал не всё
    if (!cur.only) for (const o of ref.report) if (!seenRef.has(key(o))) rows.push({ where: o.where, file: o.file, missing: true, added: [], gone: o.lint, img: null });
  }
  await b.close();
  rows.sort((a, z) => (z.added.length - a.added.length) || ((z.img?.ratio ?? 0) - (a.img?.ratio ?? 0)));
  const pct = x => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`;
  for (const r of rows) {
    const bits = [r.isNew && "новое окно", r.missing && "пропало", r.added.length && `+${r.added.length} замечаний`, r.gone.length && `−${r.gone.length}`,
      r.img && (r.img.ratio > THRESHOLD || r.img.sized) && `снимок ${pct(r.img.ratio)}${r.img.sized ? ` (${r.img.before.join("×")} → ${r.img.after.join("×")})` : ""}`].filter(Boolean);
    console.log(`  ${r.where}: ${bits.join(", ")}`);
    for (const x of r.added.slice(0, 5)) console.log(`      + ${x.kind}: ${x.text}`);
  }
  console.log(rows.length ? `Отличий: ${rows.length}. Сводка: ${path.relative(ROOT, path.join(BASE, "compare.html"))}` : "Отличий от образца нет.");
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const html = `<!doctype html><meta charset="utf-8"><title>Обход: сравнение с образцом</title>
<style>body{font:14px system-ui;background:#1b1512;color:#e8dccb;margin:20px}h1{font-size:20px}section{border-top:1px solid #4a3b30;padding:12px 0}
h2{font-size:15px;margin:0 0 6px}.add{color:#ff8a7a}.gone{color:#8fd18f}.imgs{display:flex;gap:8px;align-items:flex-start;overflow-x:auto}
.imgs figure{margin:0}.imgs img{max-width:520px;border:1px solid #4a3b30}figcaption{font-size:12px;color:#a89580}</style>
<h1>Обход: ${rows.length} отличий от образца</h1>
${rows.map(r => `<section><h2>${esc(r.where)}${r.isNew ? " — новое" : ""}${r.missing ? " — пропало" : ""}${r.img ? ` — снимок ${pct(r.img.ratio)}` : ""}</h2>
${r.added.map(x => `<div class="add">+ ${esc(x.kind)}: ${esc(x.text)}</div>`).join("")}${r.gone.map(x => `<div class="gone">− ${esc(x.kind)}: ${esc(x.text)}</div>`).join("")}
${r.file ? `<div class="imgs">${r.missing ? "" : `<figure><img src="current/${esc(r.file)}"><figcaption>после</figcaption></figure>`}${r.isNew ? "" : `<figure><img src="baseline/${esc(r.file)}"><figcaption>до</figcaption></figure>`}${r.img?.png ? `<figure><img src="diff/${esc(r.file)}"><figcaption>отличия</figcaption></figure>` : ""}</div>` : ""}</section>`).join("\n")}`;
  fs.writeFileSync(path.join(BASE, "compare.html"), html);
}
