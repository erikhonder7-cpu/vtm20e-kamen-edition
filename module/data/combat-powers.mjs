// module/data/combat-powers.mjs
// Силы Дисциплин, которые наносят урон (V20, гл. 4; Rites of the Blood): после удачного броска
// силы на карточке появляется кнопка — урон отмеченной цели (T), иначе выделенному токену.
//   flame      — пламя Тауматургии: урон не кидается, уровни за ход по силе огня, прочность только
//                Стойкостью со сложностью по силе огня, броня не помогает;
//   perSuccess — каждый успех силы — уровень урона (Искусство костей как оружие, Ярость Тора);
//   pool       — урон кидается пулом (Искра, Свечение);
//   spit       — Вкус смерти: +2d10 губительного урона за каждую потраченную кровь;
//   strike     — удар вампира на расстоянии (Землетрясение, Щелчок): Сила + Мощь, лёгкие,
//                + лишние успехи атаки;
//   fixed      — урон не кидается: amount уровней (Ярость Купалы, Тепловая волна, лава);
//   perSuccess + mult — mult уровней за успех (Голод Марены); drain / drainPer — вампир теряет кровь (Тепловая волна, Марена).
// Урон, который не кидается, приходит карточкой «принять урон»: прочность кидает и урон
// записывает владелец цели (или ведущий).

import { SYSTEM_ID, VTM20 } from "../config.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));

const COMBAT_POWERS = {
  "thaumaturgy|Игра с Огнём": { kind: "flame", soak: [3, 4, 5, 7, 9], dmg: [1, 1, 2, 2, 3] },
  "darkThaumaturgy|Огни Преисподней": { kind: "flame", soak: [3, 4, 5, 7, 9], dmg: [1, 2, 3, 4, 5] },
  "thaumaturgy|Управление Погодой|5": { kind: "pool", pool: 10, type: "lethal", pierce: 99 },
  "thaumaturgy|Путь Молнии|2": { kind: "pool", pool: 4, type: "lethal", soakDiff: 7 },
  "thaumaturgy|Путь Молнии|3": { kind: "pool", pool: 8, type: "lethal", soakDiff: 8 },
  "thaumaturgy|Путь Молнии|4": { kind: "perSuccess", type: "lethal", soakDiff: 8 },
  "quietus|Вкус смерти": { kind: "spit" },
  // Путь Крови 5, Котёл крови: каждый успех — 1 кровь вскипает и 1 губительное (только Стойкостью)
  "thaumaturgy|Путь Крови|5": { kind: "perSuccess", type: "aggravated", boil: true },
  // Искусство костей как оружие (сл. 7): 5+ успехов — рёбра в сердце: смертный умирает, вампир теряет половину крови
  "vicissitude|Искусство костей": { kind: "perSuccess", type: "lethal", heart: 5 },
  "potence|Землетрясение": { kind: "strike" },
  // ── Колдовство (V20 / Rites of the Blood / Dark Ages, справочник пользователя): урон по цели после удачного броска ──
  "koldunism|Уклад Земли (Выносливость)|1": { kind: "perSuccess", type: "lethal" },                   // Зыбкая твердь как атака
  "koldunism|Уклад Земли (Выносливость)|3": { kind: "fixed", amount: 1, type: "lethal", soakDiff: 7 }, // Голодное чрево — за ход
  "koldunism|Уклад Земли (Выносливость)|5": { kind: "fixed", amount: 10, type: "lethal" },             // Ярость Купалы
  "koldunism|Уклад Ветра (Восприятие)|5": { kind: "fixed", amount: 10, type: "lethal" },               // Гроза: молния (ещё 1 Воля и Восприятие + Оккультизм)
  "koldunism|Уклад Огня (Манипуляция)|2": { kind: "perSuccess", type: "aggravated" },                 // Возгорание: только уклонение
  "koldunism|Уклад Огня (Манипуляция)|3": { kind: "fixed", amount: 3, type: "aggravated", soakDiff: 9 }, // Стена магмы — касание
  "koldunism|Уклад Огня (Манипуляция)|4": { kind: "fixed", amount: 5, type: "lethal", drain: 5 },      // Тепловая волна
  "koldunism|Уклад Огня (Манипуляция)|5": { kind: "fixed", amount: 3, type: "aggravated" },            // Извержение — касание лавы
  "koldunism|Путь Скорби|5": { kind: "perSuccess", type: "bashing", mult: 2, drainPer: 1 },            // Голод Марены
  "koldunism|Путь Скорбей|5": { kind: "perSuccess", type: "bashing", mult: 2, drainPer: 1 },
  "koldunism|Трансильванская крайна|3": { kind: "pool", pool: 5, type: "bashing" },                   // Берега Баски — за ход
  "koldunism|Трансильванская крайна|5": { kind: "pool", pool: 10, type: "lethal" },                   // Беспокойный Медиаш — за ход
  "koldunism|Беловежская крайна|4": { kind: "fixed", amount: 2, type: "lethal", soakDiff: 7 },         // Пасть Джабелека — за ход
  // Revised (Blood Magic: Secrets of Thaumaturgy, Clanbook: Tzimisce)
  "koldunism|Путь Земли|5": { kind: "pool", pool: 10, type: "lethal" },                                // Беспокойная душа Дракулы
  "koldunism|Путь Огня|2": { kind: "fixed", amount: 3, type: "aggravated" },                           // Пробуждение расплавленной породы
  "koldunism|Путь Огня|3": { kind: "fixed", amount: 3, type: "aggravated" },                           // Врата магмы — касание
  "koldunism|Путь Огня|4": { kind: "fixed", amount: 5, type: "lethal", drain: 5 },                     // Жаркая волна
  "koldunism|Путь Огня|5": { kind: "fixed", amount: 3, type: "aggravated" },                           // Вулканический взрыв (только Стойкость)
  "koldunism|Путь Скорби (Revised)|5": { kind: "perSuccess", type: "bashing", mult: 2, drainPer: 1 },  // Голод Марены
  // Тёмные века, классика (Players Guide to High Clans)
  "koldunism|Путь Земли (Тёмные века, классика)|1": { kind: "perSuccess", type: "lethal" },
  "koldunism|Путь Земли (Тёмные века, классика)|3": { kind: "fixed", amount: 1, type: "lethal", soakDiff: 7 },
  "koldunism|Путь Земли (Тёмные века, классика)|5": { kind: "pool", pool: 10, type: "lethal" },
  "koldunism|Путь Ветра (Тёмные века, классика)|5": { kind: "pool", pool: 10, type: "lethal" },       // молния
  "koldunism|Путь Огня (Тёмные века, классика)|2": { kind: "perSuccess", type: "aggravated" },
  "koldunism|Путь Огня (Тёмные века, классика)|3": { kind: "fixed", amount: 3, type: "aggravated", soakDiff: 9 },
  "koldunism|Путь Огня (Тёмные века, классика)|4": { kind: "fixed", amount: 5, type: "lethal", drain: 5 },
  "koldunism|Путь Огня (Тёмные века, классика)|5": { kind: "fixed", amount: 3, type: "aggravated", soakDiff: 9 },
  "potence|Щелчок": { kind: "strike" }
};

