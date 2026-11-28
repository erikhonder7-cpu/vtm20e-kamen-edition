// module/data/martial.mjs
// «Воинская выучка» (V20 Dark Ages: Tome of Secrets, гл. 3 «Рыцарские ордена», с. 84–86): четыре Факта — Драка, Фехтование,
// Верховая езда, Стрельба из лука; каждая точка — один особый приём этой Способности, точек Факта не больше точек Способности.
// Приёмы атаки встают в окно атаки рядом с обычными манёврами (combat/combat.mjs, выбор «k:<ключ>»), защитные и постоянные —
// подсказкой. Какие приёмы выучены, хранит флаг персонажа martial (список ключей); выбирают их в окне apps/martial.mjs.
//
// use: "brawl" — безоружный удар Силой; "weapon" — экипированным оружием ближнего боя (урон оружия, если не задан свой dmg);
// "ride" — верхом; "weaponOrBrawl" — оружием, а без него — Дракой. dmg — прибавка к Силе (null — урона нет), diff — к сложности.
// Морд-хау бьёт крестовиной — урон ушибами (правило системы: книга вида урона не называет).

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "./codex.mjs";

/** Факты «Воинской выучки» по Способности: английское имя (data/backgrounds.json → en). */
export const MARTIAL_BG = { brawl: "Martial Training: Brawl", melee: "Martial Training: Melee", ride: "Martial Training: Ride", archery: "Martial Training: Archery" };
export const MARTIAL_ABILITIES = ["brawl", "melee", "ride", "archery"];

export const MARTIAL = [
  { key: "armoredBrawling", ability: "brawl", kind: "passive", icon: "fa-shield-halved" },
  { key: "hammerfist", ability: "brawl", kind: "attack", use: "brawl", attr: "strength", diff: 1, dmg: 0, type: "bashing", icon: "fa-hand-fist" },
  { key: "kickCatch", ability: "brawl", kind: "defense", icon: "fa-shoe-prints" },
  { key: "ligadura", ability: "brawl", kind: "attack", use: "brawl", attr: "strength", diff: 1, dmg: 3, type: "bashing", icon: "fa-hand-back-fist" },
  { key: "tieStrike", ability: "brawl", kind: "attack", use: "brawl", attr: "strength", diff: 1, dmg: 0, type: "bashing", icon: "fa-people-pulling" },
  { key: "foolsGuard", ability: "melee", kind: "defense", icon: "fa-shield" },
  { key: "halfSword", ability: "melee", kind: "attack", use: "weapon", attr: "dexterity", diff: 0, icon: "fa-khanda" },
  { key: "mordhau", ability: "melee", kind: "attack", use: "weapon", attr: "dexterity", diff: 1, dmg: 1, type: "bashing", icon: "fa-hammer" },
  { key: "shieldTrap", ability: "melee", kind: "defense", icon: "fa-shield-heart" },
  { key: "wrapping", ability: "melee", kind: "attack", use: "weapon", attr: "dexterity", diff: 2, icon: "fa-arrows-spin" },
  { key: "lanceCharge", ability: "ride", kind: "attack", use: "ride", attr: "dexterity", diff: 1, dmg: 4, type: "lethal", icon: "fa-horse" },
  { key: "mountedGrappling", ability: "ride", kind: "passive", min: 3, icon: "fa-horse-head" },
  { key: "rossfechten", ability: "ride", kind: "passive", min: 2, icon: "fa-chess-knight" },
  { key: "sideSlam", ability: "ride", kind: "attack", use: "ride", attr: "dexterity", diff: 0, dmg: null, icon: "fa-horse" },
  { key: "unhorse", ability: "ride", kind: "attack", use: "weaponOrBrawl", attr: "strength", diff: 2, icon: "fa-person-falling" }
];
export const martialDef = key => MARTIAL.find(m => m.key === key) ?? null;

/** Точки Факта «Воинская выучка» по Способности (по английскому имени или по названию записи справочника). */
export function martialDots(actor, ability) {
  const en = MARTIAL_BG[ability], ru = (Codex.backgrounds ?? []).find(b => b.en === en)?.name;
  return actor.items.filter(i => i.type === "background" && (i.system?.source === en || (ru && i.name === ru)))
    .reduce((n, i) => Math.max(n, Number(i.system.value) || 0), 0);
}

/** Выученные приёмы: из флага, только те, на которые хватает точек Факта (лишние — с конца списка не считаются). */
export function martialKnown(actor) {
  const picked = actor.getFlag(SYSTEM_ID, "martial") ?? [];
  const left = Object.fromEntries(MARTIAL_ABILITIES.map(k => [k, martialDots(actor, k)]));
  return picked.map(martialDef).filter(m => m && left[m.ability]-- > 0);
}
