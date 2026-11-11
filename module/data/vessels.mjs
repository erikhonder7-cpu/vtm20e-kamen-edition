// module/data/vessels.mjs
// Сосуды и вещества в их крови (V20_Основные_правила/05 «Пополнение запаса» — таблица сосудов; /04 «Болезни, яды, наркотики»).
//   · сосуд — сколько в нём пунктов крови; оборотень — 20, кровь концентрированная (за ход можно выпить больше 3);
//     птица (½) и крыса (¼) не дают и пункта — их в списке нет;
//   · вещество действует на вампира через выпитую кровь: эффект на листе со сроком по часам хроники (apps/timers.mjs),
//     поправки к пулам и сложностям — в окне броска сами (dice/dialog.mjs);
//   · болезнь крови: заметить — Интеллект + Медицина (сл. 7), не заметил — Выносливость (сл. 6), чтобы не стать
//     разносчиком; провал с единицами при проверке сосуда — разносчик без броска.

import { SYSTEM_ID } from "../config.mjs";
import { getClock } from "../apps/calendar.mjs";

export const VESSELS = [
  { key: "human", size: 10 },
  { key: "child", size: 5 },
  { key: "werewolf", size: 20, rich: true },
  { key: "bag", size: 1 },
  { key: "cow", size: 5, animal: true },
  { key: "dog", size: 2, animal: true },
  { key: "cat", size: 1, animal: true }
];
export const vesselOf = key => VESSELS.find(v => v.key === key) ?? VESSELS[0];

const MIN = 60000, HOUR = 3600000;
/**
 * Вещества (V20, гл. 4, таблица): doses — сколько доз можно отметить (алкоголь — по 100 г крепкого, галлюциногены
 * и яд — сила 1–3); ms — срок по Выносливости пьющего; mods — поправки к броску.
 */
export const SUBSTANCES = {
  alcohol:      { icon: "icons/svg/tankard.svg", doses: 5, ms: (st, d) => d * HOUR },           // −1 кубик в час
  stimulant:    { icon: "icons/svg/lightning.svg", ms: st => Math.max(1, 10 - st) * MIN },
  hallucinogen: { icon: "icons/svg/eye.svg", doses: 3, ms: st => Math.max(1, 8 - st) * MIN },
  opiate:       { icon: "icons/svg/sleep.svg", ms: st => Math.max(1, 10 - st) * MIN },
  marijuana:    { icon: "icons/svg/daze.svg", ms: () => 30 * MIN },
  poison:       { icon: "icons/svg/poison.svg", doses: 3, ms: () => null },                   // пока отравленная кровь не потрачена
  food:         { icon: "icons/svg/acid.svg", ms: () => 24 * HOUR }
};

/** Вещества в крови персонажа: [{ effect, key, dose, until }]. */
const substancesOf = actor => (actor?.effects ?? []).filter(e => !e.disabled && e.flags?.[SYSTEM_ID]?.substance)
  .map(e => ({ effect: e, key: e.flags[SYSTEM_ID].substance, dose: e.flags[SYSTEM_ID].dose ?? 1, until: e.flags[SYSTEM_ID].until ?? null }));

/**
 * Поправки веществ к броску: { dice: [{ label, value }], diff: [{ label, value }] }.
 * traits — пути черт пула, kind — вид проверки (frenzy — проверка ярости), now — часы хроники.
 */
export function substanceMods(actor, { traits = [], kind = "check", now = getClock() } = {}) {
  const out = { dice: [], diff: [] };
  const attrs = traits.filter(p => p?.startsWith("attributes.")).map(p => p.split(".")[1]);
  const ability = traits.some(p => p?.startsWith("abilities."));
  for (const s of substancesOf(actor)) {
    const label = s.effect.name;
    if (s.key === "alcohol" && attrs.some(k => k === "dexterity" || k === "intelligence")) {
      // −1 кубик за каждые 100 г, эффект слабеет на кубик в час
      const left = s.until ? Math.min(s.dose, Math.ceil(Math.max(0, s.until - now) / HOUR)) : s.dose;
      if (left > 0) out.dice.push({ label, value: -left });
    }
    else if (s.key === "hallucinogen") out.dice.push({ label, value: -s.dose });
    else if (s.key === "poison") out.dice.push({ label, value: -1 });
    else if (s.key === "opiate" && (attrs.includes("dexterity") || ability)) out.dice.push({ label, value: -2 });
    else if (s.key === "marijuana" && attrs.includes("perception")) out.dice.push({ label, value: -1 });
    if (kind === "frenzy" && s.key === "stimulant") out.diff.push({ label, value: 1 });
    if (kind === "frenzy" && s.key === "opiate") out.diff.push({ label, value: -1 });
  }
  return out;
}
