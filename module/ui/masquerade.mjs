// module/ui/masquerade.mjs
// Нарушения Маскарада на карте города (просьба 25.10). Ведущий ставит нарушение щелчком: тяжесть 1–5
// (слухи, свидетель, улики, скандал, огласка), заметка, видно ли игрокам. Вокруг — «жар»: круг тем шире,
// чем тяжелее нарушение, и он остывает по ночам хроники (тяжесть × 3 ночи). Жар в точке охоты добавляет
// сложность (+1, от 4 — +2) — правило системы, не из книги. Общий жар города — плашка под часами карты.
// Подключается к карте тем же расширением, что и модули (registerCityExtension), данные — в городе мира.

import { registerCityExtension } from "./citymap.mjs";
import { getClock, longDate, MS_DAY } from "../apps/calendar.mjs";

const L = (k, d) => d ? game.i18n.format(`VTM20.Masq.${k}`, d) : game.i18n.localize(`VTM20.Masq.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const EMPTY = { type: "FeatureCollection", features: [] };

/** Тяжесть: сколько ночей остывает и радиус жара в метрах. */
const NIGHTS_PER_LEVEL = 3;
const radiusOf = level => 150 + level * 100;
export const BREACH_LEVELS = [1, 2, 3, 4, 5];

const breachesOf = city => (city?.breaches ?? []).filter(b => game.user.isGM || !b.gmOnly);
const nightsSince = (b, now) => Math.max(0, Math.floor((now - b.at) / MS_DAY));
/** Жар нарушения сейчас: от тяжести до нуля за тяжесть × 3 ночи. */
export function heatOf(b, now = getClock()) {
  const span = b.level * NIGHTS_PER_LEVEL, n = nightsSince(b, now);
  return n >= span ? 0 : b.level * (1 - n / span);
}
/** Расстояние в метрах между точками [широта, долгота]. */
function meters(a, b) {
  const R = 6371000, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Жар в точке и надбавка к сложности охоты: от 1 — +1, от 4 — +2. */
export function masqueradeAt(city, lat, lng, now = getClock()) {
  const heat = breachesOf(city).reduce((s, b) => s + (meters([b.lat, b.lng], [lat, lng]) <= radiusOf(b.level) ? heatOf(b, now) : 0), 0);
  return { heat, diff: heat >= 4 ? 2 : heat >= 1 ? 1 : 0 };
}
/** Общий жар города — словами. */
export function cityHeat(city, now = getClock()) {
  const heat = breachesOf(city).reduce((s, b) => s + heatOf(b, now), 0);
  const step = heat <= 0 ? 0 : heat < 3 ? 1 : heat < 7 ? 2 : heat < 12 ? 3 : 4;
  return { heat, step, label: L(`City.${step}`) };
}

/** Круг жара многоугольником (32 вершины) — для заливки на карте. */
function circle(lat, lng, m) {
  const pts = [], dLat = m / 111320, dLng = m / (111320 * Math.cos(lat * Math.PI / 180));
  for (let i = 0; i <= 32; i++) { const a = i / 32 * 2 * Math.PI; pts.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]); }
  return pts;
}

const shown = api => api.view().masq !== false;
const findBreach = (api, id) => (api.city().breaches ?? []).find(b => b.id === id) ?? null;

function draw(api) {
  const map = api.map;
  if (!map?.getSource("rc-masq")) return;
  const now = getClock(), sel = api.picked?.kind === "breach" ? api.picked.id : null;
  const list = shown(api) ? breachesOf(api.city()) : [];
  map.getSource("rc-masq").setData({ type: "FeatureCollection", features: list.map(b => {
    const h = heatOf(b, now);
    return { type: "Feature", properties: { id: b.id, heat: h / 5, cold: h <= 0, sel: b.id === sel },
      geometry: { type: "Polygon", coordinates: [circle(b.lat, b.lng, radiusOf(b.level))] } };
  }) });
  map.getSource("rc-masq-pt").setData({ type: "FeatureCollection", features: list.map(b => ({
    type: "Feature", properties: { label: `${L(`Level.${b.level}`)}${heatOf(b, now) > 0 ? "" : ` · ${L("Cold")}`}` },
    geometry: { type: "Point", coordinates: [b.lng, b.lat] } })) });
  paintPlate(api);
}

/** Плашка общего жара под часами карты: видна, если есть хоть одно видимое нарушение. */
function paintPlate(api) {
  const el = api.root()?.querySelector(".rc-masq-plate");
  if (!el) return;
  const any = breachesOf(api.city()).length && shown(api), h = cityHeat(api.city());
  el.hidden = !any;
  if (!any) return;
  // под часами карты: их высота у ведущего и у игрока разная
  const clock = api.root()?.querySelector(".rc-clock"), box = el.parentElement;
  if (clock && box) el.style.top = `${Math.round(clock.getBoundingClientRect().bottom - box.getBoundingClientRect().top + 8)}px`;
  el.dataset.step = h.step;
  el.innerHTML = `<i class="fa-solid fa-mask"></i><span>${esc(L("Title"))}</span><b>${esc(h.label)}</b>`;
  el.dataset.tooltip = L("PlateHint", { n: h.heat.toFixed(1) });
}

function editor(b, api) {
  const now = getClock(), n = nightsSince(b, now), span = b.level * NIGHTS_PER_LEVEL, h = heatOf(b, now);
  const tiles = BREACH_LEVELS.map(l => `<a class="rc-masq-lv ${l === b.level ? "on" : ""}" data-act="breachLevel" data-level="${l}"><b>${l}</b>${esc(L(`Level.${l}`))}</a>`).join("");
  return `<section class="rc-edit rc-masq-edit">
    <div class="rc-edit-head"><i class="fa-solid fa-mask" style="color:#c4474c"></i><b>${esc(L("Breach"))} · ${esc(L(`Level.${b.level}`))}</b>
      <a data-act="unpick" data-tooltip="${esc(api.L("Close"))}"><i class="fa-solid fa-xmark"></i></a></div>
    ${game.user.isGM ? `<div class="rc-masq-lvs">${tiles}</div>` : ""}
    <p class="rc-facts">${esc(longDate(new Date(b.at)))} · ${esc(h > 0 ? L("Hot", { n, left: span - n }) : L("Cooled", { n }))}</p>
    ${game.user.isGM ? `<textarea data-field="text" rows="3" placeholder="${esc(L("TextHint"))}">${esc(b.text ?? "")}</textarea>
      <label class="rc-row rc-check"><input type="checkbox" data-field="gmOnly" ${b.gmOnly ? "checked" : ""}> ${esc(api.L("GmOnly"))}</label>`
      : b.text ? `<p class="rc-text">${esc(b.text)}</p>` : ""}
    <p class="rc-facts">${esc(L("HuntHint"))}</p>
    ${game.user.isGM ? `<div class="rc-edit-acts"><a class="r-btn rc-danger" data-act="remove" data-tooltip="${esc(api.L("Delete"))}"><i class="fa-solid fa-trash"></i></a></div>` : ""}
  </section>`;
}

export function registerMasquerade() {
  registerCityExtension({
    overlays: [{
      add: api => {
        const map = api.map;
        for (const s of ["rc-masq", "rc-masq-pt"]) if (!map.getSource(s)) map.addSource(s, { type: "geojson", data: EMPTY });
        const add = l => { if (!map.getLayer(l.id)) map.addLayer(l); };
        add({ id: "rc-masq-fill", type: "fill", source: "rc-masq", paint: {
          "fill-color": "#b3262d", "fill-opacity": ["case", ["get", "cold"], .04, ["+", .08, ["*", .3, ["get", "heat"]]]] } });
        add({ id: "rc-masq-line", type: "line", source: "rc-masq", paint: {
          "line-color": "#e0414b", "line-width": ["case", ["get", "sel"], 3, 1.4], "line-dasharray": [1.5, 1.5], "line-opacity": ["case", ["get", "cold"], .35, .9] } });
        add({ id: "rc-masq-label", type: "symbol", source: "rc-masq-pt", minzoom: 13,
          layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-transform": "uppercase", "text-letter-spacing": .2 },
          paint: { "text-color": "#e8a3a5", "text-halo-color": "#0a0808", "text-halo-width": 1.8 } });
        draw(api);
      },
      draw: api => draw(api),
      world: api => draw(api),
      clock: api => draw(api)
    }],
    clicks: [{
      // нарушение под щелчком — выбрать (место города поверх — его)
      hit: (ev, api) => {
        const map = api.map;
        if (!map.getLayer("rc-masq-fill") || !shown(api)) return false;
        const hits = map.queryRenderedFeatures(ev.point, { layers: ["rc-poi", "rc-masq-fill"].filter(l => map.getLayer(l)) });
        if (hits.some(f => f.layer.id === "rc-poi")) return false;
        const b = hits.find(f => f.layer.id === "rc-masq-fill");
        if (!b) return false;
        api.pick("breach", b.properties.id);
        return true;
      }
    }],
    toolModes: [{
      id: "breach", icon: "fa-mask", tip: "ToolBreach", gm: true,
      hint: () => L("Hint"),
      click: (ll, api) => {
        if (!game.user.isGM) return;
        const c = api.city(), b = { id: api.uid(), lat: ll.lat, lng: ll.lng, level: 2, at: getClock(), text: "", gmOnly: true };
        (c.breaches ??= []).push(b);
        api.save({ own: false });
        if (api.view().masq === false) api.setView({ masq: true });
        api.tool = "select"; api.drawTools();
        api.pick("breach", b.id);
      }
    }],
    tools: [api => `<a class="${shown(api) ? "on" : ""}" data-act="masqLayer" data-tooltip="${esc(L("Layer"))}"><i class="fa-solid fa-mask"></i></a>`],
    acts: {
      masqLayer: async (el, api) => { await api.setView({ masq: !shown(api) }); api.drawTools(); draw(api); },
      breachLevel: (el, api) => {
        const b = api.picked?.kind === "breach" ? findBreach(api, api.picked.id) : null;
        if (!b || !game.user.isGM) return;
        b.level = Number(el.dataset.level) || 1;
        api.save({ own: false }); draw(api); api.drawInspector();
      }
    },
    kinds: {
      breach: {
        find: (id, api) => { const b = findBreach(api, id); return b && (game.user.isGM || !b.gmOnly) ? b : null; },
        editor: (b, api) => editor(b, api),
        edit: (b, field, value, api) => {
          if (!game.user.isGM) return;
          b[field] = value;
          api.save({ own: false }); draw(api);
        },
        remove: (b, api) => {
          if (!game.user.isGM) return;
          const c = api.city();
          c.breaches = (c.breaches ?? []).filter(x => x.id !== b.id);
          api.save({ own: false });
          api.picked = null; api.drawBody(); api.drawOverlay();
        }
      }
    },
    mounts: [(root, api) => {
      const box = root.querySelector(".rc-map");
      if (!box || box.querySelector(".rc-masq-plate")) return;
      const el = document.createElement("div");
      el.className = "rc-masq-plate"; el.hidden = true;
      box.appendChild(el);
    }]
  });
}
