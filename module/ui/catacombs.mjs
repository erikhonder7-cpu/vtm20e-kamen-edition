// module/ui/catacombs.mjs
// Катакомбы на карте города: подземный Париж по Миру Тьмы — именные залы (module/data/catacombs-paris.mjs),
// малые выработки по всему городу и ходы между ними одной сетью на сетке клеток с подписанными квадратами.
// Планы выработок, ходы, обвалы и затопления строятся из id детерминированно, поэтому у всех одинаковы.
//   · рассказчик видит всё; игроки — только открытые им залы и ходы между ними;
//   · рассказчик добавляет залы щелчком по карте, правит их (имя, вид, ярус, размер, хозяин, запись журнала, сцена),
//     переносит, ставит входы, удаляет и возвращает удалённые;
//   · два яруса — верхние каменоломни и нижние склепы; второй ярус виден призрачно;
//   · меловые пометки: каждый ставит свои (флаг пользователя), мастер видит все, игроки — свои и открытые всем;
//   · список залов сбоку: поиск, фильтры, перелёт к залу, сетка квадратов вкл./выкл.;
//   · кисть рассказчика: копать, засыпать, вода, завал, тайные ходы (открываются игрокам группой), решётки, ловушки;
//   · план со штриховкой породы вдоль стен, дверями, лестницами и убранством залов.
// Карта (module/ui/citymap.mjs) отдаёт сюда свой объект через attachCatacombs и зовёт слои при каждой смене стиля.

import { SYSTEM_ID } from "../config.mjs";
import { CATACOMB_KINDS as KINDS, CATACOMB_SECTIONS as BASE } from "../data/catacombs-paris.mjs";

const SETTING = "catacombs", MARKS = "cataMarks";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const EMPTY = { type: "FeatureCollection", features: [] };
const LEVELS = { upper: "Верхний ярус", lower: "Нижний ярус" };
const LOWER_KINDS = ["ossuary", "crypt", "prison", "elysium"];
const CHALK = { arrow: ["Стрелка", "fa-arrow-up"], cross: ["Крест", "fa-xmark"], circle: ["Круг", "fa-circle"], ask: ["Вопрос", "fa-question"] };

let host = null;      // { map, gl, view, setView, city, drawTools, zoomed }
let placing = null;   // { mode: "hall" | "move" | "door" | "mark", id } — следующий щелчок по карте
let popup = null, panel = null, anim = null;
const list = { q: "", filter: "all" };

/* ═══ Состояние ═══════════════════════════════════════════════════════════ */

export function registerCatacombs() {
  game.settings.register(SYSTEM_ID, SETTING, { scope: "world", config: false, type: Object, default: {},
    onChange: () => { closePopup(); drawCatacombs(); } });
  // меловые пометки лежат во флагах пользователей — перерисовать, когда кто-то их поменял
  Hooks.on("updateUser", (u, ch) => { if (foundry.utils.hasProperty(ch, `flags.${SYSTEM_ID}`)) drawMarks(); });
}

export function attachCatacombs(api) { host = api; bindBrush(api.map); }

/** Карта, к которой подключены катакомбы (для автотестов и отладки). */
export const catacombsMap = () => host?.map ?? null;

/**
 * { custom: [залы рассказчика], removed: [id], revealed: { id: открыт игрокам }, edits: { id: правки встроенного зала },
 *   cells: { "i,j": 0 засыпано | 1 пол | 2 вода | 3 завал | 4 тайный | 5 тайный открыт }, gates: { "i,j": 1 решётка | 2 заперто },
 *   traps: [{ id, i, j, name, note, known }] }
 */
const store = () => ({ custom: [], removed: [], revealed: {}, edits: {}, cells: {}, gates: {}, traps: [], ...(game.settings.get(SYSTEM_ID, SETTING) ?? {}) });
const save = patch => game.settings.set(SYSTEM_ID, SETTING, { ...store(), ...patch });

/** Катакомбы есть только у Парижа. */
export const catacombsHere = () => /paris/i.test(host?.city()?.preset ?? "");
const isOn = () => catacombsHere() && !!host.view().catacombs;
const curLevel = () => host?.view().cataLevel ?? "all";

function sections() {
  const s = store(), removed = new Set(s.removed);
  return [...BASE.filter(x => !removed.has(x.id)).map(x => ({ ...x, ...(s.edits[x.id] ?? {}), edited: !!s.edits[x.id] })), ...s.custom]
    .map(x => ({ ...x, known: s.revealed[x.id] ?? !!x.known, level: LEVELS[x.level] ? x.level : (LOWER_KINDS.includes(x.kind) ? "lower" : "upper") }));
}

/** Изменить зал: свой — на месте, встроенный — правкой поверх исходного. */
async function patchHall(id, patch) {
  const st = store(), own = st.custom.find(x => x.id === id);
  if (own) return save({ custom: st.custom.map(x => x.id === id ? { ...x, ...patch } : x) });
  const base = BASE.find(x => x.id === id);
  if (base) return save({ edits: { ...st.edits, [id]: { ...(st.edits[id] ?? {}), ...patch } } });
}

/* ═══ Сетка: весь подземный Париж на клетках ═════════════════════════════ */
// Всё подземелье лежит на одной сетке клеток по 16 м, выровненной по сторонам света; крупные квадраты
// по 20×20 клеток (320 м) подписаны «А1», «К7»… Залы и ходы вырезаются в клетках, поэтому всё ровно по сетке,
// а вид выработки зависит от её вида: каменоломни — столбы, норы — лабиринт, логово — пещеры и т. д.
// Всё строится из id детерминированно — у всех клиентов одинаково; в мире хранятся только правки рассказчика
// (клетки кистью, решётки, ловушки, тайные ходы).

