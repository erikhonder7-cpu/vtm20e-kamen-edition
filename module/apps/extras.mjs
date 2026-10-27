// module/apps/extras.mjs
// Статисты и толпы (план 4). Статист — обычный актёр (смертный, существо, гуль, Сородич) с флагом extra
// и коротким листом: только готовые пулы — атака, урон, уклонение, внимание, воля, — здоровье и оружие.
// Толпа — статист с численностью (extra.mob): один бросок на всех и общее здоровье по 3 уровня на человека;
// заполнился отрезок — один выбыл. Бонус толпы к атаке — +1 за каждого на ногах сверх первого, не больше +5
// (правило системы, не из книги). Полный лист — по кнопке; «Разделить» превращает толпу в отдельных статистов.

import { SYSTEM_ID, SYSTEM_PATH, VTM20 } from "../config.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const { HandlebarsApplicationMixin } = foundry.applications.api;

export const EXTRA_SHEET = `${SYSTEM_ID}.ExtraSheet`;
/** Уровней здоровья на одного человека толпы и предел бонуса толпы. */
export const MOB_LEVELS = 3, MOB_BONUS_MAX = 5;

export const extraOf = actor => actor?.getFlag?.(SYSTEM_ID, "extra") ?? null;
const mobSize = actor => Number(extraOf(actor)?.mob) || 0;

/** Толпа: сколько всего, сколько на ногах, бонус к атаке. null — не толпа. */
export function mobState(actor) {
  const size = mobSize(actor);
  if (!size) return null;
  const damage = Math.clamp(Number(extraOf(actor).damage) || 0, 0, size * MOB_LEVELS);
  const alive = size - Math.floor(damage / MOB_LEVELS);
  return { size, damage, alive, total: size * MOB_LEVELS, bonus: Math.clamp(alive - 1, 0, MOB_BONUS_MAX), shaken: alive > 0 && alive <= size / 2 };
}
/** Бонус толпы к атаке (combat.mjs). */
export const mobBonus = actor => mobState(actor)?.bonus ?? 0;

/** Сделать статистом или толпой: флаг и короткий лист по умолчанию для этого актёра. */
export async function makeExtra(actor, { mob = 0 } = {}) {
  await actor.update({ [`flags.${SYSTEM_ID}.extra`]: { mob: Math.max(0, mob), damage: 0 }, "flags.core.sheetClass": EXTRA_SHEET });
}
/** Вернуть обычный лист. */
export async function unmakeExtra(actor) {
  await actor.update({ [`flags.${SYSTEM_ID}.-=extra`]: null, "flags.core.sheetClass": "" });
}

