// module/apps/target-powers.mjs
// Силы против цели (V20, Дисциплины, уровни 1–5): сложность — черта отмеченной цели (T), итог — на цели.
//   · сложность: текущая Воля, Смекалка + Смелость, Человечность/Путь, Восприятие + Самоконтроль — по тексту силы;
//   · Доминирование: нельзя против вампира более низкого поколения (V20, гл. 4), нужен зрительный контакт;
//   · Внушение и Забвение: что даёт число успехов — строкой в чат (таблица из текста силы);
//   · Очарование, Страсть, Наваждение, Помрачение рассудка: эффект на цели со сроком по успехам
//     (гаснет по часам хроники — apps/timers.mjs; «1 ход» — до конца сцены);
//   · Устрашающий взор: −1 куб к пулам цели за успех до конца её следующего хода, 3+ — бежит.
//   · Глаза змеи: смертный замирает сразу; вампир и иной сверхъестественный — если змей пройдёт Волю (сл. 9);
//   · Касание скорпиона: яд — выбранная кровь (до Выносливости), сопротивление Выносливость + Стойкость (сл. 6),
//     оставшиеся успехи — срок; Выносливость цели снижается на число пунктов яда;
//   · Усмирение Зверя: продолжительный бросок до постоянной Воли цели; на Сородичей не действует;
//   · Отчуждение Зверя: успех — бешенство переходит на цель, неудача — вампир сам впадает в бешенство;
//   · Покрывало ночи: облако тьмы на сцене у вампира, 3 м в диаметре, каждый лишний успех — вдвое шире;
//   · Руки Бездны: щупальце за успех — статист со Силой = Затмение + Мощь, Ловкостью = Затмение + Стремительность,
//     Драка и прочность (Выносливость + Стойкость) — создателя (правило системы), 4 уровня здоровья — потом рассеивается;
//   · Исчезновение из виду: сложность — Смекалка + Шестое чувство наблюдателя; 4+ — Незримое присутствие, 1–3 — силуэт;
//   · Тайное собрание: действующее Сокрытие — на отмеченных спутников, по одному за точку Скрытности;
//   · Путь Крови (Тауматургия): Вкус крови — сведения о цели по успехам (только себе и рассказчику, правило системы);
//     Неистовство крови — цель тратит кровь за каждый успех, +1 к сложности сопротивления ярости за кровь;
//     Могущество крови — раз за ночь: поколение ниже на 1 на час, лишние успехи — часы или ступени;
//     Хищение крови — кровь от цели тауматургу. Котёл крови — data/combat-powers.mjs (урон и выкипание крови);
//   · Вселение: встречная — цель бросает текущую Волю (сл. 7), разница успехов снимает её Волю; на нуле — тело занято;
//   · Чтение ауры: сведения по успехам шёпотом (природа, бешенство, следы диаблери — правило системы);
//   · Психическая проекция: тело в оцепенении до конца сцены;
//   · Изменчивый облик: Привлекательность выше (сл. 9, +1 кровь за точку), провал — навсегда −1;
//   · Искусство тканей: Привлекательность цели ± за успех, Укрепление тела — +1 куб к поглощению за успех ценой Силы;
//   · Язык животных: сложность по виду зверя (6 хищники, 7 прочие звери и хищные птицы, 8 птицы и рептилии);
//   · Зов: звери из справочника приходят жетонами — доля услышавших по успехам;
//   · Поглощение духа: вампир в теле зверя, доступные Дисциплины — по успехам.
// Наложить эффект может владелец цели или рассказчик — кнопкой на карточке броска (как «принять урон»).

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { BLOOD_SELF } from "./bloodlines.mjs";
import { t, esc, TARGET_POWERS, sameActor, notice } from "./target-powers/core.mjs";
export { TARGET_POWERS, subsumeBlocks, supernatural, targetPowerOf, untilOf, tierText, done, notice, selfCheck, painless, ask, centered, pathFlag } from "./target-powers/core.mjs";
import { dismissArms } from "./target-powers/effects.mjs";
export { markedTarget, prepareTargetPower, rollTargetPower } from "./target-powers/roll.mjs";
export { applyTargetPower, applyFromCard } from "./target-powers/apply.mjs";
export { endSceneAbyss, possessAccess, riddleRoll } from "./target-powers/effects.mjs";
export { frenzyDiff, soakDice, dreadDice, mindDiff, endSceneMind } from "./target-powers/mods.mjs";

