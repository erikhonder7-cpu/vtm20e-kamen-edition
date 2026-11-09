// module/combat/combat.mjs
// Бой по V20 (V20_Основные_правила/04): атака оружием или манёвром ближнего боя
// с модификаторами (фланг и тыл, прицеливание, численное превосходство, вслепую,
// укрытие и дальность для стрельбы, множественные действия), защиты (уклонение,
// блок, парирование — каждая следующая за ход на 1 куб меньше).
//
// Атака кидается обычной карточкой «attack»: успехи сверх первого прибавляются
// к урону, кнопка «Бросить урон» на карточке — как у оружия с листа.

import { declaredActions, abortForDefense } from "./turn.mjs";
import { allowAnyway } from "../apps/rule-gate.mjs";
import { VTM20, SYSTEM_PATH, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { rollPool, odds, chancesView } from "../dice/roll.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { mobBonus } from "../apps/extras.mjs";
import { dreadDice, mindDiff, centered, painless, pathFlag, majestyCheck } from "../apps/target-powers.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

/**
 * Манёвры ближнего боя без оружия (04, «Манёвры ближнего боя»).
 * dice — «точность» (кубы к атаке), diff — к сложности, dmg — к Силе (null — урона нет).
 */
export const MANEUVERS = {
  punch:  { attr: "dexterity", ability: "brawl", dice: 0, diff: 0, dmg: 0,    type: "bashing",    icon: "fa-hand-fist" },
  kick:   { attr: "dexterity", ability: "brawl", dice: 0, diff: 1, dmg: 1,    type: "bashing",    icon: "fa-shoe-prints" },
  claws:  { attr: "dexterity", ability: "brawl", dice: 0, diff: 0, dmg: 1,    type: "aggravated", icon: "fa-paw", vampire: true, fangs: true, supernatural: true },
  bite:   { attr: "dexterity", ability: "brawl", dice: 1, diff: 0, dmg: 1,    type: "aggravated", icon: "fa-tooth", vampire: true, fangs: true, supernatural: true },
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
      damage: w.damage, strength: w.strength, damageType: w.damageType, difficulty: w.difficulty, pierce: w.pierce ?? 0, silver: !!w.silver,
      supernatural: !!(w.supernatural || i.getFlag?.(SYSTEM_ID, "supernatural")),
      naturalFormWeapon: !!i.getFlag?.(SYSTEM_ID, "naturalFormWeapon"), fortitudeOnly: !!i.getFlag?.(SYSTEM_ID, "fortitudeOnly"),
      fangs: !!i.getFlag?.(SYSTEM_ID, "fangs"), rangeM: Number.parseFloat(String(w.range ?? "").replace(",", ".")) || 0,
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

/** Жетон персонажа на сцене (первый активный). */
const tokenOf = actor => actor?.getActiveTokens?.(true)?.[0] ?? null;

/** Расстояние между жетонами в единицах сцены (метры). */
export function tokenDistance(a, b) {
  const ta = tokenOf(a), tb = tokenOf(b);
  if (!ta || !tb || !canvas?.grid) return null;
  try { return canvas.grid.measurePath([ta.center, tb.center]).distance; } catch { return null; }
}

/**
 * Численное превосходство (04): противники рядом (в пределах клетки, другая сторона) — каждый после первого
 * +1 к сложности атаки и защиты, не больше +4.
 */
export function crowdAround(actor) {
  const tk = tokenOf(actor);
  if (!tk || !canvas?.grid) return 0;
  const disp = tk.document.disposition, reach = canvas.grid.size * 1.5;
  const near = canvas.tokens.placeables.filter(o => o !== tk && o.actor && !o.document.hidden && o.document.disposition !== disp
    && o.document.disposition !== CONST.TOKEN_DISPOSITIONS.NEUTRAL && !o.actor.statuses?.has("dead")
    && Math.hypot(o.center.x - tk.center.x, o.center.y - tk.center.y) <= reach);
  return Math.clamp(near.length - 1, 0, 4);
}

/** Защита: уклонение, блок или парирование. Каждая следующая за ход — −1 куб (04). */
export function openDefense(actor, kind = "dodge", { onRolled = null, subtitle = null, celerityAction = false } = {}) {
  const d = DEFENSES[kind] ?? DEFENSES.dodge;
  const n = nextDefense(actor);
  const crowd = crowdAround(actor);
  return RollDialog.prompt(actor, {
    onRolled, ...(crowd ? { difficulty: 6 + crowd } : {}),
    title: t(`Combat.Defense.${kind}`), subtitle: subtitle ?? t("Combat.DefenseSub"),
    trait1: `attributes.${d.attr}`, trait2: `abilities.${d.ability}`,
    // Танец ветра (Путь Марса 3): уклоняться от любого числа атак без штрафа
    bonus: n > 1 && !(kind === "dodge" && pathFlag(actor, "windDance")) ? -(n - 1) : 0, kind: "defense", lockTraits: true, celerityAction,
    diffNote: [n > 1 ? t("Combat.DefenseNth", { n }) : "", crowd ? t("Combat.CrowdNote", { n: crowd + 1, d: crowd }) : "", kind === "block" ? t("Combat.BlockNote") : "", t("Combat.DefenseNote")].filter(Boolean).join(" ")
  });
}

/* ── Окно атаки ───────────────────────────────────────────────────────── */

/** natural — номер естественного оружия формы (formFx.weapons: когти и клыки Гару, атаки апокалиптической формы). */
export async function openAttack(actor, { weapon = null, maneuver = null, natural = null, celerityAction = false } = {}) {
  // облик без тела (туман, тень, земля) — атаковать нельзя по правилам, но решает рассказчик
  const fx = actor.system.fx ?? {};
  const why = fx.earthMeld ? t("Fx.EarthNoAction") : fx.mistForm ? t("Fx.MistNoPhysicalAttack") : fx.shadowForm ? t("Fx.ShadowNoPhysicalAttack") : null;
  if (why && !(await allowAnyway(actor, why))) return null;
  // одно окно атаки на персонажа: повторный клик не плодит копии
  for (const x of foundry.applications.instances.values()) if (x instanceof AttackDialog && x.actor === actor) await x.close();
  return new AttackDialog(actor, { weapon, maneuver, natural, celerityAction }).render({ force: true });
}

export class AttackDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-roll-dialog", "r-attack-dialog"],
    tag: "form",
    window: { title: "VTM20.Combat.Attack", icon: "fa-solid fa-khanda" },
    position: { width: 660 },
    form: { handler: AttackDialog.#onSubmit, closeOnSubmit: true, submitOnChange: false },
    actions: { pick: AttackDialog.#onPick, bump: AttackDialog.#onBump }
  };

  static PARTS = { form: { template: `${SYSTEM_PATH}/templates/dice/attack-dialog.hbs` } };

  constructor(actor, { weapon, maneuver, natural = null, celerityAction = false }) {
    super({ window: { title: `${t("Combat.Attack")}: ${actor.name}` } });
    this.actor = actor;
    this.celerityAction = !!celerityAction;
    const beastForm = actor.system.fx?.beastForm;
    const formWeapons = beastForm === "modified" ? weaponsOf(actor).filter(w => w.naturalFormWeapon) : [];
    const first = beastForm === "modified" ? formWeapons[0] : beastForm ? null : weaponsOf(actor)[0];
    const marked = [...(game.user.targets ?? [])].map(tk => tk.actor).filter(x => x && x !== actor);
    this.v = {
      foe: marked[0]?.uuid ?? "",
      pick: natural != null ? `f:${natural}` : beastForm === "wolf" ? `m:claws` : ["bat", "cobra"].includes(beastForm) ? `m:bite` : weapon ? `w:${weapon}` : maneuver ? `m:${maneuver}` : first ? `w:${first.id}` : "m:punch",
      position: "front", aim: "none", foes: crowdAround(actor), blind: false, target: "normal",
      range: "normal", cover: 0, actions: celerityAction ? 1 : declaredActions(actor), bonus: 0, diffAdj: 0,
      specialty: false, willpower: false, physical: true, wounds: true,
      messageMode: game.settings.get("core", "messageMode")
    };
  }

  /** Что выбрано: оружие или манёвр, с готовыми чертами, сложностью и уроном. */
  get choice() {
    const a = this.actor, s = a.system, [kind, id] = this.v.pick.split(":");
    // Галочка физических Дисциплин влияет и на пул атаки, и на пул урона.
    const str = s.attributes.strength.total + (this.v.physical ? a.physicalDisciplineBonus("strength") : 0);
    const auto = this.v.physical ? a.physicalAuto("strength") : 0;
    const fx = s.fx ?? {};
    // Ласка Ваала (Упокоение 4): ихор на клинке или ногтях — урон губительный, стрельба не в счёт
    const venom = (type, ranged) => fx.venom > 0 && !ranged && type !== "aggravated";
    if (kind === "w") {
      const w = weaponsOf(a).find(x => x.id === id);
      if (w) {
        const k = VTM20.weaponKinds[w.kind];
        const v = venom(w.damageType, w.ranged);
        return { name: w.name, attr: k.attribute, ability: k.ability, dice: 0, diff: w.difficulty - 6, ranged: w.ranged, silver: !!w.silver,
          dmg: (w.strength ? str : 0) + w.damage, auto: w.strength ? auto : 0, strengthDamage: !!w.strength,
          type: v ? "aggravated" : w.damageType, venom: v, supernatural: !!w.supernatural,
          // Fortitude-only aggravated claws must not be treated as ordinary fang attacks for armour/stamina soak.
          fangs: !!w.fangs && !w.fortitudeOnly, note: v ? t("Combat.VenomNote", { n: fx.venom }) : "", pierce: w.pierce ?? 0, bullet: w.kind === "firearms", rangeM: w.rangeM };
      }
    }
    // естественное оружие апокалиптической формы (когти, рога, хвост, чрево — data/form.mjs): Ловкость + Драка
    if (kind === "f") {
      const w = s.formFx?.weapons?.[Number(id)];
      if (w) return { name: w.name, attr: "dexterity", ability: "brawl", dice: 0, diff: w.diff ?? 0, ranged: false,
        dmg: str + w.dmg, auto, strengthDamage: true, type: w.type ?? (w.agg ? "aggravated" : "lethal"), venom: false, fangs: true, supernatural: true, note: a.type === "werewolf" ? "" : t("Combat.FormWeaponNote"), pierce: 0, bullet: false };
    }
    const m = MANEUVERS[id] ?? MANEUVERS.punch;
    // Чудовищный облик: +1 куб к урону в драке; Шкура гадюки: +1 куб к укусу (data/effects.mjs)
    // Костяные шипы (Искусство костей): +2 куба урона в клинче и броске
    const extra = m.dmg == null ? 0 : (m.ability === "brawl" ? fx.brawlDamage ?? 0 : 0) + (id === "bite" ? fx.biteDamage ?? 0 : 0)
      + (["clinch", "tackle"].includes(id) ? fx.grappleDice ?? 0 : 0);
    const v = m.dmg != null && ["punch", "claws"].includes(id) && venom(m.type, false);
    // Разъедающее касание (Длань Разрушения 3): безоружные атаки — губительный урон
    const acid = m.dmg != null && m.ability === "brawl" && pathFlag(a, "brawlAgg");
    return { name: t(`Combat.M.${id}`), attr: m.attr, ability: m.ability, dice: m.dice, diff: m.diff, ranged: false,
      dmg: m.dmg == null ? null : str + m.dmg + extra, auto: m.dmg == null ? 0 : auto, strengthDamage: m.dmg != null, type: v || acid ? "aggravated" : m.type, venom: v,
      // Когти Метаморфоз и Облика Зверя поглощаются только Стойкостью: без Выносливости и брони.
      fangs: !!m.fangs && !fx.clawsFortitudeOnly, supernatural: !!m.supernatural,
      note: [fx.beastForm === "cobra" && id === "bite" ? t("Combat.CobraBite") : t(`Combat.MNote.${id}`), v ? t("Combat.VenomNote", { n: fx.venom }) : ""].filter(Boolean).join(" "), pierce: 0, bullet: false,
      cobra: fx.beastForm === "cobra" && id === "bite" };
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
    if (attackAuto) bd.push({ label: t("Roll.AutoSuccess"), value: attackAuto });
    add(t("Combat.Accuracy"), c.dice);
    add(t(`Combat.Pos.${v.position}`), { front: 0, flank: 1, rear: 2 }[v.position]);
    for (const d of dreadDice(a)) add(d.label, d.value);   // Устрашающий взор (apps/target-powers.mjs)
    add(t("Extra.MobBonus"), mobBonus(a));                 // толпа: +1 за каждого на ногах сверх первого (apps/extras.mjs)
    if (v.target === "held") add(t("Combat.Target.held"), 2);
    add(t("Roll.Modifier"), v.bonus);
    if (v.wounds && !centered(a) && !painless(a)) add(t("Roll.Wounds"), a.system.health.penalty);
    if (c.attr === "dexterity" && a.armor.penalty) add(t("Roll.ArmorPenalty"), -a.armor.penalty);
    if (v.actions > 1) {
      const part = Math.floor(Math.max(0, pool) / v.actions);
      bd.push({ label: t("Roll.MultiActions", { n: v.actions }), value: part - pool }); pool = part;
    }
    // Сложность: база 6 (стрельба: в упор 4, до двойной дальности 8)
    const notes = [];
    const targetActor = v.foe ? foundry.utils.fromUuidSync(v.foe) : null;
    // дальность — по расстоянию между жетонами (в упор до 2 м, обычная — до дальности оружия, дальняя — до двойной), пока не выбрана руками
    if (c.ranged && targetActor && !this.rangeManual) {
      const dist = tokenDistance(a, targetActor);
      if (dist != null) {
        const far = c.rangeM > 0 ? c.rangeM : Infinity;
        v.range = dist <= 2 ? "point" : dist <= far ? "normal" : "long";
        notes.push(t(dist > 2 * far ? "Combat.RangeBeyond" : "Combat.RangeAuto", { m: Math.round(dist), r: c.rangeM || "—" }));
      }
    }
    let diff = 6 + c.diff;
    if (c.ranged) diff = { point: 4, normal: 6 + c.diff, long: 8 }[v.range];
    const targetHitDiff = [...(targetActor?.system?.fx?.diff?.hit ?? []), ...(c.ranged ? targetActor?.system?.fx?.diff?.rangedHit ?? [] : [])]
      .reduce((sum, x) => sum + (Number(x.value) || 0), 0);
    if (targetHitDiff) { diff += targetHitDiff; notes.push(t("Fx.HitHint")); }
    // Парадокс (Бардо 5): вредить тому, чьё откровение слышал, — навсегда +1 к сложности
    const harm = targetActor ? a.effects.filter(e => !e.disabled && e.flags?.[SYSTEM_ID]?.harmDiff
      && (e.flags[SYSTEM_ID].harmDiff.by === targetActor.uuid || e.flags[SYSTEM_ID].harmDiff.by?.endsWith(`Actor.${targetActor.id}`))).reduce((s, e) => s + (Number(e.flags[SYSTEM_ID].harmDiff.n) || 0), 0) : 0;
    if (harm) { diff += harm; notes.push(t("TP.ParadoxHarm", { n: harm })); }
    // пути Тауматургии: +сложность к физическим (Головокружение, Припадок, Отказ тела…)
    for (const d of mindDiff(a, { physical: true, dex: c.attr === "dexterity", traits: [`attributes.${c.attr}`, `abilities.${c.ability}`] })) { diff += d.value; notes.push(`${d.label}: ${d.value > 0 ? "+" : ""}${d.value}`); }
    // Верный удар (Путь Марса 2): ближний бой попадает с 1 успехом без броска — если пул не делят
    if (pathFlag(a, "strikeTrue") && !c.ranged && v.actions === 1) notes.push(t("TP.PathNote.StrikeTrue"));
    const [aimDiff, aimDmg] = AIM[v.aim];
    diff += aimDiff;
    // численное превосходство — только в ближнем бою (по умолчанию — противники рядом с атакующим)
    const foesN = c.ranged ? 0 : Math.min(4, v.foes);
    diff += foesN;
    if (foesN) notes.push(t("Combat.CrowdNote", { n: foesN + 1, d: foesN }));
    if (v.blind) diff += 2;
    if (c.ranged) diff += v.cover;
    diff += v.diffAdj;
    if (c.note) notes.push(c.note);
    if (v.target === "helpless") notes.push(t("Combat.Target.helplessNote"));
    if (v.blind && c.ranged) notes.push(t("Combat.BlindRanged"));
    const dmg = c.dmg == null ? null : c.dmg + aimDmg;
    const specialtyPaths = [`abilities.${c.ability}`, `attributes.${c.attr}`].filter(p => a.traitSpecialtyEligible(p));
    const spec = specialtyPaths.map(p => a.traitSpecialty(p)).filter(Boolean).join(", ");
    if (c.auto) notes.push(t("Combat.PotenceDamage", { n: c.auto }));
    if (a.celerityActions) notes.push(t("Combat.CelerityNote", { n: a.celerityActions }));
    return { pool: Math.max(0, pool), breakdown: bd, difficulty: Math.max(2, diff), damage: dmg, choice: c, notes, phys,
      specialtyName: spec, specialtyEligible: specialtyPaths.length > 0, attackAuto };
  }

  async _prepareContext() {
    const a = this.actor, v = this.v, r = this.compute();
    const beastForm = a.system.fx?.beastForm;
    // облик зверя: недоступное облику не прячется, а приглушено — выбрать можно через «Всё равно» (решает рассказчик)
    const weaponList = weaponsOf(a);
    const weapons = weaponList.map(w => ({ ...w, key: `w:${w.id}`, active: v.pick === `w:${w.id}`, dim: !!beastForm && !(beastForm === "modified" && w.naturalFormWeapon),
      icon: { brawl: "fa-hand-back-fist", melee: "fa-khanda", firearms: "fa-gun", thrown: "fa-bullseye" }[w.kind] }));
    const allowedFormManeuvers = beastForm === "wolf" ? new Set(["claws", "bite"]) : ["bat", "cobra"].includes(beastForm) ? new Set(["bite"]) : beastForm === "modified" ? new Set() : null;
    const hasProteanClawItem = a.items.some(i => i.type === "weapon" && i.getFlag?.(SYSTEM_ID, "power") === "protean:2");
    const maneuvers = Object.entries(MANEUVERS).filter(([k, m]) => (allowedFormManeuvers?.has(k)) || (k === "claws" ? (!!a.system.fx?.claws && !hasProteanClawItem) : (!m.vampire || a.isVampire)))
      .map(([k, m]) => ({ key: `m:${k}`, name: t(`Combat.M.${k}`), icon: m.icon, active: v.pick === `m:${k}`, dim: !!allowedFormManeuvers && !allowedFormManeuvers.has(k) }))
      .concat((a.system.formFx?.weapons ?? []).map((w, i) => ({ key: `f:${i}`, name: w.name, icon: w.icon ?? "fa-dragon", active: v.pick === `f:${i}` })));
    const split = label => { const m = label.match(/^(.*?)\s*\(([^)]*)\)\s*$/); return m ? { name: m[1], mod: m[2] } : { name: label, mod: "" }; };
    const opt = (list, cur, prefix) => list.map(k => ({ value: k, label: t(`${prefix}.${k}`), ...split(t(`${prefix}.${k}`)), selected: k === cur }));
    // Цели: отмеченные токены (T) и все токены сцены, кроме самого атакующего
    const seen = new Set(), foes = [];
    const push = (x, marked) => {
      if (!x || x === a || seen.has(x.uuid)) return;
      seen.add(x.uuid);
      foes.push({ value: x.uuid, label: `${marked ? "◆ " : ""}${x.name}`, selected: x.uuid === v.foe });
    };
    for (const tk of game.user.targets ?? []) push(tk.actor, true);
    for (const tk of canvas?.tokens?.placeables ?? []) push(tk.actor, false);
    const specialty = v.specialty && r.specialtyEligible;
    const strengthDamage = !!r.choice.strengthDamage;
    const potentialAuto = Math.max(a.physicalAuto(r.choice.attr), strengthDamage ? a.physicalAuto("strength") : 0);
    const potentialDice = Math.max(a.physicalDisciplineBonus(r.choice.attr), strengthDamage ? a.physicalDisciplineBonus("strength") : 0);
    const physicalDisplay = Math.max(potentialDice, potentialAuto);
    const chances = chancesView(odds({ pool: r.pool, difficulty: r.difficulty, specialty, willpower: v.willpower, auto: r.attackAuto ?? 0 }));
    return {
      v: { ...v, specialty }, ...r, canUseSpecialty: r.specialtyEligible, weapons, maneuvers, ranged: r.choice.ranged, foes, chances,
      damageType: game.i18n.localize(VTM20.damageTypes[r.choice.type]?.label ?? ""),
      positions: opt(["front", "flank", "rear"], v.position, "Combat.Pos"),
      aims: opt(["none", "medium", "small", "tiny"], v.aim, "Combat.Aim"),
      targets: opt(["normal", "held", "helpless"], v.target, "Combat.Target"),
      ranges: opt(["point", "normal", "long"], v.range, "Combat.Range"),
      covers: [0, 1, 2, 3].map(n => ({ value: n, label: t(`Combat.Cover.c${n}`), ...split(t(`Combat.Cover.c${n}`)), selected: n === v.cover })),
      // «Ещё» раскрыто, если там что-то задано (или его раскрыли сами)
      more: this.moreOpen || v.foes > 0 || v.actions > 1 || v.diffAdj !== 0 || v.blind,
      celerityAction: this.celerityAction,
      willpowerLeft: a.system.willpower.temporary, woundPenalty: a.system.health.penalty,
      physicalDisplay,
      physicalLabel: potentialAuto ? t("Roll.AutoSuccess") : strengthDamage && a.discipline("potence") ? Codex.disciplineLabel("potence")
        : potentialDice ? Codex.disciplineLabel(r.choice.attr === "strength" ? "potence" : "celerity") : "",
      messageModes: Object.entries(CONFIG.ChatMessage.modes ?? {}).map(([k, m]) => ({ value: k, label: game.i18n.localize(m.label ?? k), selected: k === v.messageMode }))
    };
  }

  // Слушатель — один раз: корневой элемент окна живёт между перерисовками (раньше они копились с каждой)
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener("change", () => this.#read());
    this.element.addEventListener("toggle", ev => { if (ev.target.matches?.(".r-atk-more")) this.moreOpen = ev.target.open; }, true);
  }

  #read() {
    const f = new foundry.applications.ux.FormDataExtended(this.element).object;
    // дальность выбрана руками — больше не подставляем по расстоянию
    if (f.range != null && f.range !== this.v.range) this.rangeManual = true;
    const num = (x, d = 0) => Number.isFinite(Number(x)) ? Number(x) : d;
    Object.assign(this.v, {
      foe: f.foe ?? this.v.foe,
      position: f.position ?? this.v.position, aim: f.aim ?? this.v.aim, target: f.target ?? this.v.target,
      range: f.range ?? this.v.range, cover: num(f.cover, this.v.cover),
      foes: Math.clamp(num(f.foes), 0, 4), blind: !!f.blind, actions: this.celerityAction ? 1 : Math.clamp(num(f.actions, 1), 1, 6),
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
    const [pickKind, pickId] = v.pick.split(":");
    const beastForm = this.actor.system.fx?.beastForm;
    if (beastForm === "modified") {
      const chosen = pickKind === "w" ? weaponsOf(this.actor).find(w => w.id === pickId) : null;
      if (!chosen?.naturalFormWeapon && !(await allowAnyway(this.actor, t("Fx.BeastNoHumanWeapons")))) return;
    } else if (beastForm && (pickKind === "w" || pickKind === "f" || !((beastForm === "wolf" && ["claws", "bite"].includes(pickId)) || (["bat", "cobra"].includes(beastForm) && pickId === "bite")))) {
      if (!(await allowAnyway(this.actor, t("Fx.BeastNoHumanWeapons")))) return;
    }
    const foe = v.foe ? await foundry.utils.fromUuid(v.foe) : null;
    // Преклонение (Величие 5): напасть на вампира — сперва Смелость
    if (foe && !(await majestyCheck(this.actor, foe))) return;
    const notes = [...r.notes];
    if (foe?.system?.fx?.earthMeld) {
      const { wakeEarthMeld } = await import("../apps/power-effects.mjs");
      await wakeEarthMeld(foe, t("Fx.EarthWakeAttack"));
      return;
    }
    if (foe?.system?.fx?.mistForm && !c.supernatural && !(await allowAnyway(this.actor, t("Fx.MistPhysicalImmune", { name: foe.name })))) return;
    if (foe?.system?.fx?.shadowForm && !c.supernatural && !(await allowAnyway(this.actor, t("Fx.ShadowPhysicalImmune", { name: foe.name })))) return;
    if (v.target === "helpless") notes.unshift(t("Combat.AutoHit"));
    // Парадокс: атакованный слушатель выходит из оцепенения
    const dazed = foe?.effects?.filter(e => e.flags?.[SYSTEM_ID]?.mind === "bardo|Paradox").map(e => e.id) ?? [];
    if (dazed.length && foe.isOwner) await foe.deleteEmbeddedDocuments("ActiveEffect", dazed);
    // яд кобры смертелен для смертных (V20, Серпентис 4) — исход решает рассказчик
    if (c.cobra && foe && ["mortal", "ghoul", "hunter"].includes(foe.type)) notes.push(t("Combat.CobraVenom", { name: foe.name }));
    if (c.pierce) notes.push(t("Combat.PierceNote", { n: c.pierce }));
    const head = ["small", "tiny"].includes(v.aim);
    const link = { weaponName: c.name, target: foe?.uuid ?? null, targetName: foe?.name ?? "", pierce: c.pierce, bullet: c.bullet, head, ranged: c.ranged,
      damageAuto: c.auto ?? 0, venom: !!c.venom, silver: !!c.silver, supernatural: !!c.supernatural,
      unarmed: pickKind === "m" && c.ability === "brawl", maneuver: pickKind === "m" ? pickId : null };
    const samiel = !c.ranged ? this.actor.effects.find(e => !e.disabled && e.flags?.[SYSTEM_ID]?.samiel) : null;
    if (samiel) { link.samiel = true; notes.push(t("TP.SamielHit")); }
    const res = await rollPool({
      actor: this.actor, title: c.name, subtitle: foe ? `${t("Combat.Attack")} → ${foe.name}` : t("Combat.Attack"),
      pool: samiel ? 0 : r.pool, difficulty: r.difficulty, specialty: v.specialty && r.specialtyEligible, specialtyName: r.specialtyName,
      willpower: v.willpower, breakdown: r.breakdown, kind: "attack", messageMode: v.messageMode, auto: samiel ? r.pool + (r.attackAuto ?? 0) : r.attackAuto,
      extra: r.damage == null ? link : { ...link, damagePool: r.damage, damageType: c.type, fangs: c.fangs },
      notes
    });
    if (this.celerityAction && res) await this.actor.consumeCelerityAction();
    if (samiel && res) await samiel.delete();
    // атака срывает Сокрытие
    if (res) await (await import("../apps/power-effects.mjs")).breakObfuscate(this.actor, t("Fx.CloakAttack"));
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
function methodsFor(d) { return d.ranged ? ["dodge", "none"] : d.samiel ? ["block", "parry", "none"] : ["dodge", "block", "parry", "none"]; }
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
export async function defendCard(card, method, { celerityAction = false } = {}) {
  const d = card.getFlag(SYSTEM_ID, "combat");
  if (!d) return;
  const target = await foundry.utils.fromUuid(d.target);
  if (!target) return;
  if (!target.isOwner) return ui.notifications.warn(t("Combat.NotYourDefense", { name: target.name }));
  if (resolvedIds().has(card.id)) return ui.notifications.info(t("Combat.AlreadyResolved"));
  if (!methodsFor(d).includes(method)) return ui.notifications.warn(t("Combat.RangedDodgeOnly"));
  if (method === "none") return resolveAttack(card, 0, "none");
  // защиты не заявлял — сперва отмена действия (Воля, сл. 6, или 1 Воля)
  if (!celerityAction && !(await abortForDefense(target))) return;
  return openDefense(target, method, {
    subtitle: `← ${d.attackerName}: ${d.weaponName}`,
    celerityAction,
    onRolled: res => resolveAttack(card, res?.successes ?? 0, method)
  });
}

/** Защита из HUD: выбрать способ против последней атаки. */
export async function defendFromHud(actor, { celerityAction = false } = {}) {
  const card = pendingAttacks(actor).at(-1);
  if (!card) return;
  const d = card.getFlag(SYSTEM_ID, "combat");
  const method = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Combat.DefendTitle"), icon: "fa-solid fa-shield-halved" }, classes: ["vtm20", "r-dialog"],
    content: `<p>${esc(t("Combat.DefendAsk", { a: d.attackerName, w: d.weaponName, n: d.successes }))}</p>`,
    buttons: methodsFor(d).filter(m => !celerityAction || m !== "none").map(m => ({ action: m, label: methodLabel(m), icon: `fa-solid ${METHOD_ICON[m]}` })),
    rejectClose: false
  });
  if (method) return defendCard(card, method, { celerityAction });
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
  // Клинч и захват держатся между ходами (combat/grapple в этом файле)
  if (hit && ["clinch", "hold"].includes(d.maneuver)) {
    const attacker = await foundry.utils.fromUuid(d.attacker);
    await setGrapple(attacker, target, d.maneuver);
  }
  // Костяные шипы: безоружный, попавший меньше чем 3 успехами, ранит себя — урон его Силой, губительный
  if (hit && d.unarmed && net < 3 && target?.system?.fx?.spikes) {
    const attacker = await foundry.utils.fromUuid(d.attacker);
    if (attacker) {
      const { rollDamage } = await import("../dice/roll.mjs");
      await rollDamage({ actor: target, pool: attacker.system.attributes.strength?.total ?? 1, damageType: "lethal", title: t("Combat.SpikesBack"),
        target: attacker.uuid, notes: [`<i class="fa-solid fa-bone"></i> ${esc(t("Combat.SpikesBackNote", { name: attacker.name, n: net }))}`] });
    }
  }
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
    target: r.target, pierce: r.pierce ?? 0, bullet: !!r.bullet, head: !!r.head, silver: !!r.silver,
    notes: r.targetName ? [`<i class="fa-solid fa-crosshairs"></i> ${esc(t("Combat.DamageTo", { name: r.targetName }))}`] : [],
    supernatural: !!r.supernatural
  });
}


