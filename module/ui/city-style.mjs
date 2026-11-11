// module/ui/city-style.mjs
// Стиль карты: тайлы, палитры, слои MapLibre, стили модулей. Вынесено из citymap.mjs: здесь нет состояния карты.
import { SYSTEM_ID } from "../config.mjs";
import { EXT } from "./city-ext.mjs";

export const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const OMT = "https://tiles.openfreemap.org/planet";
const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const OMT_ATTR = '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
/** Современные стили; модуль может добавить свои (например, старинный план) — EXT.styles. */
const MODERN_STYLES = ["noir", "graphite", "sat"];
export const revolution = () => game.settings.get(SYSTEM_ID, "era") === "revolution";
/** Зарегистрированные модулями стили, подходящие сейчас (эпоха, город). */
const extStyles = () => EXT.styles.filter(st => !st.when || st.when());
export const styleExt = id => EXT.styles.find(st => st.id === id);
export const CITY_STYLES = () => [...extStyles().map(st => st.id), ...MODERN_STYLES];
export const eraStyles = () => { const own = extStyles().map(st => st.id); return own.length ? own : MODERN_STYLES; };
export const defaultStyle = () => (extStyles().find(st => st.default) ?? extStyles()[0])?.id ?? "noir";
export const CITY_LANGS = ["ru", "fr", "en"];

const PAL = {
  noir: {
    bg: "#0a0808", res: "#0e0b0c", ind: "#100d0e", park: "#0c0f0c", wood: "#0b0e0b", cem: "#140c11", hosp: "#150b0e",
    water: "#05070a", ferry: "#1b2632", bld: "#171214", bldTop: "#1e1719", bldHigh: "#2e1a1f", bldLine: "#231b1e",
    path: "#2b2224", minor: "#241b1d", mid: "#342125", primary: "#4a1b23", trunk: "#5a1822", motor: "#681a25", casing: "#030202",
    rail: "#3b2e33", border: "#5a1e28", text: "#bdb1ab", dim: "#7d7075", place: "#e8dfd6", suburb: "#b58a8f",
    halo: "#0a0808", waterText: "#40576a", parkText: "#5f755b", poiText: "#877b80"
  },
  graphite: {
    bg: "#141416", res: "#18181b", ind: "#1a1a1d", park: "#161a17", wood: "#151916", cem: "#1b181c", hosp: "#1c181a",
    water: "#0c0e12", ferry: "#232b35", bld: "#222226", bldTop: "#29292e", bldHigh: "#34343b", bldLine: "#2f2f35",
    path: "#36363c", minor: "#2f2f35", mid: "#46464e", primary: "#5c5c65", trunk: "#707079", motor: "#888891", casing: "#0a0a0b",
    rail: "#4b4b53", border: "#5c5c68", text: "#c6c6ce", dim: "#8c8c96", place: "#eeeef2", suburb: "#a3a3b0",
    halo: "#141416", waterText: "#51616f", parkText: "#6c7c6c", poiText: "#8e8e98"
  }
};

// Иероглифов на карте нет: без откатов на местное `name`, name_int и name_en — OpenMapTiles
// подставляет в них местное имя, когда английского нет. Берём только настоящий тег name:en.
// name:latin у OpenMapTiles — всегда латиница (транслитерация); где нет и его — подписи просто не будет.
const nameExpr = lang => lang === "ru"
  ? ["coalesce", ["get", "name:ru"], ["get", "name:en"], ["get", "name:latin"]]
  : lang === "fr" ? ["coalesce", ["get", "name:fr"], ["get", "name:latin"], ["get", "name:en"]]
  : ["coalesce", ["get", "name:en"], ["get", "name:latin"]];

const isPoly = ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false];
const isLine = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const isPoint = ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false];
export const cls = ["get", "class"];
export const zoomed = (...stops) => ["interpolate", ["linear"], ["zoom"], ...stops];

