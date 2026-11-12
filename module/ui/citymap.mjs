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
import { getClock, clockRunning, setClockRunning, setClockRate, glideTo, advanceClock, sunTimes, realNow, MS_MIN, MS_DAY } from "../apps/calendar.mjs";
import {
  whereIs, cityFlag, placeActor, leaderOf, followersOf, groupOf, joinGroup, leaveGroup, mapVisible, isHiddenOnMap, meters
} from "./citychars.mjs";
import { HUNTING_GROUNDS, openHunt } from "../apps/night.mjs";

import { EXT, registerCityExtension } from "./city-ext.mjs";
import { CITY_CATEGORIES, catOf, CITY_KINDS } from "./city-kinds.mjs";
import { revolution, styleExt, CITY_STYLES, eraStyles, defaultStyle, CITY_LANGS, zoomed, buildStyle } from "./city-style.mjs";
import { ID, L, esc, uid, showTip, domainActorOn, domainActorColor, T, GROUND_COLORS, groundLabel, domainOwners, hunter, canEdit, placeableActors, kindOf, canManage, ownerColor, statusText, NEAR_M, centroid, PIN_INK, placeInspector } from "./city-util.mjs";
export { domainActorOn } from "./city-util.mjs";
import { sealURL } from "./city-seals.mjs";
import { S } from "./city-state.mjs";
import { domainLinkHtml, makeDomainFor, huntZoneOf, huntPlace, DOMAIN_FLAG, allDomains, domainById, saveDomains, areaOf, domainsOf } from "./city-domains.mjs";
export { sceneHasSpot, showSceneOnMap, citySpots, makeDomainFor, showSpotOnMap, huntPlace } from "./city-domains.mjs";
import { mapActors, npcActors, actorTree, drawChars, spreadChars, clearChars, charCard, onDrop, npcHidden } from "./city-people.mjs";
import { frame, drawClock } from "./city-clock.mjs";
import { iconOk, buildIcons } from "./city-icons.mjs";
export { registerCityExtension, CITY_CATEGORIES, CITY_KINDS, CITY_STYLES, CITY_LANGS };

/** Что карта даёт расширениям: состояние и перерисовки (обёртки — объявленное ниже доступно при вызове). */
const api = {
  get map() { return S.map; }, get gl() { return S.gl; },
  get picked() { return S.picked; }, set picked(v) { S.picked = v; },
  get tool() { return S.tool; }, set tool(v) { S.tool = v; },
  view: () => view(), setView: p => setView(p), city: () => city(), save: o => save(o), uid: () => uid(),
  L: (k, d) => L(k, d), esc: x => esc(x), zoomed: (...a) => zoomed(...a), revolution: () => revolution(),
  showTip: (...a) => showTip(...a), fly: (...a) => S.map && fly(...a), pick: (k, id) => pick(k, id),
  drawTools: () => drawTools(), drawBody: () => drawBody(), drawInspector: () => drawInspector(), drawOverlay: () => drawOverlay(),
  root: () => document.getElementById(ID), styleExt: id => styleExt(id), isOpen: () => !!document.getElementById(ID)?.classList.contains("open")
};
const boards = () => EXT.boards;

const SLATS = 12, STAGGER = 24, SLIDE = 460;
const CHRONICLE = "chronicle", MINE = "_mine";
/** Город без данных мира: готовый город модуля с default, иначе пустой. Ключ — и для старых личных меток. */
const DEFAULT_CITY = "paris-1789";
const defaultPreset = () => EXT.presets.find(p => p.default) ?? null;
const LIST_CAP = 250;

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
  const r = S.map.getContainer().getBoundingClientRect();
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

/* ── Актёр «Домен» на зоне или обведённом домене (план 1): цвет хозяина, лист по щелчку, создание одной кнопкой ── */

/** Значок и цвет места: смена категории ведущим перебивает вид объекта. */
function looks(m) {
  if (m.preset && !m.catSet && CITY_KINDS[m.k]) {
    const [icon, cat] = CITY_KINDS[m.k];
    return { icon: iconOk[`k-${m.k}`] === false ? catOf(cat).icon : icon, color: catOf(m.cat ?? cat).color, image: `rc-k-${m.k}` };
  }
  const c = catOf(m.cat);
  return { icon: c.icon, color: m.color || c.color, image: `rc-${m.cat in CITY_CATEGORIES ? m.cat : "other"}` };
}

/* ── Стиль карты — city-style.mjs; языки и поворот зависят от вида карты ── */

/** Языки подписей — у стиля модуля свои (на старинном плане улиц нет, только имена мест). */
const eraLangs = () => styleExt(view().style)?.langs ?? CITY_LANGS;
const homeBearing = () => styleExt(view().style)?.bearing ?? 0;

/* ── Состояние ────────────────────────────────────────────────────────── */

/* ── Охота от карты (план 8): угодья у зоны, слой «Угодья», «Охотиться здесь» ─────────── */

/* ── Домены: каждый обводит домен своего персонажа (флаг пользователя cityDomains, по городам) ───── */

