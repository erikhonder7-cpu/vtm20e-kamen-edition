// module/data/art-effects.mjs
// Искусства подменышей как эффекты (C20, гл. 4; тексты уровней — data/changeling.json): удачный кантрип на самого
// заклинателя ложится ActiveEffect — той же машиной, что Дары, Грани и Арканои (data/effects.mjs): флаг power =
// «art:<Искусство>|<уровень>», правки по успехам — во флаге artFx (считает arcFx: "n" — успехи, "-n" — минус успехи).
// Действие на других (кубы и сложности чужих бросков) — напоминание (note) со сроком на вкладке «Эффекты».

export const ART_EFFECTS = {
  // Гнев Дракона 1, Пылающая мощь: каждый успех — +1 к Силе (часть успехов можно отдать на длительность — решает игрок)
  "art:dragonsIre|1": { mode: "scene", icon: "fa-fire", attr: { strength: "n" } },
  // Гнев Дракона 2, Сбивающие с толку кольца: атаки по заклинателю +2 к сложности (не выше 9), ход за успех; не против холодного железа
  "art:dragonsIre|2": { mode: "scene", icon: "fa-shield-halved", diff: { hit: 2 }, note: true },
  // Гнев Дракона 3, Драконьи чешуи: броски урона по заклинателю +2 к сложности, ход за успех; не против холодного железа
  "art:dragonsIre|3": { mode: "scene", icon: "fa-shield", note: true },
  // Первобытное 4, Древний облик (Земля): +3 куба поглощения, летальный поглощается; тяжёлый — скорость вдвое ниже
  "art:primal|4": { mode: "scene", icon: "fa-mountain", soakAll: 3, note: true },
  // Осень 1, Ползущие тени: тонкое применение — −1 к сложности Запугивания за успех
  "art:autumn|1": { mode: "scene", icon: "fa-ghost", abilDiff: { intimidation: "-n" } },
  // Сказ 2, Работа с залом: −1 к сложности Выступления и Выразительности за успех — на сцену
  "art:taleCraft|2": { mode: "scene", icon: "fa-masks-theater", abilDiff: { performance: "-n", expression: "-n" } },
  // Лето 1, Мерцающие мушки: броски, опирающиеся на вызванное чувство, −1 к сложности — решает рассказчик
  "art:summer|1": { mode: "scene", icon: "fa-heart", note: true },
  // Именование 1, Между строк: +1 куб за успех к оспариваемым действиям против цели — напоминание
  "art:naming|1": { mode: "scene", icon: "fa-language", note: true }
};

/** Правки эффекта по успехам кантрипа: "n" — успехи, "-n" — минус успехи; soakAll — кубы прочности против любого урона. */
export function artFx(def, { n = 0 } = {}) {
  const val = v => v === "n" ? n : v === "-n" ? -n : v;
  const out = {};
  for (const [k, v] of Object.entries(def)) {
    if (["mode", "icon"].includes(k)) continue;
    if (k === "soakAll") { const s = val(v); if (s) out.soakBonus = { bashing: s, lethal: s, aggravated: s }; continue; }
    out[k] = v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, val(b)])) : val(v);
  }
  return out;
}
