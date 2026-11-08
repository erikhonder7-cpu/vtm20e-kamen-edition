// module/apps/target-powers.mjs
// Силы против цели (V20, Дисциплины, уровни 1–5): сложность — черта отмеченной цели (T), итог — на цели.
//   · сложность: текущая Воля, Смекалка + Смелость, Человечность/Путь, Восприятие + Самоконтроль — по тексту силы;
//   · Доминирование: нельзя против вампира более низкого поколения (V20, гл. 4), нужен зрительный контакт;
//   · Внушение и Забвение: что даёт число успехов — строкой в чат (таблица из текста силы);
//   · Очарование, Страсть, Наваждение, Помрачение рассудка: эффект на цели со сроком по успехам
//     (гаснет по часам хроники — apps/timers.mjs; «1 ход» — до конца сцены);
//   · Устрашающий взор: −1 куб к пулам цели за успех до конца её следующего хода, 3+ — бежит.
// Наложить эффект может владелец цели или рассказчик — кнопкой на карточке броска (как «принять урон»).

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
// календарь и сроки — лениво (apps/calendar.mjs тянет ApplicationV2, а roll.mjs проверяется и вне Foundry)
const clockApi = async () => ({ ...(await import("./calendar.mjs")), ...(await import("./timers.mjs")) });

