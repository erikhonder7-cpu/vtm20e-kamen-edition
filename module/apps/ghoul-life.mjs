// module/apps/ghoul-life.mjs
// Жизнь гуля на витэ (V20_Основные_правила/07, «Правила гулей»):
//   · третий глоток у одного вампира: гуль с Волей ниже 6 проходит проверку Самоконтроля, чтобы отказаться
//     (сложность в книге не названа — 6, правило системы);
//   · кровь одного клана: больше 4 пунктов подряд — Выносливость (сл. 5); неудача — ослабленный изъян клана,
//     пока гуль не выпьет крови другого клана (после проверки счёт начинается заново — правило системы);
//   · передозировка: сверх предела — по лишнему пункту на точку Выносливости; за каждый Выносливость (сл. 8), успех — пункт годен;
//     неудача — 1 летальное повреждение за каждый лишний пункт, лишние бесполезны и весь запас не действует, пока их не извергнуть (сцена);
//     пока лишние пункты в теле — ярость с вампирской сложностью, Ловкость +1, каждую сцену Восприятие + Самоконтроль
//     (неудача — сильные галлюцинации; сложность не названа — 6, правило системы);
//   · ломка: без витэ (6 − Выносливость) недель; отказаться от витэ — Самоконтроль (сл. 7); каждую неделю Интеллект + Самоконтроль (сл. 6):
//     неудача — тяга к крови, плоти или близости, утолить или потратить 1 Волю; провал — утолить обязательно;
//   · 6 месяцев без витэ — −1 точка Дисциплины, затем ещё −1 каждый месяц;
//   · старение: больше месяца без витэ — до 100 лет как человек, 100–250 — в 10 раз быстрее, старше 250 — в прах.
// «Без витэ» считается с ночи, когда опустел запас (правило системы). Ревенанты вырабатывают витэ сами — у них нет
// ломки, потери Дисциплин и старения; дампиров эти правила не касаются.
// Состояние — system.addiction: dry (ночь, когда опустел запас), clan и streak (кровь какого клана и сколько подряд),
// taint (изъян клана), excess (лишние пункты в теле), spoiled (лишние не прижились — запас не действует), lost (снято точек Дисциплин).

import { getClock, ymd } from "./calendar.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { Codex } from "../data/codex.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.GhoulLife.${k}`, d) : game.i18n.localize(`VTM20.GhoulLife.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const today = () => ymd(new Date(getClock()));
const say = (actor, icon, html, warn = false) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice ${warn ? "is-warn" : ""}"><i class="fa-solid ${icon}"></i> ${html}</div>` });

/** Чей изъян несёт кровь: сначала родительский клан из списка книги, потом «кланы Шабаша». */
const TAINT_PARENT = {
  brujah: "brujah", bruhaAntitribu: "brujah", istinnyeBruha: "brujah",
  ventrue: "ventrue", ventruAntitribu: "ventrue",
  malkavian: "malkavian", malkavianeAntitribu: "malkavian", malkavianeDominatory: "malkavian",
  nosferatu: "nosferatu", nosferatuAntitribu: "nosferatu",
  setite: "setite", tlatsik: "setite", zmeiSveta: "setite", voinySeta: "setite", daytya: "setite"
};
const SABBAT = ["lasombra", "lasombraAntitribu", "angelisAter", "kiasidy", "tzimisce", "kolduny", "staryyKlanTsimishov", "pandery",
  "gorodskieGangrely", "dikieGangrely", "tremerAntitribu", "toreadorAntitribu", "assamityAntitribu", "ravnosAntitribu", "salyubriAntitribu", "gangrelAntitribu"];
export const TAINTS = ["brujah", "ventrue", "malkavian", "nosferatu", "setite", "sabbat", "other"];
export const taintOf = clan => !clan ? "" : TAINT_PARENT[clan] ?? (SABBAT.includes(clan) || /Antitribu$/.test(clan) ? "sabbat" : "other");

/** Живёт ли персонаж по правилам гулей (вассал, независимый, ревенант; не дампир). */
export const ghoulLives = a => a?.type === "ghoul" && a.system.ghoulType !== "dhampir";
/** Ломка, потеря Дисциплин и старение — только у тех, кто не вырабатывает витэ сам. */
const needsVitae = a => ghoulLives(a) && a.system.ghoulType !== "revenant";

