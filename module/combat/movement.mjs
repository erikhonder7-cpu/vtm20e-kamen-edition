// module/combat/movement.mjs
// Передвижение за ход (V20, гл. 6 «Перемещение»): шаг — 7 м, трусца — 12 + Ловкость, бег — 20 + 3 × Ловкость.
// Раны (таблица здоровья): «Ранен» — бег вдвое медленнее; «Тяжело ранен» — только шагом; «Изувечен» — 3 м; «Искалечен» — 1 м
// ползком; «Без сознания» и торпор, кол, Слияние с землёй — не двигается. Облик волка и Модифицированный облик — бег вдвое
// (data/effects.mjs → runMultiplier); полёт (Облик летучей мыши) — км/ч в метры за ход (ход ≈ 3 с).

import { SYSTEM_ID } from "../config.mjs";

/** { walk, jog, run, fly, limit } в метрах за ход; null — так двигаться нельзя. limit — ключ причины ограничения. */
export function movement(actor) {
  const s = actor?.system;
  if (!s?.attributes?.dexterity) return null;
  const dex = s.attributes.dexterity.total ?? s.attributes.dexterity.value ?? 0;
  const fx = s.fx ?? {}, st = actor.statuses ?? new Set();
  const out = { walk: 7, jog: 12 + dex, run: 20 + 3 * dex, fly: null, limit: "" };
  if ((fx.runMultiplier ?? 1) > 1) { out.jog *= fx.runMultiplier; out.run *= fx.runMultiplier; }
  if (fx.flightKmh) out.fly = Math.round(fx.flightKmh * 1000 / 3600 * 3);
  if (fx.moveEqualRun) out.walk = out.jog = out.run;
  const stop = st.has("r-torpor") || st.has("r-staked") || fx.earthMeld || s.health?.incapacitated;
  if (stop) return { walk: 0, jog: null, run: null, fly: null, limit: "stop" };
  switch (s.health?.status) {
    case "injured": out.run = Math.floor(out.run / 2); out.limit = "injured"; break;
    case "wounded": out.jog = out.run = null; out.limit = "wounded"; break;
    case "mauled": Object.assign(out, { walk: 3, jog: null, run: null, limit: "mauled" }); break;
    case "crippled": Object.assign(out, { walk: 1, jog: null, run: null, fly: null, limit: "crippled" }); break;
  }
  return out;
}

/** «Тяжело ранен» и тяжелее (V20, таблица здоровья): двигался и атакует в тот же ход — ещё −1 куб. */
export const moveHurts = actor => ["wounded", "mauled", "crippled"].includes(actor?.system?.health?.status);

const turnKey = () => { const c = game.combat; return c?.started ? `${c.id}:${c.round}` : null; };

/** Сдвигался ли жетон персонажа в текущем ходу боя (флаг movedTurn — ключ боя и раунда). */
export function movedThisTurn(actor) {
  const k = turnKey();
  return !!k && actor?.getFlag?.(SYSTEM_ID, "movedTurn") === k;
}

/** Запомнить движение бойца в этом ходу: жетон из текущего боя сдвинулся — флаг на персонаже (пишет тот, кто двигал). */
export function registerMoveTracking() {
  Hooks.on("updateToken", (doc, changes, _opts, userId) => {
    if (userId !== game.user.id || !("x" in changes || "y" in changes)) return;
    const k = turnKey(), a = doc.actor;
    if (!k || !a?.isOwner || a.getFlag(SYSTEM_ID, "movedTurn") === k) return;
    if (!game.combat.combatants.some(c => c.tokenId === doc.id)) return;
    a.setFlag(SYSTEM_ID, "movedTurn", k);
  });
}
