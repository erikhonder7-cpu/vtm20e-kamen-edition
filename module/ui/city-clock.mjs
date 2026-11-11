// module/ui/city-clock.mjs
// Карта города — часы хроники на плане: панель времени, стрелка ночи, рассвет на карте.
// Вынесено из citymap.mjs; состояние карты — city-state.mjs.

import { getClock, clockRunning, clockRate, nightSpan, MS_HOUR } from "../apps/calendar.mjs";
import { plateHTML, paintPlate } from "./night-plate.mjs";
import { ID, L, esc, T, RATES, placeInspector } from "./city-util.mjs";
import { S } from "./city-state.mjs";

/** Кадр анимации: часы на карте идут вместе с ночными часами. */
export function frame(ts) {
  S.raf = requestAnimationFrame(frame);
  if (!S.map || ts - S.lastLabels < 500) return;
  S.lastLabels = ts;
  paintClock(getClock());
}

/** Часы ночи в углу карты; ведущему — пуск, скорость и плавная промотка. */
export function drawClock() {
  const box = document.querySelector(`#${ID} .rc-clock`);
  if (!box || !S.state) return;
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
export function paintClock() {
  paintPlate(document.querySelector(`#${ID} .rc-clock`));
  paintDawn();
  placeInspector();
}

/**
 * Рассвет на карте (Г2): в последний час ночи восточный край плана теплеет, к восходу — сильнее;
 * днём тепло держится. Восток — с учётом поворота карты.
 */
export function paintDawn() {
  const box = document.querySelector(`#${ID} .rc-map`);
  if (!box) return;
  const s = nightSpan();
  const k = !s.night ? 1 : s.left < MS_HOUR ? 1 - s.left / MS_HOUR : 0;
  const a = `${Math.round(90 - (S.map?.getBearing() ?? 0))}deg`;
  if (box.style.getPropertyValue("--dawn") !== k.toFixed(2)) box.style.setProperty("--dawn", k.toFixed(2));
  if (box.style.getPropertyValue("--dawn-a") !== a) box.style.setProperty("--dawn-a", a);
}
