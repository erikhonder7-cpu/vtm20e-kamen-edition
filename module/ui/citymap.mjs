// module/ui/citymap.mjs
// Город: живая карта хроники на шторе, что опускается сверху.
//
// Не окно Foundry, а полноширинная штора в <body> (как «Дом» в Decadence): закрыта —
// у верхней кромки виден язычок «Город», потянул — карта на весь экран.
//
// Карта — MapLibre GL (lib/maplibre, BSD-3) на векторных тайлах OpenFreeMap (OpenStreetMap,
// без ключей и лимитов). Стиль рисуем сами: «Ночь» — чёрное с кровью, «Графит», «Спутник»
// (Esri) с подписями поверх. Подписи — английские или русские (где они есть в OSM); иероглифов нет.
// Дома объёмные: наклон карты показывает высотки.
//
// Метки лежат в папках, папки — в городах:
//   · готовые папки города (data/cities/<город>.json, собирает tools/citypoi.py) — значимые
//     места, разложенные по районам с пределом на район; ведущий может переименовать место,
//     дописать заметку, сменить значок или спрятать его — правки хранятся отдельно (overrides);
//   · свои папки ведущего с метками хроники (Элизиум, убежища, угодья…);
//   · «Мои метки» — личные метки игрока, видит только он (флаг пользователя);
//   · зоны — многоугольники доменов и территорий.
// Глазом каждый прячет папку у себя; замком ведущий прячет её от игроков.
//
// Персонажи — фишки с портретом (флаг актёра `city`, см. citychars.mjs): их ставят на карту,
// передвигают перетаскиванием (владелец и ведущий), собирают в группы, прячут от игроков.

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import {
  getClock, clockRunning, clockRate, setClockRunning, setClockRate, glideTo, advanceClock,
  longDate, ymd, sunTimes, realNow, nightSpan, MS_MIN, MS_HOUR, MS_DAY
} from "../apps/calendar.mjs";
import {
  whereIs, cityFlag, placeActor, leaderOf, followersOf, groupOf, joinGroup, leaveGroup, mapVisible, isHiddenOnMap, meters
} from "./citychars.mjs";
import { plateHTML, paintPlate } from "./night-plate.mjs";
import { HUNTING_GROUNDS, openHunt } from "../apps/night.mjs";

/**
 * Расширения карты (модули): свои стили карты, готовые города, слои, кнопки, режимы щелчка, виды объектов в инспекторе,
 * разметка поверх карты, доска режимов (вкладки над картой), печати. Регистрируются до открытия шторы — на init.
 * Пустая система — общий инструмент: свои города, метки, папки, зоны, персонажи, часы, современные стили.
 */
const EXT = { styles: [], presets: [], overlays: [], tools: [], toolModes: [], acts: {}, clicks: [], kinds: {}, mounts: [], boards: [], seals: [] };
export function registerCityExtension(e = {}) {
  for (const k of ["styles", "presets", "overlays", "tools", "toolModes", "clicks", "mounts", "boards", "seals"]) if (e[k]) EXT[k].push(...[].concat(e[k]));
  if (e.acts) Object.assign(EXT.acts, e.acts);
  if (e.kinds) Object.assign(EXT.kinds, e.kinds);
}

/** Что карта даёт расширениям: состояние и перерисовки (обёртки — объявленное ниже доступно при вызове). */
const api = {
  get map() { return map; }, get gl() { return gl; },
  get picked() { return picked; }, set picked(v) { picked = v; },
  get tool() { return tool; }, set tool(v) { tool = v; },
  view: () => view(), setView: p => setView(p), city: () => city(), save: o => save(o), uid: () => uid(),
  L: (k, d) => L(k, d), esc: x => esc(x), zoomed: (...a) => zoomed(...a), revolution: () => revolution(),
  showTip: (...a) => showTip(...a), fly: (...a) => map && fly(...a), pick: (k, id) => pick(k, id),
  drawTools: () => drawTools(), drawBody: () => drawBody(), drawInspector: () => drawInspector(), drawOverlay: () => drawOverlay(),
  root: () => document.getElementById(ID), styleExt: id => styleExt(id), isOpen: () => !!document.getElementById(ID)?.classList.contains("open")
};
const boards = () => EXT.boards;

const ID = "r-citymap";
const SLATS = 12, STAGGER = 24, SLIDE = 460;
const CHRONICLE = "chronicle", MINE = "_mine";
/** Город без данных мира: готовый город модуля с default, иначе пустой. Ключ — и для старых личных меток. */
const DEFAULT_CITY = "paris-1789";
const defaultPreset = () => EXT.presets.find(p => p.default) ?? null;
const LIST_CAP = 250;
const L = (k, d) => d ? game.i18n.format(`VTM20.City.${k}`, d) : game.i18n.localize(`VTM20.City.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const uid = () => foundry.utils.randomID(10);

/** Категории меток: значок и цвет. Цвета приглушены — ночь, а не неон. */
export const CITY_CATEGORIES = {
  // хроника
  elysium:   { icon: "fa-landmark",            color: "#c2a06e", chronicle: true },
  haven:     { icon: "fa-house-chimney-crack", color: "#9aa6b6", chronicle: true },
  hunting:   { icon: "fa-paw",                 color: "#b0404c", chronicle: true },
  domain:    { icon: "fa-chess-rook",          color: "#8c73a8", chronicle: true },
  danger:    { icon: "fa-skull",               color: "#b8603f", chronicle: true },
  kindred:   { icon: "fa-user-secret",         color: "#b34a55", chronicle: true },
  mortal:    { icon: "fa-user",                color: "#8ea28a", chronicle: true },
  event:     { icon: "fa-star",                color: "#bfa35e", chronicle: true },
  other:     { icon: "fa-location-dot",        color: "#b9b1a9", chronicle: true },
  // ночи Революции и штабы фракций Теневого Собрания (эпоха «Революция»)
  "assembly": { icon: "fa-landmark-dome", color: "#b3aa98", chronicle: true, group: "night" },
  "meeting": { icon: "fa-comments", color: "#9aa6b6", chronicle: true, group: "night" },
  "catacomb": { icon: "fa-dungeon", color: "#8a8276", chronicle: true, group: "night" },
  "rumor": { icon: "fa-bullhorn", color: "#a8997a", chronicle: true, group: "night" },
  "battle": { icon: "fa-khanda", color: "#b0404c", chronicle: true, group: "night" },
  "torpor": { icon: "fa-bed", color: "#8f8590", chronicle: true, group: "night" },
  "ghoul": { icon: "fa-link", color: "#b34a55", chronicle: true, group: "night" },
  "stash": { icon: "fa-box-archive", color: "#a58f6c", chronicle: true, group: "night" },
  "barricade": { icon: "fa-road-barrier", color: "#b8603f", chronicle: true, group: "night" },
  "press": { icon: "fa-feather-pointed", color: "#9e7c98", chronicle: true, group: "night" },
  "breach": { icon: "fa-mask", color: "#c4474c", chronicle: true, group: "night" },
  "hunter": { icon: "fa-cross", color: "#d8cfbf", chronicle: true, group: "night" },
  "mob": { icon: "fa-fire", color: "#b8603f", chronicle: true, group: "night" },
  "f-montagnards": { icon: "fa-fire", color: "#a3242a", chronicle: true, group: "faction" },
  "f-girondins": { icon: "fa-scale-balanced", color: "#b8703f", chronicle: true, group: "faction" },
  "f-feuillants": { icon: "fa-scroll", color: "#6f86a6", chronicle: true, group: "faction" },
  "f-royalists": { icon: "fa-chess-king", color: "#d8cfbf", chronicle: true, group: "faction" },
  "f-neutral": { icon: "fa-eye", color: "#7d8a74", chronicle: true, group: "faction" },
  // город
  hospital:  { icon: "fa-hospital",            color: "#a3afbd" },
  blood:     { icon: "fa-droplet",             color: "#b8333f" },
  death:     { icon: "fa-cross",               color: "#8f8590" },
  cemetery:  { icon: "fa-monument",            color: "#7f8a7c" },
  police:    { icon: "fa-shield-halved",       color: "#7185a1" },
  power:     { icon: "fa-scale-balanced",      color: "#a8997a" },
  nightlife: { icon: "fa-martini-glass",       color: "#a8566b" },
  gambling:  { icon: "fa-dice",                color: "#b39650" },
  landmark:  { icon: "fa-building",            color: "#bfb3a5" },
  hotel:     { icon: "fa-bed",                 color: "#9589a8" },
  culture:   { icon: "fa-masks-theater",       color: "#9e7c98" },
  worship:   { icon: "fa-place-of-worship",    color: "#b89a6c" },
  transport: { icon: "fa-ship",                color: "#7a8c98" },
  education: { icon: "fa-graduation-cap",      color: "#8997ab" },
  market:    { icon: "fa-store",               color: "#a58f6c" }
};
const catOf = k => CITY_CATEGORIES[k] ?? CITY_CATEGORIES.other;

/** Вид объекта в готовых местах → свой значок; цвет — от категории папки. */
export const CITY_KINDS = {
  hospital: ["fa-hospital", "hospital"],
  donor: ["fa-hand-holding-droplet", "blood"], bloodbank: ["fa-droplet", "blood"],
  mortuary: ["fa-coffin", "death"], crematorium: ["fa-fire-flame-curved", "death"], funeral: ["fa-dove", "death"],
  columbarium: ["fa-monument", "cemetery"], cemetery: ["fa-tombstone", "cemetery"],
  police: ["fa-shield-halved", "police"],
  court: ["fa-gavel", "power"], prison: ["fa-handcuffs", "power"], consulate: ["fa-flag", "power"],
  military: ["fa-person-military-rifle", "power"], government: ["fa-building-columns", "power"],
  nightdistrict: ["fa-champagne-glasses", "nightlife"], club: ["fa-compact-disc", "nightlife"],
  karaoke: ["fa-microphone", "nightlife"], bar: ["fa-martini-glass", "nightlife"],
  racecourse: ["fa-horse-head", "gambling"], casino: ["fa-coins", "gambling"], bookmaker: ["fa-ticket", "gambling"],
  mahjong: ["fa-dice", "gambling"],
  hotel: ["fa-bed", "hotel"], museum: ["fa-scroll", "culture"], theatre: ["fa-masks-theater", "culture"],
  buddhist: ["fa-vihara", "worship"], taoist: ["fa-yin-yang", "worship"], church: ["fa-church", "worship"],
  mosque: ["fa-mosque", "worship"], hindu: ["fa-om", "worship"], synagogue: ["fa-synagogue", "worship"], sikh: ["fa-khanda", "worship"],
  airport: ["fa-plane-departure", "transport"], ferry: ["fa-ferry", "transport"], pier: ["fa-anchor", "transport"],
  station: ["fa-train", "transport"], port: ["fa-ship", "transport"],
  university: ["fa-graduation-cap", "education"], market: ["fa-store", "market"],
  peak: ["fa-binoculars", "landmark"], park: ["fa-tree", "landmark"], tower: ["fa-building", "landmark"],
  historic: ["fa-chess-rook", "landmark"], landmark: ["fa-landmark-flag", "landmark"],
  // Париж 1789 года (data/cities/paris-1789.json)
  palace: ["fa-crown", "power"], castle: ["fa-chess-rook", "power"], gibbet: ["fa-skull", "death"],
  manufacture: ["fa-industry", "market"], bridge: ["fa-bridge", "landmark"], mill: ["fa-wind", "landmark"],
  faubourg: ["fa-house", "landmark"],
  // места хроники «Liberté»
  battle: ["fa-khanda", "danger"], press: ["fa-feather-pointed", "culture"], catacomb: ["fa-dungeon", "death"], stash: ["fa-box-archive", "market"]
};

/**
 * Эмблемы эпохи (assets/icons/city, tools/build_city_icons.py; game-icons.net, CC BY 3.0) —
 * на сургучной печати. Ключ — вид места или категория метки; цвет воска — по категории.
 */
const SEAL_SVG = new Set(["church", "prison", "court", "government", "palace", "military", "club", "bar", "nightdistrict",
  "theatre", "museum", "hospital", "cemetery", "mortuary", "gibbet", "market", "manufacture", "historic", "landmark", "bridge",
  "mill", "park", "faubourg", "castle", "elysium", "haven", "hunting", "domain", "danger", "kindred", "mortal", "event", "other",
  "assembly", "meeting", "catacomb", "rumor", "battle", "torpor", "ghoul", "stash", "barricade", "press", "breach", "hunter", "mob", "f-montagnards", "f-girondins", "f-feuillants", "f-royalists", "f-neutral"]);
/** Воск: [светлый край, тёмная глубина]. Красный — власть и кровь, чёрный — смерть, зеленоватый — лекари, бурый — церковь и торг. */
const WAX = {
  power: ["#8e1b20", "#3a070a"], nightlife: ["#9a2a1c", "#3f0c06"], gambling: ["#9a2a1c", "#3f0c06"], culture: ["#5a2f5c", "#200d22"],
  worship: ["#7a5524", "#2e1d08"], hospital: ["#3c5a43", "#122219"], cemetery: ["#2a2725", "#070606"], death: ["#2a2725", "#070606"],
  blood: ["#8e1b20", "#3a070a"], police: ["#3b4660", "#121827"], market: ["#7a5530", "#2c1a0b"], landmark: ["#4a463f", "#161512"],
  transport: ["#4a463f", "#161512"], education: ["#5a2f5c", "#200d22"], hotel: ["#4a463f", "#161512"],
  elysium: ["#8a6a2a", "#33240a"], haven: ["#2a2725", "#070606"], hunting: ["#9e1f24", "#3a070a"], domain: ["#5a2f5c", "#200d22"],
  danger: ["#6a1015", "#1c0305"], kindred: ["#8e1b20", "#2a0507"], mortal: ["#4a463f", "#161512"], event: ["#8a6a2a", "#33240a"],
  other: ["#8e1b20", "#3a070a"],
  "assembly": ["#5a2f5c", "#200d22"],
  "meeting": ["#3b4660", "#121827"],
  "catacomb": ["#2a2725", "#070606"],
  "rumor": ["#7a5530", "#2c1a0b"],
  "battle": ["#9e1f24", "#3a070a"],
  "torpor": ["#2a2725", "#070606"],
  "ghoul": ["#8e1b20", "#2a0507"],
  "stash": ["#7a5530", "#2c1a0b"],
  "barricade": ["#9a2a1c", "#3f0c06"],
  "press": ["#5a2f5c", "#200d22"],
  "breach": ["#6a1015", "#1c0305"],
  "hunter": ["#4a463f", "#161512"],
  "mob": ["#9a2a1c", "#3f0c06"],
  "f-montagnards": ["#a3242a", "#3a070a"],
  "f-girondins": ["#9a5a2c", "#3a1e08"],
  "f-feuillants": ["#4f6688", "#16202f"],
  "f-royalists": ["#c9c0ae", "#5c564a"],
  "f-neutral": ["#5a6652", "#1d2419"]
};
const sealURL = {};   // ключ значка → data URL печати (для булавок-меток в DOM)

/** Записка над картой: что это за место, метка или пятно. x, y — в пикселях карты; null — спрятать. */
function showTip(x, y, kicker, title, text, lines = []) {
  const tip = document.querySelector(`#${ID} .rc-stain-tip`);
  if (!tip) return;
  if (x == null || (!title && !text)) { tip.hidden = true; return; }
  tip.innerHTML = `${kicker ? `<small>${esc(kicker)}</small>` : ""}<b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ""}`
    + lines.map(l => `<span class="rc-tip-line"><i class="fa-solid ${l.icon}"></i>${esc(l.text)}</span>`).join("");
  const box = tip.parentElement.getBoundingClientRect();
  tip.hidden = false;
  // у правого и нижнего края — записка по другую сторону курсора
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = `${x + 16 + w > box.width ? x - w - 12 : x + 16}px`;
  tip.style.top = `${y + 12 + h > box.height ? Math.max(4, y - h - 8) : y + 12}px`;
}

