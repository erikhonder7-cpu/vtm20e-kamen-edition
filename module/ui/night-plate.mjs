// module/ui/night-plate.mjs
// Плашка ночи — одна на весь экран (полоса нексуса и карта города): сцена, время и сколько
// осталось до рассвета полоской от заката до восхода. В последний час ночи плашка краснеет,
// часы на паузе — время серое. Дата, республиканский календарь, номер ночи, луна и таймер
// сцены — во всплывающей подсказке.

import { clockBarData, hhmm } from "../apps/calendar.mjs";

const L = k => game.i18n.localize(`VTM20.Topbar.${k}`);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * Разметка плашки.
 * @param {object} o
 * @param {boolean} [o.nexus]  кнопка нексуса слева
 * @param {string}  [o.scene]  название сцены (не задано — без блока сцены)
 */
export function plateHTML({ nexus = false, scene = null } = {}) {
  return `<div class="r-np" data-np>
    ${nexus ? `<a class="r-np-nexus" data-nexus data-tooltip="${esc(L("NexusHint"))}" aria-label="${esc(L("Nexus"))}"><i class="fa-solid fa-diagram-project"></i></a>` : ""}
    ${scene !== null ? `<div class="r-np-scene"><small>${esc(L("Scene"))}</small><span data-np-scene>${esc(scene)}</span></div>` : ""}
    <div class="r-np-time" data-np-clock><span data-np-time></span></div>
    <div class="r-np-dawn">
      <span class="r-np-lbl"><span data-np-label></span> <b data-np-left></b></span>
      <span class="r-np-track"><i data-np-fill></i><em data-np-mark></em></span>
    </div>
    <div class="r-np-timer" data-np-timer hidden><i class="fa-solid fa-stopwatch"></i><span></span></div>
  </div>`;
}

/** Обновить цифры, полоску и состояния — раз в секунду, без перерисовки разметки. */
export function paintPlate(root, c = clockBarData()) {
  const el = root?.matches?.("[data-np]") ? root : root?.querySelector("[data-np]");
  if (!el) return;
  const set = (sel, txt) => { const n = el.querySelector(sel); if (n && n.textContent !== txt) n.textContent = txt; };
  const s = c.span;
  set("[data-np-time]", c.time);
  set("[data-np-label]", L(s.night ? "ToSunrise" : "ToSunset"));
  set("[data-np-left]", s.leftText);
  el.querySelector("[data-np-fill]")?.style.setProperty("width", `${s.pct.toFixed(1)}%`);
  el.querySelector("[data-np-mark]")?.style.setProperty("left", `${s.pct.toFixed(1)}%`);
  el.classList.toggle("is-day", !s.night);
  el.classList.toggle("is-hot", s.hot);
  el.classList.toggle("is-paused", !c.running);
  el.classList.toggle("is-gliding", !!c.gliding);
  const timer = el.querySelector("[data-np-timer]");
  if (timer) { timer.hidden = !c.scene; set("[data-np-timer] span", c.scene); }
  // Подсказка меняется раз в минуту — не трогаем её каждую секунду, пока на неё смотрят
  const tip = [
    `<b>${esc(c.republic || c.longDate)}</b>${c.republic ? ` · ${esc(c.longDate)}` : ""}`,
    `${esc(L("Night"))} <b>${c.night}</b> · ${esc(L("Sunset"))} ${hhmm(new Date(c.phase.sunset))}, ${esc(L("Sunrise"))} ${hhmm(new Date(c.phase.sunrise))}`,
    `${esc(c.moon.label)}, ${c.moon.illumination}%${c.scene ? ` · ${esc(L("SceneTimer"))} ${esc(c.scene)}` : ""}`
  ].join("<br>");
  // Подсказка Foundry срабатывает только на самом элементе, поэтому — на оба блока (их содержимое мыши не ловит)
  for (const box of el.querySelectorAll(".r-np-time, .r-np-dawn")) if (box.dataset.tooltipHtml !== tip) box.dataset.tooltipHtml = tip;
}
