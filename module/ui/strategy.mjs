// module/ui/strategy.mjs
// Стратегия города: долгие ходы старейшин между сессиями (по мотивам стратегической игры Зиора, «Request for Quest»).
//
// Доска на шторе «Город» (registerCityExtension → boards): гексы-сферы города (полиция, мэрия, порт, пресса…),
// в каждом — фишки влияния (0–7) персонажей, NPC и фракций. Ход длится месяцы и годы:
//   · игрок раскладывает по гексам жетоны — 3 жетона внимания, по жетону за каждые 2 точки Влияния, по жетону
//     за каждую точку Подручных (гуль действует сам) и услуги (кого-то зовут на помощь — долг в реестре услуг);
//     к жетону — заявка: что делаем (усилить, вытеснить, подорвать, разведать, защитить) и каким пулом;
//   · ведущий на «Столе» бросает всё разом (пул = Атрибут + Способность + свои фишки в гексе ± поправки;
//     сопротивление — рефлекторный пул из фишек соперника), смотрит итог, при нужде перебрасывает и «проводит ход»;
//   · отчёт хода — журнал: общая страница всем и личная страница каждому игроку; ход сменяется.
// Туман войны: игрок видит свои фишки, фишки гексов, открытых ведущим, и разведанное своим персонажем.
// Сектор можно привязать к кварталу карты (кварталы дают модули — EXT.strategy.districts).
//
// Состояние — настройка мира «strategy» (пишет ведущий); заявки — флаг актёра «strategy» (пишет владелец).

import { SYSTEM_ID } from "../config.mjs";
import { EXT, registerCityExtension } from "./city-ext.mjs";
import { ST } from "./strategy-state.mjs";
import { FLAG, S, esc, uid, MAX, INTENTS, perkName, PROJ, projectsOf, needOf, sectorName, DEFAULT_BID, strat, save, owner, meActor, bidsOf, doneOf, setBids, allBids, sees, visibleSectors, CONVENTIONS, DEAD_FACTIONS } from "./strategy-rules.mjs";
import { Codex } from "../data/codex.mjs";
export { strat } from "./strategy-rules.mjs";
import { head, emptyView, hexes, sectorView, turnView, deskView, reportsView, setupView } from "./strategy-views.mjs";
import { saveBid, rollKeys, resolve, publish, undoClock, notify, addPact, loadPreset } from "./strategy-turn.mjs";
import { trendToDomains } from "./strategy-domain.mjs";
export { domainSway, domainSecurity, domainEventTrend, trendToDomains } from "./strategy-domain.mjs";

/* ── Заготовка по умолчанию: современный город (сферы, как у Зиора) ───────── */

/* ── Состояние ─────────────────────────────────────────────────────────── */

/* ── Пул заявки ───────────────────────────────────────────────────────── */

/* ── Доска ─────────────────────────────────────────────────────────────── */

// масштаб соты: k — во сколько раз крупнее «вписанного» вида, cx/cy — центр в координатах сот (null — по центру);
// base — рамка всех гексов; focus — подсвеченная сфера из легенды
const ZOOM_MIN = 0.6, ZOOM_MAX = 4;

export function registerStrategy() {
  game.settings.register(SYSTEM_ID, "strategy", { scope: "world", config: false, type: Object, default: {}, onChange: () => { renderBoard(); ST.host?.drawOverlay?.(); } });
  Hooks.on("updateActor", (a, ch) => { if (ST.mode !== "map" && foundry.utils.hasProperty(ch, `flags.${SYSTEM_ID}.${FLAG}`)) renderBoard(); });
  registerCityExtension({
    boards: [{ order: 10, attach, drawModes, renderBoard, mode: () => ST.mode, setMode }],
    // печати влияния над кварталами, к которым привязаны сектора (кнопка в «Слоях»)
    overlays: [{ add: api => addLayer(api), draw: api => drawLayer(api), world: api => drawLayer(api) }],
    tools: [api => strat().sectors.some(x => x.district) && EXT.strategy.districts.length
      ? `<a class="${api.view().strat ? "on" : ""}" data-act="stratLayer" data-tooltip="${esc(S("MapLayer"))}"><i class="fa-solid fa-chess-knight"></i></a>` : ""],
    acts: { stratLayer: (el, api) => api.setView({ strat: !api.view().strat }).then(() => { api.drawTools(); api.drawOverlay(); }) }
  });
}