/** Боевая сила по данным броска: { disc, path, level, name }. */
export function combatPowerOf(p) {
  if (!p?.disc || p.noHit) return null;
  if (p.path) return COMBAT_POWERS[`${p.disc}|${p.path}|${p.level}`] ?? COMBAT_POWERS[`${p.disc}|${p.path}`] ?? null;
  return COMBAT_POWERS[`${p.disc}|${p.name}`] ?? null;
}

/** Подпись кнопки на карточке. */
export function combatPowerLabel(cp, power, successes) {
  if (!cp) return "";
  const lvl = Number(power?.level) || 1;
  switch (cp.kind) {
    case "flame": return t("Combat.PowerFlame", { n: cp.dmg[lvl - 1], d: cp.soak[lvl - 1] });
    case "perSuccess": return t("Combat.PowerPerSuccess", { n: successes * (cp.mult ?? 1) });
    case "fixed": return t("Combat.PowerFixed", { n: cp.amount });
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
      return postFixedDamage(actor, target, { amount: evaluated.successes * (cp.mult ?? 1), type: cp.type, soakDiff: cp.soakDiff ?? 6, title, boil: !!cp.boil,
        heart: !!cp.heart && evaluated.successes >= cp.heart, drain: (cp.drainPer ?? 0) * evaluated.successes });
    case "fixed":
      return postFixedDamage(actor, target, { amount: cp.amount, type: cp.type, soakDiff: cp.soakDiff ?? 6, title, drain: cp.drain ?? 0 });
    case "pool":
      return rollDamage({ actor, pool: cp.pool, damageType: cp.type, title, target: target.uuid, soakDiff: cp.soakDiff ?? 6, notes, supernatural: true, pierce: cp.pierce ?? 0 });
    case "strike": {
      const pot = actor.discipline("potence"), auto = actor.physicalAuto("strength");
      const pool = actor.system.attributes.strength.total + (auto ? 0 : pot) + Math.max(0, evaluated.successes - 1);
      return rollDamage({ actor, pool, auto, damageType: "bashing", title, target: target.uuid, notes, supernatural: true });
    }
    case "spit": {
      const max = Math.min(actor.system.blood?.value ?? 0, (actor.system.blood?.perTurn ?? 1) - actor.bloodSpentThisTurn);
      if (max < 1) return ui.notifications.warn(t("Notify.NoBlood", { name: actor.name }));
      const opts = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1} → ${2 * (i + 1)}d10</option>`).join("");
      const n = await foundry.applications.api.DialogV2.prompt({
        window: { title: title, icon: "fa-solid fa-droplet" }, classes: ["vtm20", "r-dialog"],
        content: `<div class="r-form"><label class="r-field"><span>${esc(t("Combat.SpitBlood"))}</span><select name="n">${opts}</select></label></div>`,
        ok: { label: t("Roll.RollDamage"), callback: (e, b) => Number(b.form.elements.n.value) || 1 }, rejectClose: false
      });
      if (!n || !(await actor.spendBlood(n, { reason: title }))) return;
      return rollDamage({ actor, pool: 2 * n, damageType: "aggravated", title, target: target.uuid, notes, supernatural: true });
    }
  }
}

/** Урон без броска (пламя, успехи силы): карточка, по которой владелец цели кидает прочность. */
export async function postFixedDamage(actor, target, { amount, type, soakDiff, fire = false, title, boil = false, heart = false, internal = false, drain = 0 }) {
  if (amount < 1) return;
  const typeLabel = game.i18n.localize(VTM20.damageTypes[type]?.label ?? type);
  const content = `<div class="r-roll-card r-combat-card is-hit">
    <header class="r-cc-head"><img src="${esc(actor?.img)}" alt=""><b>${esc(actor?.name)}</b><i class="fa-solid ${fire ? "fa-fire" : "fa-burst"}"></i><b>${esc(target.name)}</b><img src="${esc(target.img)}" alt=""></header>
    <p class="r-cc-line">${esc(title)} · <b>${amount}</b> · ${esc(typeLabel)}</p>
    <div class="r-card-hint">${esc(t(fire ? "Combat.FlameNote" : "Combat.FixedNote", { d: soakDiff }))}${heart ? ` ${esc(t("Combat.BoneHeart"))}` : ""}${drain ? ` ${esc(t("Combat.DrainNote", { n: drain }))}` : ""}</div>
    <div class="r-card-buttons"><button type="button" data-r-action="fixedDamage"><i class="fa-solid fa-shield-halved"></i> ${esc(t("Roll.ApplySoak"))}</button></div>
  </div>`;
  return ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [SYSTEM_ID]: { fixedDamage: { target: target.uuid, amount, type, soakDiff, fire, supernatural: true, boil, heart, internal, drain } } } });
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
  // Тепловая волна, Голод Марены: вампир теряет кровь независимо от поглощения
  if (d.drain && target.isVampire && target.system.blood?.value) await target.update({ "system.blood.value": Math.max(0, target.system.blood.value - d.drain) });
  // Котёл крови: столько же крови вскипает и пропадает
  if (d.boil && target.system.blood?.value) await target.update({ "system.blood.value": Math.max(0, target.system.blood.value - d.amount) });
  // Искусство костей, 5+ успехов: рёбра пробивают сердце — вампир теряет половину крови, смертный умирает
  if (d.heart) {
    if (target.isVampire) {
      const b = target.system.blood?.value ?? 0;
      if (b) await target.update({ "system.blood.value": b - Math.ceil(b / 2) });
    } else if (["mortal", "ghoul", "hunter"].includes(target.type)) {
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }), content: `<div class="r-notice"><i class="fa-solid fa-heart-crack"></i> ${esc(t("Combat.BoneHeartDead", { name: target.name }))}</div>` });
      return target.applyDamage(8, "lethal");
    }
  }
  return soakAndApply(target, d.amount, d.type, { difficulty: d.soakDiff, armor: !d.fire && !d.internal, supernatural: !!d.supernatural, fire: !!d.fire });
}
