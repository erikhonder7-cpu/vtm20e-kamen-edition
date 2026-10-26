// module/data/ritual-text.mjs
// Текст ритуала по разделам (справочники tools/sources/rituals → data/rituals.json → parts): описание, компоненты,
// эффект, прочие разделы («Правила и ограничения», «Как снять»…) и источник. Ритуал без разделов (свой, старый) —
// просто описание.

const L = k => game.i18n.localize(`VTM20.Ritual.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Есть ли у ритуала разделы справочника. */
export const hasParts = s => !!(s?.components || s?.effect || s?.notes?.length || s?.ref);

/** Полный HTML ритуала: для списка на листе персонажа и карточки в чате. */
export function ritualHTML(s) {
  if (!hasParts(s)) return s?.description ?? "";
  const sec = (title, body) => body ? `<h4 class="r-rite-h">${esc(title)}</h4>${body}` : "";
  return (s.description ?? "") + sec(L("Components"), s.components) + sec(L("Effect"), s.effect)
    + (s.notes ?? []).map(n => sec(n.title, n.html)).join("")
    + (s.ref ? `<p class="r-rite-ref"><em>${L("Ref")}: ${esc(s.ref)}</em></p>` : "");
}

/** Поля предмета из записи справочника (data/rituals.json): описание — шапка + «Описание», остальное — по разделам. */
export function ritualFields(r) {
  const p = r.parts;
  if (!p) return { description: r.html ?? "" };
  return { description: (p.head ?? "") + p.desc, components: p.components, effect: p.effect, notes: p.notes, ref: p.ref };
}
