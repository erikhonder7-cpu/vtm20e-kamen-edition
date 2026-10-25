// module/ui/themes.mjs
// Цветовая тема окна — по типу персонажа (просьба 26.10: дальше будут оборотни, маги, феи).
// Любое окно системы (класс vtm20), открытое для персонажа — лист, бросок, опыт, охота, лист его предмета, —
// получает класс r-type-<тип>; подтверждения без персонажа (DialogV2) — тип того, в чьём окне только что щёлкнули.
// Палитра типа — в styles/types/<тип>.css (переменные --r-* и немногие точечные правила); вампир — основа, без файла.
// Карточки чата берут тип из своего шаблона (r-type-{{actorType}}), см. dice/roll.mjs и chat/item-card.mjs.

let recent = { type: null, at: 0 };
const FRESH_MS = 3000;

/** Персонаж окна: свой, документ-персонаж или владелец предмета. */
function actorOf(app) {
  if (app.actor instanceof Actor) return app.actor;
  const doc = app.document;
  if (doc instanceof Actor) return doc;
  if (doc?.parent instanceof Actor) return doc.parent;
  return null;
}

/** Класс темы для своих HTML-кусков (карточки, уведомления). */
export const themeClass = actor => actor?.type ? `r-type-${actor.type}` : "";

export function registerThemes() {
  Hooks.on("renderApplicationV2", (app, element) => {
    // окна системы и стандартные подтверждения Foundry (их цвета — переменные Foundry, переопределены в теме типа)
    const isDialog = app instanceof foundry.applications.api.DialogV2;
    if (!element?.classList?.contains("vtm20") && !isDialog) return;
    const type = actorOf(app)?.type ?? (Date.now() - recent.at < FRESH_MS && isDialog ? recent.type : null);
    for (const c of [...element.classList]) if (c.startsWith("r-type-") && c !== `r-type-${type}`) element.classList.remove(c);
    if (!type) return;
    element.classList.add(`r-type-${type}`);
    // щелчок в окне персонажа — его тему получит и подтверждение, которое откроется следом
    if (!element.dataset.rTheme) {
      element.dataset.rTheme = "1";
      element.addEventListener("pointerdown", () => { const a = actorOf(app); if (a) recent = { type: a.type, at: Date.now() }; }, true);
    }
  });
}