/** Генератор чисел 0…1 из строки. */
function rng(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const M = 111320;
const kx = lat => M * Math.cos(lat * Math.PI / 180);
const toLL = (o, x, y) => [o.lng + x / kx(o.lat), o.lat + y / M];
const meters = (a, b) => Math.hypot((b.lng - a.lng) * kx(a.lat), (b.lat - a.lat) * M);

// 27 × 22 квадрата (8,6 × 7 км) — от Шайо до Мон-Луи и от Монмартра до Заставы Ада, с запасом на размер залов
const CELL = 16, COLS = 540, ROWS = 440, SQUARE = 20;
const ORIGIN = { lat: 48.8610, lng: 2.3400 }, KX = kx(ORIGIN.lat);
const CITY = { lat: 48.8592, lng: 2.3445 };   // центр города — вокруг него разбросаны малые выработки
const SQ_LETTERS = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ";
/** Точка сетки (i — к востоку, j — к югу, дробные — внутри клетки) → [lng, lat]. */
const cornerLL = (i, j) => [ORIGIN.lng + (i - COLS / 2) * CELL / KX, ORIGIN.lat + (ROWS / 2 - j) * CELL / M];
const cellOf = (lat, lng) => [Math.floor((lng - ORIGIN.lng) * KX / CELL + COLS / 2), Math.floor((ORIGIN.lat - lat) * M / CELL + ROWS / 2)];
/** Квадрат «К7» по месту. */
export const squareOf = (lat, lng) => { const [i, j] = cellOf(lat, lng); return `${SQ_LETTERS[Math.floor(i / SQUARE)] ?? "?"}${Math.floor(j / SQUARE) + 1}`; };

// типы клеток плана; в правках кистью ещё 0 — засыпано, 4 — тайный ход (скрыт), 5 — тайный ход (открыт игрокам)
const FLOOR = 1, WATER = 2, RUBBLE = 3, SECRET = 4, SECRET_SHOWN = 5;

/** Подземный план: тип клетки (0 — порода), хозяин (индекс зала или хода), убранство, двери. */
class Plan {
  constructor() { this.t = new Uint8Array(COLS * ROWS); this.o = new Int16Array(COLS * ROWS).fill(-1); this.items = []; this.doors = []; }
  k(i, j) { return i < 0 || j < 0 || i >= COLS || j >= ROWS ? -1 : j * COLS + i; }
  put(i, j, type, owner) { const k = this.k(i, j); if (k >= 0) { this.t[k] = type; this.o[k] = owner; } }
  rock(i, j) { const k = this.k(i, j); if (k >= 0) this.t[k] = 0; }
  floor(i, j) { const k = this.k(i, j); return k >= 0 && this.t[k] > 0; }
  owner(i, j) { const k = this.k(i, j); return k >= 0 ? this.o[k] : -1; }
}

/** Неровный контур зала: радиус в клетках по направлению. */
function shapeOf(s) {
  const r = rng(`blob:${s.id}`), harm = [2, 3, 5].map(k => ({ k, a: .04 + r() * .1, p: r() * Math.PI * 2 }));
  const R = Math.max(4, Math.round(s.r / CELL));
  const radius = t => R * (1 + harm.reduce((sum, h) => sum + h.a * Math.sin(h.k * t + h.p), 0));
  return { R, radius, inside: (x, y, f = 1) => Math.hypot(x, y) <= radius(Math.atan2(-y, x)) * f };
}

/* ── Планы выработок по виду ───────────────────────────────────────────── */
// Каждый план рисуется в своих осях (x — вдоль, y — поперёк) и поворачивается на 0/90/180/270°.

function carveHall(plan, s, own) {
  const [ci, cj] = cellOf(s.lat, s.lng), sh = shapeOf(s), R = sh.R, r = rng(`hall:${s.id}:${s.kind}`);
  const turn = Math.floor(r() * 4);
  const at = (x, y) => [[x, y], [-y, x], [-x, -y], [y, -x]][turn];
  const put = (x, y, type = FLOOR) => { const [a, b] = at(x, y); plan.put(ci + a, cj + b, type, own); };
  const rock = (x, y) => { const [a, b] = at(x, y); plan.rock(ci + a, cj + b); };
  const isFloor = (x, y) => { const [a, b] = at(x, y); return plan.floor(ci + a, cj + b) && plan.owner(ci + a, cj + b) === own; };
  const inside = (x, y, f = 1) => sh.inside(...at(x, y), f);
  const disc = (cx, cy, rad, type = FLOOR) => { for (let x = -rad; x <= rad; x++) for (let y = -rad; y <= rad; y++) if (x * x + y * y <= rad * rad + .5) put(cx + x, cy + y, type); };
  const rect = (x0, y0, x1, y1, type = FLOOR) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) put(x, y, type); };
  // убранство: значок в клетке (повёрнут вместе с планом)
  const item = (x, y, icon, size = 1, rot = 0) => { const [a, b] = at(x, y); plan.items.push({ fi: ci + a + .5, fj: cj + b + .5, icon, rot: (turn * 90 + rot) % 360, s: size, own }); };
  const randomFloor = (tries = 30) => { for (let k = 0; k < tries; k++) { const x = Math.round((r() - .5) * R * 1.6), y = Math.round((r() - .5) * R * 1.6); if (isFloor(x, y) && Math.hypot(x, y) > 1.5) return [x, y]; } return null; };
  const kind = s.minor ? (r() < .5 ? "quarry" : "cave") : s.kind;

  if (kind === "quarry") {
    // каменоломня: зал на столбах разного размера, местами столбы выбраны, местами слились в стены
    for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) if (inside(x, y)) put(x, y);
    const sp = s.minor ? 3 : 4 + Math.floor(r() * 2);
    for (let a = -R; a <= R; a += sp) for (let b = -R; b <= R; b += sp) {
      if (r() < .14) continue;
      const w = 1 + Math.floor(r() * (s.minor ? 2 : 3)), h = 1 + Math.floor(r() * (s.minor ? 2 : 3)), ox = a + Math.floor(r() * 2), oy = b + Math.floor(r() * 2);
      if (Math.hypot(ox, oy) < 2.2 || !inside(ox, oy, .8)) continue;
      for (let x = ox; x < ox + w; x++) for (let y = oy; y < oy + h; y++) rock(x, y);
    }
    if (!s.minor) for (let n = 2 + Math.floor(r() * 3); n > 0; n--) { const p = randomFloor(); if (p) item(...p, r() < .5 ? "cart" : "lantern"); }
  } else if (kind === "warren") {
    // норы Носферату: лабиринт обходом в глубину по узлам через клетку, с редкими петлями; в тупиках — гнёзда
    const node = (x, y) => x % 2 === 0 && y % 2 === 0 && inside(x, y, .92);
    const seen = new Set(), stack = [[0, 0]], key = (x, y) => `${x},${y}`;
    seen.add(key(0, 0)); put(0, 0);
    while (stack.length) {
      const [x, y] = stack.at(-1);
      const next = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dy]) => [x + dx, y + dy, dx, dy]).filter(([nx, ny]) => node(nx, ny) && !seen.has(key(nx, ny)));
      if (!next.length) { stack.pop(); continue; }
      const [nx, ny, dx, dy] = next[Math.floor(r() * next.length)];
      put(x + dx / 2, y + dy / 2); put(nx, ny); seen.add(key(nx, ny)); stack.push([nx, ny]);
    }
    for (const k of seen) { const [x, y] = k.split(",").map(Number); for (const [dx, dy] of [[2, 0], [0, 2]]) if (seen.has(key(x + dx, y + dy)) && r() < .12) put(x + dx / 2, y + dy / 2); }
    disc(0, 0, 1);
    let nests = 0;
    for (const k of seen) {
      if (nests >= 5) break;
      const [x, y] = k.split(",").map(Number);
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isFloor(x + dx, y + dy)).length === 1 && Math.hypot(x, y) > 3 && r() < .4) { item(x, y, "nest"); nests++; }
    }
  } else if (kind === "cave" || kind === "lair" || kind === "flooded") {
    // пещеры: клеточный автомат — неровные гроты; у затопленных часть залита водой
    const cells = new Map(), key = (x, y) => `${x},${y}`;
    for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) if (inside(x, y)) cells.set(key(x, y), Math.hypot(x, y) < 2 || r() < .56);
    for (let it = 0; it < 4; it++) {
      const nextGen = new Map();
      for (const [k, cur] of cells) {
        const [x, y] = k.split(",").map(Number);
        let n = 0;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && cells.get(key(x + dx, y + dy))) n++;
        nextGen.set(k, Math.hypot(x, y) < 2 || n >= 5 || (cur && n >= 4));
      }
      for (const [k, v] of nextGen) cells.set(k, v);
    }
    const keep = new Set(["0,0"]), queue = [[0, 0]];
    while (queue.length) {
      const [x, y] = queue.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = key(x + dx, y + dy); if (cells.get(k) && !keep.has(k)) { keep.add(k); queue.push([x + dx, y + dy]); } }
    }
    const wet = kind === "flooded" ? new Map([...keep].map(k => [k, r() < .5])) : null;
    if (wet) for (let it = 0; it < 3; it++) for (const k of keep) {
      const [x, y] = k.split(",").map(Number);
      let n = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && wet.get(key(x + dx, y + dy))) n++;
      wet.set(k, n >= 5 || (wet.get(k) && n >= 4));
    }
    for (const k of keep) { const [x, y] = k.split(",").map(Number); put(x, y, wet?.get(k) ? WATER : FLOOR); }
    if (kind === "lair") { item(0, 0, "altar", 1.3); for (let n = 3; n > 0; n--) { const p = randomFloor(); if (p) item(...p, "bones"); } }
    if (kind === "flooded") item(0, 0, "well", 1.2);
  } else if (kind === "ossuary") {
    // оссуарий: широкая главная галерея, поперечные галереи костяных стен и круглые ротонды с грудами костей
    const L = Math.round(R * .92);
    for (let x = -L; x <= L; x++) for (const y of [0, 1]) if (inside(x, y)) put(x, y);
    for (let x = -L + 2; x <= L - 2; x += 3) for (const dir of [-1, 1]) {
      const len = Math.round(R * (.35 + r() * .55));
      let last = null;
      for (let k = 1; k <= len; k++) { const y = dir < 0 ? -k : 1 + k; if (!inside(x, y, .96)) break; put(x, y); last = [x, y]; }
      if (last && r() < .22) item(...last, "bones", .9);
    }
    for (let n = 2 + Math.floor(r() * 2); n > 0; n--) { const cx = Math.round((r() - .5) * L * 1.3), cy = Math.round((r() - .5) * 2); disc(cx, cy, 2 + Math.floor(r() * 2)); item(cx, cy, "bones", 1.4); }
  } else if (kind === "crypt") {
    // склепы: монастырская галерея вокруг усыпальницы, четыре прохода внутрь, ниши с саркофагами по внешней стене
    const H = Math.max(3, Math.round(R * .62)), C = Math.max(1, Math.round(R * .24));
    for (let x = -H; x <= H; x++) for (let y = -H; y <= H; y++) if (Math.max(Math.abs(x), Math.abs(y)) === H || Math.max(Math.abs(x), Math.abs(y)) <= C) put(x, y);
    for (let k = C; k <= H; k++) { put(k, 0); put(-k, 0); put(0, k); put(0, -k); }
    for (let k = -H + 1; k < H; k += 2) if (r() < .75) {
      put(k, -H - 1); put(k, H + 1); put(-H - 1, k); put(H + 1, k);
      if (r() < .35) item(k, -H - 1, "sarcophagus", .8, 90);
      if (r() < .35) item(-H - 1, k, "sarcophagus", .8, 0);
    }
    for (let k = H + 1; k <= Math.round(R * .95); k++) put(k, 0);          // выход галереи наружу
    item(0, 0, "sarcophagus", C >= 2 ? 1.8 : 1.2);
  } else if (kind === "prison") {
    // казематы: коридор, по обе стороны — камеры 2×2 с решёткой в двери; при большом зале — второй блок
    const L = Math.round(R * .85), blocks = R >= 10 ? [0, 7] : [0];
    for (const by of blocks) {
      for (let x = -L; x <= L; x++) put(x, by);
      for (let x = -L + 1; x + 1 <= L; x += 3) for (const side of [-1, 1]) {
        put(x, by + side); item(x, by + side, "bars", .9);
        if (side > 0) rect(x, by + 2, x + 1, by + 3); else rect(x, by - 3, x + 1, by - 2);
      }
    }
    if (blocks.length > 1) for (let y = 0; y <= 7; y++) put(0, y);
  } else if (kind === "elysium") {
    // Элизиум: парадный зал с двумя рядами колонн, трон в апсиде, жаровни по углам, торжественный подход, боковые покои
    const W = Math.max(4, Math.round(R * .55)), H = Math.max(3, Math.round(R * .34));
    rect(-W, -H, W, H);
    if (H >= 3) for (let x = -W + 2; x <= W - 2; x += 2) { rock(x, -H + 1); rock(x, H - 1); }
    for (let x = W + 1; x <= W + H; x++) for (let y = -H; y <= H; y++) if ((x - W) ** 2 + y * y <= H * H) put(x, y);
    for (let x = -W - 1; x >= -Math.round(R * .95); x--) for (let y = -1; y <= 1; y++) put(x, y);
    for (const side of [-1, 1]) { put(0, side * (H + 1)); rect(-1, side > 0 ? H + 2 : -H - 4, 1, side > 0 ? H + 4 : -H - 2); }
    item(W + Math.max(1, Math.round(H / 2)), 0, "throne", 1.4, 90);
    for (const [x, y] of [[-W, -H], [W, -H], [-W, H], [W, H]]) item(x, y, "brazier", .9);
  }
  // центр всегда проходим: к нему сходятся ходы
  if (!isFloor(0, 0)) disc(0, 0, 1);
}

/** Ход по клеткам: ступенями под прямым углом от зала к залу; начинается у крайней клетки своего зала, там же — дверь. */
function carveTunnel(plan, a, b, own, { width = 1, ownA, ownB, flooded = false }) {
  const r = rng(`tun:${[a.id, b.id].sort().join("|")}`);
  const [ai, aj] = cellOf(a.lat, a.lng), [bi, bj] = cellOf(b.lat, b.lng);
  const n = 1 + Math.floor(r() * 3), parts = Array.from({ length: n }, () => .5 + r()), sum = parts.reduce((x, y) => x + y, 0);
  const firstX = r() < .5, path = [];
  let x = ai, y = aj, acc = 0;
  const walk = (tx, ty) => {
    while (x !== tx) { x += Math.sign(tx - x); path.push([x, y, 0]); }
    while (y !== ty) { y += Math.sign(ty - y); path.push([x, y, 1]); }
  };
  path.push([x, y, 0]);
  for (let k = 0; k < n; k++) {
    acc += parts[k] / sum;
    const tx = Math.round(ai + (bi - ai) * acc), ty = Math.round(aj + (bj - aj) * acc);
    if (firstX) { walk(tx, y); walk(x, ty); } else { walk(x, ty); walk(tx, y); }
  }
  let s0 = 0, s1 = path.length - 1;
  path.forEach(([px, py], k) => { if (plan.floor(px, py) && plan.owner(px, py) === ownA) s0 = k; });
  for (let k = path.length - 1; k >= 0; k--) if (plan.floor(path[k][0], path[k][1]) && plan.owner(path[k][0], path[k][1]) === ownB) s1 = k;
  if (s1 <= s0) return;
  const seg = path.slice(s0 + 1, s1);
  if (!seg.length) return;
  const type = flooded || r() < .1 ? WATER : FLOOR;
  const carve = ([px, py, vert], t = type) => {
    if (!plan.floor(px, py) || plan.owner(px, py) === own) plan.put(px, py, t, own);
    if (width > 1) { const qx = vert ? px + 1 : px, qy = vert ? py : py + 1; if (!plan.floor(qx, qy)) plan.put(qx, qy, t, own); }
  };
  seg.forEach(c => carve(c));
  // середина клетки хода с учётом ширины: у двойного хода — между двумя клетками
  const mid = ([px, py, vert]) => width > 1 ? (vert ? [px + 1, py + .5] : [px + .5, py + 1]) : [px + .5, py + .5];
  // двери там, где ход входит в зал (у малых выработок — без дверей)
  for (const [c, hall] of [[seg[0], a], [seg.at(-1), b]]) if (!hall.minor) plan.doors.push({ f: mid(c), rot: c[2] ? 0 : 90, s: width, own });
  // лестница посередине, если ход ведёт на другой ярус
  if (a.level !== b.level) { const c = seg[Math.floor(seg.length / 2)]; plan.items.push({ fi: mid(c)[0], fj: mid(c)[1], icon: "stairs", rot: c[2] ? 0 : 90, s: width, own }); }
  if (seg.length > 12 && r() < .16) { const at = Math.floor(seg.length * (.3 + r() * .4)); seg.slice(at, at + 3 + Math.floor(r() * 4)).forEach(c => carve(c, RUBBLE)); }
  for (let k = seg.length > 14 ? Math.floor(r() * 3) : 0; k > 0; k--) {
    const [px, py, vert] = seg[Math.floor(seg.length * (.25 + r() * .5))], dir = r() < .5 ? -1 : 1, len = 3 + Math.floor(r() * 5);
    let ex = px, ey = py;
    for (let s = 1; s <= len; s++) { ex = vert ? px + dir * s : px; ey = vert ? py : py + dir * s; if (plan.floor(ex, ey) && plan.owner(ex, ey) !== own) break; plan.put(ex, ey, FLOOR, own); }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (!plan.floor(ex + dx, ey + dy)) plan.put(ex + dx, ey + dy, FLOOR, own);
  }
}