/** Ширина дорог по классу; k — множитель для обводки. */
const roadWidth = k => ["interpolate", ["exponential", 1.55], ["zoom"],
  7, ["match", cls, "motorway", .9 * k, "trunk", .7 * k, 0],
  11, ["match", cls, "motorway", 2 * k, "trunk", 1.7 * k, "primary", 1.3 * k, ["secondary", "tertiary"], .8 * k, .25 * k],
  14, ["match", cls, "motorway", 4.5 * k, "trunk", 4 * k, "primary", 3.4 * k, ["secondary", "tertiary"], 2.6 * k, ["minor", "busway"], 1.6 * k, .9 * k],
  18, ["match", cls, "motorway", 22 * k, "trunk", 20 * k, "primary", 18 * k, ["secondary", "tertiary"], 15 * k, ["minor", "busway"], 11 * k, 6 * k]];

function baseLayers(p) {
  const fill = (id, sl, filter, color, extra = {}) => ({ id, type: "fill", source: "omt", "source-layer": sl, filter, paint: { "fill-color": color, ...extra } });
  const roads = ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service", "track", "busway", "raceway"];
  const tunnelFade = ["case", ["==", ["get", "brunnel"], "tunnel"], .4, 1];
  return [
    { id: "bg", type: "background", paint: { "background-color": p.bg } },
    fill("landuse-res", "landuse", ["match", cls, ["residential", "suburb", "neighbourhood"], true, false], p.res),
    fill("landuse-ind", "landuse", ["match", cls, ["industrial", "commercial", "retail", "railway", "garages"], true, false], p.ind),
    fill("landcover-wood", "landcover", ["match", cls, ["wood", "forest"], true, false], p.wood),
    fill("landcover-grass", "landcover", ["match", cls, ["grass", "wetland", "farmland"], true, false], p.park, { "fill-opacity": .7 }),
    fill("landuse-park", "landuse", ["match", cls, ["park", "pitch", "playground", "stadium"], true, false], p.park),
    fill("park", "park", isPoly, p.park, { "fill-opacity": .5 }),
    fill("landuse-cem", "landuse", ["==", cls, "cemetery"], p.cem),
    fill("landuse-hosp", "landuse", ["==", cls, "hospital"], p.hosp),
    fill("water", "water", ["all", isPoly, ["!=", ["get", "brunnel"], "tunnel"]], p.water),
    { id: "waterway", type: "line", source: "omt", "source-layer": "waterway", filter: isLine, paint: { "line-color": p.water, "line-width": zoomed(10, .5, 16, 3) } },
    fill("aeroway", "aeroway", isPoly, p.minor),
    fill("pier", "transportation", ["all", isPoly, ["==", cls, "pier"]], p.res),
    { id: "building", type: "fill", source: "omt", "source-layer": "building", minzoom: 13,
      paint: { "fill-color": p.bld, "fill-outline-color": p.bldLine, "fill-opacity": zoomed(13, 0, 14, 1) } },
    { id: "ferry", type: "line", source: "omt", "source-layer": "transportation", filter: ["==", cls, "ferry"],
      paint: { "line-color": p.ferry, "line-width": 1, "line-dasharray": [3, 3] } },
    { id: "road-casing", type: "line", source: "omt", "source-layer": "transportation", minzoom: 12,
      filter: ["all", isLine, ["match", cls, ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false], ["!=", ["get", "brunnel"], "tunnel"]],
      layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": p.casing, "line-width": roadWidth(1.35) } },
    { id: "path", type: "line", source: "omt", "source-layer": "transportation", minzoom: 15, filter: ["all", isLine, ["==", cls, "path"]],
      paint: { "line-color": p.path, "line-width": zoomed(15, .6, 18, 1.6), "line-dasharray": [2, 1.5] } },
    { id: "road", type: "line", source: "omt", "source-layer": "transportation",
      filter: ["all", isLine, ["match", cls, roads, true, false]], layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": ["match", cls, "motorway", p.motor, "trunk", p.trunk, "primary", p.primary, ["secondary", "tertiary"], p.mid, p.minor],
               "line-width": roadWidth(1), "line-opacity": tunnelFade } },
    { id: "rail", type: "line", source: "omt", "source-layer": "transportation", minzoom: 11,
      filter: ["all", isLine, ["match", cls, ["rail", "transit"], true, false]],
      paint: { "line-color": p.rail, "line-width": zoomed(11, .6, 16, 1.6), "line-dasharray": [4, 3], "line-opacity": tunnelFade } },
    { id: "boundary", type: "line", source: "omt", "source-layer": "boundary", filter: ["<=", ["get", "admin_level"], 4],
      paint: { "line-color": p.border, "line-width": 1, "line-dasharray": [4, 2, 1, 2] } },
    { id: "building-3d", type: "fill-extrusion", source: "omt", "source-layer": "building", minzoom: 14,
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 0], 0, p.bld, 60, p.bldTop, 250, p.bldHigh],
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 0],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": .92
      } }
  ];
}

