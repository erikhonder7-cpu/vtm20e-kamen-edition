/**
 * Короткая анимация изменений на листе и в худе (styles/r-depth.css, раздел «Анимация изменений»):
 * потраченная капля крови гаснет и стекает, клетка здоровья вспыхивает, когда в неё приходит урон,
 * новая точка проявляется. Перед перерисовкой запоминаем, что было заполнено (snapState), после — сравниваем (playChanges).
 * Сравниваем по порядку в документе: если число точек, капель или клеток изменилось (другая вкладка, новый предмет) — молчим.
 * При «меньше движения» ничего не играет.
 */

const KINDS = {
  sheet: {
    dot: [".r-dot", e => e.classList.contains("is-filled")],
    drop: [".r-drop", e => e.classList.contains("is-filled")],
    box: [".r-hbox", e => /\bis-(bashing|lethal|aggravated)\b/.test(e.className)]
  },
  hud: {
    dot: ["#r-hud .d, #r-hud .b", e => e.classList.contains("on")],
    drop: ["#r-hud .dr", e => !e.querySelector('path[stroke^="rgba"]')],
    box: ["#r-hud .hb", e => /\bis-(bashing|lethal|aggravated)\b/.test(e.className)]
  }
};
const CLS = { dot: ["r-fx-dot-in", ""], drop: ["r-fx-drop-in", "r-fx-drop-out"], box: ["r-fx-hit", ""] };

/** Что сейчас заполнено: { dot: [true, false, …], drop: […], box: […] } — или null, если окна ещё нет. */
export function snapState(root, where = "sheet") {
  if (!root?.isConnected) return null;
  const out = { key: root.dataset?.rActor ?? "" };
  for (const [kind, [sel, on]] of Object.entries(KINDS[where])) out[kind] = [...root.querySelectorAll(sel)].map(on);
  return out;
}

/** Проиграть изменения между снимком prev и тем, что на экране сейчас. */
export function playChanges(root, prev, where = "sheet") {
  if (!prev || !root?.isConnected || (root.dataset?.rActor ?? "") !== prev.key) return;
  if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  for (const [kind, [sel, on]] of Object.entries(KINDS[where])) {
    const els = [...root.querySelectorAll(sel)], was = prev[kind];
    if (!was || was.length !== els.length) continue;
    const [inCls, outCls] = CLS[kind];
    els.forEach((el, i) => {
      const now = on(el);
      const cls = now && !was[i] ? inCls : !now && was[i] ? outCls : "";
      if (!cls) return;
      el.classList.add(cls);
      el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
    });
  }
}
