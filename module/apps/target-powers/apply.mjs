// module/apps/target-powers/apply.mjs
// Силы по цели — применение исхода к цели: эффекты по виду силы, сроки, кнопка «применить» на карточке.

import { SYSTEM_ID } from "../../config.mjs";
import { Codex } from "../../data/codex.mjs";
import { bloodApply, BLOOD_APPLY } from "../bloodlines.mjs";
import { clockApi, t, esc, TARGET_POWERS, supernatural, untilOf, done, notice } from "./core.mjs";
import { applyPath, conjure, summonPathCreature, beckon, placeShroud, summonArms } from "./effects.mjs";
import { APPLY } from "./apply-kinds.mjs";

/** Кнопка на карточке: эффект силы на цели (владелец цели или рассказчик). */
export async function applyTargetPower(message, state, ev) {
  const x = state.extra?.targetPower, tp = x && TARGET_POWERS[x.key];
  if (!tp || x.done) return;
  const target = await foundry.utils.fromUuid(x.target);
  if (!target) return ui.notifications.warn(t("Gone"));
  if (tp.kind === "summon") {
    if (!game.user.isGM) return ui.notifications.warn(t("GMOnly"));
    await done(message, state, x);
    return summonPathCreature(target, tp.summon, ev.successes);
  }
  if (["shroud", "arms", "beckon"].includes(tp.kind) && tp.kind === "beckon") {
    if (!game.user.isGM) return ui.notifications.warn(t("GMOnly"));
    return beckon(message, state, x, target, ev.successes);
  }
  if (["shroud", "arms"].includes(tp.kind)) {
    if (!game.user.isGM) return ui.notifications.warn(t("GMOnly"));
    await done(message, state, x);
    return tp.kind === "shroud" ? placeShroud(target, ev.successes) : summonArms(target, ev.successes);
  }
  if (!target.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: target.name }));
  const api = await clockApi(), n = ev.successes, now = api.getClock();
  const [disc] = x.key.split("|");
  const flags = { mind: x.key, by: state.actorUuid ?? "", start: now };
  let name = `${x.powerName} · ${x.actorName}`, desc = "";
  if (BLOOD_APPLY.has(tp.kind)) return bloodApply({ message, state, x, tp, target, n, flags, now, api });
  const handler = APPLY[tp.kind];
  if (handler) return handler({ message, state, x, tp, target, api, n, now, disc, flags });   // apply-kinds.mjs: вид силы → своя функция
  if (tp.kind === "conjure") return conjure(message, state, x, tp, target);
  if (["cond", "self", "dehydrate", "dust", "comrades"].includes(tp.kind)) return applyPath(message, state, x, tp, target, n, flags, api);
  if (tp.kind === "poison") {
    // Касание скорпиона: сопротивление Выносливость + Стойкость (сл. 6), каждый успех снимает успех ассамита
    const { rollPool } = await import("../../dice/roll.mjs");
    const pool = (target.system.attributes?.stamina?.total ?? 0) + (target.discipline?.("fortitude") ?? 0);
    const res = pool > 0 ? await rollPool({ actor: target, title: t("PoisonResist"), pool, difficulty: 6, kind: "check", noBotch: true }) : { successes: 0 };
    const left = n - (res?.successes ?? 0);
    await done(message, state, x);
    if (left <= 0) return notice(target, x.powerName, t("PoisonResisted"));
    const code = tp.timed[Math.min(left, tp.timed.length) - 1];
    const until = untilOf(code, now, api);
    Object.assign(flags, { attrMod: { stamina: -(x.poison ?? 1) }, mode: code === "forever" ? "manual" : until ? "timed" : "scene", ...(until ? { until } : {}) });
    name = t("PoisonName", { n: x.poison ?? 1 });
    desc = t("PoisonDesc", { n: x.poison ?? 1, dur: t(`Dur.${code}`) });
  } else if (tp.kind === "eyes") {
    Object.assign(flags, { mode: "scene" });
    name = t("EyesName", { name: x.actorName });
    desc = t(supernatural(target) ? "EyesSuper" : "EyesMortal");
  } else if (tp.kind === "quell") {
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    Object.assign(flags, { mode: "manual" });
    name = t("QuellName", { name: x.actorName });
    desc = t("QuellDesc", { n: self?.system.willpower?.permanent ?? "?" });
  } else if (tp.kind === "ward") {
    // Печать фей: −2 куба к проверкам Интеллекта, срок по успехам
    const code = tp.timed[Math.min(n, tp.timed.length) - 1];
    const until = untilOf(code, now, api);
    Object.assign(flags, { attrMod: { intelligence: -2 }, mode: until ? "timed" : "scene", ...(until ? { until } : {}) });
    name = t("WardName", { name: x.actorName });
    desc = t("WardDesc", { dur: t(`Dur.${code}`) });
  } else if (tp.dread) {
    // −1 куб за успех на следующий ход цели; 3+ — бежит в ужасе (V20, Величие 2)
    Object.assign(flags, { dread: n, mode: "scene" });
    name = t("DreadName", { n });
    desc = t(n >= 3 ? "DreadFlee" : "DreadDice", { n });
  } else {
    const code = tp.timed[Math.min(n, tp.timed.length) - 1];
    const until = untilOf(code, now, api);
    Object.assign(flags, { mode: until ? "timed" : "scene", ...(until ? { until } : {}) });
    desc = t(`Dur.${code}`);
  }
  await target.createEmbeddedDocuments("ActiveEffect", [{ name, img: Codex.disciplineIcon(disc), description: `<p>${esc(desc)}</p>`,
    ...(tp.kind === "eyes" ? { statuses: ["r-held"] } : {}), flags: { [SYSTEM_ID]: flags } }]);
  if (tp.kind !== "poison") await done(message, state, x);
  if (tp.kind === "poison" && (target.system.attributes?.stamina?.total ?? 1) <= 0) {
    if (target.isVampire) { if (!target.statuses?.has("r-torpor")) await target.toggleStatusEffect("r-torpor", { active: true }); }
    await notice(target, x.powerName, t(target.isVampire ? "PoisonZeroVampire" : "PoisonZeroMortal"));
  }
  return notice(target, x.powerName, desc);
}

/** Кнопка карточки «наложить» без броска (Глаза змеи против смертного). */
export async function applyFromCard(message) {
  const x = message.getFlag(SYSTEM_ID, "targetApply");
  if (!x || x.done) return;
  return applyTargetPower(message, { actorUuid: x.actorUuid, extra: { targetPower: x } }, { successes: 1, outcome: "success" });
}
