// module/apps/golconda.mjs
// Голконда (V20, гл. 5): власть над Зверем — цель целой хроники, не покупка за опыт.
//   · Кто может: Путь Человечности 7+ и Совесть 4+ — всё время поиска; на Путях Просветления Голконда недостижима.
//   · Поиск учения (Black Hand, необязательное правило): три месяца, раз в неделю Интеллект + Расследование, сложность 9,
//     без автоматического успеха за Волю; за период — 4 чистых успеха: найден ритуал Отдохновения (Суспир). Недобор — сначала.
//   · Отдохновение — путешествие в глубины своей души; исход решает рассказчик. Второго шанса нет.
//   · Достигшему: невосприимчив к бешенству и Ротшреку; кровь тратится раз в неделю вместо каждой ночи;
//     любой параметр — до 10 независимо от поколения (запас крови прежний).
//   · Человечность ниже 7 или Совесть ниже 4 — все эффекты теряются, параметры выше предела поколения — тоже.

import { SYSTEM_ID, VTM20 } from "../config.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Golconda.${k}`, d) : game.i18n.localize(`VTM20.Golconda.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
const say = (actor, icon, html, gm = false) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), ...(gm ? { whisper: ChatMessage.getWhisperRecipients("GM") } : {}),
  content: `<div class="r-notice r-golconda"><i class="fa-solid ${icon}"></i> ${html}</div>` });
const SEEK_WEEKS = 12, SEEK_NEED = 4, SEEK_DIFF = 9;

/** Условия Голконды: Путь Человечности 7+ и Совесть 4+. */
export function golcondaEligible(actor) {
  const s = actor?.system;
  if (actor?.type !== "vampire" || s.morality?.path !== "humanity") return false;
  return (s.morality.value ?? 0) >= 7 && (s.virtues?.conscience?.value ?? 0) >= 4;
}
/** Достиг и держит условия — эффекты действуют. */
export const golcondaActive = actor => actor?.system?.golconda?.stage === "attained" && golcondaEligible(actor);

/** Неделя хроники (по ночам) — для поиска и недельной траты крови. */
async function chronicleWeek() {
  const { nightNumber } = await import("./calendar.mjs");
  return Math.floor((nightNumber() - 1) / 7);
}

/** Вид для карточки Человечности. */
export function golcondaView(actor) {
  const g = actor.system.golconda, eligible = golcondaEligible(actor);
  if (actor.type !== "vampire" || actor.system.morality?.path !== "humanity") return null;
  return { stage: g.stage, eligible, active: golcondaActive(actor), lost: g.stage === "attained" && !eligible, found: g.found, weeks: g.weeks,
    need: SEEK_NEED, total: SEEK_WEEKS, isGM: game.user.isGM,
    label: t(g.stage === "attained" ? (eligible ? "Attained" : "Lost") : g.stage === "suspire" ? "Suspire" : g.stage === "seeking" ? "Seeking" : "None") };
}

/** Поиск учения: бросок недели (не чаще раза в неделю хроники). */
export async function seekTeaching(actor) {
  if (!actor.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: actor.name }));
  if (!golcondaEligible(actor)) return ui.notifications.warn(t("NotEligible"));
  const g = actor.system.golconda, week = await chronicleWeek();
  if (g.stage === "seeking" && g.week === week) return ui.notifications.info(t("OncePerWeek"));
  const s = actor.system, int = s.attributes.intelligence.value, inv = s.abilities.investigation?.value ?? 0;
  const { rollPool } = await import("../dice/roll.mjs");
  const roll = await rollPool({ actor, title: t("SeekTitle"), subtitle: t("SeekSub", { d: SEEK_DIFF, n: SEEK_NEED }), pool: int + inv, difficulty: SEEK_DIFF, kind: "check",
    breakdown: [{ label: actor.traitLabel("attributes.intelligence"), value: int }, { label: actor.traitLabel("abilities.investigation"), value: inv }] });
  if (!roll) return null;
  const fresh = g.stage !== "seeking", found = (fresh ? 0 : g.found) + Math.max(0, roll.successes ?? 0), weeks = (fresh ? 0 : g.weeks) + 1;
  if (found >= SEEK_NEED) {
    await actor.update({ "system.golconda": { stage: "suspire", found, weeks, week } });
    return say(actor, "fa-book-open", t("Found", { name: esc(actor.name) }));
  }
  if (weeks >= SEEK_WEEKS) {
    await actor.update({ "system.golconda": { stage: "seeking", found: 0, weeks: 0, week } });
    return say(actor, "fa-rotate-left", t("Restart", { name: esc(actor.name), n: found }));
  }
  await actor.update({ "system.golconda": { stage: "seeking", found, weeks, week } });
  return roll;
}

