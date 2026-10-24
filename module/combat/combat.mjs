// module/combat/combat.mjs
// Бой по V20 (V20_Основные_правила/04): атака оружием или манёвром ближнего боя
// с модификаторами (фланг и тыл, прицеливание, численное превосходство, вслепую,
// укрытие и дальность для стрельбы, множественные действия), защиты (уклонение,
// блок, парирование — каждая следующая за ход на 1 куб меньше).
//
// Атака кидается обычной карточкой «attack»: успехи сверх первого прибавляются
// к урону, кнопка «Бросить урон» на карточке — как у оружия с листа.

import { VTM20, SYSTEM_PATH, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { rollPool, odds, chancesView } from "../dice/roll.mjs";
import { RollDialog } from "../dice/dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

/**
 * Манёвры ближнего боя без оружия (04, «Манёвры ближнего боя»).
 * dice — «точность» (кубы к атаке), diff — к сложности, dmg — к Силе (null — урона нет).
 */
export const MANEUVERS = {
  punch:  { attr: "dexterity", ability: "brawl", dice: 0, diff: 0, dmg: 0,    type: "bashing",    icon: "fa-hand-fist" },
  kick:   { attr: "dexterity", ability: "brawl", dice: 0, diff: 1, dmg: 1,    type: "bashing",    icon: "fa-shoe-prints" },
  claws:  { attr: "dexterity", ability: "brawl", dice: 0, diff: 0, dmg: 1,    type: "aggravated", icon: "fa-paw", vampire: true, fangs: true },
  bite:   { attr: "dexterity", ability: "brawl", dice: 1, diff: 0, dmg: 1,    type: "aggravated", icon: "fa-tooth", vampire: true, fangs: true },
  clinch: { attr: "strength",  ability: "brawl", dice: 0, diff: 0, dmg: 0,    type: "bashing",    icon: "fa-people-pulling" },
  hold:   { attr: "strength",  ability: "brawl", dice: 0, diff: 0, dmg: null, type: "bashing",    icon: "fa-hands" },
  tackle: { attr: "strength",  ability: "brawl", dice: 0, diff: 1, dmg: 1,    type: "bashing",    icon: "fa-person-falling-burst" },
  sweep:  { attr: "dexterity", ability: "brawl", dice: 0, diff: 1, dmg: 0,    type: "bashing",    icon: "fa-person-falling" },
  disarm: { attr: "dexterity", ability: "melee", dice: 0, diff: 1, dmg: 0,    type: "bashing",    icon: "fa-hand-holding" }
};

/** Защитные манёвры: встречная проверка против атаки. */
export const DEFENSES = {
  dodge: { attr: "dexterity", ability: "athletics", icon: "fa-person-running" },
  block: { attr: "dexterity", ability: "brawl",     icon: "fa-shield-halved" },
  parry: { attr: "dexterity", ability: "melee",     icon: "fa-khanda" }
};

/** Прицеливание: сложность и урон (04). */
const AIM = { none: [0, 0], medium: [1, 0], small: [2, 1], tiny: [3, 2] };

/** Экипированное оружие персонажа для HUD и окна атаки. */
export function weaponsOf(actor) {
  return actor.items.filter(i => i.type === "weapon" && i.system.equipped !== false).map(i => {
    const w = i.system;
    const kind = VTM20.weaponKinds[w.kind] ? w.kind : "melee";
    return { id: i.id, name: i.name, img: i.img, kind, ranged: kind === "firearms" || kind === "thrown",
      damage: w.damage, strength: w.strength, damageType: w.damageType, difficulty: w.difficulty, pierce: w.pierce ?? 0,
      label: `${w.strength ? `${t("Attr.strength")} + ` : ""}${w.damage}` };
  });
}

/* ── Счёт защит за ход ────────────────────────────────────────────────── */

const defenseLog = new Map();
/** Номер защиты этого персонажа в текущем ходу боя (1 — первая). */
function nextDefense(actor) {
  const c = game.combat;
  const key = c ? `${c.id}:${c.round}` : `free:${Math.floor(Date.now() / 30000)}`;
  const rec = defenseLog.get(actor.id);
  const n = rec?.key === key ? rec.n + 1 : 1;
  defenseLog.set(actor.id, { key, n });
  return n;
}

/** Защита: уклонение, блок или парирование. Каждая следующая за ход — −1 куб (04). */
export function openDefense(actor, kind = "dodge", { onRolled = null, subtitle = null } = {}) {
  const d = DEFENSES[kind] ?? DEFENSES.dodge;
  const n = nextDefense(actor);
  return RollDialog.prompt(actor, {
    onRolled,
    title: t(`Combat.Defense.${kind}`), subtitle: subtitle ?? t("Combat.DefenseSub"),
    trait1: `attributes.${d.attr}`, trait2: `abilities.${d.ability}`,
    bonus: n > 1 ? -(n - 1) : 0, kind: "defense", lockTraits: true,
    diffNote: [n > 1 ? t("Combat.DefenseNth", { n }) : "", kind === "block" ? t("Combat.BlockNote") : "", t("Combat.DefenseNote")].filter(Boolean).join(" ")
  });
}

/* ── Окно атаки ───────────────────────────────────────────────────────── */

export function openAttack(actor, { weapon = null, maneuver = null } = {}) {
  return new AttackDialog(actor, { weapon, maneuver }).render({ force: true });
}

export class AttackDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-roll-dialog", "r-attack-dialog"],
    tag: "form",
    window: { title: "VTM20.Combat.Attack", icon: "fa-solid fa-khanda" },
    position: { width: 520 },
    form: { handler: AttackDialog.#onSubmit, closeOnSubmit: true, submitOnChange: false },
    actions: { pick: AttackDialog.#onPick, bump: AttackDialog.#onBump }
  };

  static PARTS = { form: { template: `${SYSTEM_PATH}/templates/dice/attack-dialog.hbs` } };

  constructor(actor, { weapon, maneuver }) {
    super({ window: { title: `${t("Combat.Attack")}: ${actor.name}` } });
    this.actor = actor;
    const first = weaponsOf(actor)[0];
    const marked = [...(game.user.targets ?? [])].map(tk => tk.actor).filter(x => x && x !== actor);
    this.v = {
      foe: marked[0]?.uuid ?? "",
      pick: weapon ? `w:${weapon}` : maneuver ? `m:${maneuver}` : first ? `w:${first.id}` : "m:punch",
      position: "front", aim: "none", foes: 0, blind: false, target: "normal",
      range: "normal", cover: 0, actions: 1, bonus: 0, diffAdj: 0,
      specialty: false, willpower: false, physical: true, wounds: true,
      messageMode: game.settings.get("core", "messageMode")
    };
  }

  /** Что выбрано: оружие или манёвр, с готовыми чертами, сложностью и уроном. */
  get choice() {
    const a = this.actor, s = a.system, [kind, id] = this.v.pick.split(":");
    const str = s.attributes.strength.total + a.physicalDisciplineBonus("strength");
    const auto = a.physicalAuto("strength");
    const fx = s.fx ?? {};
    // Ласка Ваала (Упокоение 4): ихор на клинке или ногтях — урон губительный, стрельба не в счёт
    const venom = (type, ranged) => fx.venom > 0 && !ranged && type !== "aggravated";
    if (kind === "w") {
      const w = weaponsOf(a).find(x => x.id === id);
      if (w) {
        const k = VTM20.weaponKinds[w.kind];
        const v = venom(w.damageType, w.ranged);
        return { name: w.name, attr: k.attribute, ability: k.ability, dice: 0, diff: w.difficulty - 6, ranged: w.ranged,
          dmg: (w.strength ? str : 0) + w.damage, auto: w.strength && !w.ranged ? auto : 0, type: v ? "aggravated" : w.damageType, venom: v,
          fangs: false, note: v ? t("Combat.VenomNote", { n: fx.venom }) : "", pierce: w.pierce ?? 0, bullet: w.kind === "firearms" };
      }
    }
    const m = MANEUVERS[id] ?? MANEUVERS.punch;
    // Чудовищный облик: +1 куб к урону в драке; Шкура гадюки: +1 куб к укусу (data/effects.mjs)
    const extra = m.dmg == null ? 0 : (m.ability === "brawl" ? fx.brawlDamage ?? 0 : 0) + (id === "bite" ? fx.biteDamage ?? 0 : 0);
    const v = m.dmg != null && ["punch", "claws"].includes(id) && venom(m.type, false);
    return { name: t(`Combat.M.${id}`), attr: m.attr, ability: m.ability, dice: m.dice, diff: m.diff, ranged: false,
      dmg: m.dmg == null ? null : str + m.dmg + extra, auto: m.dmg == null ? 0 : auto, type: v ? "aggravated" : m.type, venom: v, fangs: !!m.fangs,
      note: [t(`Combat.MNote.${id}`), v ? t("Combat.VenomNote", { n: fx.venom }) : ""].filter(Boolean).join(" "), pierce: 0, bullet: false };
  }

  compute() {
    const a = this.actor, v = this.v, c = this.choice;
    const bd = [];
    let pool = 0;
    const add = (label, n) => { if (n) { pool += n; bd.push({ label, value: n }); } };
    add(game.i18n.localize(VTM20.attributes[c.attr].label), a.system.attributes[c.attr].total);
    const ab = a.system.abilities[c.ability]?.value ?? 0;
    bd.push({ label: game.i18n.localize(VTM20.abilities[c.ability].label), value: ab }); pool += ab;
    const phys = a.physicalDisciplineBonus(c.attr);
    if (phys && v.physical) add(Codex.disciplineLabel(c.attr === "strength" ? "potence" : "celerity"), phys);
    // Мощь за кровь: автоуспехи атаки Силой (захват, подсечка…)
    const attackAuto = v.physical ? a.physicalAuto(c.attr) : 0;
    add(t("Combat.Accuracy"), c.dice);
    add(t(`Combat.Pos.${v.position}`), { front: 0, flank: 1, rear: 2 }[v.position]);
    if (v.target === "held") add(t("Combat.Target.held"), 2);
    add(t("Roll.Modifier"), v.bonus);
    if (v.wounds) add(t("Roll.Wounds"), a.system.health.penalty);
    if (c.attr === "dexterity" && a.armor.penalty) add(t("Roll.ArmorPenalty"), -a.armor.penalty);
    if (v.actions > 1) {
      const part = Math.floor(Math.max(0, pool) / v.actions);
      bd.push({ label: t("Roll.MultiActions", { n: v.actions }), value: part - pool }); pool = part;
    }
    // Сложность: база 6 (стрельба: в упор 4, до двойной дальности 8)
    let diff = 6 + c.diff;
    if (c.ranged) diff = { point: 4, normal: 6 + c.diff, long: 8 }[v.range];
    const notes = [];
    const [aimDiff, aimDmg] = AIM[v.aim];
    diff += aimDiff;
    diff += Math.min(4, v.foes);
    if (v.blind) diff += 2;
    if (c.ranged) diff += v.cover;
    diff += v.diffAdj;
    if (c.note) notes.push(c.note);
    if (v.target === "helpless") notes.push(t("Combat.Target.helplessNote"));
    if (v.blind && c.ranged) notes.push(t("Combat.BlindRanged"));
    const dmg = c.dmg == null ? null : c.dmg + aimDmg;
    const spec = a.traitSpecialty(`abilities.${c.ability}`) || a.traitSpecialty(`attributes.${c.attr}`);
    if (c.auto) notes.push(t("Combat.PotenceDamage", { n: c.auto }));
    if (a.celerityActions) notes.push(t("Combat.CelerityNote", { n: a.celerityActions }));
    return { pool: Math.max(0, pool), breakdown: bd, difficulty: Math.max(2, diff), damage: dmg, choice: c, notes, phys, specialtyName: spec, attackAuto };
  }

  async _prepareContext() {
    const a = this.actor, v = this.v, r = this.compute();
    const weapons = weaponsOf(a).map(w => ({ ...w, key: `w:${w.id}`, active: v.pick === `w:${w.id}`,
      icon: { brawl: "fa-hand-back-fist", melee: "fa-khanda", firearms: "fa-gun", thrown: "fa-bullseye" }[w.kind] }));
    const maneuvers = Object.entries(MANEUVERS).filter(([k, m]) => k === "claws" ? !!a.system.fx?.claws : (!m.vampire || a.isVampire))
      .map(([k, m]) => ({ key: `m:${k}`, name: t(`Combat.M.${k}`), icon: m.icon, active: v.pick === `m:${k}` }));
    const opt = (list, cur, prefix) => list.map(k => ({ value: k, label: t(`${prefix}.${k}`), selected: k === cur }));
    // Цели: отмеченные токены (T) и все токены сцены, кроме самого атакующего
    const seen = new Set(), foes = [];
    const push = (x, marked) => {
      if (!x || x === a || seen.has(x.uuid)) return;
      seen.add(x.uuid);
      foes.push({ value: x.uuid, label: `${marked ? "◆ " : ""}${x.name}`, selected: x.uuid === v.foe });
    };
    for (const tk of game.user.targets ?? []) push(tk.actor, true);
    for (const tk of canvas?.tokens?.placeables ?? []) push(tk.actor, false);
    const chances = chancesView(odds({ pool: r.pool, difficulty: r.difficulty, specialty: v.specialty, willpower: v.willpower, auto: r.attackAuto ?? 0 }));
    return {
      v, ...r, weapons, maneuvers, ranged: r.choice.ranged, foes, chances,
      damageType: game.i18n.localize(VTM20.damageTypes[r.choice.type]?.label ?? ""),
      positions: opt(["front", "flank", "rear"], v.position, "Combat.Pos"),
      aims: opt(["none", "medium", "small", "tiny"], v.aim, "Combat.Aim"),
      targets: opt(["normal", "held", "helpless"], v.target, "Combat.Target"),
      ranges: opt(["point", "normal", "long"], v.range, "Combat.Range"),
      covers: [0, 1, 2, 3].map(n => ({ value: n, label: t(`Combat.Cover.c${n}`), selected: n === v.cover })),
      willpowerLeft: a.system.willpower.temporary, woundPenalty: a.system.health.penalty,
      physicalLabel: r.phys ? Codex.disciplineLabel(r.choice.attr === "strength" ? "potence" : "celerity") : "",
      messageModes: Object.entries(CONFIG.ChatMessage.modes ?? {}).map(([k, m]) => ({ value: k, label: game.i18n.localize(m.label ?? k), selected: k === v.messageMode }))
    };
  }

  // Слушатель — один раз: корневой элемент окна живёт между перерисовками (раньше они копились с каждой)
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener("change", () => this.#read());
  }

  #read() {
    const f = new foundry.applications.ux.FormDataExtended(this.element).object;
    const num = (x, d = 0) => Number.isFinite(Number(x)) ? Number(x) : d;
    Object.assign(this.v, {
      foe: f.foe ?? this.v.foe,
      position: f.position ?? this.v.position, aim: f.aim ?? this.v.aim, target: f.target ?? this.v.target,
      range: f.range ?? this.v.range, cover: num(f.cover, this.v.cover),
      foes: Math.clamp(num(f.foes), 0, 4), blind: !!f.blind, actions: Math.clamp(num(f.actions, 1), 1, 6),
      bonus: num(f.bonus), diffAdj: num(f.diffAdj),
      specialty: !!f.specialty, willpower: !!f.willpower, physical: !!f.physical, wounds: !!f.wounds,
      messageMode: f.messageMode ?? this.v.messageMode
    });
    this.render();
  }

  static #onPick(event, target) { this.v.pick = target.dataset.key; this.render(); }
  static #onBump(event, target) {
    const k = target.dataset.field, d = Number(target.dataset.d);
    const lim = { actions: [1, 6], foes: [0, 4], bonus: [-20, 20], diffAdj: [-6, 6] }[k];
    this.v[k] = Math.clamp((this.v[k] ?? 0) + d, ...lim);
    this.render();
  }

  static async #onSubmit() {
    const r = this.compute(), v = this.v, c = r.choice;
    const foe = v.foe ? await foundry.utils.fromUuid(v.foe) : null;
    const notes = [...r.notes];
    if (v.target === "helpless") notes.unshift(t("Combat.AutoHit"));
    if (c.pierce) notes.push(t("Combat.PierceNote", { n: c.pierce }));
    const head = ["small", "tiny"].includes(v.aim);
    const link = { weaponName: c.name, target: foe?.uuid ?? null, targetName: foe?.name ?? "", pierce: c.pierce, bullet: c.bullet, head, ranged: c.ranged,
      damageAuto: c.auto ?? 0, venom: !!c.venom };
    const res = await rollPool({
      actor: this.actor, title: c.name, subtitle: foe ? `${t("Combat.Attack")} → ${foe.name}` : t("Combat.Attack"),
      pool: r.pool, difficulty: r.difficulty, specialty: v.specialty, specialtyName: r.specialtyName,
      willpower: v.willpower, breakdown: r.breakdown, kind: "attack", messageMode: v.messageMode, auto: r.attackAuto,
      extra: r.damage == null ? link : { ...link, damagePool: r.damage, damageType: c.type, fangs: c.fangs },
      notes
    });
    // Есть цель и попадание — карточка ждёт её защиты (обездвиженную цель бьют без защиты)
    // Ласка Ваала: попадание без цели на карточке тоже тратит пункт ихора
    if (!foe && c.venom && res?.outcome === "success") await this.actor.spendVenom();
    if (foe && res?.outcome === "success") {
      const data = { ...link, attacker: this.actor.uuid, attackerName: this.actor.name, roll: res.message?.id ?? null,
        successes: res.successes, damagePool: r.damage, damageType: c.type, fangs: c.fangs };
      const card = await postAttackCard(this.actor, foe, data);
      if (v.target === "helpless" && card) await resolveAttack(card, 0, "none");
    }
  }
}