export const view = () => {
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

export const city = () => S.state.cities[S.state.current] ?? Object.values(S.state.cities)[0];
const mine = () => (S.privates[city().id] ??= []);
const preset = () => S.presets[city().preset];
function save({ world = game.user.isGM, own = true } = {}) {
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(async () => {
    if (world && game.user.isGM) { S.echo = JSON.stringify(S.state); await game.settings.set(SYSTEM_ID, "cityMap", S.state); }
    if (own) await game.user.setFlag(SYSTEM_ID, "cityMarks", S.privates);
  }, 250);
}

async function loadIndex() {
  S.presetIndex ??= EXT.presets;
  return S.presetIndex;
}

async function loadPresets() {
  await loadIndex();
  const id = city().preset;
  if (id && !(id in S.presets)) {
    const entry = S.presetIndex.find(c => c.id === id);
    S.presets[id] = entry?.url ? await fetch(entry.url).then(r => r.json()).catch(() => null) : null;
    S.metros[id] = entry?.metroUrl ? await fetch(entry.metroUrl).then(r => r.json()).catch(() => null) : null;
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
export function folders() {
  const c = city();
  const meta = id => c.folderMeta?.[id] ?? {};
  const own = c.folders.map(f => ({ ...f, custom: true }));
  const pre = (preset()?.folders ?? []).filter(f => !meta(f.id).deleted)
    .map(f => ({ id: f.id, name: meta(f.id).name ?? f.name, cat: f.cat, visible: f.visible, gmOnly: !!meta(f.id).gmOnly, preset: true }));
  const list = [...own, { id: MINE, name: L("MineFolder"), mine: true }, ...pre];
  return list.filter(f => game.user.isGM || !f.gmOnly);
}

/** Место из готовых данных с правками ведущего. */
export function poiView(base, folder) {
  const ov = city().overrides?.[base.id] ?? {};
  const lang = view().lang;
  const auto = (lang === "ru" && base.ru) || (lang === "fr" && base.fr) || base.en || base.fr || base.ru;
  return { ...base, folder: folder.id, cat: folder.cat, preset: true, auto, ...ov, catSet: !!ov.cat, name: ov.name || auto };
}

export function poiIndex() {
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
  if (!S.picked) return null;
  if (EXT.kinds[S.picked.kind]) return EXT.kinds[S.picked.kind].find(S.picked.id, api) ?? null;
  const c = city();
  switch (S.picked.kind) {
    case "zone": return c.zones.find(z => z.id === S.picked.id) ?? null;
    case "found": return S.found.find(r => r.id === S.picked.id) ?? null;
    case "poi": { const x = poiIndex().get(S.picked.id); return x ? poiView(x.base, x.folder) : null; }
    default: {
      const own = c.markers.find(m => m.id === S.picked.id);
      if (own) return own;
      const p = mine().find(m => m.id === S.picked.id);
      return p ? { ...p, mine: true } : null;
    }
  }
}

/* ── Персонажи ────────────────────────────────────────────────────────── */

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
        <nav class="rc-modes is-empty"></nav><div class="rc-stain-tip" hidden></div></div>
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
    if (!S.search) setView({ open: { ...view().open, [`actors:${d.dataset.afold}`]: d.open } });
  }, true);
  root.addEventListener("change", ev => {
    const f = ev.target.dataset.field;
    if (f) edit(f, ev.target.type === "checkbox" ? ev.target.checked : ev.target.value);
  });
  const box = root.querySelector(".rc-map");
  // разметка и доски режимов от модулей (свеча над старинным планом, вкладки Собрания…)
  for (const m of EXT.mounts) m(root, api);
  // Доски режимов (Собрание модуля, Стратегия системы…): у каждой своя часть полосы вкладок и свой стол поверх карты;
  // вкладка «Карта» общая. Открыла одна доска — прочие возвращаются к карте (boardOpened).
  const nav = root.querySelector(".rc-modes");
  nav.innerHTML = `<a class="rc-mode-home on" data-sysmap><i class="fa-solid fa-map"></i><span>${esc(L("ModeMap"))}</span></a>`;
  for (const b of [...boards()].sort((x, y) => (x.order ?? 0) - (y.order ?? 0))) {
    const modesEl = document.createElement("span"), boardEl = document.createElement("section");
    modesEl.className = "rc-modes-part"; boardEl.className = "rc-board"; boardEl.hidden = true;
    nav.appendChild(modesEl); nav.before(boardEl);
    // свои свойства, а не прототип: модули копируют api разворотом ({ ...api })
    b.attach(root, Object.defineProperties({ modesEl, boardEl, opened: () => boardOpened(b), syncModes: () => syncModes() }, Object.getOwnPropertyDescriptors(api)));
  }
  nav.addEventListener("click", ev => {
    if (!ev.target.closest("[data-sysmap]")) return;
    for (const b of boards()) if (b.mode() !== "map") b.setMode("map");
    syncModes();
  });
  syncModes();
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
  input.addEventListener("input", () => { S.search = input.value.trim().toLowerCase(); drawBody(); });
  input.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); geocode(input.value.trim()); } });
  window.addEventListener("keydown", ev => {
    if (!root.classList.contains("open")) return;
    if (ev.target.closest?.("input, textarea, select")) return;
    if (ev.key === "Escape") {
      ev.preventDefault(); ev.stopPropagation();
      const b = boards().find(x => x.mode() !== "map");
      if (b) b.setMode("map");
      else if (S.draft.length) { S.draft = []; drawDraft(); }
      else if (S.placing) { S.placing = null; drawTools(); }
      else if (S.tool !== "select") { S.tool = "select"; drawTools(); drawPins(); }
      else if (S.picked) { S.picked = null; drawBody(); drawOverlay(); drawTools(); }
      else closeCity();
    }
    if (ev.key === "Enter" && S.draft.length > 2) { ev.preventDefault(); finishZone(); }
    if (ev.key === "Delete" && S.picked) { ev.preventDefault(); remove(); }
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

/** Доска открыла свой режим — остальные к карте. */
function boardOpened(b) {
  for (const x of boards()) if (x !== b && x.mode() !== "map") x.setMode("map");
}
/** Общая вкладка «Карта» и data-mode шторы — по доскам; полоса прячется, если у досок нет вкладок. */
function syncModes() {
  const root = document.getElementById(ID), nav = root?.querySelector(".rc-modes");
  if (!nav) return;
  const active = boards().find(b => b.mode() !== "map");
  root.setAttribute("data-mode", active?.mode() ?? "map");
  nav.querySelector("[data-sysmap]")?.classList.toggle("on", !active);
  nav.classList.toggle("is-empty", !nav.querySelector(".rc-modes-part a"));
}

/** Сам объект карты MapLibre — для макросов (null, пока штору не открывали). */
export const cityMap = () => S.map;

export async function toggleCity() {
  if (S.busy) return;
  return document.getElementById(ID)?.classList.contains("open") ? closeCity() : openCity();
}

export function openCity() {
  // открытие уже идёт (первая загрузка карты бывает долгой) — повторный вызов ждёт его же, а не теряется
  S.opening ??= openNow().finally(() => { S.opening = null; });
  return S.opening;
}
async function openNow() {
  const root = mount();
  // штора ещё закрывается (closeCity держит S.busy на время анимации) — дождаться конца анимации
  for (let i = 0; S.busy && i < 20; i++) await new Promise(res => setTimeout(res, SLIDE / 4));
  S.busy = true;
  try {
    S.state = readWorld();
    S.privates = readPrivates();
    await loadPresets();
    await ensureMap(root);
    if (S.shownCity !== city().id) jumpToCity();
    drawAll();
    for (const b of boards()) { b.drawModes(); b.renderBoard(); }
    syncModes();
    root.classList.add("open");
    root.querySelector(".rc-slats").classList.remove("shut");
    S.raf ??= requestAnimationFrame(frame);
  } catch (e) {
    console.error("VTM20 | карта города:", e);
    ui.notifications.error(L("LoadError"));
  }
  setTimeout(() => { S.busy = false; S.map?.resize(); }, SLIDE);
}

export function closeCity() {
  const root = document.getElementById(ID);
  if (!root || S.busy) return;
  S.busy = true;
  root.querySelector(".rc-slats").classList.add("shut");
  root.classList.remove("open");
  S.draft = []; drawDraft();
  S.placing = null;
  if (S.raf) { cancelAnimationFrame(S.raf); S.raf = null; }
  setTimeout(() => { S.busy = false; }, SLIDE);
}

function jumpToCity() {
  const c = city();
  S.shownCity = c.id;
  S.map.jumpTo({ center: [c.center[1], c.center[0]], zoom: c.zoom, pitch: 0, bearing: homeBearing() });
}

/* ── Карта ────────────────────────────────────────────────────────────── */

async function loadLib() {
  if (S.gl) return S.gl;
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
  return (S.gl = window.maplibregl);
}

async function ensureMap(root) {
  if (S.map) return;
  await loadLib();
  S.icons ??= await buildIcons();
  const c = city(), v = view();
  S.shownCity = c.id;
  root.setAttribute("data-style", v.style);
  S.map = new S.gl.Map({
    container: root.querySelector(".rc-gl"),
    style: buildStyle(v.style, v.lang),
    center: [c.center[1], c.center[0]], zoom: c.zoom, maxZoom: 19, maxPitch: 70,
    bearing: homeBearing(), ...(styleExt(v.style)?.bounds ? { minZoom: styleExt(v.style).minZoom ?? 0, maxBounds: styleExt(v.style).bounds } : {}),
    attributionControl: { compact: true }, doubleClickZoom: false
  });
  for (const o of EXT.overlays) o.init?.(api);
  S.map.addControl(new S.gl.NavigationControl({ visualizePitch: true }), "bottom-left");
  // Стили шторы приходят через @import позже карты — следим за размером контейнера сами.
  new ResizeObserver(() => S.map.resize()).observe(root.querySelector(".rc-gl"));
  S.map.on("style.load", addOverlay);
  S.map.on("click", onMapClick);
  S.map.on("zoomend", () => spreadChars());
  S.map.on("dblclick", ev => { if (isDrawing() && S.draft.length > 2) { ev.preventDefault(); finishZone(); } });
  S.map.on("mousemove", ev => { if (isDrawing() && S.draft.length) drawDraft(ev.lngLat); });
  S.map.on("mouseenter", "rc-poi", () => { S.map.getCanvas().style.cursor = "pointer"; });
  S.map.on("mouseleave", "rc-poi", () => { S.map.getCanvas().style.cursor = ""; });
  S.map.on("mousemove", "rc-poi", poiTip);
  S.map.on("mouseleave", "rc-poi", () => showTip(null));
}

function setStyle() {
  const v = view(), st = styleExt(v.style);
  document.getElementById(ID)?.setAttribute("data-style", v.style);
  S.map?.setMaxBounds(st?.bounds ?? null);
  S.map?.setMinZoom(st?.minZoom ?? 0);
  S.map?.setStyle(buildStyle(v.style, v.lang), { diff: false });
}

const EMPTY = { type: "FeatureCollection", features: [] };

/** Слои хроники поверх стиля: места, зоны, черновик. Смена стиля их сбрасывает — добавляем заново. */
function addOverlay() {
  for (const [k, img] of Object.entries(S.icons ?? {})) if (!S.map.hasImage(`rc-${k}`)) S.map.addImage(`rc-${k}`, img, { pixelRatio: 2 });
  const md = S.metros[city().preset];
  const mf = [];
  for (const l of md?.lines ?? []) for (const s of l.segs) mf.push({ type: "Feature", properties: { color: l.color }, geometry: { type: "LineString", coordinates: s } });
  for (const s of Object.values(md?.stations ?? {})) mf.push({ type: "Feature", properties: { name: view().lang === "ru" ? s.ru : s.en, hub: s.lines.length > 1 }, geometry: { type: "Point", coordinates: [s.lng, s.lat] } });
  if (S.map.getSource("rc-metro")) S.map.getSource("rc-metro").setData({ type: "FeatureCollection", features: mf });
  else S.map.addSource("rc-metro", { type: "geojson", data: { type: "FeatureCollection", features: mf } });
  for (const s of ["rc-poi", "rc-zones", "rc-zone-labels", "rc-domains", "rc-domain-labels", "rc-draft"]) if (!S.map.getSource(s)) S.map.addSource(s, { type: "geojson", data: EMPTY });
  const halo = view().style === "sat" ? "rgba(0,0,0,.9)" : "#0a0808";
  // подписи мест: на гравюре — чернила с бумажным ореолом, ночью — кость на угле
  const ink = view().style === "plan"
    ? { "text-color": "#22140a", "text-halo-color": "rgba(244,234,210,.95)", "text-halo-width": 2.4, "text-halo-blur": .4 }
    : view().style === "plannight"
      ? { "text-color": "#f1e3c3", "text-halo-color": "rgba(14,8,5,.95)", "text-halo-width": 2.2, "text-halo-blur": .4 }
      : { "text-color": "#d6ccc4", "text-halo-color": halo, "text-halo-width": 1.6 };
  const add = l => { if (!S.map.getLayer(l.id)) S.map.addLayer(l); };
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
export function drawOverlay() {
  if (!S.map?.getSource("rc-poi")) return drawPins();
  const feats = [];
  for (const f of folders().filter(f => f.preset && folderVisible(f))) {
    folderMarkers(f).forEach((m, i) => {
      if (!m.preset) return;
      feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [m.lng, m.lat] },
        properties: { id: m.id, icon: looks(m).image, label: m.name, rank: (m.wiki || m.wd ? 0 : 1000) + i } });
    });
  }
  S.map.getSource("rc-poi").setData({ type: "FeatureCollection", features: feats });
  S.map.setFilter("rc-poi-sel", ["==", ["get", "id"], S.picked?.kind === "poi" ? S.picked.id : ""]);

  const zones = city().zones.filter(z => game.user.isGM || !z.gmOnly);
  const sel = S.picked?.kind === "zone" ? S.picked.id : null;
  S.map.getSource("rc-zones").setData({ type: "FeatureCollection", features: zones.map(z => ({
    type: "Feature", properties: { id: z.id, color: zoneColor(z), sel: z.id === sel, gm: !!z.gmOnly },
    geometry: { type: "Polygon", coordinates: [[...z.points, z.points[0]].map(([la, ln]) => [ln, la])] } })) });
  const doms = allDomains().filter(d => d.points?.length > 2), dsel = S.picked?.kind === "domain" ? S.picked.id : null;
  S.map.getSource("rc-domains")?.setData({ type: "FeatureCollection", features: doms.map(d => ({
    type: "Feature", properties: { id: d.id, color: d.color, sel: d.id === dsel, mine: d.user === game.user.id },
    geometry: { type: "Polygon", coordinates: [[...d.points, d.points[0]].map(([la, ln]) => [ln, la])] } })) });
  S.map.getSource("rc-domain-labels")?.setData({ type: "FeatureCollection", features: doms.map(d => {
    const [la, ln] = centroid(d.points);
    return { type: "Feature", properties: { name: L("DomainLabel", { name: d.name }), color: d.color }, geometry: { type: "Point", coordinates: [ln, la] } };
  }) });
  const hunt = !!view().hunt;
  S.map.getSource("rc-zone-labels").setData({ type: "FeatureCollection", features: zones.filter(z => z.name || (hunt && z.grounds) || domainActorOn(z.id)).map(z => {
    const [la, ln] = centroid(z.points);
    // зона-домен без своего имени — подписью имя домена
    const name = hunt && z.grounds ? `${z.name || groundLabel(z.grounds)} · ${HUNTING_GROUNDS[z.grounds]}` : z.name || domainActorOn(z.id)?.name;
    return { type: "Feature", properties: { name, color: zoneColor(z) }, geometry: { type: "Point", coordinates: [ln, la] } };
  }) });
  for (const o of EXT.overlays) o.draw?.(api);
  drawPins();
  drawChars();
}