/** Подсказка над местом города: имя, вид и район, заметка. */
function poiTip(ev) {
  const f = ev?.features?.[0];
  const x = f && poiIndex().get(f.properties.id);
  if (!x) return showTip(null);
  const p = poiView(x.base, x.folder);
  const fname = city().folderMeta?.[x.folder.id]?.name || x.folder.name;
  showTip(ev.point.x, ev.point.y, [fname, districtName(p.d)].filter(Boolean).join(" · "), p.name, p.text, spotLines(p));
}

/** Подсказка над меткой хроники (DOM-булавка). */
function pinTip(ev, m) {
  const r = map.getContainer().getBoundingClientRect();
  showTip(ev.clientX - r.left, ev.clientY - r.top, L(`Cat.${m.cat in CITY_CATEGORIES ? m.cat : "other"}`), m.name || L("Unnamed"), m.text, spotLines(m));
}

/** Строки карточки места при наведении (Г4): кто рядом, связанная сцена и журнал. */
function spotLines(m) {
  const out = [];
  const near = game.actors.filter(a => {
    const w = whereIs(a);
    return w && cityFlag(a)?.city === city().id && mapVisible(a) && (game.user.isGM || !isHiddenOnMap(a))
      && meters([w.lng, w.lat], [m.lng, m.lat]) < 150;
  }).map(a => a.name);
  if (near.length) out.push({ icon: "fa-user-group", text: `${L("TipNear")}: ${near.slice(0, 4).join(", ")}${near.length > 4 ? ` +${near.length - 4}` : ""}` });
  const sc = m.sceneId && game.scenes.get(m.sceneId);
  if (sc && (game.user.isGM || sc.visible)) out.push({ icon: "fa-map", text: `${L("Scene")}: ${sc.name} — ${L("TipClick")}` });
  const j = m.journalId && game.journal.get(m.journalId);
  if (j?.testUserPermission(game.user, "OBSERVER")) out.push({ icon: "fa-book-open", text: `${L("Journal")}: ${j.name}` });
  return out;
}

/* ── Сцена ↔ место на карте (Н4) ───────────────────────────────────────── */

/** Метка хроники или готовое место текущего города, связанное со сценой. */
function sceneSpot(sceneId) {
  const c = city();
  const m = c.markers.find(x => x.sceneId === sceneId && (game.user.isGM || !x.gmOnly));
  if (m) return { kind: "marker", id: m.id, lat: m.lat, lng: m.lng };
  for (const [id, x] of poiIndex()) {
    const p = poiView(x.base, x.folder);
    if (p.sceneId === sceneId && !p.deleted && (game.user.isGM || !p.gmOnly)) return { kind: "poi", id, lat: p.lat, lng: p.lng };
  }
  return null;
}

/** Есть ли у сцены место на карте — по данным мира, не открывая карту (для кнопки в нексусе). */
export function sceneHasSpot(sceneId) {
  if (!game.settings.get(SYSTEM_ID, "cityMapEnabled")) return false;
  const raw = game.settings.get(SYSTEM_ID, "cityMap") ?? {};
  const c = raw.cities?.[raw.current] ?? Object.values(raw.cities ?? {})[0] ?? raw;
  return (c.markers ?? []).some(m => m.sceneId === sceneId && (game.user.isGM || !m.gmOnly))
    || Object.values(c.overrides ?? {}).some(o => o?.sceneId === sceneId && !o.deleted);
}

/** Открыть город на месте сцены и выбрать его. */
export async function showSceneOnMap(sceneId) {
  await openCity();
  // штора могла уже открываться (busy) или карта ещё грузит стиль — ждём готовности, а не бросаем
  for (let i = 0; i < 60 && !(state && map?.loaded?.()); i++) await new Promise(r => setTimeout(r, 100));
  const spot = state && map ? sceneSpot(sceneId) : null;
  if (!spot) return ui.notifications.info(L("NoSpot"));
  fly(spot.lat, spot.lng, 17);
  pick(spot.kind, spot.id);
}

/** Зоны и метки хроники текущего города — по данным мира, не открывая карту (домены «Двора»). */
export function citySpots() {
  const raw = game.settings.get(SYSTEM_ID, "cityMap") ?? {};
  const c = raw.cities?.[raw.current] ?? Object.values(raw.cities ?? {})[0] ?? raw;
  const vis = x => game.user.isGM || !x.gmOnly;
  return {
    city: c.name || L("DefaultCity"),
    zones: (c.zones ?? []).filter(vis).map(z => ({ kind: "zone", id: z.id, name: z.name || L("Zone"), color: z.color || "#b0404c" })),
    markers: (c.markers ?? []).filter(vis).map(m => ({ kind: "marker", id: m.id, name: m.name || "—" }))
  };
}

/** Открыть город на зоне или метке и выбрать её (домен из «Двора»). */
export async function showSpotOnMap(kind, id) {
  await openCity();
  for (let i = 0; i < 60 && !(state && map?.loaded?.()); i++) await new Promise(r => setTimeout(r, 100));
  if (!state || !map) return;
  const c = city();
  const it = kind === "zone" ? c.zones.find(z => z.id === id) : c.markers.find(m => m.id === id);
  if (!it) return ui.notifications.info(L("NoSpotFound"));
  const [lat, lng] = kind === "zone" ? centroid(it.points) : [it.lat, it.lng];
  fly(lat, lng, kind === "zone" ? 15 : 17);
  pick(kind, id);
}

/** Значок и цвет места: смена категории ведущим перебивает вид объекта. */
function looks(m) {
  if (m.preset && !m.catSet && CITY_KINDS[m.k]) {
    const [icon, cat] = CITY_KINDS[m.k];
    return { icon: iconOk[`k-${m.k}`] === false ? catOf(cat).icon : icon, color: catOf(m.cat ?? cat).color, image: `rc-k-${m.k}` };
  }
  const c = catOf(m.cat);
  return { icon: c.icon, color: m.color || c.color, image: `rc-${m.cat in CITY_CATEGORIES ? m.cat : "other"}` };
}
const iconOk = {};

/* ── Стиль карты ──────────────────────────────────────────────────────── */

const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const OMT = "https://tiles.openfreemap.org/planet";
const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const OMT_ATTR = '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
/** Современные стили; модуль может добавить свои (например, старинный план) — EXT.styles. */
const MODERN_STYLES = ["noir", "graphite", "sat"];
const revolution = () => game.settings.get(SYSTEM_ID, "era") === "revolution";
/** Зарегистрированные модулями стили, подходящие сейчас (эпоха, город). */
const extStyles = () => EXT.styles.filter(st => !st.when || st.when());
const styleExt = id => EXT.styles.find(st => st.id === id);
export const CITY_STYLES = () => [...extStyles().map(st => st.id), ...MODERN_STYLES];
const eraStyles = () => { const own = extStyles().map(st => st.id); return own.length ? own : MODERN_STYLES; };
/** Языки подписей — у стиля модуля свои (на старинном плане улиц нет, только имена мест). */
const eraLangs = () => styleExt(view().style)?.langs ?? CITY_LANGS;
const homeBearing = () => styleExt(view().style)?.bearing ?? 0;
const defaultStyle = () => (extStyles().find(st => st.default) ?? extStyles()[0])?.id ?? "noir";
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
const cls = ["get", "class"];
const zoomed = (...stops) => ["interpolate", ["linear"], ["zoom"], ...stops];

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

function buildStyle(kind, lang) {
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

/* ── Состояние ────────────────────────────────────────────────────────── */

let gl = null;              // maplibregl
let map = null;
const pins = new Map();     // id → { marker, sig }
let tool = "select";        // select | marker | zone
let picked = null;          // { kind: "marker"|"poi"|"zone"|"found", id }
let draft = [];             // вершины новой зоны [lat, lng]
let drawGround = "slums";   // какие угодья чертит инструмент «Угодья»
let search = "", found = [];
let busy = false, saveTimer = null, echo = null;
let state = null;           // данные мира (все города)
let privates = {};          // личные метки: { cityId: [...] }
const presets = {};         // готовые данные городов: { presetId: {...} }
const metros = {};          // сети метро: { presetId: {...} }
let presetIndex = null;     // data/cities/index.json
let icons = null;           // картинки значков для слоя мест
let shownCity = null;       // город, который сейчас на карте
const charPins = new Map(); // actorId → { marker, sig }
let placing = null;         // актёр, которого ставят на карту следующим щелчком
let raf = null, lastLabels = 0;
let menuFolder = null;      // папка, у которой раскрыто меню «⋯»
const T = (k, d) => L(`Travel.${k}`, d);

/* ── Охота от карты (план 8): угодья у зоны, слой «Угодья», «Охотиться здесь» ─────────── */

/** Цвет угодий на слое «Угодья»: от трущоб (кроваво-красный) к охраняемому кварталу (синий). */
const GROUND_COLORS = { slums: "#9e1f24", poor: "#7a3a6e", business: "#c9a46a", industrial: "#7d6a45", suburb: "#4f6e55", guarded: "#2f3b55" };
const groundLabel = k => game.i18n.localize(`VTM20.Hunt.Ground.${k}`);

/** Точка внутри многоугольника зоны (points — [широта, долгота]). */
function inZone(z, lat, lng) {
  let inside = false;
  for (let i = 0, j = z.points.length - 1; i < z.points.length; j = i++) {
    const [ai, bi] = z.points[i], [aj, bj] = z.points[j];
    if ((bi > lng) !== (bj > lng) && lat < (aj - ai) * (lng - bi) / (bj - bi) + ai) inside = !inside;
  }
  return inside;
}
/** Зона с угодьями, в которой стоит персонаж (самая маленькая из подходящих не нужна — первая по списку). */
const huntZoneOf = a => { const w = whereIs(a); return w ? city().zones.find(z => z.grounds && (game.user.isGM || !z.gmOnly) && inZone(z, w.lat, w.lng)) : null; };
/** Место для окна охоты: название, угодья и хозяин домена (поле «Владелец» зоны — имя персонажа). */
function huntPlace(z, at = centroid(z.points)) {
  // хозяин: обведённый домен в этой точке, иначе поле «Владелец» зоны (имя персонажа)
  const dom = domainAt(at[0], at[1]);
  if (dom) return { name: z.name || L("Zone"), ground: z.grounds, owner: { id: dom.owner ?? null, name: dom.name } };
  const owner = String(z.owner ?? "").trim(), who = owner ? game.actors.find(x => x.name.trim().toLowerCase() === owner.toLowerCase()) : null;
  return { name: z.name || L("Zone"), ground: z.grounds, owner: owner ? { id: who?.id ?? null, name: who?.name ?? owner } : null };
}
/* ── Домены: каждый обводит домен своего персонажа (флаг пользователя cityDomains, по городам) ───── */

const DOMAIN_FLAG = "cityDomains";
const domainsOf = u => (u.getFlag(SYSTEM_ID, DOMAIN_FLAG) ?? {})[city().id] ?? [];
/** Все домены города от всех пользователей: цвет — цвет игрока, имя — хозяин. */
function allDomains() {
  return game.users.contents.flatMap(u => domainsOf(u).map(d => ({ ...d, user: u.id, color: u.color?.css ?? "#c4474c",
    name: game.actors.get(d.owner)?.name ?? L("DomainNobody") })));
}
const domainById = id => allDomains().find(d => d.id === id);
const domainAt = (lat, lng) => allDomains().find(d => inZone(d, lat, lng));
const canEditDomain = d => game.user.isGM || d.user === game.user.id;
/** Чей домен можно обвести: свои Сородичи; ведущему — все. */
const domainOwners = () => game.actors.filter(a => a.type === "vampire" && (game.user.isGM || a.isOwner));
async function saveDomains(user, list) {
  const all = foundry.utils.deepClone(user.getFlag(SYSTEM_ID, DOMAIN_FLAG) ?? {});
  all[city().id] = list;
  await user.setFlag(SYSTEM_ID, DOMAIN_FLAG, all);
}
/** Площадь многоугольника — при щелчке выбирается меньшая из перекрытых областей (домен внутри зоны и наоборот). */
const areaOf = pts => Math.abs(pts.reduce((s, [a, b], i) => { const [c, d] = pts[(i + 1) % pts.length]; return s + a * d - c * b; }, 0)) / 2;

EXT.kinds.domain = {
  find: id => domainById(id),
  editor: d => {
    const edit = canEditDomain(d), opts = domainOwners().map(a => `<option value="${a.id}" ${a.id === d.owner ? "selected" : ""}>${esc(a.name)}</option>`).join("");
    return `<section class="rc-edit">
      <div class="rc-edit-head"><i class="fa-solid fa-crown" style="color:${esc(d.color)}"></i><b>${esc(L("DomainOf", { name: d.name }))}</b>
        <a data-act="unpick" data-tooltip="${esc(L("Close"))}"><i class="fa-solid fa-xmark"></i></a></div>
      <label>${esc(L("DomainOwner"))}<select data-field="owner" ${edit ? "" : "disabled"}>${opts || `<option>${esc(d.name)}</option>`}</select></label>
      ${edit ? `<textarea data-field="text" rows="3" placeholder="${esc(L("DomainTextHint"))}">${esc(d.text ?? "")}</textarea>` : d.text ? `<p class="rc-text">${esc(d.text)}</p>` : ""}
      <p class="rc-facts">${esc(L("DomainHint"))}</p>
      ${edit ? `<div class="rc-edit-acts"><a class="r-btn rc-danger" data-act="remove" data-tooltip="${esc(L("Delete"))}"><i class="fa-solid fa-trash"></i></a></div>` : ""}
    </section>`;
  },
  edit: async (d, field, value) => {
    if (!canEditDomain(d)) return;
    const u = game.users.get(d.user), list = foundry.utils.deepClone(domainsOf(u));
    const x = list.find(y => y.id === d.id);
    if (x) { x[field] = value; await saveDomains(u, list); }
  },
  remove: async d => {
    if (!canEditDomain(d)) return;
    const u = game.users.get(d.user);
    await saveDomains(u, domainsOf(u).filter(y => y.id !== d.id));
    picked = null; drawBody(); drawOverlay();
  }
};

/** Кто охотится из карточки зоны: свой персонаж игрока; ведущему — выделенный жетон. */
function hunter() {
  const ok = a => a?.hasBlood && a.isOwner;
  if (game.user.isGM) return canvas?.tokens?.controlled?.map(t => t.actor).find(ok) ?? null;
  return [game.user.character, ...game.actors.filter(a => a.isOwner)].find(ok) ?? null;
}

const view = () => {
  const v = foundry.utils.mergeObject({ style: defaultStyle(), lang: "ru", hidden: {}, open: {} }, game.settings.get(SYSTEM_ID, "cityView") ?? {}, { inplace: false });
  if (!eraStyles().includes(v.style)) v.style = defaultStyle();
  if (!(styleExt(v.style)?.langs ?? CITY_LANGS).includes(v.lang) || !v.v2) v.lang = "ru";   // v2: до русских подписей по умолчанию был французский
  return v;
};
const setView = patch => game.settings.set(SYSTEM_ID, "cityView", { ...view(), ...patch, v2: true });

function newCity(id, name, center, zoom, preset = null) {
  return { id, name, center, zoom, preset, folders: [{ id: CHRONICLE, name: L("ChronicleFolder") }], markers: [], zones: [], overrides: {}, folderMeta: {} };
}

/** Данные мира; старая версия (один Гонконг без папок) переводится на лету. */
function readWorld() {
  const raw = foundry.utils.deepClone(game.settings.get(SYSTEM_ID, "cityMap") ?? {});
  if (raw.v === 2 && raw.cities && Object.keys(raw.cities).length) return raw;
  const dp = defaultPreset();
  const first = dp ? newCity(dp.id, raw.city || dp.name, raw.center ?? dp.center, raw.zoom ?? dp.zoom, dp.id)
    : newCity(DEFAULT_CITY, raw.city || L("DefaultCity"), raw.center ?? [48.8566, 2.3522], raw.zoom ?? 13);
  first.markers = (raw.markers ?? []).map(m => ({ ...m, folder: CHRONICLE }));
  first.zones = raw.zones ?? [];
  return { v: 2, current: first.id, cities: { [first.id]: first } };
}

function readPrivates() {
  const f = foundry.utils.deepClone(game.user.getFlag(SYSTEM_ID, "cityMarks") ?? {});
  return Array.isArray(f) ? { [DEFAULT_CITY]: f } : f;
}

const city = () => state.cities[state.current] ?? Object.values(state.cities)[0];
const mine = () => (privates[city().id] ??= []);
const preset = () => presets[city().preset];
function save({ world = game.user.isGM, own = true } = {}) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (world && game.user.isGM) { echo = JSON.stringify(state); await game.settings.set(SYSTEM_ID, "cityMap", state); }
    if (own) await game.user.setFlag(SYSTEM_ID, "cityMarks", privates);
  }, 250);
}