/** Подпись кнопки «наложить» на карточке (только у сил с эффектом на цели). */
export function targetPowerLabel(extra, ev) {
  const tp = extra?.targetPower && TARGET_POWERS[extra.targetPower.key];
  if (!tp || ev.outcome !== "success" || extra.targetPower.done || !(tp.timed || tp.dread || tp.kind) || [...BLOOD_SELF, "taste", "gather", "aura", "visage", "whisper", "info", "tiers", "counter", "chaos", "tele", "psycho", "illusion", "absorb", "humanitas", "pillar", "vitality", "caine", "flow", "sin"].includes(tp.kind)) return "";
  // Усмирение — только когда накоплены все успехи продолжительного броска
  if (tp.kind === "quell" && !((extra.extended?.prev ?? 0) + ev.successes >= (extra.extended?.need ?? Infinity))) return "";
  const lbl = { beast: "BeastApply", poison: "PoisonApply", shroud: "ShroudApply", arms: "ArmsApply", vanish: "VanishApply",
    rage: "RageApply", potency: "PotencyApply", theft: "TheftApply", possess: "PossessApply", project: "ProjectApply", awe: "AweApply", call: "CallApply",
    mesmerize: "MesApply", forget: "ForgApply", condition: "CondApply", voice: "VoiceApply",
    flesh: "FleshApply", bone: "BoneApply", dagon: "DagonApply", nightmare: "NightApply", ward: "WardApply", riddle: "RiddleApply", paradox: "ParadoxApply", anest: "AnestApply", void: "VoidApply", conflag: "ConflagApply", condemn: "CondemnApply", beckon: "BeckonApply", spiritbeast: "SpiritBeastApply", subsume: "SubsumeApply", self: "SelfApply", summon: "SummonApply", comrades: "ComradesApply", conjure: "ConjureApply" }[tp.kind] ?? "Apply";
  return t(lbl, { name: extra.targetPower.targetName, n: ev.successes });
}

/** Преклонение (Величие 5): кто нападает на вампира — сперва Смелость, сл. Обаяние + Запугивание вампира (макс. 10). false — атака отменена. */
export async function majestyCheck(attacker, foe) {
  if (!foe || attacker === foe || !foe.powerEffects?.some(e => e.power === "presence:5")) return true;
  if (attacker.effects.some(e => !e.disabled && sameActor(e.flags?.[SYSTEM_ID]?.majestyPassed, foe))) return true;
  const diff = Math.min(10, (foe.system.attributes.charisma?.total ?? 0) + (foe.system.abilities?.intimidation?.value ?? 0));
  const courage = attacker.system.virtues?.courage?.value;
  const pool = courage ?? attacker.system.willpower?.permanent ?? 1;
  const { rollPool } = await import("../dice/roll.mjs");
  const res = await rollPool({ actor: attacker, title: t("MajestyRoll", { name: foe.name }), pool, difficulty: Math.max(2, diff), kind: "check" });
  if ((res?.successes ?? 0) > 0) {
    if (attacker.isOwner) await attacker.createEmbeddedDocuments("ActiveEffect", [{ name: t("MajestyPassed", { name: foe.name }), img: Codex.disciplineIcon("presence"),
      flags: { [SYSTEM_ID]: { mind: "presence|majesty", majestyPassed: foe.uuid, mode: "scene" } } }]);
    notice(attacker, game.i18n.localize("VTM20.TP.MajestyTitle"), t("MajestyOk"));
    return true;
  }
  notice(attacker, game.i18n.localize("VTM20.TP.MajestyTitle"), t("MajestyFail", { name: foe.name }));
  return false;
}