/** Остов сети: минимальное дерево по расстоянию плюс петли ко второму и иногда третьему соседу. */
function edges(nodes) {
  if (nodes.length < 2) return [];
  const key = (a, b) => [a.id, b.id].sort().join("|");
  const done = new Set([nodes[0].id]), out = new Map();
  while (done.size < nodes.length) {
    let best = null;
    for (const a of nodes) if (done.has(a.id)) for (const b of nodes) if (!done.has(b.id)) {
      const d = meters(a, b);
      if (!best || d < best.d) best = { a, b, d };
    }
    done.add(best.b.id); out.set(key(best.a, best.b), [best.a, best.b]);
  }
  for (const a of nodes) {
    const near = nodes.filter(b => b !== a).map(b => ({ b, d: meters(a, b) })).sort((x, y) => x.d - y.d);
    const roll = rng(`loop:${a.id}`)();
    for (const [i, max] of [[1, 1900], [2, roll < .4 ? 1300 : 0]]) {
      const nb = near[i];
      if (nb && nb.d < max && !out.has(key(a, nb.b))) out.set(key(a, nb.b), [a, nb.b]);
    }
  }
  return [...out.values()];
}

/** Малые безымянные выработки в пределах стены Откупщиков (эллипс вокруг центра) — верхний ярус. */
let minorCache = null;
function minorNetwork() {
  if (minorCache) return minorCache;
  const r = rng("paris-minor");
  const inCity = (x, y) => (x / 3700) ** 2 + (y / 2650) ** 2 < 1;
  const pick = () => { for (;;) { const x = (r() - .5) * 7400, y = (r() - .5) * 5300; if (inCity(x, y)) return [x, y]; } };
  const minis = Array.from({ length: 46 }, (_, i) => { const [x, y] = pick(), [lng, lat] = toLL(CITY, x, y);
    return { id: `m${i}`, name: "", lat, lng, r: 60 + r() * 70, kind: "quarry", minor: true, level: "upper", known: true }; });
  return (minorCache = { minis });
}

/** Весь подземный план: залы и ходы одним графом. Кэш по набору залов — пересобирается, только когда залы меняются. */
let planCache = null;
function buildPlan(all) {
  const minis = minorNetwork().minis.filter(m => all.every(s => meters(s, m) > s.r + m.r + 60));
  const nodes = [...all, ...minis];
  const sig = nodes.map(n => `${n.id}:${n.lat.toFixed(5)}:${n.lng.toFixed(5)}:${n.r}:${n.kind}:${n.level}`).join("|");
  if (planCache?.sig === sig) return planCache;
  const plan = new Plan(), index = new Map(nodes.map((n, i) => [n.id, i]));
  nodes.forEach((n, i) => carveHall(plan, n, i));
  const named = edges(all), graph = edges(nodes);
  const list = new Map([...named, ...graph].map(e => [[e[0].id, e[1].id].sort().join("|"), e]));
  const tunnels = [];
  for (const [a, b] of list.values()) {
    const own = nodes.length + tunnels.length;
    tunnels.push({ a, b });
    carveTunnel(plan, a, b, own, { width: !a.minor && !b.minor ? 2 : 1, ownA: index.get(a.id), ownB: index.get(b.id),
      flooded: a.kind === "flooded" || b.kind === "flooded" });
  }
  return (planCache = { sig, plan, nodes, tunnels });
}

/* ═══ Картинки: значки убранства, мел, штриховка ═════════════════════════ */

function canvasImage(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  draw(g);
  return { width: w, height: h, data: new Uint8Array(g.getImageData(0, 0, w, h).data.buffer) };
}

/** Знаки мелом: несколько неровных штрихов поверх друг друга — как на камне. */
function chalkImage(kind) {
  return canvasImage(64, 64, g => {
    g.lineCap = "round"; g.lineJoin = "round";
    const stroke = path => { for (let i = 0; i < 3; i++) {
      g.strokeStyle = `rgba(240, 236, 224, ${.45 + i * .18})`; g.lineWidth = 6 - i * 1.6;
      g.beginPath(); path((Math.random() - .5) * 2.2, (Math.random() - .5) * 2.2); g.stroke();
    } };
    if (kind === "arrow") stroke((jx, jy) => { g.moveTo(32 + jx, 54 + jy); g.lineTo(32, 12); g.moveTo(16 + jx, 28); g.lineTo(32, 11 + jy); g.lineTo(48 - jx, 28); });
    if (kind === "cross") stroke((jx, jy) => { g.moveTo(14 + jx, 14); g.lineTo(50, 50 + jy); g.moveTo(50 + jx, 14); g.lineTo(14, 50 - jy); });
    if (kind === "circle") stroke((jx, jy) => { g.arc(32 + jx, 32 + jy, 19, 0, Math.PI * 2); });
    if (kind === "ask") stroke((jx, jy) => { g.moveTo(20 + jx, 22); g.bezierCurveTo(20, 6, 46, 6, 45, 22 + jy); g.bezierCurveTo(44, 32, 32, 32, 32, 42); g.moveTo(32, 52 + jy); g.lineTo(32, 54); });
  });
}

/** Значок 64×64 = одна клетка на крупном масштабе: двери, лестницы, решётки, ловушки и убранство залов. */
const ICONS = ["door", "stairs", "gate", "locked", "trap", "sarcophagus", "bones", "altar", "throne", "bars", "well", "nest", "brazier", "lantern", "cart"];
function iconImage(kind) {
  return canvasImage(64, 64, g => {
    const INK = "#ead8ad", DARK = "#120b06", RED = "#c4474c", FIRE = "#f0a040";
    g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 4; g.strokeStyle = INK; g.fillStyle = INK;
    const line = (...p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke(); };
    const circle = (x, y, rad, fill = false) => { g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); fill ? g.fill() : g.stroke(); };
    const gate = () => { g.lineWidth = 5; line(4, 32, 60, 32); g.lineWidth = 3.5; for (let x = 10; x <= 54; x += 11) line(x, 16, x, 48); };
    switch (kind) {
      case "door": g.fillStyle = "#6b4a2a"; g.fillRect(4, 24, 56, 16); g.strokeRect(4, 24, 56, 16); line(32, 24, 32, 40); break;
      case "stairs": g.fillStyle = "rgba(18,11,6,.85)"; g.fillRect(8, 4, 48, 56); g.strokeRect(8, 4, 48, 56); g.lineWidth = 3; for (let y = 12; y < 60; y += 8) line(8, y, 56, y); break;
      case "gate": gate(); break;
      case "locked": gate(); g.fillStyle = RED; g.fillRect(24, 30, 16, 14); g.strokeStyle = RED; g.lineWidth = 3; g.beginPath(); g.arc(32, 30, 6, Math.PI, 0); g.stroke(); break;
      case "trap": g.fillStyle = "rgba(196,71,76,.92)"; g.beginPath(); g.moveTo(32, 6); g.lineTo(58, 54); g.lineTo(6, 54); g.closePath(); g.fill();
        g.strokeStyle = DARK; g.lineWidth = 5; line(32, 22, 32, 38); circle(32, 46, 2.5); break;
      case "sarcophagus": g.fillStyle = "rgba(18,11,6,.7)"; g.beginPath(); [[22, 4], [42, 4], [50, 18], [44, 60], [20, 60], [14, 18]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); g.stroke();
        g.lineWidth = 3; line(32, 14, 32, 46); line(24, 24, 40, 24); break;
      case "bones": circle(32, 22, 11, true); g.fillStyle = DARK; circle(27, 21, 3, true); circle(37, 21, 3, true); g.fillRect(28, 30, 8, 4);
        g.strokeStyle = INK; g.lineWidth = 5; line(12, 42, 52, 58); line(52, 42, 12, 58); break;
      case "altar": g.fillStyle = "rgba(18,11,6,.7)"; g.fillRect(10, 24, 44, 26); g.strokeRect(10, 24, 44, 26); line(32, 30, 32, 44); line(25, 36, 39, 36);
        g.fillStyle = FIRE; circle(16, 14, 4, true); circle(48, 14, 4, true); break;
      case "throne": g.fillStyle = "rgba(18,11,6,.7)"; g.fillRect(20, 4, 24, 30); g.strokeRect(20, 4, 24, 30); g.fillRect(12, 34, 40, 16); g.strokeRect(12, 34, 40, 16);
        line(16, 50, 16, 60); line(48, 50, 48, 60); g.fillStyle = "#d9b44a"; circle(32, 16, 5, true); break;
      case "bars": g.lineWidth = 3.5; g.strokeRect(10, 10, 44, 44); for (const x of [21, 32, 43]) line(x, 10, x, 54); break;
      case "well": circle(32, 32, 24); g.fillStyle = "#2c6f75"; circle(32, 32, 15, true); g.lineWidth = 2; g.strokeStyle = "#8fd6da"; circle(32, 32, 8); break;
      case "nest": g.lineWidth = 3; for (let k = 0; k < 3; k++) circle(32 + k * 2 - 2, 34 - k, 18 - k * 5); g.fillStyle = RED; circle(24, 30, 3, true); circle(30, 30, 3, true); circle(38, 40, 3, true); circle(44, 40, 3, true); break;
      case "brazier": g.fillStyle = FIRE; g.beginPath(); g.moveTo(32, 6); g.quadraticCurveTo(46, 22, 32, 34); g.quadraticCurveTo(18, 22, 32, 6); g.fill();
        g.beginPath(); g.arc(32, 34, 18, 0, Math.PI); g.stroke(); line(20, 50, 16, 60); line(44, 50, 48, 60); break;
      case "lantern": { const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30); grad.addColorStop(0, "rgba(255,200,110,.85)"); grad.addColorStop(1, "rgba(255,200,110,0)");
        g.fillStyle = grad; g.fillRect(0, 0, 64, 64); g.strokeRect(24, 20, 16, 24); line(32, 12, 32, 20); break; }
      case "cart": g.strokeRect(10, 18, 44, 22); circle(22, 48, 7); circle(42, 48, 7); g.fillStyle = "#9a8b70"; g.fillRect(14, 12, 36, 6); break;
    }
  });
}

/** Штриховка породы вдоль стен — косые неровные штрихи, как на рисованных планах подземелий. */
function hatchImage() {
  return canvasImage(32, 32, g => {
    g.strokeStyle = "rgba(216, 184, 120, .42)"; g.lineWidth = 1.3; g.lineCap = "round";
    for (let k = -32; k < 64; k += 7) { g.beginPath(); g.moveTo(k, 32); g.lineTo(k + 32, 0); g.stroke(); }
    g.strokeStyle = "rgba(216, 184, 120, .22)"; g.lineWidth = 1;
    for (let k = -32; k < 64; k += 14) { g.beginPath(); g.moveTo(k + 3, 32); g.lineTo(k + 20, 15); g.stroke(); }
  });
}

