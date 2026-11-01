// module/dice/virtue-checks.mjs
// Проверки ярости и Ротшрека (02, 05): один запуск для листа и для подсказок в чате по событиям —
// огонь и солнце (Ротшрек), голод, когда кровь опускается ниже 5 (ярость). Проваленная проверка ставит
// состояние на токен сама (rollPool), здесь — только предложить бросок тому, кто управляет персонажем.

import { VTM20, SYSTEM_ID } from "../config.mjs";
import { RollDialog } from "./dialog.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

/** Ниже этого запаса крови вампир голоден (V20, 05). */
export const HUNGER_BELOW = 5;

/** Поводы к Безумию гулей и дампиров (Accursed Heirs, гл. 1; по образцу Ghouls: Fatal Addiction): ключ → сложность. */
export const GHOUL_PROVOCATIONS = [
  ["insult", 3], ["intoxication", 3], ["arousal", 3, "rapture"], ["beaten", 4], ["lovedOne", 4],
  ["privateHumiliation", 4], ["intimacy", 4, "rapture"], ["publicHumiliation", 5], ["lethal", 5], ["rejection", 6]
];

/** Выбор повода перед проверкой гуля или дампира; null — отмена, 0 — «иное» (прежнее правило). */
async function pickProvocation(kind) {
  const list = GHOUL_PROVOCATIONS.filter(p => kind !== "rapture" || p[2] === "rapture");
  const buttons = list.map(([k, d], i) => ({ action: k, label: `${t(`Provocation.${k}`)} — ${d}`, default: i === 0 }));
  if (kind === "frenzy") buttons.push({ action: "other", label: t("Provocation.other") });
  const v = await foundry.applications.api.DialogV2.wait({
    window: { title: t(kind === "rapture" ? "Roll.rapture.title" : "Roll.frenzy.title") }, classes: ["vtm20", "r-dialog", "r-provocation"],
    position: { width: 460 }, content: `<p>${t("Provocation.Hint")}</p>`, buttons
  }).catch(() => null);
  if (!v) return null;
  return v === "other" ? 0 : list.find(p => p[0] === v)?.[1] ?? 0;
}

/** Окно проверки ярости (Самоконтроль) или Ротшрека (Мужество). difficulty — сложность по событию, без поправок клана. */
export async function rollVirtueCheck(actor, kind, { difficulty = 6, fromPrompt = false } = {}) {
  // гуль и дампир: сложность — по поводу из таблицы (без поправки «−3» — таблица уже для гулей)
  let table = 0;
  if (actor.type === "ghoul" && (kind === "frenzy" || kind === "rapture") && !fromPrompt) {
    table = await pickProvocation(kind);
    if (table === null) return null;
  }
  // Дампир (Accursed Heirs, гл. 1, «Жажда крови»): против Безумия — не больше кубиков Самоконтроля, чем крови в запасе
  const bloodlust = () => {
    if (!actor.isDhampir) return {};
    const sc = actor.traitValue?.("virtues.selfControl") ?? 0, blood = actor.system.blood?.value ?? 0;
    return blood < sc ? { bonus: blood - sc, diffNote: `<i class="fa-solid fa-droplet"></i> ${t("Roll.Bloodlust", { n: blood })}` } : {};
  };
  if (kind === "frenzy") {
    // Бруха: +2 к сложности, воля не помогает предотвратить (02); гули — −3
    const brujah = actor.system.clan === "brujah" || actor.system.clan === "bruhaAntitribu";
    return RollDialog.prompt(actor, {
      title: t("Roll.frenzy.title"), trait1: "virtues.selfControl", reflexive: true, kind: "frenzy",
      extra: { atavism: VTM20.atavismClans.includes(actor.system.clan) },
      difficulty: table ? table : Math.max(2, difficulty + (brujah ? 2 : 0) - (actor.type === "ghoul" ? 3 : 0)), noWillpower: brujah, lockTraits: true,
      ...bloodlust()
    });
  }
  // Безумие страсти (Accursed Heirs, гл. 1): у гулей и дампиров желание сильнее рассудка. Сильное возбуждение — сл. 3,
  // интимная близость — 4 (таблица поводов к Безумию гулей и дампиров)
  if (kind === "rapture") return RollDialog.prompt(actor, {
    title: t("Roll.rapture.title"), trait1: "virtues.selfControl", reflexive: true, kind: "rapture", lockTraits: true,
    difficulty: table || (difficulty === 6 ? 3 : difficulty), ...bloodlust(),
    diffNote: [bloodlust().diffNote, `<i class="fa-solid fa-heart-pulse"></i> ${t("Roll.rapture.note")}`].filter(Boolean).join("<br>")
  });
  if (kind === "degeneration") return RollDialog.prompt(actor, { title: t("Roll.degeneration.title"), trait1: "virtues.conscience", reflexive: true, kind: "degeneration", difficulty, noWillpower: true, lockTraits: true });
  return RollDialog.prompt(actor, { title: t("Roll.rotschreck.title"), trait1: "virtues.courage", reflexive: true, kind: "rotschreck", difficulty, lockTraits: true });
}

/** Карточка в чате: «стоит проверить ярость/Ротшрек» с кнопкой броска. Только вампирам, не в торпоре и не уже в этом состоянии. */
export function suggestCheck(actor, kind, { reason, difficulty = 6 }) {
  if (!actor?.isVampire || actor.statuses?.has(`r-${kind}`) || actor.statuses?.has("r-torpor")) return null;
  const icon = { frenzy: "fa-face-angry", rotschreck: "fa-fire", degeneration: "fa-scale-unbalanced" }[kind];
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
  return rollVirtueCheck(actor, p.kind, { difficulty: p.difficulty, fromPrompt: true });
}