function labelLayers(p, lang, sat = false) {
  const name = nameExpr(lang);
  const halo = sat ? { "text-halo-color": "rgba(0,0,0,.85)", "text-halo-width": 2 } : { "text-halo-color": p.halo, "text-halo-width": 1.6 };
  const sym = (id, sl, filter, layout, color, extra = {}) => ({
    id, type: "symbol", source: "omt", "source-layer": sl, filter, ...extra,
    layout: { "text-field": name, "text-font": ["Noto Sans Regular"], "text-max-width": 8, ...layout },
    paint: { "text-color": color, ...halo }
  });
  return [
    sym("water-name", "water_name", isPoint, { "text-font": ["Noto Sans Italic"], "text-size": 12, "text-letter-spacing": .1 }, p.waterText),
    sym("water-name-line", "water_name", isLine, { "text-font": ["Noto Sans Italic"], "text-size": 12, "symbol-placement": "line" }, p.waterText),
    sym("park-name", "park", isPoint, { "text-font": ["Noto Sans Italic"], "text-size": 11 }, p.parkText, { minzoom: 12 }),
    sym("house-num", "housenumber", ["all"], { "text-field": ["get", "housenumber"], "text-size": 9 }, p.dim, { minzoom: 18 }),
    sym("poi-name", "poi", ["<=", ["coalesce", ["get", "rank"], 99], 40], { "text-size": 10.5 }, p.poiText, { minzoom: 16 }),
    sym("road-name", "transportation_name", isLine, {
      "symbol-placement": "line", "text-size": zoomed(13, 9.5, 16, 12, 18, 14), "text-letter-spacing": .04, "text-max-angle": 30
    }, p.text, { minzoom: 13 }),
    sym("place-minor", "place", ["match", cls, ["neighbourhood", "quarter", "hamlet", "isolated_dwelling"], true, false],
      { "text-size": 10, "text-transform": "uppercase", "text-letter-spacing": .12 }, p.dim, { minzoom: 13, maxzoom: 17 }),
    sym("place-island", "place", ["match", cls, ["island", "islet"], true, false],
      { "text-font": ["Noto Sans Italic"], "text-size": 11 }, p.dim, { minzoom: 10 }),
    sym("place-suburb", "place", ["==", cls, "suburb"],
      { "text-size": zoomed(11, 10.5, 14, 13), "text-transform": "uppercase", "text-letter-spacing": .2 }, p.suburb, { minzoom: 11, maxzoom: 16 }),
    sym("place-town", "place", ["match", cls, ["town", "village"], true, false], { "text-size": 12.5 }, p.text, { maxzoom: 15 }),
    sym("place-city", "place", ["==", cls, "city"],
      { "text-font": ["Noto Sans Bold"], "text-size": zoomed(8, 13, 12, 18), "text-transform": "uppercase", "text-letter-spacing": .3 },
      p.place, { maxzoom: 13 })
  ];
}

export function buildStyle(kind, lang) {
  const p = PAL[kind === "graphite" ? "graphite" : "noir"];
  const own = styleExt(kind);
  if (own) return own.build(lang, { GLYPHS });
  const sources = { omt: { type: "vector", url: OMT, attribution: OMT_ATTR } };
  let layers;
  if (kind === "sat") {
    sources.sat = { type: "raster", tiles: [SAT], tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" };
    layers = [
      { id: "bg", type: "background", paint: { "background-color": "#050505" } },
      { id: "sat", type: "raster", source: "sat", paint: { "raster-saturation": -.55, "raster-brightness-max": .72, "raster-contrast": .12 } },
      ...labelLayers(p, lang, true)
    ];
  } else layers = [...baseLayers(p), ...labelLayers(p, lang)];
  return { version: 8, glyphs: GLYPHS, sources, layers, light: { anchor: "viewport", color: "#ffffff", intensity: .3 } };
}
