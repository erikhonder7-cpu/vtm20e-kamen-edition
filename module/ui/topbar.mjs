// module/ui/topbar.mjs
// Полоса нексуса вместо ленты сцен Foundry (порт из mass-effect).
//
// Штатная навигация (#scene-navigation) — лента вкладок со всеми активными
// сценами; в хронике их десятки, и лента только мешает. Прячем её стилями по
// классу body.r-nav-off и ставим на то же место компактную плиту: кнопка
// нексуса, название сцены, ночные часы, фаза ночи и луна.
//
// Полоса — не окно Foundry, а обычный div в #ui-left-column-2: там же живёт
// штатная навигация, поэтому раскладка и масштаб интерфейса остаются целыми.

import { openSceneNexus } from "../apps/scene-nexus.mjs";
import { openCalendar, clockBarData } from "../apps/calendar.mjs";

const EL_ID = "r-topbar";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const L = k => game.i18n.localize(`VTM20.Topbar.${k}`);

let _tick = null;
let _hooked = false;

function sceneName() {
  return canvas?.scene?.name || game.scenes?.current?.name || L("NoScene");
}

/** Полная отрисовка полосы. */
export function refreshTopBar() {
  const el = document.getElementById(EL_ID);
  if (!el) return;
  const c = clockBarData();
  const isGM = !!game.user?.isGM;

  el.innerHTML = `
    <a class="r-tb-nexus" data-nexus title="${L("NexusHint")}">
      <i class="fa-solid fa-diagram-project"></i><span>${L("Nexus")}</span>
    </a>
    <div class="r-tb-row r-tb-scene" title="${esc(sceneName())}">
      <i class="fa-solid fa-location-dot"></i>
      <span class="r-tb-name">${esc(sceneName())}</span>
    </div>
    <div class="r-tb-row r-tb-clock ${c.running ? "on" : ""}" data-clock data-phase="${c.phase.key}"
         title="${isGM ? L("ClockHintGM") : L("ClockHint")}">
      <i class="fa-solid ${c.phase.icon}"></i>
      <span class="r-tb-time" data-tb-time>${c.time}</span>
      <span class="r-tb-date" data-tb-date>${esc(c.date)}</span>
    </div>
    ${c.republic ? `<div class="r-tb-row r-tb-republic" title="${L("RepublicHint")}"><i class="fa-solid fa-landmark"></i><span data-tb-republic>${esc(c.republic)}</span></div>` : ""}
    <div class="r-tb-row r-tb-phase" data-phase="${c.phase.key}">
      <span class="r-tb-moon" data-tb-moon title="${esc(c.moon.label)} · ${c.moon.illumination}%">${c.moon.glyph}</span>
      <span class="r-tb-until" data-tb-until>${esc(c.phase.untilLabel)}</span>
      <span class="r-tb-night" data-tb-night title="${L("NightHint")}">${L("Night")} ${c.night}</span>
    </div>
    ${c.scene ? `<div class="r-tb-row r-tb-scene-timer">
      <i class="fa-solid fa-stopwatch"></i>
      <span class="r-tb-timer" data-tb-timer>${esc(c.scene)}</span>
    </div>` : ""}`;

  el.querySelector("[data-nexus]")?.addEventListener("click", () => openSceneNexus());
  if (isGM) el.querySelector("[data-clock]")?.addEventListener("click", () => openCalendar());
  else el.querySelector("[data-clock]")?.classList.add("is-flat");
}

/** Только цифры — раз в секунду, без полной перерисовки. */
export function paintClockBar() {
  const el = document.getElementById(EL_ID);
  if (!el) return;
  const c = clockBarData();
  const set = (sel, txt) => { const n = el.querySelector(sel); if (n && n.textContent !== txt) n.textContent = txt; };
  set("[data-tb-time]", c.time);
  set("[data-tb-date]", c.date);
  set("[data-tb-republic]", c.republic);
  set("[data-tb-until]", c.phase.untilLabel);
  set("[data-tb-night]", `${L("Night")} ${c.night}`);
  set("[data-tb-moon]", c.moon.glyph);
  const box = el.querySelector("[data-clock]");
  if (box) {
    box.classList.toggle("on", c.running);
    if (box.dataset.phase !== c.phase.key) { refreshTopBar(); return; }
  }
  const hasRow = !!el.querySelector("[data-tb-timer]");
  if (!!c.scene !== hasRow) refreshTopBar();
  else if (c.scene) set("[data-tb-timer]", c.scene);
}

/** Создать полосу и подписаться на события, от которых она меняется. */
export function initTopBar() {
  if (document.getElementById(EL_ID)) return;
  const host = document.getElementById("ui-left-column-2")
    || document.getElementById("ui-left")
    || document.getElementById("interface");
  if (!host) return;

  const el = document.createElement("div");
  el.id = EL_ID;
  el.className = "r-topbar";
  host.prepend(el);
  document.body.classList.add("r-nav-off");
  refreshTopBar();

  if (!_hooked) {
    _hooked = true;
    Hooks.on("canvasReady", () => refreshTopBar());
    Hooks.on("updateScene", () => refreshTopBar());
  }
  if (_tick) clearInterval(_tick);
  _tick = setInterval(() => paintClockBar(), 1000);
}

/** Вернуть штатную навигацию. */
export function removeTopBar() {
  if (_tick) { clearInterval(_tick); _tick = null; }
  document.getElementById(EL_ID)?.remove();
  document.body.classList.remove("r-nav-off");
}
