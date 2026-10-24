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
const LAYERS = ["rc-cata-dim", "rc-cata-area-fill", "rc-cata-tun-case", "rc-cata-gal", "rc-cata-tun", "rc-cata-tun-x",
  "rc-cata-area-line", "rc-cata-door", "rc-cata-door-label", "rc-cata-label"];

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
/** Сдвиг точки на dx, dy метров → [lng, lat]. */
const shift = (lat, lng, dx, dy) => [lng + dx / (M * Math.cos(lat * Math.PI / 180)), lat + dy / M];
const meters = (a, b) => Math.hypot((b.lng - a.lng) * M * Math.cos(a.lat * Math.PI / 180), (b.lat - a.lat) * M);

/** Неровный контур участка: окружность, искажённая несколькими гармониками. */
function blob(s) {
  const r = rng(`blob:${s.id}`), harm = [2, 3, 5].map(k => ({ k, a: .05 + r() * .12, p: r() * Math.PI * 2 }));
  const ring = Array.from({ length: 40 }, (_, i) => {
    const t = i / 40 * Math.PI * 2;
    const k = 1 + harm.reduce((sum, h) => sum + h.a * Math.sin(h.k * t + h.p), 0) + (r() - .5) * .06;
    return shift(s.lat, s.lng, Math.cos(t) * s.r * k, Math.sin(t) * s.r * k);
  });
  return [...ring, ring[0]];
}

/** Галереи внутри участка: блуждание от центра, у края поворачивает назад. */
function galleries(s) {
  const r = rng(`gal:${s.id}`), n = 4 + Math.floor(r() * 4), out = [];
  for (let g = 0; g < n; g++) {
    let x = 0, y = 0, a = r() * Math.PI * 2;
    const line = [shift(s.lat, s.lng, 0, 0)], steps = 5 + Math.floor(r() * 4), step = s.r * (.16 + r() * .08);
    for (let i = 0; i < steps; i++) {
      a += (r() - .5) * 1.2;
      if (Math.hypot(x, y) > s.r * .75) a = Math.atan2(-y, -x) + (r() - .5) * .8;
      x += Math.cos(a) * step; y += Math.sin(a) * step;
      line.push(shift(s.lat, s.lng, x, y));
    }
    out.push(line);
  }
  return out;
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

/** Извилистый ход между участками (смещение середины) и тупиковые ответвления. */
function tunnel(a, b) {
  const r = rng(`tun:${[a.id, b.id].sort().join("|")}`);
  const lat0 = a.lat, lng0 = a.lng, kx = M * Math.cos(lat0 * Math.PI / 180);
  const toXY = p => [(p.lng - lng0) * kx, (p.lat - lat0) * M];
  let pts = [toXY(a), toXY(b)];
  for (let depth = 0, amp = .22; depth < 6; depth++, amp *= .55) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1], [x2, y2] = pts[i], len = Math.hypot(x2 - x1, y2 - y1), off = (r() - .5) * 2 * amp * len;
      next.push([(x1 + x2) / 2 - (y2 - y1) / len * off, (y1 + y2) / 2 + (x2 - x1) / len * off], pts[i]);
    }
    pts = next;
  }
  const ll = ([x, y]) => [lng0 + x / kx, lat0 + y / M];
  const flood = a.kind === "flooded" || b.kind === "flooded";
  const roll = r(), type = roll < .13 ? "collapsed" : roll < (flood ? .6 : .23) ? "flooded" : "open";
  const spurs = [];
  for (let n = 1 + Math.floor(r() * 3); n > 0; n--) {
    let [x, y] = pts[4 + Math.floor(r() * (pts.length - 8))], ang = r() * Math.PI * 2;
    const spur = [ll([x, y])];
    for (let i = 3 + Math.floor(r() * 3); i > 0; i--) { ang += (r() - .5) * 1.1; const st = 50 + r() * 70; x += Math.cos(ang) * st; y += Math.sin(ang) * st; spur.push(ll([x, y])); }
    spurs.push(spur);
  }
  return { line: pts.map(ll), type, spurs };
}

/* ═══ Слои карты ═══════════════════════════════════════════════════════════ */