async function loadIndex() {
  presetIndex ??= EXT.presets;
  return presetIndex;
}

async function loadPresets() {
  await loadIndex();
  const id = city().preset;
  if (id && !(id in presets)) {
    const entry = presetIndex.find(c => c.id === id);
    presets[id] = entry?.url ? await fetch(entry.url).then(r => r.json()).catch(() => null) : null;
    metros[id] = entry?.metroUrl ? await fetch(entry.metroUrl).then(r => r.json()).catch(() => null) : null;
  }
}

/** Район места по-русски или как в OSM — смотря какой язык подписей выбран. */
function districtName(d) {
  if (!d) return "";
  return view().lang === "ru" ? preset()?.districts?.[d] ?? d : d;
}

/* ── Папки и метки ────────────────────────────────────────────────────── */

const vKey = f => `${city().id}:${f.id}`;
function folderVisible(f) {
  const h = view().hidden[vKey(f)];
  return h === undefined ? f.visible !== false : !h;
}

/** Все папки текущего города: свои, личная, готовые. */
function folders() {
  const c = city();
  const meta = id => c.folderMeta?.[id] ?? {};
  const own = c.folders.map(f => ({ ...f, custom: true }));
  const pre = (preset()?.folders ?? []).filter(f => !meta(f.id).deleted)
    .map(f => ({ id: f.id, name: meta(f.id).name ?? f.name, cat: f.cat, visible: f.visible, gmOnly: !!meta(f.id).gmOnly, preset: true }));
  const list = [...own, { id: MINE, name: L("MineFolder"), mine: true }, ...pre];
  return list.filter(f => game.user.isGM || !f.gmOnly);
}

/** Место из готовых данных с правками ведущего. */
function poiView(base, folder) {
  const ov = city().overrides?.[base.id] ?? {};
  const lang = view().lang;
  const auto = (lang === "ru" && base.ru) || (lang === "fr" && base.fr) || base.en || base.fr || base.ru;
  return { ...base, folder: folder.id, cat: folder.cat, preset: true, auto, ...ov, catSet: !!ov.cat, name: ov.name || auto };
}

function poiIndex() {
  const out = new Map();
  for (const f of preset()?.folders ?? []) for (const m of f.markers) out.set(m.id, { base: m, folder: f });
  return out;
}

/** Метки папки, которые видит этот пользователь; all — вместе со спрятанными ведущим местами. */
function folderMarkers(f, { all = false } = {}) {
  const c = city();
  if (f.mine) return mine().map(m => ({ ...m, mine: true }));
  const own = c.markers.filter(m => (m.folder ?? CHRONICLE) === f.id && (game.user.isGM || !m.gmOnly));
  if (!f.preset) return own;
  const raw = preset()?.folders.find(x => x.id === f.id)?.markers ?? [];
  const pre = raw.map(b => poiView(b, f)).filter(m => (all || !m.deleted) && (game.user.isGM || !m.gmOnly));
  return [...own, ...pre];
}

function findPicked() {
  if (!picked) return null;
  if (EXT.kinds[picked.kind]) return EXT.kinds[picked.kind].find(picked.id, api) ?? null;
  const c = city();
  switch (picked.kind) {
    case "zone": return c.zones.find(z => z.id === picked.id) ?? null;
    case "found": return found.find(r => r.id === picked.id) ?? null;
    case "poi": { const x = poiIndex().get(picked.id); return x ? poiView(x.base, x.folder) : null; }
    default: {
      const own = c.markers.find(m => m.id === picked.id);
      if (own) return own;
      const p = mine().find(m => m.id === picked.id);
      return p ? { ...p, mine: true } : null;
    }
  }
}

const canEdit = it => game.user.isGM || !!it?.mine;

/* ── Персонажи ────────────────────────────────────────────────────────── */

const CHAR_TYPES = ["vampire", "ghoul", "mortal", "creature"];

/** Персонажи на карте текущего города, которых видит этот пользователь. */
function mapActors() {
  const id = city().id;
  return game.actors.filter(a => cityFlag(a)?.city === id && mapVisible(a));
}

/** Кого можно поставить на карту: свои; ведущему — все персонажи игроков. */
function placeableActors() {
  return game.actors.filter(a => CHAR_TYPES.includes(a.type) && (game.user.isGM ? a.hasPlayerOwner : a.isOwner));
}
/** Подпись под именем в списке: клан Сородича, иначе тип персонажа. */
function kindOf(a) {
  return (a.type === "vampire" && a.clanLabel) || game.i18n.localize(CONFIG.Actor.typeLabels?.[a.type] ?? a.type);
}
/** НПС для ведущего: персонажи без игрока — ставятся на карту скрытыми. */
function npcActors() {
  return game.user.isGM ? game.actors.filter(a => CHAR_TYPES.includes(a.type) && !a.hasPlayerOwner) : [];
}

/**
 * Персонажи деревом папок каталога актёров Foundry (вложенные папки, их цвет и порядок).
 * Раскрытые папки запоминаются у пользователя (view().open, ключ «actors:<id папки>»); при поиске всё раскрыто.
 */
function actorTree(list, row, v) {
  const byName = (x, y) => x.name.localeCompare(y.name, "ru");
  const inFolder = new Map();
  for (const a of list) {
    const k = a.folder?.id ?? "";
    if (!inFolder.has(k)) inFolder.set(k, []);
    inFolder.get(k).push(a);
  }
  // папки, в которых (глубже тоже) есть кто-то из списка, и сколько их там
  const count = new Map();
  for (const [k, arr] of inFolder) for (let f = game.folders.get(k); f; f = f.folder) count.set(f.id, (count.get(f.id) ?? 0) + arr.length);
  const folders = game.folders.filter(f => f.type === "Actor" && count.has(f.id));
  const level = parent => folders.filter(f => (f.folder?.id ?? null) === parent)
    .sort((x, y) => (x.sort - y.sort) || byName(x, y))
    .map(f => {
      const open = !!search || !!v.open[`actors:${f.id}`];
      const color = f.color?.css ?? "";
      return `<details class="rc-afold" data-afold="${f.id}" ${open ? "open" : ""}${color ? ` style="--fc:${esc(color)}"` : ""}>
        <summary><i class="fa-solid fa-folder${open ? "-open" : ""}"></i><span>${esc(f.name)}</span><b>${count.get(f.id)}</b></summary>
        <div class="rc-afold-body">${level(f.id)}${(inFolder.get(f.id) ?? []).length ? `<ul class="rc-chars">${inFolder.get(f.id).sort(byName).map(row).join("")}</ul>` : ""}</div>
      </details>`;
    }).join("");
  const loose = (inFolder.get("") ?? []).sort(byName);
  return level(null) + (loose.length ? `<ul class="rc-chars">${loose.map(row).join("")}</ul>` : "");
}

/** Распоряжаться персонажем (поставить, вывести из группы): владелец или ведущий игры. */
const canManage = a => !!a?.isOwner;
/** Видимые этому пользователю попутчики. */
const crewOf = a => followersOf(a).filter(mapVisible);
function ownerColor(a) {
  const u = game.users.find(u => !u.isGM && a.testUserPermission(u, "OWNER"));
  return u?.color?.css ?? "#b0404c";
}
function statusText(a) {
  const lead = leaderOf(a);
  if (lead) return T("WithLeader", { name: lead.name, status: statusText(lead) });
  const w = whereIs(a);
  if (!w) return T("NotPlaced");
  return w.place || T("Standing");
}

/** Фишки персонажей: портрет в кольце цвета игрока. */
function drawChars() {
  if (!map) return;
  // Попутчики своих фишек не имеют — их лица на фишке ведущего группы.
  const want = new Map(mapActors().filter(a => !leaderOf(a)).map(a => [a.id, a]));
  for (const [id, p] of charPins) if (!want.has(id)) { p.marker.remove(); charPins.delete(id); }
  for (const [id, a] of want) {
    const w = whereIs(a);
    const sel = picked?.kind === "char" && picked.id === id;
    // переставить фишку — перетаскиванием: свою — владелец, любую — ведущий
    const drag = canManage(a);
    const crew = crewOf(a);
    const hid = game.user.isGM && isHiddenOnMap(a);
    const sig = JSON.stringify([a.img, a.name, sel, ownerColor(a), drag, hid, crew.map(c => [c.id, c.img])]);
    let p = charPins.get(id);
    if (p?.sig !== sig) {
      p?.marker.remove();
      const el = document.createElement("div");
      el.className = `rc-char${sel ? " is-picked" : ""}${hid ? " is-hidden" : ""}`;
      el.style.setProperty("--c", ownerColor(a));
      el.innerHTML = `<span class="rc-char-face"><img src="${esc(a.img)}" alt=""></span>`
        + (hid ? `<i class="fa-solid fa-eye-slash rc-char-hid" data-tooltip="${esc(T("HiddenTip"))}"></i>` : "")
        + `<b>${esc(a.name)}</b>`
        + (crew.length ? `<span class="rc-crew">${crew.map(c => `<img src="${esc(c.img)}" alt="" data-crew="${c.id}" data-tooltip="${esc(c.name)}" style="--c:${ownerColor(c)}">`).join("")}</span>` : "");
      el.addEventListener("click", ev => { ev.stopPropagation(); pick("char", ev.target.closest("[data-crew]")?.dataset.crew ?? id); });
      const marker = new gl.Marker({ element: el, anchor: "top", offset: [0, -24], draggable: drag }).setLngLat([w.lng, w.lat]).addTo(map);
      marker.on("dragend", () => { const ll = marker.getLngLat(); placeActor(a, city().id, ll.lat, ll.lng); });
      p = { marker, sig };
      charPins.set(id, p);
    }
    p.marker.setLngLat([w.lng, w.lat]);
  }
  spreadChars(want);
}

/**
 * Фишки, что на экране легли друг на друга (вышли из группы, стоят у одного места), — веером вокруг
 * общей середины, чтобы каждую можно было выделить; подписи в стопке — по наведению. Координаты
 * не меняются, только сдвиг на экране; пересчитывается при каждом масштабе.
 */
function spreadChars(want = null) {
  if (!map) return;
  want ??= new Map(mapActors().filter(a => !leaderOf(a)).map(a => [a.id, a]));
  const items = [...want.values()].map(a => {
    const w = whereIs(a), p = charPins.get(a.id);
    return w && p ? { id: a.id, p, xy: map.project([w.lng, w.lat]) } : null;
  }).filter(Boolean);
  const done = new Set(), R = 36, NEAR = 54;
  for (const x of items) {
    if (done.has(x.id)) continue;
    // все, кто ближе NEAR пикселей к кому-то из стопки
    const stack = [x]; done.add(x.id);
    for (let i = 0; i < stack.length; i++) for (const y of items) {
      if (!done.has(y.id) && Math.hypot(stack[i].xy.x - y.xy.x, stack[i].xy.y - y.xy.y) < NEAR) { stack.push(y); done.add(y.id); }
    }
    const cx = stack.reduce((s, y) => s + y.xy.x, 0) / stack.length, cy = stack.reduce((s, y) => s + y.xy.y, 0) / stack.length;
    stack.forEach((y, i) => {
      const r = stack.length > 1 ? R + (stack.length > 4 ? 8 : 0) : 0, ang = -Math.PI / 2 + (2 * Math.PI * i) / stack.length;
      const dx = stack.length > 1 ? cx + Math.cos(ang) * r - y.xy.x : 0, dy = stack.length > 1 ? cy + Math.sin(ang) * r - y.xy.y : 0;
      y.p.marker.setOffset([Math.round(dx), -24 + Math.round(dy)]);
      y.p.marker.getElement().classList.toggle("is-stacked", stack.length > 1);
    });
  }
}

function clearChars() {
  for (const p of charPins.values()) p.marker.remove();
  charPins.clear();
}

/** Кадр анимации: часы на карте идут вместе с ночными часами. */
function frame(ts) {
  raf = requestAnimationFrame(frame);
  if (!map || ts - lastLabels < 500) return;
  lastLabels = ts;
  paintClock(getClock());
}

function charCard(a) {
  const btn = (act, icon, label, tip = "", cls = "") => `<a class="rc-ibtn ${cls}" data-act="${act}" data-tooltip="${esc(tip || label)}"><i class="fa-solid ${icon}"></i><span>${esc(label)}</span></a>`;
  const lead = leaderOf(a);
  return `<section class="rc-card rc-charcard" style="--c:${ownerColor(a)}">
    <header class="rc-card-head">
      <img src="${esc(a.img)}" alt="">
      <div><b>${esc(a.name)}</b><small data-eta="${a.id}">${esc(statusText(a))}</small></div>
      <a class="rc-x" data-act="unpick" data-tooltip="${esc(L("Close"))}"><i class="fa-solid fa-xmark"></i></a>
    </header>
    <div class="rc-ibtns">
      ${btn("flyChar", "fa-crosshairs", T("Find"))}
      ${a.hasBlood && a.isOwner && huntZoneOf(a) ? btn("huntHere", "fa-moon", T("HuntHere"), T("HuntHereHint", { zone: huntZoneOf(a).name || groundLabel(huntZoneOf(a).grounds) })) : ""}
      ${a.testUserPermission(game.user, "OBSERVER") ? btn("sheet", "fa-id-card", T("Sheet")) : ""}
      ${game.user.isGM ? (isHiddenOnMap(a) ? btn("toggleHidden", "fa-eye", T("Show"), T("ShowHint"), "is-warn") : btn("toggleHidden", "fa-eye-slash", T("Hide"), T("HideHint"))) : ""}
      ${canManage(a) ? btn("unplace", "fa-trash", T("Unplace"), "", "rc-danger") : ""}
    </div>
    ${groupBlock(a, lead)}
    ${canManage(a) ? `<p class="rc-callout"><i class="fa-solid fa-hand-pointer"></i> ${esc(T("DragHint"))}</p>` : ""}
  </section>`;
}

