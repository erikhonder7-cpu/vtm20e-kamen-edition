// module/ui/topbar.mjs
// Полоса нексуса вместо ленты сцен Foundry (порт из mass-effect).
//
// Штатная навигация (#scene-navigation) — лента вкладок со всеми активными
// сценами; в хронике их десятки, и лента только мешает. Прячем её стилями по
// классу body.r-nav-off и ставим на то же место плашку ночи (ui/night-plate.mjs):
// кнопка нексуса, название сцены, время и полоска «до рассвета».
//
// Полоса — не окно Foundry, а обычный div в #ui-left-column-2: там же живёт
// штатная навигация, поэтому раскладка и масштаб интерфейса остаются целыми.

import { openSceneNexus } from "../apps/scene-nexus.mjs";
import { openCalendar } from "../apps/calendar.mjs";
import { plateHTML, paintPlate } from "./night-plate.mjs";

const EL_ID = "r-topbar";
const L = k => game.i18n.localize(`VTM20.Topbar.${k}`);

let _tick = null;
let _hooked = false;

function sceneName() {
  return canvas?.scene?.name || game.scenes?.current?.name || L("NoScene");
}

/** Полная отрисовка полосы: плашка ночи с кнопкой нексуса и названием сцены. */
export function refreshTopBar() {
  const el = document.getElementById(EL_ID);
  if (!el) return;
  const isGM = !!game.user?.isGM;
  el.innerHTML = plateHTML({ nexus: true, scene: sceneName(), xp: isGM });
  el.querySelector("[data-nexus]")?.addEventListener("click", () => openSceneNexus());
  const clock = el.querySelector("[data-np-clock]");
  if (isGM) clock?.addEventListener("click", () => openCalendar());
  el.querySelector("[data-np-xp]")?.addEventListener("click", () => import("../apps/session-xp.mjs").then(m => m.openSessionXp()));
  clock?.classList.toggle("is-link", isGM);
  paintPlate(el);
}

/** Только цифры — раз в секунду, без полной перерисовки. */
export function paintClockBar() {
  paintPlate(document.getElementById(EL_ID));
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
