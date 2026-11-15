// module/ui/a11y.mjs
// Кнопки системы с клавиатуры и для экранных дикторов — одним местом, без правки шаблонов.
// В окнах системы почти все кнопки — ссылки без href (<a data-action>): мышью работают, но Tab их пропускает,
// Enter и пробел не нажимают, диктор не называет их кнопками. Здесь такие элементы получают role="button" и tabindex,
// Enter/пробел нажимают их как щелчок; кнопка из одной иконки без подписи — подпись по иконке (подсказка и aria-label).
// Новые элементы (перерисовка окна, карточка в чате, HUD) ловит наблюдатель за DOM.

/** Нажимаемое без собственного фокуса: ссылки-кнопки без href и блоки с data-action. */
const ACTIONABLE = "a[data-action]:not([href]), a[data-act]:not([href]), a[data-r-action]:not([href]), a[data-step]:not([href]), "
  + "div[data-action], span[data-action], li[data-action], i[data-action], img[data-action]";
/** Только интерфейс системы: окна .vtm20, HUD и прочие блоки с классами «r-…». */
const OURS = ".vtm20, #r-hud, [id^='r-'], [class^='r-'], [class*=' r-']";
/** Иконки с общепонятным смыслом: подпись — VTM20.A11y.Icon.<иконка без fa->. */
const ICONS = new Set(["xmark", "minus", "plus", "pen", "pen-to-square", "trash", "trash-can", "chevron-down", "chevron-up", "chevron-left", "chevron-right"]);

const iconOnly = el => !el.textContent.trim() && el.querySelector("i[class*='fa-']");

/** Одна кнопка: роль, фокус, подпись. */
function fix(el) {
  if (!el.closest(OURS)) return;
  if (!el.matches("button")) {
    if (!el.hasAttribute("role")) el.setAttribute("role", "button");
    if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
  }
  if (!iconOnly(el) || el.getAttribute("aria-label")) return;
  const tip = el.dataset.tooltip;
  if (tip && !tip.includes("<")) { el.setAttribute("aria-label", tip); return; }
  if (tip || el.title) return;
  const icon = [...el.querySelector("i[class*='fa-']").classList].map(c => c.replace(/^fa-/, "")).find(c => ICONS.has(c));
  if (!icon) return;
  const label = game.i18n.localize(`VTM20.A11y.Icon.${icon}`);
  el.setAttribute("aria-label", label);
  el.dataset.tooltip = label;
}

/** Всё нажимаемое внутри узла (и сам узел). */
function enhance(root) {
  if (!(root instanceof Element)) return;
  if (root.matches(ACTIONABLE) || root.matches("button")) fix(root);
  for (const el of root.querySelectorAll(`${ACTIONABLE}, button`)) fix(el);
}

let registered = false;
export function registerA11y() {
  if (registered) return;
  registered = true;
  // новые узлы — пачкой в следующем кадре
  const pending = new Set();
  let frame = 0;
  const flush = () => { frame = 0; for (const n of pending) if (n.isConnected) enhance(n); pending.clear(); };
  new MutationObserver(list => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) pending.add(n);
    if (pending.size && !frame) frame = requestAnimationFrame(flush);
  }).observe(document.body, { childList: true, subtree: true });
  enhance(document.body);
  // Enter и пробел на кнопке-ссылке — как щелчок; раньше клавиатурных сочетаний Foundry (пробел — пауза)
  window.addEventListener("keydown", ev => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const el = ev.target;
    if (!(el instanceof HTMLElement) || el.getAttribute("role") !== "button" || el.matches("button, input, textarea, select") || el.isContentEditable) return;
    if (!el.matches(ACTIONABLE) || !el.closest(OURS)) return;
    ev.preventDefault();
    ev.stopPropagation();
    el.click();
  }, true);
}
