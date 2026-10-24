// module/ui/assembly.mjs
// Теневое Собрание: сводка города и борьба фракций — бумаги эпохи на столе поверх карты в шторе «Город».
//
// Режимы шторы: Карта · Сводка · Собрание · Заседание · Эдикты · Герои · Летопись. Карта — сама штора
// (citymap.mjs); остальные режимы — стол (.rc-board) с документами 1791 года: бюллетень и табель кварталов,
// список членов, протокол заседания с поимённым голосованием, печатные эдикты, карты безопасности
// героев, рукописный реестр. Состояние — настройка мира «assembly» (пишет мастер). Голоса персонажей
// игроков — флаг их актёра (игрок голосует сам). Лор — module/data/assembly.mjs.
//
// Тайное и открытое:
//   · «hook» людей, тайные нити, секреты кварталов, шкала «След Вийона» — только мастеру, пока он не откроет глаз;
//   · черновики вопросов и бюллетени тайного голосования игроки не видят;
//   · Летопись (хронология ночей Революции) скрыта от игроков целиком: игрок видит лишь записи,
//     которые мастер открыл глазом; пока не открыто ничего — вкладки у игрока нет.

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { getClock, longDate } from "../apps/calendar.mjs";
import * as A from "../data/assembly.mjs";
import { attachCombos } from "./combo.mjs";

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const uid = () => foundry.utils.randomID(10);
const hint = t => `<i class="ra-q fa-solid fa-circle-question" data-tooltip="${esc(t)}"></i>`;
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const THRONE = { label: "Престол", short: "Престол", icon: "fa-crown", color: "#9a8f7c" };
const facOf = k => A.FACTIONS[k] ?? (k === "throne" ? THRONE : A.FACTIONS.neutral);
const clanLabel = k => A.CLANS[k]?.[0] ?? (k ? k : "клан неизвестен");
const floorOf = k => A.CLANS[k]?.[1] ?? 3;
const FLAG = "asmVotes";
/** Печать фракции или крыла — рисунок мастера (assets/factions, tools/build_faction_seals.py). */
const SEAL_KEYS = new Set(["montagnards", "girondins", "feuillants", "royalists", "neutral", "anarchs", "camarilla"]);
const sealSrc = k => foundry.utils.getRoute(`${SYSTEM_PATH}/assets/factions/seal-${SEAL_KEYS.has(k) ? k : "neutral"}.webp`);
const seal = (k, cls = "is-sm", extra = "") => `<img class="ra-fseal ${cls}" src="${sealSrc(k)}" alt="" ${extra}>`;

const MODES = [
  ["map", "Карта", "fa-map"], ["summary", "Сводка", "fa-newspaper"], ["power", "Собрание", "fa-users-rectangle"],
  ["session", "Заседание", "fa-gavel"], ["edicts", "Эдикты", "fa-scroll"], ["heroes", "Герои", "fa-id-card"], ["chronicle", "Летопись", "fa-book"]
];
/** Виды листков на стене вестей. */
const NOTICE = {
  news:   { label: "Весть",       hint: "Печатный листок" },
  decree: { label: "Постановление", hint: "Решение Собрания с печатью" },
  rumor:  { label: "Слух",        hint: "Записка от руки" },
  wanted: { label: "Розыск",      hint: "Объявление о розыске" }
};
const STAMP = { repealed: "Отменён", eased: "Смягчён", vote: "На голосовании", dormant: "Не исполняется", force: "" };

let host = null;          // { root, fly(lat, lng, zoom), influence(on), refresh() }
let mode = "map";
let sel = null, editing = false, distSel = null, edictSel = "leash", motionSel = null, tabChanged = false;
let picking = false;      // открыт выбор вопроса для повестки
let draft = null;         // черновик вести: { title, text, at, kind, i }

/* ═══ Состояние ═══════════════════════════════════════════════════════════ */

export function registerAssembly() {
  game.settings.register(SYSTEM_ID, "assembly", {
    scope: "world", config: false, type: Object, default: foundry.utils.deepClone(A.DEFAULT_STATE),
    onChange: () => { renderBoard(); drawModes(); host?.refresh?.(); }
  });
  Hooks.on("updateActor", (a, ch) => {
    if (["heroes", "power"].includes(mode) || (mode === "session" && ch.flags?.[SYSTEM_ID]?.[FLAG] !== undefined)) renderBoard();
  });
}

/** Вопросы, с которых начинается хроника (22 мая 1791). */
const seedMotions = () => [newMotion(A.QUESTIONS.find(q => q.key === "leash"), "ombres", { id: "m-leash", status: "open", at: "22 мая 1791", hidden: false }),
  newMotion(A.QUESTIONS.find(q => q.key === "commission"), "ombres", { id: "m-commission", status: "open", at: "22 мая 1791", hidden: false })];

export function asm() {
  const s = game.settings.get(SYSTEM_ID, "assembly") ?? {};
  const d = foundry.utils.deepClone(A.DEFAULT_STATE);
  const out = { ...d, ...s, districts: { ...d.districts, ...s.districts }, edicts: { ...d.edicts, ...s.edicts } };
  if (!Array.isArray(s.motions)) out.motions = seedMotions();
  return out;
}
async function save(patch) {
  if (!game.user.isGM) return;
  await game.settings.set(SYSTEM_ID, "assembly", { ...asm(), ...patch });
}
const isOpen = (s, id, def = false) => s.reveal?.[id] ?? def;
const orgOf = s => foundry.utils.deepClone(s.org?.length ? s.org : A.ORG);
const tiesOf = s => foundry.utils.deepClone(Array.isArray(s.ties) ? s.ties : A.TIES);
const formOf = s => A.FORMS[s.form] ?? A.FORMS.ombres;
/** Глаз мастера: открыть или скрыть тайну от игроков. */
const eye = (id, open) => `<a class="ra-eye ${open ? "is-open" : ""}" data-as="reveal" data-id="${esc(id)}" data-tooltip="${open ? "Игроки видят — скрыть" : "Скрыто от игроков — открыть"}"><i class="fa-solid ${open ? "fa-eye" : "fa-eye-slash"}"></i></a>`;
const dateNow = () => { try { return longDate(new Date(getClock())); } catch { return "май 1791"; } };

/** Кварталы и их хозяева — для слоя влияния на карте. */
export function influenceData() {
  const s = asm();
  return A.DISTRICTS.map(d => {
    const k = s.districts[d.key] ?? d.control;
    const f = facOf(k);
    return { ...d, fac: k, color: f.color, label: f.label };
  });
}

/* ═══ Каркас ══════════════════════════════════════════════════════════════ */

/** Подключить доску к шторе «Город». */
export function attachAssembly(root, api) {
  host = { root, ...api };
  const board = root.querySelector(".rc-board");
  board.addEventListener("click", onClick);
  board.addEventListener("contextmenu", onContext);
  board.addEventListener("change", onChange);
  board.addEventListener("input", ev => {
    const el = ev.target;
    if (el.dataset.news && draft) draft[el.dataset.news] = el.value;
    if (el.dataset.q) setQ(el);
    if (el.matches("[data-as-qsearch]")) {
      const needle = el.value.trim().toLowerCase();
      for (const it of board.querySelectorAll(".ra-qpick")) it.hidden = !!needle && !it.dataset.text.includes(needle);
      for (const g of board.querySelectorAll(".ra-qgroup")) g.hidden = ![...g.querySelectorAll(".ra-qpick")].some(x => !x.hidden);
    }
  });
  board.addEventListener("dragover", ev => { if (ev.target.closest("[data-as-drop]")) ev.preventDefault(); });
  board.addEventListener("drop", onDrop);
  root.querySelector(".rc-modes").addEventListener("click", ev => {
    const a = ev.target.closest("[data-mode]");
    if (a) setMode(a.dataset.mode);
  });
  drawModes();
}

export const boardMode = () => mode;
export function setMode(m) {
  if (!host) return;
  if (m !== "map" && !visibleModes().some(([k]) => k === m)) m = "map";
  tabChanged = mode !== m;
  mode = m;
  host.root.setAttribute("data-mode", m);
  drawModes();
  renderBoard();
}

function visibleModes() {
  const s = asm();
  const anyOpen = game.user.isGM || A.CHRONICLE.some(c => isOpen(s, `chr:${c.id}`));
  return MODES.filter(([k]) => k !== "chronicle" || anyOpen);
}

export function drawModes() {
  const nav = host?.root.querySelector(".rc-modes");
  if (!nav) return;
  // Собрание — только в эпоху Революции
  if (game.settings.get(SYSTEM_ID, "era") !== "revolution") { nav.innerHTML = ""; if (mode !== "map") { mode = "map"; renderBoard(); } return; }
  nav.innerHTML = visibleModes().map(([k, label, icon]) =>
    `<a class="${k === mode ? "on" : ""}" data-mode="${k}"><i class="fa-solid ${icon}"></i><span>${label}</span></a>`).join("");
}

export function renderBoard() {
  const board = host?.root.querySelector(".rc-board");
  if (!board) return;
  board.hidden = mode === "map";
  if (mode === "map") return;
  // не перерисовывать под пальцами
  const ae = document.activeElement;
  if (board.contains(ae) && ae.matches("textarea, input[type=text]")) return;
  const s = asm(), gm = game.user.isGM;
  const draw = { summary: tabSummary, power: tabPower, session: tabSession, edicts: tabEdicts, heroes: tabHeroes, chronicle: tabChronicle }[mode];
  const scroll = board.querySelector(".ra-scroll")?.scrollTop ?? 0;
  board.innerHTML = `<div class="ra-scroll ra-mode-${mode}">${draw(s, gm)}</div>`;
  attachCombos(board);
  board.querySelector(".ra-scroll").scrollTop = tabChanged ? 0 : scroll;
  tabChanged = false;
}

/** Шапка листа: мелкая строка, двойная линейка, заголовок, подзаголовок. */
const head = (kicker, title, sub = "", extra = "") => `<header class="ra-sh-head">
  ${kicker ? `<small class="ra-kicker">${kicker}</small>` : ""}<h3>${title}${extra}</h3>${sub ? `<p class="ra-sub">${sub}</p>` : ""}</header>`;

/* ═══ Сводка: бюллетень, табель кварталов, стена вестей ═══════════════════ */

function gauge(k, g, v, gm, s) {
  if (g.secret && !gm && !isOpen(s, `gauge:${k}`)) return "";
  const ticks = Array.from({ length: g.max }, (_, i) => `<i class="${i < v ? "on" : ""}" ${gm ? `data-as="gauge" data-key="${k}" data-v="${i + 1 === v ? i : i + 1}"` : ""}
    data-tooltip="${i + 1} — ${esc(g.steps[i + 1] ?? "")}"></i>`).join("");
  return `<div class="ra-gauge g-${k} ${v / g.max >= .7 ? "is-hot" : ""}">
    <div class="ra-gauge-head"><b>${esc(g.label)}</b>${hint(g.hint)}${gm && g.secret ? eye(`gauge:${k}`, isOpen(s, `gauge:${k}`)) : ""}
      <span class="ra-leader"></span><em class="ra-hand">${esc(g.steps[v] ?? "")}</em></div>
    <div class="ra-ticks" style="--n: ${g.max}">${ticks}</div>
  </div>`;
}

/** Голоса в крипте по фракциям и сила (влияние людей + кварталы). */
function seats(org) {
  const out = Object.fromEntries(Object.keys(A.FACTIONS).map(k => [k, { n: 0, infl: 0 }]));
  for (const n of org) {
    if (n.fac === "throne" || n.seat === false || n.status !== "active" || !out[n.fac]) continue;
    out[n.fac].n += 1; out[n.fac].infl += n.influence ?? 0;
  }
  return out;
}

function balance(s, org) {
  const st = seats(org);
  const w = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, v.infl + Object.values(s.districts).filter(x => x === k).length * 2]));
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1, top = Math.max(1, ...Object.values(w));
  return `<table class="ra-ledger">${Object.entries(A.FACTIONS).map(([k, f]) => `<tr>
      <td>${seal(k)}${esc(f.label)}</td>
      <td class="ra-bar"><i style="width: ${w[k] / top * 100}%; --c: ${f.color}"></i></td>
      <td class="ra-num" data-tooltip="Доля силы: влияние людей в крипте + кварталы по 2">${Math.round(w[k] / total * 100)}%</td>
      <td class="ra-num" data-tooltip="Голосов в крипте (делегатов в силе)">${st[k].n}</td></tr>`).join("")}</table>`;
}

function throneLine(s, org) {
  const v = org.find(n => n.id === "villon"), g = org.find(n => n.id === "gramont"), f = formOf(s);
  return `<div class="ra-throne">
    <p><span>Престол</span><b>${v?.status === "active" ? `занят — ${esc(v.name)}` : "пуст"}</b></p>
    <p><span>Принц</span><b>${esc(v?.name ?? "Вийон")}</b><em class="ra-hand">${esc((A.STATUS[v?.status] ?? A.STATUS.missing).label)}</em></p>
    ${g && g.status === "active" ? `<p><span>Хранитель</span><b>${esc(g.name)}</b></p>` : ""}
    <p><span>Власть</span><b>${esc(f.name)}</b><a class="ra-link" data-as="tosession" data-tooltip="Устройство и пути Собрания">${esc(f.fr)}</a></p>
  </div>`;
}

function districtRows(s, gm) {
  return A.DISTRICTS.map((d, i) => {
    const k = s.districts[d.key] ?? d.control, f = facOf(k), open = d.key === distSel;
    return `<div class="ra-drow ${open ? "is-open" : ""}">
      <a class="ra-drow-head" data-as="district" data-key="${d.key}">
        <span class="ra-no">${i + 1}.</span><b>${esc(d.name)}</b><span class="ra-leader"></span>
        <em style="--c: ${f.color}">${esc(f.label)}${d.contested ? "<sup>*</sup>" : ""}</em>
        ${seal(k, "is-sm is-end")}</a>
      ${open ? `<div class="ra-drow-body"><p>${esc(d.about)}</p>
        ${d.secret && (gm || isOpen(s, `dist:${d.key}`)) ? `<p class="ra-secret">${esc(d.secret)}${gm ? eye(`dist:${d.key}`, isOpen(s, `dist:${d.key}`)) : ""}</p>` : ""}
        ${gm ? `<div class="ra-seals">${Object.entries(A.FACTIONS).map(([fk, ff]) =>
          `<a class="ra-sealpick ${fk === k ? "is-on" : ""}" data-as="control" data-key="${d.key}" data-v="${fk}" data-tooltip="${esc(ff.label)}">${seal(fk, "is-md")}</a>`).join("")}</div>` : ""}
        <a class="ra-link" data-as="tomap" data-key="${d.key}"><i class="fa-solid fa-map-location-dot"></i> на карте</a></div>` : ""}
    </div>`;
  }).join("");
}