/* ═══ Слои карты ═══════════════════════════════════════════════════════════ */

const PAPER = "#33231a", WALL = "#e2cda0", LAMP = "#f0c27a", GRID = "#d8b878";
/** Прозрачность с учётом «скрыт от игроков» и «другой ярус» — множитель op в свойствах каждого объекта. */
const o = base => ["*", base, ["get", "op"]];
const zw = (...stops) => ["interpolate", ["exponential", 1.6], ["zoom"], ...stops];
/** Размер значка в клетках: 64 пикселя = одна клетка 16 м около z18,65. */
const cellIcon = ["interpolate", ["exponential", 2], ["zoom"], 12, ["*", .0099, ["get", "s"]], 20, ["*", 2.55, ["get", "s"]]];
const gridOn = () => host?.view().cataGrid !== false;
const GRID_LAYERS = ["rc-cata-fine", "rc-cata-sq", "rc-cata-sq-label"];

/** Сетка квадратов и клеток — одна на всё время. */
let gridCache = null;
function gridData() {
  if (gridCache) return gridCache;
  const fine = [], squares = [], labels = [];
  const N = cornerLL(0, 0)[1], S = cornerLL(0, ROWS)[1], W = cornerLL(0, 0)[0], E = cornerLL(COLS, 0)[0];
  for (let i = 0; i <= COLS; i++) (i % SQUARE ? fine : squares).push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[cornerLL(i, 0)[0], N], [cornerLL(i, 0)[0], S]] } });
  for (let j = 0; j <= ROWS; j++) (j % SQUARE ? fine : squares).push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[W, cornerLL(0, j)[1]], [E, cornerLL(0, j)[1]]] } });
  for (let c = 0; c < COLS / SQUARE; c++) for (let r = 0; r < Math.ceil(ROWS / SQUARE); r++)
    labels.push({ type: "Feature", properties: { name: `${SQ_LETTERS[c]}${r + 1}` }, geometry: { type: "Point", coordinates: cornerLL(c * SQUARE + 1.2, r * SQUARE + 1.4) } });
  return (gridCache = { fine: { type: "FeatureCollection", features: fine }, squares: { type: "FeatureCollection", features: squares }, labels: { type: "FeatureCollection", features: labels } });
}

const SOURCES = ["rc-cata-dim", "rc-cata-fine", "rc-cata-sq", "rc-cata-sq-label", "rc-cata-area", "rc-cata-glow", "rc-cata-hatch", "rc-cata-cells",
  "rc-cata-walls", "rc-cata-icons", "rc-cata-label", "rc-cata-door", "rc-cata-marks"];
let pushedKey = null;