const t = (k, d) => d ? game.i18n.format(`VTM20.TP.${k}`, d) : game.i18n.localize(`VTM20.TP.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Силы по Дисциплине и английскому имени (имя на русском у сил разных книг может совпадать). */
export const TARGET_POWERS = {
  "dominate|Command": { diff: ["willpower"], dominate: true, note: "Dom1" },
  "dominate|Mesmerize": { diff: ["willpower"], dominate: true, tiers: [[1, "Mes1"], [3, "Mes3"], [5, "Mes5"]] },
  "dominate|The Forgetful Mind": { diff: ["willpower"], dominate: true, tiers: [[1, "Forg1"], [2, "Forg2"], [3, "Forg3"], [4, "Forg4"], [5, "Forg5"]] },
  "dominate|Conditioning": { diff: ["willpower"], dominate: true, note: "Cond" },
  "presence|Dread Gaze": { diff: ["wits", "courage"], dread: true },
  "presence|Entrancement": { diff: ["willpower"], timed: ["hour", "day", "week", "month", "year"] },
  "dementation|Passion": { diff: ["morality"], timed: ["scene", "hour", "night", "week", "month", "3months"] },
  "dementation|The Haunting": { diff: ["perception", "selfControl"], timed: ["night", "2nights", "week", "month", "3months", "year"] },
  "dementation|Total Insanity": { diff: ["willpower"], timed: ["scene", "night", "week", "month", "year"], note: "Insane" },
  "auspex|Telepathy": { diff: ["willpower"], note: "Tele" }
};

export const targetPowerOf = (disc, p) => TARGET_POWERS[`${disc}|${p?.en ?? ""}`] ?? null;

/** Черта цели для сложности. */
function traitOf(a, k) {
  const s = a.system;
  switch (k) {
    case "willpower": return s.willpower?.temporary ?? null;
    case "morality": return s.morality?.value ?? null;
    case "courage": case "selfControl": return s.virtues?.[k]?.value ?? null;
    default: return s.attributes?.[k]?.total ?? s.attributes?.[k]?.value ?? null;
  }
}

/** Отмеченная цель (T) — не сам персонаж. */
export function markedTarget(actor) {
  return [...(game.user.targets ?? [])].map(tk => tk.actor).find(x => x && x !== actor) ?? null;
}

/**
 * Подготовка броска: сложность от цели, запреты. null — бросок не нужен (сообщение уже показано).
 * Возвращает { difficulty, note, target } — target может быть null (сложность вручную).
 */
export function prepareTargetPower(actor, disc, p, tp) {
  const target = markedTarget(actor);
  const label = tp.diff.map(k => t(`Diff.${k}`)).join(" + ");
  if (!target) {
    ui.notifications.info(t("MarkTarget"));
    return { difficulty: null, note: t("NoTarget", { what: label }), target: null };
  }
  // Доминирование: кровь сильнее (поколение ниже) — неподвластна (V20, гл. 4)
  if (tp.dominate && actor.isVampire && target.isVampire && Number(target.system.generation) < Number(actor.system.generation)) {
    ui.notifications.warn(t("DomGeneration", { name: target.name }));
    return null;
  }
  const parts = tp.diff.map(k => traitOf(target, k));
  if (parts.some(v => v == null)) return { difficulty: null, note: t("NoTrait", { name: target.name, what: label }), target };
  const raw = parts.reduce((s, v) => s + Number(v), 0);
  const difficulty = Math.clamp(raw, 2, 10);
  const notes = [t("DiffFrom", { name: target.name, what: label, n: raw })];
  if (raw > 10) notes.push(t("Over10"));
  if (tp.dominate) notes.push(t("Eyes"));
  if (tp.note) notes.push(t(`Note.${tp.note}`));
  return { difficulty, note: notes.join(" "), target };
}

/** Срок по числу успехов. */
function untilOf(code, now, { MS_HOUR, MS_DAY, nextSunrise }) {
  switch (code) {
    case "scene": return null;
    case "hour": return now + MS_HOUR;
    case "night": return nextSunrise(now);
    case "2nights": return nextSunrise(nextSunrise(now) + MS_HOUR);
    case "day": return now + MS_DAY;
    case "week": return now + 7 * MS_DAY;
    case "month": return now + 30 * MS_DAY;
    case "3months": return now + 90 * MS_DAY;
    case "year": return now + 365 * MS_DAY;
  }
  return null;
}

/** Строка итога по числу успехов (Внушение, Забвение) — после броска. */
export function tierText(tp, successes) {
  const row = [...(tp.tiers ?? [])].reverse().find(([n]) => successes >= n);
  return row ? t(`Tier.${row[1]}`) : "";
}

/** Подпись кнопки «наложить» на карточке (только у сил с эффектом на цели). */
export function targetPowerLabel(extra, ev) {
  const tp = extra?.targetPower && TARGET_POWERS[extra.targetPower.key];
  if (!tp || ev.outcome !== "success" || extra.targetPower.done || !(tp.timed || tp.dread)) return "";
  return t("Apply", { name: extra.targetPower.targetName });
}

/** Кнопка на карточке: эффект силы на цели (владелец цели или рассказчик). */
export async function applyTargetPower(message, state, ev) {
  const x = state.extra?.targetPower, tp = x && TARGET_POWERS[x.key];
  if (!tp || x.done) return;
  const target = await foundry.utils.fromUuid(x.target);
  if (!target) return ui.notifications.warn(t("Gone"));
  if (!target.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: target.name }));
  const api = await clockApi(), n = ev.successes, now = api.getClock();
  const [disc] = x.key.split("|");
  const flags = { mind: x.key, by: state.actorUuid ?? "", start: now };
  let name = `${x.powerName} · ${x.actorName}`, desc = "";
  if (tp.dread) {
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
    flags: { [SYSTEM_ID]: flags } }]);
  if (message.isOwner) {
    const { renderCard } = await import("../dice/roll.mjs");
    const next = { ...state, extra: { ...state.extra, targetPower: { ...x, done: true } } };
    await message.setFlag(SYSTEM_ID, "roll", next);
    await message.update({ content: await renderCard(next) });
  }
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }),
    content: `<div class="r-notice"><i class="fa-solid fa-brain"></i> ${t("Applied", { name: esc(target.name), power: esc(x.powerName), what: esc(desc) })}</div>` });
}

/** Штраф к пулам от Устрашающего взора — для окон бросков. */
export function dreadDice(actor) {
  return [...(actor?.effects ?? [])].filter(e => !e.disabled && e.flags?.[SYSTEM_ID]?.dread)
    .map(e => ({ label: e.name, value: -Number(e.flags[SYSTEM_ID].dread) }));
}

/** Снять с цели эффекты «до конца сцены» (Конец сцены). */
export async function endSceneMind(actor) {
  const ids = actor.effects.filter(e => e.flags?.[SYSTEM_ID]?.mind && e.flags[SYSTEM_ID].mode === "scene").map(e => e.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
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
  });
}
