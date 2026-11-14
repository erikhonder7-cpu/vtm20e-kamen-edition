// module/data/talisman.mjs
// Талисман тауматурга в бросках («Зачарование талисмана», V20, ур. 5; apps/thaum-workshop.mjs).
// Свой талисман в руке создателя: +2 куба к основному пути Тауматургии, +1 к ритуалам, +1 к атаке, если это оружие.
// Магия против того, кто держит свой талисман, — +1 к сложности; кто держит чужой талисман — +3 куба к магии против создателя.
// «В руке» — галочка system.thaum.held (лист, вкладка «Снаряжение»).

const isTalisman = i => i.system?.thaum?.kind === "talisman";

/** Свой талисман в руке персонажа (или null). */
export function heldTalisman(actor) {
  return actor?.items?.find(i => isTalisman(i) && i.system.thaum.held && i.system.thaum.makerId === actor.id) ?? null;
}

/** Свой талисман персонажа, где бы он ни был (один на тауматурга). */
export function ownTalisman(actor) {
  return actor?.items?.find(i => isTalisman(i) && i.system.thaum.makerId === actor.id) ?? null;
}

/** Основной путь Тауматургии персонажа: путь пометки «основной» (documents/item.mjs). */
function isPrimaryPath(actor, path) {
  if (!path) return false;
  const p = actor.items.find(i => i.type === "thaumPath" && i.system.discipline === "thaumaturgy" && i.system.primary);
  const a = p?.name.trim().toLowerCase(), b = String(path).trim().toLowerCase();
  return !!a && (a === b || a.includes(b) || b.includes(a));
}

/**
 * Кубы и сложность от талисманов к магическому броску.
 * magic — extra.magic окна броска ({ disc, path, ritual }); target — актёр единственной выбранной цели.
 */
export function talismanMods(actor, magic, target = null) {
  const dice = [], diff = [];
  if (!magic || !actor) return { dice, diff };
  const own = heldTalisman(actor);
  if (own && magic.disc === "thaumaturgy") {
    if (magic.ritual) dice.push({ label: own.name, value: 1 });
    else if (isPrimaryPath(actor, magic.path)) dice.push({ label: own.name, value: 2 });
  }
  if (target && target !== actor) {
    const theirs = heldTalisman(target);
    if (theirs) diff.push({ label: theirs.name, value: 1 });
    const stolen = actor.items.find(i => isTalisman(i) && i.system.thaum.held && i.system.thaum.makerId === target.id);
    if (stolen) dice.push({ label: stolen.name, value: 3 });
  }
  return { dice, diff };
}

/** +1 куб к атаке, если оружие — свой талисман в руке. */
export function talismanAttack(actor, weaponId) {
  const i = heldTalisman(actor);
  return i && i.type === "weapon" && i.id === weaponId ? 1 : 0;
}
