// module/documents/actor.mjs
// Актёр V20: траты крови и воли, урон и прочность, лечение, пулы бросков.

import { VTM20, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { effectDef, activePowerEffects } from "../data/effects.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

export class VtMActor extends Actor {

  /* ── Начальные значения ─────────────────────────────────────────────── */

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    const icons = { vampire: "vampire.svg", ghoul: "ghoul.svg", mortal: "mortal.svg", creature: "creature.svg" };
    const upd = {};
    if (!data.img || data.img === CONST.DEFAULT_TOKEN) upd.img = `systems/${SYSTEM_ID}/assets/icons/${icons[this.type]}`;
    const proto = {
      "prototypeToken.bar1.attribute": "health",
      "prototypeToken.bar2.attribute": this.type === "mortal" ? "willpower" : "blood",
      "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
      "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER
    };
    if (this.type === "vampire" || this.type === "ghoul") Object.assign(proto, { "prototypeToken.sight.enabled": true });
    this.updateSource({ ...upd, ...proto });
  }

  /* ── Свойства ───────────────────────────────────────────────────────── */

  get isVampire() { return this.type === "vampire"; }
  get hasBlood() { return !!this.system.hasBlood; }

  /** Ключ Пути и его данные из справочника. */
  get path() { return Codex.path(this.system.morality.path); }

  /** Какая Добродетель стоит в слоте: совесть/решимость, самоконтроль/инстинкты. */
  virtueKey(slot) {
    if (slot === "courage") return "courage";
    const v = this.path?.virtues ?? ["conscience", "selfControl"];
    if (slot === "conscience") return v.includes("conviction") ? "conviction" : "conscience";
    if (slot === "selfControl") return v.includes("instinct") ? "instinct" : "selfControl";
    return slot;
  }

  /** Клановые Дисциплины (по справочнику). */
  get clanDisciplines() {
    if (this.type === "ghoul") return ["potence", "fortitude", "celerity"];
    if (this.type !== "vampire") return [];
    const clan = Codex.clan(this.system.clan);
    if (!clan) return [];
    const pick = clan.choice?.includes(this.system.clanChoice) ? [this.system.clanChoice] : [];
    return [...clan.disciplines, ...pick];
  }

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

  #roundFlag(name) {
    const f = this.getFlag(SYSTEM_ID, name);
    if (!f) return null;
    const key = VtMActor.roundKey();
    if (key ? f.key === key : (!f.key && Date.now() - (f.at ?? 0) < 60000)) return f;
    return null;
  }

  /** Мощь включена кровью на этот ход. */
  get potenceActive() { return !!this.#roundFlag("potence"); }
  /** Сколько дополнительных действий Стремительности куплено на этот ход. */
  get celerityActions() { return this.#roundFlag("celerity")?.n ?? 0; }

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

  async spendBlood(n = 1, { reason = "" } = {}) {
    if (!this.hasBlood) return false;
    // Кол в сердце и торпор: кровь не тратится (04)
    if (this.statuses?.has("r-staked") || this.statuses?.has("r-torpor")) {
      ui.notifications.warn(t("Notify.NoBloodState", { name: this.name })); return false;
    }
    const cur = this.system.blood.value;
    // Слабая кровь и Пятнадцатое поколение: любая трата вдвое (кроме ежевечерней — она в awaken)
    const doubled = this.doubleBloodCost;
    if (doubled) n *= 2;
    if (cur < n) { ui.notifications.warn(t("Notify.NoBlood", { name: this.name })); return false; }
    await this.update({ "system.blood.value": cur - n });
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
    // Состояние на токене: торпор или смерть
    if (fate === t("Fate.finalDeath") || fate === t("Fate.death")) await this.toggleStatusEffect?.("dead", { active: true, overlay: true });
    else if (fate === t("Fate.torpor")) await this.toggleStatusEffect?.("r-torpor", { active: true });
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

  /** Пул прочности против типа урона (04). */
  soakPool(type, { armor = true, fangs = false, pierce = 0 } = {}) {
    const s = this.system;
    const fort = this.discipline("fortitude");
    const stamina = s.attributes.stamina.total;
    // пробитие брони: столько точек брони не учитывается (V20 Dark Ages, M20 Victorian Age)
    const arm = armor ? Math.max(0, this.armor.rating - pierce) : 0;
    if (type === "bashing") return stamina + fort + arm;
    const tough = this.isVampire || (this.type === "creature" && s.supernatural);
    if (type === "lethal") return (tough ? stamina : 0) + fort + arm;
    // губительный: только Стойкость; броня — лишь против клыков и когтей;
    // Шкура гадюки — и Выносливость против когтей и клыков (Серпентис 3)
    return fort + (fangs ? arm : 0) + (fangs && s.fx?.staminaVsFangs ? stamina : 0);
  }

  /* ── Силы Дисциплин, действующие во времени (data/effects.mjs) ─────────── */

  /** Включённые силы: [{ effect, power, variant, def }]. */
  get powerEffects() { return activePowerEffects(this); }

  /**
   * Включить силу: цена кровью и волей, эффект на актёре, естественное оружие.
   * @param {string} power  «дисциплина:уровень»
   * @param {object} o      variant (волк / летучая мышь), blood (сколько крови, где цена «1–3»)
   */
  async startPower(power, { variant = "", blood = null } = {}) {
    const def = effectDef(power, variant);
    if (!def || this.powerEffects.some(x => x.power === power)) return null;
    const [disc, lvl] = power.split(":");
    const p = Codex.discipline(disc)?.powers.find(x => x.level === Number(lvl));
    const name = `${p?.name ?? power}${variant ? ` · ${t(`Fx.Variant.${variant}`)}` : ""}`;
    const cost = blood ?? (Array.isArray(def.cost?.blood) ? def.cost.blood[0] : (def.cost?.blood ?? 0));
    if (cost && !(await this.spendBlood(cost))) return null;
    if (def.cost?.willpower && !(await this.spendWillpower(def.cost.willpower))) return null;
    const [effect] = await this.createEmbeddedDocuments("ActiveEffect", [{
      name, img: Codex.disciplineIcon(disc), statuses: [`r-fx-${disc}-${lvl}`], description: p?.html ?? "",
      flags: { [SYSTEM_ID]: { power, variant, mode: def.mode, ...(def.charges ? { charges: cost } : {}) } }
    }]);
    if (def.weapon) await this.createEmbeddedDocuments("Item", [{
      name: def.weapon.name, type: "weapon", img: `systems/${SYSTEM_ID}/assets/icons/weapon.svg`,
      system: { ...def.weapon, equipped: true }, flags: { [SYSTEM_ID]: { power } }
    }]);
    const price = [cost && `<i class="fa-solid fa-droplet"></i>${cost}`, def.cost?.willpower && `<i class="fa-solid fa-star"></i>${def.cost.willpower}`].filter(Boolean).join(" ");
    this.#notice(`<i class="fa-solid fa-wand-sparkles"></i> ${t("Fx.On", { name })}${price ? ` <span class="r-muted">${price}</span>` : ""}`);
    return effect;
  }

  /** Выключить силу: эффект и её естественное оружие. */
  async endPower(effect) {
    const power = effect.getFlag(SYSTEM_ID, "power");
    const items = this.items.filter(i => i.getFlag(SYSTEM_ID, "power") === power).map(i => i.id);
    if (items.length) await this.deleteEmbeddedDocuments("Item", items);
    const name = effect.name;
    await effect.delete();
    this.#notice(`<i class="fa-solid fa-power-off"></i> ${t("Fx.Off", { name })}`);
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
      default: return null;
    }
  }

  /* ── Сообщения ──────────────────────────────────────────────────────── */

  #notice(html) {
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="r-notice">${html}</div>`,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
  }
}