/**
 * Группа в карточке: кто едет вместе, «отделиться», «взять с собой тех, кто рядом» и
 * «присоединить» — своего персонажа (ведущему игры — любого на карте) к этой группе.
 */
function groupBlock(a, lead) {
  const root = lead ?? a;
  const crew = [root, ...crewOf(root)].filter(x => mapVisible(x));
  const inGroup = new Set(groupOf(root).map(x => x.id));
  const here = whereIs(root);
  const cands = mapActors().filter(x => !inGroup.has(x.id) && canManage(x));
  const near = here ? cands.filter(x => { const w = whereIs(x); return w && meters([w.lng, w.lat], [here.lng, here.lat]) <= NEAR_M; }) : [];
  const chip = x => `<span class="rc-gchip ${x === root ? "is-lead" : ""}" style="--c:${ownerColor(x)}"><img src="${esc(x.img)}" alt=""><span>${esc(x.name)}</span>`
    + (x !== root && canManage(x) ? `<a data-act="leaveGroup" data-actor="${x.id}" data-tooltip="${esc(T("LeaveGroup"))}"><i class="fa-solid fa-person-walking-arrow-right"></i></a>` : "")
    + (x === root ? `<i class="fa-solid fa-crown" data-tooltip="${esc(T("GroupLead"))}"></i>` : "") + `</span>`;
  const add = cands.length ? `<div class="rc-row rc-gadd"><select data-gpick>${cands.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select>
      <a class="r-btn" data-act="joinGroup" data-tooltip="${esc(T("JoinHint", { name: root.name }))}"><i class="fa-solid fa-user-plus"></i> ${esc(T("Join"))}</a></div>` : "";
  if (crew.length < 2 && !cands.length) return "";
  return `<div class="rc-group">
    <h4><i class="fa-solid fa-people-group"></i> ${esc(crew.length > 1 ? T("GroupTitle", { n: crew.length }) : T("GroupNone"))}</h4>
    ${crew.length > 1 ? `<div class="rc-gchips">${crew.map(chip).join("")}</div>` : `<p class="rc-note">${esc(T("GroupHint"))}</p>`}
    ${near.length ? `<a class="r-btn rc-gnear" data-act="groupNear"><i class="fa-solid fa-people-arrows"></i> ${esc(T("GroupNear", { n: near.length }))}</a>` : ""}
    ${add}
  </div>`;
}
/** «Рядом» для сбора группы — в пределах квартала. */
const NEAR_M = 250;

/* ── Каркас шторы ─────────────────────────────────────────────────────── */

function mount() {
  let root = document.getElementById(ID);
  if (root) return root;
  root = document.createElement("div");
  root.id = ID;
  root.className = "vtm20 r-city";
  root.innerHTML = `
    <div class="rc-shade" data-close></div>
    <div class="rc-sheet">
      <aside class="rc-side">
        <header class="rc-head"></header>
        <label class="rc-search" data-tooltip="${esc(L("SearchHint"))}"><i class="fa-solid fa-magnifying-glass"></i><input data-search placeholder="${esc(L("Search"))}"></label>
        <div class="rc-body"></div>
      </aside>
      <div class="rc-map"><div class="rc-gl"></div><div class="rc-dawn"></div><div class="rc-tools"></div>
        <div class="rc-clock"></div><aside class="rc-inspector" hidden></aside>
        <nav class="rc-modes"></nav><section class="rc-board" hidden></section><div class="rc-stain-tip" hidden></div></div>
      <div class="rc-slats shut"></div>
      <a class="rc-handle" data-toggle data-tooltip="${esc(L("Hint"))}">
        <i class="fa-solid fa-map-location-dot"></i><span>${esc(L("Button"))}</span><i class="rc-arrow fa-solid fa-chevron-down"></i>
      </a>
    </div>`;
  document.body.appendChild(root);

  root.addEventListener("click", ev => {
    if (ev.target.closest("[data-toggle]")) return toggleCity();
    if (ev.target.closest("[data-close]")) return closeCity();
    const a = ev.target.closest("[data-act]");
    if (a) { ev.preventDefault(); act(a.dataset.act, a); }
  });
  // папки персонажей: раскрыта или свёрнута — запоминается
  root.addEventListener("toggle", ev => {
    const d = ev.target?.closest?.("[data-afold]");
    if (!d || ev.target !== d) return;
    d.querySelector(":scope > summary > i")?.classList.replace(d.open ? "fa-folder" : "fa-folder-open", d.open ? "fa-folder-open" : "fa-folder");
    if (!search) setView({ open: { ...view().open, [`actors:${d.dataset.afold}`]: d.open } });
  }, true);
  root.addEventListener("change", ev => {
    const f = ev.target.dataset.field;
    if (f) edit(f, ev.target.type === "checkbox" ? ev.target.checked : ev.target.value);
  });
  const box = root.querySelector(".rc-map");
  // разметка и доски режимов от модулей (свеча над старинным планом, вкладки Собрания…)
  for (const m of EXT.mounts) m(root, api);
  for (const b of boards()) b.attach(root, api);
  // персонажа из списка слева можно перетащить на план — тот же перенос, что из каталога актёров Foundry
  root.addEventListener("dragstart", ev => {
    const a = game.actors.get(ev.target.closest?.("[data-drag-actor]")?.dataset.dragActor);
    if (!a) return;
    ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "Actor", uuid: a.uuid }));
    ev.dataTransfer.effectAllowed = "move";
    const img = ev.target.querySelector("img");
    if (img) ev.dataTransfer.setDragImage(img, 12, 12);
  });
  box.addEventListener("dragover", ev => ev.preventDefault());
  box.addEventListener("drop", ev => onDrop(ev));
  const input = root.querySelector("[data-search]");
  input.addEventListener("input", () => { search = input.value.trim().toLowerCase(); drawBody(); });
  input.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); geocode(input.value.trim()); } });
  window.addEventListener("keydown", ev => {
    if (!root.classList.contains("open")) return;
    if (ev.target.closest?.("input, textarea, select")) return;
    if (ev.key === "Escape") {
      ev.preventDefault(); ev.stopPropagation();
      const b = boards().find(x => x.mode() !== "map");
      if (b) b.setMode("map");
      else if (draft.length) { draft = []; drawDraft(); }
      else if (placing) { placing = null; drawTools(); }
      else if (tool !== "select") { tool = "select"; drawTools(); drawPins(); }
      else if (picked) { picked = null; drawBody(); drawOverlay(); drawTools(); }
      else closeCity();
    }
    if (ev.key === "Enter" && draft.length > 2) { ev.preventDefault(); finishZone(); }
    if (ev.key === "Delete" && picked) { ev.preventDefault(); remove(); }
  }, true);
  const slats = root.querySelector(".rc-slats");
  for (let i = 0; i < SLATS; i++) {
    const s = document.createElement("i");
    s.style.height = `${100 / SLATS}%`;
    s.style.transitionDelay = `${i * STAGGER}ms`;
    slats.appendChild(s);
  }
  return root;
}

/** Сам объект карты MapLibre — для макросов (null, пока штору не открывали). */
export const cityMap = () => map;

export async function toggleCity() {
  if (busy) return;
  return document.getElementById(ID)?.classList.contains("open") ? closeCity() : openCity();
}

export async function openCity() {
  const root = mount();
  if (busy) return;
  busy = true;
  try {
    state = readWorld();
    privates = readPrivates();
    await loadPresets();
    await ensureMap(root);
    if (shownCity !== city().id) jumpToCity();
    drawAll();
    for (const b of boards()) { b.drawModes(); b.renderBoard(); }
    root.classList.add("open");
    root.querySelector(".rc-slats").classList.remove("shut");
    raf ??= requestAnimationFrame(frame);
  } catch (e) {
    console.error("VTM20 | карта города:", e);
    ui.notifications.error(L("LoadError"));
  }
  setTimeout(() => { busy = false; map?.resize(); }, SLIDE);
}

export function closeCity() {
  const root = document.getElementById(ID);
  if (!root || busy) return;
  busy = true;
  root.querySelector(".rc-slats").classList.add("shut");
  root.classList.remove("open");
  draft = []; drawDraft();
  placing = null;
  if (raf) { cancelAnimationFrame(raf); raf = null; }
  setTimeout(() => { busy = false; }, SLIDE);
}

function jumpToCity() {
  const c = city();
  shownCity = c.id;
  map.jumpTo({ center: [c.center[1], c.center[0]], zoom: c.zoom, pitch: 0, bearing: homeBearing() });
}

/* ── Карта ────────────────────────────────────────────────────────────── */

async function loadLib() {
  if (gl) return gl;
  // Стили Foundry и системы живут в каскадных слоях; CSS MapLibre без слоя перебил бы их все.
  // Кладём его в слой compatibility — ниже системного, чтобы наша шкура побеждала.
  if (!document.getElementById("r-maplibre-css")) {
    const style = document.createElement("style");
    style.id = "r-maplibre-css";
    style.textContent = `@import url("${SYSTEM_PATH}/lib/maplibre/maplibre-gl.css") layer(compatibility);`;
    document.head.appendChild(style);
  }
  if (!window.maplibregl) await new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = `${SYSTEM_PATH}/lib/maplibre/maplibre-gl.js`;
    s.onload = ok; s.onerror = fail;
    document.head.appendChild(s);
  });
  return (gl = window.maplibregl);
}

async function ensureMap(root) {
  if (map) return;
  await loadLib();
  icons ??= await buildIcons();
  const c = city(), v = view();
  shownCity = c.id;
  root.setAttribute("data-style", v.style);
  map = new gl.Map({
    container: root.querySelector(".rc-gl"),
    style: buildStyle(v.style, v.lang),
    center: [c.center[1], c.center[0]], zoom: c.zoom, maxZoom: 19, maxPitch: 70,
    bearing: homeBearing(), ...(styleExt(v.style)?.bounds ? { minZoom: styleExt(v.style).minZoom ?? 0, maxBounds: styleExt(v.style).bounds } : {}),
    attributionControl: { compact: true }, doubleClickZoom: false
  });
  for (const o of EXT.overlays) o.init?.(api);
  map.addControl(new gl.NavigationControl({ visualizePitch: true }), "bottom-left");
  // Стили шторы приходят через @import позже карты — следим за размером контейнера сами.
  new ResizeObserver(() => map.resize()).observe(root.querySelector(".rc-gl"));
  map.on("style.load", addOverlay);
  map.on("click", onMapClick);
  map.on("zoomend", () => spreadChars());
  map.on("dblclick", ev => { if (isDrawing() && draft.length > 2) { ev.preventDefault(); finishZone(); } });
  map.on("mousemove", ev => { if (isDrawing() && draft.length) drawDraft(ev.lngLat); });
  map.on("mouseenter", "rc-poi", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "rc-poi", () => { map.getCanvas().style.cursor = ""; });
  map.on("mousemove", "rc-poi", poiTip);
  map.on("mouseleave", "rc-poi", () => showTip(null));
}

function setStyle() {
  const v = view(), st = styleExt(v.style);
  document.getElementById(ID)?.setAttribute("data-style", v.style);
  map?.setMaxBounds(st?.bounds ?? null);
  map?.setMinZoom(st?.minZoom ?? 0);
  map?.setStyle(buildStyle(v.style, v.lang), { diff: false });
}

