// module/documents/actor.mjs
// Актёр V20: траты крови и воли, урон и прочность, лечение, пулы бросков.

import { VTM20, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { revenantFamily } from "../data/revenants.mjs";
import { effectDef, activePowerEffects, powerOfKey } from "../data/effects.mjs";
import { potenceModifiers, celerityDexterityDice, celerityBloodCost, celerityMaxBuyable, soakComponents } from "../data/physical-disciplines.mjs";
import { untilFor } from "../apps/timers.mjs";
import { proposeFate } from "../apps/torpor.mjs";
import { mobState, applyMobDamage } from "../apps/extras.mjs";
import { getClock } from "../apps/calendar.mjs";
import { hunterXpCost, startConviction } from "../apps/hunter.mjs";
import { mageXpCost } from "../apps/mage.mjs";
import { numenXpExtra } from "../apps/sorcerer.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

export class VtMActor extends Actor {

  /* ── Начальные значения ─────────────────────────────────────────────── */

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    // оборотню — картина из библиотеки Foundry (волк воет на луну над лесом): в тон палитре «лунный лес»
    const icons = { vampire: "vampire.svg", ghoul: "ghoul.svg", mortal: "mortal.svg", demon: "demon.svg", creature: "creature.svg", spirit: "spirit.svg", hunter: "hunter.svg", mage: "mage.svg", wraith: "wraith.svg",
      werewolf: "icons/creatures/mammals/wolf-howl-moon-forest-blue.webp", coterie: "icons/environment/people/group.webp", domain: "icons/environment/settlement/city-night.webp" };
    const upd = {};
    if (!data.img || data.img === CONST.DEFAULT_TOKEN) upd.img = icons[this.type].startsWith("icons/") ? icons[this.type] : `systems/${SYSTEM_ID}/assets/icons/${icons[this.type]}`;
    if (this.type === "coterie" || this.type === "domain") { this.updateSource(upd); return; }
    const proto = {
      "prototypeToken.bar1.attribute": "health",
      "prototypeToken.bar2.attribute": this.type === "werewolf" ? "werewolf.rage" : this.type === "wraith" ? "wraith.pathos" : ["mortal", "demon", "hunter", "mage"].includes(this.type) ? "willpower" : "blood",
      "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
      "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER
    };
    if (this.type === "vampire" || this.type === "ghoul") Object.assign(proto, { "prototypeToken.sight.enabled": true });
    // жетон связан с актёром (урон, кровь, эффекты — общие с листом); статисты-существа — копиями, как и прежде.
    // Явно заданное значение (импорт из компендия, призыв статистов) не трогаем.
    if (!["creature", "spirit"].includes(this.type) && data.prototypeToken?.actorLink === undefined) proto["prototypeToken.actorLink"] = true;
    this.updateSource({ ...upd, ...proto });
  }

  /* ── Свойства ───────────────────────────────────────────────────────── */

  get isVampire() { return this.type === "vampire"; }
  /** Дух Умбры: свой тип «Дух» — или существо с отметкой «дух» (как делали до отдельного типа). */
  get isSpirit() { return this.type === "spirit" || (this.type === "creature" && !!this.system.spirit?.on); }
  /** Охотник (Hunter: The Reckoning) — отдельный тип на модели смертного: всё смертное плюс кредо, Убеждённость, Грани. */
  get isHunter() { return this.type === "hunter"; }
  /** Маг (Mage: The Ascension) — пробуждённый смертный: Арете, Сферы, Квинтэссенция и Парадокс. */
  get isMage() { return this.type === "mage"; }
  get hasBlood() { return !!this.system.hasBlood; }

  /** Игровой персонаж: есть владелец-игрок, и это не гуль-слуга (галочка «Слуга, не игровой»). */
  get isPlayerCharacter() { return this.hasPlayerOwner && !(this.type === "ghoul" && this.system.retainer); }

  /** Гули-слуги этого персонажа: галочка «слуга» и домитор — его имя (или id). */
  get retainers() {
    return game.actors.filter(a => a.type === "ghoul" && a.system.retainer && a.id !== this.id && [this.name, this.id].includes((a.system.domitor ?? "").trim()));
  }

  /**
   * Половина начисленного опыта — слугам-гулям (правило системы). Остаток от деления копится у слуги
   * (флаг xpCarry), так что два раза по 1 дают 1. Возвращает [{ name, amount }].
   */
  async shareXpWithRetainers(amount, reason = "") {
    if (!(amount > 0)) return [];
    const out = [];
    for (const g of this.retainers) {
      const carry = Number(g.getFlag(SYSTEM_ID, "xpCarry")) || 0, sum = amount + carry, give = Math.floor(sum / 2);
      const x = g._source.system.experience, log = foundry.utils.deepClone(x.log);
      if (give) log.unshift({ amount: give, reason: t("Ghoul.RetainerXp", { name: this.name, reason: reason ? ` — ${reason}` : "" }), date: new Date().toLocaleDateString("ru-RU") });
      await g.update({ "system.experience.log": log, "system.experience.total": x.total + give, [`flags.${SYSTEM_ID}.xpCarry`]: sum % 2 });
      if (give) out.push({ name: g.name, amount: give });
    }
    return out;
  }

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
      // дампир — Мощь и Дисциплины клана Предка (Accursed Heirs: растут за текущее × 15)
      const donor = s.ghoulType === "dhampir" ? s.dhampir?.antecedentClan : s.domitorClan;
      const dc = fam ? null : Codex.clan(donor) ?? Codex.clans.find(c => c.name === donor);
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
  /** Дампир (Accursed Heirs: Dhampirs) — гуль с типом «dhampir»: живой ребёнок вампира, без домитора. */
  get isDhampir() { return this.type === "ghoul" && this.system.ghoulType === "dhampir"; }

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
    // По V20 броня не действует в зверином облике Метаморфоз; штраф к Ловкости тоже снимается.
    if (this.system.fx?.beastForm || this.system.fx?.mistForm || this.system.fx?.shadowForm) return { rating: 0, penalty: 0 };
    const list = this.items.filter(i => i.type === "armor" && i.system.equipped);
    // Броня гнева Каинова (Валерен 4): +броня от эффекта
    const fxArmor = [...this.effects].reduce((s, e) => s + (!e.disabled && Number(e.flags?.[SYSTEM_ID]?.armorBonus) || 0), 0);
    return {
      rating: list.reduce((s, i) => s + i.system.rating, 0) + fxArmor,
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
    if (group === "mage") return key === "arete" ? s.mage?.arete ?? 0 : s.mage?.spheres?.[key] ?? 0;   // Арете и Сферы мага
    if (group === "werewolf") return key === "rage" ? s.werewolf?.rage?.value ?? 0   // текущие Ярость и Гнозис; Гнозис — эффективный (клайв при себе)
      : key === "gnosis" ? Math.max(0, (s.werewolf?.gnosis?.value ?? 0) - (s.werewolf?.gnosis?.loss ?? 0)) : 0;
    if (group === "spirit") return s.spirit?.[key] ?? 0;          // дух Умбры: Ярость, Гнозис, Воля
    if (group === "spectre") return s.wraith?.spectre?.dark?.[key] ?? 0;   // Тёмные Арканои Спектра
    if (group === "wraith") return key === "pathos" ? s.wraith?.pathos?.value ?? 0 : key === "angst" ? s.wraith?.shadow?.angst?.temporary ?? 0   // призрак: Арканои, Пафос, Ангст
      : key === "angstPerm" ? s.wraith?.shadow?.angst?.permanent ?? 0 : s.wraith?.arcanoi?.[key]?.value ?? 0;
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
    if (group === "mage") return key === "arete" ? t("Mage.Arete") : Codex.mage?.spheres?.find(x => x.key === key)?.name ?? key;
    if (group === "werewolf") return t(`Werewolf.${key === "rage" ? "Rage" : "Gnosis"}`);
    if (group === "spirit") return t(`Werewolf.Spirit.${key}`);
    if (group === "spectre") return Codex.wraith?.darkArcanoi?.find(x => x.key === key)?.name ?? key;
    if (group === "wraith") return ["pathos", "angst", "angstPerm"].includes(key) ? t(`Wraith.${key[0].toUpperCase()}${key.slice(1)}`)
      : Codex.wraith?.arcanoi?.find(x => x.key === key)?.name ?? key;
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
    if (attribute === "strength") return potenceModifiers(this.discipline("potence"), this.potenceActive).dice;
    if (attribute === "dexterity") return celerityDexterityDice(this.discipline("celerity"), this.celerityActions);
    return 0;
  }

  /** Автоматические успехи к проверке характеристики: Мощь за кровь (Дисциплины/06). */
  physicalAuto(attribute) {
    return attribute === "strength" ? potenceModifiers(this.discipline("potence"), this.potenceActive).automatic : 0;
  }

  /* ── Траты на один ход боя: Мощь и Стремительность ─────────────────────── */

  /** Метка хода для общих счётчиков крови/действий: в бою — номер раунда, вне боя — короткое окно. */
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

  /** Ключ именно хода активного бойца; Мощь не должна оставаться на всех участников раунда. */
  static potenceTurnKey() {
    const c = game.combat;
    return c?.started ? `${c.id}:${c.round}:${c.turn}:${c.combatant?.id ?? "none"}` : null;
  }

  /** Мощь включена на текущий ход; вне боя действует до ручного выключения. */
  get potenceActive() {
    const flag = this.getFlag(SYSTEM_ID, "potence");
    if (!flag) return false;
    const key = VtMActor.potenceTurnKey();
    return key ? flag.key === key : !flag.key;
  }
  /** Сколько дополнительных действий Стремительности куплено на этот ход. */
  get celerityActions() {
    const flag = this.getFlag(SYSTEM_ID, "celerity");
    const phase = game.combat?.getFlag?.(SYSTEM_ID, "celerityPhase");
    if (phase?.active && flag?.key === phase.key) return flag.n ?? 0;
    return this._roundFlag("celerity")?.n ?? 0;
  }
  /** Гару: действий за Ярость в этот ход больше меньшего из Ловкости и Смекалки — все сложности +3 (apps/werewolf.mjs). */
  get rageFast() { const f = this.getFlag(SYSTEM_ID, "celerity"); return !!(f?.rage && f.fast && f.key === VtMActor.roundKey()); }
  /** Неиспользованные дополнительные действия (в фазе Стремительности). */
  get celerityActionsRemaining() {
    const flag = this.getFlag(SYSTEM_ID, "celerity");
    const phase = game.combat?.getFlag?.(SYSTEM_ID, "celerityPhase");
    if (!phase?.active || flag?.key !== phase.key) return 0;
    return Math.max(0, (flag.n ?? 0) - (flag.used ?? 0));
  }
  /** Максимум действий, который можно оплатить сейчас с учётом Слабой крови. */
  get celerityMaxBuyable() {
    return celerityMaxBuyable(this.discipline("celerity"), this.celerityActions,
      this.system.blood?.value ?? 0, this.doubleBloodCost);
  }

  /** Могущество: 1 кровь — до конца хода точки становятся автоуспехами проверок Силы и соответствующего урона. */
  async activatePotence() {
    const n = this.discipline("potence");
    if (!n || this.potenceActive) return false;
    const combat = game.combat;
    if (combat?.started && combat.combatant?.actor !== this) {
      ui.notifications.warn(t("Combat.PotenceTurn"));
      return false;
    }
    if (!(await this.spendBlood(1))) return false;
    await this.setFlag(SYSTEM_ID, "potence", { key: VtMActor.potenceTurnKey(), at: Date.now() });
    this.#notice(`<i class="fa-solid fa-hand-fist"></i> ${t("Combat.PotenceOn", { n })}`);
    return true;
  }

  /** Переключатель Могущества в HUD: повторное нажатие снимает усиление без возврата потраченной крови. */
  async togglePotence() {
    if (!this.discipline("potence")) return false;
    if (!this.potenceActive) return this.activatePotence();
    await this.unsetFlag(SYSTEM_ID, "potence");
    this.#notice(`<i class="fa-solid fa-hand-fist"></i> ${t("Combat.PotenceOff")}`);
    return false;
  }

  /**
   * Стремительность: один пункт крови (вдвое при Слабой крови) открывает до рейтинга
   * Дисциплины дополнительных физических действий после обычных ходов; каждое выбранное
   * действие снимает одну точку с бонуса Ловкости на этот ход. Лимит крови за ход не действует.
   */
  async buyCelerityActions(n) {
    const combat = game.combat, max = this.discipline("celerity");
    if (!combat?.started || combat.combatant?.actor !== this) {
      ui.notifications.warn(t("Combat.CelerityBuyOnTurn")); return false;
    }
    if (combat.getFlag?.(SYSTEM_ID, "celerityPhase")?.active) {
      ui.notifications.warn(t("Combat.CelerityPhaseFirst")); return false;
    }
    // Дар Клото (Темпорис 5): иной источник лишних действий — окончательная смерть (V20)
    const clotho = this.powerEffects.find(e => e.power === "temporis:5");
    if (clotho) {
      const { allowAnyway } = await import("../apps/rule-gate.mjs");
      if (!(await allowAnyway(this, t("BL.ClothoCelerity")))) return false;
    }
    if (!this.hasBlood) return ui.notifications.warn(t("Notify.NoBlood", { name: this.name }));
    if (this.statuses?.has("r-staked") || this.statuses?.has("r-torpor")) {
      ui.notifications.warn(t("Notify.NoBloodState", { name: this.name })); return false;
    }
    if (this.system.health?.incapacitated || this.statuses?.has("r-stunned")) {
      ui.notifications.warn(t("Combat.CelerityCannotAct")); return false;
    }
    n = Math.clamp(Math.floor(Number(n) || 0), 0, max);
    const had = this.celerityActions;
    if (n <= had) return false;
    const cost = celerityBloodCost(had, n, this.doubleBloodCost);
    const cur = this.system.blood?.value ?? 0;
    if (cur < cost) return ui.notifications.warn(t("Notify.NoBlood", { name: this.name }));
    // Стремительность не входит в лимит крови за ход (V20); цена Слабой крови
    // при этом удваивается. Флаг хранит число купленных и потраченных действий.
    await this.update({ "system.blood.value": cur - cost,
      [`flags.${SYSTEM_ID}.celerity`]: { key: VtMActor.roundKey(), at: Date.now(), n, used: 0 } });
    this.#notice(`<i class="fa-solid fa-forward"></i> ${t("Combat.CelerityOn", { n, cost, left: Math.max(0, max - n) })}`);
    return true;
  }

  /** Потратить одно купленное действие в отдельной фазе Стремительности. */
  async consumeCelerityAction() {
    const combat = game.combat;
    const phase = combat?.getFlag?.(SYSTEM_ID, "celerityPhase");
    if (!phase?.active || phase.queue?.[phase.index]?.actorUuid !== this.uuid) return false;
    const flag = this.getFlag(SYSTEM_ID, "celerity");
    if (!flag || flag.key !== phase.key || (flag.used ?? 0) >= (flag.n ?? 0)) return false;
    const used = (flag.used ?? 0) + 1;
    // Игрок обновляет только собственный лист. Флаг боя принадлежит Рассказчику;
    // его клиент продвинет общую очередь через updateActor.
    await this.setFlag(SYSTEM_ID, "celerity", { ...flag, used });
    return true;
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
    // Проклятие тела (Огам 3): вампир не тратит кровь — кроме ежевечерней на пробуждение
    const cursed = this.effects.find(e => !e.disabled && e.flags?.[SYSTEM_ID]?.noBloodSpend);
    if (cursed) {
      const { allowAnyway } = await import("../apps/rule-gate.mjs");
      if (!(await allowAnyway(this, t("BL.CurseNoBlood", { name: cursed.name })))) return false;
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
    // гуль-дампир (Accursed Heirs): сначала своя кровь, витэ вампира — когда своя кончилась
    const vitae = this.isDhampir ? this.system.dhampir?.vitae ?? 0 : 0;
    if (cur + vitae < n) { ui.notifications.warn(t("Notify.NoBlood", { name: this.name })); return false; }
    const base = doubled ? n / 2 : n;
    const fromVitae = Math.max(0, n - cur);
    await this.update({ "system.blood.value": cur - (n - fromVitae), ...(fromVitae ? { "system.dhampir.vitae": vitae - fromVitae } : {}),
      ...(turnKey ? { [`flags.${SYSTEM_ID}.bloodTurn`]: { key: turnKey, n: spentTurn + base } } : {}) });
    if (cur >= 5 && cur - n < 5 && this.isVampire)
      import("../dice/virtue-checks.mjs").then(m => m.suggestCheck(this, "frenzy", { reason: t("CheckPrompt.Hunger", { n: cur - n }), difficulty: 6 }));
    if (doubled) this.#notice(`<i class="fa-solid fa-droplet"></i> ${t("Notify.BloodDoubled", { n })}`);
    else if (reason) this.#notice(`<i class="fa-solid fa-droplet"></i> ${t("Notify.BloodSpent", { n, reason })}`);
    return true;
  }

  /** Дампир пьёт витэ вампира: сначала восполняется свой «заряд», излишек — витэ гуля (в желудке — 2, сверх — перебор). */
  async drinkVitae(n = 1) {
    if (!this.isDhampir) return null;
    const b = this.system.blood, room = Math.max(0, b.max - b.value), own = Math.min(room, n), extra = n - own;
    const vitae = (this.system.dhampir?.vitae ?? 0) + extra;
    await this.update({ "system.blood.value": b.value + own, ...(extra ? { "system.dhampir.vitae": vitae } : {}) });
    this.#notice(`<i class="fa-solid fa-droplet"></i> ${t(extra ? (vitae > 2 ? "Dhampir.VitaeOver" : "Dhampir.VitaeGast") : "Dhampir.VitaeCharge", { name: this.name, n: vitae })}`);
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
    // дух Умбры (W20, гл. 11): уровней здоровья нет — любой урон снимает Эссенцию; без Эссенции дух растворяется в Умбре
    if (this.isSpirit) {
      const e = { ...this._source.system.spirit.essence }, left = Math.max(0, e.value - amount);
      await this.update({ "system.spirit.essence.value": left });
      return this.#notice(`<i class="fa-solid fa-wind"></i> ${t("Notify.SpiritHit", { n: e.value - left, left, max: e.max })}${left ? "" : ` <b class="r-fate">${t("Fate.spiritGone")}</b>`}`);
    }
    const src = this._source.system.health;
    const h = { bashing: src.bashing, lethal: src.lethal, aggravated: src.aggravated };
    // призрак (Wraith 20, гл. 11): шкала — постоянный Корпус, исход — колебание и Испытания (apps/wraith.mjs)
    if (this.type === "wraith") return (await import("../apps/wraith.mjs")).corpusDamage(this, amount, type);
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
    // в бою: весь ход лечиться — или действовать и рискнуть: Выносливость + Выживание (сл. 8);
    // неудача — кровь впустую, провал — ещё 1 кровь и 1 повреждение (правила системы, «Тривиальные задачи»)
    const fighting = game.combat?.started && game.combat.combatants.some(c => c.actor === this);
    if (fighting) {
      const how = await foundry.applications.api.DialogV2.wait({
        window: { title: t("Heal.Title"), icon: "fa-solid fa-hand-holding-droplet" }, classes: ["vtm20", "r-dialog"], position: { width: 460 },
        content: `<div class="r-gate-body"><i class="fa-solid fa-hand-holding-droplet r-gate-ico"></i><div class="r-gate-text">
          <p class="r-gate-why">${t("Heal.Why", { n: cost })}</p><p class="r-gate-hint">${t("Heal.Hint")}</p></div></div>`,
        buttons: [{ action: "focus", icon: "fa-solid fa-bed", label: t("Heal.Focus"), default: true },
          { action: "act", icon: "fa-solid fa-dice-d10", label: t("Heal.Act") }],
        rejectClose: false
      });
      if (!how) return;
      if (how === "act") {
        if (!(await this.spendBlood(cost))) return;
        const { rollPool } = await import("../dice/roll.mjs");
        const res = await rollPool({ actor: this, title: t("Heal.Roll"), pool: (this.system.attributes.stamina?.total ?? 0) + (this.system.abilities?.survival?.value ?? 0), difficulty: 8, kind: "check" });
        if (res?.outcome === "botch") {
          await this.spendBlood(1, { limit: false });
          await this.applyDamage(1, type === "aggravated" ? "lethal" : type);
          return this.#notice(`<i class="fa-solid fa-hand-holding-droplet"></i> ${t("Heal.Botch")}`);
        }
        if ((res?.successes ?? 0) < 1) return this.#notice(`<i class="fa-solid fa-hand-holding-droplet"></i> ${t("Heal.Wasted", { n: cost })}`);
        await this.healDamage(type, 1);
        return this.#notice(`<i class="fa-solid fa-hand-holding-droplet"></i> ${t("Notify.Healed", { type: game.i18n.localize(VTM20.damageTypes[type].label), n: cost })}`);
      }
    }
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

  /** Состав пула прочности; используется также для прозрачного отображения Стойкости. */
  soakBreakdown(type, { armor = true, fangs = false, pierce = 0, silver = false } = {}) {
    const s = this.system;
    if (this.isSpirit) return [{ label: t("Willpower"), value: s.spirit.willpower }];
    const stamina = s.attributes.stamina.total;
    // Одежда и мелкие вещи превращаются вместе с телом; броня не действует в звериной и туманной формах (V20, Метаморфозы).
    const arm = armor && !this.system.fx?.beastForm && !this.system.fx?.mistForm && !this.system.fx?.shadowForm ? Math.max(0, this.armor.rating - pierce) : 0;
    const form = s.formFx?.soak ?? 0;
    let parts;
    // призрак (Wraith 20, гл. 11, «Поглощение»): Стойкость против ударного и летального; губительный — только броня
    if (this.type === "wraith") {
      const labels = { stamina: this.traitLabel("attributes.stamina"), armor: t("Sheet.Armor") };
      const p = { stamina: type === "aggravated" ? 0 : stamina, armor: arm };
      return Object.entries(p).filter(([, v]) => v > 0).map(([k, value]) => ({ label: labels[k], value }));
    }
    if (this.type === "werewolf") {
      const weak = s.werewolf.breedForm;
      if (silver && !weak) return [];
      // Сохраняем отдельные правила Гару: порода ограничивает прочность в форме,
      // но не меняет формулу губительного урона (W20, гл. 6).
      const parts = { stamina: 0, fortitude: 0, armor: 0, form };
      if (type === "bashing") {
        parts.stamina = stamina;
        parts.armor = arm;
      } else if (type === "lethal") {
        parts.stamina = weak ? 0 : stamina;
        parts.armor = arm;
      } else {
        parts.stamina = weak ? 0 : stamina;
        parts.armor = fangs ? arm : 0;
      }
      const labels = { stamina: this.traitLabel("attributes.stamina"), armor: t("Sheet.Armor"), form: t("Combat.FormSoak") };
      return Object.entries(parts).filter(([, value]) => value > 0).map(([key, value]) => ({ label: labels[key], value }));
    } else {
      // Стойкость добавляет кости против всех видов урона, включая губительный.
      const tough = this.isVampire || (["creature", "spirit"].includes(this.type) && s.supernatural) || (this.type === "demon" && s.apocalyptic);
      parts = soakComponents({ damageType: type, stamina, fortitude: this.discipline("fortitude"), armor: arm, form,
        tough, fangs, staminaVsFangs: !!s.fx?.staminaVsFangs });
    }
    const labels = { stamina: this.traitLabel("attributes.stamina"), fortitude: Codex.disciplineLabel("fortitude"),
      armor: t("Sheet.Armor"), form: t("Combat.FormSoak") };
    // Укрепление тела (Искусство тканей): +1 куб к поглощению за успех (apps/target-powers.mjs, soakDice)
    const fleshDice = [...this.effects].reduce((s, e) => s + (!e.disabled && Number(e.flags?.[SYSTEM_ID]?.soakDice) || 0), 0);
    if (fleshDice) { parts.flesh = fleshDice; labels.flesh = t("TP.FleshSoak"); }
    // Доспех Терры: +прочность по виду урона; Слияние с камнем: прочность втрое
    const terra = s.fx?.soakBonus?.[type] ?? 0;
    if (terra) { parts.terra = terra; labels.terra = t("TP.TerraSoak"); }
    if (s.fx?.stoneMeld) {
      const base = Object.values(parts).reduce((sum, v) => sum + (Number(v) || 0), 0);
      if (base > 0) { parts.stone = base * 2; labels.stone = t("TP.StoneSoak"); }
    }
    return Object.entries(parts).filter(([, value]) => value > 0).map(([key, value]) => ({ label: labels[key], value }));
  }

  /** Пул прочности против типа урона (04). */
  soakPool(type, options = {}) {
    if (this.isSpirit) return this.system.spirit.willpower;
    if (this.type === "werewolf") {
      const s = this.system, weak = s.werewolf.breedForm;
      if (options.silver && !weak) return 0;
    }
    return this.soakBreakdown(type, options).reduce((sum, part) => sum + part.value, 0);
  }

  /* ── Силы Дисциплин, действующие во времени (data/effects.mjs) ─────────── */

  /** Включённые силы: [{ effect, power, variant, def }]. */
  get powerEffects() { return activePowerEffects(this); }

  /** Создать предметы естественного оружия силы только после завершения превращения. */
  async createPowerWeapons(effect) {
    const flags = effect?.flags?.[SYSTEM_ID];
    if (!flags?.power || flags.ready === false) return [];
    const def = effectDef(flags.power, flags.variant ?? "", flags.shapeConfig ?? null);
    const specs = [...(def?.weapons ?? []), ...(def?.weapon ? [def.weapon] : [])];
    if (!specs.length) return [];
    const existing = this.items.filter(i => i.type === "weapon" && i.getFlag?.(SYSTEM_ID, "power") === flags.power).length;
    const missing = specs.slice(existing);
    if (!missing.length) return [];
    return this.createEmbeddedDocuments("Item", missing.map(w => ({
      name: w.name, type: "weapon", img: `systems/${SYSTEM_ID}/assets/icons/weapon.svg`,
      system: { ...w, equipped: true }, flags: { [SYSTEM_ID]: { power: flags.power, supernatural: !!w.supernatural,
        naturalFormWeapon: !!w.naturalFormWeapon, fortitudeOnly: !!w.fortitudeOnly, fangs: !!w.fangs } }
    })));
  }

  /**
   * Включить силу: цена кровью и волей, эффект на актёре, естественное оружие.
   * @param {string} power  «дисциплина:уровень»
   * @param {object} o      variant (волк / летучая мышь), blood (сколько крови, где цена «1–3»),
   *                         hours (сколько часов, где срок по успехам)
   */
  async startPower(power, { variant = "", blood = null, hours = null, shapeConfig = null } = {}) {
    await Codex.loadTexts();   // описание силы для эффекта — из текстов справочника (догружаются после старта)
    const def = effectDef(power, variant, shapeConfig);
    if (!def || this.powerEffects.some(x => x.power === power)) return null;
    const { disc, power: p, level: lvl } = powerOfKey(Codex, power);
    const name = `${p?.name ?? power}${variant ? ` · ${t(`Fx.Variant.${variant}`)}` : ""}`;
    const cost = blood ?? (Array.isArray(def.cost?.blood) ? def.cost.blood[0] : (def.cost?.blood ?? 0));
    if (cost && !(await this.spendBlood(cost))) return null;
    if (def.cost?.willpower && !(await this.spendWillpower(def.cost.willpower))) return null;
    // «на час» и «до рассвета» — срок по часам хроники (apps/timers.mjs).
    // Превращения занимают 1–3 собственных хода в бою; вне боя становятся готовыми сразу.
    const now = getClock(), until = untilFor(def.mode, { hours: hours ?? (Number(def.hours) || 1), now });
    const requiredTurns = def.transformTurns === "blood" ? Math.max(1, 4 - (Number(cost) || 1)) : Number(def.transformTurns) || 0;
    const inCombat = !!(requiredTurns && game.combat?.started && game.combat.combatants.some(c => c.actor?.id === this.id));
    const ready = !inCombat || requiredTurns <= 0;
    const [effect] = await this.createEmbeddedDocuments("ActiveEffect", [{
      name, img: Codex.disciplineIcon(disc), statuses: [`r-fx-${disc}-${lvl}`], description: p?.html ?? "",
      changes: ready ? (def.changes ?? []) : [],
      flags: { [SYSTEM_ID]: { power, variant, mode: def.mode, ready, ...(requiredTurns ? { transformTurnsLeft: ready ? 0 : requiredTurns } : {}),
        ...(shapeConfig ? { shapeConfig } : {}),
        ...(def.charges ? { charges: cost } : {}), ...(until ? { start: now, until } : {}) } }
    }]);
    // Пока персонаж превращается, оружие ещё недоступно. Оно появится в инвентаре
    // только когда обработчик ходов переведёт ActiveEffect в ready=true.
    if (ready) await this.createPowerWeapons(effect);
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
      } else if (this.isVampire && !(await (await import("../apps/golconda.mjs")).golcondaSkipsWake(this))) {
        // Кровоточащая рана: на пробуждение уходит 2 крови вместо 1; Голконда — кровь раз в неделю (apps/golconda.mjs)
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
      case "attribute": return this.system.wraith?.spectre?.on ? current * 3 : X.attribute(current);   // Спектр (Wraith 20, гл. 10): Атрибут × 3
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
      // Кровное право дампира (Accursed Heirs, гл. 4): новое — 7, далее текущее × 5, не выше 3
      case "bloodright": return current >= 3 ? null : current === 0 ? 7 : current * 5;
      // Оборотень (W20, гл. 3): Ярость — текущее, Гнозис — текущее × 2 (с нуля — как 1), Дар — уровень × 3 своего списка, × 5 чужого
      case "rage": return Math.max(1, current);
      case "gnosis": return Math.max(1, current) * 2;
      case "gift": return extra.level * (extra.own ? 3 : 5);
      // Охотник при росте за опыт (Players Guide, гл. 2): начальная Убеждённость и Добродетели охоты
      case "hunterConviction": case "hunterVirtue": case "lostVirtue": return hunterXpCost(this, kind, current, extra.key);
      // M20: новая Сфера 10, родовая × 7, прочая × 8; Арете × 8 (и Поиск — на совести рассказчика)
      case "mageArete": case "mageSphere": return mageXpCost(this, kind, current, extra.key);
      // колдун (M20 Sorcerer, гл. 3): новая нумина 7, нумина второго вида (Путь при феноменах и наоборот) 21, рост × 7
      case "sorcNumen": return current >= 5 ? null : current === 0 ? (extra.secondary ? 21 : 7) : current * 7;
      // призрак (Wraith 20, гл. 8): новый Арканос 7, далее текущее × 3; Страсть и Оковы — новая 3, далее × 3 (с позволения рассказчика)
      case "arcanos": return current >= 5 ? null : this.system.wraith?.spectre?.on ? (current === 0 ? 6 : current * 2) : current === 0 ? 7 : current * 3;
      case "passion": case "fetter": return current >= 5 ? null : current === 0 ? 3 : current * 3;
      default: return null;
    }
  }

  /**
   * Купить следующую точку за опыт (01): лист (кнопки «+») и окно опыта. doc — персонаж или его предмет,
   * path — путь к значению в doc. Возвращает потраченный опыт или null.
   */
  /** Текущее значение черты и цена следующей точки — как при покупке. */
  xpCostOf({ doc = this, path, kind }) {
    const sorcKey = kind === "sorcNumen" ? path.split(".").pop() : null;   // нумины лежат списком — путь «…numina.<ключ>»
    const cur = kind === "hunterConviction" ? startConviction(this) : sorcKey ? (this.system.sorcerer.numina.find(n => n.key === sorcKey)?.dots ?? 0)
      : Number(foundry.utils.getProperty(doc._source, path) ?? 0);
    const extra = sorcKey ? numenXpExtra(this, sorcKey) : kind === "hunterVirtue" || kind === "mageSphere" ? { key: path.split(".").pop() }
      : doc !== this && doc.type === "discipline" ? { key: doc.system.key, inClan: doc.system.inClan || this.clanDisciplines.includes(doc.system.key) }
      : doc !== this && doc.type === "thaumPath" ? { primary: doc.system.primary }
      : doc !== this && doc.type === "lore" ? { key: doc.system.key } : {};
    return { cur, cost: this.xpCost(kind, cur, extra), sorcKey };
  }

  /** Откуда цена: «новая — 3», «текущее 2 × 5 = 10» или просто число. */
  static xpWhy(cur, cost) {
    if (cost == null) return "";
    if (!cur) return t("Xp.WhyNew", { n: cost });
    const k = cost / cur;
    return Number.isInteger(k) && k > 1 ? t("Xp.WhyMul", { cur, k, n: cost }) : t("Xp.WhyFlat", { n: cost });
  }

  async buyWithXp({ doc = this, path, kind, label, confirm = true, note = "" }) {
    const { cur, cost, sorcKey } = this.xpCostOf({ doc, path, kind });
    if (cost == null) return null;
    const xp = this.system.experience;
    if (xp.available < cost) { ui.notifications.warn(t("Notify.NoXp", { cost, have: xp.available })); return null; }
    label ??= doc.name;
    if (confirm && !(await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Xp.BuyTitle") }, content: `<p>${t("Xp.BuyConfirm", { label, from: cur, to: cur + 1, cost })}</p>`
    }))) return null;
    // начальная Убеждённость растёт вместе со шкалой
    if (sorcKey) await this.update({ "system.sorcerer.numina": this.system.sorcerer.numina.map(n => ({ ...n, ...(n.key === sorcKey ? { dots: cur + 1 } : {}) })) });
    else await doc.update({ [path]: cur + 1, ...(kind === "hunterConviction" ? { "system.hunter.conviction": Math.min(10, (this.system.hunter?.conviction ?? 0) + 1) } : {}) });
    const log = foundry.utils.deepClone(this._source.system.experience.log);
    log.unshift({ amount: -cost, reason: `${label}: ${cur} → ${cur + 1} (${this.constructor.xpWhy(cur, cost)})${note ? ` · ${note}` : ""}`, date: new Date().toLocaleDateString("ru-RU") });
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