/* ── Клинч и захват: состояние между ходами ───────────────────────────── */
// Клинч: каждый ход оба автоматически наносят урон, равный Силе. Захват: цель держится; вырваться —
// встречная Сила + Драка, при поражении удерживаемый теряет действие (04, «Манёвры ближнего боя»).

/** Эффекты сцепки на обоих: held — кого держат, holder — кто держит. */
export async function setGrapple(attacker, target, kind) {
  if (!attacker || !target) return;
  const make = (other, role) => ({ name: t(`Combat.Grapple.${kind}.${role}`, { name: other.name }), img: "icons/svg/net.svg",
    ...(kind === "hold" && role === "held" ? { statuses: ["r-held"] } : {}),
    description: `<p>${esc(t(`Combat.Grapple.${kind}.desc`))}</p>`, flags: { [SYSTEM_ID]: { grapple: { kind, role, other: other.uuid } } } });
  for (const [who, other, role] of [[target, attacker, "held"], [attacker, target, "holder"]]) {
    if (!who.isOwner) continue;
    const old = who.effects.filter(e => e.flags?.[SYSTEM_ID]?.grapple?.other === other.uuid).map(e => e.id);
    if (old.length) await who.deleteEmbeddedDocuments("ActiveEffect", old);
    await who.createEmbeddedDocuments("ActiveEffect", [make(other, role)]);
  }
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: attacker }), content: `<div class="r-notice"><i class="fa-solid fa-people-pulling"></i> ${esc(t(`Combat.Grapple.${kind}.start`, { a: attacker.name, b: target.name }))}</div>` });
}