/** Источники и слои; карта зовёт при каждой загрузке стиля (смена «план / ночь» стирает слои). */
export function addCatacombLayers() {
  const map = host?.map;
  if (!map) return;
  surfaceKeep.delete(map);   // новый стиль — прежние значения притушенных слоёв больше не нужны
  pushedKey = null;          // и источники новые — данные залить заново
  for (const k of Object.keys(CHALK)) if (!map.hasImage(`rc-chalk-${k}`)) map.addImage(`rc-chalk-${k}`, chalkImage(k));
  for (const k of ICONS) if (!map.hasImage(`rc-ico-${k}`)) map.addImage(`rc-ico-${k}`, iconImage(k));
  if (!map.hasImage("rc-cata-hatch")) map.addImage("rc-cata-hatch", hatchImage());
  const world = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } }] };
  const g = gridData();
  const data = { "rc-cata-dim": world, "rc-cata-fine": g.fine, "rc-cata-sq": g.squares, "rc-cata-sq-label": g.labels };
  for (const src of SOURCES) if (!map.getSource(src)) map.addSource(src, { type: "geojson", data: data[src] ?? EMPTY });
  const paper = host.view().style === "plan", vis = isOn() ? "visible" : "none";
  const add = l => { if (!map.getLayer(l.id)) map.addLayer({ ...l, layout: { ...(l.layout ?? {}), visibility: vis } }); };
  // Город над головой уходит в густую тень. Слой тени виден всегда, меняется только прозрачность — так затемнение плавное
  if (!map.getLayer("rc-cata-dim")) map.addLayer({ id: "rc-cata-dim", type: "fill", source: "rc-cata-dim",
    paint: { "fill-color": paper ? "#0c0703" : "#020104", "fill-opacity": 0, "fill-opacity-transition": { duration: 700, delay: 0 } } });
  // миллиметровка: мелкие клетки вблизи, крупные квадраты всегда (отключаются кнопкой «Сетка»)
  add({ id: "rc-cata-fine", type: "line", source: "rc-cata-fine", minzoom: 14.6,
    paint: { "line-color": GRID, "line-opacity": ["interpolate", ["linear"], ["zoom"], 14.6, 0, 15.6, .07, 18, .12], "line-width": .6 } });
  add({ id: "rc-cata-sq", type: "line", source: "rc-cata-sq",
    paint: { "line-color": GRID, "line-opacity": ["interpolate", ["linear"], ["zoom"], 12, .16, 15, .28], "line-width": ["interpolate", ["linear"], ["zoom"], 12, .6, 16, 1.2] } });
  const px = k => ["*", ["get", "r"], k / 103040];
  add({ id: "rc-cata-glow", type: "circle", source: "rc-cata-glow",
    paint: { "circle-color": ["get", "color"], "circle-blur": 1, "circle-opacity": o(.55), "circle-pitch-alignment": "map",
      "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 10, px(1024 * 1.6), 20, px(1048576 * 1.6)] } });
  // невидимая площадь зала — для щелчка
  add({ id: "rc-cata-area-fill", type: "fill", source: "rc-cata-area", paint: { "fill-color": "#000", "fill-opacity": .01 } });
  // ближний вид: штриховка породы вдоль стен, пол, свет, стены, кости
  // штриховка — только вблизи: издали клетка с пиксель, и штрихи сливаются в рябь поверх стен
  add({ id: "rc-cata-hatch", type: "fill", source: "rc-cata-hatch", minzoom: 14.2,
    paint: { "fill-pattern": "rc-cata-hatch", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14.2, 0, 15, o(.9)], "fill-antialias": false } });
  add({ id: "rc-cata-floor", type: "fill", source: "rc-cata-cells",
    paint: { "fill-color": ["match", ["get", "type"], WATER, "#174a50", RUBBLE, "#4a3a26", PAPER], "fill-opacity": o(1), "fill-antialias": false } });
  add({ id: "rc-cata-lamp", type: "line", source: "rc-cata-walls", layout: { "line-cap": "round" },
    paint: { "line-color": LAMP, "line-opacity": o(.2), "line-width": zw(12, 2, 15, 6, 18, 18), "line-blur": zw(12, 2, 15, 5, 18, 14) } });
  add({ id: "rc-cata-wall", type: "line", source: "rc-cata-walls", layout: { "line-cap": "square" },
    paint: { "line-color": ["get", "wall"], "line-opacity": o(1), "line-width": zw(12, 1, 14, 1.4, 16, 2.4, 18, 5), "line-dasharray": ["case", ["get", "secret"], ["literal", [1.5, 1.5]], ["literal", [1, 0]]] } });
  add({ id: "rc-cata-bones", type: "line", source: "rc-cata-walls", minzoom: 14.5, filter: ["==", ["get", "bones"], true],
    paint: { "line-color": "#f4e8c8", "line-opacity": o(.9), "line-width": zw(14.5, 2, 16, 4, 18, 8), "line-dasharray": [.25, 1.1] } });
  // значки: убранство, двери, лестницы, решётки, ловушки — в размер клетки
  add({ id: "rc-cata-icons", type: "symbol", source: "rc-cata-icons", minzoom: 14.6,
    layout: { "icon-image": ["concat", "rc-ico-", ["get", "icon"]], "icon-size": cellIcon, "icon-rotate": ["get", "rot"], "icon-rotation-alignment": "map",
      "icon-allow-overlap": true, "icon-ignore-placement": true, "symbol-sort-key": ["get", "z"] },
    paint: { "icon-opacity": o(1) } });
  // входы с поверхности: ореол света (мерцает), кольцо и тёмная шахта
  add({ id: "rc-cata-door-glow", type: "circle", source: "rc-cata-door", minzoom: 12.5,
    paint: { "circle-radius": zw(12.5, 6, 16, 24, 18, 60), "circle-color": LAMP, "circle-blur": 1, "circle-opacity": o(.55) } });
  add({ id: "rc-cata-door", type: "circle", source: "rc-cata-door", minzoom: 12.5,
    paint: { "circle-radius": zw(12.5, 2.5, 16, 7, 18, 16), "circle-color": "#050302", "circle-stroke-color": WALL, "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12.5, 1, 17, 2.5],
      "circle-opacity": o(1), "circle-stroke-opacity": o(1) } });
  add({ id: "rc-cata-door-label", type: "symbol", source: "rc-cata-door", minzoom: 15,
    layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Italic"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top", "text-optional": true },
    paint: { "text-color": "#e8d7b0", "text-halo-color": "rgba(5,3,2,.95)", "text-halo-width": 1.8, "text-opacity": o(1) } });
  add({ id: "rc-cata-sq-label", type: "symbol", source: "rc-cata-sq-label", minzoom: 13.2,
    layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 13.2, 9, 16, 13], "text-anchor": "top-left",
      "text-letter-spacing": .1, "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": GRID, "text-opacity": ["interpolate", ["linear"], ["zoom"], 13.2, .25, 15, .45] } });
  add({ id: "rc-cata-label", type: "symbol", source: "rc-cata-label", minzoom: 12, filter: ["any", [">=", ["zoom"], 13.4], [">=", ["get", "r"], 240]],
    layout: { "text-field": ["step", ["zoom"], ["upcase", ["get", "name"]], 14.2,
        ["format", ["upcase", ["get", "name"]], {}, "\n", {}, ["get", "sub"], { "font-scale": .8, "text-font": ["literal", ["Noto Sans Italic"]] }]],
      "text-font": ["Noto Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 14.5], "text-letter-spacing": .16, "text-max-width": 9,
      "text-line-height": 1.25, "text-padding": 4, "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": ["get", "ink"], "text-halo-color": "rgba(3,2,1,.92)", "text-halo-width": 2.4, "text-halo-blur": .6, "text-opacity": o(1) } });
  add({ id: "rc-cata-mark", type: "symbol", source: "rc-cata-marks", minzoom: 13,
    layout: { "icon-image": ["concat", "rc-chalk-", ["get", "icon"]], "icon-size": ["interpolate", ["linear"], ["zoom"], 13, .28, 17, .7, 19, 1],
      "icon-rotate": ["get", "rot"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true,
      "text-field": ["get", "text"], "text-font": ["Noto Sans Italic"], "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 17, 13],
      "text-offset": [0, 1.8], "text-anchor": "top", "text-optional": true, "text-allow-overlap": true },
    paint: { "icon-opacity": ["case", ["get", "own"], .95, .8], "text-color": "#f0ece0", "text-halo-color": "rgba(10,8,6,.9)", "text-halo-width": 1.6 } });
  if (isOn()) drawCatacombs();
  // Катакомбы выключены — заранее, в простое, посчитать и залить данные в скрытые слои: тогда включение мгновенное
  else if (catacombsHere()) (window.requestIdleCallback ?? (f => setTimeout(f, 1500)))(() => { if (!isOn()) pushData(); }, { timeout: 4000 });
}

/** Видимость слоёв, затемнение, панель; данные — из кэша (pushData). */
export function drawCatacombs() {
  const map = host?.map;
  if (!map?.getSource("rc-cata-cells")) return;
  const on = isOn(), vis = on ? "visible" : "none", grid = on && gridOn() ? "visible" : "none";
  for (const l of map.getStyle()?.layers ?? []) if (l.id.startsWith("rc-cata-") && l.id !== "rc-cata-dim")
    map.setLayoutProperty(l.id, "visibility", GRID_LAYERS.includes(l.id) ? grid : vis);
  map.setPaintProperty("rc-cata-dim", "fill-opacity", on ? (host.view().style === "plan" ? .88 : .87) : 0);
  // метки и фишки — HTML поверх карты, слой тени их не накрывает: притушить стилями (styles/r-catacombs.css)
  map.getContainer().closest("#r-citymap")?.classList.toggle("is-underground", on);
  dimSurface(map, on);
  animate(on);
  if (!on) { closePopup(); setBrush(null); renderPanel(); return; }
  pushData();
  renderPanel();
  drawMarks();
}

/** Залить данные в источники, если они поменялись (ключ — залы, правки, видимость, ярус). */
const perf = { compute: 0, push: 0 };
function pushData() {
  const map = host?.map;
  if (!map?.getSource("rc-cata-cells")) return;
  const t0 = performance.now(), d = computeData();
  perf.compute = performance.now() - t0;
  if (d.key === pushedKey) return;
  pushedKey = d.key;
  for (const [src, fc] of Object.entries(d.sources)) map.getSource(src)?.setData(fc);
  perf.push = performance.now() - t0 - perf.compute;
}
/** Время последнего расчёта и заливки данных, мс (для автотестов). */
export const catacombsPerf = () => ({ ...perf });

/** Правки клеток рассказчика с учётом ещё не сохранённого мазка кисти. */
function cellEdits(st = store()) {
  const cells = { ...(st.cells ?? {}) };
  if (pending) for (const [k, v] of Object.entries(pending)) { if (v === null) delete cells[k]; else cells[k] = v; }
  return cells;
}

let dataCache = null;
/** Все данные слоёв для этого пользователя; кэш по ключу, чтобы повторное включение и перерисовки были мгновенными. */
function computeData() {
  const gm = game.user.isGM, st = store(), all = sections(), L = curLevel(), cells = cellEdits(st), gates = st.gates ?? {}, traps = st.traps ?? [];
  const base = buildPlan(all);
  const key = `${base.sig}#${gm}#${L}#${all.map(s => `${s.id}${s.known ? 1 : 0}`).join("")}#${JSON.stringify(cells)}#${JSON.stringify(gates)}#${JSON.stringify(traps)}`;
  if (dataCache?.key === key) return dataCache;
  const { plan, nodes, tunnels } = base, N = COLS * ROWS;
  const kind = s => KINDS[s.kind] ?? KINDS.quarry;
  const op = (known, level) => (known ? 1 : .45) * (L === "all" || level === "x" || level === L ? 1 : .13);
  const DIG = nodes.length + tunnels.length, SEC_H = DIG + 1, SEC_S = DIG + 2;
  // по хозяину клетки: виден ли этому пользователю, прозрачность, цвет стены, кости, тайный
  const meta = [
    ...nodes.map(n => ({ vis: n.minor || gm || n.known, op: op(n.minor || n.known, n.level),
      wall: n.minor ? "#a8936c" : mix(kind(n).color, WALL, .5), bones: n.kind === "ossuary" && !n.minor })),
    ...tunnels.map(({ a, b }) => { const known = (a.minor || a.known) && (b.minor || b.known);
      return { vis: gm || known, op: op(known, a.level === b.level ? a.level : "x"), wall: a.minor || b.minor ? "#a8936c" : WALL }; }),
    { vis: true, op: 1, wall: WALL },                                       // выкопано кистью
    { vis: gm, op: .45, wall: "#c9a0e0", secret: true },                    // тайный ход, скрыт от игроков
    { vis: true, op: 1, wall: WALL }                                        // тайный ход, открыт
  ];
  // правки кистью поверх плана
  const t = plan.t.slice(), own = plan.o.slice();
  for (const [ck, v] of Object.entries(cells)) {
    const [i, j] = ck.split(",").map(Number), k = plan.k(i, j);
    if (k < 0) continue;
    if (v === 0) t[k] = 0;
    else if (v === SECRET || v === SECRET_SHOWN) { t[k] = FLOOR; own[k] = v === SECRET ? SEC_H : SEC_S; }
    else { if (!t[k]) own[k] = DIG; t[k] = v; }
  }
  // видимая прозрачность клетки (0 — не видна или порода)
  const vop = new Float32Array(N);
  for (let k = 0; k < N; k++) if (t[k] && meta[own[k]]?.vis) vop[k] = meta[own[k]].op;
  const at = (i, j) => (i < 0 || j < 0 || i >= COLS || j >= ROWS) ? 0 : vop[j * COLS + i];
  // штриховка: порода в одну клетку от видимого пола
  const hop = new Float32Array(N);
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const p = vop[j * COLS + i];
    if (!p) continue;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= COLS || jj >= ROWS) continue;
      const k = jj * COLS + ii;
      if (!vop[k] && hop[k] < p) hop[k] = p;
    }
  }
  const cellsFc = mesh((i, j) => { const k = j * COLS + i; return vop[k] ? `${t[k]}|${vop[k]}` : ""; }, key => { const [type, p] = key.split("|").map(Number); return { type, op: p }; });
  const hatchFc = mesh((i, j) => { const p = hop[j * COLS + i]; return p ? String(p) : ""; }, key => ({ op: Number(key) }));
  // стены: границы между видимым полом и прочим; подряд идущие отрезки с одинаковыми свойствами сливаются
  const walls = [];
  const wallKey = k => { const m = meta[own[k]]; return m ? `${m.wall}|${vop[k]}|${m.bones ? 1 : 0}|${m.secret ? 1 : 0}` : ""; };
  const pushWall = (key, a, b) => { const [wall, p, bones, secret] = key.split("|"); walls.push({ type: "Feature", geometry: { type: "LineString", coordinates: [a, b] }, properties: { wall, op: Number(p), bones: bones === "1", secret: secret === "1" } }); };
  for (let j = 0; j <= ROWS; j++) {
    let start = -1, key = "";
    for (let i = 0; i <= COLS; i++) {
      const up = i < COLS && at(i, j - 1) > 0, down = i < COLS && at(i, j) > 0;
      const here = up !== down ? wallKey((up ? j - 1 : j) * COLS + i) : "";
      if (here !== key) { if (key) pushWall(key, cornerLL(start, j), cornerLL(i, j)); start = i; key = here; }
    }
  }
  for (let i = 0; i <= COLS; i++) {
    let start = -1, key = "";
    for (let j = 0; j <= ROWS; j++) {
      const left = j < ROWS && at(i - 1, j) > 0, right = j < ROWS && at(i, j) > 0;
      const here = left !== right ? wallKey(j * COLS + (left ? i - 1 : i)) : "";
      if (here !== key) { if (key) pushWall(key, cornerLL(i, start), cornerLL(i, j)); start = j; key = here; }
    }
  }
  // значки: убранство и лестницы, двери, решётки, ловушки — только там, где пол виден
  const icons = [], visAt = (fi, fj) => at(Math.floor(fi), Math.floor(fj));
  const icon = (fi, fj, name, rot, s, p, extra = {}) => icons.push({ type: "Feature", geometry: { type: "Point", coordinates: cornerLL(fi, fj) }, properties: { icon: name, rot, s, op: p, z: 1, ...extra } });
  for (const it of plan.items) { const p = visAt(it.fi, it.fj); if (p) icon(it.fi, it.fj, it.icon, it.rot, it.s, p); }
  for (const d of plan.doors) { const p = visAt(d.f[0] - .01, d.f[1] - .01) || visAt(d.f[0], d.f[1]); if (p) icon(d.f[0], d.f[1], "door", d.rot, d.s, p); }
  for (const [ck, v] of Object.entries(gates)) {
    const [i, j] = ck.split(",").map(Number), p = at(i, j);
    if (!p || !v) continue;
    const horiz = at(i - 1, j) > 0 || at(i + 1, j) > 0;                      // ход идёт вдоль — решётка поперёк
    icon(i + .5, j + .5, v === 2 ? "locked" : "gate", horiz ? 90 : 0, 1, p, { z: 2 });
  }
  for (const tr of traps) if (gm || tr.known) icon(tr.i + .5, tr.j + .5, "trap", 0, .9, tr.known ? 1 : .6, { trap: tr.id, z: 3 });
  const halls = all.filter(s => gm || s.known).map(s => ({ s, op: op(s.known, s.level) }));
  const feat = (geometry, properties) => ({ type: "Feature", geometry, properties });
  const fc = features => ({ type: "FeatureCollection", features });
  const minisShown = nodes.filter(n => n.minor);
  dataCache = { key, sources: {
    "rc-cata-cells": cellsFc, "rc-cata-hatch": hatchFc, "rc-cata-walls": fc(walls), "rc-cata-icons": fc(icons),
    "rc-cata-area": fc([...halls.map(({ s, op: p }) => feat({ type: "Polygon", coordinates: [outlineOf(s)] }, { id: s.id, color: kind(s).color, op: p })),
      ...minisShown.map(m => feat({ type: "Polygon", coordinates: [outlineOf(m)] }, { id: m.id, minor: true, color: "#a8936c", op: op(true, "upper") * .7 }))]),
    "rc-cata-glow": fc(halls.map(({ s, op: p }) => feat({ type: "Point", coordinates: [s.lng, s.lat] }, { color: kind(s).color, r: s.r, op: p }))),
    "rc-cata-label": fc(halls.filter(h => h.op > .2).map(({ s, op: p }) => feat({ type: "Point", coordinates: [s.lng, s.lat] },
      { name: s.name, sub: `${kind(s).label} · ${s.holder || "ничьё"} · ${squareOf(s.lat, s.lng)}`, ink: mix(kind(s).color, "#fbf0d8", .5), r: s.r, op: p }))),
    "rc-cata-door": fc(halls.flatMap(({ s, op: p }) => (s.entries ?? []).map(([lat, lng, name], i) => feat({ type: "Point", coordinates: [lng, lat] }, { name, hid: s.id, idx: i, op: p }))))
  } };
  return dataCache;
}