/** Цвет зоны: на слое «Угодья» — по угодьям; зона-домен — цвет игрока хозяина (план 1); иначе свой. */
const zoneColor = z => (view().hunt && z.grounds && GROUND_COLORS[z.grounds]) || domainActorColor(domainActorOn(z.id)) || z.color || "#b0404c";

/** Булавки хроники и личные — HTML-маркеры: их можно перетаскивать. */
function drawPins() {
  if (!S.map) return;
  const want = new Map();
  for (const f of folders()) {
    if (!folderVisible(f)) continue;
    for (const m of folderMarkers(f)) if (!m.preset) want.set(m.id, m);
  }
  if (S.picked?.kind === "found") { const r = findPicked(); if (r) want.set(r.id, { ...r, cat: "other", search: true }); }
  for (const [id, p] of S.pins) if (!want.has(id)) { p.marker.remove(); S.pins.delete(id); }
  for (const [id, m] of want) {
    const sel = S.picked?.id === id;
    const drag = !m.search && canEdit(m) && S.tool === "select";
    const sig = JSON.stringify([m.lat, m.lng, m.cat, m.color, m.name, m.gmOnly, sel, drag, view().style]);
    const old = S.pins.get(id);
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
    const marker = new S.gl.Marker({ element: el, anchor: "bottom", draggable: drag }).setLngLat([m.lng, m.lat]).addTo(S.map);
    marker.on("dragend", () => {
      const { lat, lng } = marker.getLngLat();
      const it = m.mine ? mine().find(x => x.id === id) : city().markers.find(x => x.id === id);
      if (it) { it.lat = lat; it.lng = lng; save({ world: !m.mine, own: !!m.mine }); }
    });
    S.pins.set(id, { marker, sig });
  }
}

