// module/apps/bonds.mjs
// Узы крови (V20_Основные_правила/05, «Узы крови»):
//   · кровь одного вампира в три разные ночи — 3-я ступень; в ту же ночь ступень не растёт;
//   · у вассала один сюзерен 3-й ступени: новые полные узы разрушают все более слабые;
//   · временно сопротивляться — проверка воли (сл. 8), нужно успехов больше, чем раз пил (максимум 9), и 1 пункт воли;
//   · без крови сюзерена узы слабеют на ступень за (12 − воля вассала) месяцев; на 0 — разорваны.
// В записи уз: rating — ступень, drinks — сколько раз пил, last — ночь последнего глотка (ГГГГ-ММ-ДД по часам хроники).
// «Испить крови» (feedFrom): кровь переходит от донора к пьющему, узы растут сами, у донора — запись о вассале.

import { getClock, ymd } from "./calendar.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { nameKey, actorByName } from "../data/lineage.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const today = () => ymd(new Date(getClock()));
const notice = (actor, icon, html) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice"><i class="fa-solid ${icon}"></i> ${html}</div>` });

/** Глоток витэ сюзерена: ступень +1, если это новая ночь. */
export async function drinkVitae(actor, index) {
  const bonds = foundry.utils.deepClone(actor._source.system.bonds ?? []);
  const b = bonds[index];
  if (!b || b.role !== "regnant") return;
  const { list, msg } = applyDrink(bonds, index, today());
  await actor.update({ "system.bonds": list });
  return notice(actor, "fa-droplet", msg);
}

/** Глоток в списке уз (меняет bonds): ступень, ночь, полные узы рушат более слабые. Возвращает { list, msg }. */
function applyDrink(bonds, index, night) {
  const b = bonds[index], sameNight = b.last === night;
  b.drinks = (b.drinks ?? 0) + 1;
  const full = bonds.find((x, i) => i !== index && x.role === "regnant" && x.rating >= 3);
  let msg;
  if (sameNight) msg = t("BondX.SameNight", { name: b.name || "?" });
  else if (b.rating >= 3) msg = t("BondX.Reinforced", { name: b.name || "?" });
  else if (b.rating === 2 && full) msg = t("BondX.AlreadyBound", { name: b.name || "?", other: full.name || "?" });
  else { b.rating += 1; msg = t(`BondX.Step${b.rating}`, { name: b.name || "?" }); }
  b.last = night;
  let list = bonds;
  // новые полные узы разрушают все более слабые
  if (b.rating >= 3 && !sameNight) {
    const broken = bonds.filter((x, i) => i !== index && x.role === "regnant" && x.rating < 3);
    if (broken.length) msg += " " + t("BondX.Shattered", { names: broken.map(x => x.name || "?").join(", ") });
    list = bonds.filter((x, i) => i === index || x.role !== "regnant" || x.rating >= 3);
  }
  return { list, msg };
}

/**
 * Испить крови Сородича: донор — персонаж мира или имя без листа, сколько крови — в диалоге.
 * Кровь переходит (у пьющего — не выше запаса, лишнее пропадает), узы растут по правилам выше, у донора
 * записывается вассал той же ступени. Чужой лист меняет только тот, кому он доступен (ведущий — всегда).
 */