/** Сцепки персонажа: [{ effect, kind, role, other }]. */
export const grapplesOf = actor => [...(actor?.effects ?? [])].filter(e => !e.disabled && e.flags?.[SYSTEM_ID]?.grapple)
  .map(e => ({ effect: e, ...e.flags[SYSTEM_ID].grapple }));

/** Разорвать сцепку с обеих сторон. */
async function dropGrapple(a, b) {
  for (const [who, other] of [[a, b], [b, a]]) {
    if (!who?.isOwner) continue;
    const ids = who.effects.filter(e => e.flags?.[SYSTEM_ID]?.grapple?.other === other?.uuid).map(e => e.id);
    if (ids.length) await who.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
}

/** Вырваться: встречная Сила + Драка (сл. 6); победа — сцепка разорвана, поражение в захвате — теряет действие. */
export async function breakGrapple(actor) {
  const g = grapplesOf(actor)[0];
  if (!g) return;
  const other = await foundry.utils.fromUuid(g.other);
  const pool = x => (x?.system.attributes.strength?.total ?? 0) + (x?.system.abilities?.brawl?.value ?? 0);
  const { rollPool } = await import("../dice/roll.mjs");
  const mine = await rollPool({ actor, title: t("Combat.Grapple.break"), pool: pool(actor), difficulty: 6, kind: "check" });
  const theirs = other ? await rollPool({ actor: other, title: t("Combat.Grapple.holdOn"), pool: pool(other), difficulty: 6, kind: "check", noBotch: true }) : { successes: 0 };
  const win = (mine?.successes ?? 0) > (theirs?.successes ?? 0);
  if (win) await dropGrapple(actor, other);
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice"><i class="fa-solid fa-people-pulling"></i> ${esc(t(win ? "Combat.Grapple.freed"
    : g.kind === "hold" && g.role === "held" ? "Combat.Grapple.stuckHold" : "Combat.Grapple.stuck", { name: actor.name, n: mine?.successes ?? 0, m: theirs?.successes ?? 0 }))}</div>` });
}

/** Начало хода (рассказчик): клинч — каждый держащий и удерживаемый получают карточку урона Силой противника. */
export async function grappleTick(combat) {
  if (!game.users.activeGM?.isSelf) return;
  const { rollDamage } = await import("../dice/roll.mjs");
  const done = new Set();
  for (const c of combat.combatants) {
    for (const g of grapplesOf(c.actor)) {
      if (g.kind !== "clinch" || g.role !== "holder") continue;
      const other = await foundry.utils.fromUuid(g.other);
      const key = [c.actor.uuid, g.other].sort().join("|");
      if (!other || done.has(key)) continue;
      done.add(key);
      for (const [from, to] of [[c.actor, other], [other, c.actor]])
        await rollDamage({ actor: from, pool: from.system.attributes.strength?.total ?? 1, damageType: "bashing", title: t("Combat.M.clinch"), target: to.uuid,
          notes: [`<i class="fa-solid fa-people-pulling"></i> ${esc(t("Combat.Grapple.tick", { name: to.name }))}`] });
    }
  }
}

/** Конец боя — сцепки распадаются. */
export function registerGrapple() {
  Hooks.on("deleteCombat", async combat => {
    if (!game.users.activeGM?.isSelf) return;
    for (const c of combat.combatants) {
      const ids = (c.actor?.effects ?? []).filter(e => e.flags?.[SYSTEM_ID]?.grapple).map(e => e.id);
      if (ids.length) await c.actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    }
  });
}