/** Детерминированный «шум» по строке — края сургуча у каждой печати свои, но стабильные. */
function hashRand(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

/** Эмблема (SVG одним путём) цветом кости — картинка для холста. */
async function emblem(key) {
  const txt = await fetch(`${SYSTEM_PATH}/assets/icons/city/${key}.svg`).then(r => r.ok ? r.text() : "").catch(() => "");
  if (!txt) return null;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(txt.replace(/<path /g, '<path fill="#f3e7cd" '))}`;
  try { await img.decode(); } catch (e) { return null; }
  return img;
}

/** Картинка печати от модулей (печати фракций и т. п.). */
async function extSeal(key) {
  for (const f of EXT.seals) { const img = await f(key); if (img) return img; }
  return null;
}

/** Сургучная печать: неровный край, блик, вдавленное кольцо и выпуклая эмблема. */
function drawSeal(ctx, S, key, wax, img) {
  const rnd = hashRand(key), c = S / 2, R = S / 2 - 5;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = i / 40 * Math.PI * 2, r = R * (1 + (rnd() - .5) * .09);
    ctx[i ? "lineTo" : "moveTo"](c + Math.cos(t) * r, c + Math.sin(t) * r);
  }
  const g = ctx.createRadialGradient(c - R * .35, c - R * .4, R * .1, c, c, R * 1.05);
  g.addColorStop(0, wax[0]); g.addColorStop(1, wax[1]);
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  // вдавленное кольцо печати
  ctx.beginPath(); ctx.arc(c, c, R * .78, 0, Math.PI * 2);
  ctx.lineWidth = 1.6; ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.stroke();
  ctx.beginPath(); ctx.arc(c, c + .8, R * .78, 0, Math.PI * 2);
  ctx.lineWidth = .8; ctx.strokeStyle = "rgba(255,225,190,.18)"; ctx.stroke();
  if (img) {
    const w = R * 1.12;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 1.5; ctx.shadowOffsetY = 1.2;
    ctx.drawImage(img, c - w / 2, c - w / 2, w, w);
    ctx.restore();
  }
}

/** Значки мест: в эпоху Революции — эмблемы на сургуче, иначе — глиф Font Awesome в тёмном круге цвета категории. */
async function buildIcons() {
  const probe = document.createElement("i");
  probe.style.cssText = "position:absolute;left:-9999px;top:-9999px";
  document.body.appendChild(probe);
  const out = {};
  const all = [
    ...Object.entries(CITY_CATEGORIES).map(([k, c]) => [k, k, c.icon, c.color, null, k]),
    ...Object.entries(CITY_KINDS).map(([k, [icon, cat]]) => [`k-${k}`, k, icon, catOf(cat).color, catOf(cat).icon, cat])
  ];
  const sealed = revolution();
  for (let [k, svg, icon, color, fallback, cat] of all) {
    // штабы фракций — печати мастера (assets/factions/seal-*.webp, tools/build_faction_seals.py)
    const fac = sealed && /^f-/.test(svg) ? await extSeal(svg.slice(2)) : null;
    if (fac) {
      const S = 76, cv = document.createElement("canvas");
      cv.width = cv.height = S;
      const ctx = cv.getContext("2d");
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 5, 0, Math.PI * 2); ctx.fillStyle = "#000"; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 5, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(fac, 5, 5, S - 10, S - 10); ctx.restore();
      out[k] = { width: S, height: S, data: new Uint8Array(ctx.getImageData(0, 0, S, S).data.buffer) };
      sealURL[k] = cv.toDataURL();
      continue;
    }
    if (sealed && SEAL_SVG.has(svg)) {
      const S = 76;
      const cv = document.createElement("canvas");
      cv.width = cv.height = S;
      drawSeal(cv.getContext("2d"), S, k, WAX[cat] ?? WAX.other, await emblem(svg));
      out[k] = { width: S, height: S, data: new Uint8Array(cv.getContext("2d").getImageData(0, 0, S, S).data.buffer) };
      sealURL[k] = cv.toDataURL();
      continue;
    }
    const S = 52;
    probe.className = `fa-solid ${icon}`;
    // Font Awesome 7 пишет content как `"<глиф>" / ""` (с альтернативным текстом) — берём первую строку.
    const raw = getComputedStyle(probe, "::before").content;
    let glyph = raw.match(/^(["'])(.*?)\1/)?.[2] ?? raw;
    // Значка нет в этой сборке Font Awesome — берём значок категории.
    if ((!glyph || raw === "none") && fallback) {
      iconOk[k] = false;
      probe.className = `fa-solid ${fallback}`;
      const r2 = getComputedStyle(probe, "::before").content;
      glyph = r2.match(/^(["'])(.*?)\1/)?.[2] ?? r2;
    }
    const cs = getComputedStyle(probe);
    const font = `${cs.fontWeight} 22px ${cs.fontFamily}`;
    try { await document.fonts.load(font, glyph); } catch (e) {}
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const ctx = cv.getContext("2d");
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(12,10,12,.92)"; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke();
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(glyph, S / 2, S / 2 + 1);
    out[k] = { width: S, height: S, data: new Uint8Array(ctx.getImageData(0, 0, S, S).data.buffer) };
  }
  probe.remove();
  return out;
}

const EMPTY = { type: "FeatureCollection", features: [] };

/** Слои хроники поверх стиля: места, зоны, черновик. Смена стиля их сбрасывает — добавляем заново. */
function addOverlay() {
  for (const [k, img] of Object.entries(icons ?? {})) if (!map.hasImage(`rc-${k}`)) map.addImage(`rc-${k}`, img, { pixelRatio: 2 });
  const md = metros[city().preset];
  const mf = [];
  for (const l of md?.lines ?? []) for (const s of l.segs) mf.push({ type: "Feature", properties: { color: l.color }, geometry: { type: "LineString", coordinates: s } });
  for (const [n, s] of Object.entries(md?.stations ?? {})) mf.push({ type: "Feature", properties: { name: view().lang === "ru" ? s.ru : s.en, hub: s.lines.length > 1 }, geometry: { type: "Point", coordinates: [s.lng, s.lat] } });
  if (map.getSource("rc-metro")) map.getSource("rc-metro").setData({ type: "FeatureCollection", features: mf });
  else map.addSource("rc-metro", { type: "geojson", data: { type: "FeatureCollection", features: mf } });
  for (const s of ["rc-poi", "rc-zones", "rc-zone-labels", "rc-domains", "rc-domain-labels", "rc-draft"]) if (!map.getSource(s)) map.addSource(s, { type: "geojson", data: EMPTY });
  const halo = view().style === "sat" ? "rgba(0,0,0,.9)" : "#0a0808";
  // подписи мест: на гравюре — чернила с бумажным ореолом, ночью — кость на угле
  const ink = view().style === "plan"
    ? { "text-color": "#22140a", "text-halo-color": "rgba(244,234,210,.95)", "text-halo-width": 2.4, "text-halo-blur": .4 }
    : view().style === "plannight"
      ? { "text-color": "#f1e3c3", "text-halo-color": "rgba(14,8,5,.95)", "text-halo-width": 2.2, "text-halo-blur": .4 }
      : { "text-color": "#d6ccc4", "text-halo-color": halo, "text-halo-width": 1.6 };
  const add = l => { if (!map.getLayer(l.id)) map.addLayer(l); };
  const vis = view().metro ? "visible" : "none";
  add({ id: "rc-metro-line", type: "line", source: "rc-metro", filter: ["==", ["geometry-type"], "LineString"], layout: { ...{ "line-cap": "round", "line-join": "round" }, visibility: vis },
    paint: { "line-color": ["get", "color"], "line-width": zoomed(10, 1.5, 15, 4), "line-opacity": .75 } });
  add({ id: "rc-metro-st", type: "circle", source: "rc-metro", filter: ["==", ["geometry-type"], "Point"], minzoom: 11, layout: { visibility: vis },
    paint: { "circle-radius": ["case", ["get", "hub"], 5, 3.5], "circle-color": "#e8dfd6", "circle-stroke-color": "#000", "circle-stroke-width": 1.5 } });
  add({ id: "rc-metro-name", type: "symbol", source: "rc-metro", filter: ["==", ["geometry-type"], "Point"], minzoom: 13,
    layout: { visibility: vis, "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 10.5, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true },
    paint: { "text-color": "#e8dfd6", "text-halo-color": "#000", "text-halo-width": 1.6 } });
  // слои модулей — под зонами и местами (секции, влияние, катакомбы, пятна…)
  for (const o of EXT.overlays) o.add?.(api);
  add({ id: "rc-zone-fill", type: "fill", source: "rc-zones", paint: { "fill-color": ["get", "color"], "fill-opacity": ["case", ["get", "sel"], .3, .15] } });
  add({ id: "rc-zone-line", type: "line", source: "rc-zones", filter: ["!", ["get", "gm"]], paint: { "line-color": ["get", "color"], "line-width": ["case", ["get", "sel"], 3, 1.6] } });
  add({ id: "rc-zone-line-gm", type: "line", source: "rc-zones", filter: ["get", "gm"], paint: { "line-color": ["get", "color"], "line-width": 1.6, "line-dasharray": [3, 2] } });
  add({ id: "rc-zone-label", type: "symbol", source: "rc-zone-labels",
    layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-transform": "uppercase", "text-letter-spacing": .25, "text-max-width": 10 },
    paint: { "text-color": ["get", "color"], "text-halo-color": halo, "text-halo-width": 1.8 } });
  // домены — цветом игрока, пунктиром; свой и выбранный ярче
  add({ id: "rc-domain-fill", type: "fill", source: "rc-domains", paint: { "fill-color": ["get", "color"], "fill-opacity": ["case", ["get", "sel"], .3, ["get", "mine"], .18, .1] } });
  add({ id: "rc-domain-line", type: "line", source: "rc-domains", paint: { "line-color": ["get", "color"], "line-width": ["case", ["get", "sel"], 3.5, 2.2], "line-dasharray": [4, 2] } });
  add({ id: "rc-domain-label", type: "symbol", source: "rc-domain-labels",
    layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-letter-spacing": .1, "text-max-width": 12 },
    paint: { "text-color": ["get", "color"], "text-halo-color": halo, "text-halo-width": 1.8 } });
  const round = { "line-cap": "round", "line-join": "round" };
  const isLineF = ["==", ["geometry-type"], "LineString"];
  add({ id: "rc-poi-sel", type: "circle", source: "rc-poi", filter: ["==", ["get", "id"], ""],
    paint: { "circle-radius": 17, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#d9cfc6", "circle-stroke-width": 2 } });
  add({ id: "rc-poi", type: "symbol", source: "rc-poi",
    layout: {
      "icon-image": ["get", "icon"], "icon-size": zoomed(12, .7, 14, .9, 17, 1.15), "icon-padding": 1, "symbol-sort-key": ["get", "rank"],
      "text-field": ["step", ["zoom"], "", 14, ["get", "label"]], "text-font": ["Noto Sans Bold"], "text-size": zoomed(14, 11.5, 17, 13.5),
      "text-offset": [0, 1.55], "text-anchor": "top", "text-optional": true, "text-max-width": 9, "text-letter-spacing": .02
    },
    paint: ink });
  add({ id: "rc-draft-line", type: "line", source: "rc-draft", paint: { "line-color": "#c9a85a", "line-width": 2, "line-dasharray": [2, 2] } });
  add({ id: "rc-draft-pt", type: "circle", source: "rc-draft", filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-radius": 4, "circle-color": "#c9a85a" } });
  drawOverlay();
}

/** Обновить данные слоёв: места видимых папок, зоны, выделение, булавки. */
function drawOverlay() {
  if (!map?.getSource("rc-poi")) return drawPins();
  const feats = [];
  for (const f of folders().filter(f => f.preset && folderVisible(f))) {
    folderMarkers(f).forEach((m, i) => {
      if (!m.preset) return;
      feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [m.lng, m.lat] },
        properties: { id: m.id, icon: looks(m).image, label: m.name, rank: (m.wiki || m.wd ? 0 : 1000) + i } });
    });
  }
  map.getSource("rc-poi").setData({ type: "FeatureCollection", features: feats });
  map.setFilter("rc-poi-sel", ["==", ["get", "id"], picked?.kind === "poi" ? picked.id : ""]);

  const zones = city().zones.filter(z => game.user.isGM || !z.gmOnly);
  const sel = picked?.kind === "zone" ? picked.id : null;
  map.getSource("rc-zones").setData({ type: "FeatureCollection", features: zones.map(z => ({
    type: "Feature", properties: { id: z.id, color: zoneColor(z), sel: z.id === sel, gm: !!z.gmOnly },
    geometry: { type: "Polygon", coordinates: [[...z.points, z.points[0]].map(([la, ln]) => [ln, la])] } })) });
  const doms = allDomains().filter(d => d.points?.length > 2), dsel = picked?.kind === "domain" ? picked.id : null;
  map.getSource("rc-domains")?.setData({ type: "FeatureCollection", features: doms.map(d => ({
    type: "Feature", properties: { id: d.id, color: d.color, sel: d.id === dsel, mine: d.user === game.user.id },
    geometry: { type: "Polygon", coordinates: [[...d.points, d.points[0]].map(([la, ln]) => [ln, la])] } })) });
  map.getSource("rc-domain-labels")?.setData({ type: "FeatureCollection", features: doms.map(d => {
    const [la, ln] = centroid(d.points);
    return { type: "Feature", properties: { name: L("DomainLabel", { name: d.name }), color: d.color }, geometry: { type: "Point", coordinates: [ln, la] } };
  }) });
  const hunt = !!view().hunt;
  map.getSource("rc-zone-labels").setData({ type: "FeatureCollection", features: zones.filter(z => z.name || (hunt && z.grounds)).map(z => {
    const [la, ln] = centroid(z.points);
    const name = hunt && z.grounds ? `${z.name || groundLabel(z.grounds)} · ${HUNTING_GROUNDS[z.grounds]}` : z.name;
    return { type: "Feature", properties: { name, color: zoneColor(z) }, geometry: { type: "Point", coordinates: [ln, la] } };
  }) });
  for (const o of EXT.overlays) o.draw?.(api);
  drawPins();
  drawChars();
}

/** Цвет зоны: на слое «Угодья» — по угодьям, иначе свой. */
const zoneColor = z => (view().hunt && z.grounds && GROUND_COLORS[z.grounds]) || z.color || "#b0404c";

const centroid = pts => pts.reduce(([a, b], [x, y]) => [a + x / pts.length, b + y / pts.length], [0, 0]);

/** Чернила подписи булавки: на гравюре — тёмные с бумажным ореолом, ночью — кость с угольным. Прописаны в самой
 *  подписи, а не только в CSS: так ореол не теряется, если стили шторы ещё не подгрузились или их перебили. */
const PIN_INK = {
  plan: "color:#22140a;text-shadow:0 0 2px #f4ead2,0 0 2px #f4ead2,0 0 3px #f4ead2,0 0 6px rgba(244,234,210,.95);-webkit-text-stroke:.25px rgba(244,234,210,.6)",
  night: "color:#f1e3c3;text-shadow:0 0 2px #0e0805,0 0 2px #0e0805,0 0 3px #0e0805,0 0 6px rgba(14,8,5,.95)"
};

/** Булавки хроники и личные — HTML-маркеры: их можно перетаскивать. */
function drawPins() {
  if (!map) return;
  const want = new Map();
  for (const f of folders()) {
    if (!folderVisible(f)) continue;
    for (const m of folderMarkers(f)) if (!m.preset) want.set(m.id, m);
  }
  if (picked?.kind === "found") { const r = findPicked(); if (r) want.set(r.id, { ...r, cat: "other", search: true }); }
  for (const [id, p] of pins) if (!want.has(id)) { p.marker.remove(); pins.delete(id); }
  for (const [id, m] of want) {
    const sel = picked?.id === id;
    const drag = !m.search && canEdit(m) && tool === "select";
    const sig = JSON.stringify([m.lat, m.lng, m.cat, m.color, m.name, m.gmOnly, sel, drag, view().style]);
    const old = pins.get(id);
    if (old?.sig === sig) continue;
    old?.marker.remove();
    const c = catOf(m.cat);
    const el = document.createElement("div");
    el.className = `rc-pin${sel ? " is-picked" : ""}${m.mine ? " is-mine" : ""}${m.gmOnly ? " is-gm" : ""}${m.search ? " is-found" : ""}`;
    // метки хроники в эпоху Революции — та же сургучная печать, что у мест
    const seal = !m.search && !m.color && sealURL[m.cat in CITY_CATEGORIES ? m.cat : "other"];
    if (seal) el.classList.add("is-seal");
    el.innerHTML = (seal ? `<img class="rc-seal" src="${seal}" alt="">`
      : `<span style="--c:${esc(m.color || c.color)}"><i class="fa-solid ${m.search ? "fa-magnifying-glass" : c.icon}"></i></span>`)
      + (m.name ? `<b class="rc-pin-label" style="${PIN_INK[view().style] ?? PIN_INK.night}">${esc(m.name)}</b>` : "");
    if (!m.search) {
      el.addEventListener("mousemove", ev => pinTip(ev, m));
      el.addEventListener("mouseleave", () => showTip(null));
    } else el.dataset.tooltip = m.name || L("Unnamed");
    el.addEventListener("click", ev => {
      ev.stopPropagation();
      pick(m.search ? "found" : "marker", id);
    });
    const marker = new gl.Marker({ element: el, anchor: "bottom", draggable: drag }).setLngLat([m.lng, m.lat]).addTo(map);
    marker.on("dragend", () => {
      const { lat, lng } = marker.getLngLat();
      const it = m.mine ? mine().find(x => x.id === id) : city().markers.find(x => x.id === id);
      if (it) { it.lat = lat; it.lng = lng; save({ world: !m.mine, own: !!m.mine }); }
    });
    pins.set(id, { marker, sig });
  }
}

function clearPins() {
  for (const p of pins.values()) p.marker.remove();
  pins.clear();
}

function drawDraft(hover = null) {
  const src = map?.getSource("rc-draft");
  if (!src) return;
  const pts = draft.map(([la, ln]) => [ln, la]);
  if (hover) pts.push([hover.lng, hover.lat]);
  src.setData({ type: "FeatureCollection", features: [
    ...(pts.length > 1 ? [{ type: "Feature", geometry: { type: "LineString", coordinates: pts }, properties: {} }] : []),
    ...draft.map(([la, ln]) => ({ type: "Feature", geometry: { type: "Point", coordinates: [ln, la] }, properties: {} }))
  ] });
}

function onMapClick(ev) {
  if (ev.originalEvent?.target?.closest?.(".rc-pin, .rc-char")) return;
  for (const c of EXT.clicks) if (c.place?.(ev, api)) return;
  const ll = ev.lngLat;
  if (placing) {
    const a = game.actors.get(placing);
    placing = null; drawTools();
    if (a) placeActor(a, city().id, ll.lat, ll.lng, "", npcHidden(a)).then(() => pick("char", a.id));
    return;
  }
  if (tool === "marker") return addMarker(ll.lat, ll.lng);
  const tm = EXT.toolModes.find(t => t.id === tool);
  if (tm) return tm.click(ll, api);
  if (isDrawing()) {
    if (!game.user.isGM && tool !== "domain") return;
    const last = draft.at(-1);
    if (!last || Math.abs(last[0] - ll.lat) + Math.abs(last[1] - ll.lng) > 1e-7) draft.push([ll.lat, ll.lng]);
    drawDraft();
    return;
  }
  for (const c of EXT.clicks) if (c.hit?.(ev, api)) return;     // объекты модулей поверх зон (пятна…)
  const hit = map.queryRenderedFeatures(ev.point, { layers: ["rc-poi", "rc-zone-fill", "rc-domain-fill"].filter(l => map.getLayer(l)) });
  const poi = hit.find(f => f.layer.id === "rc-poi");
  if (poi) return pick("poi", poi.properties.id);
  // зона или домен под курсором: из перекрытых — меньшая по площади (домен внутри квартала и наоборот)
  const areas = hit.filter(f => f.layer.id === "rc-zone-fill" || f.layer.id === "rc-domain-fill").map(f => {
    const kind = f.layer.id === "rc-zone-fill" ? "zone" : "domain";
    const it = kind === "zone" ? city().zones.find(z => z.id === f.properties.id) : domainById(f.properties.id);
    return it ? { kind, id: it.id, area: areaOf(it.points) } : null;
  }).filter(Boolean).sort((a, b) => a.area - b.area);
  if (areas.length) return pick(areas[0].kind, areas[0].id);
  for (const c of EXT.clicks) if (c.pick?.(ev, api)) return;
  if (picked) { picked = null; drawBody(); drawOverlay(); }
}

function addMarker(lat, lng, name = "") {
  const m = { id: uid(), lat, lng, name, cat: "other", color: "", text: "", gmOnly: false, sceneId: "", journalId: "" };
  if (game.user.isGM) { m.folder = CHRONICLE; city().markers.push(m); save({ own: false }); }
  else { mine().push(m); save({ world: false }); }
  tool = "select"; drawTools();
  pick("marker", m.id);
}

/** Чертим многоугольник: обычная зона или угодья (инструмент «Угодья» сразу ставит вид угодий и их цвет). */
const isDrawing = () => tool === "zone" || tool === "grounds" || tool === "domain";

function finishZone() {
  if (tool === "domain") return finishDomain();
  const g = tool === "grounds" ? drawGround : "";
  const z = { id: uid(), name: g ? groundLabel(g) : "", color: g ? GROUND_COLORS[g] : "#b0404c", owner: "", text: "", gmOnly: false, points: draft, ...(g ? { grounds: g } : {}) };
  city().zones.push(z);
  draft = []; drawDraft();
  // угодья чертят подряд: инструмент остаётся, зона выбрана — справа можно вписать хозяина домена
  if (!g) { tool = "select"; drawTools(); }
  save({ own: false });
  pick("zone", z.id);
}

/** Домен обведён: хозяин — свой персонаж игрока (ведущему — выделенный жетон или первый Сородич), потом можно сменить справа. */
async function finishDomain() {
  const owners = domainOwners();
  const owner = [game.user.character, canvas?.tokens?.controlled?.[0]?.actor].find(a => a && owners.includes(a)) ?? owners[0];
  if (!owner) { ui.notifications.warn(L("DomainNoOwner")); draft = []; drawDraft(); return; }
  const d = { id: uid(), owner: owner.id, text: "", points: draft };
  draft = []; drawDraft();
  tool = "select"; drawTools();
  await saveDomains(game.user, [...domainsOf(game.user), d]);
  pick("domain", d.id);
}

function pick(kind, id) {
  picked = { kind, id };
  menuFolder = null;
  drawBody(); drawOverlay(); drawTools();
}

function fly(lat, lng, zoom = 16) {
  map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), zoom), duration: 900 });
}

/* ── Поиск адресов (Photon, OpenStreetMap) ───────────────────────────── */

async function geocode(q) {
  if (!q) { found = []; return drawBody(); }
  const c = map.getCenter();
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}`;
    const data = await fetch(url).then(r => r.json());
    found = (data.features ?? []).map((f, i) => {
      const p = f.properties;
      return { id: `found-${i}`, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
        name: p.name || [p.housenumber, p.street].filter(Boolean).join(" ") || q,
        sub: [p.name && p.street ? [p.housenumber, p.street].filter(Boolean).join(" ") : "", p.district, p.city].filter(Boolean).join(", ") };
    });
    if (!found.length) ui.notifications.info(L("NothingFound"));
  } catch (e) { found = []; ui.notifications.warn(L("SearchFailed")); }
  drawBody();
}

