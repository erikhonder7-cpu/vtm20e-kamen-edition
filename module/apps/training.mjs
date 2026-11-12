// module/apps/training.mjs
// Между историями: обучение в окне развития. План — черта, которую персонаж учит, у кого (наставник) и с какой ночи;
// по завершении — обычная покупка за опыт. Что говорят книги:
//   · Demon (Знания: учителя): новичку хватит наставника с •, дальше — знающего больше; плата — услуга, задание, реликвия.
//     По желанию: в конце истории бросок по Знанию учителя — сл. 6 (учит первичному), 7 (Знанию своего Дома или общему),
//     8 (чужого Дома); успехи — опыт только на это Знание, не больше Знания учителя.
//   · M20: наставник с иным фокусом может умножить время или сделать обучение невозможным; из того же Тайного общества — как собрат.
//   · Wraith 20 (гл. 5, «Обучение в Гильдии», «Обмен Арканоями»): со Статусом в Гильдии Арканоса (своей или союзной — на 2 ниже)
//     точка стоит текущий рейтинг × 2, новый Арканос — 5; день учёбы на точку; учителя Посвящённого уровня ищут броском
//     Обаяние + Знание улиц, сл. 8. Обмен (по желанию): учитель бросает Обаяние + Лидерство, сл. 6 (Общий) или 8 (Посвящённый),
//     успехи снижают цену (не ниже 1); ученик тратит Волю в день; со скидкой Гильдии не складывается.
//   · Прочее: нужен ли учитель и сколько учиться — решает рассказчик (правило системы).

import { SYSTEM_ID } from "../config.mjs";
import * as WR from "./wraith.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Train.${k}`, d) : game.i18n.localize(`VTM20.Train.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));

export const trainingOf = actor => foundry.utils.deepClone(actor.getFlag(SYSTEM_ID, "training") ?? []);
const save = (actor, list) => actor.setFlag(SYSTEM_ID, "training", list);

async function nightNow() {
  try { return (await import("./calendar.mjs")).nightNumber(); } catch { return null; }
}

/** Взять черту в обучение (без повторов). */
export async function planTraining(actor, ref, label) {
  const list = trainingOf(actor);
  if (list.some(p => p.ref === ref)) return ui.notifications.info(t("Already", { name: label }));
  list.push({ ref, label, mentor: "", start: await nightNow(), bank: 0 });
  await save(actor, list);
  return ui.notifications.info(t("Planned", { name: label }));
}

export async function dropTraining(actor, ref) {
  return save(actor, trainingOf(actor).filter(p => p.ref !== ref));
}

export async function setMentor(actor, ref, mentor) {
  const list = trainingOf(actor), p = list.find(x => x.ref === ref);
  if (!p || p.mentor === mentor) return;
  p.mentor = mentor;
  return save(actor, list);
}

/** Разбор ссылки строки окна опыта: «a:путь:вид» или «i:id:путь:вид». */
export function parseRef(actor, ref) {
  const [scope, a1, a2, a3] = ref.split(":");
  const doc = scope === "i" ? actor.items.get(a1) : actor;
  const [path, kind] = scope === "i" ? [a2, a3] : [a1, a2];
  return { doc, path, kind };
}

/** Подсказка по правилам для вида черты. */
function noteFor(kind) {
  if (kind === "lore") return t("NoteLore");
  if (kind === "mageSphere" || kind === "mageArete") return t("NoteMage");
  return t("NoteAny");
}

/** Карточки планов для окна: rows — все строки окна опыта по ссылке (цена, точки, «почему»). */
export async function trainingView(actor, rows) {
  const now = await nightNow(), avail = actor.system.experience.available;
  const mentorBg = actor.items.filter(i => i.type === "background" && /^наставник|^mentor/i.test(i.name)).map(i => ({ name: i.name, value: i.system.value ?? 0 }));
  return trainingOf(actor).map(p => {
    const r = rows.get(p.ref), { kind, doc } = parseRef(actor, p.ref);
    const nights = now != null && p.start != null ? Math.max(0, now - p.start) : null;
    const arc = arcanosTraining(actor, p, kind, r);
    return { ...p, arc, ok: !!r && !!doc, cur: r?.cur ?? 0, next: (r?.cur ?? 0) + 1, cost: r?.cost ?? null, why: r?.why ?? "", dots: r?.dots ?? [],
      need: r?.cost != null ? Math.max(0, r.cost - (p.bank ?? 0) - arcSave(arc)) : null, can: r?.cost != null && r.cost - (p.bank ?? 0) - arcSave(arc) <= avail,
      nights, hasNights: nights != null, note: noteFor(kind), lore: kind === "lore", mentorBg };
  });
}

const arcSave = arc => arc ? (arc.guild ? arc.guildSave : arc.exchangeSave) : 0;

/** Арканос призрака: ключ из ссылки «a:system.wraith.arcanoi.<ключ>.value:arcanos». */
const arcKeyOf = ref => /system\.wraith\.arcanoi\.([a-z]+)\.value/.exec(ref)?.[1] ?? null;

