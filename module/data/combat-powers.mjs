// module/data/combat-powers.mjs
// Силы Дисциплин, которые наносят урон (V20, гл. 4; Rites of the Blood): после удачного броска
// силы на карточке появляется кнопка — урон отмеченной цели (T), иначе выделенному токену.
//   flame      — пламя Тауматургии: урон не кидается, уровни за ход по силе огня, прочность только
//                Стойкостью со сложностью по силе огня, броня не помогает;
//   perSuccess — каждый успех силы — уровень урона (Искусство костей как оружие, Ярость Тора);
//   pool       — урон кидается пулом (Искра, Свечение);
//   spit       — Вкус смерти: +2d10 губительного урона за каждую потраченную кровь;
//   strike     — удар вампира на расстоянии (Землетрясение, Щелчок): Сила + Мощь, лёгкие,
//                + лишние успехи атаки.
// Урон, который не кидается, приходит карточкой «принять урон»: прочность кидает и урон
// записывает владелец цели (или ведущий).

import { SYSTEM_ID, VTM20 } from "../config.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));

export const COMBAT_POWERS = {
  "thaumaturgy|Игра с Огнём": { kind: "flame", soak: [3, 4, 5, 7, 9], dmg: [1, 1, 2, 2, 3] },
  "darkThaumaturgy|Огни Преисподней": { kind: "flame", soak: [3, 4, 5, 7, 9], dmg: [1, 2, 3, 4, 5] },
  "thaumaturgy|Путь Молнии|2": { kind: "pool", pool: 4, type: "lethal", soakDiff: 7 },
  "thaumaturgy|Путь Молнии|3": { kind: "pool", pool: 8, type: "lethal", soakDiff: 8 },
  "thaumaturgy|Путь Молнии|4": { kind: "perSuccess", type: "lethal", soakDiff: 8 },
  "quietus|Вкус смерти": { kind: "spit" },
  "vicissitude|Искусство костей": { kind: "perSuccess", type: "lethal" },
  "potence|Землетрясение": { kind: "strike" },
  "potence|Щелчок": { kind: "strike" }
};

/** Боевая сила по данным броска: { disc, path, level, name }. */
export function combatPowerOf(p) {
  if (!p?.disc) return null;
  if (p.path) return COMBAT_POWERS[`${p.disc}|${p.path}|${p.level}`] ?? COMBAT_POWERS[`${p.disc}|${p.path}`] ?? null;
  return COMBAT_POWERS[`${p.disc}|${p.name}`] ?? null;
}

/** Подпись кнопки на карточке. */
export function combatPowerLabel(cp, power, successes) {
  if (!cp) return "";
  const lvl = Number(power?.level) || 1;
  switch (cp.kind) {
    case "flame": return t("Combat.PowerFlame", { n: cp.dmg[lvl - 1], d: cp.soak[lvl - 1] });
    case "perSuccess": return t("Combat.PowerPerSuccess", { n: successes });
    case "pool": return t("Combat.PowerPool", { n: cp.pool });
    case "spit": return t("Combat.PowerSpit");
    case "strike": return t("Combat.PowerStrike");
  }
  return "";
}

/** Цель: отмеченный токен (T), иначе выделенный чужой. */
function targetOf(actor) {
  const marked = [...(game.user.targets ?? [])].map(tk => tk.actor).filter(Boolean);
  const sel = canvas?.tokens?.controlled?.map(tk => tk.actor).filter(x => x && x !== actor) ?? [];
  return marked[0] ?? sel[0] ?? null;
}