/* ── Боковая панель и инструменты ────────────────────────────────────── */

function drawAll() {
  document.getElementById(ID)?.setAttribute("data-style", view().style);
  drawHead(); drawTools(); drawBody(); drawOverlay(); drawClock();
}

function drawHead() {
  const head = document.querySelector(`#${ID} .rc-head`);
  if (!head) return;
  const c = city();
  const cities = Object.values(state.cities);
  head.innerHTML = (game.user.isGM ? `
      <div class="rc-cityrow">
        <input class="rc-city" data-field="cityName" value="${esc(c.name)}">
        <a data-act="addCity" data-tooltip="${esc(L("AddCity"))}"><i class="fa-solid fa-plus"></i></a>
        ${cities.length > 1 ? `<a data-act="delCity" data-tooltip="${esc(L("DelCity"))}"><i class="fa-solid fa-trash"></i></a>` : ""}
      </div>
      ${cities.length > 1 ? `<select class="rc-citysel" data-field="current">${cities.map(x => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : ""}`
    : `<h2>${esc(c.name)}</h2>`) + `<span class="rc-sub">${esc(L("Subtitle"))}</span>`;
}

/** Бросили актёра из списка Foundry на карту — поставить туда. */
async function onDrop(ev) {
  let data;
  try { data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev); } catch (e) { return; }
  if (data?.type !== "Actor" || !map) return;
  ev.preventDefault();
  const a = await fromUuid(data.uuid);
  if (!a?.isOwner) return ui.notifications.warn(T("NotYours"));
  const w = whereIs(a);
  const r = map.getCanvas().getBoundingClientRect();
  const ll = map.unproject([ev.clientX - r.left, ev.clientY - r.top]);
  await placeActor(a, city().id, ll.lat, ll.lng, "", npcHidden(a));
  pick("char", a.id);
}

/** НПС, впервые поставленный на карту, — скрыт от игроков (ведущий покажет кнопкой «Показать»). */
function npcHidden(a) {
  if (a.hasPlayerOwner || cityFlag(a)?.hidden !== undefined) return {};
  ui.notifications.info(T("NpcPlacedHidden", { name: a.name }));
  return { hidden: true };
}

function drawTools() {
  const box = document.querySelector(`#${ID} .rc-tools`);
  if (!box) return;
  const v = view();
  const btn = (t, icon, tip, gm = false) => gm && !game.user.isGM ? "" :
    `<a class="${tool === t ? "on" : ""}" data-act="tool" data-tool="${t}" data-tooltip="${esc(L(tip))}"><i class="fa-solid ${icon}"></i></a>`;
  // Группы кнопок с подписями (Г3); пустая группа не показывается
  const group = (cap, inner, cls = "", attrs = "") => inner.trim() ? `<div class="rc-tgroup">
      <div class="rc-toolset ${cls}" ${attrs}>${inner}</div><small>${esc(L(`Group.${cap}`))}</small></div>` : "";
  box.innerHTML = `
    ${group("Tools", `${btn("select", "fa-arrow-pointer", "ToolSelect")}${btn("marker", "fa-location-dot", "ToolMarker")}${btn("zone", "fa-draw-polygon", "ToolZone", true)}${btn("grounds", "fa-paw", "ToolGrounds", true)}${domainOwners().length ? btn("domain", "fa-crown", "ToolDomain") : ""}${EXT.toolModes.filter(t => !t.when || t.when()).map(t => btn(t.id, t.icon, t.tip, t.gm)).join("")}`)}
    ${group("Era", eraStyles().map(k => `<a class="${v.style === k ? "on" : ""}" data-act="style" data-style="${k}">${esc(styleExt(k)?.label ?? L(`Style.${k}`))}</a>`).join(""), "rc-textset")}
    ${group("Lang", eraLangs().map(k => `<a class="${v.lang === k ? "on" : ""}" data-act="lang" data-lang="${k}">${esc(L(`Lang.${k}`))}</a>`).join(""), "rc-textset", `data-tooltip="${esc(L("LangHint"))}"`)}
    ${group("Layers", `<a class="${v.hunt ? "on" : ""}" data-act="huntLayer" data-tooltip="${esc(L("HuntLayer"))}"><i class="fa-solid fa-layer-group"></i></a>${metros[city().preset] ? `<a class="${v.metro ? "on" : ""}" data-act="metro" data-tooltip="${esc(L("MetroToggle"))}"><i class="fa-solid fa-train-subway"></i></a>` : ""}${EXT.tools.map(t => t(api)).join("")}`)}
    ${group("View", `${styleExt(v.style) ? "" : `<a data-act="tilt" data-tooltip="${esc(L("Tilt"))}"><i class="fa-solid fa-cube"></i></a>`}<a data-act="goHome" data-tooltip="${esc(L("GoHome"))}"><i class="fa-solid fa-house"></i></a>`)}
    ${hint()}`;
  syncAim();
}

/** Подсказка над картой: что сейчас сделает щелчок. */
function hint() {
  const bar = (icon, text) => `<div class="rc-hintbar"><i class="fa-solid ${icon}"></i> ${esc(text)} <kbd>Esc</kbd></div>`;
  if (placing) return bar("fa-location-crosshairs", T("PlaceHint", { name: game.actors.get(placing)?.name ?? "" }));
  if (tool === "zone") return bar("fa-draw-polygon", L("ZoneHint"));
  if (tool === "domain") return bar("fa-crown", L("DomainDrawHint"));
  // угодья: какие чертим — выбором прямо в подсказке
  if (tool === "grounds") return `<div class="rc-hintbar rc-groundbar"><i class="fa-solid fa-paw"></i> ${esc(L("GroundsHint"))}
    <span class="rc-groundpick">${Object.entries(HUNTING_GROUNDS).map(([k, d]) => `<a class="${k === drawGround ? "on" : ""}" data-act="drawGround" data-ground="${k}" style="--g:${GROUND_COLORS[k]}"><i></i>${esc(groundLabel(k))} <b>${d}</b></a>`).join("")}</span>
    <kbd>Esc</kbd></div>`;
  if (tool === "marker") return bar("fa-location-dot", L("MarkerHint"));
  const tm = EXT.toolModes.find(t => t.id === tool);
  if (tm?.hint) return bar(tm.icon, tm.hint());
  return "";
}

/** Прицельный курсор, когда щелчок по карте что-то ставит или задаёт цель. */
function syncAim() {
  const root = document.getElementById(ID);
  if (!root) return;
  if (tool !== "select" || placing) root.setAttribute("data-aim", "");
  else root.removeAttribute("data-aim");
}

/* ── Часы на карте ────────────────────────────────────────────────────── */

const RATES = [1, 10, 60, 300];

/** Часы ночи в углу карты; ведущему — пуск, скорость и плавная промотка. */
function drawClock() {
  const box = document.querySelector(`#${ID} .rc-clock`);
  if (!box || !state) return;
  const run = clockRunning(), rate = clockRate();
  const C = k => L(`Clock.${k}`);
  // Та же плашка ночи, что в полосе нексуса (Г1); под ней — кнопки хода времени для ведущего
  box.innerHTML = `${plateHTML()}
    ${game.user.isGM ? `<div class="rc-clock-ctl">
      <a class="rc-clock-run ${run ? "on" : ""}" data-act="clockRun" data-tooltip="${esc(C(run ? "Pause" : "Run"))}"><i class="fa-solid ${run ? "fa-pause" : "fa-play"}"></i></a>
      <span class="rc-seg rc-clock-rates">${RATES.map(r => `<a class="${Math.abs(rate - r) < .01 ? "on" : ""}" data-act="clockRate" data-rate="${r}" data-tooltip="${esc(C("RateHint"))}">×${r}</a>`).join("")}</span>
      <span class="rc-seg">${[10, 30, 60].map(m => `<a data-act="clockAdd" data-min="${m}" data-tooltip="${esc(C("AddHint"))}">+${m < 60 ? `${m}${T("Min")}` : `1${T("H")}`}</a>`).join("")}</span>
      <a data-act="clockDawn" data-tooltip="${esc(C("ToDawn"))}"><i class="fa-solid fa-sun"></i></a>
    </div>` : ""}`;
  paintClock();
}

/** Раз в полсекунды — только текст: кнопки не перерисовываются, пока по ним жмут. */
function paintClock() {
  paintPlate(document.querySelector(`#${ID} .rc-clock`));
  paintDawn();
}

/**
 * Рассвет на карте (Г2): в последний час ночи восточный край плана теплеет, к восходу — сильнее;
 * днём тепло держится. Восток — с учётом поворота карты.
 */
function paintDawn() {
  const box = document.querySelector(`#${ID} .rc-map`);
  if (!box) return;
  const s = nightSpan();
  const k = !s.night ? 1 : s.left < MS_HOUR ? 1 - s.left / MS_HOUR : 0;
  const a = `${Math.round(90 - (map?.getBearing() ?? 0))}deg`;
  if (box.style.getPropertyValue("--dawn") !== k.toFixed(2)) box.style.setProperty("--dawn", k.toFixed(2));
  if (box.style.getPropertyValue("--dawn-a") !== a) box.style.setProperty("--dawn-a", a);
}

function drawBody() {
  const body = document.querySelector(`#${ID} .rc-body`);
  if (!body) return;
  const side = body.closest(".rc-side");
  const top = side.scrollTop;
  const it = findPicked();
  const v = view();
  const q = m => !search || [m.name, m.text, m.en, m.ru, m.owner, districtName(m.d)].some(s => String(s ?? "").toLowerCase().includes(search));
  const row = (kind, m, icon, color) => `<li class="${picked?.id === m.id ? "on" : ""} ${m.deleted ? "is-deleted" : ""}" data-act="fly" data-kind="${kind}" data-id="${m.id}">
      <i class="fa-solid ${icon}" style="color:${esc(color)}"></i><span>${esc(m.name || L("Unnamed"))}</span>
      ${m.gmOnly ? `<i class="fa-solid fa-lock rc-mini" data-tooltip="${esc(L("GmOnly"))}"></i>` : ""}${m.text ? `<i class="fa-solid fa-feather rc-mini" data-tooltip="${esc(L("HasNote"))}"></i>` : ""}</li>`;

  let html = "";
  if (found.length) html += `<section class="rc-found"><h3 class="rc-sect">${esc(L("Found"))}<a data-act="clearFound" data-tooltip="${esc(L("Close"))}"><i class="fa-solid fa-xmark"></i></a></h3><ul>${found.map(r =>
    `<li class="${picked?.id === r.id ? "on" : ""}" data-act="fly" data-kind="found" data-id="${r.id}"><i class="fa-solid fa-magnifying-glass"></i><span>${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span></li>`).join("")}</ul></section>`;

  // Персонажи: на карте — выбрать; ещё нет — поставить.
  const onMap = mapActors();
  const ids = new Set(onMap.map(a => a.id));
  const off = placeableActors().filter(a => !ids.has(a.id));
  const cq = a => !search || a.name.toLowerCase().includes(search);
  const onRows = onMap.filter(cq).map(a => `<li class="${picked?.kind === "char" && picked.id === a.id ? "on" : ""} ${leaderOf(a) ? "is-crew" : ""}" draggable="true" data-drag-actor="${a.id}" data-act="pickChar" data-actor="${a.id}" style="--c:${ownerColor(a)}">
      <img src="${esc(a.img)}" alt=""><span>${esc(a.name)}<small data-eta="${a.id}">${esc(statusText(a))}</small></span>${game.user.isGM && isHiddenOnMap(a) ? `<i class="fa-solid fa-eye-slash rc-mini" data-tooltip="${esc(T("HiddenTip"))}"></i>` : ""}</li>`);
  // Не на карте: персонажи игроков и (ведущему) НПС — деревом папок каталога актёров Foundry.
  const npcIds = new Set(npcActors().map(a => a.id));
  const offAll = [...off, ...npcActors().filter(a => !ids.has(a.id) && cityFlag(a)?.city !== city().id)].filter(cq);
  // Лицо, клан или тип; строку можно перетащить на план (Г5) или щёлкнуть и поставить щелчком по карте
  const offRow = a => {
    const npc = npcIds.has(a.id);
    return `<li class="is-off" draggable="true" data-drag-actor="${a.id}" data-act="${npc ? "placeNpc" : "placeChar"}" data-actor="${a.id}" data-tooltip="${esc(T(npc ? "PlaceNpcTip" : "PlaceTip"))}">
      <img src="${esc(a.img)}" alt=""><span>${esc(a.name)}<small>${esc(kindOf(a))}</small></span><i class="fa-solid fa-location-crosshairs rc-mini"></i></li>`;
  };
  if (onRows.length || offAll.length) {
    html += `<h3 class="rc-sect">${esc(T("Characters"))} <b>${onMap.length}</b></h3>`;
    if (onRows.length) html += `<ul class="rc-chars">${onRows.join("")}</ul>`;
    if (offAll.length) html += `<div class="rc-atree"><h4 class="rc-sub">${esc(T("OffMap"))} <b>${offAll.length}</b><small>${esc(T("OffMapHint"))}</small></h4>${actorTree(offAll, offRow, v)}</div>`;
  }

  html += `<div class="rc-lists"><h3 class="rc-sect">${esc(L("Folders"))}${game.user.isGM ? `<a data-act="addFolder" data-tooltip="${esc(L("AddFolder"))}"><i class="fa-solid fa-folder-plus"></i></a>` : ""}</h3>`;
  for (const f of folders()) {
    const marks = folderMarkers(f, { all: game.user.isGM }).filter(q);
    if (search && !marks.length) continue;
    if (f.mine && !marks.length) continue;
    const vis = folderVisible(f);
    const open = search ? true : !!v.open[vKey(f)];
    const icon = f.mine ? "fa-user-pen" : f.preset ? catOf(f.cat).icon : "fa-folder";
    const color = f.preset ? catOf(f.cat).color : "#b9b1a9";
    const live = marks.filter(m => !m.deleted).length;
    const hiddenCount = marks.length - live;
    let rows = "", lastD = null;
    for (const m of marks.slice(0, LIST_CAP)) {
      if (f.preset && m.d && m.d !== lastD) { lastD = m.d; rows += `<li class="rc-dist">${esc(districtName(m.d))}</li>`; }
      const lk = looks(m);
      rows += row(m.preset ? "poi" : "marker", m, lk.icon, lk.color);
    }
    const gmMenu = game.user.isGM && !f.mine;
    const menu = menuFolder === f.id ? `<div class="rc-fmenu">
        <a data-act="frename" data-folder="${f.id}"><i class="fa-solid fa-pen"></i> ${esc(L("Rename"))}</a>
        <a data-act="fgm" data-folder="${f.id}"><i class="fa-solid ${f.gmOnly ? "fa-lock-open" : "fa-lock"}"></i> ${esc(L(f.gmOnly ? "FolderShow" : "FolderHide"))}</a>
        ${hiddenCount ? `<a data-act="frestore" data-folder="${f.id}"><i class="fa-solid fa-rotate-left"></i> ${esc(L("Restore", { n: hiddenCount }))}</a>` : ""}
        ${f.preset || (f.custom && f.id !== CHRONICLE) ? `<a class="rc-danger" data-act="fdel" data-folder="${f.id}"><i class="fa-solid fa-trash"></i> ${esc(L("DelFolder"))}</a>` : ""}
      </div>` : "";
    html += `<div class="rc-folder ${open ? "open" : ""} ${vis ? "" : "is-off"}">
      <header data-act="fopen" data-folder="${f.id}">
        <i class="fa-solid fa-caret-right rc-caret"></i>
        <i class="fa-solid ${icon}" style="color:${color}"></i>
        <span class="rc-fname" data-tooltip="${esc(f.name)}">${esc(f.name)}</span>
        ${f.gmOnly ? `<i class="fa-solid fa-lock rc-mini" data-tooltip="${esc(L("GmOnly"))}"></i>` : ""}<b>${live}</b>
        ${gmMenu ? `<a class="rc-fmore ${menuFolder === f.id ? "on" : ""}" data-act="fmenu" data-folder="${f.id}" data-tooltip="${esc(L("FolderMenu"))}"><i class="fa-solid fa-ellipsis"></i></a>` : ""}
        <a data-act="feye" data-folder="${f.id}" data-tooltip="${esc(L("FolderEye"))}"><i class="fa-solid ${vis ? "fa-eye" : "fa-eye-slash"}"></i></a>
      </header>${menu}
      ${open ? `<ul>${rows || `<li class="empty">${esc(L("NoMarkers"))}</li>`}
        ${marks.length > LIST_CAP ? `<li class="empty">${esc(L("More", { n: marks.length - LIST_CAP }))}</li>` : ""}</ul>` : ""}
    </div>`;
  }
  const zones = city().zones.filter(z => (game.user.isGM || !z.gmOnly) && q(z));
  html += `<h3 class="rc-sect">${esc(L("Zones"))} <b>${zones.length}</b></h3>
    <ul class="rc-zones">${zones.map(z => row("zone", z, "fa-draw-polygon", z.color)).join("") || `<li class="empty">${esc(L("NoZones"))}</li>`}</ul>`;
  // домены персонажей — цветом игрока; пусто — подсказка, как обвести свой
  const doms = allDomains().filter(d => q(d));
  html += `<h3 class="rc-sect">${esc(L("Domains"))} <b>${doms.length}</b></h3>
    <ul class="rc-zones">${doms.map(d => row("domain", d, "fa-crown", d.color)).join("") || `<li class="empty">${esc(L(domainOwners().length ? "NoDomainsDraw" : "NoDomains"))}</li>`}</ul></div>`;
  if (game.user.isGM) html += `<footer class="rc-foot"><a class="r-btn" data-act="home" data-tooltip="${esc(L("SetHomeHint"))}"><i class="fa-solid fa-crosshairs"></i> ${esc(L("SetHome"))}</a></footer>`;
  if (preset()) html += `<p class="rc-src">${esc(L("PresetSource", { date: preset().built ?? "" }))}</p>`;
  body.innerHTML = html;
  side.scrollTop = top;
  drawInspector();
}

/** Инспектор справа поверх карты: выбранная метка, место, зона, адрес или персонаж. */
function drawInspector() {
  const box = document.querySelector(`#${ID} .rc-inspector`);
  if (!box) return;
  const ae = document.activeElement;
  // Не перерисовывать под пальцами: в инспекторе сейчас печатают.
  if (box.contains(ae) && ae.matches("textarea, input:not([type=checkbox]):not([type=color])") && !ae.matches("[data-field=planMin]")) return;
  let html = "";
  if (picked?.kind === "char") { const a = game.actors.get(picked.id); if (a && cityFlag(a)) html = charCard(a); }
  else { const it = findPicked(); if (it) html = editor(it); }
  box.hidden = !html;
  if (box.innerHTML !== html) { const top = box.scrollTop; box.innerHTML = html; box.scrollTop = top; }
}

/** Редактор выбранной метки, места, зоны или найденного адреса. */
function editor(it) {
  const kind = picked.kind;
  if (kind === "found") return `<section class="rc-edit">
    <div class="rc-edit-head"><i class="fa-solid fa-magnifying-glass"></i><b>${esc(it.name)}</b><a data-act="unpick"><i class="fa-solid fa-xmark"></i></a></div>
    ${it.sub ? `<p class="rc-facts">${esc(it.sub)}</p>` : ""}
    <div class="rc-edit-acts"><a class="r-btn" data-act="pinFound"><i class="fa-solid fa-location-dot"></i> ${esc(L("PinHere"))}</a></div></section>`;

  if (EXT.kinds[kind]) return EXT.kinds[kind].editor(it, api);
  const isZone = kind === "zone", isPoi = kind === "poi";
  const edit = isZone || isPoi ? game.user.isGM : canEdit(it);
  const ro = edit ? "" : "disabled";
  const opt = (v, cur, label) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;
  const scenes = [`<option value="">—</option>`, ...game.scenes.filter(s => s.visible || game.user.isGM).map(s => opt(s.id, it.sceneId, s.name))].join("");
  const journals = [`<option value="">—</option>`, ...game.journal.filter(j => j.testUserPermission(game.user, "OBSERVER")).map(j => opt(j.id, it.journalId, j.name))].join("");
  const groupOf = k => CITY_CATEGORIES[k].group ?? (CITY_CATEGORIES[k].chronicle ? "chronicle" : "city");
  const catGroup = g => Object.keys(CITY_CATEGORIES).filter(k => groupOf(k) === g).map(k => opt(k, it.cat, L(`Cat.${k}`))).join("");
  const cats = `<optgroup label="${esc(L("CatChronicle"))}">${catGroup("chronicle")}</optgroup>`
    + (revolution() || ["night", "faction"].includes(groupOf(it.cat in CITY_CATEGORIES ? it.cat : "other"))
      ? `<optgroup label="${esc(L("CatNight"))}">${catGroup("night")}</optgroup><optgroup label="${esc(L("CatFaction"))}">${catGroup("faction")}</optgroup>` : "")
    + `<optgroup label="${esc(L("CatCity"))}">${catGroup("city")}</optgroup>`;
  const ownFolders = city().folders.map(f => opt(f.id, it.folder ?? CHRONICLE, f.name)).join("");
  const text = edit
    ? `<textarea data-field="text" rows="4" placeholder="${esc(L("TextHint"))}">${esc(it.text)}</textarea>`
    : it.text ? `<p class="rc-text">${esc(it.text)}</p>` : "";
  const wiki = it.wiki ? (() => { const [lng, ...t] = it.wiki.split(":"); return `https://${lng}.wikipedia.org/wiki/${encodeURIComponent(t.join(":").replace(/ /g, "_"))}`; })()
    : it.wd ? `https://www.wikidata.org/wiki/${encodeURIComponent(it.wd)}` : "";
  const other = view().lang === "ru" ? it.en : it.ru;
  const facts = isPoi ? [districtName(it.d), other && other !== it.name && !it.generic ? other : "", it.addr, it.hours].filter(Boolean).map(esc).join(" · ") : "";
  const lk = isZone ? { icon: "fa-draw-polygon", color: it.color || "#b0404c" } : looks(it);
  const color = lk.color;
  return `<section class="rc-edit">
    <div class="rc-edit-head"><i class="fa-solid ${lk.icon}" style="color:${esc(color)}"></i>
      <input data-field="name" value="${esc(isPoi && !city().overrides[it.id]?.name ? "" : it.name)}" placeholder="${esc(isPoi ? it.auto : L(isZone ? "ZoneName" : "MarkerName"))}" ${ro}>
      <a data-act="unpick" data-tooltip="${esc(L("Close"))}"><i class="fa-solid fa-xmark"></i></a></div>
    ${facts || wiki ? `<p class="rc-facts">${facts}${wiki ? `${facts ? " · " : ""}<a href="${esc(wiki)}" target="_blank" rel="noopener">${esc(L(it.wiki ? "Wiki" : "Wikidata"))}</a>` : ""}</p>` : ""}
    ${isZone ? `<label>${esc(L("Owner"))}<input data-field="owner" value="${esc(it.owner)}" placeholder="${esc(L("OwnerHint"))}" ${ro}></label>
      <label>${esc(L("Grounds"))}<select data-field="grounds" ${ro}><option value="">${esc(L("GroundsNone"))}</option>${Object.entries(HUNTING_GROUNDS).map(([k, d]) => opt(k, it.grounds, `${groundLabel(k)} · ${d}`)).join("")}</select></label>`
      : `<label>${esc(L("Category"))}<select data-field="cat" ${ro}>${cats}</select></label>
      ${!isPoi && game.user.isGM && !it.mine ? `<label>${esc(L("Folder"))}<select data-field="folder">${ownFolders}</select></label>` : ""}`}
    ${isPoi ? "" : `<label class="rc-row">${esc(L("Color"))}<input type="color" data-field="color" value="${esc(color)}" ${ro}></label>`}
    ${text}
    <label>${esc(L("Scene"))}<select data-field="sceneId" ${ro}>${scenes}</select></label>
    <label>${esc(L("Journal"))}<select data-field="journalId" ${ro}>${journals}</select></label>
    ${game.user.isGM && !it.mine ? `<label class="rc-row rc-check"><input type="checkbox" data-field="gmOnly" ${it.gmOnly ? "checked" : ""}> ${esc(L("GmOnly"))}</label>` : ""}
    <div class="rc-edit-acts">
      ${isZone && it.grounds ? `<a class="r-btn" data-act="huntZone" data-tooltip="${esc(L("HuntZoneHint"))}"><i class="fa-solid fa-moon"></i> ${esc(L("HuntZone"))}</a>` : ""}
      ${it.sceneId ? `<a class="r-btn" data-act="openScene"><i class="fa-solid fa-map"></i> ${esc(L("OpenScene"))}</a>` : ""}
      ${it.journalId ? `<a class="r-btn" data-act="openJournal"><i class="fa-solid fa-book-open"></i> ${esc(L("OpenJournal"))}</a>` : ""}
      ${game.user.isGM ? `<a class="r-btn" data-act="ping" data-tooltip="${esc(L("PingHint"))}"><i class="fa-solid fa-bullseye"></i> ${esc(L("Ping"))}</a>` : ""}
      ${isPoi && game.user.isGM && it.deleted ? `<a class="r-btn" data-act="unhide"><i class="fa-solid fa-rotate-left"></i> ${esc(L("Unhide"))}</a>`
        : edit ? `<a class="r-btn rc-danger" data-act="remove" data-tooltip="${esc(L(isPoi ? "HidePoi" : "Delete"))}"><i class="fa-solid ${isPoi ? "fa-eye-slash" : "fa-trash"}"></i></a>` : ""}
    </div>
  </section>`;
}

async function edit(field, value) {
  const c = city();
  if (field === "cityName") { c.name = value; save({ own: false }); return; }
  if (field === "current") return switchCity(value);
  const it = findPicked();
  if (!it) return;
  if (EXT.kinds[picked.kind]) return EXT.kinds[picked.kind].edit(it, field, value, api);
  if (picked.kind === "poi") {
    if (!game.user.isGM) return;
    const ov = (c.overrides[it.id] ??= {});
    if (value === "" || value === false) delete ov[field]; else ov[field] = value;
    save({ own: false });
  } else if (picked.kind === "zone") {
    if (!game.user.isGM) return;
    c.zones.find(z => z.id === it.id)[field] = value;
    save({ own: false });
  } else if (it.mine) {
    const m = mine().find(x => x.id === it.id);
    if (m) m[field] = value;
    save({ world: false });
  } else {
    if (!game.user.isGM) return;
    c.markers.find(x => x.id === it.id)[field] = value;
    save({ own: false });
  }
  drawBody();
  drawOverlay();
}

async function switchCity(id) {
  state.current = id;
  picked = null; found = []; draft = [];
  clearPins(); clearChars();
  save({ own: false });
  await loadPresets();
  jumpToCity();
  drawAll();
}

function remove() {
  const it = findPicked();
  if (!it) return;
  const c = city();
  if (picked.kind === "zone") { if (!game.user.isGM) return; c.zones = c.zones.filter(z => z.id !== it.id); save({ own: false }); }
  else if (EXT.kinds[picked.kind]) return EXT.kinds[picked.kind].remove(it, api);
  else if (picked.kind === "poi") { if (!game.user.isGM) return; (c.overrides[it.id] ??= {}).deleted = true; save({ own: false }); }
  else if (picked.kind === "found") { found = found.filter(r => r.id !== it.id); }
  else if (it.mine) { privates[c.id] = mine().filter(m => m.id !== it.id); save({ world: false }); }
  else if (game.user.isGM) { c.markers = c.markers.filter(m => m.id !== it.id); save({ own: false }); }
  else return;
  picked = null;
  drawBody(); drawOverlay();
}

async function prompt(title, value = "") {
  return foundry.applications.api.DialogV2.prompt({
    window: { title }, rejectClose: false,
    content: `<input type="text" name="v" value="${esc(value)}" autofocus style="width:100%">`,
    ok: { callback: (ev, btn) => btn.form.elements.v.value.trim() }
  });
}

async function addCity() {
  const free = (await loadIndex()).filter(p => !state.cities[p.id]);
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("AddCity") }, rejectClose: false,
    content: `${free.length ? `<div class="form-group"><label>${esc(L("PresetCity"))}</label><select name="preset"><option value="">—</option>${free.map(p => `<option value="${p.id}">${esc(p.name)} · ${p.count}</option>`).join("")}</select></div>` : ""}
      <div class="form-group"><label>${esc(L("CitySearch"))}</label><input type="text" name="q" placeholder="Macau, Paris, Москва…"></div>
      <p class="hint">${esc(L("AddCityHint"))}</p>`,
    ok: { callback: (ev, btn) => ({ preset: btn.form.elements.preset?.value, q: btn.form.elements.q.value.trim() }) }
  });
  if (!res) return;
  let c;
  if (res.preset) {
    const p = presetIndex.find(x => x.id === res.preset);
    c = newCity(p.id, p.name, p.center, p.zoom, p.id);
  } else if (res.q) {
    const data = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(res.q)}&limit=1&osm_tag=place`).then(r => r.json()).catch(() => null);
    const f = data?.features?.[0];
    if (!f) return ui.notifications.warn(L("CityNotFound"));
    c = newCity(`c-${uid()}`, res.q, [f.geometry.coordinates[1], f.geometry.coordinates[0]], 12);
  } else return;
  state.cities[c.id] = c;
  switchCity(c.id);
}

async function act(name, el) {
  const c = city();
  const fid = el.dataset.folder;
  const folder = fid ? folders().find(f => f.id === fid) : null;
  switch (name) {
    case "tool":
      tool = el.dataset.tool; draft = []; drawDraft();
      if (tool === "grounds" && !view().hunt) { await setView({ hunt: true }); drawOverlay(); }   // угодья видны в своих цветах
      drawTools(); drawPins(); break;
    case "drawGround": drawGround = el.dataset.ground; drawTools(); break;
    case "style": await setView({ style: el.dataset.style }); drawTools(); setStyle(); break;
    case "lang": await setView({ lang: el.dataset.lang }); drawTools(); setStyle(); drawBody(); break;
    case "metro": {
      await setView({ metro: !view().metro });
      const vis = view().metro ? "visible" : "none";
      for (const id of ["rc-metro-line", "rc-metro-st", "rc-metro-name"]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
      drawTools(); break;
    }
    case "tilt": {
      const flat = map.getPitch() < 5;
      map.easeTo({ pitch: flat ? 60 : 0, bearing: flat ? -20 : 0, zoom: flat ? Math.max(map.getZoom(), 15.5) : map.getZoom(), duration: 900 });
      break;
    }
    case "goHome": map.flyTo({ center: [c.center[1], c.center[0]], zoom: c.zoom, pitch: 0, bearing: homeBearing(), duration: 900 }); break;
    case "fmenu": menuFolder = menuFolder === fid ? null : fid; drawBody(); break;
    case "clockRun": await setClockRunning(!clockRunning()); break;
    case "clockRate": await setClockRate(Number(el.dataset.rate) || 1); break;
    case "clockAdd": await glideTo(getClock() + (Number(el.dataset.min) || 10) * MS_MIN); break;
    case "clockDawn": {
      const now = getClock();
      let { sunrise } = sunTimes(now);
      if (sunrise - 15 * MS_MIN <= now) sunrise = sunTimes(now + MS_DAY).sunrise;
      const target = sunrise - 15 * MS_MIN;
      await (target - now < MS_DAY ? glideTo(target) : advanceClock(target - now));
      break;
    }
    case "fopen": { const k = vKey(folder); await setView({ open: { ...view().open, [k]: !view().open[k] } }); drawBody(); break; }
    case "feye": await setView({ hidden: { ...view().hidden, [vKey(folder)]: folderVisible(folder) } }); drawBody(); drawOverlay(); break;
    case "fgm":
      menuFolder = null;
      if (folder.preset) (c.folderMeta[fid] ??= {}).gmOnly = !folder.gmOnly;
      else { const f = c.folders.find(x => x.id === fid); f.gmOnly = !f.gmOnly; }
      save({ own: false }); drawBody(); drawOverlay(); break;
    case "frename": {
      const n = await prompt(L("Rename"), folder.name);
      if (!n) break;
      if (folder.preset) (c.folderMeta[fid] ??= {}).name = n; else c.folders.find(x => x.id === fid).name = n;
      save({ own: false }); drawBody(); break;
    }
    case "fdel": {
      const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: L("DelFolder") },
        content: `<p>${esc(L(folder.preset ? "DelPresetConfirm" : "DelFolderConfirm", { name: folder.name }))}</p>` });
      if (!ok) break;
      if (folder.preset) (c.folderMeta[fid] ??= {}).deleted = true;
      else { c.folders = c.folders.filter(f => f.id !== fid); c.markers = c.markers.filter(m => m.folder !== fid); }
      save({ own: false }); picked = null; drawBody(); drawOverlay(); break;
    }
    case "frestore":
      menuFolder = null;
      for (const m of folderMarkers(folder, { all: true })) if (m.deleted) delete c.overrides[m.id].deleted;
      save({ own: false }); drawBody(); drawOverlay(); break;
    case "addFolder": {
      const n = await prompt(L("AddFolder"), L("NewFolder"));
      if (!n) break;
      const f = { id: uid(), name: n };
      c.folders.push(f);
      await setView({ open: { ...view().open, [`${c.id}:${f.id}`]: true } });
      save({ own: false }); drawBody(); break;
    }
    case "addCity": addCity(); break;
    case "delCity": {
      const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: L("DelCity") }, content: `<p>${esc(L("DelCityConfirm", { name: c.name }))}</p>` });
      if (!ok) break;
      delete state.cities[c.id];
      switchCity(Object.keys(state.cities)[0]);
      break;
    }
    case "fly": {
      picked = { kind: el.dataset.kind, id: el.dataset.id };
      const it = findPicked();
      if (it && (picked.kind === "zone" || picked.kind === "domain")) {
        const lats = it.points.map(p => p[0]), lngs = it.points.map(p => p[1]);
        map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 80, maxZoom: 16, duration: 900 });
      } else if (it) fly(it.lat, it.lng);
      drawBody(); drawOverlay(); break;
    }
    case "clearFound": found = []; if (picked?.kind === "found") picked = null; drawBody(); drawPins(); break;
    case "pinFound": { const r = findPicked(); if (r) { found = found.filter(x => x.id !== r.id); addMarker(r.lat, r.lng, r.name); } break; }
    case "unpick": picked = null; drawBody(); drawOverlay(); break;
    case "placeChar": placing = el.dataset.actor; tool = "select"; drawTools(); break;
    case "pickChar": {
      const a = game.actors.get(el.dataset.actor);
      const w = a && whereIs(a);
      if (!w) break;
      pick("char", a.id);
      fly(w.lat, w.lng, Math.min(map.getZoom(), 15));
      break;
    }
    case "huntLayer": await setView({ hunt: !view().hunt }); drawTools(); drawOverlay(); break;
    case "huntZone": {
      const z = picked?.kind === "zone" ? findPicked() : null, a = hunter();
      if (!z?.grounds) break;
      if (!a) { ui.notifications.warn(L("HuntWho")); break; }
      openHunt(a, huntPlace(z)); break;
    }
    case "huntHere": { const a = game.actors.get(picked?.id), z = a && huntZoneOf(a), w = a && whereIs(a); if (z) openHunt(a, huntPlace(z, [w.lat, w.lng])); break; }
    case "flyChar": { const w = whereIs(game.actors.get(picked?.id)); if (w) fly(w.lat, w.lng, 15); break; }
    case "toggleHidden": {
      const a = game.actors.get(picked?.id);
      if (!a || !game.user.isGM) break;
      const hide = !isHiddenOnMap(a);
      // скрыть или показать — вместе с попутчиками-НПС
      for (const x of [a, ...followersOf(a).filter(f => !f.hasPlayerOwner)]) await x.setFlag(SYSTEM_ID, "city", { ...cityFlag(x), hidden: hide });
      ui.notifications.info(T(hide ? "HiddenDone" : "ShownDone", { name: a.name }));
      break;
    }
    case "joinGroup": {
      const to = game.actors.get(picked?.id);
      const who = game.actors.get(el.closest(".rc-gadd")?.querySelector("[data-gpick]")?.value);
      if (!to || !who || !canManage(who)) break;
      if (followersOf(who).some(f => !f.isOwner)) { ui.notifications.warn(T("HasOwnGroup", { name: who.name })); break; }
      await joinGroup(who, to); drawChars(); drawBody(); break;
    }
    case "groupNear": {
      const to = game.actors.get(picked?.id);
      if (!to) break;
      const root = leaderOf(to) ?? to, here = whereIs(root), inGroup = new Set(groupOf(root).map(x => x.id));
      for (const x of mapActors()) {
        const w = whereIs(x);
        if (inGroup.has(x.id) || !canManage(x) || !w || meters([w.lng, w.lat], [here.lng, here.lat]) > NEAR_M) continue;
        await joinGroup(x, root);
      }
      drawChars(); drawBody(); break;
    }
    case "leaveGroup": {
      const a = game.actors.get(el.dataset.actor);
      if (a && canManage(a)) { await leaveGroup(a); drawChars(); drawBody(); }
      break;
    }
    case "placeNpc": placing = el.dataset.actor; tool = "select"; drawTools(); break;
    case "sheet": game.actors.get(picked?.id)?.sheet.render(true); break;
    case "unplace": {
      const a = game.actors.get(picked?.id);
      // Убирают ведущего — группа остаётся на месте (если ей можно распоряжаться), иначе — отказ.
      const crew = a ? followersOf(a) : [];
      if (crew.some(f => !f.isOwner)) { ui.notifications.warn(T("GroupFirst")); break; }
      for (const f of crew) await leaveGroup(f);
      if (a) await a.unsetFlag(SYSTEM_ID, "city");
      picked = null; drawBody(); drawChars(); break;
    }
    case "remove": remove(); break;
    case "unhide": { const it = findPicked(); if (it) { delete c.overrides[it.id].deleted; save({ own: false }); drawBody(); drawOverlay(); } break; }
    case "home": {
      const ctr = map.getCenter();
      c.center = [ctr.lat, ctr.lng]; c.zoom = map.getZoom();
      save({ own: false }); ui.notifications.info(L("HomeSaved")); break;
    }
    case "openScene": { const s = game.scenes.get(findPicked()?.sceneId); if (s) { closeCity(); s.view(); } break; }
    case "openJournal": game.journal.get(findPicked()?.journalId)?.sheet.render(true); break;
    default: if (EXT.acts[name]) await EXT.acts[name](el, api); break;
    case "ping": {
      const it = findPicked(); if (!it) break;
      const [lat, lng] = picked.kind === "zone" ? centroid(it.points) : [it.lat, it.lng];
      await game.settings.set(SYSTEM_ID, "cityPing", { city: c.id, lat, lng, name: it.name, t: realNow() });
      break;
    }
  }
}

/** Ведущий показал точку: открыть карту, долететь и вспыхнуть. */
async function onPing(p) {
  if (!p?.t || realNow() - p.t > 15000) return;
  if (!document.getElementById(ID)?.classList.contains("open")) await openCity();
  if (!map) return;
  fly(p.lat, p.lng);
  const el = document.createElement("div");
  el.className = "rc-pulse";
  const mk = new gl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
  setTimeout(() => mk.remove(), 4500);
  if (p.name) ui.notifications.info(L("Pinged", { name: p.name }));
}

/** Данные мира сменил другой клиент. */
async function onWorldChange(value) {
  if (!map || JSON.stringify(value) === echo) return;
  const was = state?.current;
  state = readWorld();
  await loadPresets();
  if (state.current !== was) { picked = null; clearPins(); jumpToCity(); }
  if (picked && !findPicked()) picked = null;
  drawAll();
  for (const o of EXT.overlays) o.world?.(api);
}

/* ── Регистрация ──────────────────────────────────────────────────────── */

export function registerCityMap() {
  game.settings.register(SYSTEM_ID, "cityMap", { scope: "world", config: false, type: Object, default: {}, onChange: v => onWorldChange(v) });
  game.settings.register(SYSTEM_ID, "cityPing", { scope: "world", config: false, type: Object, default: {}, onChange: v => onPing(v) });
  game.settings.register(SYSTEM_ID, "cityView", { scope: "client", config: false, type: Object, default: {} });
  game.settings.register(SYSTEM_ID, "cityMapEnabled", {
    name: "VTM20.City.SettingName", hint: "VTM20.City.SettingHint",
    scope: "world", config: true, type: Boolean, default: true, requiresReload: true
  });
  Hooks.once("ready", () => { if (game.settings.get(SYSTEM_ID, "cityMapEnabled")) mount(); });
  // Часы сменили ход — перерисовать панель часов, планировщик (время прибытия) и фишки.
  Hooks.on("updateSetting", s => {
    if (!map || s.key !== `${SYSTEM_ID}.clock`) return;
    drawClock(); drawInspector(); drawChars();
    for (const o of EXT.overlays) o.clock?.(api);
  });
  // Кто-то обвёл, поправил или стёр свой домен — перерисовать области
  Hooks.on("updateUser", (user, changes) => {
    if (!map || !foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.${DOMAIN_FLAG}`)) return;
    drawOverlay(); drawInspector();
    if (!document.activeElement?.closest?.(`#${ID} .rc-body`)) drawBody();
  });
  // Персонаж поехал, приехал, сменил портрет — перерисовать фишки и список (не мешая печатать).
  Hooks.on("updateActor", (actor, changes) => {
    if (!map || !(changes.flags?.[SYSTEM_ID] || "img" in changes || "name" in changes)) return;
    drawChars();
    if (!document.activeElement?.closest?.(`#${ID} .rc-body`)) drawBody();
  });
}