function clearPins() {
  for (const p of S.pins.values()) p.marker.remove();
  S.pins.clear();
}

function drawDraft(hover = null) {
  const src = S.map?.getSource("rc-draft");
  if (!src) return;
  const pts = S.draft.map(([la, ln]) => [ln, la]);
  if (hover) pts.push([hover.lng, hover.lat]);
  src.setData({ type: "FeatureCollection", features: [
    ...(pts.length > 1 ? [{ type: "Feature", geometry: { type: "LineString", coordinates: pts }, properties: {} }] : []),
    ...S.draft.map(([la, ln]) => ({ type: "Feature", geometry: { type: "Point", coordinates: [ln, la] }, properties: {} }))
  ] });
}

function onMapClick(ev) {
  if (ev.originalEvent?.target?.closest?.(".rc-pin, .rc-char")) return;
  for (const c of EXT.clicks) if (c.place?.(ev, api)) return;
  const ll = ev.lngLat;
  if (S.placing) {
    const a = game.actors.get(S.placing);
    S.placing = null; drawTools();
    if (a) placeActor(a, city().id, ll.lat, ll.lng, "", npcHidden(a)).then(() => pick("char", a.id));
    return;
  }
  if (S.tool === "marker") return addMarker(ll.lat, ll.lng);
  const tm = EXT.toolModes.find(t => t.id === S.tool);
  if (tm) return tm.click(ll, api);
  if (isDrawing()) {
    if (!game.user.isGM && S.tool !== "domain") return;
    const last = S.draft.at(-1);
    if (!last || Math.abs(last[0] - ll.lat) + Math.abs(last[1] - ll.lng) > 1e-7) S.draft.push([ll.lat, ll.lng]);
    drawDraft();
    return;
  }
  for (const c of EXT.clicks) if (c.hit?.(ev, api)) return;     // объекты модулей поверх зон (пятна…)
  const hit = S.map.queryRenderedFeatures(ev.point, { layers: ["rc-poi", "rc-zone-fill", "rc-domain-fill"].filter(l => S.map.getLayer(l)) });
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
  if (S.picked) { S.picked = null; drawBody(); drawOverlay(); }
}

