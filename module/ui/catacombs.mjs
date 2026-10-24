// module/ui/catacombs.mjs
// Катакомбы на карте города: подземный Париж по Миру Тьмы — участки (module/data/catacombs-paris.mjs)
// и извилистые ходы между ними. Форма участков, ходы, обвалы и затопления строятся из id детерминированно,
// поэтому у всех одинаковы и не хранятся в мире.
//   · рассказчик видит всё; игроки — только открытые им участки и ходы между ними;
//   · рассказчик добавляет свои участки щелчком по карте, удаляет любые и может вернуть удалённые.
// Карта (module/ui/citymap.mjs) отдаёт сюда свой объект через attachCatacombs и зовёт слои при каждой смене стиля.

import { SYSTEM_ID } from "../config.mjs";
import { CATACOMB_KINDS as KINDS, CATACOMB_SECTIONS as BASE } from "../data/catacombs-paris.mjs";

const SETTING = "catacombs";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const EMPTY = { type: "FeatureCollection", features: [] };
const SIZES = { small: 140, medium: 240, large: 380 };

let host = null;      // { map, gl, view, setView, city, drawTools, zoomed }
let placing = false;  // рассказчик ставит новый участок следующим щелчком
let popup = null;

/* ═══ Состояние ═══════════════════════════════════════════════════════════ */

export function registerCatacombs() {
  game.settings.register(SYSTEM_ID, SETTING, { scope: "world", config: false, type: Object, default: {}, onChange: () => { closePopup(); drawCatacombs(); host?.drawTools(); } });
}

export function attachCatacombs(api) { host = api; }

/** Карта, к которой подключены катакомбы (для автотестов и отладки). */
export const catacombsMap = () => host?.map ?? null;

/** { custom: [участки рассказчика], removed: [id удалённых], revealed: { id: открыт игрокам } } */
const store = () => ({ custom: [], removed: [], revealed: {}, ...(game.settings.get(SYSTEM_ID, SETTING) ?? {}) });
const save = patch => game.settings.set(SYSTEM_ID, SETTING, { ...store(), ...patch });

/** Катакомбы есть только у Парижа. */
export const catacombsHere = () => /paris/i.test(host?.city()?.preset ?? "");
const isOn = () => catacombsHere() && !!host.view().catacombs;

function sections() {
  const s = store(), removed = new Set(s.removed);
  return [...BASE.filter(x => !removed.has(x.id)), ...s.custom].map(x => ({ ...x, known: s.revealed[x.id] ?? !!x.known }));
}

/* ═══ Геометрия: всё из id, без случайности между клиентами ═══════════════ */
// Вид — план подземелья: прямые коридоры с поворотами под прямым углом, залы — сетка галерей вокруг
// каменных столбов (как в настоящих каменоломнях), в залах — комнаты-склепы.

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
/** Точка в метрах от центра участка → [lng, lat]. */
const toLL = (o, x, y) => [o.lng + x / kx(o.lat), o.lat + y / M];
const meters = (a, b) => Math.hypot((b.lng - a.lng) * kx(a.lat), (b.lat - a.lat) * M);
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

const geoCache = new Map();

/** Форма зала: радиус по направлению (окружность, искажённая гармониками) и наклон сетки. */
function shapeOf(s) {
  const r = rng(`blob:${s.id}`), harm = [2, 3, 5].map(k => ({ k, a: .04 + r() * .1, p: r() * Math.PI * 2 }));
  const radius = t => s.r * (1 + harm.reduce((sum, h) => sum + h.a * Math.sin(h.k * t + h.p), 0));
  return { radius, angle: (r() - .5) * 1.1, inside: (x, y) => Math.hypot(x, y) < radius(Math.atan2(y, x)) };
}