/* ── Атака на цель: ждёт защиты, затем итог ───────────────────────────── */

const esc = x => foundry.utils.escapeHTML(String(x ?? ""));

/** Способы защиты от этой атаки: от стрельбы и метания — только уклонение (04). */
function methodsFor(d) { return d.ranged ? ["dodge", "none"] : ["dodge", "block", "parry", "none"]; }
const METHOD_ICON = { dodge: "fa-person-running", block: "fa-shield-halved", parry: "fa-khanda", none: "fa-person" };
const methodLabel = m => t(m === "none" ? "Combat.NoDefense" : `Combat.Defense.${m}`);

/** Карточка атаки с кнопками защиты для цели. */
async function postAttackCard(attacker, target, d) {
  const btns = methodsFor(d).map(m => `<button type="button" data-r-action="defend" data-method="${m}"><i class="fa-solid ${METHOD_ICON[m]}"></i> ${esc(methodLabel(m))}</button>`).join("");
  const dmg = d.damagePool == null ? t("Combat.NoDamage")
    : `${t("Roll.Damage")}: ${d.damagePool + Math.max(0, d.successes - 1)} ${t("Combat.Dice")}${d.damageAuto ? ` + ${t("Combat.AutoShort", { n: d.damageAuto })}` : ""} · ${game.i18n.localize(VTM20.damageTypes[d.damageType]?.label ?? "")}`;
  const content = `<div class="r-roll-card r-combat-card is-pending">
    <header class="r-cc-head"><img src="${esc(attacker.img)}" alt=""><b>${esc(attacker.name)}</b><i class="fa-solid fa-khanda"></i><b>${esc(target.name)}</b><img src="${esc(target.img)}" alt=""></header>
    <p class="r-cc-line">${esc(d.weaponName)} · <b>${d.successes}</b> ${esc(t("Roll.Successes"))} · ${esc(dmg)}</p>
    <p class="r-cc-ask">${esc(t("Combat.DefendWho", { name: target.name }))}</p>
    <div class="r-card-buttons r-cc-defend">${btns}</div>
  </div>`;
  return ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor: attacker }), flags: { [SYSTEM_ID]: { combat: d } } });
}