/** Отдохновение (рассказчик): обряд пройден — Голконда; не пройден — второго шанса нет. */
export async function suspire(actor) {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  const res = await foundry.applications.api.DialogV2.wait({ window: { title: `${t("SuspireTitle")}: ${actor.name}`, icon: "fa-solid fa-sun" }, classes: ["vtm20", "r-dialog"], rejectClose: false, position: { width: 460 },
    content: `<div class="r-form"><p>${esc(t("SuspireRule"))}</p></div>`,
    buttons: [{ action: "pass", icon: "fa-solid fa-sun", label: t("SuspirePass"), default: true }, { action: "fail", icon: "fa-solid fa-cloud", label: t("SuspireFail") }] });
  if (res === "pass") {
    await actor.update({ "system.golconda.stage": "attained" });
    return say(actor, "fa-sun", t("AttainedMsg", { name: esc(actor.name) }));
  }
  if (res === "fail") {
    await actor.update({ "system.golconda": { stage: "failed", found: 0, weeks: 0, week: -1 } });
    return say(actor, "fa-cloud", t("FailedMsg", { name: esc(actor.name) }));
  }
  return null;
}

/** Бешенство и Ротшрек достигшему Голконды не грозят — вместо броска строка в чат. */
export function golcondaShield(actor, kind) {
  if (!["frenzy", "rotschreck"].includes(kind) || !golcondaActive(actor)) return null;
  return say(actor, "fa-sun", t(kind === "frenzy" ? "NoFrenzy" : "NoRotschreck", { name: esc(actor.name) }));
}

/** Пробуждение: достигшему кровь уходит раз в неделю хроники. Вернёт true, если в эту ночь тратить не нужно. */
export async function golcondaSkipsWake(actor) {
  if (!golcondaActive(actor)) return false;
  const week = await chronicleWeek(), last = actor.getFlag(SYSTEM_ID, "golcondaFed");
  if (last === week) return true;
  await actor.setFlag(SYSTEM_ID, "golcondaFed", week);
  return false;
}

/**
 * Потеря Голконды: Человечность ниже 7 или Совесть ниже 4 — параметры выше предела поколения возвращаются к пределу
 * (Атрибуты, Способности, Дисциплины). Пишет один активный рассказчик.
 */
export function registerGolconda() {
  Hooks.on("updateActor", async (actor, diff, opts, userId) => {
    if (actor.type !== "vampire" || actor.system.golconda?.stage !== "attained" || userId !== game.user.id) return;
    const touched = foundry.utils.hasProperty(diff, "system.morality") || foundry.utils.hasProperty(diff, "system.virtues");
    if (!touched || golcondaEligible(actor)) return;
    const cap = VTM20.generationOf(actor.system.effectiveGeneration ?? actor.system.generation).trait, upd = {};
    for (const [k, v] of Object.entries(actor._source.system.attributes ?? {})) if ((v.value ?? 0) > cap) upd[`system.attributes.${k}.value`] = cap;
    for (const [k, v] of Object.entries(actor._source.system.abilities ?? {})) if ((v.value ?? 0) > cap) upd[`system.abilities.${k}.value`] = cap;
    if (Object.keys(upd).length) await actor.update(upd);
    const discs = actor.items.filter(i => i.type === "discipline" && i.system.value > cap).map(i => ({ _id: i.id, "system.value": cap }));
    if (discs.length) await actor.updateEmbeddedDocuments("Item", discs);
    await say(actor, "fa-heart-crack", t("LostMsg", { name: esc(actor.name), n: cap }));
  });
}