/** Цена точки Арканоса при обучении в Гильдии: рейтинг × 2, новый — 5. */
const guildCost = cur => cur === 0 ? 5 : cur * 2;

/** Обучение Арканосу (Wraith 20): Статус в Гильдии этого Арканоса, цена в Гильдии, выбранный путь, скидка обмена. */
function arcanosTraining(actor, p, kind, r) {
  const key = kind === "arcanos" && actor.type === "wraith" && !actor.system.wraith?.spectre?.on ? arcKeyOf(p.ref) : null;
  if (!key) return null;
  const status = WR.guildStatus(actor)[key] ?? 0, cur = r?.cur ?? 0, cost = r?.cost ?? null;
  const gCost = guildCost(cur);
  return { status, guildOk: status > 0, guild: !!p.guild && status > 0, guildCost: gCost, guildSave: cost != null ? Math.max(0, cost - gCost) : 0,
    exchange: p.exchange ?? 0, exchangeSave: cost != null ? Math.min(p.exchange ?? 0, Math.max(0, cost - 1)) : 0 };
}

/** Обучение в Гильдии — вкл/выкл (только со Статусом в этой Гильдии; обмен тогда сбрасывается). */
export async function toggleGuildTraining(actor, ref) {
  const list = trainingOf(actor), p = list.find(x => x.ref === ref), key = arcKeyOf(ref);
  if (!p || !key) return null;
  if (!p.guild && !((WR.guildStatus(actor)[key] ?? 0) > 0)) return ui.notifications.warn(t("GuildNoStatus"));
  p.guild = !p.guild;
  if (p.guild) p.exchange = 0;
  return save(actor, list);
}

/** Обмен Арканоями: бросок учителя — Обаяние + Лидерство, сл. 6 (Общий) или 8 (Посвящённый); успехи — скидка. */
export async function exchangeRoll(actor, ref) {
  const list = trainingOf(actor), p = list.find(x => x.ref === ref);
  if (!p || !arcKeyOf(ref)) return null;
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: t("ExchangeTitle", { name: p.label }), icon: "fa-solid fa-handshake" }, classes: ["vtm20", "r-dialog"], position: { width: 440 },
    content: `<p class="r-note">${esc(t("ExchangeRule"))}</p>
      <label class="r-f"><span>${esc(t("ExchangePool"))}</span><input type="number" name="n" value="4" min="1" max="10"></label>
      <label class="r-f"><span>${esc(t("ExchangeKind"))}</span><select name="d"><option value="6">6 — ${esc(t("ExchangeCommon"))}</option><option value="8">8 — ${esc(t("ExchangeInitiate"))}</option></select></label>`,
    ok: { label: t("TeacherGo"), icon: "fa-solid fa-dice-d10", callback: (e, b) => ({ n: Math.clamp(Number(b.form.elements.n.value) || 1, 1, 10), d: Number(b.form.elements.d.value) || 6 }) },
    rejectClose: false });
  if (!res) return null;
  const { rollPool } = await import("../dice/roll.mjs");
  const roll = await rollPool({ actor, title: t("ExchangeTitle", { name: p.label }), subtitle: t("ExchangeSub"), pool: res.n, difficulty: res.d, kind: "check",
    breakdown: [{ label: t("ExchangePool"), value: res.n }] });
  if (!roll) return null;
  const fresh = trainingOf(actor), q = fresh.find(x => x.ref === ref);
  if (!q) return roll;
  q.exchange = Math.max(0, roll.successes ?? 0); q.guild = false;
  await save(actor, fresh);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice r-type-wraith"><i class="fa-solid fa-handshake"></i> ${t("ExchangeGot", { name: esc(actor.name), n: q.exchange, what: esc(p.label) })}</div>` });
  return roll;
}

/**
 * Спонтанное проявление (Wraith 20, гл. 5): прямо в сцене, с одобрения рассказчика — Воля, равная новому уровню, и полная цена
 * в опыте; уровень доступен сразу, даже Посвящённый. План обучения снимается.
 */
export async function spontaneous(actor, ref) {
  const list = trainingOf(actor), p = list.find(x => x.ref === ref);
  if (!p || !arcKeyOf(ref)) return null;
  const { doc, path, kind } = parseRef(actor, ref);
  const { cur, cost } = actor.xpCostOf({ doc, path, kind });
  const lvl = cur + 1, wp = actor.system.willpower.temporary;
  if (cost == null) return null;
  if (wp < lvl) return ui.notifications.warn(t("SpontNoWill", { n: lvl, have: wp }));
  if (actor.system.experience.available < cost) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoXp", { cost, have: actor.system.experience.available }));
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Spont") }, content: `<p>${esc(t("SpontAsk", { what: p.label, n: lvl, cost }))}</p>`, rejectClose: false });
  if (!ok) return null;
  const paid = await actor.buyWithXp({ doc, path, kind, label: p.label, confirm: false, note: t("Spont") });
  if (!paid) return null;
  await actor.update({ "system.willpower.temporary": wp - lvl });
  await save(actor, trainingOf(actor).filter(x => x.ref !== ref));
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice r-type-wraith"><i class="fa-solid fa-bolt"></i> ${t("SpontDone", { name: esc(actor.name), what: esc(p.label), n: lvl })}</div>` });
}