/** Склейка клеток в прямоугольники: полосы в строке, одинаковые полосы соседних строк сливаются (меньше объектов — быстрее). */
function mesh(keyAt, propsOf) {
  const out = [], open = new Map();
  for (let j = 0; j <= ROWS; j++) {
    const runs = new Set();
    if (j < ROWS) {
      let start = -1, key = "";
      for (let i = 0; i <= COLS; i++) {
        const k = i < COLS ? keyAt(i, j) : "";
        if (k !== key) { if (key) runs.add(`${start}|${i}|${key}`); start = i; key = k; }
      }
    }
    for (const [id, rc] of open) { if (runs.has(id)) { rc.j1 = j + 1; runs.delete(id); } else { out.push(rc); open.delete(id); } }
    for (const id of runs) { const [i0, i1, ...rest] = id.split("|"); open.set(id, { i0: +i0, i1: +i1, j0: j, j1: j + 1, key: rest.join("|") }); }
  }
  return { type: "FeatureCollection", features: out.map(rc => rectFeature(rc.i0, rc.j0, rc.i1, rc.j1, propsOf(rc.key))) };
}

const rectFeature = (i0, j0, i1, j1, properties) => ({ type: "Feature", properties,
  geometry: { type: "Polygon", coordinates: [[cornerLL(i0, j0), cornerLL(i1, j0), cornerLL(i1, j1), cornerLL(i0, j1), cornerLL(i0, j0)]] } });

/** Контур зала — для щелчка. */
function outlineOf(s) {
  const sh = shapeOf(s), [ci, cj] = cellOf(s.lat, s.lng);
  return Array.from({ length: 41 }, (_, i) => { const t = i / 40 * Math.PI * 2, d = sh.radius(t); return cornerLL(ci + .5 + Math.cos(t) * d, cj + .5 - Math.sin(t) * d); });
}

/** Меловые пометки: свои, открытые всем и — у мастера — все. */
function drawMarks() {
  const map = host?.map;
  if (!map?.getSource("rc-cata-marks") || !isOn()) return;
  const gm = game.user.isGM, features = [];
  for (const u of game.users) for (const m of u.getFlag(SYSTEM_ID, MARKS) ?? []) {
    const own = u.id === game.user.id;
    if (!own && !gm && !m.shared) continue;
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [m.lng, m.lat] },
      properties: { id: m.id, uid: u.id, icon: CHALK[m.icon] ? m.icon : "cross", rot: Number(m.rot) || 0, text: m.text ?? "", own } });
  }
  map.getSource("rc-cata-marks").setData({ type: "FeatureCollection", features });
}