/** Зал: контур (для щелчка), галереи сеткой вокруг столбов, комнаты. Кэш по id, месту и размеру. */
function hall(s) {
  const key = `${s.id}|${s.r}|${s.lat}|${s.lng}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const sh = shapeOf(s), r = rng(`hall:${s.id}`), step = Math.min(90, Math.max(34, s.r / 3.6));
  const world = ([x, y]) => toLL(s, ...rot(x, y, sh.angle));
  const outline = Array.from({ length: 41 }, (_, i) => { const t = i / 40 * Math.PI * 2, d = sh.radius(t); return toLL(s, Math.cos(t) * d, Math.sin(t) * d); });
  const lines = [], n = Math.ceil(s.r * 1.3 / step);
  for (const dir of [0, 1]) for (let i = -n; i <= n; i++) {
    // линия сетки (в повёрнутых осях зала) режется формой зала на куски от узла до узла; часть кусков завалена
    let run = [];
    const flush = () => { if (run.length > 1 && r() > .14) lines.push(run.map(world)); run = []; };
    for (let j = -n * 6; j <= n * 6; j++) {
      const t = j * step / 6, p = dir ? [i * step, t] : [t, i * step];
      if (!sh.inside(...rot(p[0], p[1], sh.angle))) { flush(); continue; }
      run.push(p);
      if (j % 6 === 0 && run.length > 1) { flush(); run = [p]; }
    }
    flush();
  }
  // комнаты-склепы: прямоугольники на узлах сетки
  const rooms = [];
  for (let k = 1 + Math.floor(r() * 3); k > 0; k--) {
    const gx = Math.round((r() - .5) * n) * step, gy = Math.round((r() - .5) * n) * step;
    if (!sh.inside(...rot(gx, gy, sh.angle))) continue;
    const w = step * (.9 + r() * .7) / 2, h = step * (.6 + r() * .4) / 2;
    rooms.push([[-w, -h], [w, -h], [w, h], [-w, h], [-w, -h]].map(([x, y]) => world([gx + x, gy + y])));
  }
  const g = { outline, lines, rooms };
  geoCache.set(key, g);
  return g;
}

/** Остов сети: минимальное дерево по расстоянию плюс петли к второму соседу, если он недалеко. */
function edges(list) {
  if (list.length < 2) return [];
  const key = (a, b) => [a.id, b.id].sort().join("|");
  const done = new Set([list[0].id]), out = new Map();
  while (done.size < list.length) {
    let best = null;
    for (const a of list) if (done.has(a.id)) for (const b of list) if (!done.has(b.id)) {
      const d = meters(a, b);
      if (!best || d < best.d) best = { a, b, d };
    }
    done.add(best.b.id); out.set(key(best.a, best.b), [best.a, best.b]);
  }
  for (const a of list) {
    const near = list.filter(b => b !== a).map(b => ({ b, d: meters(a, b) })).sort((x, y) => x.d - y.d);
    const second = near[1];
    if (second && second.d < 1900 && !out.has(key(a, second.b))) out.set(key(a, second.b), [a, second.b]);
  }
  return [...out.values()];
}

/** Ход между залами: ступенями под прямым углом в повёрнутых осях, тупиковые ответвления с комнатами. */
function tunnel(a, b) {
  const r = rng(`tun:${[a.id, b.id].sort().join("|")}`), ang = (r() - .5) * .9;
  const [dx, dy] = rot((b.lng - a.lng) * kx(a.lat), (b.lat - a.lat) * M, -ang);
  // 2–3 ступени: шаг по x, затем по y; доли случайные
  const n = 2 + Math.floor(r() * 2), parts = Array.from({ length: n }, () => .5 + r()), sum = parts.reduce((x, y) => x + y, 0);
  const pts = [[0, 0]];
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    x += dx * parts[i] / sum; pts.push([x, y]);
    y += dy * parts[i] / sum; pts.push([x, y]);
  }
  const ll = ([px, py]) => toLL(a, ...rot(px, py, ang));
  const flood = a.kind === "flooded" || b.kind === "flooded";
  const roll = r(), type = roll < .13 ? "collapsed" : roll < (flood ? .6 : .2) ? "flooded" : "open";
  const spurs = [], rooms = [];
  for (let k = r() < .7 ? 1 + Math.floor(r() * 2) : 0; k > 0; k--) {
    // ответвление под прямым углом от середины одного из отрезков
    const i = 1 + Math.floor(r() * (pts.length - 1)), [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    if (Math.hypot(x2 - x1, y2 - y1) < 60) continue;
    const f = .25 + r() * .5, sx = x1 + (x2 - x1) * f, sy = y1 + (y2 - y1) * f;
    const horiz = Math.abs(x2 - x1) > Math.abs(y2 - y1), len = (50 + r() * 90) * (r() < .5 ? -1 : 1);
    const end = horiz ? [sx, sy + len] : [sx + len, sy];
    spurs.push([ll([sx, sy]), ll(end)]);
    if (r() < .55) { const w = 16 + r() * 14; rooms.push([[-w, -w * .7], [w, -w * .7], [w, w * .7], [-w, w * .7], [-w, -w * .7]].map(([ox, oy]) => ll([end[0] + ox, end[1] + oy]))); }
  }
  return { line: pts.map(ll), type, spurs, rooms };
}

/* ═══ Слои карты ═══════════════════════════════════════════════════════════ */

/** Ширина коридора в пикселях: растёт с приближением, как настоящий ход. */
const corridor = (k = 1, plus = 0) => ["interpolate", ["exponential", 1.6], ["zoom"], 12, 2 * k + plus, 14, 4.5 * k + plus, 15, 6 * k + plus, 17, 12 * k + plus, 19, 28 * k + plus];
const FLOOR = "#140d08", WALL = "#dcc79c";

/** Источники и слои; карта зовёт при каждой загрузке стиля (смена «план / ночь» стирает слои). */
export function addCatacombLayers() {
  const map = host?.map;
  if (!map) return;
  surfaceKeep.delete(map);   // новый стиль — прежние значения притушенных слоёв больше не нужны
  const world = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } }] };
  for (const src of ["rc-cata-dim", "rc-cata-area", "rc-cata-glow", "rc-cata-ways", "rc-cata-rooms", "rc-cata-label", "rc-cata-door"])
    if (!map.getSource(src)) map.addSource(src, { type: "geojson", data: src === "rc-cata-dim" ? world : EMPTY });
  const paper = host.view().style === "plan", vis = isOn() ? "visible" : "none";
  const known = (yes, no) => ["case", ["get", "known"], yes, no];
  const add = l => { if (!map.getLayer(l.id)) map.addLayer({ ...l, layout: { ...(l.layout ?? {}), visibility: vis } }); };
  const join = { "line-cap": "square", "line-join": "miter", "line-miter-limit": 4 };
  const wallColor = ["match", ["get", "type"], "flooded", "#86cdd0", "collapsed", "#8c7a5a", ["coalesce", ["get", "wall"], WALL]];
  // Город над головой уходит в густую тень. Слой тени виден всегда, меняется только прозрачность — так затемнение плавное
  if (!map.getLayer("rc-cata-dim")) map.addLayer({ id: "rc-cata-dim", type: "fill", source: "rc-cata-dim",
    paint: { "fill-color": paper ? "#0c0703" : "#020104", "fill-opacity": 0, "fill-opacity-transition": { duration: 700, delay: 0 } } });
  // свечение зала цветом хозяина: радиус — размер зала в метрах, переведённый в пиксели (Париж: 103 040 м на пиксель при z0)
  const px = k => ["*", ["get", "r"], k / 103040];
  add({ id: "rc-cata-glow", type: "circle", source: "rc-cata-glow",
    paint: { "circle-color": ["get", "color"], "circle-blur": 1, "circle-opacity": known(.62, .22), "circle-pitch-alignment": "map",
      "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 10, px(1024 * 1.8), 20, px(1048576 * 1.8)] } });
  // невидимая площадь зала — для щелчка
  add({ id: "rc-cata-area-fill", type: "fill", source: "rc-cata-area", paint: { "fill-color": "#000", "fill-opacity": .01 } });
  // коридоры: тень породы → стены → пол поверх (на перекрёстках пол закрывает стены, стыки чистые)
  add({ id: "rc-cata-rock", type: "line", source: "rc-cata-ways", layout: join,
    paint: { "line-color": "#000", "line-opacity": .75, "line-width": corridor(2.6), "line-blur": corridor(1) } });
  add({ id: "rc-cata-room-wall", type: "line", source: "rc-cata-rooms", layout: join,
    paint: { "line-color": ["coalesce", ["get", "wall"], WALL], "line-opacity": known(1, .45), "line-width": corridor(.3, 1.6) } });
  add({ id: "rc-cata-wall", type: "line", source: "rc-cata-ways", filter: ["!=", ["get", "type"], "collapsed"], layout: join,
    paint: { "line-color": wallColor, "line-opacity": known(1, .45), "line-width": corridor(1.3, 1.6) } });
  add({ id: "rc-cata-wall-x", type: "line", source: "rc-cata-ways", filter: ["==", ["get", "type"], "collapsed"],
    paint: { "line-color": wallColor, "line-opacity": known(.9, .4), "line-width": corridor(1.3, 1.6), "line-dasharray": [.6, .9] } });
  add({ id: "rc-cata-room", type: "fill", source: "rc-cata-rooms", paint: { "fill-color": FLOOR, "fill-opacity": known(1, .55) } });
  add({ id: "rc-cata-floor", type: "line", source: "rc-cata-ways", layout: join,
    paint: { "line-color": ["match", ["get", "type"], "flooded", "#12383c", "collapsed", "#241a11", FLOOR], "line-opacity": known(1, .6), "line-width": corridor(1) } });
  // входы: колодец — кольцо стены и тёмная шахта
  add({ id: "rc-cata-door", type: "circle", source: "rc-cata-door", minzoom: 12.5,
    paint: { "circle-radius": corridor(1.4), "circle-color": "#050302", "circle-stroke-color": WALL, "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12.5, 1, 17, 2.5],
      "circle-opacity": known(1, .5), "circle-stroke-opacity": known(1, .5) } });
  add({ id: "rc-cata-door-label", type: "symbol", source: "rc-cata-door", minzoom: 15,
    layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Italic"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top", "text-optional": true },
    paint: { "text-color": "#e8d7b0", "text-halo-color": "rgba(5,3,2,.95)", "text-halo-width": 1.8, "text-opacity": known(1, .55) } });
  // подписи поверх подписей города; издали — только крупные залы, чтобы центр не слипался
  add({ id: "rc-cata-label", type: "symbol", source: "rc-cata-label", minzoom: 12, filter: ["any", [">=", ["zoom"], 13.4], [">=", ["get", "r"], 240]],
    layout: { "text-field": ["step", ["zoom"], ["upcase", ["get", "name"]], 14.2,
        ["format", ["upcase", ["get", "name"]], {}, "\n", {}, ["get", "sub"], { "font-scale": .8, "text-font": ["literal", ["Noto Sans Italic"]] }]],
      "text-font": ["Noto Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 14.5], "text-letter-spacing": .16, "text-max-width": 9,
      "text-line-height": 1.25, "text-padding": 4, "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": ["get", "ink"], "text-halo-color": "rgba(3,2,1,.92)", "text-halo-width": 2.4, "text-halo-blur": .6, "text-opacity": known(1, .55) } });
  drawCatacombs();
}

/** Данные слоёв: что видит этот пользователь. */
export function drawCatacombs() {
  const map = host?.map;
  if (!map?.getSource("rc-cata-area")) return;
  const on = isOn(), vis = on ? "visible" : "none";
  for (const l of map.getStyle()?.layers ?? []) if (l.id.startsWith("rc-cata-") && l.id !== "rc-cata-dim") map.setLayoutProperty(l.id, "visibility", vis);
  map.setPaintProperty("rc-cata-dim", "fill-opacity", on ? (host.view().style === "plan" ? .84 : .86) : 0);
  // метки и фишки — HTML поверх карты, слой тени их не накрывает: притушить стилями (styles/r-catacombs.css)
  map.getContainer().closest("#r-citymap")?.classList.toggle("is-underground", on);
  dimSurface(map, on);
  if (!on) return;
  const gm = game.user.isGM, all = sections(), shown = all.filter(s => gm || s.known);
  const feat = (geometry, properties) => ({ type: "Feature", geometry, properties });
  const fc = features => ({ type: "FeatureCollection", features });
  const line = (coords, p) => feat({ type: "LineString", coordinates: coords }, p);
  const kind = s => KINDS[s.kind] ?? KINDS.quarry;
  // стены зала — цвет его вида, высветленный к кости
  const tint = s => mix(kind(s).color, WALL, .45);
  const halls = shown.map(s => ({ s, g: hall(s) }));
  map.getSource("rc-cata-area").setData(fc(halls.map(({ s, g }) => feat({ type: "Polygon", coordinates: [g.outline] }, { id: s.id }))));
  map.getSource("rc-cata-glow").setData(fc(shown.map(s => feat({ type: "Point", coordinates: [s.lng, s.lat] }, { color: kind(s).color, r: s.r, known: s.known }))));
  // сеть строится по всем участкам, а не по видимым: у игроков та же сеть, только часть её
  const tun = edges(all).filter(([a, b]) => gm || (a.known && b.known)).map(([a, b]) => ({ ...tunnel(a, b), known: a.known && b.known }));
  map.getSource("rc-cata-ways").setData(fc([
    ...tun.flatMap(t => [line(t.line, { type: t.type, known: t.known }), ...t.spurs.map(l => line(l, { type: t.type === "collapsed" ? "open" : t.type, known: t.known }))]),
    ...halls.flatMap(({ s, g }) => g.lines.map(l => line(l, { type: s.kind === "flooded" ? "flooded" : "open", wall: tint(s), known: s.known })))
  ]));
  map.getSource("rc-cata-rooms").setData(fc([
    ...halls.flatMap(({ s, g }) => g.rooms.map(rm => feat({ type: "Polygon", coordinates: [rm] }, { wall: tint(s), known: s.known }))),
    ...tun.flatMap(t => t.rooms.map(rm => feat({ type: "Polygon", coordinates: [rm] }, { known: t.known })))
  ]));
  map.getSource("rc-cata-label").setData(fc(shown.map(s => feat({ type: "Point", coordinates: [s.lng, s.lat] },
    { name: s.name, sub: `${kind(s).label} · ${s.holder || "ничьё"}`, ink: mix(kind(s).color, "#f6ead0", .6), r: s.r, known: s.known }))));
  map.getSource("rc-cata-door").setData(fc(shown.flatMap(s => (s.entries ?? []).map(([lat, lng, name]) => feat({ type: "Point", coordinates: [lng, lat] }, { name, known: s.known })))));
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

/* ═══ Кнопки панели и действия ═════════════════════════════════════════════ */

export function catacombsButtons() {
  if (!catacombsHere()) return "";
  const on = isOn(), gm = game.user.isGM, removed = store().removed.length;
  return `<a class="${on ? "on" : ""}" data-act="catacombs" data-tooltip="Катакомбы: подземный Париж"><i class="fa-solid fa-skull"></i></a>`
    + (on && gm ? `<a class="${placing ? "on" : ""}" data-act="cataAdd" data-tooltip="Новый участок катакомб — щёлкните по карте"><i class="fa-solid fa-circle-plus"></i></a>` : "")
    + (on && gm && removed ? `<a data-act="cataRestore" data-tooltip="Вернуть удалённые участки катакомб (${removed})"><i class="fa-solid fa-rotate-left"></i></a>` : "");
}

export async function catacombsAct(act) {
  if (act === "catacombs") {
    await host.setView({ catacombs: !host.view().catacombs });
    if (!isOn()) { setPlacing(false); closePopup(); }
    drawCatacombs(); host.drawTools();
  } else if (act === "cataAdd") {
    setPlacing(!placing); host.drawTools();
    if (placing) ui.notifications.info("Щёлкните по карте там, где будет новый участок катакомб.");
  } else if (act === "cataRestore") {
    const n = store().removed.length;
    if (n && await foundry.applications.api.DialogV2.confirm({ window: { title: "Катакомбы" }, content: `<p>Вернуть удалённые участки (${n})?</p>` })) await save({ removed: [] });
  }
}

function setPlacing(v) {
  placing = v;
  const c = host?.map?.getCanvas();
  if (c) c.style.cursor = v ? "crosshair" : "";
}

/** Щелчок по карте в режиме «новый участок». true — щелчок забран. */
export function catacombsPlace(ev) {
  if (!placing || !game.user.isGM) return false;
  setPlacing(false); host.drawTools();
  addDialog(ev.lngLat.lat, ev.lngLat.lng);
  return true;
}

/** Щелчок по участку — карточка. true — щелчок забран. */
export function catacombsPick(ev) {
  if (!isOn() || !host.map.getLayer("rc-cata-area-fill")) return false;
  const hit = host.map.queryRenderedFeatures(ev.point, { layers: ["rc-cata-area-fill"] })[0];
  if (!hit) return false;
  showCard(hit.properties.id, ev.lngLat);
  return true;
}

/* ═══ Карточка участка и форма нового ══════════════════════════════════════ */

function closePopup() { popup?.remove(); popup = null; }

function showCard(id, ll) {
  const s = sections().find(x => x.id === id);
  if (!s) return;
  closePopup();
  const k = KINDS[s.kind] ?? KINDS.quarry, gm = game.user.isGM;
  const skulls = Array.from({ length: 5 }, (_, i) => `<i class="fa-solid fa-skull ${i < (s.danger ?? 0) ? "on" : ""}"></i>`).join("");
  const html = `<div class="rc-cata-card" style="--c: ${k.color}">
    <small class="rc-cata-kind">${esc(k.label)}${s.known ? "" : " · скрыто от игроков"}</small>
    <h4>${esc(s.name)}</h4>${s.fr ? `<em class="rc-cata-fr">${esc(s.fr)}</em>` : ""}
    <p class="rc-cata-meta"><span><i class="fa-solid fa-crown"></i> ${esc(s.holder || "ничьё")}</span><span class="rc-cata-danger" data-tooltip="Опасность ${s.danger ?? 0} из 5">${skulls}</span></p>
    ${s.desc ? `<p class="rc-cata-desc">${esc(s.desc)}</p>` : ""}
    ${gm ? `<div class="rc-cata-acts">
      <a data-cata="reveal"><i class="fa-solid ${s.known ? "fa-eye-slash" : "fa-eye"}"></i> ${s.known ? "Скрыть от игроков" : "Открыть игрокам"}</a>
      <a data-cata="del" class="is-danger"><i class="fa-solid fa-trash"></i> Удалить</a></div>` : ""}
  </div>`;
  popup = new host.gl.Popup({ closeButton: true, maxWidth: "330px", className: "rc-cata-pop", offset: 6 }).setLngLat(ll).setHTML(html).addTo(host.map);
  popup.on("close", () => { popup = null; });
  popup.getElement().addEventListener("click", async ev => {
    const a = ev.target.closest("[data-cata]");
    if (!a || !gm) return;
    const st = store();
    if (a.dataset.cata === "reveal") await save({ revealed: { ...st.revealed, [s.id]: !s.known } });
    if (a.dataset.cata === "del") {
      const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Катакомбы" },
        content: `<p>Удалить участок «${esc(s.name)}»?${s.custom ? "" : " Его можно будет вернуть кнопкой на панели."}</p>` });
      if (!ok) return;
      if (s.custom) await save({ custom: st.custom.filter(x => x.id !== s.id) });
      else await save({ removed: [...new Set([...st.removed, s.id])] });
    }
  });
}

async function addDialog(lat, lng) {
  const kinds = Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join("");
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Новый участок катакомб", icon: "fa-solid fa-skull" }, classes: ["vtm20", "r-dialog"],
    content: `<div class="r-form rc-cata-form">
      <label class="r-field"><span>Название</span><input type="text" name="name" placeholder="Склеп под мельницей" autofocus></label>
      <label class="r-field"><span>Вид</span><select name="kind">${kinds}</select></label>
      <label class="r-field"><span>Размер</span><select name="size"><option value="small">малый</option><option value="medium" selected>средний</option><option value="large">большой</option></select></label>
      <label class="r-field"><span>Кто держит</span><input type="text" name="holder" placeholder="Носферату"></label>
      <label class="r-field"><span>Опасность</span><select name="danger">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === 2 ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="r-field"><span>Описание</span><textarea name="desc" rows="3"></textarea></label>
      <label class="r-check"><input type="checkbox" name="known"> Сразу открыть игрокам</label>
    </div>`,
    ok: { label: "Добавить", icon: "fa-solid fa-plus", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    rejectClose: false
  });
  if (!res) return;
  const id = `c${foundry.utils.randomID(10)}`, st = store();
  const s = { id, custom: true, name: String(res.name || "").trim() || "Безымянный участок", kind: KINDS[res.kind] ? res.kind : "quarry",
    lat, lng, r: SIZES[res.size] ?? SIZES.medium, holder: String(res.holder || "").trim(), danger: Number(res.danger) || 2,
    desc: String(res.desc || "").trim(), entries: [] };
  await save({ custom: [...st.custom, s], revealed: { ...st.revealed, [id]: !!res.known } });
}