/* ── Слой на карте: печати влияния по кварталам ───────────────────────── */

function addLayer(api) {
  const map = api.map;
  if (!map.getSource("rs-infl")) map.addSource("rs-infl", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  const add = l => { if (!map.getLayer(l.id)) map.addLayer(l); };
  add({ id: "rs-infl-seal", type: "circle", source: "rs-infl", paint: {
    "circle-color": ["get", "color"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, ["+", 6, ["get", "n"]], 15, ["+", 11, ["*", 1.8, ["get", "n"]]]],
    "circle-opacity": .95, "circle-stroke-color": "#b0894a", "circle-stroke-width": 2.5 } });
  // тёмная подложка под печатью — читается и на светлом старинном плане
  if (!map.getLayer("rs-infl-halo")) map.addLayer({ id: "rs-infl-halo", type: "circle", source: "rs-infl", paint: {
    "circle-color": "#0a0808", "circle-opacity": .55, "circle-blur": .6,
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, ["+", 10, ["get", "n"]], 15, ["+", 17, ["*", 1.8, ["get", "n"]]]] } }, "rs-infl-seal");
  add({ id: "rs-infl-n", type: "symbol", source: "rs-infl", layout: { "text-field": ["to-string", ["get", "n"]], "text-font": ["Noto Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 15, 14], "text-allow-overlap": true },
    paint: { "text-color": "#f3ece0", "text-halo-color": "#0a0808", "text-halo-width": 1.4 } });
  add({ id: "rs-infl-name", type: "symbol", source: "rs-infl", minzoom: 14.5, layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 10,
    "text-offset": [0, 1.9], "text-anchor": "top" }, paint: { "text-color": "#d8cfbf", "text-halo-color": "#0a0808", "text-halo-width": 1.4 } });
  drawLayer(api);
}

/** Видимое пользователю влияние по кварталам: печать на владельца, кругом у центра квартала. */
function drawLayer(api) {
  const map = api.map;
  if (!map?.getSource("rs-infl")) return;
  const on = !!api.view().strat;
  for (const l of ["rs-infl-halo", "rs-infl-seal", "rs-infl-n", "rs-infl-name"]) if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", on ? "visible" : "none");
  if (!on) return;
  const s = strat(), feats = [];
  for (const d of EXT.strategy.districts.flatMap(f => f())) {
    const sum = {};
    for (const x of visibleSectors(s).filter(y => y.district === d.key))
      for (const [k, n] of Object.entries(s.tokens[x.key] ?? {})) if (n > 0 && sees(x.key, k, s)) sum[k] = (sum[k] ?? 0) + n;
    const list = Object.entries(sum).sort((p, q) => q[1] - p[1]);
    list.forEach(([k, n], i) => {
      const a = 2 * Math.PI * i / list.length - Math.PI / 2, r = list.length > 1 ? .0019 : 0, o = owner(k, s);
      feats.push({ type: "Feature", properties: { color: o.color, n, name: o.name },
        geometry: { type: "Point", coordinates: [d.lng + r * Math.cos(a) / Math.cos(d.lat * Math.PI / 180), d.lat + r * Math.sin(a)] } });
    });
  }
  map.getSource("rs-infl").setData({ type: "FeatureCollection", features: feats });
}

/** Гайдбук стратегии — книга в компендии правил. */
async function openGuide() {
  const pack = game.packs.get(`${SYSTEM_ID}.rules`);
  const idx = await pack?.getIndex();
  const e = idx?.find(x => x.name === S("GuideName") || x.name === "Стратегия города — гайдбук");
  if (!e) return ui.notifications.warn(S("GuideMissing"));
  (await pack.getDocument(e._id))?.sheet.render(true);
}

/* ── Польза секторов и лист персонажа ─────────────────────────────────── */

/** Фишки персонажа в секторах с пользой key: { n, dice, names }. */
export function perkBonus(actor, key) {
  let s;
  try { s = strat(); } catch { return { n: 0, dice: 0, names: [] }; }
  // свои фишки и фишки групп, где персонаж состоит (кабал, стая, котерия): польза сектора — всем своим
  const ids = [actor?.id, ...game.actors.filter(g => g.type === "coterie" && (g.system.members ?? []).includes(actor?.id)).map(g => g.id)].filter(Boolean);
  const mine = x => ids.reduce((m, id) => m + (s.tokens[x.key]?.[id] ?? 0), 0);
  const secs = s.sectors.filter(x => x.perk === key && mine(x) > 0);
  const n = secs.reduce((m, x) => m + mine(x), 0);
  return { n, dice: Math.ceil(n / 2), names: secs.map(sectorName) };
}

/** Блок «Влияние в городе» на листе: сектора с фишками, заявки хода, проекты, договоры. */
export function sheetStrategy(actor) {
  let s;
  try { s = strat(); } catch { return null; }
  if (!s.sectors.length || !actor) return null;
  const sectors = s.sectors.filter(x => (s.tokens[x.key]?.[actor.id] ?? 0) > 0)
    .map(x => { const n = s.tokens[x.key][actor.id]; return { name: sectorName(x), n, pips: "●".repeat(n), perk: x.perk ? perkName(x.perk) : "" }; });
  const projects = projectsOf(actor).map(p => { const need = needOf(s, p.id), now = Math.min(s.progress?.[p.id] ?? 0, need);
    return { name: p.name, now, need, pct: Math.round(now / need * 100), done: now >= need, sector: sectorName(s.sectors.find(x => x.key === p.sector) ?? {}) }; });
  const pacts = (s.pacts ?? []).filter(p => p.a === actor.id || p.b === actor.id)
    .map(p => ({ with: owner(p.a === actor.id ? p.b : p.a, s).name, kind: S(`PactKind.${p.kind}`), where: p.scope === "*" ? S("PactWholeCity") : sectorName(s.sectors.find(x => x.key === p.scope) ?? {}) }));
  const bids = bidsOf(actor, s);
  if (!sectors.length && !projects.length && !pacts.length && !bids.length) return null;
  return { sectors, projects, pacts, turn: S("SheetTurn", { n: s.turn.n, bids: bids.length, done: S(doneOf(actor, s) ? "SheetDone" : "SheetNotDone") }) };
}

/** Открыть штору «Город» на Стратегии (кнопка на листе). */
export async function openStrategy() {
  const { openCity } = await import("./citymap.mjs");
  await openCity();
  setMode("strategy");
}

/* ── Влияние в бросках ────────────────────────────────────────────────── */

/** Сектора, где у персонажа есть влияние: опора для броска (+1 кубик за каждые 2 фишки, вверх). */
export function swayOf(actor) {
  let s;
  try { s = strat(); } catch { return []; }
  return s.sectors.filter(x => (s.tokens[x.key]?.[actor?.id] ?? 0) > 0)
    .map(x => { const n = s.tokens[x.key][actor.id]; return { key: x.key, name: sectorName(x), n, dice: Math.ceil(n / 2) }; });
}

function attach(root, api) {
  ST.host = api;
  const b = api.boardEl;
  b.classList.add("rs-board");
  b.addEventListener("click", onClick);
  b.addEventListener("change", onChange);
  // жетон со счётчика — на гекс: открывается заявка этим жетоном в этом гексе
  b.addEventListener("dragstart", ev => { const k = ev.target.closest?.("[data-rs-drag]")?.dataset.rsDrag; if (k) ev.dataTransfer.setData("text/x-rs-kind", k); });
  b.addEventListener("dragover", ev => { if (ev.target.closest?.(".rs-hex") && ev.dataTransfer.types.includes("text/x-rs-kind")) { ev.preventDefault(); ev.target.closest(".rs-hex").classList.add("is-drop"); } });
  b.addEventListener("dragleave", ev => ev.target.closest?.(".rs-hex")?.classList.remove("is-drop"));
  b.addEventListener("drop", ev => {
    const hex = ev.target.closest?.(".rs-hex"), k = ev.dataTransfer.getData("text/x-rs-kind");
    if (!hex || !k) return;
    ev.preventDefault();
    ST.sel = hex.dataset.key; ST.view = "map"; ST.hist = null; ST.editBid = { ...DEFAULT_BID, kind: k, sector: ST.sel };
    renderBoard();
  });
  api.modesEl.addEventListener("click", ev => { if (ev.target.closest("[data-mode]")) setMode(ev.target.closest("[data-mode]").dataset.mode); });
  // масштаб: колесо — к курсору; перетаскивание поля — сдвиг (после сдвига щелчок по гексу не считается выбором)
  b.addEventListener("wheel", ev => {
    const svg = ev.target.closest?.(".rs-map")?.querySelector("svg");
    if (!svg || !ST.base) return;
    ev.preventDefault();
    zoomAt(svg, ST.zoom.k * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), ev.clientX, ev.clientY);
  }, { passive: false });
  b.addEventListener("pointerdown", ev => {
    const map = ev.target.closest?.(".rs-map");
    if (!map || ev.button !== 0 || ev.target.closest(".rs-zoom, .rs-legend")) return;
    const svg = map.querySelector("svg"), start = { x: ev.clientX, y: ev.clientY, cx: ST.zoom.cx, cy: ST.zoom.cy };
    ST.dragged = false;
    const move = e => {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!ST.dragged && Math.hypot(dx, dy) < 5) return;
      ST.dragged = true; map.classList.add("is-drag");
      const v = viewOf(), u = 1 / Math.min(svg.clientWidth / v.w, svg.clientHeight / v.h);   // единиц соты в пикселе (preserveAspectRatio meet)
      ST.zoom.cx = start.cx - dx * u; ST.zoom.cy = start.cy - dy * u; applyView(svg);
    };
    const up = () => { map.classList.remove("is-drag"); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  });
  b.addEventListener("click", ev => { if (ST.dragged && ev.target.closest?.(".rs-map")) { ev.stopImmediatePropagation(); ev.preventDefault(); ST.dragged = false; } }, true);
  drawModes();
}

