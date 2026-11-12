// module/apps/training.mjs
// Между историями: обучение в окне развития. План — черта, которую персонаж учит, у кого (наставник) и с какой ночи;
// по завершении — обычная покупка за опыт. Что говорят книги:
//   · Demon (Знания: учителя): новичку хватит наставника с •, дальше — знающего больше; плата — услуга, задание, реликвия.
//     По желанию: в конце истории бросок по Знанию учителя — сл. 6 (учит первичному), 7 (Знанию своего Дома или общему),
//     8 (чужого Дома); успехи — опыт только на это Знание, не больше Знания учителя.
//   · M20: наставник с иным фокусом может умножить время или сделать обучение невозможным; из того же Тайного общества — как собрат.
//   · Прочее: нужен ли учитель и сколько учиться — решает рассказчик (правило системы).

import { SYSTEM_ID } from "../config.mjs";

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
    return { ...p, ok: !!r && !!doc, cur: r?.cur ?? 0, next: (r?.cur ?? 0) + 1, cost: r?.cost ?? null, why: r?.why ?? "", dots: r?.dots ?? [],
      need: r?.cost != null ? Math.max(0, r.cost - (p.bank ?? 0)) : null, can: r?.cost != null && r.cost - (p.bank ?? 0) <= avail,
      nights, hasNights: nights != null, note: noteFor(kind), lore: kind === "lore", mentorBg };
  });
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
  const bank = Math.min(p.bank ?? 0, cost ?? 0);
  if (cost != null && actor.system.experience.available + bank < cost)
    return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoXp", { cost: cost - bank, have: actor.system.experience.available }));
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
