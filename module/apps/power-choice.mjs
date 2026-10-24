// module/apps/power-choice.mjs
// Выбор силы Дисциплины, когда на уровне их несколько (высокие уровни 6–9, альтернативы кланбуков и Lore of
// the Bloodlines). Выбор хранится в предмете Дисциплины: system.choices = { уровень: имя силы }.
// Окно открывается само, когда точки Дисциплины доходят до уровня с выбором, и по кнопке на листе.

import { Codex } from "../data/codex.mjs";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Подходит ли сила уровню: свой уровень, или «любой из 6–9» (anyLevel, Guide to the Camarilla),
 *  если её не выбрали на другом уровне (choices — выбор Дисциплины: уровень → имя силы). */
export function fitsLevel(p, level, choices = {}) {
  level = Number(level);
  if (Number(p.level) === level) return !p.anyLevel || !takenElsewhere(p, level, choices);
  return !!p.anyLevel && level >= 6 && level <= 9 && !takenElsewhere(p, level, choices);
}
const takenElsewhere = (p, level, choices) => Object.entries(choices).some(([l, n]) => n === p.name && Number(l) !== level);

/** Силы уровня, доступные сейчас (без Тёмных веков при выключенной настройке). */
export function levelOptions(key, level, choices = {}) {
  return (Codex.discipline(key)?.powers ?? []).filter(p => Codex.visible(p) && fitsLevel(p, level, choices));
}

/** Уровни до value включительно, где выбор нужен, но ещё не сделан. */
export function pendingLevels(item) {
  const s = item.system, ch = s.choices ?? {}, out = [];
  for (let lv = 1; lv <= s.value; lv++) {
    const opts = levelOptions(s.key, lv, ch);
    if (opts.length > 1 && !opts.some(p => p.name === ch[lv])) out.push(lv);
  }
  return out;
}

/** Окно выбора силы уровня level; возвращает имя выбранной силы или null. */
export async function choosePower(item, level) {
  await Codex.load();
  const d = Codex.discipline(item.system.key);
  const opts = levelOptions(item.system.key, level, item.system.choices ?? {});
  if (!d || opts.length < 2) return null;
  const cur = item.system.choices?.[level];
  const content = `<p class="r-choice-hint">На ${ROMAN[level - 1] ?? level} уровне ${esc(d.name)} несколько сил — персонаж знает одну.
      Другую можно взять позже как новую способность того же уровня (по решению Рассказчика).</p>
    <div class="r-choice-list">${opts.map((p, i) => `
      <label class="r-choice">
        <input type="radio" name="power" value="${esc(p.name)}" ${p.name === cur || (!cur && i === 0) ? "checked" : ""}>
        <span class="r-choice-head"><b>${esc(p.name)}</b>${p.en ? ` <em>${esc(p.en)}</em>` : ""}
          <small>${esc(p.source || "V20")}${p.era ? " · Тёмные века" : ""}${p.anyLevel ? " · любой уровень VI–IX" : ""}</small></span>
        <details class="r-choice-text"><summary>Описание</summary>${p.html ?? ""}</details>
      </label>`).join("")}</div>`;
  const picked = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${d.name}: сила ${ROMAN[level - 1] ?? level} уровня`, icon: "fa-solid fa-code-branch" },
    classes: ["vtm20", "r-choice-dialog"], position: { width: 560 },
    content, rejectClose: false,
    ok: { label: "Выбрать", icon: "fa-solid fa-check", callback: (event, button) => button.form.elements.power?.value ?? null }
  });
  if (!picked) return null;
  await item.update({ [`system.choices.${level}`]: picked });
  return picked;
}

// Точки Дисциплины выросли до уровня с выбором — спросить сразу (только у того, кто менял, и по порядку уровней)
Hooks.on("updateItem", async (item, change, options, userId) => {
  if (userId !== game.user.id || item.type !== "discipline" || !item.parent || change.system?.value === undefined) return;
  await Codex.load();
  for (const lv of pendingLevels(item)) {
    if (!(await choosePower(item, lv))) break;            // закрыли окно — не донимать остальными уровнями
  }
});