function addMarker(lat, lng, name = "") {
  const m = { id: uid(), lat, lng, name, cat: "other", color: "", text: "", gmOnly: false, sceneId: "", journalId: "" };
  if (game.user.isGM) { m.folder = CHRONICLE; city().markers.push(m); save({ own: false }); }
  else { mine().push(m); save({ world: false }); }
  S.tool = "select"; drawTools();
  pick("marker", m.id);
}

/** Чертим многоугольник: обычная зона или угодья (инструмент «Угодья» сразу ставит вид угодий и их цвет). */
const isDrawing = () => S.tool === "zone" || S.tool === "grounds" || S.tool === "domain";

function finishZone() {
  if (S.tool === "domain") return finishDomain();
  const g = S.tool === "grounds" ? S.drawGround : "";
  const z = { id: uid(), name: g ? groundLabel(g) : "", color: g ? GROUND_COLORS[g] : "#b0404c", owner: "", text: "", gmOnly: false, points: S.draft, ...(g ? { grounds: g } : {}) };
  city().zones.push(z);
  S.draft = []; drawDraft();
  // угодья чертят подряд: инструмент остаётся, зона выбрана — справа можно вписать хозяина домена
  if (!g) { S.tool = "select"; drawTools(); }
  save({ own: false });
  pick("zone", z.id);
}

/** Домен обведён: хозяин — свой персонаж игрока (ведущему — выделенный жетон или первый Сородич), потом можно сменить справа. */
async function finishDomain() {
  const owners = domainOwners();
  const owner = [game.user.character, canvas?.tokens?.controlled?.[0]?.actor].find(a => a && owners.includes(a)) ?? owners[0];
  if (!owner) { ui.notifications.warn(L("DomainNoOwner")); S.draft = []; drawDraft(); return; }
  const d = { id: uid(), owner: owner.id, text: "", points: S.draft };
  S.draft = []; drawDraft();
  S.tool = "select"; drawTools();
  await saveDomains(game.user, [...domainsOf(game.user), d]);
  pick("domain", d.id);
}

export function pick(kind, id) {
  S.picked = { kind, id };
  S.menuFolder = null;
  drawBody(); drawOverlay(); drawTools();
}

export function fly(lat, lng, zoom = 16) {
  S.map.flyTo({ center: [lng, lat], zoom: Math.max(S.map.getZoom(), zoom), duration: 900 });
}

/* ── Поиск адресов (Photon, OpenStreetMap) ───────────────────────────── */

async function geocode(q) {
  if (!q) { S.found = []; return drawBody(); }
  const c = S.map.getCenter();
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}`;
    const data = await fetch(url).then(r => r.json());
    S.found = (data.features ?? []).map((f, i) => {
      const p = f.properties;
      return { id: `found-${i}`, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
        name: p.name || [p.housenumber, p.street].filter(Boolean).join(" ") || q,
        sub: [p.name && p.street ? [p.housenumber, p.street].filter(Boolean).join(" ") : "", p.district, p.city].filter(Boolean).join(", ") };
    });
    if (!S.found.length) ui.notifications.info(L("NothingFound"));
  } catch (e) { S.found = []; ui.notifications.warn(L("SearchFailed")); }
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
  const cities = Object.values(S.state.cities);
  head.innerHTML = (game.user.isGM ? `
      <div class="rc-cityrow">
        <input class="rc-city" data-field="cityName" value="${esc(c.name)}">
        <a data-act="addCity" data-tooltip="${esc(L("AddCity"))}"><i class="fa-solid fa-plus"></i></a>
        ${cities.length > 1 ? `<a data-act="delCity" data-tooltip="${esc(L("DelCity"))}"><i class="fa-solid fa-trash"></i></a>` : ""}
      </div>
      ${cities.length > 1 ? `<select class="rc-citysel" data-field="current">${cities.map(x => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : ""}`
    : `<h2>${esc(c.name)}</h2>`) + `<span class="rc-sub">${esc(L("Subtitle"))}</span>`;
}

function drawTools() {
  const box = document.querySelector(`#${ID} .rc-tools`);
  if (!box) return;
  const v = view();
  const btn = (t, icon, tip, gm = false) => gm && !game.user.isGM ? "" :
    `<a class="${S.tool === t ? "on" : ""}" data-act="tool" data-tool="${t}" data-tooltip="${esc(L(tip))}"><i class="fa-solid ${icon}"></i></a>`;
  // Группы кнопок с подписями (Г3); пустая группа не показывается
  const group = (cap, inner, cls = "", attrs = "") => inner.trim() ? `<div class="rc-tgroup">
      <div class="rc-toolset ${cls}" ${attrs}>${inner}</div><small>${esc(L(`Group.${cap}`))}</small></div>` : "";
  box.innerHTML = `
    ${group("Tools", `${btn("select", "fa-arrow-pointer", "ToolSelect")}${btn("marker", "fa-location-dot", "ToolMarker")}${btn("zone", "fa-draw-polygon", "ToolZone", true)}${btn("grounds", "fa-paw", "ToolGrounds", true)}${domainOwners().length ? btn("domain", "fa-crown", "ToolDomain") : ""}${EXT.toolModes.filter(t => !t.when || t.when()).map(t => btn(t.id, t.icon, t.tip, t.gm)).join("")}`)}
    ${group("Era", eraStyles().map(k => `<a class="${v.style === k ? "on" : ""}" data-act="style" data-style="${k}">${esc(styleExt(k)?.label ?? L(`Style.${k}`))}</a>`).join(""), "rc-textset")}
    ${group("Lang", eraLangs().map(k => `<a class="${v.lang === k ? "on" : ""}" data-act="lang" data-lang="${k}">${esc(L(`Lang.${k}`))}</a>`).join(""), "rc-textset", `data-tooltip="${esc(L("LangHint"))}"`)}
    ${group("Layers", `<a class="${v.hunt ? "on" : ""}" data-act="huntLayer" data-tooltip="${esc(L("HuntLayer"))}"><i class="fa-solid fa-layer-group"></i></a>${S.metros[city().preset] ? `<a class="${v.metro ? "on" : ""}" data-act="metro" data-tooltip="${esc(L("MetroToggle"))}"><i class="fa-solid fa-train-subway"></i></a>` : ""}${EXT.tools.map(t => t(api)).join("")}`)}
    ${group("View", `${styleExt(v.style) ? "" : `<a data-act="tilt" data-tooltip="${esc(L("Tilt"))}"><i class="fa-solid fa-cube"></i></a>`}<a data-act="goHome" data-tooltip="${esc(L("GoHome"))}"><i class="fa-solid fa-house"></i></a>`)}
    ${hint()}`;
  syncAim();
}