/** Карточки атак, по которым подведён итог (среди последних сообщений). */
export function resolvedIds() {
  const out = new Set();
  for (const m of game.messages.contents.slice(-120)) {
    const r = m.getFlag(SYSTEM_ID, "combatResult");
    if (r?.card) out.add(r.card);
  }
  return out;
}

/** Атаки, ждущие защиты этого персонажа (для HUD). */
export function pendingAttacks(actor) {
  if (!actor) return [];
  const done = resolvedIds();
  return game.messages.contents.slice(-60).filter(m => m.getFlag(SYSTEM_ID, "combat")?.target === actor.uuid && !done.has(m.id));
}

/** Защититься по кнопке карточки. */
export async function defendCard(card, method) {
  const d = card.getFlag(SYSTEM_ID, "combat");
  if (!d) return;
  const target = await foundry.utils.fromUuid(d.target);
  if (!target) return;
  if (!target.isOwner) return ui.notifications.warn(t("Combat.NotYourDefense", { name: target.name }));
  if (resolvedIds().has(card.id)) return ui.notifications.info(t("Combat.AlreadyResolved"));
  if (!methodsFor(d).includes(method)) return ui.notifications.warn(t("Combat.RangedDodgeOnly"));
  if (method === "none") return resolveAttack(card, 0, "none");
  return openDefense(target, method, {
    subtitle: `← ${d.attackerName}: ${d.weaponName}`,
    onRolled: res => resolveAttack(card, res?.successes ?? 0, method)
  });
}