export async function feedFrom(actor) {
  const donors = game.actors.filter(a => a.type === "vampire" && a.id !== actor.id).sort((x, y) => x.name.localeCompare(y.name, "ru"));
  const opts = donors.map(a => `<option value="${a.id}">${foundry.utils.escapeHTML(a.name)} · ${a.system.blood?.value ?? 0}</option>`).join("");
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("BondX.FeedTitle", { name: actor.name }), icon: "fa-solid fa-hand-holding-droplet" }, classes: ["vtm20", "r-dialog"],
    content: `<p class="r-hint">${t("BondX.FeedHint")}</p>
      <label class="r-field"><span>${t("BondX.FeedDonor")}</span><select name="donor"><option value="">${t("BondX.FeedNoSheet")}</option>${opts}</select></label>
      <label class="r-field"><span>${t("BondX.FeedName")}</span><input type="text" name="name" placeholder="${t("BondX.FeedNameHint")}"></label>
      <label class="r-field"><span>${t("BondX.FeedAmount")}</span><input type="number" name="amount" value="1" min="1" max="20"></label>`,
    ok: { label: t("BondX.FeedDo"), callback: (e, b) => ({ donor: b.form.elements.donor.value, name: b.form.elements.name.value.trim(),
      amount: Math.max(1, Math.floor(Number(b.form.elements.amount.value) || 1)) }) },
    rejectClose: false
  });
  if (!res) return;
  const donor = res.donor ? game.actors.get(res.donor) : actorByName(res.name);
  const donorName = donor?.name ?? res.name;
  if (!donorName) return ui.notifications.warn(t("BondX.FeedNoDonor"));
  const night = today(), lines = [];
  // кровь: у донора — сколько есть, у пьющего — до предела запаса
  let amount = res.amount;
  if (donor) {
    amount = Math.min(amount, donor.system.blood?.value ?? 0);
    if (!amount) return ui.notifications.warn(t("BondX.FeedEmpty", { name: donor.name }));
    if (donor.isOwner) await donor.update({ "system.blood.value": donor.system.blood.value - amount });
    else lines.push(t("BondX.FeedDonorLater", { name: donor.name, n: amount }));
  }
  const room = Math.max(0, (actor.system.blood?.max ?? 0) - (actor.system.blood?.value ?? 0)), got = Math.min(amount, room);
  if (got) await actor.update({ "system.blood.value": actor.system.blood.value + got });
  if (got < amount) lines.push(t("BondX.FeedLost", { n: amount - got }));
  // узы пьющего
  const bonds = foundry.utils.deepClone(actor._source.system.bonds ?? []);
  const i = bonds.findIndex(b => b.role === "regnant" && nameKey(b.name) === nameKey(donorName));
  let list = bonds, msg = t("BondX.Step1", { name: donorName });
  // первый глоток — 1-я ступень, даже при полных узах с другим (связей 1–2-й ступени может быть сколько угодно)
  if (i < 0) bonds.push({ name: donorName, rating: 1, role: "regnant", drinks: 1, last: night });
  else ({ list, msg } = applyDrink(bonds, i, night));
  await actor.update({ "system.bonds": list });
  const rating = list.find(b => b.role === "regnant" && nameKey(b.name) === nameKey(donorName))?.rating ?? 1;
  // у донора — вассал той же ступени
  if (donor?.isOwner) {
    const dl = foundry.utils.deepClone(donor._source.system.bonds ?? []);
    const row = dl.find(b => b.role === "thrall" && nameKey(b.name) === nameKey(actor.name));
    if (row) { row.rating = rating; row.last = night; row.drinks = (row.drinks ?? 0) + 1; }
    else dl.push({ name: actor.name, rating, role: "thrall", drinks: 1, last: night });
    await donor.update({ "system.bonds": dl });
  }
  return notice(actor, "fa-hand-holding-droplet", `${t("BondX.FeedDone", { name: actor.name, n: amount, donor: donorName })} ${msg}${lines.length ? ` <span class="r-muted">${lines.join(" ")}</span>` : ""}`);
}

/** Временно сбросить узы: воля, сл. 8, успехов больше, чем глотков (≤ 9), и 1 пункт воли. */
export function resistBond(actor, index) {
  const b = actor.system.bonds?.[index];
  if (!b || b.role !== "regnant") return;
  const need = Math.min(9, Math.max(1, (b.drinks ?? b.rating) + 1));
  return RollDialog.prompt(actor, {
    title: t("BondX.ResistTitle", { name: b.name || "?" }), subtitle: t("BondX.Step", { n: b.rating }),
    trait1: "willpower.permanent", difficulty: 8, willpowerCost: true, lockTraits: true, noWillpower: true,
    diffNote: t("BondX.ResistNeed", { n: need }), kind: "bond", extra: { bondNeed: need, bondName: b.name }
  });
}

const monthsBetween = (a, b) => {
  const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
};

/** Ослабление уз без крови сюзерена; вызывается при наступлении ночи. Возвращает строки для сводки. */
export async function decayBonds(actor) {
  const src = actor._source.system.bonds ?? [];
  if (!src.length) return [];
  const now = today(), will = actor.system.willpower?.permanent ?? 5;
  const period = Math.max(1, 12 - will);
  const lines = [];
  let changed = false;
  const list = [];
  for (const b0 of src) {
    const b = { ...b0 };
    if (b.role === "regnant" && b.last) {
      const steps = Math.floor(monthsBetween(b.last, now) / period);
      if (steps > 0) {
        const from = b.rating;
        b.rating = Math.max(0, b.rating - steps);
        const [y, m, d] = b.last.split("-").map(Number);
        b.last = ymd(new Date(y, m - 1 + steps * period, d));
        changed = true;
        lines.push(b.rating > 0 ? t("BondX.Weakened", { actor: actor.name, name: b.name || "?", from, to: b.rating })
          : t("BondX.Broken", { actor: actor.name, name: b.name || "?" }));
        if (b.rating === 0) continue;
      }
    }
    list.push(b);
  }
  if (changed) await actor.update({ "system.bonds": list });
  return lines;
}