const days = (from, to) => {
  if (!from) return 0;
  const [y1, m1, d1] = from.split("-").map(Number), [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
};
const months = (from, to) => {
  if (!from) return 0;
  const [y1, m1, d1] = from.split("-").map(Number), [y2, m2, d2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
};
const ageOf = a => parseInt(String(a.system.details?.age ?? "").replace(/\D+/g, " ").trim().split(" ")[0]) || 0;

/** Сколько точек Дисциплин уже положено потерять: 6 месяцев — 1, дальше по 1 за месяц. */
export const disciplinesDue = (m) => m >= 6 ? m - 5 : 0;

/** Состояние для листа: изъян, лишние пункты, ломка, потеря Дисциплин, старение. */
export function lifeState(a) {
  if (!ghoulLives(a)) return null;
  const ad = a.system.addiction ?? {}, now = today(), stamina = a.system.attributes?.stamina?.total ?? 1;
  const out = { revenant: a.system.ghoulType === "revenant", excess: ad.excess ?? 0, spoiled: !!ad.spoiled, chips: [] };
  if (ad.taint) out.chips.push({ icon: "fa-vial-circle-check", warn: true, label: t(`Taint.${ad.taint}`), tip: t(`TaintText.${ad.taint}`) });
  if (ad.clan && ad.streak) out.chips.push({ icon: "fa-droplet", label: t("Streak", { clan: clanName(ad.clan), n: ad.streak }), tip: t("StreakTip") });
  if (out.excess) out.chips.push({ icon: "fa-flask", warn: true, label: t(out.spoiled ? "Spoiled" : "Excess", { n: out.excess }), tip: t(out.spoiled ? "SpoiledTip" : "ExcessTip") });
  if (needsVitae(a) && ad.dry) {
    const d = days(ad.dry, now), weeks = Math.floor(d / 7), total = Math.max(0, 6 - stamina), m = months(ad.dry, now);
    out.dryDays = d;
    out.withdrawal = total > 0 && weeks < total;
    out.chips.push({ icon: "fa-hourglass-half", warn: out.withdrawal, label: t("Dry", { n: d }),
      tip: total > 0 ? t(out.withdrawal ? "WithdrawalOn" : "WithdrawalOver", { n: total, w: Math.min(weeks + 1, total) }) : t("WithdrawalNone") });
    const due = disciplinesDue(m) - (ad.lost ?? 0);
    if (due > 0) { out.discDue = due; out.chips.push({ icon: "fa-arrow-trend-down", warn: true, label: t("DiscDue", { n: due }), tip: t("DiscDueTip") }); }
    if (m >= 1) { const age = ageOf(a); out.chips.push({ icon: "fa-hourglass-end", warn: age > 100, label: t(age > 250 ? "AgeDust" : age >= 100 ? "AgeFast" : "AgeHuman"), tip: t("AgeTip") }); }
  }
  return out;
}

const clanName = key => Codex.clan(key)?.name ?? key;

/** Проверка с ожиданием результата: промис разрешается после броска (или null, если окно закрыли). */
function check(actor, cfg) {
  return new Promise(resolve => {
    let done = false;
    RollDialog.prompt(actor, { reflexive: true, lockTraits: true, ...cfg, onRolled: r => { done = true; resolve(r); } }).then(app => {
      const id = Hooks.on("closeApplicationV2", w => { if (w !== app) return; Hooks.off("closeApplicationV2", id); setTimeout(() => !done && resolve(null), 50); });
    });
  });
}

/**
 * Перед глотком (feedFrom): третий глоток у того же вампира — гуль с Волей ниже 6 может попытаться отказаться.
 * Возвращает false, если гуль отказался.
 */
export async function beforeDrink(actor, bond) {
  if (!ghoulLives(actor) || !bond || bond.rating !== 2 || (actor.system.willpower?.permanent ?? 5) >= 6) return true;
  const want = await foundry.applications.api.DialogV2.confirm({
    window: { title: t("ThirdTitle"), icon: "fa-solid fa-link" }, classes: ["vtm20", "r-dialog"],
    content: `<p>${t("ThirdHint", { name: esc(bond.name) })}</p>`, yes: { label: t("ThirdRoll") }, no: { label: t("ThirdDrink") }, rejectClose: false
  });
  if (!want) return true;
  const r = await check(actor, { title: t("ThirdTitle"), trait1: "virtues.selfControl", difficulty: 6, kind: "bond", diffNote: t("ThirdNote") });
  if (r?.successes > 0) { await say(actor, "fa-hand", t("ThirdRefused", { actor: esc(actor.name), name: esc(bond.name) })); return false; }
  return true;
}

/**
 * После глотка (feedFrom): ломка кончилась, счёт крови одного клана, передозировка.
 * amount — сколько выпито, over — сколько не поместилось в запас, clan — клан донора.
 */
export async function afterDrink(actor, { amount = 0, over = 0, clan = "" } = {}) {
  if (!ghoulLives(actor)) return;
  const ad = foundry.utils.deepClone(actor._source.system.addiction ?? {});
  const upd = { "system.addiction.dry": "", "system.addiction.lost": 0 };
  const lines = [];
  // кровь другого клана снимает изъян; одного — копит счёт
  const tk = taintOf(clan);
  if (clan) {
    if (ad.taint && tk !== ad.taint) { upd["system.addiction.taint"] = ""; lines.push(t("TaintGone", { taint: t(`Taint.${ad.taint}`) })); ad.taint = ""; }
    const streak = clan === ad.clan ? (ad.streak ?? 0) + amount : amount;
    upd["system.addiction.clan"] = clan; upd["system.addiction.streak"] = streak;
    await actor.update(upd);
    if (lines.length) await say(actor, "fa-droplet", lines.join(" "));
    if (streak > 4 && ad.taint !== tk) {
      const r = await check(actor, { title: t("ClanTitle"), subtitle: clanName(clan), trait1: "attributes.stamina", difficulty: 5, diffNote: t("ClanNote", { n: streak }) });
      await actor.update({ "system.addiction.streak": 0 });
      if (r && !(r.successes > 0)) {
        await actor.update({ "system.addiction.taint": tk });
        await say(actor, "fa-vial-circle-check", `${t("TaintGot", { actor: esc(actor.name), taint: t(`Taint.${tk}`) })}<br><span class="r-muted">${t(`TaintText.${tk}`)}</span>`, true);
      }
    }
  } else await actor.update(upd);
  if (over > 0) await overdose(actor, over);
}

/** Передозировка: по одной проверке Выносливости (сл. 8) на лишний пункт, пока есть место (1 на точку Выносливости). */
export async function overdose(actor, over) {
  const stamina = actor.system.attributes?.stamina?.total ?? 1;
  for (let i = 0; i < over; i++) {
    const held = actor.system.addiction?.excess ?? 0;
    if (actor.system.addiction?.spoiled) break;
    if (held >= stamina) { await say(actor, "fa-flask", t("OverCap", { actor: esc(actor.name), n: over - i })); break; }
    const r = await check(actor, { title: t("OverTitle"), subtitle: t("OverSub", { n: held + 1, max: stamina }), trait1: "attributes.stamina", difficulty: 8, diffNote: t("OverNote") });
    if (!r) break;
    if (r.successes > 0) {
      await actor.update({ "system.addiction.excess": held + 1, "system.blood.value": (actor.system.blood?.value ?? 0) + 1 });
      continue;
    }
    // неудача: летальные за каждый лишний пункт (уже взятые и этот), запас не действует до извержения
    const n = held + 1, h = actor._source.system.health ?? {};
    await actor.update({ "system.addiction.excess": n, "system.addiction.spoiled": true, "system.health.lethal": (h.lethal ?? 0) + n,
      "system.blood.value": Math.min(actor.system.blood?.value ?? 0, actor.system.blood?.base ?? actor.system.blood?.max ?? 0) });
    await say(actor, "fa-flask", t("OverFail", { actor: esc(actor.name), n }), true);
    break;
  }
}

/** Извергнуть лишние пункты (занимает сцену): запас снова действует, лишнее пропадает. */
export async function purge(actor) {
  const base = actor.system.blood?.base ?? actor.system.blood?.max ?? 0;
  await actor.update({ "system.addiction.excess": 0, "system.addiction.spoiled": false, "system.blood.value": Math.min(actor.system.blood?.value ?? 0, base) });
  return say(actor, "fa-flask", t("Purged", { actor: esc(actor.name) }));
}

/** Каждую сцену с лишними пунктами в теле: Восприятие + Самоконтроль, неудача — галлюцинации. */
export async function hallucinations(actor) {
  const r = await check(actor, { title: t("HallTitle"), trait1: "attributes.perception", trait2: "virtues.selfControl", difficulty: 6, diffNote: t("HallNote") });
  if (r && !(r.successes > 0)) await say(actor, "fa-eye", t("HallFail", { actor: esc(actor.name) }), true);
}

/** Отказаться от предложенного витэ во время ломки: Самоконтроль (сл. 7). */
export async function refuseVitae(actor) {
  const r = await check(actor, { title: t("RefuseTitle"), trait1: "virtues.selfControl", difficulty: 7, diffNote: t("RefuseNote") });
  if (!r) return;
  await say(actor, "fa-hand", t(r.successes > 0 ? "RefuseOk" : "RefuseFail", { actor: esc(actor.name) }), !(r.successes > 0));
}

/** Неделя ломки: Интеллект + Самоконтроль (сл. 6). */
export async function withdrawalWeek(actor) {
  const r = await check(actor, { title: t("WeekTitle"), trait1: "attributes.intelligence", trait2: "virtues.selfControl", difficulty: 6, diffNote: t("WeekNote") });
  if (!r) return;
  const key = r.outcome === "botch" ? "WeekBotch" : r.successes > 0 ? "WeekOk" : "WeekFail";
  await say(actor, "fa-hourglass-half", t(key, { actor: esc(actor.name) }), key !== "WeekOk");
}

/** Снять положенную точку Дисциплины (6 месяцев без витэ и дальше по месяцу). */
export async function loseDiscipline(actor) {
  const list = actor.items.filter(i => i.type === "discipline" && (i.system.value ?? 0) > 0);
  if (!list.length) { await actor.update({ "system.addiction.lost": (actor.system.addiction?.lost ?? 0) + 1 }); return ui.notifications.info(t("NoDisc")); }
  const opts = list.map(i => `<option value="${i.id}">${esc(i.name)} · ${i.system.value}</option>`).join("");
  const id = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("LoseTitle"), icon: "fa-solid fa-arrow-trend-down" }, classes: ["vtm20", "r-dialog"],
    content: `<p class="r-hint">${t("LoseHint")}</p><label class="r-field"><span>${t("LoseWhich")}</span><select name="disc">${opts}</select></label>`,
    ok: { label: t("LoseDo"), callback: (e, b) => b.form.elements.disc.value }, rejectClose: false
  });
  const item = id && actor.items.get(id);
  if (!item) return;
  await item.update({ "system.value": Math.max(0, item.system.value - 1) });
  await actor.update({ "system.addiction.lost": (actor.system.addiction?.lost ?? 0) + 1 });
  return say(actor, "fa-arrow-trend-down", t("Lost", { actor: esc(actor.name), name: esc(item.name), n: item.system.value }), true);
}

