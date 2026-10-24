// module/dice/virtue-checks.mjs
// Проверки ярости и Ротшрека (02, 05): один запуск для листа и для подсказок в чате по событиям —
// огонь и солнце (Ротшрек), голод, когда кровь опускается ниже 5 (ярость). Проваленная проверка ставит
// состояние на токен сама (rollPool), здесь — только предложить бросок тому, кто управляет персонажем.

import { VTM20, SYSTEM_ID } from "../config.mjs";
import { RollDialog } from "./dialog.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

/** Ниже этого запаса крови вампир голоден (V20, 05). */
export const HUNGER_BELOW = 5;

/** Окно проверки ярости (Самоконтроль) или Ротшрека (Мужество). difficulty — сложность по событию, без поправок клана. */
export function rollVirtueCheck(actor, kind, { difficulty = 6 } = {}) {
  if (kind === "frenzy") {
    // Бруха: +2 к сложности, воля не помогает предотвратить (02); гули — −3
    const brujah = actor.system.clan === "brujah" || actor.system.clan === "bruhaAntitribu";
    return RollDialog.prompt(actor, {
      title: t("Roll.frenzy.title"), trait1: "virtues.selfControl", reflexive: true, kind: "frenzy",
      extra: { atavism: VTM20.atavismClans.includes(actor.system.clan) },
      difficulty: Math.max(2, difficulty + (brujah ? 2 : 0) - (actor.type === "ghoul" ? 3 : 0)), noWillpower: brujah, lockTraits: true
    });
  }
  return RollDialog.prompt(actor, { title: t("Roll.rotschreck.title"), trait1: "virtues.courage", reflexive: true, kind: "rotschreck", difficulty, lockTraits: true });
}

/** Карточка в чате: «стоит проверить ярость/Ротшрек» с кнопкой броска. Только вампирам, не в торпоре и не уже в этом состоянии. */
export function suggestCheck(actor, kind, { reason, difficulty = 6 }) {
  if (!actor?.isVampire || actor.statuses?.has(`r-${kind}`) || actor.statuses?.has("r-torpor")) return null;
  const icon = kind === "frenzy" ? "fa-face-angry" : "fa-fire";
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id),
    content: `<div class="r-notice r-check-prompt is-${kind}"><i class="fa-solid ${icon}"></i>
      <span>${t(`CheckPrompt.${kind}`, { name: foundry.utils.escapeHTML(actor.name), reason, n: difficulty })}</span>
      <div class="r-card-buttons"><button type="button" data-r-action="virtueCheck"><i class="fa-solid fa-dice-d10"></i> ${t("CheckPrompt.Roll")}</button></div></div>`,
    flags: { [SYSTEM_ID]: { checkPrompt: { kind, difficulty, actorUuid: actor.uuid } } }
  });
}

/** Кнопка карточки-подсказки. */
export async function rollFromPrompt(message) {
  const p = message.getFlag(SYSTEM_ID, "checkPrompt");
  const actor = p && await foundry.utils.fromUuid(p.actorUuid);
  if (!actor?.isOwner) return ui.notifications.warn(t("CheckPrompt.NotOwner"));
  return rollVirtueCheck(actor, p.kind, { difficulty: p.difficulty });
}