/** Источники и слои; карта зовёт при каждой загрузке стиля (смена «план / ночь» стирает слои). */
export function addCatacombLayers() {
  const map = host?.map;
  if (!map) return;
  surfaceKeep.delete(map);   // новый стиль — прежние значения притушенных слоёв больше не нужны
  for (const src of ["rc-cata-dim", "rc-cata-area", "rc-cata-tun", "rc-cata-gal", "rc-cata-label", "rc-cata-door"])
    if (!map.getSource(src)) map.addSource(src, { type: "geojson", data: EMPTY });
  const paper = host.view().style === "plan", z = host.zoomed, vis = isOn() ? "visible" : "none";
  const known = (yes, no) => ["case", ["get", "known"], yes, no];
  const add = l => { if (!map.getLayer(l.id)) map.addLayer({ ...l, layout: { ...(l.layout ?? {}), visibility: vis } }); };
  // Город над головой уходит в тень — мы под землёй; дальше всё светится одинаково в любом стиле карты
  add({ id: "rc-cata-dim", type: "fill", source: "rc-cata-dim", paint: { "fill-color": paper ? "#140b04" : "#04020a", "fill-opacity": paper ? .66 : .6 } });
  add({ id: "rc-cata-area-fill", type: "fill", source: "rc-cata-area", paint: { "fill-color": ["get", "color"], "fill-opacity": known(.3, .13) } });
  const round = { "line-cap": "round", "line-join": "round" };
  add({ id: "rc-cata-tun-case", type: "line", source: "rc-cata-tun", layout: round,
    paint: { "line-color": "#000", "line-opacity": .85, "line-width": z(12, 3, 15, 7, 18, 15) } });
  add({ id: "rc-cata-gal", type: "line", source: "rc-cata-gal", layout: round,
    paint: { "line-color": ["get", "color"], "line-opacity": known(.85, .45), "line-width": z(12, .8, 15, 1.8, 18, 3.5) } });
  add({ id: "rc-cata-tun", type: "line", source: "rc-cata-tun", filter: ["!=", ["get", "type"], "collapsed"], layout: round,
    paint: { "line-color": ["match", ["get", "type"], "flooded", "#56b4ba", "#e2d0a5"],
      "line-opacity": known(.95, .45), "line-width": z(12, 1.1, 15, 2.6, 18, 5.5) } });
  add({ id: "rc-cata-tun-x", type: "line", source: "rc-cata-tun", filter: ["==", ["get", "type"], "collapsed"],
    paint: { "line-color": "#9a8662", "line-opacity": known(.9, .4), "line-width": z(12, 1.1, 15, 2.6, 18, 5.5), "line-dasharray": [1, 1.8] } });
  add({ id: "rc-cata-area-line", type: "line", source: "rc-cata-area", layout: { "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-opacity": known(.95, .5), "line-width": z(12, 1.2, 16, 2.6), "line-dasharray": [3, 1.6] } });
  add({ id: "rc-cata-door", type: "circle", source: "rc-cata-door", minzoom: 12.5,
    paint: { "circle-radius": z(12.5, 2.5, 16, 6.5), "circle-color": "#120c08", "circle-stroke-color": "#e8d7b0",
      "circle-stroke-width": 1.6, "circle-opacity": known(1, .5), "circle-stroke-opacity": known(1, .5) } });
  add({ id: "rc-cata-door-label", type: "symbol", source: "rc-cata-door", minzoom: 15,
    layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Italic"], "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true },
    paint: { "text-color": "#e8d7b0", "text-halo-color": "rgba(8,5,3,.95)", "text-halo-width": 1.8 } });
  add({ id: "rc-cata-label", type: "symbol", source: "rc-cata-label", minzoom: 12.2,
    layout: { "text-field": ["format", ["upcase", ["get", "name"]], {}, "\n", {}, ["get", "sub"], { "font-scale": .78, "text-font": ["literal", ["Noto Sans Italic"]] }],
      "text-font": ["Noto Sans Bold"], "text-size": z(12, 10.5, 16, 15), "text-letter-spacing": .1, "text-max-width": 11, "text-line-height": 1.2, "text-padding": 6,
      "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": "#f3e4c2", "text-halo-color": "rgba(8,5,3,.96)", "text-halo-width": 2.2,
      "text-opacity": known(1, .6) } });
  drawCatacombs();
}

/** Данные слоёв: что видит этот пользователь. */
export function drawCatacombs() {
  const map = host?.map;
  if (!map?.getSource("rc-cata-area")) return;
  const vis = isOn() ? "visible" : "none";
  for (const l of LAYERS) if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", vis);
  dimSurface(map, vis === "visible");
  if (vis === "none") return;
  const gm = game.user.isGM, all = sections(), shown = all.filter(s => gm || s.known);
  const feat = (geometry, properties) => ({ type: "Feature", geometry, properties });
  const fc = features => ({ type: "FeatureCollection", features });
  const color = s => (KINDS[s.kind] ?? KINDS.quarry).color;
  map.getSource("rc-cata-dim").setData(fc([feat({ type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] }, {})]));
  map.getSource("rc-cata-area").setData(fc(shown.map(s => feat({ type: "Polygon", coordinates: [blob(s)] }, { id: s.id, color: color(s), known: s.known }))));
  map.getSource("rc-cata-gal").setData(fc(shown.flatMap(s => galleries(s).map(l => feat({ type: "LineString", coordinates: l }, { color: color(s), known: s.known })))));
  // сеть строится по всем участкам, а не по видимым: у игроков та же сеть, только часть её
  const tun = edges(all).filter(([a, b]) => gm || (a.known && b.known)).map(([a, b]) => ({ ...tunnel(a, b), known: a.known && b.known }));
  map.getSource("rc-cata-tun").setData(fc(tun.flatMap(t => [t.line, ...t.spurs].map(l => feat({ type: "LineString", coordinates: l }, { type: t.type, known: t.known })))));
  map.getSource("rc-cata-label").setData(fc(shown.map(s => feat({ type: "Point", coordinates: [s.lng, s.lat] },
    { name: s.name, sub: `${(KINDS[s.kind] ?? KINDS.quarry).label} · ${s.holder || "ничьё"}${s.known ? "" : " · скрыто"}`, known: s.known }))));
  map.getSource("rc-cata-door").setData(fc(shown.flatMap(s => (s.entries ?? []).map(([lat, lng, name]) => feat({ type: "Point", coordinates: [lng, lat] }, { name, known: s.known })))));
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
        map.setPaintProperty(l.id, prop, .3);
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