function notice(f, i, gm) {
  const kind = NOTICE[f.kind] ? f.kind : "news";
  const r = ((i * 37) % 9 - 4) * .35;
  return `<article class="ra-notice k-${kind}" style="--r: ${r}deg">
    ${kind === "decree" ? `<small class="ra-kicker">Теневое Собрание · Постановление</small>` : kind === "wanted" ? `<small class="ra-kicker">Розыск</small>` : ""}
    <b>${esc(f.title)}</b>
    ${f.text ? `<p>${esc(f.text)}</p>` : ""}
    <small class="ra-at">${esc(f.at)}</small>
    ${gm ? `<span class="ra-notice-tools"><a data-as="news-edit" data-i="${i}" data-tooltip="Переписать"><i class="fa-solid fa-pen-nib"></i></a>
      <a data-as="unfeed" data-i="${i}" data-tooltip="Сорвать листок"><i class="fa-solid fa-xmark"></i></a></span>` : ""}
  </article>`;
}

function newsForm() {
  const d = draft;
  return `<div class="ra-notice ra-draft k-${d.kind}">
    <small class="ra-kicker">${d.i != null ? "Переписать листок" : "Новый листок"}</small>
    <div class="ra-kinds">${Object.entries(NOTICE).map(([k, v]) => `<a class="${k === d.kind ? "is-on" : ""}" data-as="news-kind" data-v="${k}" data-tooltip="${esc(v.hint)}">${esc(v.label)}</a>`).join("")}</div>
    <input type="text" data-news="title" value="${esc(d.title)}" placeholder="Заголовок">
    <textarea data-news="text" rows="4" placeholder="Текст листка">${esc(d.text)}</textarea>
    <input type="text" data-news="at" value="${esc(d.at)}" placeholder="Дата">
    <div class="ra-tools"><a class="ra-stamp is-seal" data-as="news-post"><i class="fa-solid fa-thumbtack"></i>прибить</a>
      <a class="ra-stamp" data-as="news-cancel">отмена</a></div>
  </div>`;
}

function tabSummary(s, gm) {
  const org = orgOf(s);
  const feed = (s.feed ?? []).map((f, i) => notice(f, i, gm)).join("") || `<p class="ra-note">Стена пуста.</p>`;
  return `<div class="ra-desk ra-grid3">
    <section class="ra-sheet">
      ${head("Бюллетень Собрания · Bulletin de l'Assemblée", "Париж Сородичей", esc(dateNow()))}
      ${throneLine(s, org)}
      <h4>Положение города</h4>
      ${Object.entries(A.GAUGES).map(([k, g]) => gauge(k, g, s[k] ?? 0, gm, s)).join("")}
      <h4>Силы в крипте ${hint("Доля силы — влияние делегатов в крипте и кварталы по 2. Голоса — делегаты «в силе».")}</h4>
      ${balance(s, org)}
    </section>
    <section class="ra-sheet">
      ${head("Табель частей города", "Кварталы Парижа", "кто держит ночь в каждой части", `<a class="ra-mini" data-as="influence" data-tooltip="Показать влияние на карте"><i class="fa-solid fa-map"></i></a>`)}
      <div class="ra-drows">${districtRows(s, gm)}</div>
      <p class="ra-foot"><sup>*</sup> часть оспаривается${gm ? " · щелчок по строке — что там и печати хозяев" : ""}</p>
    </section>
    <section class="ra-wallcol">
      <div class="ra-wallhead"><h3>Стена вестей</h3>
        ${gm ? `<a class="ra-stamp" data-as="news-new"><i class="fa-solid fa-feather-pointed"></i>листок</a>
        <a class="ra-stamp is-seal" data-as="event" data-tooltip="1к10 + напряжение по таблице ночных событий; шкалы сдвигаются сами, весть — на стену и в чат"><i class="fa-solid fa-bell"></i>ночь в Париже</a>` : ""}</div>
      ${draft && gm ? newsForm() : ""}
      <div class="ra-wall">${feed}</div>
    </section>
  </div>`;
}

/* ═══ Собрание: список членов ═════════════════════════════════════════════ */

function visibleOrg(org, gm) { return gm ? org : org.filter(n => !n.hidden); }

/**
 * Актёр делегата: по UUID (выбран в досье) или по имени. Имена в списке Собрания и в мире пишут по-разному —
 * «Эльен «Кровавая»» и «Эльен Кровавая», «Граф» в кавычках, дефис или пробел, — поэтому имя сверяем без кавычек
 * и знаков, а если точного совпадения нет — по словам: все слова одного имени есть в другом, и такой актёр один.
 */
