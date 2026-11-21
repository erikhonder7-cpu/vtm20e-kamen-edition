// module/apps/bogatyr.mjs
// Хоумрул «Богатыри» (data/bogatyr.mjs): настройка мира, Плащ Старейшего (эффект на ночь — солнце загоняет симбионта
// обратно), регенерация взрослого Богатыря — 1 уровень за ход (и губительного): в бою сама в начале его хода (пишет
// активный рассказчик), вне боя — кнопкой на листе.

import { SYSTEM_ID } from "../config.mjs";
import { BOGATYR_MANTLE, isBogatyr, isMatureBogatyr } from "../data/bogatyr.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Bogatyr.${k}`, d) : game.i18n.localize(`VTM20.Bogatyr.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
const notice = (actor, icon, html) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-vampire"><i class="fa-solid ${icon}"></i> ${html}</div>` });

export function registerBogatyr() {
  game.settings.register(SYSTEM_ID, "bogatyri", {
    name: "VTM20.Settings.Bogatyri.Name", hint: "VTM20.Settings.Bogatyri.Hint",
    scope: "world", config: true, type: Boolean, default: false, requiresReload: true
  });
  // выключен — его записи в компендиях спрятаны (apps/homerules.mjs)
  // регенерация в бою: в начале хода взрослого Богатыря — 1 уровень (сначала самый тяжёлый)
  Hooks.on("updateCombat", (combat, diff) => {
    if (!game.users.activeGM?.isSelf || !combat.started || !("turn" in diff || "round" in diff)) return;
    const actor = combat.combatant?.actor;
    if (isMatureBogatyr(actor) && actor.system.health.damage > 0) regenerate(actor, { quiet: false });
  });
}

/** Регенерация: 1 уровень урона — сначала губительный, затем летальный, затем ударный. */
export async function regenerate(actor, { quiet = false } = {}) {
  if (!isBogatyr(actor)) return null;
  if (!isMatureBogatyr(actor)) return ui.notifications.warn(t("LarvalNoRegen"));
  const h = actor.system.health, type = h.aggravated > 0 ? "aggravated" : h.lethal > 0 ? "lethal" : h.bashing > 0 ? "bashing" : null;
  if (!type) { if (!quiet) ui.notifications.info(t("NoDamage")); return null; }
  await actor.healDamage(type, 1);
  await notice(actor, "fa-heart-pulse", esc(t("Regen", { name: actor.name, type: game.i18n.localize(`VTM20.DamageOne.${type}`) })));
  return type;
}

/** Плащ Старейшего: включить (только ночью — подтверждает рассказчик) или снять. */
export async function toggleMantle(actor) {
  if (!isBogatyr(actor)) return null;
  const on = actor.powerEffects.find(x => x.power === BOGATYR_MANTLE);
  if (on) return actor.endPower(on.effect);
  if (!isMatureBogatyr(actor)) return ui.notifications.warn(t("LarvalNoMantle"));
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{ name: t("Mantle"), img: "icons/svg/skull.svg",
    description: `<p>${esc(t("MantleDesc"))}</p>`, flags: { [SYSTEM_ID]: { power: BOGATYR_MANTLE, mode: "night", ready: true,
      ...(await untilDawn()) } } }]);
  await actor.createPowerWeapons(effect);
  await notice(actor, "fa-skull", esc(t("MantleOn", { name: actor.name })));
  return effect;
}

/** Срок «до рассвета» по часам хроники (apps/timers.mjs). */
async function untilDawn() {
  const { untilFor } = await import("./timers.mjs"), { getClock } = await import("./calendar.mjs");
  const now = getClock(), until = untilFor("night", { now });
  return until ? { start: now, until } : {};
}
