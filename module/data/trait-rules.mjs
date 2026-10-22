// module/data/trait-rules.mjs
// Противоречия между достоинствами и недостатками при создании персонажа.
//
// «block» — запрет прямо записан в тексте черты (data/merits.json, V20): такую пару взять нельзя.
// «warn»  — черта рассчитана на определённую секту; взять можно, но мастер предупредит,
//           решает рассказчик.

/** Пары, которые прямо несовместимы по тексту черт. */
const EXCLUSIVE = [
  ["Ранняя пташка", "Глубокий сон"],
  ["Гигант", "Коротышка"]
];

/** Недостатки «только Камарилья» (V20, текст черт). */
const CAMARILLA_ONLY = ["Жертва Маскарада", "Сорванный дебют", "Бывший Принц", "Цель Кровавой Охоты", "Посмешище"];

/** Что мешает взять черту name при уже выбранных names. */
export function blockerFor(name, names) {
  for (const [a, b] of EXCLUSIVE) {
    if (name === a && names.includes(b)) return b;
    if (name === b && names.includes(a)) return a;
  }
  return null;
}

/**
 * Проверка набора черт.
 * @param {string[]} names — выбранные достоинства и недостатки
 * @param {{sectKey?: string}} ctx
 * @returns {{level: "block"|"warn", key: string, data: object}[]}
 */
export function checkTraits(names, { sectKey = "" } = {}) {
  const out = [];
  for (const [a, b] of EXCLUSIVE) if (names.includes(a) && names.includes(b)) out.push({ level: "block", key: "Exclusive", data: { a, b } });
  if (sectKey && sectKey !== "camarilla")
    for (const n of CAMARILLA_ONLY) if (names.includes(n)) out.push({ level: "warn", key: "CamarillaOnly", data: { name: n } });
  return out;
}