/* ── Масштаб соты ── */

/** Видимая часть соты при текущем масштабе: ширина и высота — доля «вписанного» вида, центр — zoom.cx/cy. */
export function viewOf() {
  const w = ST.base.w / ST.zoom.k, h = ST.base.h / ST.zoom.k;
  ST.zoom.cx ??= ST.base.minX + ST.base.w / 2; ST.zoom.cy ??= ST.base.minY + ST.base.h / 2;
  return { x: ST.zoom.cx - w / 2, y: ST.zoom.cy - h / 2, w, h };
}
function applyView(svg) {
  const v = viewOf();
  svg.setAttribute("viewBox", `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`);
  const out = svg.closest(".rs-map")?.querySelector("[data-rs-zoomval]");
  if (out) out.textContent = `${Math.round(ST.zoom.k * 100)}%`;
}
/** Масштаб k с неподвижной точкой под курсором (без курсора — к центру). */
function zoomAt(svg, k, clientX, clientY) {
  k = Math.clamp(k, ZOOM_MIN, ZOOM_MAX);
  const v = viewOf(), r = svg.getBoundingClientRect();
  // доля экрана под курсором; при preserveAspectRatio meet поле может быть уже окна — считаем по реальному масштабу
  const scale = Math.min(r.width / v.w, r.height / v.h), ox = (r.width - v.w * scale) / 2, oy = (r.height - v.h * scale) / 2;
  const px = clientX == null ? v.x + v.w / 2 : v.x + (clientX - r.left - ox) / scale, py = clientY == null ? v.y + v.h / 2 : v.y + (clientY - r.top - oy) / scale;
  const f = ST.zoom.k / k;
  ST.zoom.cx = px + (ST.zoom.cx - px) * f; ST.zoom.cy = py + (ST.zoom.cy - py) * f; ST.zoom.k = k;
  applyView(svg);
}
function setMode(m) {
  if (!ST.host) return;
  if (m !== "map") ST.host.opened?.();
  ST.mode = m === "strategy" ? "strategy" : "map";
  drawModes(); renderBoard(); ST.host.syncModes?.();
}
function drawModes() {
  if (!ST.host?.modesEl) return;
  const s = strat();
  ST.host.modesEl.innerHTML = game.user.isGM || s.sectors.length
    ? `<a class="${ST.mode === "strategy" ? "on" : ""}" data-mode="strategy"><i class="fa-solid fa-chess-knight"></i><span>${esc(S("Tab"))}</span></a>` : "";
  ST.host.syncModes?.();
}