/** Подсказка над картой: что сейчас сделает щелчок. */
function hint() {
  const bar = (icon, text) => `<div class="rc-hintbar"><i class="fa-solid ${icon}"></i> ${esc(text)} <kbd>Esc</kbd></div>`;
  if (S.placing) return bar("fa-location-crosshairs", T("PlaceHint", { name: game.actors.get(S.placing)?.name ?? "" }));
  if (S.tool === "zone") return bar("fa-draw-polygon", L("ZoneHint"));
  if (S.tool === "domain") return bar("fa-crown", L("DomainDrawHint"));
  // угодья: какие чертим — выбором прямо в подсказке
  if (S.tool === "grounds") return `<div class="rc-hintbar rc-groundbar"><i class="fa-solid fa-paw"></i> ${esc(L("GroundsHint"))}
    <span class="rc-groundpick">${Object.entries(HUNTING_GROUNDS).map(([k, d]) => `<a class="${k === S.drawGround ? "on" : ""}" data-act="drawGround" data-ground="${k}" style="--g:${GROUND_COLORS[k]}"><i></i>${esc(groundLabel(k))} <b>${d}</b></a>`).join("")}</span>
    <kbd>Esc</kbd></div>`;
  if (S.tool === "marker") return bar("fa-location-dot", L("MarkerHint"));
  const tm = EXT.toolModes.find(t => t.id === S.tool);
  if (tm?.hint) return bar(tm.icon, tm.hint());
  return "";
}

/** Прицельный курсор, когда щелчок по карте что-то ставит или задаёт цель. */
function syncAim() {
  const root = document.getElementById(ID);
  if (!root) return;
  if (S.tool !== "select" || S.placing) root.setAttribute("data-aim", "");
  else root.removeAttribute("data-aim");
}

/* ── Часы на карте ────────────────────────────────────────────────────── */

export function drawBody() {
  const body = document.querySelector(`#${ID} .rc-body`);
  if (!body) return;
  const side = body.closest(".rc-side");
  const top = side.scrollTop;
  const v = view();
  const q = m => !S.search || [m.name, m.text, m.en, m.ru, m.owner, districtName(m.d)].some(s => String(s ?? "").toLowerCase().includes(S.search));
  const row = (kind, m, icon, color) => `<li class="${S.picked?.id === m.id ? "on" : ""} ${m.deleted ? "is-deleted" : ""}" data-act="fly" data-kind="${kind}" data-id="${m.id}">
      <i class="fa-solid ${icon}" style="color:${esc(color)}"></i><span>${esc(m.name || L("Unnamed"))}</span>
      ${m.gmOnly ? `<i class="fa-solid fa-lock rc-mini" data-tooltip="${esc(L("GmOnly"))}"></i>` : ""}${m.text ? `<i class="fa-solid fa-feather rc-mini" data-tooltip="${esc(L("HasNote"))}"></i>` : ""}</li>`;

  let html = "";
  if (S.found.length) html += `<section class="rc-found"><h3 class="rc-sect">${esc(L("Found"))}<a data-act="clearFound" data-tooltip="${esc(L("Close"))}"><i class="fa-solid fa-xmark"></i></a></h3><ul>${S.found.map(r =>
    `<li class="${S.picked?.id === r.id ? "on" : ""}" data-act="fly" data-kind="found" data-id="${r.id}"><i class="fa-solid fa-magnifying-glass"></i><span>${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span></li>`).join("")}</ul></section>`;

  // Персонажи: на карте — выбрать; ещё нет — поставить.
  const onMap = mapActors();
  const ids = new Set(onMap.map(a => a.id));
  const off = placeableActors().filter(a => !ids.has(a.id));
  const cq = a => !S.search || a.name.toLowerCase().includes(S.search);
  const onRows = onMap.filter(cq).map(a => `<li class="${S.picked?.kind === "char" && S.picked.id === a.id ? "on" : ""} ${leaderOf(a) ? "is-crew" : ""}" draggable="true" data-drag-actor="${a.id}" data-act="pickChar" data-actor="${a.id}" style="--c:${ownerColor(a)}">
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
    if (S.search && !marks.length) continue;
    if (f.mine && !marks.length) continue;
    const vis = folderVisible(f);
    const open = S.search ? true : !!v.open[vKey(f)];
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
    const menu = S.menuFolder === f.id ? `<div class="rc-fmenu">
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
        ${gmMenu ? `<a class="rc-fmore ${S.menuFolder === f.id ? "on" : ""}" data-act="fmenu" data-folder="${f.id}" data-tooltip="${esc(L("FolderMenu"))}"><i class="fa-solid fa-ellipsis"></i></a>` : ""}
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
  if (S.picked?.kind === "char") { const a = game.actors.get(S.picked.id); if (a && cityFlag(a)) html = charCard(a); }
  else { const it = findPicked(); if (it) html = editor(it); }
  box.hidden = !html;
  if (box.innerHTML !== html) { const top = box.scrollTop; box.innerHTML = html; box.scrollTop = top; }
  placeInspector();
}

/** Редактор выбранной метки, места, зоны или найденного адреса. */
function editor(it) {
  const kind = S.picked.kind;
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
      <label>${esc(L("Grounds"))}<select data-field="grounds" ${ro}><option value="">${esc(L("GroundsNone"))}</option>${Object.entries(HUNTING_GROUNDS).map(([k, d]) => opt(k, it.grounds, `${groundLabel(k)} · ${d}`)).join("")}</select></label>
      ${domainLinkHtml(it.id)}`
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

export async function edit(field, value) {
  const c = city();
  if (field === "cityName") { c.name = value; save({ own: false }); return; }
  if (field === "current") return switchCity(value);
  const it = findPicked();
  if (!it) return;
  if (EXT.kinds[S.picked.kind]) return EXT.kinds[S.picked.kind].edit(it, field, value, api);
  if (S.picked.kind === "poi") {
    if (!game.user.isGM) return;
    const ov = (c.overrides[it.id] ??= {});
    if (value === "" || value === false) delete ov[field]; else ov[field] = value;
    save({ own: false });
  } else if (S.picked.kind === "zone") {
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
  S.state.current = id;
  S.picked = null; S.found = []; S.draft = [];
  clearPins(); clearChars();
  save({ own: false });
  await loadPresets();
  jumpToCity();
  drawAll();
}

export function remove() {
  const it = findPicked();
  if (!it) return;
  const c = city();
  if (S.picked.kind === "zone") { if (!game.user.isGM) return; c.zones = c.zones.filter(z => z.id !== it.id); save({ own: false }); }
  else if (EXT.kinds[S.picked.kind]) return EXT.kinds[S.picked.kind].remove(it, api);
  else if (S.picked.kind === "poi") { if (!game.user.isGM) return; (c.overrides[it.id] ??= {}).deleted = true; save({ own: false }); }
  else if (S.picked.kind === "found") { S.found = S.found.filter(r => r.id !== it.id); }
  else if (it.mine) { S.privates[c.id] = mine().filter(m => m.id !== it.id); save({ world: false }); }
  else if (game.user.isGM) { c.markers = c.markers.filter(m => m.id !== it.id); save({ own: false }); }
  else return;
  S.picked = null;
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
  const free = (await loadIndex()).filter(p => !S.state.cities[p.id]);
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
    const p = S.presetIndex.find(x => x.id === res.preset);
    c = newCity(p.id, p.name, p.center, p.zoom, p.id);
  } else if (res.q) {
    const data = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(res.q)}&limit=1&osm_tag=place`).then(r => r.json()).catch(() => null);
    const f = data?.features?.[0];
    if (!f) return ui.notifications.warn(L("CityNotFound"));
    c = newCity(`c-${uid()}`, res.q, [f.geometry.coordinates[1], f.geometry.coordinates[0]], 12);
  } else return;
  S.state.cities[c.id] = c;
  switchCity(c.id);
}