/**
 * Бросок учителя (Demon, по желанию, в конце истории): пул — Знание учителя, сложность 6/7/8;
 * успехи — опыт только на это Знание, не больше Знания учителя.
 */
export async function teacherRoll(actor, ref) {
  const list = trainingOf(actor), p = list.find(x => x.ref === ref);
  if (!p) return null;
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: t("TeacherTitle", { name: p.label }), icon: "fa-solid fa-chalkboard-user" }, classes: ["vtm20", "r-dialog"], position: { width: 460 }, rejectClose: false,
    content: `<div class="r-form"><p>${esc(t("TeacherRule"))}</p>
      <label class="r-field"><span>${esc(t("TeacherLore"))}</span><input type="number" name="n" value="1" min="1" max="5"></label>
      <label class="r-field"><span>${esc(t("TeacherDiff"))}</span><select name="d">
        <option value="6">6 — ${esc(t("DiffPrimary"))}</option><option value="7" selected>7 — ${esc(t("DiffHouse"))}</option><option value="8">8 — ${esc(t("DiffOther"))}</option></select></label></div>`,
    buttons: [{ action: "ok", icon: "fa-solid fa-dice-d10", label: t("TeacherGo"), default: true,
      callback: (e, b) => ({ n: Math.clamp(Number(b.form.elements.n.value) || 1, 1, 5), d: Number(b.form.elements.d.value) || 7 }) }]
  });
  if (!res || typeof res !== "object") return null;
  const { rollPool } = await import("../dice/roll.mjs");
  const roll = await rollPool({ actor, title: t("TeacherTitle", { name: p.label }), subtitle: t("TeacherSub", { n: res.n }), pool: res.n, difficulty: res.d, kind: "check",
    breakdown: [{ label: t("TeacherLore"), value: res.n }] });
  if (!roll) return null;
  const got = Math.min(Math.max(0, roll.successes ?? 0), res.n);
  if (got) {
    p.bank = (p.bank ?? 0) + got;
    await save(actor, list);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="r-notice r-type-demon"><i class="fa-solid fa-chalkboard-user"></i> ${t("TeacherGot", { name: esc(actor.name), n: got, what: esc(p.label) })}</div>` });
  }
  return roll;
}

/**
 * Завершить обучение: опыт учителя (если накоплен) — в копилку с пометкой, затем обычная покупка точки
 * с наставником в журнале. План снимается (копилка сверх цены — остаётся на следующую точку).
 */
export async function finishTraining(actor, ref) {
  const list = trainingOf(actor), p = list.find(x => x.ref === ref);
  if (!p) return null;
  const { doc, path, kind } = parseRef(actor, ref);
  if (!doc) return dropTraining(actor, ref);
  const { cur, cost } = actor.xpCostOf({ doc, path, kind });
  // Арканос призрака: скидка Гильдии или обмена — разницей в копилку, с пометкой в журнале опыта
  const arc = arcanosTraining(actor, p, kind, { cur, cost });
  const disc = arc ? (arc.guild ? arc.guildSave : arc.exchangeSave) : 0;
  const bank = Math.min(p.bank ?? 0, Math.max(0, (cost ?? 0) - disc));
  // хватает ли опыта — до того, как скидка попадёт в журнал
  if (cost != null && actor.system.experience.available + bank + disc < cost)
    return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoXp", { cost: cost - bank - disc, have: actor.system.experience.available }));
  if (disc > 0) {
    const s = actor._source.system.experience, log = foundry.utils.deepClone(s.log);
    log.unshift({ amount: disc, reason: t(arc.guild ? "GuildLog" : "ExchangeLog", { what: p.label }), date: new Date().toLocaleDateString("ru-RU") });
    await actor.update({ "system.experience.total": s.total + disc, "system.experience.log": log });
  }
  if (bank) {
    const s = actor._source.system.experience, log = foundry.utils.deepClone(s.log);
    log.unshift({ amount: bank, reason: t("BankLog", { what: p.label, who: p.mentor || t("Teacher") }), date: new Date().toLocaleDateString("ru-RU") });
    await actor.update({ "system.experience.total": s.total + bank, "system.experience.log": log });
  }
  const paid = await actor.buyWithXp({ doc, path, kind, label: p.label, confirm: false, note: p.mentor ? t("WithMentor", { who: p.mentor }) : "" });
  if (!paid) return null;
  const left = (p.bank ?? 0) - bank;
  await save(actor, left > 0 ? list.map(x => x.ref === ref ? { ...x, bank: left, start: null } : x) : list.filter(x => x.ref !== ref));
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice"><i class="fa-solid fa-graduation-cap"></i> ${t("Done", { name: esc(actor.name), what: esc(p.label), n: cur + 1 })}${p.mentor ? ` <small>${esc(t("WithMentor", { who: p.mentor }))}</small>` : ""}</div>` });
}