let hooked = false;
/** Устрашающий взор гаснет в конце следующего хода цели (рассказчик). */
export function registerTargetPowers() {
  if (hooked) return;
  hooked = true;
  const ending = new Map();
  Hooks.on("preUpdateCombat", (combat, changes) => {
    if (!game.user.isGM || !combat.started || !("turn" in changes || "round" in changes)) return;
    ending.set(combat.id, combat.combatant?.actor ?? null);
  });
  Hooks.on("updateCombat", async combat => {
    if (!game.user.isGM) return;
    const actor = ending.get(combat.id);
    ending.delete(combat.id);
    if (!actor) return;
    const ids = actor.effects.filter(e => e.flags?.[SYSTEM_ID]?.dread).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    // Обезболивающее касание: ход прошёл — на один меньше
    for (const e of actor.effects.filter(e => e.flags?.[SYSTEM_ID]?.painless)) {
      const left = Number(e.flags[SYSTEM_ID].painless) - 1;
      if (left <= 0) await e.delete(); else await e.update({ name: t("PainName", { n: left }), [`flags.${SYSTEM_ID}.painless`]: left });
    }
    // Припадок, Отказ тела: уровень урона в конце каждого хода цели (броня не помогает)
    const { soakAndApply } = await import("../dice/roll.mjs");
    for (const e of actor.effects.filter(e => !e.disabled && e.flags?.[SYSTEM_ID]?.dot)) {
      const d = e.flags[SYSTEM_ID].dot;
      await soakAndApply(actor, 1, d.type, { soak: d.soak === true || (d.soak === "kindred" && actor.isVampire), armor: false });
    }
  });
  // Сердце тьмы: без сердца кол не парализует (V20, Серпентис 5)
  Hooks.on("preCreateActiveEffect", (effect, data, options, userId) => {
    const actor = effect.parent;
    if (actor?.documentName !== "Actor" || !actor.system?.fx?.heartless || !(effect.statuses ?? new Set()).has?.("r-staked")) return;
    if (userId === game.user.id) ui.notifications.info(t("HeartlessStake", { name: actor.name }));
    return false;
  });
  // Поглощение духа: вампир вышел (эффект снят) — зверь свободен
  Hooks.on("deleteActiveEffect", async effect => {
    const host = effect.flags?.[SYSTEM_ID]?.host;
    if (!host || !effect.flags[SYSTEM_ID].subsume || !game.users.activeGM?.isSelf) return;
    const animal = await foundry.utils.fromUuid(host);
    const ids = animal?.effects.filter(e => e.flags?.[SYSTEM_ID]?.subsumedBy).map(e => e.id) ?? [];
    if (ids.length) await animal.deleteEmbeddedDocuments("ActiveEffect", ids);
  });
  // Поглощение духа: зверь погиб с вампиром внутри — сознание возвращается в тело, вампир в торпоре (V20, Анимализм 4)
  Hooks.on("updateActor", async actor => {
    if (!game.users.activeGM?.isSelf || !actor.system.health?.incapacitated) return;
    const fx = actor.effects.find(e => e.flags?.[SYSTEM_ID]?.subsumedBy);
    if (!fx) return;
    const vamp = await foundry.utils.fromUuid(fx.flags[SYSTEM_ID].subsumedBy);
    await fx.delete();
    if (!vamp) return;
    const ids = vamp.effects.filter(e => e.flags?.[SYSTEM_ID]?.subsume).map(e => e.id);
    if (ids.length) await vamp.deleteEmbeddedDocuments("ActiveEffect", ids);
    if (!vamp.statuses?.has("r-torpor")) await vamp.toggleStatusEffect("r-torpor", { active: true });
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vamp }), content: `<div class="r-notice is-warn"><i class="fa-solid fa-skull"></i> ${esc(t("SubsumeDeath", { name: vamp.name, beast: actor.name }))}</div>` });
  });
  // Могущество крови кончилось: излишек крови сверх прежнего запаса выплёскивается (V20, Путь Крови 3)
  // Искусство костей, своя работа: эффект снят — его оружие уходит
  Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
    const actor = effect.parent;
    if (!effect.flags?.[SYSTEM_ID]?.boneWork || actor?.documentName !== "Actor" || userId !== game.user.id) return;
    const ids = actor.items.filter(i => i.getFlag(SYSTEM_ID, "boneWork") === effect.id).map(i => i.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
  });
  Hooks.on("deleteActiveEffect", async effect => {
    const actor = effect.parent;
    if (!effect.flags?.[SYSTEM_ID]?.genDrop || actor?.documentName !== "Actor" || !game.users.activeGM?.isSelf) return;
    const max = actor.system.blood?.max ?? 0, stored = actor._source.system?.blood?.value ?? 0;
    if (stored > max) await actor.update({ "system.blood.value": max });
  });
  // Руки Бездны: у щупальца 4 уровня здоровья — после четвёртого оно рассеивается (рассказчик)
  Hooks.on("updateActor", async actor => {
    if (!game.users.activeGM?.isSelf || !actor.getFlag(SYSTEM_ID, "abyssArm") || (actor.system.health?.damage ?? 0) < 4) return;
    await ChatMessage.create({ content: `<div class="r-notice"><i class="fa-solid fa-wind"></i> ${esc(t("ArmGone", { name: actor.name }))}</div>` });
    await dismissArms([game.actors.get(actor.id) ?? actor]);
  });
}