export async function act(name, el) {
  const c = city();
  const fid = el.dataset.folder;
  const folder = fid ? folders().find(f => f.id === fid) : null;
  switch (name) {
    case "tool":
      S.tool = el.dataset.tool; S.draft = []; drawDraft();
      if (S.tool === "grounds" && !view().hunt) { await setView({ hunt: true }); drawOverlay(); }   // угодья видны в своих цветах
      drawTools(); drawPins(); break;
    case "drawGround": S.drawGround = el.dataset.ground; drawTools(); break;
    case "style": await setView({ style: el.dataset.style }); drawTools(); setStyle(); break;
    case "lang": await setView({ lang: el.dataset.lang }); drawTools(); setStyle(); drawBody(); break;
    case "metro": {
      await setView({ metro: !view().metro });
      const vis = view().metro ? "visible" : "none";
      for (const id of ["rc-metro-line", "rc-metro-st", "rc-metro-name"]) if (S.map.getLayer(id)) S.map.setLayoutProperty(id, "visibility", vis);
      drawTools(); break;
    }
    case "tilt": {
      const flat = S.map.getPitch() < 5;
      S.map.easeTo({ pitch: flat ? 60 : 0, bearing: flat ? -20 : 0, zoom: flat ? Math.max(S.map.getZoom(), 15.5) : S.map.getZoom(), duration: 900 });
      break;
    }
    case "goHome": S.map.flyTo({ center: [c.center[1], c.center[0]], zoom: c.zoom, pitch: 0, bearing: homeBearing(), duration: 900 }); break;
    case "fmenu": S.menuFolder = S.menuFolder === fid ? null : fid; drawBody(); break;
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
      S.menuFolder = null;
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
      save({ own: false }); S.picked = null; drawBody(); drawOverlay(); break;
    }
    case "frestore":
      S.menuFolder = null;
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
      delete S.state.cities[c.id];
      switchCity(Object.keys(S.state.cities)[0]);
      break;
    }
    case "fly": {
      S.picked = { kind: el.dataset.kind, id: el.dataset.id };
      const it = findPicked();
      if (it && (S.picked.kind === "zone" || S.picked.kind === "domain")) {
        const lats = it.points.map(p => p[0]), lngs = it.points.map(p => p[1]);
        S.map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 80, maxZoom: 16, duration: 900 });
      } else if (it) fly(it.lat, it.lng);
      drawBody(); drawOverlay(); break;
    }
    case "clearFound": S.found = []; if (S.picked?.kind === "found") S.picked = null; drawBody(); drawPins(); break;
    case "pinFound": { const r = findPicked(); if (r) { S.found = S.found.filter(x => x.id !== r.id); addMarker(r.lat, r.lng, r.name); } break; }
    case "unpick": S.picked = null; drawBody(); drawOverlay(); break;
    case "placeChar": S.placing = el.dataset.actor; S.tool = "select"; drawTools(); break;
    case "pickChar": {
      const a = game.actors.get(el.dataset.actor);
      const w = a && whereIs(a);
      if (!w) break;
      pick("char", a.id);
      fly(w.lat, w.lng, Math.min(S.map.getZoom(), 15));
      break;
    }
    case "huntLayer": await setView({ hunt: !view().hunt }); drawTools(); drawOverlay(); break;
    case "huntZone": {
      const z = S.picked?.kind === "zone" ? findPicked() : null, a = hunter();
      if (!z?.grounds) break;
      if (!a) { ui.notifications.warn(L("HuntWho")); break; }
      openHunt(a, huntPlace(z)); break;
    }
    case "huntHere": { const a = game.actors.get(S.picked?.id), z = a && huntZoneOf(a), w = a && whereIs(a); if (z) openHunt(a, huntPlace(z, [w.lat, w.lng])); break; }
    case "flyChar": { const w = whereIs(game.actors.get(S.picked?.id)); if (w) fly(w.lat, w.lng, 15); break; }
    case "toggleHidden": {
      const a = game.actors.get(S.picked?.id);
      if (!a || !game.user.isGM) break;
      const hide = !isHiddenOnMap(a);
      // скрыть или показать — вместе с попутчиками-НПС
      for (const x of [a, ...followersOf(a).filter(f => !f.hasPlayerOwner)]) await x.setFlag(SYSTEM_ID, "city", { ...cityFlag(x), hidden: hide });
      ui.notifications.info(T(hide ? "HiddenDone" : "ShownDone", { name: a.name }));
      break;
    }
    case "joinGroup": {
      const to = game.actors.get(S.picked?.id);
      const who = game.actors.get(el.closest(".rc-gadd")?.querySelector("[data-gpick]")?.value);
      if (!to || !who || !canManage(who)) break;
      if (followersOf(who).some(f => !f.isOwner)) { ui.notifications.warn(T("HasOwnGroup", { name: who.name })); break; }
      await joinGroup(who, to); drawChars(); drawBody(); break;
    }
    case "groupNear": {
      const to = game.actors.get(S.picked?.id);
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
    case "placeNpc": S.placing = el.dataset.actor; S.tool = "select"; drawTools(); break;
    case "sheet": game.actors.get(S.picked?.id)?.sheet.render(true); break;
    case "unplace": {
      const a = game.actors.get(S.picked?.id);
      // Убирают ведущего — группа остаётся на месте (если ей можно распоряжаться), иначе — отказ.
      const crew = a ? followersOf(a) : [];
      if (crew.some(f => !f.isOwner)) { ui.notifications.warn(T("GroupFirst")); break; }
      for (const f of crew) await leaveGroup(f);
      if (a) await a.unsetFlag(SYSTEM_ID, "city");
      S.picked = null; drawBody(); drawChars(); break;
    }
    case "remove": remove(); break;
    case "unhide": { const it = findPicked(); if (it) { delete c.overrides[it.id].deleted; save({ own: false }); drawBody(); drawOverlay(); } break; }
    case "home": {
      const ctr = S.map.getCenter();
      c.center = [ctr.lat, ctr.lng]; c.zoom = S.map.getZoom();
      save({ own: false }); ui.notifications.info(L("HomeSaved")); break;
    }
    case "openScene": { const s = game.scenes.get(findPicked()?.sceneId); if (s) { closeCity(); s.view(); } break; }
    case "openJournal": game.journal.get(findPicked()?.journalId)?.sheet.render(true); break;
    case "openDomain": game.actors.get(el.dataset.id)?.sheet.render(true); break;
    case "makeDomain": { const it = findPicked(); if (it && (S.picked.kind === "zone" || S.picked.kind === "domain")) await makeDomainFor(S.picked.kind, it); break; }
    default: if (EXT.acts[name]) await EXT.acts[name](el, api); break;
    case "ping": {
      const it = findPicked(); if (!it) break;
      const [lat, lng] = S.picked.kind === "zone" ? centroid(it.points) : [it.lat, it.lng];
      await game.settings.set(SYSTEM_ID, "cityPing", { city: c.id, lat, lng, name: it.name, t: realNow() });
      break;
    }
  }
}

