// module/apps/target-powers/mods.mjs
// Силы по цели — поправки, которые действующие эффекты дают чужим броскам: бешенство, поглощение, страх, разум; конец сцены.

import { SYSTEM_ID } from "../../config.mjs";
import { t, centered } from "./core.mjs";

/** Сложность сопротивления ярости от Неистовства крови — для проверки бешенства. */
export function frenzyDiff(actor, kind) {
  // Алые узоры (Огам 2): легче устоять перед Ротшреком — флаг rotDiff
  if (kind === "rotschreck") return [...(actor?.effects ?? [])].filter(e => !e.disabled && e.flags?.[SYSTEM_ID]?.rotDiff)
    .map(e => ({ label: e.name, value: Number(e.flags[SYSTEM_ID].rotDiff) }));
  if (kind !== "frenzy") return [];
  const out = [...(actor?.effects ?? [])].filter(e => !e.disabled && e.flags?.[SYSTEM_ID]?.frenzyDiff)
    .map(e => ({ label: e.name, value: Number(e.flags[SYSTEM_ID].frenzyDiff) }));
  // Сердце тьмы (Серпентис 5): без сердца — −2 к сложности сопротивления ярости
  if (actor?.system?.fx?.heartless) out.push({ label: t("Heartless"), value: -2 });
  return out;
}

/** Укрепление тела (Искусство тканей): кубы к поглощению — для documents/actor.mjs. */
export function soakDice(actor) {
  return [...(actor?.effects ?? [])].reduce((s, e) => s + (!e.disabled && Number(e.flags?.[SYSTEM_ID]?.soakDice) || 0), 0);
}

/** Штраф к пулам от Устрашающего взора и проклятий путей (diceAll) — для окон бросков. Сосредоточение отменяет. */
export function dreadDice(actor, { social = false, physical = false } = {}) {
  // Кровное единство (Сангвинус 5): +1 куб к физическим броскам за каждого участника сверх первого
  const bonus = physical ? [...(actor?.effects ?? [])].filter(e => !e.disabled && e.flags?.[SYSTEM_ID]?.dicePhys)
    .map(e => ({ label: e.name, value: Number(e.flags[SYSTEM_ID].dicePhys) })) : [];
  if (centered(actor)) return bonus;
  const out = [...bonus];
  for (const e of actor?.effects ?? []) {
    const f = !e.disabled && e.flags?.[SYSTEM_ID];
    if (!f) continue;
    if (f.dread) out.push({ label: e.name, value: -Number(f.dread) });
    if (f.diceAll) out.push({ label: e.name, value: Number(f.diceAll) });
    if (social && f.diceSocial) out.push({ label: e.name, value: Number(f.diceSocial) });
  }
  return out;
}

/** Сложность от эффектов путей: к физическим, ко всем, к социальным, к Ловкости. */
export function mindDiff(actor, { physical = false, social = false, dex = false, traits = [] } = {}) {
  const out = [];
  for (const e of actor?.effects ?? []) {
    const f = !e.disabled && e.flags?.[SYSTEM_ID];
    if (!f) continue;
    // diffTraits: [["abilities.subterfuge", 3]] — к броскам с этой чертой (Проклятие Демониона); списком — ключи с точкой флаги разворачивают
    const byTrait = (Array.isArray(f.diffTraits) ? f.diffTraits : []).reduce((s, [k, n]) => s + (traits.includes(k) ? Number(n) || 0 : 0), 0);
    const v = byTrait + Number(f.diffAll || 0) + (physical ? Number(f.diffPhys || 0) : 0) + (social ? Number(f.diffSocial || 0) : 0) + (dex ? Number(f.diffDex || 0) : 0);
    if (v) out.push({ label: e.name, value: v });
  }
  return out;
}

/** Снять с цели эффекты «до конца сцены» (Конец сцены). */
export async function endSceneMind(actor) {
  // Простое воплощение без Постоянства исчезает с концом сцены
  const conj = actor.items.filter(i => i.getFlag(SYSTEM_ID, "conjured") === "scene").map(i => i.id);
  if (conj.length) await actor.deleteEmbeddedDocuments("Item", conj);
  // «manual» (Усмирение, яд навсегда) снимаются вручную
  const ids = actor.effects.filter(e => e.flags?.[SYSTEM_ID]?.mind && e.flags[SYSTEM_ID].mode === "scene").map(e => e.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}
