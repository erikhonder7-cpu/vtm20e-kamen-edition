// module/documents/actor.mjs
// Актёр V20: траты крови и воли, урон и прочность, лечение, пулы бросков.

import { VTM20, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { revenantFamily } from "../data/revenants.mjs";
import { effectDef, activePowerEffects, powerOfKey } from "../data/effects.mjs";
import { untilFor } from "../apps/timers.mjs";
import { proposeFate } from "../apps/torpor.mjs";
import { mobState, applyMobDamage } from "../apps/extras.mjs";
import { getClock } from "../apps/calendar.mjs";
import { hunterXpCost, startConviction } from "../apps/hunter.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

export class VtMActor extends Actor {

  /* ── Начальные значения ─────────────────────────────────────────────── */

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    const icons = { vampire: "vampire.svg", ghoul: "ghoul.svg", mortal: "mortal.svg", demon: "demon.svg", creature: "creature.svg", hunter: "hunter.svg" };
    const upd = {};
    if (!data.img || data.img === CONST.DEFAULT_TOKEN) upd.img = `systems/${SYSTEM_ID}/assets/icons/${icons[this.type]}`;
    const proto = {
      "prototypeToken.bar1.attribute": "health",
      "prototypeToken.bar2.attribute": ["mortal", "demon", "hunter"].includes(this.type) ? "willpower" : "blood",
      "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
      "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER
    };
    if (this.type === "vampire" || this.type === "ghoul") Object.assign(proto, { "prototypeToken.sight.enabled": true });
    this.updateSource({ ...upd, ...proto });
  }

  /* ── Свойства ───────────────────────────────────────────────────────── */

  get isVampire() { return this.type === "vampire"; }
  /** Охотник (Hunter: The Reckoning) — отдельный тип на модели смертного: всё смертное плюс кредо, Убеждённость, Грани. */
  get isHunter() { return this.type === "hunter"; }
  get hasBlood() { return !!this.system.hasBlood; }

  /** Ключ Пути и его данные из справочника. */
  get path() { return Codex.path(this.system.morality.path); }

  /** Какая Добродетель стоит в слоте: совесть/решимость, самоконтроль/инстинкты. */
  /** Слуга падшего: смертный, создан мастером в режиме слуги (system.thrall). */
  get isThrall() { return this.type === "mortal" && !!(this.system.thrall?.master || this.system.thrall?.faith); }

  virtueKey(slot) {
    if (slot === "courage") return "courage";
    if (this.type === "demon" || this.isThrall) return slot === "selfControl" ? "conviction" : slot;   // у падших и их слуг — Совесть, Убеждённость, Мужество
    const v = this.path?.virtues ?? ["conscience", "selfControl"];
    if (slot === "conscience") return v.includes("conviction") ? "conviction" : "conscience";
    if (slot === "selfControl") return v.includes("instinct") ? "instinct" : "selfControl";
    return slot;
  }

  /** Клановые Дисциплины (по справочнику). */
  get clanDisciplines() {
    if (this.type === "ghoul") {
      // ревенант — Мощь и семейные Дисциплины; гуль — Мощь и Дисциплины клана домитора; клан неизвестен — физические (Ghouls & Revenants)
      const s = this.system, fam = s.ghoulType === "revenant" ? revenantFamily(s.family) : null;
      const dc = fam ? null : Codex.clan(s.domitorClan) ?? Codex.clans.find(c => c.name === s.domitorClan);
      const list = fam?.disciplines ?? dc?.disciplines ?? ["fortitude", "celerity"];
      return ["potence", ...list.filter(k => k !== "potence")];
    }
    if (this.type !== "vampire") return [];
    const clan = Codex.clan(this.system.clan);
    if (!clan) return [];
    const pick = clan.choice?.includes(this.system.clanChoice) ? [this.system.clanChoice] : [];
    return [...clan.disciplines, ...pick];
  }

  /** Ревенант — гуль с типом «ревенант» (Ghouls & Revenants): своя витэ, семья и семейный изъян. */
  get isRevenant() { return this.type === "ghoul" && this.system.ghoulType === "revenant"; }

  get clanLabel() {
    const s = this.system;
    if (s.clanCustom) return s.clanCustom;
    return Codex.clan(s.clan)?.name ?? "";
  }

  /** Есть ли у персонажа достоинство или недостаток с таким названием. */
  hasTrait(name) {
    return this.items.some(i => (i.type === "merit" || i.type === "flaw") && i.name === name);
  }

  /** Тратится ли кровь вдвое: Слабая кровь, Пятнадцатое поколение (V20, Appendix). */
  get doubleBloodCost() {
    return this.hasTrait("Слабая кровь") || this.hasTrait("Пятнадцатое поколение");
  }

  /** Точки Дисциплины по ключу (0 — нет). */
  discipline(key) {
    return this.items.find(i => i.type === "discipline" && i.system.key === key)?.system.value ?? 0;
  }

  /** Броня на персонаже: защита и штраф (04). */
  get armor() {
    const list = this.items.filter(i => i.type === "armor" && i.system.equipped);
    return {
      rating: list.reduce((s, i) => s + i.system.rating, 0),
      penalty: list.reduce((s, i) => s + i.system.penalty, 0)
    };
  }

  /** Значение черты по пути: «attributes.strength», «abilities.melee», «virtues.courage»… */
  traitValue(path) {
    if (!path) return 0;
    const [group, key] = path.split(".");
    const s = this.system;
    if (group === "attributes") return s.attributes[key]?.total ?? 0;
    if (group === "abilities") return s.abilities[key]?.value ?? 0;
    if (group === "secondary") return s.secondary[Number(key)]?.value ?? 0;
    if (group === "virtues") return Math.min(s.virtues[key]?.value ?? 0, s.morality.value);   // пул Добродетели ≤ морали (06)
    if (group === "disciplines") return this.discipline(key);
    if (group === "willpower") return s.willpower.permanent;
    if (group === "hunter") return s.hunter?.[key] ?? 0;            // Добродетели охотника
    if (group === "morality") return s.morality.value;
    if (group === "blood") return s.blood?.value ?? 0;
    return 0;
  }

  traitLabel(path) {
    if (!path) return "";
    const [group, key] = path.split(".");
    if (group === "attributes") return game.i18n.localize(VTM20.attributes[key]?.label ?? key);
    if (group === "abilities") return game.i18n.localize(VTM20.abilities[key]?.label ?? key);
    if (group === "secondary") return this.system.secondary[Number(key)]?.name || "—";
    if (group === "virtues") return game.i18n.localize(VTM20.virtues[this.virtueKey(key)]?.label ?? key);
    if (group === "disciplines") return Codex.discipline(key)?.name ?? this.items.find(i => i.type === "discipline" && i.system.key === key)?.name ?? key;
    if (group === "willpower") return t("Willpower");
    if (group === "hunter") return Codex.hunter?.virtues?.[key] ?? key;
    if (group === "morality") return this.path?.name ?? t("Humanity");
    return path;
  }

  traitSpecialty(path) {
    if (!path) return "";
    const [group, key] = path.split(".");
    if (group === "attributes" || group === "abilities") return this.system[group][key]?.specialty ?? "";
    if (group === "secondary") return this.system.secondary[Number(key)]?.specialty ?? "";
    return "";
  }

  /** Специализация действует при 4+; у отмеченных широких способностей — уже с 1 (01). */
  traitSpecialtyEligible(path) {
    if (!path) return false;
    const [group, key] = path.split(".");
    const trait = group === "attributes" || group === "abilities" ? this.system[group]?.[key]
      : group === "secondary" ? this.system.secondary?.[Number(key)] : null;
    const rating = Number(trait?.value);
    const earlyAbility = group === "abilities" && rating >= 1 && !!VTM20.abilities[key]?.earlySpecialty;
    return !!trait?.specialty?.trim() && (rating >= 4 || earlyAbility);
  }

  /**
   * Бонус к пулу от физических Дисциплин (Дисциплины/06, 14): Мощь к Силе, Стремительность к Ловкости.
   * Мощь, «включённая» кровью, в этот ход идёт автоуспехами, а не кубами (physicalAuto);
   * точки Стремительности, обменянные на дополнительные действия, в этот ход кубов не дают.
   */
  physicalDisciplineBonus(attribute) {
    if (attribute === "strength") return this.potenceActive ? 0 : this.discipline("potence");
    if (attribute === "dexterity") return Math.max(0, this.discipline("celerity") - this.celerityActions);
    return 0;
  }

  /** Автоматические успехи к проверке характеристики: Мощь за кровь (Дисциплины/06). */
  physicalAuto(attribute) {
    return attribute === "strength" && this.potenceActive ? this.discipline("potence") : 0;
  }

  /* ── Траты на один ход боя: Мощь и Стремительность ─────────────────────── */

  /** Метка текущего хода: в бою — номер раунда, вне боя трата держится минуту. */
  static roundKey() {
    const c = game.combat;
    return c?.started ? `${c.id}:${c.round}` : null;
  }

  // Обычный метод, не #приватный: его вызывает подготовка данных ещё внутри конструктора Actor, когда приватных членов подкласса нет
  _roundFlag(name) {
    const f = this.getFlag(SYSTEM_ID, name);
    if (!f) return null;
    const key = VtMActor.roundKey();
    if (key ? f.key === key : (!f.key && Date.now() - (f.at ?? 0) < 60000)) return f;
    return null;
  }

  /** Сколько крови потрачено в этот ход боя (вне боя лимит за ход не действует). */
  get bloodSpentThisTurn() { return VtMActor.roundKey() ? (this._roundFlag("bloodTurn")?.n ?? 0) : 0; }

  /** Мощь включена кровью на этот ход. */
  get potenceActive() { return !!this._roundFlag("potence"); }
  /** Сколько дополнительных действий Стремительности куплено на этот ход. */
  get celerityActions() { return this._roundFlag("celerity")?.n ?? 0; }

  /** Мощь: 1 кровь — до конца хода точки Мощи становятся автоуспехами всех проверок Силы, включая урон в ближнем бою. */
  async activatePotence() {
    const n = this.discipline("potence");
    if (!n || this.potenceActive) return;
    if (!(await this.spendBlood(1))) return;
    await this.setFlag(SYSTEM_ID, "potence", { key: VtMActor.roundKey(), at: Date.now() });
    this.#notice(`<i class="fa-solid fa-hand-fist"></i> ${t("Combat.PotenceOn", { n })}`);
  }

  /**
   * Стремительность: в начале хода N крови (не больше точек, лимит трат за ход не действует) —
   * N дополнительных физических действий после всех участников; каждое снимает 1 куб бонуса к Ловкости.
   */
  async buyCelerityActions(n) {
    const max = this.discipline("celerity");
    n = Math.clamp(Math.floor(n), 0, max);
    const had = this.celerityActions;
    if (n <= had) return;
    const cost = (n - had) * (this.doubleBloodCost ? 2 : 1);
    const cur = this.system.blood?.value ?? 0;
    if (cur < cost) return ui.notifications.warn(t("Notify.NoBlood", { name: this.name }));
    await this.update({ "system.blood.value": cur - cost, [`flags.${SYSTEM_ID}.celerity`]: { key: VtMActor.roundKey(), at: Date.now(), n } });
    this.#notice(`<i class="fa-solid fa-forward"></i> ${t("Combat.CelerityOn", { n, cost, left: Math.max(0, max - n) })}`);
  }

  /** Ласка Ваала: попадание тратит один пункт ихора; ихор кончился — сила гаснет. */
  async spendVenom() {
    const fx = this.powerEffects.find(x => x.def.venom);
    if (!fx) return;
    const left = (fx.effect.getFlag(SYSTEM_ID, "charges") ?? 1) - 1;
    if (left > 0) {
      await fx.effect.setFlag(SYSTEM_ID, "charges", left);
      this.#notice(`<i class="fa-solid fa-skull-crossbones"></i> ${t("Combat.VenomLeft", { n: left })}`);
    } else await this.endPower(fx.effect);
  }

  getRollData() {
    const data = super.getRollData();
    data.initiative = this.system.initiative ?? 0;
    return data;
  }

  /* ── Кровь и воля ───────────────────────────────────────────────────── */

  async spendBlood(n = 1, { reason = "", limit = true } = {}) {
    if (!this.hasBlood) return false;
    // Кол в сердце и торпор: кровь не тратится (04)
    if (this.statuses?.has("r-staked") || this.statuses?.has("r-torpor")) {
      ui.notifications.warn(t("Notify.NoBloodState", { name: this.name })); return false;
    }
    const cur = this.system.blood.value;
    // Лимит поколения за ход — только в бою (ход = раунд текущего боя); удвоенная трата Слабой крови считается как одна
    const turnKey = VtMActor.roundKey();
    const spentTurn = this.bloodSpentThisTurn, perTurn = this.system.blood.perTurn ?? 1;
    if (turnKey && limit && spentTurn + n > perTurn) {
      ui.notifications.warn(t("Notify.BloodPerTurn", { name: this.name, max: perTurn, spent: spentTurn })); return false;
    }
    // Слабая кровь и Пятнадцатое поколение: любая трата вдвое (кроме ежевечерней — она в awaken)
    const doubled = this.doubleBloodCost;
    if (doubled) n *= 2;
    if (cur < n) { ui.notifications.warn(t("Notify.NoBlood", { name: this.name })); return false; }
    const base = doubled ? n / 2 : n;
    await this.update({ "system.blood.value": cur - n,
      ...(turnKey ? { [`flags.${SYSTEM_ID}.bloodTurn`]: { key: turnKey, n: spentTurn + base } } : {}) });
    if (cur >= 5 && cur - n < 5 && this.isVampire)
      import("../dice/virtue-checks.mjs").then(m => m.suggestCheck(this, "frenzy", { reason: t("CheckPrompt.Hunger", { n: cur - n }), difficulty: 6 }));
    if (doubled) this.#notice(`<i class="fa-solid fa-droplet"></i> ${t("Notify.BloodDoubled", { n })}`);
    else if (reason) this.#notice(`<i class="fa-solid fa-droplet"></i> ${t("Notify.BloodSpent", { n, reason })}`);
    return true;
  }

  async gainBlood(n = 1) {
    if (!this.hasBlood) return;
    const s = this.system.blood;
    await this.update({ "system.blood.value": Math.min(s.max, s.value + n) });
  }

  async spendWillpower(n = 1) {
    const cur = this.system.willpower.temporary;
    if (cur < n) { ui.notifications.warn(t("Notify.NoWillpower", { name: this.name })); return false; }
    await this.update({ "system.willpower.temporary": cur - n });
    return true;
  }

  /** Усилить физическую характеристику кровью до конца сцены (05). */
  async boostAttribute(key) {
    if (!this.hasBlood || !VTM20.bloodBoostable.includes(key)) return;
    const s = this.system;
    if (s.attributes[key].total >= s.boostMax) { ui.notifications.warn(t("Notify.BoostMax", { n: s.boostMax })); return; }
    if (!(await this.spendBlood(1))) return;
    await this.update({ [`system.boosts.${key}`]: s.boosts[key] + 1 });
    this.#notice(`<i class="fa-solid fa-droplet"></i> ${t("Notify.Boosted", { attr: game.i18n.localize(VTM20.attributes[key].label), v: s.attributes[key].total + 1 })}`);
  }

  async clearBoosts() {
    if (!this.hasBlood) return;
    await this.update({ "system.boosts": { strength: 0, dexterity: 0, stamina: 0 } });
  }

  /* ── Урон и лечение (04) ────────────────────────────────────────────── */

  /**
   * Нанести повреждения после прочности. Переполненная шкала превращает лёгкие
   * в тяжёлые; дальше — торпор или Окончательная смерть.
   */
  async applyDamage(amount, type = "bashing") {
    amount = Math.max(0, Math.floor(amount));
    if (!amount) return;
    // толпа (apps/extras.mjs): общая шкала, по 3 уровня на человека
    if (mobState(this)) return applyMobDamage(this, amount, type);
    const src = this._source.system.health;
    const h = { bashing: src.bashing, lethal: src.lethal, aggravated: src.aggravated };
    const wasFull = h.bashing + h.lethal + h.aggravated >= 7;
    let over = 0;
    for (let i = 0; i < amount; i++) {
      if (h.bashing + h.lethal + h.aggravated < 7) { h[type]++; continue; }
      // шкала полна: новое повреждение утяжеляет самую лёгкую отметку
      if (type === "aggravated" && (h.bashing || h.lethal)) { h[h.bashing ? "bashing" : "lethal"]--; h.aggravated++; }
      else if (type !== "aggravated" && h.bashing) { h.bashing--; h.lethal++; }
      else over++;
      if (this.isVampire) over = Math.max(over, 1);      // вампир при смерти: любое новое повреждение — торпор (04)
    }
    await this.update({ "system.health": h });

    const full = h.aggravated + h.lethal + h.bashing >= 7;
    let fate = "";
    if (this.isVampire && (h.aggravated >= 7 || (wasFull && type === "aggravated"))) fate = t("Fate.finalDeath");
    else if (over > 0) fate = this.isVampire ? t("Fate.torpor") : t("Fate.death");
    else if (full) fate = t("Fate.incapacitated");
    const dmg = game.i18n.localize(VTM20.damageTypes[type].label);
    this.#notice(`<i class="fa-solid fa-heart-crack"></i> ${t("Notify.Damaged", { n: amount, type: dmg })}${fate ? ` <b class="r-fate">${fate}</b>` : ""}`);
    // Смертный умирает сразу; вампиру — карточка ведущему: торпор или Окончательная смерть (apps/torpor.mjs)
    if (fate === t("Fate.death")) await this.toggleStatusEffect?.("dead", { active: true, overlay: true });
    else if (fate === t("Fate.finalDeath")) await proposeFate(this, "death");
    else if (fate === t("Fate.torpor")) await proposeFate(this, "torpor");
  }

  async healDamage(type, n = 1) {
    const h = this._source.system.health;
    const left = Math.max(0, (h[type] ?? 0) - n);
    await this.update({ [`system.health.${type}`]: left });
  }

  /** Лечение кровью: 1 пункт — лёгкое или тяжёлое, 5 пунктов — губительное (04, 05). */
  async bloodHeal(type = null) {
    if (!this.hasBlood) return;
    const h = this.system.health;
    type ??= h.bashing > 0 ? "bashing" : h.lethal > 0 ? "lethal" : h.aggravated > 0 ? "aggravated" : null;
    if (!type) { ui.notifications.info(t("Notify.NothingToHeal")); return; }
    const cost = type === "aggravated" ? 5 : 1;
    if (!(await this.spendBlood(cost))) return;
    await this.healDamage(type, 1);
    this.#notice(`<i class="fa-solid fa-hand-holding-droplet"></i> ${t("Notify.Healed", { type: game.i18n.localize(VTM20.damageTypes[type].label), n: cost })}`);
  }

  /**
   * Исцеление Верой (Demon: The Fallen, гл. 7): пункт Веры — все ушибы разом или один уровень летального;
   * усугублённый урон Верой не лечится.
   */
  async faithHeal(type = null) {
    if (this.type !== "demon") return;
    const h = this.system.health, f = this.system.faith;
    type ??= h.bashing > 0 ? "bashing" : h.lethal > 0 ? "lethal" : null;
    if (!type) { ui.notifications.info(t(h.aggravated > 0 ? "Demon.NoHealAgg" : "Notify.NothingToHeal")); return; }
    if (f.temporary < 1) { ui.notifications.warn(t("Demon.NoFaith")); return; }
    await this.update({ "system.faith.temporary": f.temporary - 1 });
    await this.healDamage(type, type === "bashing" ? h.bashing : 1);
    this.#notice(`<i class="fa-solid fa-fire-flame-curved"></i> ${t(type === "bashing" ? "Demon.HealedBashing" : "Demon.HealedLethal")}`);
  }

  /** Пул прочности против типа урона (04). */
  soakPool(type, { armor = true, fangs = false, pierce = 0 } = {}) {
    const s = this.system;
    const fort = this.discipline("fortitude");
    const stamina = s.attributes.stamina.total;
    // пробитие брони: столько точек брони не учитывается (V20 Dark Ages, M20 Victorian Age)
    const arm = armor ? Math.max(0, this.armor.rating - pierce) : 0;
    // броня апокалиптической формы (Броня, Чешуя, Толстая шкура…) — от любого урона (data/form.mjs)
    const form = s.formFx?.soak ?? 0;
    if (type === "bashing") return stamina + fort + arm + form;
    // демон в апокалиптической форме поглощает и летальный урон Выносливостью (Demon: The Fallen, гл. 7)
    const tough = this.isVampire || (this.type === "creature" && s.supernatural) || (this.type === "demon" && s.apocalyptic);
    if (type === "lethal") return (tough ? stamina : 0) + fort + arm + form;
    // губительный: только Стойкость; броня — лишь против клыков и когтей;
    // Шкура гадюки — и Выносливость против когтей и клыков (Серпентис 3)
    return fort + (fangs ? arm : 0) + (fangs && s.fx?.staminaVsFangs ? stamina : 0) + form;
  }

  /* ── Силы Дисциплин, действующие во времени (data/effects.mjs) ─────────── */

  /** Включённые силы: [{ effect, power, variant, def }]. */
  get powerEffects() { return activePowerEffects(this); }

  /**
   * Включить силу: цена кровью и волей, эффект на актёре, естественное оружие.
   * @param {string} power  «дисциплина:уровень»
   * @param {object} o      variant (волк / летучая мышь), blood (сколько крови, где цена «1–3»),
   *                         hours (сколько часов, где срок по успехам)
   */
  async startPower(power, { variant = "", blood = null, hours = null } = {}) {
    await Codex.loadTexts();   // описание силы для эффекта — из текстов справочника (догружаются после старта)
    const def = effectDef(power, variant);
    if (!def || this.powerEffects.some(x => x.power === power)) return null;
    const { disc, power: p, level: lvl } = powerOfKey(Codex, power);
    const name = `${p?.name ?? power}${variant ? ` · ${t(`Fx.Variant.${variant}`)}` : ""}`;
    const cost = blood ?? (Array.isArray(def.cost?.blood) ? def.cost.blood[0] : (def.cost?.blood ?? 0));
    if (cost && !(await this.spendBlood(cost))) return null;
    if (def.cost?.willpower && !(await this.spendWillpower(def.cost.willpower))) return null;
    // «на час» и «до рассвета» — срок по часам хроники (apps/timers.mjs)
    const now = getClock(), until = untilFor(def.mode, { hours: hours ?? (Number(def.hours) || 1), now });
    const [effect] = await this.createEmbeddedDocuments("ActiveEffect", [{
      name, img: Codex.disciplineIcon(disc), statuses: [`r-fx-${disc}-${lvl}`], description: p?.html ?? "",
      flags: { [SYSTEM_ID]: { power, variant, mode: def.mode, ...(def.charges ? { charges: cost } : {}), ...(until ? { start: now, until } : {}) } }
    }]);
    if (def.weapon) await this.createEmbeddedDocuments("Item", [{
      name: def.weapon.name, type: "weapon", img: `systems/${SYSTEM_ID}/assets/icons/weapon.svg`,
      system: { ...def.weapon, equipped: true }, flags: { [SYSTEM_ID]: { power } }
    }]);
    const price = [cost && `<i class="fa-solid fa-droplet"></i>${cost}`, def.cost?.willpower && `<i class="fa-solid fa-star"></i>${def.cost.willpower}`].filter(Boolean).join(" ");
    this.#notice(`<i class="fa-solid fa-wand-sparkles"></i> ${t("Fx.On", { name })}${price ? ` <span class="r-muted">${price}</span>` : ""}`);
    return effect;
  }

  /** Выключить силу: эффект и её естественное оружие; quiet — без карточки (срок вышел, карточка общая). */
  async endPower(effect, { quiet = false } = {}) {
    const power = effect.getFlag(SYSTEM_ID, "power");
    const items = this.items.filter(i => i.getFlag(SYSTEM_ID, "power") === power).map(i => i.id);
    if (items.length) await this.deleteEmbeddedDocuments("Item", items);
    const name = effect.name;
    await effect.delete();
    if (!quiet) this.#notice(`<i class="fa-solid fa-power-off"></i> ${t("Fx.Off", { name })}`);
  }

  /* ── Пробуждение и ночь ─────────────────────────────────────────────── */

  /** Вечернее пробуждение: −1 кровь, сброс усилений; по желанию +1 воля (03, 05). */
  async awaken({ willpower = false, quiet = false } = {}) {
    const upd = {};
    if (this.hasBlood) {
      const b = this.system.blood.value;
      if (this.isVampire && b <= 0) {
        // пустой запас: обязательная трата превращается в повреждение (04)
        await this.applyDamage(1, "lethal");
      } else if (this.isVampire) {
        // Кровоточащая рана: на пробуждение уходит 2 крови вместо 1
        const wake = this.hasTrait("Кровоточащая рана") ? 2 : 1;
        upd["system.blood.value"] = Math.max(0, b - wake);
      }
      upd["system.boosts"] = { strength: 0, dexterity: 0, stamina: 0 };
    }
    if (willpower) upd["system.willpower.temporary"] = Math.min(this.system.willpower.permanent, this.system.willpower.temporary + 1);
    await this.update(upd);
    if (!quiet) this.#notice(`<i class="fa-solid fa-moon"></i> ${t("Notify.Awaken")}`);
  }

  /* ── Опыт ───────────────────────────────────────────────────────────── */

  /** Цена следующей точки (01, 07). null — опытом не покупается. */
  xpCost(kind, current, extra = {}) {
    const X = VTM20.xp, ghoul = this.type === "ghoul";
    switch (kind) {
      case "attribute": return X.attribute(current);
      case "ability": return current === 0 ? X.newAbility : X.ability(current);
      case "discipline": {
        if (current === 0) return ghoul ? 20 : X.newDiscipline;
        const inClan = extra.inClan ?? this.clanDisciplines.includes(extra.key);
        if (ghoul) return current * (inClan ? 15 : 25);
        if (this.system.clan === "caitiff" || this.system.clan === "pandery") return X.caitiffDiscipline(current);
        return inClan ? X.clanDiscipline(current) : X.otherDiscipline(current);
      }
      case "path": return current === 0 ? (ghoul ? 20 : X.newPath) : (extra.primary ? null : (ghoul ? current * 15 : X.secondaryPath(current)));
      case "virtue": return X.virtue(current);
      case "morality": return X.morality(current);
      case "willpower": return X.willpower(current);
      // Demon: The Fallen, гл. 6: новое Знание 7 (чужого Дома и Тёмное — 10), Знание × 5, Вера × 7.
      // Привязанные к Земле (Earthbound, гл. 3): новое 6 (чужого Дома 8), Знание × 4, Вера × 6
      case "lore": {
        const eb = !!this.system.earthbound, L = Codex.lore(extra.key);
        if (current) return current * (eb ? 4 : 5);
        const near = (Codex.house(this.system.house)?.lores ?? []).includes(extra.key) || (L && !L.house && (!L.dark || eb));
        return eb ? (near ? 6 : 8) : (near ? 7 : 10);
      }
      case "faith": return current * (this.system.earthbound ? 6 : 7);
      case "urge": return current * 2;                    // Потребность Привязанного (Earthbound, гл. 3)
      // Охотник при росте за опыт (Players Guide, гл. 2): начальная Убеждённость и Добродетели охоты
      case "hunterConviction": case "hunterVirtue": case "lostVirtue": return hunterXpCost(this, kind, current, extra.key);
      default: return null;
    }
  }

  /**
   * Купить следующую точку за опыт (01): лист (кнопки «+») и окно опыта. doc — персонаж или его предмет,
   * path — путь к значению в doc. Возвращает потраченный опыт или null.
   */
  async buyWithXp({ doc = this, path, kind, label, confirm = true }) {
    const cur = kind === "hunterConviction" ? startConviction(this) : Number(foundry.utils.getProperty(doc._source, path) ?? 0);
    const extra = kind === "hunterVirtue" ? { key: path.split(".").pop() }
      : doc !== this && doc.type === "discipline" ? { key: doc.system.key, inClan: doc.system.inClan || this.clanDisciplines.includes(doc.system.key) }
      : doc !== this && doc.type === "thaumPath" ? { primary: doc.system.primary }
      : doc !== this && doc.type === "lore" ? { key: doc.system.key } : {};
    const cost = this.xpCost(kind, cur, extra);
    if (cost == null) return null;
    const xp = this.system.experience;
    if (xp.available < cost) { ui.notifications.warn(t("Notify.NoXp", { cost, have: xp.available })); return null; }
    label ??= doc.name;
    if (confirm && !(await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Xp.BuyTitle") }, content: `<p>${t("Xp.BuyConfirm", { label, from: cur, to: cur + 1, cost })}</p>`
    }))) return null;
    // начальная Убеждённость растёт вместе со шкалой
    await doc.update({ [path]: cur + 1, ...(kind === "hunterConviction" ? { "system.hunter.conviction": Math.min(10, (this.system.hunter?.conviction ?? 0) + 1) } : {}) });
    const log = foundry.utils.deepClone(this._source.system.experience.log);
    log.unshift({ amount: -cost, reason: `${label}: ${cur} → ${cur + 1}`, date: new Date().toLocaleDateString("ru-RU") });
    await this.update({ "system.experience.spent": this._source.system.experience.spent + cost, "system.experience.log": log });
    return cost;
  }

  /* ── Сообщения ──────────────────────────────────────────────────────── */

  #notice(html) {
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="r-notice r-type-${this.type}">${html}</div>`,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
  }
}