/** Смешать два цвета #rrggbb: t — доля второго. */
function mix(a, b, t) {
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Значки и подписи города над головой притушены, пока смотрим вниз; прежние значения возвращаются как были. */
const surfaceKeep = new WeakMap();
function dimSurface(map, on) {
  if (!surfaceKeep.has(map)) surfaceKeep.set(map, new Map());
  const keep = surfaceKeep.get(map);
  for (const l of map.getStyle()?.layers ?? []) {
    if (l.type !== "symbol" || l.id.startsWith("rc-cata") || !l.id.startsWith("rc-")) continue;
    for (const prop of ["icon-opacity", "text-opacity"]) {
      const k = `${l.id}|${prop}`;
      if (on) {
        if (!keep.has(k)) keep.set(k, map.getPaintProperty(l.id, prop) ?? 1);
        map.setPaintProperty(l.id, prop, .16);
      } else if (keep.has(k)) { map.setPaintProperty(l.id, prop, keep.get(k)); keep.delete(k); }
    }
  }
}

/**
 * Живые детали: фонари мерцают, вода в затопленных выработках дышит. Шесть кадров в секунду и только пока
 * катакомбы открыты и вкладка видна; при «уменьшить движение» в системе — без анимации.
 */
function animate(on) {
  if (!on || matchMedia?.("(prefers-reduced-motion: reduce)").matches) { clearInterval(anim); anim = null; return; }
  if (anim) return;
  anim = setInterval(() => {
    const map = host?.map;
    if (!map || !isOn() || document.hidden || !map.getLayer("rc-cata-lamp")) return;
    const t = performance.now() / 1000, f = .86 + .1 * Math.sin(t * 2.3) + .06 * Math.sin(t * 7.1 + 1.3);
    map.setPaintProperty("rc-cata-lamp", "line-opacity", o(.2 * f));
    map.setPaintProperty("rc-cata-door-glow", "circle-opacity", o(.55 * (f + .04 * Math.sin(t * 11))));
    const w = .78 + .14 * Math.sin(t * 1.6);
    map.setPaintProperty("rc-cata-floor", "fill-opacity", ["*", ["match", ["get", "type"], WATER, w, 1], ["get", "op"]]);
  }, 160);
}

/* ═══ Кисть рассказчика: копать, засыпать, вода, завал, тайный ход, решётки, ловушки ═══ */

const BRUSH_MODES = {
  dig: ["Копать", "fa-trowel"], water: ["Вода", "fa-water"], rubble: ["Завал", "fa-cubes-stacked"], fill: ["Засыпать", "fa-fill"],
  secret: ["Тайный ход", "fa-user-secret"], restore: ["Как было", "fa-rotate-left"], gate: ["Решётка", "fa-dungeon"], trap: ["Ловушка", "fa-triangle-exclamation"]
};
const BRUSH_VALUE = { dig: FLOOR, water: WATER, rubble: RUBBLE, fill: 0, secret: SECRET, restore: null };
let brush = null, painting = false, pending = null, paintTimer = null;

function setBrush(b) {
  brush = b;
  const map = host?.map;
  if (!map) return;
  if (b) { placing = null; map.dragPan.disable(); } else map.dragPan.enable();
  map.getCanvas().style.cursor = b ? "crosshair" : "";
  if (panel) renderPanel();
}

/** Подписка на мышь карты — один раз на карту. */
const brushMaps = new WeakSet();
function bindBrush(map) {
  if (brushMaps.has(map)) return;
  brushMaps.add(map);
  map.on("mousedown", e => {
    if (!brush || !game.user.isGM || !isOn() || e.originalEvent.button !== 0 || !(brush.mode in BRUSH_VALUE)) return;
    painting = true; pending = {}; paintAt(e.lngLat);
  });
  map.on("mousemove", e => { if (painting) paintAt(e.lngLat); });
  const finish = async () => {
    if (!painting) return;
    painting = false;
    clearTimeout(paintTimer); paintTimer = null;
    const cells = cellEdits();
    pending = null;
    await save({ cells });
  };
  map.on("mouseup", finish);
  map.getCanvas().addEventListener("mouseleave", finish);
}

function paintAt(ll) {
  const [ci, cj] = cellOf(ll.lat, ll.lng), n = brush.size ?? 1, h = Math.floor((n - 1) / 2), v = BRUSH_VALUE[brush.mode];
  for (let di = -h; di < n - h; di++) for (let dj = -h; dj < n - h; dj++) pending[`${ci + di},${cj + dj}`] = v;
  if (!paintTimer) paintTimer = setTimeout(() => { paintTimer = null; pushData(); }, 90);
}

/** Тайный ход: связная группа клеток (в правках 4/5) от этой. */
function secretGroup(cells, i0, j0) {
  const seen = new Set(), queue = [[i0, j0]];
  while (queue.length) {
    const [i, j] = queue.pop(), k = `${i},${j}`;
    if (seen.has(k) || ![SECRET, SECRET_SHOWN].includes(cells[k])) continue;
    seen.add(k);
    queue.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
  }
  return [...seen];
}

/* ═══ Кнопка, режимы щелчка, щелчки по карте ═══════════════════════════════ */

export function catacombsButtons() {
  if (!catacombsHere()) return "";
  return `<a class="${isOn() ? "on" : ""}" data-act="catacombs" data-tooltip="Катакомбы: подземный Париж"><i class="fa-solid fa-skull"></i></a>`;
}

export async function catacombsAct(act) {
  if (act !== "catacombs") return;
  await host.setView({ catacombs: !host.view().catacombs });
  if (!isOn()) { setPlacing(null); setBrush(null); }
  drawCatacombs(); host.drawTools();
}

const PLACE_HINT = { hall: "Щёлкните по карте там, где будет новый зал.", move: "Щёлкните по карте — туда переедет зал.",
  door: "Щёлкните по карте там, где будет вход-колодец.", mark: "Щёлкните по карте там, где оставить знак мелом." };

function setPlacing(p) {
  placing = p;
  const c = host?.map?.getCanvas();
  if (c) c.style.cursor = p ? "crosshair" : "";
  if (p) ui.notifications.info(PLACE_HINT[p.mode]);
  renderPanel();
}

/** Щелчок в режиме «поставить» (зал, перенос, вход, мел). true — щелчок забран. */
export function catacombsPlace(ev) {
  // с кистью щелчки по карте — её: решётка и ловушка ставятся щелчком, остальные режимы рисуют мазком
  if (brush && game.user.isGM && isOn()) {
    const [i, j] = cellOf(ev.lngLat.lat, ev.lngLat.lng), ck = `${i},${j}`;
    if (brush.mode === "gate") { const gates = { ...(store().gates ?? {}) }, v = ((gates[ck] ?? 0) + 1) % 3; if (v) gates[ck] = v; else delete gates[ck]; save({ gates }); }
    if (brush.mode === "trap") trapDialog(i, j);
    return true;
  }
  if (!placing || !isOn() || (placing.mode !== "mark" && !game.user.isGM)) return false;
  const p = placing, { lat, lng } = ev.lngLat;
  setPlacing(null);
  if (p.mode === "hall") hallDialog(null, { lat, lng });
  if (p.mode === "move") patchHall(p.id, { lat, lng });
  if (p.mode === "door") doorDialog(p.id, lat, lng);
  if (p.mode === "mark") markDialog(lat, lng);
  return true;
}

/** Щелчок по знаку мелом, входу или залу. true — щелчок забран. */
export function catacombsPick(ev) {
  const map = host?.map;
  if (!isOn() || !map?.getLayer("rc-cata-area-fill")) return false;
  const hits = map.queryRenderedFeatures(ev.point, { layers: ["rc-cata-mark", "rc-cata-icons", "rc-cata-door", "rc-cata-area-fill"].filter(l => map.getLayer(l)) });
  const mark = hits.find(f => f.layer.id === "rc-cata-mark");
  if (mark) { markCard(mark.properties, ev.lngLat); return true; }
  const trap = hits.find(f => f.layer.id === "rc-cata-icons" && f.properties.trap);
  if (trap) { trapCard(trap.properties.trap, ev.lngLat); return true; }
  // тайный ход под щелчком (видит только мастер — у игроков открытый ход неотличим от обычного)
  if (game.user.isGM) {
    const [i, j] = cellOf(ev.lngLat.lat, ev.lngLat.lng), v = store().cells?.[`${i},${j}`];
    if (v === SECRET || v === SECRET_SHOWN) { secretCard(i, j, ev.lngLat); return true; }
  }
  const door = hits.find(f => f.layer.id === "rc-cata-door");
  if (door && game.user.isGM) { removeDoor(door.properties.hid, Number(door.properties.idx), door.properties.name); return true; }
  const area = hits.find(f => f.layer.id === "rc-cata-area-fill" && !f.properties.minor);
  if (!area) return false;
  showCard(area.properties.id, ev.lngLat);
  return true;
}

/* ═══ Список залов сбоку ═══════════════════════════════════════════════════ */

function renderPanel() {
  const map = host?.map;
  if (!map) return;
  if (!isOn()) { panel?.remove(); panel = null; return; }
  if (!panel) {
    panel = document.createElement("aside");
    panel.className = "rc-cata-panel";
    map.getContainer().appendChild(panel);
    panel.addEventListener("click", onPanelClick);
    panel.addEventListener("input", ev => { if (ev.target.matches("[data-cp-search]")) { list.q = ev.target.value.trim().toLowerCase(); renderList(); } });
    for (const t of ["mousedown", "wheel", "dblclick", "touchstart"]) panel.addEventListener(t, ev => ev.stopPropagation());
  }
  const gm = game.user.isGM, st = store(), L = curLevel();
  let collapsed = false;
  try { collapsed = localStorage.getItem("vtm20.cataPanel") === "1"; } catch {}
  const seg = (attr, cur, items) => `<div class="rc-cata-seg">${items.map(([k, label]) => `<a class="${cur === k ? "on" : ""}" ${attr}="${k}">${label}</a>`).join("")}</div>`;
  panel.classList.toggle("is-collapsed", collapsed);
  panel.innerHTML = `<header data-cp="collapse"><i class="fa-solid fa-skull"></i><b>Катакомбы</b><small data-cp-count></small><i class="fa-solid fa-chevron-down rc-cata-chev"></i></header>
    <div class="rc-cata-body">
      ${seg("data-cp-level", L, [["all", "Все ярусы"], ["upper", "Верхний"], ["lower", "Нижний"]])}
      <label class="rc-cata-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-cp-search value="${esc(list.q)}" placeholder="Найти зал…"></label>
      ${gm ? seg("data-cp-filter", list.filter, [["all", "Все"], ["known", "Открытые"], ["hidden", "Скрытые"]]) : ""}
      <ul class="rc-cata-list"></ul>
      ${gm && brush ? `<div class="rc-cata-brush">
        <div class="rc-cata-bmodes">${Object.entries(BRUSH_MODES).map(([k, [label, ic]]) => `<a class="${brush.mode === k ? "on" : ""}" data-cp-bmode="${k}"><i class="fa-solid ${ic}"></i><span>${label}</span></a>`).join("")}</div>
        ${brush.mode in BRUSH_VALUE ? seg("data-cp-bsize", String(brush.size ?? 1), [["1", "1 клетка"], ["2", "2×2"], ["3", "3×3"]]) : ""}
        <p class="rc-cata-bhint">${brush.mode in BRUSH_VALUE ? "Ведите по карте с зажатой кнопкой мыши. Пока кисть включена, карта не двигается." : brush.mode === "gate" ? "Щелчок по ходу: решётка → заперто → убрать." : "Щелчок по клетке — поставить ловушку."}</p>
      </div>` : ""}
      <footer>
        ${gm ? `<a class="${placing?.mode === "hall" ? "on" : ""}" data-cp="add" data-tooltip="Новый зал — щелчок по карте"><i class="fa-solid fa-circle-plus"></i> Зал</a>` : ""}
        ${gm ? `<a class="${brush ? "on" : ""}" data-cp="brush" data-tooltip="Кисть: копать, засыпать, тайные ходы, решётки, ловушки"><i class="fa-solid fa-paintbrush"></i> Кисть</a>` : ""}
        <a class="${placing?.mode === "mark" ? "on" : ""}" data-cp="mark" data-tooltip="Знак мелом"><i class="fa-solid fa-pencil"></i> Мел</a>
        <a class="${gridOn() ? "on" : ""}" data-cp="grid" data-tooltip="Сетка квадратов"><i class="fa-solid fa-border-all"></i></a>
        ${gm && st.removed.length ? `<a data-cp="restore" data-tooltip="Вернуть удалённые залы"><i class="fa-solid fa-rotate-left"></i> ${st.removed.length}</a>` : ""}
      </footer>
    </div>`;
  renderList();
}

function renderList() {
  const ul = panel?.querySelector(".rc-cata-list");
  if (!ul) return;
  const gm = game.user.isGM, L = curLevel();
  const rows = sections().filter(s => (gm || s.known)
    && (list.filter === "all" || (list.filter === "known") === s.known)
    && (L === "all" || s.level === L)
    && (!list.q || `${s.name} ${s.holder ?? ""} ${(KINDS[s.kind] ?? KINDS.quarry).label}`.toLowerCase().includes(list.q)))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  panel.querySelector("[data-cp-count]").textContent = rows.length;
  ul.innerHTML = rows.map(s => { const k = KINDS[s.kind] ?? KINDS.quarry; return `<li class="${s.known ? "" : "is-hidden"}" data-cp-fly="${s.id}" style="--c: ${k.color}">
      <i class="rc-cata-dot"></i><span><b>${esc(s.name)}</b><small>${squareOf(s.lat, s.lng)} · ${esc(k.label)} · ${esc(s.holder || "ничьё")} · ${s.level === "lower" ? "низ" : "верх"}</small></span>
      ${gm ? `<a data-cp-eye="${s.id}" data-tooltip="${s.known ? "Скрыть от игроков" : "Открыть игрокам"}"><i class="fa-solid ${s.known ? "fa-eye" : "fa-eye-slash"}"></i></a>` : ""}
    </li>`; }).join("") || `<li class="rc-cata-empty">Ничего не найдено</li>`;
}

async function onPanelClick(ev) {
  const el = ev.target.closest("[data-cp], [data-cp-level], [data-cp-filter], [data-cp-eye], [data-cp-fly], [data-cp-bmode], [data-cp-bsize]");
  if (!el) return;
  ev.preventDefault();
  const gm = game.user.isGM;
  if (el.dataset.cpEye && gm) { ev.stopPropagation(); const s = sections().find(x => x.id === el.dataset.cpEye); if (s) await save({ revealed: { ...store().revealed, [s.id]: !s.known } }); return; }
  if (el.dataset.cpLevel) { await host.setView({ cataLevel: el.dataset.cpLevel }); drawCatacombs(); return; }
  if (el.dataset.cpFilter) { list.filter = el.dataset.cpFilter; renderPanel(); return; }
  if (el.dataset.cpBmode && brush) { setBrush({ ...brush, mode: el.dataset.cpBmode }); return; }
  if (el.dataset.cpBsize && brush) { setBrush({ ...brush, size: Number(el.dataset.cpBsize) }); return; }
  if (el.dataset.cpFly) return flyTo(el.dataset.cpFly);
  const a = el.dataset.cp;
  if (a === "collapse") {
    const c = !panel.classList.contains("is-collapsed");
    panel.classList.toggle("is-collapsed", c);
    try { localStorage.setItem("vtm20.cataPanel", c ? "1" : "0"); } catch {}
  }
  if (a === "add" && gm) { setBrush(null); setPlacing(placing?.mode === "hall" ? null : { mode: "hall" }); }
  if (a === "mark") { setBrush(null); setPlacing(placing?.mode === "mark" ? null : { mode: "mark" }); }
  if (a === "brush" && gm) setBrush(brush ? null : { mode: "dig", size: 1 });
  if (a === "grid") { await host.setView({ cataGrid: !gridOn() }); drawCatacombs(); }
  if (a === "restore" && gm) {
    const n = store().removed.length;
    if (n && await foundry.applications.api.DialogV2.confirm({ window: { title: "Катакомбы" }, content: `<p>Вернуть удалённые залы (${n})?</p>` })) await save({ removed: [] });
  }
}

/** Перелететь к залу и открыть его карточку; зал на другом ярусе — переключить ярус. */
async function flyTo(id) {
  const s = sections().find(x => x.id === id), map = host?.map;
  if (!s || !map) return;
  if (curLevel() !== "all" && curLevel() !== s.level) { await host.setView({ cataLevel: s.level }); drawCatacombs(); }
  map.flyTo({ center: [s.lng, s.lat], zoom: Math.max(map.getZoom(), 15.2), duration: 900 });
  map.once("moveend", () => showCard(id, { lng: s.lng, lat: s.lat }));
}

/* ═══ Карточка зала, правка, входы ════════════════════════════════════════ */

function closePopup() { popup?.remove(); popup = null; }

function openPopup(ll, html, onClick) {
  closePopup();
  popup = new host.gl.Popup({ closeButton: true, maxWidth: "340px", className: "rc-cata-pop", offset: 6 }).setLngLat(ll).setHTML(html).addTo(host.map);
  popup.on("close", () => { popup = null; });
  popup.getElement().addEventListener("click", ev => { const a = ev.target.closest("[data-cata]"); if (a) onClick(a.dataset.cata, ev); });
}

function showCard(id, ll) {
  const s = sections().find(x => x.id === id);
  if (!s) return;
  const k = KINDS[s.kind] ?? KINDS.quarry, gm = game.user.isGM;
  const journal = s.journal ? game.journal.get(s.journal) : null, scene = s.scene ? game.scenes.get(s.scene) : null;
  const canJournal = journal?.testUserPermission(game.user, "OBSERVER"), canScene = scene && (gm || scene.testUserPermission(game.user, "OBSERVER"));
  const skulls = Array.from({ length: 5 }, (_, i) => `<i class="fa-solid fa-skull ${i < (s.danger ?? 0) ? "on" : ""}"></i>`).join("");
  openPopup(ll, `<div class="rc-cata-card" style="--c: ${k.color}">
    <small class="rc-cata-kind">${esc(k.label)} · ${esc(LEVELS[s.level])} · квадрат ${squareOf(s.lat, s.lng)}${s.known ? "" : " · скрыто от игроков"}</small>
    <h4>${esc(s.name)}</h4>${s.fr ? `<em class="rc-cata-fr">${esc(s.fr)}</em>` : ""}
    <p class="rc-cata-meta"><span><i class="fa-solid fa-crown"></i> ${esc(s.holder || "ничьё")}</span><span class="rc-cata-danger" data-tooltip="Опасность ${s.danger ?? 0} из 5">${skulls}</span></p>
    ${s.desc ? `<p class="rc-cata-desc">${esc(s.desc)}</p>` : ""}
    ${canJournal || canScene ? `<div class="rc-cata-acts is-links">
      ${canJournal ? `<a data-cata="journal"><i class="fa-solid fa-book-open"></i> ${esc(journal.name)}</a>` : ""}
      ${canScene ? `<a data-cata="scene"><i class="fa-solid fa-map"></i> ${esc(scene.name)}</a>` : ""}</div>` : ""}
    ${gm ? `<div class="rc-cata-acts">
      <a data-cata="edit"><i class="fa-solid fa-pen"></i> Изменить</a>
      <a data-cata="move"><i class="fa-solid fa-up-down-left-right"></i> Перенести</a>
      <a data-cata="door"><i class="fa-solid fa-dungeon"></i> Вход</a></div>
    <div class="rc-cata-acts">
      <a data-cata="reveal"><i class="fa-solid ${s.known ? "fa-eye-slash" : "fa-eye"}"></i> ${s.known ? "Скрыть" : "Открыть игрокам"}</a>
      ${s.edited ? `<a data-cata="reset" data-tooltip="Вернуть исходный вид встроенного зала"><i class="fa-solid fa-rotate-left"></i> Как было</a>` : ""}
      <a data-cata="del" class="is-danger"><i class="fa-solid fa-trash"></i> Удалить</a></div>` : ""}
  </div>`, async act => {
    if (act === "journal") return journal?.sheet.render(true);
    if (act === "scene") return gm ? scene?.view() : scene?.sheet?.render?.(true);
    if (!gm) return;
    const st = store();
    if (act === "edit") { closePopup(); return hallDialog(s); }
    if (act === "move") { closePopup(); return setPlacing({ mode: "move", id: s.id }); }
    if (act === "door") { closePopup(); return setPlacing({ mode: "door", id: s.id }); }
    if (act === "reveal") return save({ revealed: { ...st.revealed, [s.id]: !s.known } });
    if (act === "reset") { const edits = { ...st.edits }; delete edits[s.id]; return save({ edits }); }
    if (act === "del") {
      const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Катакомбы" },
        content: `<p>Удалить зал «${esc(s.name)}»?${s.custom ? "" : " Его можно будет вернуть кнопкой в списке залов."}</p>` });
      if (!ok) return;
      if (s.custom) await save({ custom: st.custom.filter(x => x.id !== s.id) });
      else await save({ removed: [...new Set([...st.removed, s.id])] });
    }
  });
}