function renderBoard() {
  const b = ST.host?.boardEl;
  if (!b) return;
  drawModes();
  b.hidden = ST.mode === "map";
  if (ST.mode === "map") return;
  const ae = document.activeElement;
  if (b.contains(ae) && ae.matches("textarea, input[type=text]")) return;
  const now = strat(), gm = game.user.isGM;
  if (!now.sectors.length) { b.innerHTML = `<div class="rs-wrap">${head(now)}${emptyView(now)}</div>`; return; }
  // история: сота после выбранного хода — только смотреть
  const snap = ST.hist != null && now.reports.find(r => r.n === ST.hist);
  const s = snap ? { ...now, tokens: snap.tokens ?? {}, sectors: snap.sectors ?? now.sectors } : now;
  const scroll = b.querySelector(".rs-side")?.scrollTop ?? 0;
  const side = ST.view === "turn" ? (gm ? deskView(s) : turnView(s)) : ST.view === "reports" ? reportsView(s) : ST.view === "setup" && gm ? setupView(s) : sectorView(s);
  const banner = snap ? `<div class="rs-histbar"><i class="fa-solid fa-clock-rotate-left"></i> ${esc(S("HistoryTitle", { n: snap.n, label: snap.label || "" }))}<a data-rs="histOff">${esc(S("HistoryBack"))}</a></div>` : "";
  b.innerHTML = `<div class="rs-wrap">${head(now)}<div class="rs-body"><div class="rs-hexes ${snap ? "is-hist" : ""}">${banner}${hexes(s)}</div><aside class="rs-side">${side}</aside></div></div>`;
  const sd = b.querySelector(".rs-side"); if (sd) sd.scrollTop = scroll;
}

