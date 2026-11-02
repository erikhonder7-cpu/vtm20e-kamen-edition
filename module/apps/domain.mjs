// module/apps/domain.mjs
// Домены (V20, факт «Домен»): актёр типа «domain» — территория хозяина (персонажа или котерии). Рейтинг домена работает
// как точки факта в охоте хозяина и участников его котерии (apps/night.mjs: вместе со Славой снижает сложность);
// угодья — сложность охоты по умолчанию; зона — место на карте города.

import { coteriesOf } from "./coterie.mjs";

/** Домены персонажа: свои и котерий, где он состоит. */
export function domainsOf(actor) {
  if (!actor) return [];
  const owners = new Set([actor.id, ...coteriesOf(actor).map(c => c.actorId).filter(Boolean)]);
  return game.actors.filter(a => a.type === "domain" && owners.has(a.system.owner));
}

/** Наибольший рейтинг домена персонажа (для охоты). */
export const domainRating = actor => Math.max(0, ...domainsOf(actor).map(d => d.system.rating ?? 0));

/** Хозяин домена: персонаж или котерия. */
export const domainOwner = d => d?.system?.owner ? game.actors.get(d.system.owner) ?? null : null;