/** Защита из HUD: выбрать способ против последней атаки. */
export async function defendFromHud(actor) {
  const card = pendingAttacks(actor).at(-1);
  if (!card) return;
  const d = card.getFlag(SYSTEM_ID, "combat");
  const method = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Combat.DefendTitle"), icon: "fa-solid fa-shield-halved" }, classes: ["vtm20", "r-dialog"],
    content: `<p>${esc(t("Combat.DefendAsk", { a: d.attackerName, w: d.weaponName, n: d.successes }))}</p>`,
    buttons: methodsFor(d).map(m => ({ action: m, label: methodLabel(m), icon: `fa-solid ${METHOD_ICON[m]}` })),
    rejectClose: false
  });
  if (method) return defendCard(card, method);
}

/** Итог: успехи атаки минус успехи защиты; остаток работает как обычные успехи (04). */
export async function resolveAttack(card, defSuccesses, method) {
  const d = card.getFlag(SYSTEM_ID, "combat");
  if (!d || resolvedIds().has(card.id)) return;
  const def = defSuccesses ?? 0;
  const net = d.successes - def;
  const hit = net > 0;
  const damage = hit && d.damagePool != null ? d.damagePool + net - 1 : null;
  const how = method === "none" ? methodLabel("none") : `${methodLabel(method)}: ${def}`;
  const type = game.i18n.localize(VTM20.damageTypes[d.damageType]?.label ?? "");
  const line = !hit ? t("Combat.Miss") : damage == null ? t("Combat.HitNoDamage", { n: net }) : t("Combat.Hit", { n: net, d: damage, type });
  const btn = hit && damage != null
    ? `<div class="r-card-buttons"><button type="button" data-r-action="combatDamage"><i class="fa-solid fa-burst"></i> ${esc(t("Roll.RollDamage"))} · ${damage}</button></div>` : "";
  const content = `<div class="r-roll-card r-combat-card ${hit ? "is-hit" : "is-miss"}">
    <header class="r-cc-head"><b>${esc(d.attackerName)}</b><i class="fa-solid fa-khanda"></i><b>${esc(d.targetName)}</b></header>
    <p class="r-cc-line">${esc(d.weaponName)} · ${esc(t("Roll.Successes"))} ${d.successes} · ${esc(how)}</p>
    <div class="r-outcome"><span class="r-outcome-ribbon"><i class="fa-solid ${hit ? "fa-burst" : "fa-shield"}"></i> ${esc(t(hit ? "Combat.HitShort" : "Combat.MissShort"))}</span></div>
    <div class="r-card-hint">${esc(line)}</div>${btn}
  </div>`;
  const target = await foundry.utils.fromUuid(d.target);
  // Ласка Ваала: попадание (даже без урона) тратит пункт ихора; промах — нет
  if (hit && d.venom) {
    const attacker = await foundry.utils.fromUuid(d.attacker);
    if (attacker?.isOwner) await attacker.spendVenom();
  }
  return ChatMessage.create({
    content, speaker: ChatMessage.getSpeaker({ actor: target ?? undefined }),
    flags: { [SYSTEM_ID]: { combatResult: { ...d, card: card.id, net, hit, damage } } }
  });
}

/** Бросок урона по итогу атаки — сразу адресован цели. */
export async function rollLinkedDamage(message) {
  const r = message.getFlag(SYSTEM_ID, "combatResult");
  if (!r?.hit || r.damage == null) return;
  const attacker = await foundry.utils.fromUuid(r.attacker);
  const { rollDamage } = await import("../dice/roll.mjs");
  return rollDamage({
    actor: attacker, pool: r.damage, damageType: r.damageType, title: r.weaponName, aggravatedFangs: r.fangs, auto: r.damageAuto ?? 0,
    target: r.target, pierce: r.pierce ?? 0, bullet: !!r.bullet, head: !!r.head,
    notes: r.targetName ? [`<i class="fa-solid fa-crosshairs"></i> ${esc(t("Combat.DamageTo", { name: r.targetName }))}`] : []
  });
}