/* ── Гексы ── */

/* ── Сектор ── */

/* ── Мой ход (игрок) ── */

/* ── Стол ведущего ── */

/* ── Отчёты ── */

/* ── Настройка (ведущий) ── */

/* ── События ───────────────────────────────────────────────────────────── */

async function onClick(ev) {
  const el = ev.target.closest("[data-rs]");
  if (!el) return;
  ev.preventDefault();
  const s = strat(), gm = game.user.isGM, act = el.dataset.rs;
  switch (act) {
    case "view": ST.view = el.dataset.v; ST.editBid = null; return renderBoard();
    // повторный щелчок по выбранному гексу — снять выбор и вернуться к обзору города
    case "sector": ST.sel = ST.sel === el.dataset.key && ST.view === "map" ? null : el.dataset.key; ST.editBid = null; if (ST.view !== "setup") ST.view = "map"; return renderBoard();
    case "overview": ST.sel = null; ST.editBid = null; ST.view = "map"; return renderBoard();
    case "preset": return loadPreset(el.dataset.id);
    case "fly": { const d = EXT.strategy.districts.flatMap(f => f()).find(x => x.key === el.dataset.key); if (d) { setMode("map"); ST.host.fly?.(d.lat, d.lng, 15); } return; }
    case "tok": {
      const t = s.tokens[ST.sel] ?? {}, n = Math.clamp((t[el.dataset.owner] ?? 0) + Number(el.dataset.d), 0, MAX);
      const sum = Object.entries(t).reduce((m, [k, v]) => m + (k === el.dataset.owner ? 0 : v), 0);
      if (sum + n > MAX) return ui.notifications.warn(S("Full", { n: MAX }));
      return save({ tokens: { ...s.tokens, [ST.sel]: { ...t, [el.dataset.owner]: n } } });
    }
    case "reveal": return save({ reveal: { ...s.reveal, [ST.sel]: !s.reveal[ST.sel] } });
    case "bidSave": return saveBid(el.closest("form"));
    case "bidCancel": ST.editBid = null; return renderBoard();
    case "bidEdit": { const a = meActor(); ST.editBid = bidsOf(a, s).find(b => b.id === el.dataset.id) ?? null; if (ST.editBid) { ST.sel = ST.editBid.sector; ST.view = "map"; } return renderBoard(); }
    case "bidDel": { const a = meActor(); return setBids(a, bidsOf(a, s).filter(b => b.id !== el.dataset.id)); }
    case "done": { const a = meActor(); return setBids(a, bidsOf(a, s), !doneOf(a, s)); }
    case "openReport": return (await fromUuid(el.dataset.uuid))?.sheet?.render(true);
    case "hist": ST.hist = ST.hist === Number(el.dataset.n) ? null : Number(el.dataset.n); return renderBoard();
    case "histOff": ST.hist = null; return renderBoard();
    case "guide": return openGuide();
    case "zoom": {
      const svg = el.closest(".rs-map")?.querySelector("svg");
      if (!svg || !ST.base) return;
      if (el.dataset.d === "fit") { ST.zoom = { k: 1, cx: null, cy: null }; return applyView(svg); }
      return zoomAt(svg, ST.zoom.k * (el.dataset.d === "in" ? 1.3 : 1 / 1.3));
    }
    case "focus": ST.focus = ST.focus === el.dataset.key ? null : el.dataset.key; return renderBoard();
    case "projAdd": {
      const a = meActor(), name = el.closest(".rs-row")?.querySelector("[data-rs-newproj]")?.value.trim();
      if (!a || !name) return;
      return a.setFlag(SYSTEM_ID, PROJ, [...projectsOf(a), { id: uid(), sector: ST.sel, name }]);
    }
    case "projDel": { const a = meActor(); if (a) return a.setFlag(SYSTEM_ID, PROJ, projectsOf(a).filter(p => p.id !== el.dataset.id)); return; }
  }
  if (!gm) return;
  switch (act) {
    case "open": await save({ turn: { ...s.turn, open: !s.turn.open } });
      return notify(S(s.turn.open ? "NotifyClosed" : "NotifyOpened", { n: s.turn.n }));
    case "trendAdd": { const name = el.closest(".rs-row")?.querySelector("[data-rs-newtrend]")?.value.trim();
      if (!name || !ST.sel) return;
      const t = { id: uid(), sector: ST.sel, name, level: 1, grow: 1 };
      await save({ trends: [...(s.trends ?? []), t] });
      return trendToDomains(t, s); }
    case "trendLvl": return save({ trends: (s.trends ?? []).map(t => t.id === el.dataset.id ? { ...t, level: Math.clamp(t.level + Number(el.dataset.d), 1, 5) } : t) });
    case "trendGrow": return save({ trends: (s.trends ?? []).map(t => t.id === el.dataset.id ? { ...t, grow: t.grow ? 0 : 1 } : t) });
    case "trendDel": return save({ trends: (s.trends ?? []).filter(t => t.id !== el.dataset.id) });
    case "projNeed": return save({ projNeed: { ...s.projNeed, [el.dataset.id]: Math.clamp(needOf(s, el.dataset.id) + Number(el.dataset.d), 1, 60) } });
    case "pactAdd": return addPact(new foundry.applications.ux.FormDataExtended(el.closest("form")).object);
    case "pactDel": return save({ pacts: (s.pacts ?? []).filter(p => p.id !== el.dataset.id) });
    case "clockUndo": return undoClock(Number(el.dataset.n));
    case "roll": return rollKeys([el.dataset.key], true);
    case "rollAll": return rollKeys(allBids(s).map(x => x.key), false);
    case "resolve": return resolve();
    case "publish": return publish();
    case "draftCancel": return save({ draft: null });
    case "npcAdd": {
      const fd = new foundry.applications.ux.FormDataExtended(el.closest("form")).object;
      if (!fd.owner || !fd.sector) return;
      if (INTENTS[fd.intent]?.target && !fd.target) return ui.notifications.warn(S("NeedTarget"));
      return save({ npc: [...(s.npc ?? []), { id: uid(), npc: true, owner: fd.owner, sector: fd.sector, kind: "attention", intent: fd.intent,
        target: INTENTS[fd.intent]?.target ? fd.target : "", dice: Number(fd.dice) || 0, text: String(fd.text ?? "").trim() }] });
    }
    case "npcDel": return save({ npc: (s.npc ?? []).filter(b => b.id !== el.dataset.id) });
    case "secAdd": { const key = uid(), q = Math.max(0, ...s.sectors.map(x => x.q)) + 1; ST.sel = key;
      return save({ sectors: [...s.sectors, { key, name: S("NewSector"), sphere: s.spheres[0]?.key ?? "", q, r: 0, about: "" }] }); }
    case "secDel": { const x = s.sectors[Number(el.dataset.i)];
      if (!(await foundry.applications.api.DialogV2.confirm({ window: { title: S("Delete") }, content: `<p>${esc(S("DeleteSector", { name: sectorName(x) }))}</p>` }))) return;
      const tokens = { ...s.tokens }; delete tokens[x.key];
      return save({ sectors: s.sectors.filter((_, i) => i !== Number(el.dataset.i)), tokens }); }
    case "move": { const secs = s.sectors.map(x => ({ ...x })), x = secs[Number(el.dataset.i)];
      x.q += Number(el.dataset.dq); x.r += Number(el.dataset.dr); ST.sel = x.key; return save({ sectors: secs }); }
    case "sphAdd": return save({ spheres: [...s.spheres, { key: uid(), name: S("NewSphere"), color: "#777777" }] });
    case "facAdd": return save({ owners: { ...s.owners, [`f:${uid()}`]: { name: S("NewFaction"), color: "#5a6b7d" } } });
    case "facTech": {   // Конвенции Технократии: фракции и стартовое влияние (правило системы)
      const owners = { ...s.owners }, tokens = foundry.utils.deepClone(s.tokens), names = Object.fromEntries((Codex.mage?.factions ?? []).map(f => [f.key, f.name]));
      for (const c of CONVENTIONS) {
        const k = `f:conv-${c.key}`;
        owners[k] = { ...(owners[k] ?? {}), name: owners[k]?.name || names[c.key] || c.key, color: owners[k]?.color || c.color };
        for (const sec of c.sectors) if (s.sectors.some(x => x.key === sec)) tokens[sec] = { ...(tokens[sec] ?? {}), [k]: Math.max(tokens[sec]?.[k] ?? 0, 2) };
      }
      return save({ owners, tokens });
    }
    case "facDead": {   // Мир мёртвых: фракции Стигии и стартовое влияние (правило системы)
      const owners = { ...s.owners }, tokens = foundry.utils.deepClone(s.tokens), names = Object.fromEntries((Codex.wraith?.factions ?? []).map(f => [f.key, f.name]));
      for (const c of DEAD_FACTIONS) {
        const k = `f:dead-${c.key}`;
        owners[k] = { ...(owners[k] ?? {}), name: owners[k]?.name || names[c.key] || c.key, color: owners[k]?.color || c.color };
        for (const sec of c.sectors) if (s.sectors.some(x => x.key === sec)) tokens[sec] = { ...(tokens[sec] ?? {}), [k]: Math.max(tokens[sec]?.[k] ?? 0, 2) };
      }
      return save({ owners, tokens });
    }
    case "facDel": { const owners = { ...s.owners }; delete owners[el.dataset.key]; return save({ owners }); }
    case "wipe": if (await foundry.applications.api.DialogV2.confirm({ window: { title: S("Wipe") }, content: `<p>${esc(S("WipeConfirm"))}</p>` })) return game.settings.set(SYSTEM_ID, "strategy", {});
  }
}