/** Ведущий показал точку: открыть карту, долететь и вспыхнуть. */
async function onPing(p) {
  if (!p?.t || realNow() - p.t > 15000) return;
  if (!document.getElementById(ID)?.classList.contains("open")) await openCity();
  if (!S.map) return;
  fly(p.lat, p.lng);
  const el = document.createElement("div");
  el.className = "rc-pulse";
  const mk = new S.gl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(S.map);
  setTimeout(() => mk.remove(), 4500);
  if (p.name) ui.notifications.info(L("Pinged", { name: p.name }));
}

/** Данные мира сменил другой клиент. */
async function onWorldChange(value) {
  if (!S.map || JSON.stringify(value) === S.echo) return;
  const was = S.state?.current;
  S.state = readWorld();
  await loadPresets();
  if (S.state.current !== was) { S.picked = null; clearPins(); jumpToCity(); }
  if (S.picked && !findPicked()) S.picked = null;
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
    if (!S.map || s.key !== `${SYSTEM_ID}.clock`) return;
    drawClock(); drawInspector(); drawChars();
    for (const o of EXT.overlays) o.clock?.(api);
  });
  // Кто-то обвёл, поправил или стёр свой домен — перерисовать области
  Hooks.on("updateUser", (user, changes) => {
    if (!S.map || !foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.${DOMAIN_FLAG}`)) return;
    drawOverlay(); drawInspector();
    if (!document.activeElement?.closest?.(`#${ID} .rc-body`)) drawBody();
  });
  // Персонаж поехал, приехал, сменил портрет — перерисовать фишки и список (не мешая печатать).
  Hooks.on("updateActor", (actor, changes) => {
    if (!S.map || !(changes.flags?.[SYSTEM_ID] || "img" in changes || "name" in changes)) return;
    drawChars();
    if (!document.activeElement?.closest?.(`#${ID} .rc-body`)) drawBody();
  });
  // Домен-актёр появился, сменил хозяина или зону, удалён — цвет зоны и карточка (план 1)
  const domainChanged = actor => {
    if (!S.map || actor.type !== "domain") return;
    drawOverlay();
    if (!document.activeElement?.closest?.(`#${ID} .rc-body`)) drawBody();
  };
  Hooks.on("createActor", domainChanged);
  Hooks.on("updateActor", domainChanged);
  Hooks.on("deleteActor", domainChanged);
}