const words = s => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/[«»"„“”'’()]/g, " ").replace(/[-‐–—]/g, " ").split(/\s+/).filter(w => w.length > 1);
const actorCache = new Map();
function nodeActor(n) {
  if (!n?.actor) return null;
  if (n.actor.startsWith("Actor.")) return fromUuidSync(n.actor);
  if (actorCache.has(n.actor)) { const a = game.actors.get(actorCache.get(n.actor)); if (a) return a; }
  let a = game.actors.getName(n.actor);
  if (!a) {
    const want = words(n.actor), key = want.join(" ");
    const pool = game.actors.contents.filter(x => x.type === "vampire");
    a = pool.find(x => words(x.name).join(" ") === key) ?? null;
    if (!a) {
      const hits = pool.filter(x => { const have = words(x.name); return want.every(w => have.includes(w)) || (have.length > 1 && have.every(w => want.includes(w))); });
      a = hits.length === 1 ? hits[0] : null;
    }
  }
  if (a) actorCache.set(n.actor, a.id);
  return a;
}
const portrait = a => a?.img && !/mystery-man|icons\/svg/.test(a.img) ? a.img : null;
/** Портрет делегата: своя картинка из досье, иначе портрет актёра. */
const nodeImg = n => n.img || portrait(nodeActor(n));

/** Лицо: гравированный медальон — портрет актёра или знак клана на воске фракции. */
function face(n, cls = "ra-face") {
  const img = nodeImg(n);
  if (img) return `<span class="${cls} is-portrait"><img src="${esc(img)}" alt="" loading="lazy"></span>`;
  const sym = Codex.clanSymbol?.(n.clan);
  return `<span class="${cls}" style="--c: ${facOf(n.fac).color}">${sym
    ? `<span class="r-sym${sym.lum ? " is-lum" : ""}" style="--sym: url('${esc(sym.src)}')"></span>` : `<i class="fa-solid ${facOf(n.fac).icon}"></i>`}</span>`;
}

function pips(n, gm, cls = "ra-infl") {
  return `<span class="${cls}" data-tooltip="Влияние ${n.influence ?? 0} из 5${gm ? " — щёлкните, чтобы изменить" : ""}">${Array.from({ length: 5 }, (_, i) =>
    `<i class="${i < (n.influence ?? 0) ? "on" : ""}" ${gm ? `data-as="infl" data-id="${n.id}" data-v="${i + 1}"` : ""}></i>`).join("")}</span>`;
}

/* План зала: полукруг крипты, как зал Манежа в 1791 году. Слева «Гора» — монтаньяры, за ними Жиронда,
 * в середине «Болото» неприсоединившихся, справа фельяны и роялисты; внизу — бюро с пустым креслом Принца. */
const HALL = { w: 1000, h: 540, cx: 500, cy: 505, r0: 200, r1: 420 };
const SIDE = ["montagnards", "girondins", "neutral", "feuillants", "royalists"];
const NICK = { montagnards: "Гора", girondins: "Жиронда", neutral: "Болото", feuillants: "Фельяны", royalists: "Правая" };

/** Места в полукруге: ряды пропорционально длине дуги, потом слева направо по углу. */
function hallSeats(n) {
  if (!n) return [];
  const rows = n <= 10 ? 2 : n <= 22 ? 3 : n <= 38 ? 4 : 5;
  const radii = Array.from({ length: rows }, (_, i) => HALL.r0 + (HALL.r1 - HALL.r0) * (rows === 1 ? 1 : i / (rows - 1)));
  const sum = radii.reduce((x, y) => x + y, 0);
  const per = radii.map(r => Math.max(1, Math.round(n * r / sum)));
  let diff = n - per.reduce((x, y) => x + y, 0);
  for (let i = rows - 1; diff !== 0; i = (i + rows - 1) % rows) { if (diff > 0) { per[i]++; diff--; } else if (per[i] > 1) { per[i]--; diff++; } }
  const out = [];
  radii.forEach((r, i) => {
    for (let j = 0; j < per[i]; j++) {
      const th = Math.PI * (1 - (j + .5) / per[i]);
      out.push({ x: HALL.cx + r * Math.cos(th), y: HALL.cy - r * Math.sin(th), th, row: i });
    }
  });
  return out.sort((p, q) => q.th - p.th || p.row - q.row);
}
const pct = (x, y) => `left: ${x / HALL.w * 100}%; top: ${y / HALL.h * 100}%`;

function seat(n, p, no, gm, link) {
  const st = A.STATUS[n.status] ?? A.STATUS.active, f = facOf(n.fac), k = link ? A.TIE_KINDS[link.kind] : null;
  return `<a class="ra-seat ${n.id === sel ? "is-sel" : ""} ${sel && n.id !== sel ? link ? "is-linked" : "is-dim" : ""} ${n.hidden ? "is-hidden" : ""} ${n.pc ? "is-pc" : ""} st-${n.status}"
      data-as="node" data-id="${n.id}" style="${pct(p.x, p.y)}; --c: ${f.color}; ${k ? `--tc: ${k.color}` : ""}"
      data-tooltip="${no}. ${esc(n.name)} — ${esc(clanLabel(n.clan))}, ${esc(n.office)}${n.status !== "active" ? ` (${esc(st.label)})` : ""}${k ? ` · ${esc(k.label)}${link.label ? `: ${esc(link.label)}` : ""}` : ""}">
    ${face(n, "ra-seat-face")}<b class="ra-seat-no">${no}</b>
    ${n.status === "dead" ? `<i class="ra-seat-x">✝</i>` : n.status !== "active" ? `<i class="ra-seat-x">?</i>` : ""}
  </a>`;
}

/** Нити выбранного — чернильные дуги через середину зала. */
function threads(pos, links) {
  if (!sel || !pos.has(sel)) return "";
  const a = pos.get(sel);
  return [...links].filter(([id]) => pos.has(id)).map(([id, t]) => {
    const b = pos.get(id), k = A.TIE_KINDS[t.kind] ?? A.TIE_KINDS.ally;
    const mx = (a.x + b.x) / 2 + (HALL.cx - (a.x + b.x) / 2) * .35, my = (a.y + b.y) / 2 + (HALL.cy - (a.y + b.y) / 2) * .35;
    return `<path d="M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}" stroke="${k.color}" ${t.kind === "secret" ? `stroke-dasharray="6 5"` : ""}/>`;
  }).join("");
}

function tabPower(s, gm) {
  const org = visibleOrg(orgOf(s), gm);
  const ids = new Set(org.map(n => n.id));
  for (const n of org) if (n.parent && !ids.has(n.parent)) n.parent = null;
  if (sel && !ids.has(sel)) { sel = null; editing = false; }
  const links = new Map();
  if (sel) for (const t of tiesOf(s)) {
    if (!gm && t.kind === "secret") continue;
    if (t.a === sel && ids.has(t.b)) links.set(t.b, t);
    else if (t.b === sel && ids.has(t.a)) links.set(t.a, t);
  }
  // делегаты слева направо по фракциям, внутри — по влиянию
  const members = SIDE.flatMap(k => org.filter(n => n.fac === k).sort((x, y) => (y.influence ?? 0) - (x.influence ?? 0) || x.name.localeCompare(y.name)));
  const spots = hallSeats(members.length);
  const pos = new Map(), no = new Map();
  members.forEach((n, i) => { pos.set(n.id, spots[i]); no.set(n.id, i + 1); });
  const throne = org.filter(n => n.fac === "throne");
  throne.forEach((n, i) => { pos.set(n.id, { x: HALL.cx + (i - (throne.length - 1) / 2) * 78, y: HALL.cy - 50 }); no.set(n.id, members.length + i + 1); });
  // подписи секторов по внешней дуге
  const sectors = SIDE.map(k => {
    const own = members.map((n, i) => n.fac === k ? spots[i] : null).filter(Boolean);
    if (!own.length) return "";
    const th = Math.min(Math.PI * .9, Math.max(Math.PI * .1, own.reduce((x, p) => x + p.th, 0) / own.length)), r = HALL.r1 + 50;
    const x = HALL.cx + r * Math.cos(th), y = HALL.cy - r * Math.sin(th);
    return `<text x="${x}" y="${y}" transform="rotate(${90 - th * 180 / Math.PI} ${x} ${y})" fill="${facOf(k).color}">${esc(NICK[k])}</text>`;
  }).join("");
  // ряды, проходы и бюро — гравюра зала
  const arcs = [HALL.r0 - 34, ...Array.from({ length: 4 }, (_, i) => HALL.r0 + 20 + i * ((HALL.r1 - HALL.r0) / 3.2)), HALL.r1 + 30]
    .map(r => `<path d="M${HALL.cx - r},${HALL.cy} A${r},${r} 0 0 1 ${HALL.cx + r},${HALL.cy}"/>`).join("");
  const aisles = [.2, .4, .6, .8].map(q => { const th = Math.PI * q; return `<line x1="${HALL.cx + (HALL.r0 - 34) * Math.cos(th)}" y1="${HALL.cy - (HALL.r0 - 34) * Math.sin(th)}" x2="${HALL.cx + (HALL.r1 + 30) * Math.cos(th)}" y2="${HALL.cy - (HALL.r1 + 30) * Math.sin(th)}"/>`; }).join("");
  const keyFor = k => {
    const xs = members.filter(n => n.fac === k);
    if (!xs.length && !gm) return "";
    const f = A.FACTIONS[k];
    return `<p class="ra-key" style="--c: ${f.color}">${seal(k)}<b>${esc(f.label)}</b>${hint(`${f.about} ${f.motto}`)}
      ${gm ? `<a class="ra-mini" data-as="add" data-fac="${k}" data-tooltip="Новый делегат"><i class="fa-solid fa-plus"></i></a>` : ""} —
      ${xs.map(n => `<a class="${n.id === sel ? "is-sel" : ""} st-${n.status} ${n.hidden ? "is-hidden" : ""}" data-as="node" data-id="${n.id}"><sup>${no.get(n.id)}</sup>${esc(n.name)}${n.pc ? "<sup class=\"ra-red\">✶</sup>" : ""}</a>`).join(", ") || "—"}.</p>`;
  };
  const f = formOf(s);
  return `<div class="ra-desk ra-power ${sel ? "has-sel" : ""}">
      <section class="ra-sheet ra-hall">
        ${head("Plan de la Salle · план зала", "Теневое Собрание", `${esc(f.name)} · крипта аббатства Сен-Жермен-де-Пре`,
          gm ? `<a class="ra-mini is-danger" data-as="org-reset" data-tooltip="Вернуть список и нити по умолчанию"><i class="fa-solid fa-rotate-left"></i></a>` : "")}
        <div class="ra-hemi">
          <svg viewBox="0 0 ${HALL.w} ${HALL.h}" preserveAspectRatio="none" aria-hidden="true">
            <g class="ra-hemi-lines">${arcs}${aisles}</g>
            <g class="ra-hemi-bureau"><rect x="${HALL.cx - 120}" y="${HALL.cy - 92}" width="240" height="84"/><text x="${HALL.cx}" y="${HALL.cy + 30}">Бюро · Престол</text></g>
            <g class="ra-hemi-sectors">${sectors}</g>
            <image href="${sealSrc("anarchs")}" x="18" y="${HALL.cy - 62}" width="56" height="56"/>
            <image href="${sealSrc("camarilla")}" x="${HALL.w - 74}" y="${HALL.cy - 62}" width="56" height="56"/>
            <g class="ra-threads">${threads(pos, links)}</g>
          </svg>
          ${members.map(n => seat(n, pos.get(n.id), no.get(n.id), gm, links.get(n.id))).join("")}
          ${throne.map(n => seat(n, pos.get(n.id), no.get(n.id), gm, links.get(n.id))).join("")}
        </div>
        <div class="ra-keys">
          <p class="ra-key is-throne"><b>Престол</b> — ${throne.map(n => `<a class="${n.id === sel ? "is-sel" : ""} st-${n.status}" data-as="node" data-id="${n.id}"><sup>${no.get(n.id)}</sup>${esc(n.name)}</a> <em class="ra-hand ra-red">${esc((A.STATUS[n.status] ?? A.STATUS.active).label)}</em>`).join(", ")}.</p>
          ${SIDE.map(keyFor).join("")}
          <p class="ra-foot"><sup class="ra-red">✶</sup> персонажи игроков · щелчок по месту — досье; нити выбранного прочерчены чернилами, пунктир — тайные.</p>
        </div>
      </section>
      <aside class="ra-dossier">${dossier(s, orgOf(s).filter(n => gm || !n.hidden), gm)}</aside>
    </div>`;
}

function dossier(s, org, gm) {
  const n = org.find(x => x.id === sel);
  if (!n) return `<div class="ra-sheet ra-paper is-empty">${head("Досье", "—")}
    <p>Выберите Сородича в списке — откроется досье: клан и Этаж Пирамиды, что о нём говорят в крипте${gm ? ", что он прячет" : ""} и с кем он связан. Связанные подсветятся.</p>
    ${gm ? `<p class="ra-note">Влияние — щелчком по точкам; актёра можно бросить на досье — будет портрет.</p>` : ""}</div>`;
  if (gm && editing) return editForm(n, org, s);
  const byId = new Map(org.map(x => [x.id, x]));
  const f = facOf(n.fac), st = A.STATUS[n.status] ?? A.STATUS.active;
  const fl = A.FLOORS.find(x => x.n === floorOf(n.clan));
  const ties = tiesOf(s).filter(t => (t.a === n.id || t.b === n.id) && (gm || t.kind !== "secret") && byId.has(t.a) && byId.has(t.b));
  const boss = byId.get(n.parent), subs = org.filter(x => x.parent === n.id);
  const a = nodeActor(n);
  return `<div class="ra-sheet ra-paper" data-as-drop style="--c: ${f.color}">
    <small class="ra-kicker">Досье · Dossier</small>
    ${face(n, "ra-dos-face")}
    <h3 class="ra-dos-name">${esc(n.name)}</h3>
    <p class="ra-sub">${esc(n.office)}</p>
    <table class="ra-form">
      <tr><th>Фракция</th><td>${n.fac === "throne" ? "" : seal(n.fac)}${esc(f.label)}</td></tr>
      <tr><th>Кровь</th><td>${esc(clanLabel(n.clan))}${fl ? ` · <span data-tooltip="${esc(fl.hint)}">${esc(fl.label)}</span>` : ""}</td></tr>
      <tr><th>Влияние</th><td>${pips(n, gm, "ra-infl is-big")}</td></tr>
      <tr><th>Положение</th><td class="ra-hand">${esc(st.label)}</td></tr>
      ${boss ? `<tr><th>Под рукой у</th><td><a data-as="node" data-id="${boss.id}">${esc(boss.name)}</a></td></tr>` : ""}
      ${subs.length ? `<tr><th>Его люди</th><td>${subs.map(x => `<a data-as="node" data-id="${x.id}">${esc(x.name)}</a>`).join(", ")}</td></tr>` : ""}
      ${a ? `<tr><th>Лист</th><td><a data-as="sheet" data-uuid="${a.uuid}">${esc(a.name)}</a></td></tr>` : ""}
    </table>
    ${gm ? `<div class="ra-chips">${Object.entries(A.STATUS).map(([k, v]) => `<a class="${k === n.status ? "is-on" : ""}" data-as="status" data-v="${k}"><i class="fa-solid ${v.icon}"></i>${esc(v.label)}</a>`).join("")}</div>` : ""}
    <p class="ra-dos-text">${esc(n.stance)}</p>
    ${n.hook && (gm || isOpen(s, `hook:${n.id}`)) ? `<p class="ra-secret">${esc(n.hook)}${gm ? eye(`hook:${n.id}`, isOpen(s, `hook:${n.id}`)) : ""}</p>` : ""}
    ${ties.length ? `<h4>Нити</h4><ul class="ra-ties">${ties.map(t => {
      const o = byId.get(t.a === n.id ? t.b : t.a), k = A.TIE_KINDS[t.kind] ?? A.TIE_KINDS.ally;
      const dir = t.kind === "sire" ? (t.a === n.id ? "дитя" : "сир") : t.kind === "patron" ? (t.a === n.id ? "подопечный" : "патрон") : k.label;
      return `<li style="--c: ${k.color}"><em>${esc(dir)}</em><a data-as="node" data-id="${o.id}">${esc(o.name)}</a><small>${esc(t.label)}</small></li>`;
    }).join("")}</ul>` : ""}
    ${gm ? `<div class="ra-tools">
      <a class="ra-stamp" data-as="edit"><i class="fa-solid fa-pen-nib"></i>править</a>
      <a class="ra-stamp" data-as="add-sub"><i class="fa-solid fa-user-plus"></i>его человек</a></div>` : ""}
  </div>`;
}

function editForm(n, org, s) {
  const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;
  const desc = new Set();
  const walk = id => { for (const x of org) if (x.parent === id && !desc.has(x.id)) { desc.add(x.id); walk(x.id); } };
  walk(n.id);
  const byId = new Map(org.map(x => [x.id, x]));
  const ties = tiesOf(s).filter(t => t.a === n.id || t.b === n.id);
  return `<div class="ra-sheet ra-paper is-edit" data-as-drop>
    <small class="ra-kicker">Досье · правка</small>
    <label>Имя<input type="text" data-f="name" value="${esc(n.name)}"></label>
    <label>Должность<input type="text" data-f="office" value="${esc(n.office)}"></label>
    <div class="ra-row">
      <label>Фракция<select data-f="fac">${opt("throne", n.fac, "Престол")}${Object.entries(A.FACTIONS).map(([k, f]) => opt(k, n.fac, f.label)).join("")}</select></label>
      <label>Клан<select data-f="clan">${opt("", n.clan, "—")}${Object.entries(A.CLANS).map(([k, c]) => opt(k, n.clan, c[0])).join("")}</select></label>
    </div>
    <label>Под рукой у<select data-f="parent">${opt("", n.parent ?? "", "— никого —")}${org.filter(x => x.id !== n.id && !desc.has(x.id)).map(x => opt(x.id, n.parent ?? "", x.name)).join("")}</select></label>
    <label>Что знают в крипте<textarea data-f="stance" rows="3">${esc(n.stance)}</textarea></label>
    <label>Тайное — только мастеру<textarea data-f="hook" rows="3">${esc(n.hook)}</textarea></label>
    <div class="ra-row">
      <label class="is-check"><input type="checkbox" data-f="hidden" ${n.hidden ? "checked" : ""}> игроки не видят</label>
      <label class="is-check"><input type="checkbox" data-f="pc" ${n.pc ? "checked" : ""}> персонаж игрока</label>
      <label class="is-check"><input type="checkbox" data-f="noseat" ${n.seat === false ? "checked" : ""}> без голоса</label>
    </div>
    <label>Портрет — своя картинка (если актёра нет или нужен другой образ)
      <span class="ra-pick"><input type="text" data-f="img" value="${esc(n.img ?? "")}" placeholder="путь к картинке"><a class="ra-stamp" data-as="img-pick" data-tooltip="Выбрать файл"><i class="fa-solid fa-image"></i></a></span></label>
    <label>Актёр (портрет, голос игрока)<select data-f="actor">${opt("", nodeActor(n)?.uuid ?? "", "— нет —")}${game.actors.contents.filter(x => x.type === "vampire").sort((x, y) => x.name.localeCompare(y.name)).map(x => opt(x.uuid, nodeActor(n)?.uuid ?? "", x.name)).join("")}</select></label>
    <h4>Нити</h4>
    <ul class="ra-ties">${ties.map(t => {
      const o = byId.get(t.a === n.id ? t.b : t.a), k = A.TIE_KINDS[t.kind] ?? A.TIE_KINDS.ally;
      return o ? `<li style="--c: ${k.color}"><em>${esc(k.label)}</em><b>${esc(o.name)}</b><small>${esc(t.label)}</small>
        <a class="ra-x" data-as="untie" data-a="${t.a}" data-b="${t.b}" data-k="${t.kind}" data-tooltip="Оборвать нить"><i class="fa-solid fa-scissors"></i></a></li>` : "";
    }).join("") || `<li class="is-none">нет</li>`}</ul>
    <div class="ra-tieform">
      <select data-t="b">${org.filter(x => x.id !== n.id).map(x => opt(x.id, "", x.name)).join("")}</select>
      <select data-t="kind">${Object.entries(A.TIE_KINDS).map(([k, v]) => opt(k, "ally", v.label)).join("")}</select>
      <input type="text" data-t="label" placeholder="что их связывает">
      <a class="ra-stamp" data-as="tie" data-tooltip="Сир и патрон — тот, кто в досье, старший"><i class="fa-solid fa-link"></i>связать</a>
    </div>
    <div class="ra-tools">
      <a class="ra-stamp is-seal" data-as="save"><i class="fa-solid fa-stamp"></i>скрепить</a>
      <a class="ra-stamp" data-as="cancel">отмена</a>
      <a class="ra-stamp is-danger" data-as="del" data-tooltip="Его люди перейдут к его старшему"><i class="fa-solid fa-skull"></i>вычеркнуть</a>
    </div>
  </div>`;
}

/* ═══ Заседание: вопросы, поимённое голосование, пути Собрания ═══════════ */

/** Новый вопрос из шаблона: правила — свои у вопроса, иначе по форме власти. Новый вопрос скрыт от игроков. */
function newMotion(q, formKey, extra = {}) {
  const f = A.FORMS[formKey] ?? A.FORMS.ombres;
  return {
    id: uid(), q: q.key, group: q.group ?? "custom", title: q.title, text: q.text ?? "", options: foundry.utils.deepClone(q.options),
    defaults: { ...q.defaults }, effects: foundry.utils.deepClone(q.effects ?? {}),
    mode: q.mode ?? f.mode, threshold: f.threshold === "unanimous" ? "unanimous" : q.threshold ?? f.threshold, veto: q.veto ?? f.veto,
    secret: !!q.secret, quorum: q.quorum ?? 0, voters: foundry.utils.deepClone(q.voters ?? null), hidden: q.hidden ?? true,
    votes: {}, absent: {}, status: "draft", winner: null, at: dateNow(), ...extra
  };
}

/** Кто голосует: делегаты «в силе», с местом в крипте; вопрос может ограничить фракциями или поимённым списком. */
const voters = (org, m) => org.filter(n => n.fac !== "throne" && n.seat !== false && n.status === "active" && !m.absent?.[n.id]
  && (!m.voters?.facs?.length || m.voters.facs.includes(n.fac)) && (!m.voters?.ids?.length || m.voters.ids.includes(n.id)));
/** Голос делегата: игрок — флагом своего актёра; прочие — отметка мастера, иначе линия фракции. */
function voteOf(m, n) {
  const a = n.pc ? nodeActor(n) : null;
  const own = a?.getFlag?.(SYSTEM_ID, FLAG)?.[m.id];
  const v = own ?? m.votes?.[n.id] ?? m.defaults?.[n.fac] ?? "abstain";
  return v === "abstain" || m.options.some(o => o.key === v) ? v : "abstain";
}
const isOwnVote = (m, n) => !!(n.pc ? nodeActor(n)?.getFlag?.(SYSTEM_ID, FLAG)?.[m.id] : m.votes?.[n.id]);

/** Подсчёт по правилам вопроса: по головам, по Этажам, по фракциям, по цензу; с кворумом. */
function count(m, org) {
  const keys = [...m.options.map(o => o.key), "abstain"];
  const w = Object.fromEntries(keys.map(k => [k, 0]));
  const vs = voters(org, m);
  const majority = group => {
    const c = Object.fromEntries(keys.map(k => [k, 0]));
    for (const n of group) c[voteOf(m, n)] += 1;
    const best = Object.entries(c).sort((a, b) => b[1] - a[1]);
    return best[0][1] > 0 && best[0][1] !== best[1]?.[1] ? best[0][0] : "abstain";
  };
  if (m.mode === "faction" || m.mode === "floor") {
    const groups = new Map();
    for (const n of vs) {
      const g = m.mode === "faction" ? n.fac : floorOf(n.clan);
      if (m.mode === "floor" && g === 0) continue;   // Цоколь не голосует по сословиям
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(n);
    }
    for (const g of groups.values()) w[majority(g)] += 1;
  } else for (const n of vs) w[voteOf(m, n)] += m.mode === "census" ? Math.max(1, n.influence ?? 1) : 1;
  const cast = m.options.reduce((a, o) => a + w[o.key], 0), total = cast + w.abstain;
  const ranked = m.options.map(o => [o.key, w[o.key]]).sort((a, b) => b[1] - a[1]);
  const [lead, lw] = ranked[0] ?? [null, 0], second = ranked[1]?.[1] ?? 0;
  const ok = { simple: lw > cast / 2, absolute: lw > total / 2, twothirds: cast > 0 && lw >= cast * 2 / 3,
    plurality: lw > second, unanimous: cast > 0 && lw === cast }[m.threshold] ?? lw > cast / 2;
  const quorum = vs.length >= (m.quorum ?? 0);
  return { w, cast, total, voters: vs.length, quorum, winner: lw > 0 && ok && quorum ? lead : null };
}

/** Порицательный исход: «против», «оставить», «оправдать». */
const NEGATIVE = new Set(["no", "keep", "acquit"]);
const optLabel = (m, k) => k === "abstain" ? "воздержались" : m.options.find(o => o.key === k)?.label ?? k;
function verdict(m, winner) {
  if (!winner) return { stamp: "Не решено", cls: "is-none" };
  if (m.options.length === 2 && m.options.some(o => NEGATIVE.has(o.key))) return NEGATIVE.has(winner) ? { stamp: "Отклонено", cls: "is-fail" } : { stamp: "Принято", cls: "is-pass" };
  return { stamp: "Решено", cls: "is-pass", text: optLabel(m, winner) };
}

/** Последствия варианта словами — мастеру в протоколе и конструкторе. */
function fxText(fx, org) {
  if (!fx) return "";
  const out = [];
  if (fx.edicts) out.push(`все статуты: ${A.EDICT_STATUS[fx.edicts]?.label}`);
  if (fx.edict) out.push(`${A.EDICTS.find(e => e.key === fx.edict[0])?.name ?? fx.edict[0]}: ${A.EDICT_STATUS[fx.edict[1]]?.label ?? fx.edict[1]}`);
  for (const [k, g] of Object.entries(A.GAUGES)) if (fx[k]) out.push(`${g.label} ${fx[k] > 0 ? "+" : ""}${fx[k]}`);
  if (fx.form) out.push(`власть → ${A.FORMS[fx.form]?.name}`);
  if (fx.district) out.push(`${A.DISTRICTS.find(d => d.key === fx.district[0])?.name}: ${facOf(fx.district[1]).label}`);
  if (fx.node) out.push(`${org.find(n => n.id === fx.node[0])?.name ?? fx.node[0]}: ${A.STATUS[fx.node[1]]?.label}`);
  if (fx.news) out.push("весть на стену");
  return out.join("; ");
}

const ST_LABEL = { draft: "черновик", open: "голосуется", suspended: "отложено вето", vetoed: "вето", withdrawn: "снято" };
function motionRow(m) {
  const st = m.status === "decided" ? (m.winner ? optLabel(m, m.winner) : "не решено") : ST_LABEL[m.status];
  const gm = game.user.isGM;
  return `<div class="ra-motion ${m.id === motionSel ? "is-sel" : ""} ms-${m.status} ${m.hidden ? "is-hidden" : ""}" data-as="motion" data-id="${m.id}">
    <b>${m.hidden && gm ? `<i class="fa-solid fa-eye-slash ra-red" data-tooltip="Скрыто от игроков"></i> ` : ""}${esc(m.title)}</b>
    <small><span class="ra-hand">${esc(st)}</span> · ${esc(A.Q_GROUPS[m.group] ?? "")}${m.at ? ` · ${esc(m.at)}` : ""}</small>
    ${gm ? `<span class="ra-motion-tools">
      <a data-as="m-eye" data-id="${m.id}" data-tooltip="${m.hidden ? "Проявить игрокам" : "Скрыть от игроков"}"><i class="fa-solid ${m.hidden ? "fa-eye-slash" : "fa-eye"}"></i></a>
      <a data-as="m-del" data-id="${m.id}" data-tooltip="Убрать голосование из протоколов"><i class="fa-solid fa-xmark"></i></a></span>` : ""}</div>`;
}

/* ── Выбор вопроса: библиотека, свои шаблоны, поиск, сортировка ── */

let qSort = "group", orderSort = "status", orderShow = "all";
const library = s => [...A.QUESTIONS.filter(q => q.key !== "custom"), ...(s.templates ?? []).map(t => ({ ...t, own: true }))];
const sortBy = (list, how, title = x => x.title) => {
  const by = { alpha: (a, b) => title(a).localeCompare(title(b), "ru"), group: (a, b) => Object.keys(A.Q_GROUPS).indexOf(a.group ?? "custom") - Object.keys(A.Q_GROUPS).indexOf(b.group ?? "custom") || title(a).localeCompare(title(b), "ru"),
    own: (a, b) => (b.own ? 1 : 0) - (a.own ? 1 : 0) || title(a).localeCompare(title(b), "ru") }[how];
  return by ? [...list].sort(by) : list;
};

function picker(s) {
  const qs = sortBy(library(s), qSort);
  const item = q => `<div class="ra-qpick" data-text="${esc(`${q.title} ${q.text ?? ""} ${A.Q_GROUPS[q.group] ?? ""}`.toLowerCase())}">
      <div><b>${q.own ? `<i class="fa-solid fa-feather-pointed ra-red" data-tooltip="Свой шаблон"></i> ` : ""}${esc(q.title)}</b>
        ${q.text ? `<small>${esc(q.text)}</small>` : ""}
        <em>${q.options.map(o => esc(o.label)).join(" · ")} — ${esc(A.THRESHOLDS[q.threshold]?.label ?? "по форме власти")}</em></div>
      <span class="ra-qacts"><a class="ra-stamp is-seal" data-as="q-add" data-key="${q.key}" data-tooltip="Вынести черновиком (скрыт от игроков)"><i class="fa-solid fa-plus"></i></a>
        <a class="ra-stamp" data-as="q-edit-tpl" data-key="${q.key}" data-tooltip="${q.own ? "Править шаблон" : "Открыть в конструкторе"}"><i class="fa-solid fa-pen-ruler"></i></a>
        ${q.own ? `<a class="ra-stamp is-danger" data-as="q-del-tpl" data-key="${q.key}" data-tooltip="Удалить шаблон"><i class="fa-solid fa-trash"></i></a>` : ""}</span></div>`;
  let body;
  if (qSort === "group") body = Object.entries(A.Q_GROUPS).map(([g, label]) => {
    const xs = qs.filter(q => (q.group ?? "custom") === g);
    return xs.length ? `<section class="ra-qgroup"><h5>${esc(label)} <small>${xs.length}</small></h5>${xs.map(item).join("")}</section>` : "";
  }).join("");
  else body = `<section class="ra-qgroup">${qs.map(item).join("")}</section>`;
  return `<div class="ra-sheet ra-picker">${head("Вынести на заседание", "Вопросы повестки", `${qs.length} вопросов · всё вынесенное скрыто от игроков, пока вы не проявите`,
      `<a class="ra-mini" data-as="q-close" data-tooltip="Закрыть"><i class="fa-solid fa-xmark"></i></a>`)}
    <div class="ra-qbar">
      <label class="ra-quill"><i class="fa-solid fa-magnifying-glass"></i><input type="text" data-as-qsearch placeholder="поиск по названию и сути…"></label>
      <label>Сортировка<select data-as-qsort>${[["group", "по разделам"], ["alpha", "по алфавиту"], ["own", "сначала свои"]].map(([k, l]) => `<option value="${k}" ${k === qSort ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <a class="ra-stamp is-seal" data-as="q-new"><i class="fa-solid fa-pen-ruler"></i>свой вопрос</a>
    </div>
    <div class="ra-qlist">${body}</div></div>`;
}

/* ── Конструктор вопроса ── */

let qd = null;   // { mode: "new" | "tpl" | "motion", ref, q }
function qFrom(src, s, effects = src.effects) {
  const f = formOf(s);
  return {
    title: src.title ?? "", text: src.text ?? "", group: src.group ?? "custom",
    options: (src.options ?? []).map(o => ({ key: o.key, label: o.label, fx: foundry.utils.deepClone(effects?.[o.key] ?? {}) })),
    defaults: { ...Object.fromEntries(Object.keys(A.FACTIONS).map(k => [k, "abstain"])), ...(src.defaults ?? {}) },
    mode: src.mode ?? f.mode, threshold: src.threshold ?? f.threshold, veto: src.veto ?? f.veto, secret: !!src.secret, quorum: src.quorum ?? 0,
    who: src.voters?.facs?.length ? "factions" : src.voters?.ids?.length ? "members" : "all",
    facs: [...(src.voters?.facs ?? [])], ids: [...(src.voters?.ids ?? [])], hidden: src.hidden ?? true
  };
}
const cleanFx = fx => {
  const out = {};
  for (const [k, v] of Object.entries(fx ?? {})) {
    if (v == null || v === "" || v === 0 || (Array.isArray(v) && !v[0])) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : null;
};
/** Черновик конструктора → поля вопроса (общие для шаблона и голосования). */
function qFields(q) {
  const options = q.options.map((o, i) => ({ key: o.key || `o${i + 1}`, label: o.label.trim() || `Вариант ${i + 1}` }));
  return {
    title: q.title.trim() || "Без названия", text: q.text.trim(), group: q.group, options,
    defaults: Object.fromEntries(Object.entries(q.defaults).map(([k, v]) => [k, v === "abstain" || options.some(o => o.key === v) ? v : "abstain"])),
    effects: Object.fromEntries(q.options.map((o, i) => [options[i].key, cleanFx(o.fx)]).filter(([, fx]) => fx)),
    mode: q.mode, threshold: q.threshold, veto: q.veto, secret: !!q.secret, quorum: Number(q.quorum) || 0,
    voters: q.who === "factions" && q.facs.length ? { facs: q.facs } : q.who === "members" && q.ids.length ? { ids: q.ids } : null, hidden: !!q.hidden
  };
}

function qEditor(s) {
  const q = qd.q, org = orgOf(s);
  const opt = (v, cur, label) => `<option value="${esc(v)}" ${String(v) === String(cur ?? "") ? "selected" : ""}>${esc(label)}</option>`;
  const sel = (attrs, cur, items, none = "—") => `<select ${attrs}>${none != null ? opt("", cur, none) : ""}${items.map(([v, l]) => opt(v, cur, l)).join("")}</select>`;
  const optRow = (o, i) => {
    const fx = o.fx ?? {};
    const data = f => `data-q="opt" data-i="${i}" data-f="${f}"`;
    return `<div class="ra-qopt">
      <div class="ra-qopt-head"><span class="ra-no">${i + 1}.</span><input type="text" ${data("label")} value="${esc(o.label)}" placeholder="вариант ответа">
        <a data-as="q-opt-up" data-i="${i}" data-tooltip="Выше"><i class="fa-solid fa-arrow-up"></i></a>
        <a data-as="q-opt-down" data-i="${i}" data-tooltip="Ниже"><i class="fa-solid fa-arrow-down"></i></a>
        <a class="is-danger" data-as="q-opt-del" data-i="${i}" data-tooltip="Убрать вариант"><i class="fa-solid fa-xmark"></i></a></div>
      <details ${cleanFx(fx) ? "open" : ""}><summary>Если победит — последствия${cleanFx(fx) ? `: <i>${esc(fxText(cleanFx(fx), org))}</i>` : ""}</summary>
        <div class="ra-qfx">
          <label>Эдикт${sel(data("edict"), fx.edict?.[0], A.EDICTS.map(e => [e.key, e.name]))}</label>
          <label>…станет${sel(data("edictStatus"), fx.edict?.[1] ?? "repealed", Object.entries(A.EDICT_STATUS).map(([k, v]) => [k, v.label]), null)}</label>
          <label>Все статуты разом${sel(data("edicts"), fx.edicts, Object.entries(A.EDICT_STATUS).map(([k, v]) => [k, v.label]))}</label>
          <label>Власть Собрания${sel(data("form"), fx.form, A.FORM_ORDER.map(k => [k, A.FORMS[k].name]))}</label>
          <label>Квартал${sel(data("district"), fx.district?.[0], A.DISTRICTS.map(d => [d.key, d.name]))}</label>
          <label>…переходит к${sel(data("districtFac"), fx.district?.[1] ?? "neutral", Object.entries(A.FACTIONS).map(([k, f]) => [k, f.label]), null)}</label>
          <label>Сородич${sel(data("node"), fx.node?.[0], org.filter(n => n.fac !== "throne").map(n => [n.id, n.name]))}</label>
          <label>…его судьба${sel(data("nodeStatus"), fx.node?.[1] ?? "hunted", Object.entries(A.STATUS).map(([k, v]) => [k, v.label]), null)}</label>
          <div class="ra-qgauges">${Object.entries(A.GAUGES).map(([k, g]) => `<label>${esc(g.label)}<input type="number" min="-5" max="5" step="1" ${data(`g:${k}`)} value="${fx[k] ?? 0}"></label>`).join("")}</div>
          <label class="ra-wide">Весть на стену (пусто — без вести)<input type="text" ${data("news")} value="${esc(fx.news ?? "")}"></label>
        </div></details>
    </div>`;
  };
  const lineOpts = [...q.options.map(o => [o.key, o.label || "—"]), ["abstain", "воздержаться"]];
  return `<div class="ra-sheet ra-qed" data-who="${q.who}">
    ${head(qd.mode === "motion" ? "Правка вопроса на заседании" : qd.mode === "tpl" ? "Правка своего шаблона" : "Конструктор вопроса", "Вопрос повестки", "всё, что угодно: закон, выборы, суд, сделка",
      `<a class="ra-mini" data-as="q-cancel" data-tooltip="Закрыть без сохранения"><i class="fa-solid fa-xmark"></i></a>`)}
    <label>Название<input type="text" class="ra-titlein" data-q="title" value="${esc(q.title)}" placeholder="Отмена Эдикта…, Избрание…, Суд над…"></label>
    <label>Суть — что знают делегаты<textarea data-q="text" rows="2">${esc(q.text)}</textarea></label>
    <div class="ra-row">
      <label>Раздел${sel(`data-q="group"`, q.group, Object.entries(A.Q_GROUPS).map(([k, v]) => [k, v]), null)}</label>
      <label class="is-check"><input type="checkbox" data-q="hidden" ${q.hidden ? "checked" : ""}> скрыт от игроков</label>
    </div>
    <h4>Варианты ответа ${hint("Сколько угодно вариантов. У каждого — последствия, которые применятся, если он победит: эдикт, шкалы, власть Собрания, хозяин квартала, судьба Сородича, весть на стену.")}</h4>
    ${q.options.map(optRow).join("")}
    <div class="ra-tools"><a class="ra-stamp" data-as="q-opt-add"><i class="fa-solid fa-plus"></i>вариант</a>
      <a class="ra-stamp" data-as="q-opt-yesno" data-tooltip="Заменить варианты на «за / против»">за / против</a></div>
    <h4>Линии фракций ${hint("Как фракция голосует по умолчанию. В протоколе мастер меняет голос отдельного делегата, игроки голосуют сами.")}</h4>
    <table class="ra-form ra-qlines">${Object.entries(A.FACTIONS).map(([k, f]) => `<tr><th>${seal(k)}${esc(f.label)}</th><td>${sel(`data-q="line" data-fac="${k}"`, q.defaults[k] ?? "abstain", lineOpts, null)}</td></tr>`).join("")}</table>
    <h4>Правила голосования</h4>
    <div class="ra-row">
      <label>Счёт${sel(`data-q="mode"`, q.mode, Object.entries(A.COUNT_MODES).map(([k, v]) => [k, v.label]), null)}</label>
      <label>Порог${sel(`data-q="threshold"`, q.threshold, Object.entries(A.THRESHOLDS).map(([k, v]) => [k, v.label]), null)}</label>
      <label>Вето${sel(`data-q="veto"`, q.veto, Object.entries(A.VETO).map(([k, v]) => [k, v.label]), null)}</label>
      <label>Кворум<input type="number" min="0" max="60" data-q="quorum" value="${q.quorum ?? 0}"></label>
      <label class="is-check"><input type="checkbox" data-q="secret" ${q.secret ? "checked" : ""}> тайное</label>
    </div>
    <div class="ra-row ra-qwho">
      <label class="is-check"><input type="radio" name="ra-qwho" data-q="who" value="all" ${q.who === "all" ? "checked" : ""}> голосуют все</label>
      <label class="is-check"><input type="radio" name="ra-qwho" data-q="who" value="factions" ${q.who === "factions" ? "checked" : ""}> только фракции</label>
      <label class="is-check"><input type="radio" name="ra-qwho" data-q="who" value="members" ${q.who === "members" ? "checked" : ""}> только поимённо (комитет, суд)</label>
    </div>
    <div class="ra-qwho-facs">${Object.entries(A.FACTIONS).map(([k, f]) => `<label class="is-check"><input type="checkbox" data-q="facs" value="${k}" ${q.facs.includes(k) ? "checked" : ""}>${seal(k)}${esc(f.label)}</label>`).join("")}</div>
    <div class="ra-qwho-ids">${Object.entries(A.FACTIONS).map(([k, f]) => `<p><b>${esc(f.label)}:</b> ${org.filter(n => n.fac === k).map(n => `<label class="is-check"><input type="checkbox" data-q="ids" value="${n.id}" ${q.ids.includes(n.id) ? "checked" : ""}>${esc(n.name)}</label>`).join("")}</p>`).join("")}</div>
    <div class="ra-tools">
      <a class="ra-stamp is-seal" data-as="q-save-motion"><i class="fa-solid fa-gavel"></i>${qd.mode === "motion" ? "сохранить вопрос" : "вынести на заседание"}</a>
      <a class="ra-stamp" data-as="q-save-tpl" data-tooltip="Сохранить в библиотеку вопросов"><i class="fa-solid fa-book-bookmark"></i>${qd.mode === "tpl" ? "сохранить шаблон" : "в свои шаблоны"}</a>
      <a class="ra-stamp" data-as="q-cancel">отмена</a>
    </div>
  </div>`;
}

/** Вписать поле конструктора в черновик — без перерисовки, чтобы не сбить ввод. */
function setQ(el) {
  if (!qd) return;
  const q = qd.q, f = el.dataset.q, val = el.type === "checkbox" ? el.checked : el.value;
  if (f === "opt") {
    const o = q.options[Number(el.dataset.i)];
    if (!o) return;
    const k = el.dataset.f;
    o.fx ??= {};
    if (k === "label") o.label = val;
    else if (k === "edict") o.fx.edict = val ? [val, o.fx.edict?.[1] ?? "repealed"] : null;
    else if (k === "edictStatus") { if (o.fx.edict) o.fx.edict[1] = val; }
    else if (k === "edicts") o.fx.edicts = val || null;
    else if (k === "form") o.fx.form = val || null;
    else if (k === "district") o.fx.district = val ? [val, o.fx.district?.[1] ?? "neutral"] : null;
    else if (k === "districtFac") { if (o.fx.district) o.fx.district[1] = val; }
    else if (k === "node") o.fx.node = val ? [val, o.fx.node?.[1] ?? "hunted"] : null;
    else if (k === "nodeStatus") { if (o.fx.node) o.fx.node[1] = val; }
    else if (k === "news") o.fx.news = val;
    else if (k.startsWith("g:")) o.fx[k.slice(2)] = Math.clamp(Number(val) || 0, -5, 5);
    return;
  }
  if (f === "line") { q.defaults[el.dataset.fac] = val; return; }
  if (f === "facs" || f === "ids") { const set = new Set(q[f]); el.checked ? set.add(el.value) : set.delete(el.value); q[f] = [...set]; return; }
  if (f === "quorum") { q.quorum = Math.max(0, Number(val) || 0); return; }
  if (f === "who") { if (el.checked) { q.who = val; el.closest(".ra-qed").dataset.who = val; } return; }
  q[f] = val;
}

function protocol(s, m, gm) {
  const org = visibleOrg(orgOf(s), true);
  const f = formOf(s), c = count(m, org), v = verdict(m, m.status === "decided" ? m.winner : c.winner);
  const opt = (val, cur, label) => `<option value="${val}" ${val === cur ? "selected" : ""}>${esc(label)}</option>`;
  const showNames = gm || !m.secret;
  const veto = m.veto ?? f.veto;
  const cols = [...m.options, { key: "abstain", label: "Возд." }];
  const vs = new Set(voters(org, { ...m, absent: {} }).map(n => n.id));
  const cell = (n, k, val) => {
    const a = n.pc ? nodeActor(n) : null;
    const can = m.status === "open" && (gm || (a?.isOwner ?? false));
    return `<td class="ra-cell ${val === k ? "is-on" : ""} ${can ? "can" : ""}" ${can ? `data-as="vote" data-id="${n.id}" data-v="${k}"` : ""}>${val === k ? `<span class="ra-mark">×</span>` : ""}</td>`;
  };
  const rows = Object.entries(A.FACTIONS).map(([fk, fa]) => {
    const members = org.filter(n => n.fac === fk && vs.has(n.id) && (gm || !n.hidden));
    if (!members.length) return "";
    const line = m.defaults?.[fk] ?? "abstain";
    return `<tr class="ra-facrow" style="--c: ${fa.color}"><th>${seal(fk)}${esc(fa.label)}
        <small>линия фракции</small></th>
      ${cols.map(o => `<td class="ra-cell ${line === o.key ? "is-line" : ""} ${gm && m.status !== "decided" ? "can" : ""}" ${gm && m.status !== "decided" ? `data-as="line" data-fac="${fk}" data-v="${o.key}"` : ""}>${line === o.key ? `<i class="fa-solid fa-arrow-down"></i>` : ""}</td>`).join("")}
      <td></td></tr>
      ${members.map(n => {
        const away = !!m.absent?.[n.id], val = away ? null : voteOf(m, n);
        return `<tr class="${away ? "is-away" : ""} ${isOwnVote(m, n) ? "is-own" : ""} ${n.pc ? "is-pc" : ""}">
          <td class="ra-who">${esc(n.name)}${n.pc ? ` <em>игрок</em>` : ""}${m.mode === "census" ? ` <small>×${Math.max(1, n.influence ?? 1)}</small>` : ""}${m.mode === "floor" ? ` <small>${floorOf(n.clan) ? ROMAN[floorOf(n.clan) - 1] + " эт." : "цоколь"}</small>` : ""}</td>
          ${cols.map(o => cell(n, o.key, val)).join("")}
          <td class="ra-cell ${gm && m.status !== "decided" ? "can" : ""}" ${gm && m.status !== "decided" ? `data-as="absent" data-id="${n.id}"` : ""} data-tooltip="Отсутствует">${away ? `<span class="ra-mark is-word">отс.</span>` : ""}</td></tr>`;
      }).join("")}`;
  }).join("");
  const tally = `<tr class="ra-total"><th>Итого${m.mode !== "head" ? ` <small>${esc(A.COUNT_MODES[m.mode]?.label)}</small>` : ""}</th>${cols.map(o => `<td>${c.w[o.key]}</td>`).join("")}<td></td></tr>`;
  const vetoHolder = A.FORMS[s.form]?.vetoBy;
  const holder = vetoHolder === "arbiters" ? "арбитры (неприсоединившиеся)" : orgOf(s).find(n => n.id === vetoHolder)?.name;
  const limits = [m.voters?.facs?.length ? `голосуют: ${m.voters.facs.map(k => facOf(k).label).join(", ")}` : "", m.voters?.ids?.length ? `голосуют поимённо: ${m.voters.ids.length}` : "",
    m.quorum ? `кворум ${m.quorum}` : ""].filter(Boolean).join(" · ");
  const effects = gm ? m.options.map(o => [o, fxText(m.effects?.[o.key], org)]).filter(([, t]) => t) : [];
  return `<article class="ra-sheet ra-protocol ${m.hidden ? "is-hidden" : ""}">
    ${head(`Procès-verbal de la séance · ${esc(f.name)}${m.hidden && gm ? ` · <span class="ra-red">скрыт от игроков</span>` : ""}`, esc(m.title), `${esc(A.Q_GROUPS[m.group] ?? "")}${m.at ? ` · ${esc(m.at)}` : ""}`,
      gm ? `<span class="ra-head-tools"><a class="ra-mini" data-as="m-eye" data-id="${m.id}" data-tooltip="${m.hidden ? "Проявить игрокам" : "Скрыть от игроков"}"><i class="fa-solid ${m.hidden ? "fa-eye-slash" : "fa-eye"}"></i></a>
        ${m.status !== "decided" ? `<a class="ra-mini" data-as="q-edit-motion" data-id="${m.id}" data-tooltip="Править в конструкторе"><i class="fa-solid fa-pen-ruler"></i></a>` : ""}
        <a class="ra-mini is-danger" data-as="m-del" data-id="${m.id}" data-tooltip="Убрать голосование из протоколов"><i class="fa-solid fa-trash"></i></a></span>` : "")}
    ${m.text ? `<p class="ra-gist">${esc(m.text)}</p>` : ""}
    ${effects.length ? `<p class="ra-fxnote">${effects.map(([o, t]) => `<b>${esc(o.label)}:</b> ${esc(t)}`).join("<br>")}</p>` : ""}
    <div class="ra-rules">
      ${gm && m.status !== "decided" ? `<label>Счёт<select data-m="mode">${Object.entries(A.COUNT_MODES).map(([k, x]) => opt(k, m.mode, x.label)).join("")}</select></label>
        <label>Порог<select data-m="threshold">${Object.entries(A.THRESHOLDS).map(([k, x]) => opt(k, m.threshold, x.label)).join("")}</select></label>
        <label class="is-check"><input type="checkbox" data-m="secret" ${m.secret ? "checked" : ""}> тайно</label>`
        : `<span data-tooltip="${esc(A.COUNT_MODES[m.mode]?.hint)}">счёт ${esc(A.COUNT_MODES[m.mode]?.label)}</span>
        <span data-tooltip="${esc(A.THRESHOLDS[m.threshold]?.hint)}">${esc(A.THRESHOLDS[m.threshold]?.label)}</span>${m.secret ? "<span>тайное голосование</span>" : ""}`}
      ${limits ? `<span>${esc(limits)}</span>` : ""}
      ${hint(`${A.COUNT_MODES[m.mode]?.hint ?? ""} ${A.THRESHOLDS[m.threshold]?.hint ?? ""} Склонить голос делегата: Манипуляция + Политика против сложности 5 + его влияние, −1 за каждую услугу, которую он вам должен; успехов не меньше его влияния — голос ваш, провал — Напряжение +1.`)}
    </div>
    ${showNames ? `<table class="ra-roll"><thead><tr><th>Appel nominal · поимённо</th>${cols.map(o => `<th>${esc(o.label)}</th>`).join("")}<th>Отс.</th></tr></thead>
      <tbody>${rows}</tbody><tfoot>${tally}</tfoot></table>`
      : `<p class="ra-urn"><i class="fa-solid fa-box-archive"></i>Тайное голосование: бюллетени в урне. ${cols.map(o => `${esc(o.label)} — ${m.status === "decided" ? c.w[o.key] : "?"}`).join(" · ")}</p>`}
    <p class="ra-note">Голосующих делегатов в силе: ${c.voters}${m.mode === "faction" ? " (фракция — один голос)" : m.mode === "floor" ? " (Этаж — один голос, Цоколь без голоса)" : ""}${!c.quorum ? ` — <b class="ra-red">нет кворума (${m.quorum})</b>` : ""}.
      ${m.status === "open" && !gm ? "Ваш голос — щелчок в строке вашего персонажа." : ""}</p>
    <div class="ra-verdictrow">
      ${["decided", "vetoed", "suspended"].includes(m.status) ? `<span class="ra-seal-stamp ${m.status === "vetoed" ? "is-fail" : m.status === "suspended" ? "is-none" : v.cls}">${m.status === "vetoed" ? "Вето" : m.status === "suspended" ? "Отложено" : esc(v.stamp)}${v.text && m.status !== "vetoed" && m.status !== "suspended" ? `<small>${esc(v.text)}</small>` : ""}</span>` : ""}
      <p>${m.status === "decided" ? "Решение записано в протокол." : m.status === "open" ? `Сейчас: ${c.winner ? `<b>${esc(optLabel(m, c.winner))}</b>` : "<b>решения нет</b>"} — ${esc(A.THRESHOLDS[m.threshold]?.label)}.` : m.status === "draft" ? "Черновик: голосование ещё не открыто." : ""}
        ${veto !== "none" && holder ? `<br><small>${esc(A.VETO[veto].label)}: ${esc(holder)}</small>` : ""}</p>
    </div>
    ${gm ? `<div class="ra-tools">
      ${m.status === "draft" ? `<a class="ra-stamp is-seal" data-as="m-open"><i class="fa-solid fa-box-archive"></i>открыть голосование</a>` : ""}
      ${m.status === "open" ? `<a class="ra-stamp is-seal" data-as="m-proclaim" data-tooltip="Записать итог: последствия, весть на стену и в чат (скрытый вопрос — только мастеру)"><i class="fa-solid fa-gavel"></i>огласить итог</a>
        ${veto !== "none" ? `<a class="ra-stamp" data-as="m-veto" data-tooltip="${esc(A.VETO[veto].hint ?? "")}"><i class="fa-solid fa-hand"></i>${esc(A.VETO[veto].label)}</a>` : ""}
        <a class="ra-stamp" data-as="m-reset" data-tooltip="Все снова голосуют по линии фракций"><i class="fa-solid fa-rotate-left"></i>голоса по линиям</a>` : ""}
      ${["suspended", "withdrawn", "decided"].includes(m.status) ? `<a class="ra-stamp" data-as="m-reopen"><i class="fa-solid fa-rotate"></i>вынести снова</a>` : ""}
      ${m.status !== "decided" && m.status !== "withdrawn" ? `<a class="ra-stamp" data-as="m-withdraw"><i class="fa-solid fa-ban"></i>снять</a>` : ""}
    </div>` : ""}
  </article>`;
}

function constitution(s, gm) {
  const f = formOf(s), cur = s.form ?? "ombres";
  const past = new Set((s.formHistory ?? []).map(h => h.form));
  const next = new Map(f.next.map(([to, how]) => [to, how]));
  const cards = A.FORM_ORDER.map(k => {
    const x = A.FORMS[k], how = next.get(k), hist = (s.formHistory ?? []).filter(h => h.form === k).map(h => h.at).join(", ");
    return `<div class="ra-form-card ${k === cur ? "is-now" : ""} ${past.has(k) && k !== cur ? "is-past" : ""} ${how ? "is-next" : ""}">
      <span class="ra-form-ico"><i class="fa-solid ${x.icon}"></i></span>
      <b>${esc(x.name)}</b><small class="ra-fr">${esc(x.fr)}</small>
      <small class="ra-day">${esc(x.day)}</small>
      ${hist ? `<small class="ra-hand">${esc(hist)}</small>` : ""}
      ${how ? `<p class="ra-how ra-hand">→ ${esc(how)}</p>
        ${gm ? `<span class="ra-tools"><a class="ra-stamp" data-as="reform" data-to="${k}" data-tooltip="Вынести преобразование на голосование"><i class="fa-solid fa-gavel"></i>голосовать</a>
          <a class="ra-stamp is-danger" data-as="coup" data-to="${k}" data-tooltip="Переворот: сменить форму власти без голосования"><i class="fa-solid fa-bolt"></i>переворот</a></span>` : ""}` : ""}
    </div>`;
  }).join("");
  return `<section class="ra-sheet ra-constitution">
    ${head("Устройство Собрания · Constitution", esc(f.name), `${esc(f.fr)} · ${esc(f.day)}`)}
    <p class="ra-gist">${esc(f.about)}</p>
    <table class="ra-form ra-form-rules">
      <tr><th>Голоса</th><td data-tooltip="${esc(A.COUNT_MODES[f.mode].hint)}">${esc(A.COUNT_MODES[f.mode].label)}</td>
        <th>Порог</th><td data-tooltip="${esc(A.THRESHOLDS[f.threshold].hint)}">${esc(A.THRESHOLDS[f.threshold].label)}</td></tr>
      <tr><th>Вето</th><td>${esc(A.VETO[f.veto].label)}</td><th>Председатель</th><td>${esc(f.chair)}</td></tr>
    </table>
    <h4>Пути Собрания ${hint("Как дневная Революция меняла Генеральные штаты на Национальное, Учредительное, Законодательное собрание, Конвент, Директорию и Консульство — так перерождается и Собрание Теней. Выделены формы, в которые можно перейти отсюда.")}</h4>
    <div class="ra-forms">${cards}</div>
  </section>`;
}

function tabSession(s, gm) {
  const all = (s.motions ?? []).filter(m => gm || (m.status !== "draft" && !m.hidden));
  const list = all.filter(m => !gm || orderShow === "all" || (orderShow === "hidden" ? m.hidden : !m.hidden));
  if (!list.some(m => m.id === motionSel)) motionSel = (list.find(m => m.status === "open") ?? list[0])?.id ?? null;
  const m = list.find(x => x.id === motionSel);
  const STATUS_ORDER = ["open", "draft", "suspended", "decided", "vetoed", "withdrawn"];
  let order;
  if (orderSort === "status") {
    const grp = (label, st) => { const xs = list.filter(x => st.includes(x.status)); return xs.length ? `<h5>${label} <small>${xs.length}</small></h5>${xs.map(motionRow).join("")}` : ""; };
    order = grp("На голосовании", ["open"]) + (gm ? grp("Черновики", ["draft"]) : "") + grp("Отложено", ["suspended"]) + grp("Решено", ["decided", "vetoed", "withdrawn"]);
  } else if (orderSort === "group") {
    order = Object.entries(A.Q_GROUPS).map(([g, label]) => { const xs = list.filter(x => (x.group ?? "custom") === g); return xs.length ? `<h5>${esc(label)} <small>${xs.length}</small></h5>${xs.map(motionRow).join("")}` : ""; }).join("");
  } else {
    const idx = new Map((s.motions ?? []).map((x, i) => [x.id, i]));
    const xs = orderSort === "alpha" ? [...list].sort((a, b) => a.title.localeCompare(b.title, "ru"))
      : orderSort === "old" ? [...list].sort((a, b) => idx.get(a.id) - idx.get(b.id)) : [...list].sort((a, b) => idx.get(b.id) - idx.get(a.id));
    order = xs.map(motionRow).join("");
  }
  const so = (k, l) => `<option value="${k}" ${k === orderSort ? "selected" : ""}>${l}</option>`;
  const sh = (k, l) => `<option value="${k}" ${k === orderShow ? "selected" : ""}>${l}</option>`;
  const main = qd && gm ? qEditor(s) : picking && gm ? picker(s) : m ? protocol(s, m, gm) : `<div class="ra-sheet"><p class="ra-note">Выберите вопрос в порядке дня.</p></div>`;
  return `<div class="ra-desk ra-session">
    <aside class="ra-sheet ra-order">
      ${head("Ordre du jour", "Порядок дня", esc(formOf(s).name))}
      <div class="ra-orderbar"><select data-as-osort title="Сортировка">${so("status", "по ходу дела")}${so("group", "по разделам")}${so("new", "сначала новые")}${so("old", "сначала старые")}${so("alpha", "по алфавиту")}</select>
        ${gm ? `<select data-as-oshow title="Что показывать">${sh("all", "все вопросы")}${sh("shown", "видимые игрокам")}${sh("hidden", "скрытые")}</select>` : ""}</div>
      ${order}
      ${!list.length ? `<p class="ra-note">Повестка пуста.</p>` : ""}
      ${gm ? `<a class="ra-stamp is-seal ra-wide" data-as="q-pick"><i class="fa-solid fa-plus"></i>вынести вопрос</a>` : ""}
    </aside>
    <div class="ra-session-main">${main}</div>
    ${constitution(s, gm)}
  </div>`;
}

/* ═══ Эдикты: печатные статуты Вийона ═════════════════════════════════════ */

function tabEdicts(s, gm) {
  const e = A.EDICTS.find(x => x.key === edictSel) ?? A.EDICTS[0];
  const st = s.edicts[e.key];
  const list = A.EDICTS.map(x => `<a class="ra-motion ${x.key === e.key ? "is-sel" : ""} es-${s.edicts[x.key]}" data-as="edict" data-key="${x.key}">
      <b>${esc(x.name)}</b><small>${x.year} · <span class="ra-hand">${esc(A.EDICT_STATUS[s.edicts[x.key]]?.label)}</span></small></a>`).join("");
  const open = (s.motions ?? []).find(m => m.q === e.key && ["open", "draft"].includes(m.status));
  return `<div class="ra-desk ra-edicts">
    <aside class="ra-sheet ra-order">${head("Recueil des édits", "Статуты Вийона", "четыре закона Парижского домена")}${list}</aside>
    <article class="ra-sheet ra-edict es-${st}">
      ${STAMP[st] ? `<span class="ra-diag-stamp s-${st}">${esc(STAMP[st])}</span>` : ""}
      <header class="ra-sh-head is-centered"><small class="ra-kicker">Принц Парижа Франсуа Вийон · ${e.year}</small>
        <h3>${esc(e.name)}</h3><p class="ra-sub">${esc(e.fr)}</p></header>
      <p class="ra-gist ra-dropcap">${esc(e.gist)}</p>
      ${(e.articles ?? []).map(([t, x], i) => `<p class="ra-article"><b>Статья ${ROMAN[i]}. ${esc(t)}.</b> ${esc(x)}</p>`).join("")}
      <p class="ra-margin ra-hand">${esc(e.stakes)}</p>
      <h4>Мнения фракций</h4>
      <table class="ra-positions">${Object.entries(e.pos).map(([k, [text, v]]) => {
        const f = A.FACTIONS[k];
        return `<tr><th>${seal(k)}${esc(f.label)}</th><td>${esc(text)}</td>
          <td class="v-${v} ra-hand">${{ for: "за отмену", against: "против", abstain: "колеблются" }[v]}</td></tr>`;
      }).join("")}</table>
      <p class="ra-gist"><i>Если отменят:</i> ${esc(e.repeal)}</p>
      ${gm ? `<div class="ra-chips">${Object.entries(A.EDICT_STATUS).map(([k, v]) => `<a class="${k === st ? "is-on" : ""}" data-as="edict-status" data-v="${k}"><i class="fa-solid ${v.icon}"></i>${esc(v.label)}</a>`).join("")}</div>
        <div class="ra-tools">${open ? `<a class="ra-stamp" data-as="motion" data-id="${open.id}" data-go="1"><i class="fa-solid fa-gavel"></i>к заседанию</a>`
          : A.QUESTIONS.some(q => q.key === e.key) ? `<a class="ra-stamp is-seal" data-as="q-add" data-key="${e.key}"><i class="fa-solid fa-gavel"></i>вынести на заседание</a>` : ""}</div>` : ""}
    </article>
  </div>`;
}

/* ═══ Герои: карты безопасности ═══════════════════════════════════════════ */

const heroes = () => game.actors.filter(a => a.type === "vampire" && a.hasPlayerOwner);
const heroOf = (s, a) => ({ rep: {}, boons: [], patron: "", young: false, breaches: 0, ...(s.heroes?.[a.id] ?? {}) });

function leashLine(s, a, h, org, gm) {
  const fl = floorOf(a.system?.clan);
  const repealed = s.edicts.leash === "repealed";
  const need = fl === 0 || h.young;
  const p = org.find(n => n.id === h.patron);
  const ok = p && p.status === "active" && [1, 2].includes(floorOf(p.clan));
  const [cls, text] = repealed ? ["is-free", "Поводок отменён — свободен"]
    : !need ? ["is-free", "не касается"]
    : ok ? ["is-ok", p.name]
    : p ? ["is-out", `${p.name} — ${A.STATUS[p.status]?.label ?? ""}: вне закона`] : ["is-out", "нет — вне закона"];
  const can = org.filter(n => n.status === "active" && [1, 2].includes(floorOf(n.clan)) && (gm || !n.hidden));
  return `<tr><th>Патрон</th><td class="${cls}"><span class="ra-hand">${esc(text)}</span>
    ${gm ? `<span class="ra-leashctl"><label class="is-check" data-tooltip="Меньше 25 лет после Становления"><input type="checkbox" data-hero="${a.id}" data-hf="young" ${h.young ? "checked" : ""}> моложе 25</label>
      ${need && !repealed ? `<select data-hero="${a.id}" data-hf="patron"><option value="">— патрон —</option>${can.map(n => `<option value="${n.id}" ${n.id === h.patron ? "selected" : ""}>${esc(n.name)}</option>`).join("")}</select>` : ""}</span>` : ""}</td></tr>`;
}

function heroCard(s, a, org, gm, i) {
  const h = heroOf(s, a), clan = a.system?.clan, fl = A.FLOORS.find(x => x.n === floorOf(clan));
  const players = game.users.filter(u => !u.isGM && a.testUserPermission(u, "OWNER")).map(u => u.name).join(", ");
  const img = portrait(a);
  return `<article class="ra-sheet ra-hero" data-actor="${a.id}">
    <header class="ra-sh-head is-centered"><small class="ra-kicker">Département de la Nuit · № ${String(i + 1).padStart(3, "0")}</small><h3>Карта безопасности</h3><p class="ra-sub">Carte de sûreté</p></header>
    <div class="ra-hero-top">${img ? `<span class="ra-face is-portrait"><img src="${esc(img)}" alt=""></span>` : `<span class="ra-face"><i class="fa-solid fa-user"></i></span>`}
      <table class="ra-form">
        <tr><th>Гражданин</th><td class="ra-hand">${esc(a.name)}</td></tr>
        <tr><th>Кровь</th><td class="ra-hand">${esc(clanLabel(clan))}${fl ? ` · <span data-tooltip="${esc(fl.hint)}">${esc(fl.label)}</span>` : ""}</td></tr>
        ${players ? `<tr><th>Предъявитель</th><td class="ra-hand">${esc(players)}</td></tr>` : ""}
        ${leashLine(s, a, h, org, gm)}
      </table></div>
    <h4>Слово в крипте ${hint(gm ? "Щелчок — +1, правый щелчок — −1. От −3 (враг фракции) до +3 (свой)." : "Как к герою относится каждая фракция: от −3 (враг) до +3 (свой).")}</h4>
    <div class="ra-reps">${Object.entries(A.FACTIONS).map(([k, f]) => { const v = h.rep[k] ?? 0; return `<span class="ra-rep ${v < 0 ? "neg" : v > 0 ? "pos" : ""}" ${gm ? `data-as="rep" data-actor="${a.id}" data-k="${k}"` : ""} data-tooltip="${esc(f.label)}: ${v > 0 ? "+" + v : v}">
      ${seal(k, "is-md")}<b class="ra-hand">${v > 0 ? "+" + v : v}</b><small>${esc(f.short)}</small></span>`; }).join("")}</div>
    <h4>Нарушения статутов ${hint("Сколько нарушений эдиктов за героем знает двор. С 3 — шериф де Ко ищет повод; 5 — Кровавая охота при первой поддержке крипты.")}</h4>
    <div class="ra-strikes">${Array.from({ length: 5 }, (_, i) => `<i class="${i < h.breaches ? "on" : ""}" ${gm ? `data-as="breach" data-actor="${a.id}" data-v="${i + 1 === h.breaches ? i : i + 1}"` : ""}></i>`).join("")}</div>
    <h4>Книга услуг ${hint("Престация — долги Сородичей: кто кому должен и сколько.")}</h4>
    <ul class="ra-boons">${h.boons.map((b, i) => `<li class="d-${b.dir}"><em>${b.dir === "owes" ? "должен" : "ему должен"}</em><b class="ra-hand">${esc(b.who)}</b>
        <span data-tooltip="${esc(A.BOONS[b.size]?.hint ?? "")}">${esc(A.BOONS[b.size]?.label ?? b.size)}</span>${b.note ? `<small>${esc(b.note)}</small>` : ""}
        ${gm ? `<a class="ra-x" data-as="unboon" data-actor="${a.id}" data-i="${i}" data-tooltip="Долг уплачен"><i class="fa-solid fa-xmark"></i></a>` : ""}</li>`).join("") || `<li class="is-none">чист</li>`}</ul>
    ${gm ? `<div class="ra-boonform" data-actor="${a.id}">
      <select data-b="dir"><option value="owes">должен</option><option value="owed">ему должен</option></select>
      <input type="text" data-b="who" data-combo="ra-names" placeholder="кто">
      <select data-b="size">${Object.entries(A.BOONS).map(([k, v]) => `<option value="${k}" ${k === "minor" ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select>
      <input type="text" data-b="note" placeholder="за что">
      <a class="ra-stamp" data-as="boon" data-actor="${a.id}" data-tooltip="Записать"><i class="fa-solid fa-feather-pointed"></i></a></div>` : ""}
  </article>`;
}

function tabHeroes(s, gm) {
  const org = orgOf(s);
  const list = heroes().filter(a => gm || a.isOwner || a.testUserPermission(game.user, "LIMITED"));
  return `<div class="ra-desk ra-heroes">${list.map((a, i) => heroCard(s, a, org, gm, i)).join("") || `<div class="ra-sheet"><p class="ra-note">Нет вампиров под управлением игроков.</p></div>`}</div>
    <datalist id="ra-names">${org.map(n => `<option value="${esc(n.name)}">`).join("")}</datalist>`;
}

/* ═══ Летопись: рукописный реестр ═════════════════════════════════════════ */

const fmtDate = iso => {
  const [y, m, d] = iso.split("-").map(Number);
  return m === 1 && d === 1 ? String(y) : new Date(y, m - 1, d).toLocaleDateString("ru", { day: "numeric", month: "long" });
};

function tabChronicle(s, gm) {
  const items = A.CHRONICLE.filter(c => gm || isOpen(s, `chr:${c.id}`));
  let year = null;
  const rows = items.map(c => {
    const y = c.date.slice(0, 4), open = isOpen(s, `chr:${c.id}`);
    const yh = y !== year ? `<h4 class="ra-year">${y}</h4>` : "";
    year = y;
    return `${yh}<div class="ra-entry ${c.secret ? "is-secret" : ""} ${gm && !open ? "is-veiled" : ""}">
      <time class="ra-hand">${/-01-01$/.test(c.date) ? "" : esc(fmtDate(c.date))}</time>
      <div><b>${esc(c.title)}</b>${c.secret ? ` <em class="ra-hand ra-red">тайна</em>` : ""}<p>${esc(c.text)}</p>
        ${c.day ? `<p class="ra-day">Днём: ${esc(c.day)}</p>` : ""}</div>
      ${gm ? eye(`chr:${c.id}`, open) : ""}
    </div>`;
  }).join("");
  return `<div class="ra-desk ra-chronicle"><section class="ra-sheet ra-register">
    ${head("Registre secret", "Летопись ночей Революции", gm ? "скрыта от игроков: глаз открывает отдельную запись" : "то, что вам известно",
      gm ? `<a class="ra-mini" data-as="chr-all" data-tooltip="Скрыть все записи"><i class="fa-solid fa-eye-slash"></i></a>` : "")}
    <div class="ra-timeline">${rows || `<p class="ra-note">Пока ничего.</p>`}</div>
    ${gm ? `<details class="ra-fixes"><summary>Поправки к лору (${A.LORE_FIXES.length})</summary><ol>${A.LORE_FIXES.map(f => `<li>${esc(f)}</li>`).join("")}</ol></details>` : ""}
  </section></div>`;
}

/* ═══ Действия ════════════════════════════════════════════════════════════ */

async function patchNode(id, fn) {
  const s = asm(), org = orgOf(s);
  const n = org.find(x => x.id === id);
  if (!n) return;
  Object.assign(n, fn(n));
  await save({ org });
}
async function patchHero(id, fn) {
  const s = asm(), all = foundry.utils.deepClone(s.heroes ?? {});
  const a = game.actors.get(id);
  if (!a) return;
  all[id] = { ...heroOf(s, a), ...fn(heroOf(s, a)) };
  await save({ heroes: all });
}
async function patchMotion(id, fn) {
  const s = asm(), motions = foundry.utils.deepClone(s.motions);
  const m = motions.find(x => x.id === id);
  if (!m) return;
  Object.assign(m, fn(m));
  await save({ motions });
}
const pinNews = (s, n) => [{ at: dateNow(), kind: "news", ...n }, ...(s.feed ?? [])].slice(0, 40);

/** Сдвиги шкал, статусы эдиктов, смена формы власти. */
function applyEffects(s, fx, patch, silent = false) {
  if (!fx) return [];
  const moved = [];
  for (const [k, g] of Object.entries(A.GAUGES)) {
    if (!fx[k]) continue;
    patch[k] = Math.clamp((patch[k] ?? s[k] ?? 0) + fx[k], 0, g.max);
    if (!g.secret) moved.push(`${g.label}: ${g.steps[patch[k]]}`);
  }
  if (fx.edicts) { patch.edicts = Object.fromEntries(A.EDICTS.map(e => [e.key, fx.edicts])); moved.push(`Все статуты: ${A.EDICT_STATUS[fx.edicts]?.label}`); }
  if (fx.edict) { patch.edicts = { ...(patch.edicts ?? s.edicts), [fx.edict[0]]: fx.edict[1] }; moved.push(`${A.EDICTS.find(e => e.key === fx.edict[0])?.name}: ${A.EDICT_STATUS[fx.edict[1]]?.label}`); }
  if (fx.district) {
    patch.districts = { ...(patch.districts ?? s.districts), [fx.district[0]]: fx.district[1] };
    moved.push(`${A.DISTRICTS.find(d => d.key === fx.district[0])?.name}: ${facOf(fx.district[1]).label}`);
  }
  if (fx.node) {
    const org = patch.org ?? orgOf(s), n = org.find(x => x.id === fx.node[0]);
    if (n) { n.status = fx.node[1]; patch.org = org; moved.push(`${n.name}: ${A.STATUS[fx.node[1]]?.label}`); }
  }
  if (fx.news && !silent) patch.feed = pinNews({ feed: patch.feed ?? s.feed }, { kind: "decree", title: fx.news.split(/[.!?]/)[0].slice(0, 70), text: fx.news });
  if (fx.form) moved.push(...setForm(s, fx.form, patch));
  return moved;
}
function setForm(s, to, patch) {
  const f = A.FORMS[to];
  if (!f) return [];
  patch.form = to;
  patch.formHistory = [...(s.formHistory ?? []), { form: to, at: dateNow() }];
  const out = [`Собрание: ${f.name}`];
  if (f.enter?.edicts) patch.edicts = Object.fromEntries(A.EDICTS.map(e => [e.key, f.enter.edicts]));
  out.push(...applyEffects(s, { ...f.enter, edicts: undefined }, patch).filter(Boolean));
  return out;
}

async function rollEvent() {
  const s = asm();
  const r = await new Roll("1d10").evaluate();
  const v = Math.clamp(r.total + (s.tension ?? 0), 1, 20);
  const ev = [...A.EVENTS].reverse().find(e => e.min <= v) ?? A.EVENTS[0];
  const patch = {};
  const moved = applyEffects(s, ev.d, patch);
  patch.feed = pinNews(s, { title: ev.title, text: ev.text });
  await save(patch);
  await ChatMessage.create({
    speaker: { alias: "Теневое Собрание" },
    content: `<div class="vtm20 r-asm-chat"><h3><i class="fa-solid fa-bell"></i> ${esc(ev.title)}</h3><p>${esc(ev.text)}</p>
      ${moved.length ? `<p class="r-asm-moved">${moved.map(esc).join(" · ")}</p>` : ""}
      <small>1к10 (${r.total}) + напряжение ${s.tension ?? 0} = ${v}</small></div>`
  });
}

async function proclaim(id) {
  const s = asm(), m = s.motions.find(x => x.id === id);
  if (!m) return;
  const c = count(m, orgOf(s)), v = verdict(m, c.winner);
  const patch = {};
  const moved = c.winner ? applyEffects(s, m.effects?.[c.winner], patch, m.hidden) : [];
  const tally = m.options.map(o => `${o.label} — ${c.w[o.key]}`).join(", ") + `, воздержались — ${c.w.abstain}`;
  const text = `${m.title}: ${v.stamp.toLowerCase()}${v.text ? ` — «${v.text}»` : ""}. ${m.secret ? "Тайное голосование. " : ""}${tally}.${moved.length ? ` ${moved.join(". ")}.` : ""}`;
  patch.motions = s.motions.map(x => x.id === id ? { ...x, status: "decided", winner: c.winner, tally: c.w, decidedAt: dateNow() } : x);
  // скрытый вопрос решают за закрытыми дверями: ни стены, ни открытого чата
  if (!m.hidden) patch.feed = pinNews({ feed: patch.feed ?? s.feed }, { kind: "decree", title: `${m.title} — ${v.stamp.toLowerCase()}`, text });
  await save(patch);
  await ChatMessage.create({ speaker: { alias: "Теневое Собрание" }, ...(m.hidden ? { whisper: game.users.filter(u => u.isGM).map(u => u.id) } : {}),
    content: `<div class="vtm20 r-asm-chat"><h3><i class="fa-solid fa-gavel"></i> ${esc(m.title)}</h3><p><b>${esc(v.stamp)}</b>${v.text ? ` — ${esc(v.text)}` : ""}</p><p>${esc(tally)}</p>
      ${moved.length ? `<p class="r-asm-moved">${moved.map(esc).join(" · ")}</p>` : ""}</div>` });
}

async function castVote(id, nodeId, v) {
  const s = asm(), m = s.motions.find(x => x.id === id), n = orgOf(s).find(x => x.id === nodeId);
  if (!m || !n || m.status !== "open") return;
  const a = n.pc ? nodeActor(n) : null;
  if (a && (a.isOwner || game.user.isGM)) {
    const cur = a.getFlag(SYSTEM_ID, FLAG) ?? {};
    // повторный щелчок по своему голосу снимает его — снова по линии фракции
    if (cur[id] === v) return a.unsetFlag ? a.update({ [`flags.${SYSTEM_ID}.${FLAG}.-=${id}`]: null }) : a.setFlag(SYSTEM_ID, FLAG, { ...cur, [id]: undefined });
    return a.setFlag(SYSTEM_ID, FLAG, { ...cur, [id]: v });
  }
  if (!game.user.isGM) return;
  return patchMotion(id, x => {
    const votes = { ...x.votes };
    if (votes[nodeId] === v || (!votes[nodeId] && (x.defaults?.[n.fac] ?? "abstain") === v)) delete votes[nodeId]; else votes[nodeId] = v;
    return { votes, absent: { ...x.absent, [nodeId]: false } };
  });
}

async function onClick(ev) {
  const t = ev.target.closest("[data-as]");
  const gm = game.user.isGM;
  if (!t) {
    if (mode === "power" && sel && !editing && !ev.target.closest(".ra-dossier, .ra-node")) { sel = null; renderBoard(); }
    return;
  }
  ev.preventDefault();
  // кнопка нажата — поле больше не «под пальцами», доску можно перерисовать
  if (document.activeElement?.matches?.("input[type=text], textarea") && host.root.contains(document.activeElement)) document.activeElement.blur();
  const s = asm();
  switch (t.dataset.as) {
    case "reveal": if (!gm) return; return save({ reveal: { ...s.reveal, [t.dataset.id]: !isOpen(s, t.dataset.id) } });
    case "chr-all": if (!gm) return; return save({ reveal: Object.fromEntries(Object.entries(s.reveal ?? {}).filter(([k]) => !k.startsWith("chr:"))) });
    case "gauge": if (!gm) return; return save({ [t.dataset.key]: Number(t.dataset.v) });
    case "district": distSel = distSel === t.dataset.key ? null : t.dataset.key; return renderBoard();
    case "control": if (!gm) return; return save({ districts: { ...s.districts, [t.dataset.key]: t.dataset.v } });
    case "tomap": {
      const d = A.DISTRICTS.find(x => x.key === t.dataset.key);
      setMode("map"); host.influence?.(true);
      if (d) host.fly?.(d.lat, d.lng, 15);
      return;
    }
    case "influence": setMode("map"); return host.influence?.(true);
    case "tosession": return setMode("session");
    // вести
    case "unfeed": { if (!gm) return; const feed = [...(s.feed ?? [])]; feed.splice(Number(t.dataset.i), 1); return save({ feed }); }
    case "news-new": draft = { title: "", text: "", at: dateNow(), kind: "news", i: null }; renderBoard(); return host.root.querySelector('[data-news="title"]')?.focus();
    case "news-edit": { const f = s.feed?.[Number(t.dataset.i)]; if (f) draft = { kind: "news", ...f, i: Number(t.dataset.i) }; return renderBoard(); }
    case "news-kind": if (draft) draft.kind = t.dataset.v; return renderBoard();
    case "news-cancel": draft = null; return renderBoard();
    case "news-post": {
      if (!gm || !draft) return;
      if (!draft.title.trim() && !draft.text.trim()) return ui.notifications.warn("Листок пуст.");
      const item = { title: draft.title.trim() || draft.text.trim().split(/[.!?]/)[0].slice(0, 60), text: draft.text.trim(), at: draft.at.trim() || dateNow(), kind: draft.kind };
      const feed = [...(s.feed ?? [])];
      if (draft.i != null) feed[draft.i] = item; else feed.unshift(item);
      draft = null;
      return save({ feed: feed.slice(0, 40) });
    }
    case "event": return gm && rollEvent();
    // собрание
    case "node": if (sel !== t.dataset.id) editing = false; sel = sel === t.dataset.id && !editing ? null : t.dataset.id; return renderBoard();
    case "infl": if (!gm) return; ev.stopPropagation(); return patchNode(t.dataset.id, n => ({ influence: Number(t.dataset.v) === n.influence ? n.influence - 1 : Number(t.dataset.v) }));
    case "status": return gm && patchNode(sel, () => ({ status: t.dataset.v }));
    case "sheet": return fromUuidSync(t.dataset.uuid)?.sheet?.render(true);
    case "img-pick": {
      const box = t.closest(".ra-pick")?.querySelector("input");
      const FP = foundry.applications.apps.FilePicker.implementation;
      return new FP({ type: "image", current: box?.value ?? "", callback: path => { if (box) box.value = path; } }).render(true);
    }
    case "edit": editing = true; return renderBoard();
    case "cancel": editing = false; return renderBoard();
    case "save": return gm && saveNode();
    case "add": case "add-sub": return gm && addNode(t.dataset.as === "add" ? t.dataset.fac : null);
    case "del": return gm && deleteNode(sel);
    case "tie": return gm && addTie();
    case "untie": if (!gm) return; return save({ ties: tiesOf(s).filter(x => !(x.a === t.dataset.a && x.b === t.dataset.b && x.kind === t.dataset.k)) });
    case "org-reset": {
      if (!gm) return;
      const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Сброс Собрания" }, content: "<p>Вернуть список и нити к исходным? Правки досье пропадут.</p>" });
      if (ok) { sel = null; editing = false; return save({ org: null, ties: null }); }
      return;
    }
    // заседание
    case "motion": motionSel = t.dataset.id; picking = false; qd = null; if (t.dataset.go) return setMode("session"); return renderBoard();
    case "q-pick": picking = true; qd = null; return renderBoard();
    case "q-close": picking = false; return renderBoard();
    case "q-new": if (!gm) return; qd = { mode: "new", q: qFrom({ options: [{ key: "yes", label: "За" }, { key: "no", label: "Против" }], hidden: true }, s) }; return renderBoard();
    case "q-edit-tpl": {
      if (!gm) return;
      const q = library(s).find(x => x.key === t.dataset.key);
      if (q) qd = { mode: q.own ? "tpl" : "new", ref: q.own ? q.key : null, q: qFrom(q, s) };
      return renderBoard();
    }
    case "q-del-tpl": {
      if (!gm) return;
      const q = (s.templates ?? []).find(x => x.key === t.dataset.key);
      if (!q) return;
      const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Удалить шаблон" }, content: `<p>Удалить свой шаблон «${esc(q.title)}»?</p>` });
      if (ok) return save({ templates: s.templates.filter(x => x.key !== q.key) });
      return;
    }
    case "q-edit-motion": { if (!gm) return; const x = s.motions.find(y => y.id === t.dataset.id); if (x) qd = { mode: "motion", ref: x.id, q: qFrom(x, s) }; return renderBoard(); }
    case "q-cancel": qd = null; return renderBoard();
    case "q-opt-add": if (qd) qd.q.options.push({ key: `o${uid().slice(0, 5)}`, label: "", fx: {} }); return renderBoard();
    case "q-opt-yesno": if (qd) { qd.q.options = [{ key: "yes", label: "За", fx: {} }, { key: "no", label: "Против", fx: {} }]; } return renderBoard();
    case "q-opt-del": { if (qd && qd.q.options.length > 1) qd.q.options.splice(Number(t.dataset.i), 1); return renderBoard(); }
    case "q-opt-up": case "q-opt-down": {
      if (!qd) return;
      const i = Number(t.dataset.i), j = t.dataset.as === "q-opt-up" ? i - 1 : i + 1, o = qd.q.options;
      if (j >= 0 && j < o.length) [o[i], o[j]] = [o[j], o[i]];
      return renderBoard();
    }
    case "q-save-tpl": {
      if (!gm || !qd) return;
      const key = qd.mode === "tpl" ? qd.ref : `tpl-${uid()}`;
      const tpl = { key, ...qFields(qd.q) };
      const templates = [...(s.templates ?? []).filter(x => x.key !== key), tpl];
      qd = null; picking = true;
      ui.notifications.info(`Шаблон «${tpl.title}» сохранён в библиотеке вопросов.`);
      return save({ templates });
    }
    case "q-save-motion": {
      if (!gm || !qd) return;
      const fields = qFields(qd.q);
      if (qd.mode === "motion") { const id = qd.ref; qd = null; return patchMotion(id, () => fields); }
      const m = newMotion({ key: `custom-${uid().slice(0, 6)}`, ...fields }, s.form);
      qd = null; picking = false; motionSel = m.id;
      return save({ motions: [...s.motions, m] });
    }
    case "m-eye": {
      if (!gm) return;
      ev.stopPropagation();
      return patchMotion(t.dataset.id, x => ({ hidden: !x.hidden }));
    }
    case "q-add": {
      if (!gm) return;
      const q = library(s).find(x => x.key === t.dataset.key);
      if (!q) return;
      const m = newMotion(q, s.form);
      picking = false; qd = null; motionSel = m.id;
      if (mode !== "session") { tabChanged = true; mode = "session"; host.root.setAttribute("data-mode", mode); drawModes(); }
      return save({ motions: [...s.motions, m] });
    }
    case "line": return gm && patchMotion(motionSel, m => ({ defaults: { ...m.defaults, [t.dataset.fac]: t.dataset.v } }));
    case "vote": return castVote(motionSel, t.dataset.id, t.dataset.v);
    case "absent": return gm && patchMotion(motionSel, m => ({ absent: { ...m.absent, [t.dataset.id]: !m.absent?.[t.dataset.id] } }));
    case "m-open": return gm && patchMotion(motionSel, () => ({ status: "open", at: dateNow() }));
    case "m-proclaim": return gm && proclaim(motionSel);
    case "m-veto": {
      if (!gm) return;
      const m = s.motions.find(x => x.id === motionSel), veto = m?.veto ?? formOf(s).veto;
      await patchMotion(motionSel, () => ({ status: veto === "absolute" ? "vetoed" : "suspended" }));
      if (m?.hidden) return;
      return save({ feed: pinNews(asm(), { kind: "decree", title: `Вето: ${m?.title ?? ""}`, text: veto === "absolute" ? "Решение отменено вето окончательно." : "Решение отложено отлагательным вето; вопрос можно вынести снова не раньше следующей ночи." }) });
    }
    case "m-reset": if (!gm) return; for (const n of orgOf(s)) if (n.pc) { const a = nodeActor(n); const cur = a?.getFlag(SYSTEM_ID, FLAG); if (cur?.[motionSel]) await a.update({ [`flags.${SYSTEM_ID}.${FLAG}.-=${motionSel}`]: null }); }
      return patchMotion(motionSel, () => ({ votes: {}, absent: {} }));
    case "m-reopen": return gm && patchMotion(motionSel, () => ({ status: "open", winner: null, at: dateNow() }));
    case "m-withdraw": return gm && patchMotion(motionSel, () => ({ status: "withdrawn" }));
    case "m-del": {
      if (!gm) return;
      const id = t.dataset.id ?? motionSel, m = s.motions.find(x => x.id === id);
      if (!m) return;
      ev.stopPropagation();
      const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Убрать голосование" },
        content: `<p>Убрать «${esc(m.title)}» из порядка дня и протоколов? Голоса по нему пропадут; уже применённые последствия останутся.</p>` });
      if (!ok) return;
      if (motionSel === id) motionSel = null;
      return save({ motions: s.motions.filter(x => x.id !== id) });
    }
    case "reform": {
      if (!gm) return;
      const to = A.FORMS[t.dataset.to], from = formOf(s);
      const how = from.next.find(([k]) => k === t.dataset.to)?.[1] ?? "";
      const q = { key: `reform-${t.dataset.to}`, title: `Преобразовать Собрание: «${to.name}»`, text: `${how}. ${to.about}`,
        options: [{ key: "yes", label: "За" }, { key: "no", label: "Против" }], defaults: { ...to.support }, threshold: "twothirds", effects: { yes: { form: t.dataset.to } } };
      const m = newMotion(q, s.form);
      motionSel = m.id; picking = false;
      return save({ motions: [...s.motions, m] });
    }
    case "coup": {
      if (!gm) return;
      const to = A.FORMS[t.dataset.to];
      const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Переворот" }, content: `<p>Сменить власть на «${esc(to.name)}» без голосования?</p>` });
      if (!ok) return;
      const patch = {};
      const moved = setForm(s, t.dataset.to, patch);
      patch.feed = pinNews(s, { kind: "decree", title: `Переворот: ${to.name}`, text: `${to.about} ${moved.slice(1).join(". ")}` });
      return save(patch);
    }
    // эдикты
    case "edict": edictSel = t.dataset.key; return renderBoard();
    case "edict-status": if (!gm) return; return save({ edicts: { ...s.edicts, [edictSel]: t.dataset.v } });
    // герои
    case "rep": return gm && patchHero(t.dataset.actor, h => ({ rep: { ...h.rep, [t.dataset.k]: Math.min(3, (h.rep[t.dataset.k] ?? 0) + 1) } }));
    case "breach": return gm && patchHero(t.dataset.actor, () => ({ breaches: Number(t.dataset.v) }));
    case "boon": {
      if (!gm) return;
      const f = t.closest(".ra-boonform"), val = k => f.querySelector(`[data-b="${k}"]`)?.value?.trim() ?? "";
      if (!val("who")) return ui.notifications.warn("Кто должник или заимодавец?");
      return patchHero(t.dataset.actor, h => ({ boons: [...h.boons, { id: uid(), dir: val("dir"), who: val("who"), size: val("size"), note: val("note") }] }));
    }
    case "unboon": return gm && patchHero(t.dataset.actor, h => ({ boons: h.boons.filter((_, i) => i !== Number(t.dataset.i)) }));
  }
}

function onContext(ev) {
  const t = ev.target.closest('[data-as="rep"]');
  if (!t || !game.user.isGM) return;
  ev.preventDefault();
  patchHero(t.dataset.actor, h => ({ rep: { ...h.rep, [t.dataset.k]: Math.max(-3, (h.rep[t.dataset.k] ?? 0) - 1) } }));
}

async function onChange(ev) {
  const el = ev.target;
  if (el.matches("[data-as-osort]")) { orderSort = el.value; return renderBoard(); }
  if (!game.user.isGM) return;
  if (el.dataset.q) return setQ(el);
  if (el.matches("[data-as-qsort]")) { qSort = el.value; return renderBoard(); }
  if (el.matches("[data-as-oshow]")) { orderShow = el.value; return renderBoard(); }
  if (el.dataset.hero) {
    const v = el.type === "checkbox" ? el.checked : el.value;
    return patchHero(el.dataset.hero, () => ({ [el.dataset.hf]: v }));
  }
  const f = el.dataset.m;
  if (f && motionSel) {
    if (f === "options") {
      return patchMotion(motionSel, m => {
        const labels = el.value.split("\n").map(x => x.trim()).filter(Boolean);
        const options = labels.map((label, i) => m.options.find(o => o.label === label) ?? { key: `o${i + 1}${uid().slice(0, 3)}`, label });
        return { options: options.length ? options : m.options };
      });
    }
    const v = el.type === "checkbox" ? el.checked : el.value;
    if (el.matches("input[type=text], textarea")) el.blur();
    return patchMotion(motionSel, () => ({ [f]: v }));
  }
}

async function onDrop(ev) {
  if (!game.user.isGM || !sel) return;
  let data;
  try { data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev); } catch { return; }
  if (data?.type !== "Actor") return;
  ev.preventDefault();
  if (editing) {
    const box = host.root.querySelector('.ra-paper.is-edit [data-f="actor"]');
    if (box) box.value = data.uuid;
    return;
  }
  return patchNode(sel, () => ({ actor: data.uuid }));
}

async function saveNode() {
  const box = host.root.querySelector(".ra-paper.is-edit");
  if (!box) return;
  const val = f => box.querySelector(`[data-f="${f}"]`);
  editing = false;
  await patchNode(sel, n => ({
    name: val("name").value.trim() || n.name, office: val("office").value.trim(), fac: val("fac").value, clan: val("clan").value,
    parent: val("parent").value || null, stance: val("stance").value.trim(), hook: val("hook").value.trim(),
    hidden: val("hidden").checked, pc: val("pc").checked, seat: !val("noseat").checked, actor: val("actor").value,
    img: val("img").value.trim()
  }));
}

async function addNode(fac) {
  const s = asm(), org = orgOf(s);
  const boss = fac ? null : org.find(n => n.id === sel);
  const n = { id: uid(), fac: fac ?? boss?.fac ?? "neutral", parent: boss?.id ?? null, name: "Новый Сородич", clan: "", office: "", influence: 1,
    status: "active", stance: "", hook: "", hidden: true, pc: false, actor: "" };
  org.push(n);
  sel = n.id; editing = true;
  await save({ org });
}

async function deleteNode(id) {
  const s = asm(), org = orgOf(s), n = org.find(x => x.id === id);
  if (!n) return;
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Вычеркнуть" }, content: `<p>Вычеркнуть ${esc(n.name)} из Собрания?</p>` });
  if (!ok) return;
  for (const x of org) if (x.parent === id) x.parent = n.parent ?? null;
  sel = null; editing = false;
  await save({ org: org.filter(x => x.id !== id), ties: tiesOf(s).filter(t => t.a !== id && t.b !== id) });
}

async function addTie() {
  const box = host.root.querySelector(".ra-tieform");
  const b = box?.querySelector('[data-t="b"]').value, kind = box?.querySelector('[data-t="kind"]').value, label = box?.querySelector('[data-t="label"]').value.trim();
  if (!b || !sel) return;
  const ties = tiesOf(asm()).filter(t => !(t.kind === kind && ((t.a === sel && t.b === b) || (t.a === b && t.b === sel))));
  ties.push({ a: sel, b, kind, label });
  await save({ ties });
}