async function onChange(ev) {
  const el = ev.target, s = strat();
  if (el.matches("[data-rs-me]")) { ST.me = el.value; ST.editBid = null; return renderBoard(); }
  if (el.closest(".rs-npcform") || el.matches("[data-rs-newtrend], [data-rs-newproj]")) return;
  if (el.closest(".rs-form")) {         // форма заявки: пересчитать пул и шансы
    const f = el.closest(".rs-form"), fd = new foundry.applications.ux.FormDataExtended(f).object;
    ST.editBid = { ...(ST.editBid ?? {}), ...fd, id: f.dataset.id, sector: f.dataset.sec };
    if (!INTENTS[ST.editBid.intent]?.target) ST.editBid.target = "";
    return renderBoard();
  }
  if (!game.user.isGM) return;
  if (el.matches("[data-rs-addowner]") && el.value) return save({ tokens: { ...s.tokens, [ST.sel]: { ...(s.tokens[ST.sel] ?? {}), [el.value]: Math.max(1, s.tokens[ST.sel]?.[el.value] ?? 0) } } });
  if (el.matches("[data-rs-label]")) return save({ turn: { ...s.turn, label: el.value } });
  if (el.dataset.rsShift) return save({ turn: { ...s.turn, shift: { ...(s.turn.shift ?? { n: 0, unit: "months" }), [el.dataset.rsShift]: el.dataset.rsShift === "n" ? Math.max(0, Number(el.value) || 0) : el.value } } });
  if (el.dataset.mod) { const k = el.closest("[data-key]").dataset.key; return save({ mods: { ...s.mods, [k]: { ...(s.mods[k] ?? {}), [el.dataset.mod]: Number(el.value) || 0 } } }); }
  if (el.dataset.rsDraft) return save({ draft: el.dataset.rsDraft === "public" ? { ...s.draft, public: el.value } : { ...s.draft, private: { ...s.draft.private, [el.dataset.rsDraft]: el.value } } });
  const v = el.type === "checkbox" ? el.checked : el.value;
  if (el.dataset.rsSec) { const secs = s.sectors.map(x => ({ ...x })); secs[Number(el.dataset.rsSec)][el.dataset.f] = v; return save({ sectors: secs }); }
  if (el.dataset.rsSph) { const sp = s.spheres.map(x => ({ ...x })); sp[Number(el.dataset.rsSph)][el.dataset.f] = v; return save({ spheres: sp }); }
  if (el.dataset.rsFac) return save({ owners: { ...s.owners, [el.dataset.rsFac]: { ...s.owners[el.dataset.rsFac], [el.dataset.f]: v } } });
}

/* ── Стратегия ↔ домен (план 2; правило системы, согласовано): квартал домена, Защищённость по фишкам, события ↔ тренды ── */