/** Строки ночной сводки: неделя ломки, Дисциплины к потере, старение. */
export function ghoulNight(actor) {
  if (!needsVitae(actor)) return [];
  const st = lifeState(actor);
  if (!st?.dryDays) return [];
  const lines = [];
  if (st.withdrawal && st.dryDays % 7 === 0) lines.push(t("NightWeek", { actor: esc(actor.name) }));
  if (st.discDue) lines.push(t("NightDisc", { actor: esc(actor.name), n: st.discDue }));
  if (st.dryDays === 31) lines.push(t("NightAge", { actor: esc(actor.name) }));
  return lines;
}

/** Ярость с вампирской сложностью: изъян Бруха или лишние пункты в теле. */
export const vampireFrenzy = a => ghoulLives(a) && (a.system.addiction?.taint === "brujah" || (a.system.addiction?.excess ?? 0) > 0);

/** Опустел запас — с этой ночи «без витэ»; запас ушёл к пределу — лишних больше нет. Только у того, кто менял. */
Hooks.on("updateActor", (a, change, opts, userId) => {
  if (userId !== game.user.id || !ghoulLives(a) || !foundry.utils.hasProperty(change, "system.blood.value")) return;
  const ad = a.system.addiction ?? {}, v = a.system.blood?.value ?? 0, upd = {};
  if (v <= 0 && needsVitae(a) && !ad.dry) upd["system.addiction.dry"] = today();
  if (ad.excess && !ad.spoiled && v <= (a.system.blood?.base ?? 0)) upd["system.addiction.excess"] = 0;
  if (Object.keys(upd).length) a.update(upd);
});
