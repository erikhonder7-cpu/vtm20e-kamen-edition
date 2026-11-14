// module/ui/tooltip-tidy.mjs
// Подсказка не всплывает, когда повторяет надпись, которую и так видно (кнопка «Библиотека», вкладка «Черты»),
// или пуста. Когда лист узкий и надпись спрятана стилями, innerText её не содержит — и подсказка снова нужна,
// поэтому проверка идёт в момент наведения, до TooltipManager (он слушает body, этот обработчик — window).

const norm = s => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const FORM = "input, select, textarea";

function redundant(el) {
  const tip = el.dataset.tooltip;
  if (tip === undefined || el.dataset.tooltipHtml) return false;
  if (!norm(tip)) return !el.getAttribute("aria-label");
  if (el.matches(FORM)) return false;
  const shown = norm(el.innerText);
  return !!shown && shown === norm(tip);
}

export function registerTooltipTidy() {
  window.addEventListener("pointerenter", ev => {
    const el = ev.target;
    if (!(el instanceof HTMLElement) || !("tooltip" in el.dataset) || !el.closest(".vtm20")) return;
    if (!redundant(el)) return;
    el.dataset.rTip = el.dataset.tooltip;
    delete el.dataset.tooltip;
    el.addEventListener("pointerleave", () => {
      if (el.dataset.rTip !== undefined) { el.dataset.tooltip = el.dataset.rTip; delete el.dataset.rTip; }
    }, { once: true });
  }, true);
}