/** Кнопка «урон силы» на карточке броска. */
export async function powerHit(message, state, evaluated) {
  const power = state.extra?.power;
  const cp = combatPowerOf(power);
  if (!cp || evaluated.outcome !== "success") return;
  const actor = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
  const target = targetOf(actor);
  if (!target) return ui.notifications.warn(t("Notify.NoTarget"));
  const { rollDamage } = await import("../dice/roll.mjs");
  const lvl = Number(power.level) || 1;
  const title = power.name || power.path || "";
  const notes = [`<i class="fa-solid fa-crosshairs"></i> ${esc(t("Combat.DamageTo", { name: target.name }))}`];
  switch (cp.kind) {
    case "flame":
      return postFixedDamage(actor, target, { amount: cp.dmg[lvl - 1], type: "aggravated", soakDiff: cp.soak[lvl - 1], fire: true, title });
    case "perSuccess":
      return postFixedDamage(actor, target, { amount: evaluated.successes, type: cp.type, soakDiff: cp.soakDiff ?? 6, title });
    case "pool":
      return rollDamage({ actor, pool: cp.pool, damageType: cp.type, title, target: target.uuid, soakDiff: cp.soakDiff ?? 6, notes });
    case "strike": {
      const pot = actor.discipline("potence"), auto = actor.physicalAuto("strength");
      const pool = actor.system.attributes.strength.total + (auto ? 0 : pot) + Math.max(0, evaluated.successes - 1);
      return rollDamage({ actor, pool, auto, damageType: "bashing", title, target: target.uuid, notes });
    }
    case "spit": {
      const max = Math.min(actor.system.blood?.value ?? 0, actor.system.blood?.perTurn ?? 1);
      if (max < 1) return ui.notifications.warn(t("Notify.NoBlood", { name: actor.name }));
      const opts = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1} → ${2 * (i + 1)}d10</option>`).join("");
      const n = await foundry.applications.api.DialogV2.prompt({
        window: { title: title, icon: "fa-solid fa-droplet" }, classes: ["vtm20", "r-dialog"],
        content: `<div class="r-form"><label class="r-field"><span>${esc(t("Combat.SpitBlood"))}</span><select name="n">${opts}</select></label></div>`,
        ok: { label: t("Roll.RollDamage"), callback: (e, b) => Number(b.form.elements.n.value) || 1 }, rejectClose: false
      });
      if (!n || !(await actor.spendBlood(n, { reason: title }))) return;
      return rollDamage({ actor, pool: 2 * n, damageType: "aggravated", title, target: target.uuid, notes });
    }
  }
}

/** Урон без броска (пламя, успехи силы): карточка, по которой владелец цели кидает прочность. */
async function postFixedDamage(actor, target, { amount, type, soakDiff, fire = false, title }) {
  if (amount < 1) return;
  const typeLabel = game.i18n.localize(VTM20.damageTypes[type]?.label ?? type);
  const content = `<div class="r-roll-card r-combat-card is-hit">
    <header class="r-cc-head"><img src="${esc(actor?.img)}" alt=""><b>${esc(actor?.name)}</b><i class="fa-solid ${fire ? "fa-fire" : "fa-burst"}"></i><b>${esc(target.name)}</b><img src="${esc(target.img)}" alt=""></header>
    <p class="r-cc-line">${esc(title)} · <b>${amount}</b> · ${esc(typeLabel)}</p>
    <div class="r-card-hint">${esc(t(fire ? "Combat.FlameNote" : "Combat.FixedNote", { d: soakDiff }))}</div>
    <div class="r-card-buttons"><button type="button" data-r-action="fixedDamage"><i class="fa-solid fa-shield-halved"></i> ${esc(t("Roll.ApplySoak"))}</button></div>
  </div>`;
  return ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [SYSTEM_ID]: { fixedDamage: { target: target.uuid, amount, type, soakDiff, fire } } } });
}

/** Принять урон по карточке: прочность (у огня — только Стойкость) и запись. */
export async function applyFixedDamage(message) {
  const d = message.getFlag(SYSTEM_ID, "fixedDamage");
  if (!d || d.done) return ui.notifications.info(t("Combat.AlreadyResolved"));
  const target = await foundry.utils.fromUuid(d.target);
  if (!target) return;
  if (!target.isOwner) return ui.notifications.warn(t("Notify.NotOwner", { name: target.name }));
  const { soakAndApply } = await import("../dice/roll.mjs");
  if (message.isOwner) await message.setFlag(SYSTEM_ID, "fixedDamage", { ...d, done: true });
  return soakAndApply(target, d.amount, d.type, { difficulty: d.soakDiff, armor: !d.fire });
}