/** Урон толпе: заполняет общую шкалу; выбывшие — в карточку. Вызывается из actor.applyDamage. */
export async function applyMobDamage(actor, amount, type) {
  const m = mobState(actor);
  const damage = Math.min(m.total, m.damage + amount);
  await actor.setFlag(SYSTEM_ID, "extra", { ...extraOf(actor), damage });
  const after = mobState(actor), down = m.alive - after.alive;
  const dmg = game.i18n.localize(VTM20.damageTypes[type]?.label ?? "");
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="r-notice"><i class="fa-solid fa-heart-crack"></i> ${t("Extra.MobHit", { n: amount, type: dmg, alive: after.alive, size: after.size })}${down ? ` <b class="r-fate">${t("Extra.MobDown", { n: down })}</b>` : ""}${after.shaken && !m.shaken ? ` <b class="r-fate">${t("Extra.MobShaken")}</b>` : ""}</div>` });
}

/** Оружие актёра с пулом и уроном — как на листе (В3). */
function weaponsOf(actor) {
  const s = actor.system, str = s.attributes.strength.total;
  return actor.items.filter(i => i.type === "weapon" && i.system.equipped !== false).map(i => {
    const w = i.system, kind = VTM20.weaponKinds[w.kind] ?? VTM20.weaponKinds.melee;
    return { name: i.name, pool: s.attributes[kind.attribute].total + (s.abilities[kind.ability]?.value ?? 0),
      dmg: (w.strength ? str + (actor.physicalDisciplineBonus?.("strength") ?? 0) : 0) + w.damage, type: w.damageType,
      typeLabel: game.i18n.localize(VTM20.damageTypes[w.damageType]?.short ?? ""), formula: w.strength ? `${t("Attr.strength")} + ${w.damage}` : String(w.damage),
      range: w.range };
  });
}

/** Короткий лист статиста и толпы. */
export class ExtraSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-extra-sheet"],
    position: { width: 540 },
    window: { resizable: true },
    actions: {
      attack: ExtraSheet.#onAttack, dodge: ExtraSheet.#onDodge, perceive: ExtraSheet.#onPerceive, will: ExtraSheet.#onWill,
      full: ExtraSheet.#onFull, normal: ExtraSheet.#onNormal, mob: ExtraSheet.#onMob, size: ExtraSheet.#onSize, hit: ExtraSheet.#onHit, split: ExtraSheet.#onSplit
    }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/actor/extra.hbs` } };

  get title() { return t(mobSize(this.actor) ? "Extra.MobTitle" : "Extra.Title", { name: this.actor.name }); }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const a = this.actor, s = a.system, m = mobState(a);
    const ws = weaponsOf(a);
    const brawl = { name: t("Extra.Brawl"), pool: s.attributes.dexterity.total + (s.abilities.brawl?.value ?? 0), dmg: s.attributes.strength.total,
      type: "bashing", typeLabel: game.i18n.localize(VTM20.damageTypes.bashing.short) };
    const best = [...ws, brawl].sort((x, y) => y.pool - x.pool)[0];
    const h = a._source.system.health ?? { bashing: 0, lethal: 0, aggravated: 0 };
    const marks = [...Array(h.aggravated).fill("✱"), ...Array(h.lethal).fill("X"), ...Array(h.bashing).fill("/")];
    const boxes = m
      ? Array.from({ length: m.total }, (_, i) => ({ i, on: i < m.damage, mark: i < m.damage ? "X" : "", gap: i > 0 && i % MOB_LEVELS === 0 }))
      : Array.from({ length: 7 }, (_, i) => ({ i, on: !!marks[i], mark: marks[i] ?? "", gap: false }));
    return {
      ...ctx, actor: a, mob: m, editable: this.isEditable, isGM: game.user.isGM,
      kind: a.type === "vampire" ? (a.clanLabel || t("Extra.Kindred")) : game.i18n.localize(CONFIG.Actor.typeLabels?.[a.type] ?? a.type),
      pools: [
        { key: "attack", label: t("Extra.Attack"), n: best.pool + (m?.bonus ?? 0), sub: m?.bonus ? t("Extra.MobPlus", { base: best.pool, n: m.bonus }) : best.name, hot: true },
        { key: "damage", label: t("Extra.Damage"), n: best.dmg, sub: best.typeLabel },
        { key: "dodge", label: t("Extra.Dodge"), n: s.attributes.dexterity.total + (s.abilities.athletics?.value ?? 0), sub: t("Extra.DexAth") },
        ...(m ? [] : [{ key: "perceive", label: t("Extra.Perceive"), n: s.attributes.perception.total + (s.abilities.alertness?.value ?? 0), sub: t("Extra.PerAle") }]),
        { key: "will", label: t("Extra.Will"), n: s.willpower.permanent, sub: m?.shaken ? t("Extra.Shaken") : `${s.willpower.temporary} / ${s.willpower.permanent}` }
      ],
      boxes, weapons: ws,
      health: m ? t("Extra.MobHealth", { n: MOB_LEVELS }) : t("Extra.Health", { soak: a.soakPool?.("bashing") ?? s.attributes.stamina.total }),
      healthNote: m ? t("Extra.MobNote", { alive: m.alive, size: m.size, down: m.size - m.alive }) : (s.health?.penalty ? t("Extra.Penalty", { n: s.health.penalty }) : t("Extra.Unhurt"))
    };
  }

  static #roll(actor, cfg) { return game.vtm20.RollDialog.prompt(actor, cfg); }
  static #onAttack() { return game.vtm20.openAttack(this.actor); }
  static #onDodge() { return ExtraSheet.#roll(this.actor, { trait1: "attributes.dexterity", trait2: "abilities.athletics", title: t("Extra.Dodge") }); }
  static #onPerceive() { return ExtraSheet.#roll(this.actor, { trait1: "attributes.perception", trait2: "abilities.alertness", title: t("Extra.Perceive") }); }
  static #onWill() { return ExtraSheet.#roll(this.actor, { trait1: "willpower.permanent", title: t(mobSize(this.actor) ? "Extra.Morale" : "Extra.Will") }); }
  static async #onFull() {
    const { VtMActorSheet } = await import("../sheets/actor-sheet.mjs");
    new VtMActorSheet({ document: this.actor }).render({ force: true });
  }
  static #onNormal() { return unmakeExtra(this.actor); }
  static async #onMob() {
    if (mobSize(this.actor)) return this.actor.setFlag(SYSTEM_ID, "extra", { ...extraOf(this.actor), mob: 0, damage: 0 });
    const size = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("Extra.MakeMob") }, classes: ["vtm20", "r-dialog"],
      content: `<div class="r-form"><label class="r-field"><span>${t("Extra.Size")}</span><input type="number" name="size" value="6" min="2" max="20"></label></div>`,
      ok: { label: t("Extra.MakeMob"), callback: (e, b) => Math.clamp(Number(b.form.elements.size.value) || 6, 2, 20) }, rejectClose: false
    });
    if (size) await this.actor.setFlag(SYSTEM_ID, "extra", { ...extraOf(this.actor), mob: size, damage: 0 });
  }
  static async #onSize(event, target) {
    const x = extraOf(this.actor), size = Math.clamp(mobSize(this.actor) + Number(target.dataset.d), 2, 20);
    await this.actor.setFlag(SYSTEM_ID, "extra", { ...x, mob: size, damage: Math.min(Number(x.damage) || 0, size * MOB_LEVELS) });
  }
  /** Щелчок по клетке здоровья: толпе — до этой клетки (повторный — на одну меньше); статисту — обычное лечение листа не трогаем. */
  static async #onHit(event, target) {
    const m = mobState(this.actor);
    if (!m) return;
    const i = Number(target.dataset.i) + 1;
    await this.actor.setFlag(SYSTEM_ID, "extra", { ...extraOf(this.actor), damage: m.damage === i ? i - 1 : i });
  }
  /** Разделить толпу: столько статистов, сколько на ногах; сама толпа удаляется. */
  static async #onSplit() {
    const a = this.actor, m = mobState(a);
    if (!m || !game.user.isGM) return;
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Extra.Split") }, content: `<p>${t("Extra.SplitConfirm", { n: m.alive, name: a.name })}</p>`, rejectClose: false });
    if (!ok) return;
    const base = a.toObject();
    delete base._id;
    const list = Array.from({ length: m.alive }, (_, k) => foundry.utils.mergeObject(foundry.utils.deepClone(base), {
      name: `${a.name} ${k + 1}`, [`flags.${SYSTEM_ID}.extra`]: { mob: 0, damage: 0 }, "flags.core.sheetClass": EXTRA_SHEET }));
    await Actor.createDocuments(list);
    await a.delete();
  }
}

/** Регистрация листа статиста (не по умолчанию: его ставит makeExtra). */
export function registerExtras() {
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, ExtraSheet, { types: ["mortal", "hunter", "creature", "ghoul", "vampire"], makeDefault: false, label: "VTM20.Sheets.Extra" });
}