/** Форма зала: новый (at — место щелчка) или правка существующего. */
async function hallDialog(s, at = null) {
  const v = s ?? { name: "", kind: "crypt", level: "", r: 240, holder: "", danger: 2, desc: "", journal: "", scene: "", known: false };
  const opt = (val, label, cur) => `<option value="${esc(val)}" ${val === cur ? "selected" : ""}>${esc(label)}</option>`;
  const byName = c => c.contents.slice().sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: s ? `Зал: ${s.name}` : "Новый зал катакомб", icon: "fa-solid fa-skull" }, classes: ["vtm20", "r-dialog"], position: { width: 460 },
    content: `<div class="r-form rc-cata-form">
      <label class="r-field"><span>Название</span><input type="text" name="name" value="${esc(v.name)}" placeholder="Склеп под мельницей" autofocus></label>
      <div class="rc-cata-form-row">
        <label class="r-field"><span>Вид</span><select name="kind">${Object.entries(KINDS).map(([k, x]) => opt(k, x.label, v.kind)).join("")}</select></label>
        <label class="r-field"><span>Ярус</span><select name="level">${opt("", "по виду", s ? v.level : "")}${Object.entries(LEVELS).map(([k, x]) => opt(k, x, s ? v.level : "")).join("")}</select></label>
      </div>
      <div class="rc-cata-form-row">
        <label class="r-field"><span>Радиус, м</span><input type="number" name="r" value="${Math.round(v.r)}" min="60" max="700" step="10"></label>
        <label class="r-field"><span>Опасность</span><select name="danger">${[1, 2, 3, 4, 5].map(n => opt(String(n), String(n), String(v.danger ?? 2))).join("")}</select></label>
      </div>
      <label class="r-field"><span>Кто держит</span><input type="text" name="holder" value="${esc(v.holder)}" placeholder="Носферату"></label>
      <label class="r-field"><span>Описание</span><textarea name="desc" rows="3">${esc(v.desc)}</textarea></label>
      <label class="r-field"><span>Запись журнала</span><select name="journal">${opt("", "—", v.journal ?? "")}${byName(game.journal).map(j => opt(j.id, j.name, v.journal ?? "")).join("")}</select></label>
      <label class="r-field"><span>Сцена</span><select name="scene">${opt("", "—", v.scene ?? "")}${byName(game.scenes).map(x => opt(x.id, x.name, v.scene ?? "")).join("")}</select></label>
      ${s ? "" : `<label class="r-check"><input type="checkbox" name="known"> Сразу открыть игрокам</label>`}
    </div>`,
    ok: { label: s ? "Сохранить" : "Добавить", icon: s ? "fa-solid fa-check" : "fa-solid fa-plus", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    rejectClose: false
  });
  if (!res) return;
  const fields = { name: String(res.name || "").trim() || "Безымянный зал", kind: KINDS[res.kind] ? res.kind : "quarry", level: LEVELS[res.level] ? res.level : "",
    r: Math.min(700, Math.max(60, Number(res.r) || 240)), holder: String(res.holder || "").trim(), danger: Number(res.danger) || 2,
    desc: String(res.desc || "").trim(), journal: res.journal || "", scene: res.scene || "" };
  if (s) return patchHall(s.id, fields);
  const id = `c${foundry.utils.randomID(10)}`, st = store();
  await save({ custom: [...st.custom, { id, custom: true, ...fields, lat: at.lat, lng: at.lng, entries: [] }], revealed: { ...st.revealed, [id]: !!res.known } });
}

async function doorDialog(id, lat, lng) {
  const s = sections().find(x => x.id === id);
  if (!s) return;
  const name = await foundry.applications.api.DialogV2.prompt({
    window: { title: `Вход в «${s.name}»`, icon: "fa-solid fa-dungeon" }, classes: ["vtm20", "r-dialog"],
    content: `<div class="r-form"><label class="r-field"><span>Подпись</span><input type="text" name="name" placeholder="Колодец во дворе" autofocus></label></div>`,
    ok: { label: "Поставить", callback: (e, b) => b.form.elements.name.value.trim() || "Вход" }, rejectClose: false
  });
  if (name) await patchHall(id, { entries: [...(s.entries ?? []), [lat, lng, name]] });
}

async function removeDoor(id, idx, name) {
  const s = sections().find(x => x.id === id);
  if (!s) return;
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Катакомбы" }, content: `<p>Убрать вход «${esc(name)}»?</p>` });
  if (ok) await patchHall(id, { entries: (s.entries ?? []).filter((_, i) => i !== idx) });
}

/* ═══ Меловые пометки ═════════════════════════════════════════════════════ */

async function markDialog(lat, lng) {
  const gm = game.user.isGM;
  const dirs = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Знак мелом", icon: "fa-solid fa-pencil" }, classes: ["vtm20", "r-dialog"],
    content: `<div class="r-form rc-cata-form">
      <div class="rc-chalk-pick">${Object.entries(CHALK).map(([k, [label, icon]], i) => `<label><input type="radio" name="icon" value="${k}" ${i ? "" : "checked"}><span><i class="fa-solid ${icon}"></i>${label}</span></label>`).join("")}</div>
      <label class="r-field"><span>Направление стрелки</span><select name="rot">${dirs.map((d, i) => `<option value="${i * 45}">${d}</option>`).join("")}</select></label>
      <label class="r-field"><span>Надпись</span><input type="text" name="text" maxlength="40" placeholder="здесь крысы"></label>
      <label class="r-check"><input type="checkbox" name="shared" ${gm ? "checked" : ""}> ${gm ? "Видно игрокам" : "Показать всем игрокам"}</label>
    </div>`,
    ok: { label: "Начертить", icon: "fa-solid fa-pencil", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object }, rejectClose: false
  });
  if (!res) return;
  const marks = foundry.utils.deepClone(game.user.getFlag(SYSTEM_ID, MARKS) ?? []);
  marks.push({ id: foundry.utils.randomID(8), lat, lng, icon: CHALK[res.icon] ? res.icon : "cross", rot: Number(res.rot) || 0, text: String(res.text || "").trim(), shared: !!res.shared });
  await game.user.setFlag(SYSTEM_ID, MARKS, marks);
}

function markCard(p, ll) {
  const author = game.users.get(p.uid), mine = p.uid === game.user.id, can = mine || game.user.isGM;
  openPopup(ll, `<div class="rc-cata-card is-chalk">
    <small class="rc-cata-kind">Знак мелом · ${esc(author?.name ?? "?")}</small>
    ${p.text ? `<p class="rc-cata-desc">«${esc(p.text)}»</p>` : ""}
    ${can ? `<div class="rc-cata-acts"><a data-cata="del" class="is-danger"><i class="fa-solid fa-eraser"></i> Стереть</a></div>` : ""}
  </div>`, async act => {
    if (act !== "del" || !can || !author) return;
    closePopup();
    await author.setFlag(SYSTEM_ID, MARKS, (author.getFlag(SYSTEM_ID, MARKS) ?? []).filter(m => m.id !== p.id));
  });
}

/* ═══ Тайные ходы и ловушки ═══════════════════════════════════════════════ */

function secretCard(i, j, ll) {
  const cells = store().cells ?? {}, group = secretGroup(cells, i, j), shown = cells[`${i},${j}`] === SECRET_SHOWN;
  openPopup(ll, `<div class="rc-cata-card is-secret" style="--c: #c9a0e0">
    <small class="rc-cata-kind">Тайный ход · ${group.length} кл. · квадрат ${squareOf(ll.lat, ll.lng)}${shown ? "" : " · скрыт от игроков"}</small>
    <p class="rc-cata-desc">${shown ? "Игроки видят этот ход как обычный." : "Игроки его не видят, пока вы не откроете."}</p>
    <div class="rc-cata-acts"><a data-cata="toggle"><i class="fa-solid ${shown ? "fa-eye-slash" : "fa-eye"}"></i> ${shown ? "Скрыть" : "Открыть игрокам"}</a>
      <a data-cata="fill" class="is-danger"><i class="fa-solid fa-fill"></i> Засыпать</a></div>
  </div>`, async act => {
    const next = { ...(store().cells ?? {}) };
    for (const k of group) { if (act === "toggle") next[k] = shown ? SECRET : SECRET_SHOWN; if (act === "fill") delete next[k]; }
    closePopup();
    await save({ cells: next });
  });
}

async function trapDialog(i, j) {
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: `Ловушка · ${SQ_LETTERS[Math.floor(i / SQUARE)] ?? "?"}${Math.floor(j / SQUARE) + 1}`, icon: "fa-solid fa-triangle-exclamation" }, classes: ["vtm20", "r-dialog"],
    content: `<div class="r-form rc-cata-form">
      <label class="r-field"><span>Название</span><input type="text" name="name" placeholder="Провал в колодец" autofocus></label>
      <label class="r-field"><span>Заметка мастера</span><textarea name="note" rows="2" placeholder="Ловкость + Атлетика, сл. 7, иначе 3 кубика урона"></textarea></label>
      <label class="r-check"><input type="checkbox" name="known"> Игроки о ней знают</label>
    </div>`,
    ok: { label: "Поставить", icon: "fa-solid fa-triangle-exclamation", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object }, rejectClose: false
  });
  if (!res) return;
  const traps = [...(store().traps ?? []), { id: foundry.utils.randomID(8), i, j, name: String(res.name || "").trim() || "Ловушка", note: String(res.note || "").trim(), known: !!res.known }];
  await save({ traps });
}

function trapCard(id, ll) {
  const tr = (store().traps ?? []).find(x => x.id === id), gm = game.user.isGM;
  if (!tr) return;
  openPopup(ll, `<div class="rc-cata-card" style="--c: #c4474c">
    <small class="rc-cata-kind">Ловушка${tr.known ? "" : " · игроки не знают"}</small>
    <h4>${esc(tr.name)}</h4>
    ${gm && tr.note ? `<p class="rc-cata-desc">${esc(tr.note)}</p>` : ""}
    ${gm ? `<div class="rc-cata-acts"><a data-cata="known"><i class="fa-solid ${tr.known ? "fa-eye-slash" : "fa-eye"}"></i> ${tr.known ? "Скрыть" : "Показать игрокам"}</a>
      <a data-cata="del" class="is-danger"><i class="fa-solid fa-trash"></i> Убрать</a></div>` : ""}
  </div>`, async act => {
    if (!gm) return;
    const traps = store().traps ?? [];
    closePopup();
    if (act === "known") await save({ traps: traps.map(x => x.id === id ? { ...x, known: !x.known } : x) });
    if (act === "del") await save({ traps: traps.filter(x => x.id !== id) });
  });
}
