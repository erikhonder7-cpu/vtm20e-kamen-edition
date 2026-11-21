// module/data/magick-merits.mjs
// Черты мага, которые меняют сложность чародейства (M20, гл. 6 «Достоинства и недостатки»; тексты — data/mage.json):
// в окне чародейства (apps/mage.mjs castEffect) — строкой «Черты» рядом с быстрыми поправками; в группе отмечается один вариант,
// сумма идёт в общий счёт поправок (вместе — от −3 до +3).
//   · Цикличная магия — пик цикла −3, рядом с пиком −2 (два часа), затем −1 (ещё два); минимум +3, +2, +1;
//   · Метка порчи — злая магия −2, добрая +2;
//   · Нефилим / Лахам — эффекты Разума и Духа в Высшей Умбре −1.

export const MAGICK_MERITS = {
  "Цикличная магия": { group: "cycle", opts: [["peak", -3], ["peakNear", -2], ["peakFar", -1], ["low", 3], ["lowNear", 2], ["lowFar", 1]] },
  "Метка порчи": { group: "taint", opts: [["evil", -2], ["good", 2]] },
  "Нефилим / Лахам": { group: "neph", opts: [["umbra", -1]] }
};

/** Черты мага для окна чародейства: [{ name, group, opts: [{ key, n, label }] }]. */
export function magickMeritsOf(actor) {
  const have = new Set(actor?.items?.filter(i => i.type === "merit" || i.type === "flaw").map(i => i.name) ?? []);
  return Object.entries(MAGICK_MERITS).filter(([name]) => have.has(name)).map(([name, m]) => ({
    name, group: m.group,
    opts: m.opts.map(([key, n]) => ({ key: `${m.group}:${key}`, n, label: game.i18n.localize(`VTM20.Mage.MM.${m.group}.${key}`) }))
  }));
}
