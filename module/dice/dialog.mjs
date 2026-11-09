// module/dice/dialog.mjs
// Окно проверки: две черты пула, модификаторы, сложность, специализация, воля,
// штраф за раны. Пул пересчитывается на лету.

import { swayOf } from "../ui/strategy.mjs";
import { totemTraits, totemOf, totemPools, totemBanned, spendTotemPool } from "../apps/coterie.mjs";
import { VTM20, SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { rollPool, odds, chancesView, tormentRule, tormentOdds } from "./roll.mjs";
import { meritModsFor } from "../data/merit-mods.mjs";
import { substanceMods } from "../data/vessels.mjs";
import { dreadDice, frenzyDiff, mindDiff, centered } from "../apps/target-powers.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

export class RollDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-roll-dialog"],
    tag: "form",
    window: { title: "VTM20.Roll.DialogTitle", icon: "fa-solid fa-dice-d10" },
    position: { width: 460 },
    form: { handler: RollDialog.#onSubmit, closeOnSubmit: true, submitOnChange: false },
    actions: { setDifficulty: RollDialog.#onSetDifficulty, cancel: RollDialog.#onCancel, bump: RollDialog.#onBump }
  };

  static PARTS = { form: { template: `${SYSTEM_PATH}/templates/dice/roll-dialog.hbs` } };

  /**
   * @param {Actor} actor
   * @param {object} cfg { trait1, trait2, difficulty, bonus, title, kind, extra, reflexive, specialty, willpower, lockTraits }
   */
  constructor(actor, cfg = {}) {
    super({ window: { title: cfg.title || t("Roll.DialogTitle") } });
    this.actor = actor;
    this.cfg = cfg;
    this.values = {
      trait1: cfg.trait1 ?? "", trait2: cfg.trait2 ?? "",
      bonus: cfg.bonus ?? 0, difficulty: cfg.difficulty ?? VTM20.defaultDifficulty, actions: cfg.celerityAction ? 1 : (cfg.actions ?? 1),
      contest: cfg.contest ?? "simple", need: cfg.need ?? 5,
      specialty: !!cfg.specialty, willpower: !!cfg.willpower,
      wounds: !cfg.reflexive, physical: true,
      payBlood: (cfg.bloodCost ?? 0) > 0, payWill: !!cfg.willpowerCost, light: false, fxOn: [], overdraw: 0, sway: "", horrid: true,
      messageMode: game.settings.get("core", "messageMode")
    };
  }

  static prompt(actor, cfg = {}) { return new RollDialog(actor, cfg).render({ force: true }); }

  /** Варианты черт для выпадающих списков. */
  #traitOptions() {
    const a = this.actor, s = a.system;
    const loc = k => game.i18n.localize(k);
    const opt = (value, label, n) => ({ value, label: `${label} (${n})` });
    const era = game.settings.get("vtm20e-kamen-edition", "era");
    const abil = VTM20.abilitiesForEra(era, a.type);
    const groups1 = [
      { label: loc("VTM20.Sheet.Attributes"), options: Object.keys(VTM20.attributes).map(k => opt(`attributes.${k}`, loc(VTM20.attributes[k].label), s.attributes[k].total)) },
      { label: loc("VTM20.Sheet.Virtues"), options: ["conscience", "selfControl", "courage"].map(k => opt(`virtues.${k}`, a.traitLabel(`virtues.${k}`), a.traitValue(`virtues.${k}`))) },
      { label: loc("VTM20.Sheet.Other"), options: [
        opt("willpower.permanent", t("Willpower"), s.willpower.permanent),
        opt("morality.value", a.traitLabel("morality.value"), s.morality.value)
      ] }
    ];
    let groups2 = [
      ...Object.entries(abil).map(([g, keys]) => ({
        label: loc(VTM20.abilityGroups[g].label),
        options: keys.map(k => opt(`abilities.${k}`, loc(VTM20.abilities[k].label), s.abilities[k].value))
      })),
      { label: loc("VTM20.Sheet.Secondary"), options: s.secondary.map((x, i) => opt(`secondary.${i}`, x.name || "—", x.value)) },
      { label: loc("VTM20.Sheet.Disciplines"), options: a.items.filter(i => i.type === "discipline").map(i => opt(`disciplines.${i.system.key}`, i.name, i.system.value)) }
    ].filter(g => g.options.length);
    if (this.cfg.physicalOnly) {
      const physical = new Set(VTM20.attributeGroups.physical.attributes);
      const physicalAbilities = new Set(["athletics", "brawl", "drive", "firearms", "melee", "ride", "stealth", "survival"]);
      groups1.splice(0, groups1.length, ...groups1.filter(g => g.options.some(o => physical.has(o.value.split(".").at(-1))))
        .map(g => ({ ...g, options: g.options.filter(o => o.value.startsWith("attributes.") && physical.has(o.value.split(".").at(-1))) })));
      groups2 = groups2.map(g => ({ ...g, options: g.options.filter(o => o.value.startsWith("abilities.") && physicalAbilities.has(o.value.split(".").at(-1))) }))
        .filter(g => g.options.length);
    }
    return { groups1, groups2 };
  }

  /** Подсчёт пула и состава. */
  /** Чудовищный облик и Запугивание с социальной характеристикой — можно бросать Силой (галочка). */
  get horridAvailable() {
    const v = this.values, a = this.actor;
    return !!a.system.fx?.intimStrength && [v.trait1, v.trait2].includes("abilities.intimidation")
      && [v.trait1, v.trait2].some(p => p?.startsWith("attributes.") && VTM20.attributeGroups.social.attributes.includes(p.split(".")[1]));
  }

  compute() {
    const v = this.values, a = this.actor;
    const bd = [];
    let pool = 0;
    // Колдовство (V20, гл. 10): характеристика «без усиления кровью и Дисциплинами» — берём природное значение
    const base = !!this.cfg.baseAttr;
    // Чудовищный облик (Преображение 4): для Запугивания — Сила вместо социальной характеристики
    const horrid = v.horrid && this.horridAvailable;
    for (const p of [v.trait1, v.trait2]) {
      if (!p) continue;
      const pure = base && p.startsWith("attributes.");
      let n = pure ? a.system.attributes[p.split(".")[1]]?.value ?? 0 : a.traitValue(p);
      if (horrid && !pure && p.startsWith("attributes.") && VTM20.attributeGroups.social.attributes.includes(p.split(".")[1])) {
        const str = a.system.attributes.strength?.total ?? 0;
        if (str > n) { pool += str; bd.push({ label: t("Roll.HorridStrength"), value: str }); continue; }
      }
      pool += n; bd.push({ label: pure ? `${a.traitLabel(p)} · ${t("Magic.BaseAttr")}` : a.traitLabel(p), value: n });
    }
    // Мощь к Силе, Стремительность к Ловкости (Дисциплины/06, 14).
    // Фиксированный пул — это базовое число костей силы; модификаторы физических
    // Дисциплин всё равно применяются к выбранной физической характеристике.
    const selectedAttrs = [v.trait1, v.trait2].filter(p => p?.startsWith("attributes.")).map(p => p.split(".")[1]);
    const attr = selectedAttrs[0] ?? null;
    // Если в составной проверке Сила стоит второй характеристикой, Мощь всё равно должна сработать.
    const physAttr = selectedAttrs.find(k => k === "strength" || k === "dexterity") ?? null;
    const phys = physAttr && !base ? a.physicalDisciplineBonus(physAttr) : 0;
    if (phys && v.physical) { pool += phys; bd.push({ label: Codex.disciplineLabel(physAttr === "strength" ? "potence" : "celerity"), value: phys }); }
    // Мощь, включённая кровью: автоуспехи ко всем проверкам, в которых участвует Сила,
    // независимо от того, первая она или вторая характеристика; фиксированный пул тоже поддерживается.
    const potentialAuto = !base && selectedAttrs.includes("strength") ? a.physicalAuto("strength") : 0;
    const auto = v.physical ? potentialAuto : 0;
    if (auto) bd.push({ label: t("Roll.AutoSuccess"), value: auto });
    if (v.bonus) { pool += v.bonus; bd.push({ label: t("Roll.Modifier"), value: v.bonus }); }
    // тотем стаи (W20, гл. 7): «дети Химеры получают три точки Загадок» — точки тотема прибавляются к черте в броске
    const tt = totemTraits(a);
    if (tt) for (const p of [v.trait1, v.trait2]) {
      const extra = p ? tt.traits[p] ?? 0 : 0;
      if (extra > 0) { pool += extra; bd.push({ label: game.i18n.format("VTM20.Werewolf.TotemTrait", { totem: tt.name }), value: extra }); }
    }
    // Харано Гару (W20): уныние — −1 кубик к каждому пулу
    if (a.statuses?.has("r-harano")) { pool -= 1; bd.push({ label: game.i18n.localize("VTM20.Status.harano"), value: -1 }); }
    // опора на влияние в сфере города (Стратегия): +1 кубик за каждые 2 фишки
    const sway = v.sway && swayOf(a).find(x => x.key === v.sway);
    if (sway) { pool += sway.dice; bd.push({ label: game.i18n.format("VTM20.Strategy.SwayLine", { name: sway.name }), value: sway.dice }); }
    const wp = a.system.health.penalty;
    if (wp && v.wounds && !centered(a)) { pool += wp; bd.push({ label: t("Roll.Wounds"), value: wp }); }
    const arm = a.armor.penalty;
    if (arm && attr === "dexterity") { pool -= arm; bd.push({ label: t("Roll.ArmorPenalty"), value: -arm }); }
    // Изъяны: яркий свет у Сетитов −1 кубик; Цимисхи без родной земли — пул вдвое за каждый день (02)
    if (v.light) { pool -= 1; bd.push({ label: t("Roll.BrightLight"), value: -1 }); }
    const soil = a.system.soilDays ?? 0;
    if (soil > 0 && VTM20.soilClans.includes(a.system.clan)) {
      const halved = Math.max(1, Math.floor(pool / 2 ** soil));
      bd.push({ label: t("Roll.NoSoil", { n: soil }), value: halved - pool }); pool = halved;
    }
    // Достоинства и недостатки (data/merit-mods.mjs): сами — по совпадению черт, прочие — галочкой
    const mm = meritModsFor(a, { traits: [v.trait1, v.trait2], kind: this.cfg.kind ?? "check", attributeGroups: VTM20.attributeGroups });
    const meritSit = mm.situ.map(m => ({ ...m, kind: "merit", value: m.dice || m.diff, on: v.fxOn.includes(`merit:${m.label}`) }));
    for (const m of [...mm.auto, ...meritSit.filter(x => x.on)]) if (m.dice) { pool += m.dice; bd.push({ label: m.label, value: m.dice }); }
    // вещества в выпитой крови (data/vessels.mjs): алкоголь, опиаты, галлюциногены, яд — кубики; стимуляторы и опиаты — к ярости
    const sm = substanceMods(a, { traits: [v.trait1, v.trait2], kind: this.cfg.kind ?? "check" });
    for (const d of sm.dice) { pool += d.value; bd.push(d); }
    // Устрашающий взор: −1 куб за успех до конца следующего хода (apps/target-powers.mjs)
    const socialRoll = [v.trait1, v.trait2].some(p => p?.startsWith("attributes.") && VTM20.attributeGroups.social.attributes.includes(p.split(".")[1]));
    for (const d of dreadDice(a, { social: socialRoll })) { pool += d.value; bd.push(d); }
    // кубы от действующих сил к Способности (Театр теней, Чёрный метаморфоз — data/effects.mjs, dice)
    for (const k of [v.trait1, v.trait2].filter(p => p?.startsWith("abilities.")).map(p => p.split(".")[1]))
      for (const d of a.system.fx?.dice?.[k] ?? []) { pool += d.value; bd.push(d); }
    // Апокалиптическая форма: кубики к выбранной Способности («Увеличенная способность», data/form.mjs)
    for (const p of [v.trait1, v.trait2]) for (const d of a.system.formFx?.dice?.[p?.split(".")[1]] ?? []) { pool += d.value; bd.push({ label: d.label, value: d.value }); }
    // Перебор падшего (гл. 9): кубики, выжатые из слуг
    if (this.#overdraw()) { pool += this.#overdraw(); bd.push({ label: t("Demon.Overdraw"), value: this.#overdraw() }); }
    // Ритуал почитания культа Привязанного (apps/cult.mjs): кубики к ближайшему призыву
    if (this.#veneration()) { pool += this.#veneration(); bd.push({ label: t("Cult.VenerationDice"), value: this.#veneration() }); }
    // Множественные действия (03): наименьший пул делится между действиями
    if (v.actions > 1) {
      const part = Math.floor(Math.max(0, pool) / v.actions);
      bd.push({ label: t("Roll.MultiActions", { n: v.actions }), value: part - pool }); pool = part;
    }
    const specs = [v.trait1, v.trait2].filter(p => a.traitSpecialtyEligible(p)).map(p => a.traitSpecialty(p)).filter(Boolean);
    // Сложность от включённых сил (data/effects.mjs): к Восприятию — сама, прочее — по обстоятельствам
    const fx = a.system.fx?.diff ?? {};
    const attrs = [v.trait1, v.trait2].filter(p => p?.startsWith("attributes.")).map(p => p.split(".")[1]);
    const social = attrs.some(k => VTM20.attributeGroups.social.attributes.includes(k));
    const formDiff = [v.trait1, v.trait2].flatMap(p => a.system.formFx?.diff?.[p?.split(".")[1]] ?? []);
    const physical = attrs.some(k => VTM20.attributeGroups.physical.attributes.includes(k));
    const diffAuto = [...(attrs.includes("perception") ? (fx.perception ?? []) : []), ...formDiff, ...sm.diff, ...frenzyDiff(a, this.cfg.kind),
      ...mindDiff(a, { physical, social, dex: attrs.includes("dexterity") }),
      ...mm.auto.filter(m => m.diff).map(m => ({ label: m.label, value: m.diff }))];
    const selectedTargets = [...(game.user.targets ?? [])];
    const earthTarget = selectedTargets.length === 1 ? selectedTargets[0]?.actor : null;
    const earthDetect = Number(earthTarget?.system?.fx?.detectDifficulty) || 0;
    const diffSit = [
      ...(social ? fx.social ?? [] : []).map(d => ({ ...d, kind: "social" })),
      ...(fx.climb ?? []).map(d => ({ ...d, kind: "climb" })),
      ...(attrs.includes("perception") ? fx.hearing ?? [] : []).map(d => ({ ...d, kind: "hearing" })),
      ...(attrs.includes("perception") ? fx.vision ?? [] : []).map(d => ({ ...d, kind: "vision" })),
      ...(attrs.includes("perception") ? fx.smell ?? [] : []).map(d => ({ ...d, kind: "smell" })),
      ...(earthDetect ? [{ label: t("Fx.EarthDetection"), value: earthDetect, kind: "earth" }] : []),
      // Отшельник (Hunter Players Guide, с. 19): рядом с чудовищами или наделёнными — все сложности +1
      ...(a.type === "hunter" && (Codex.hunter?.creeds ?? []).find(c => c.key === a.system.hunter?.creed)?.near
        ? [{ label: t("Hunter.NearNoise"), value: (Codex.hunter.creeds.find(c => c.key === a.system.hunter.creed).near), kind: "hermit" }] : []),
      ...this.#bearing(social)
    ].map((d, i) => ({ ...d, i, on: v.fxOn.includes(`${d.kind}:${d.label}`), hint: t(`Fx.Situ.${d.kind}`) }))
      .concat(meritSit.map(m => ({ label: m.label, value: m.value, dice: !!m.dice, kind: "merit", on: m.on, hint: m.hint })));
    for (const d of diffSit) if (d.on && d.dice && d.kind !== "merit") { pool += d.value; bd.push({ label: d.label, value: d.value }); }
    const diffShift = diffAuto.filter(d => !d.dice).reduce((s, d) => s + d.value, 0) + diffSit.filter(d => d.on && !d.dice).reduce((s, d) => s + d.value, 0);
    const effDifficulty = Math.clamp(v.difficulty + diffShift, 2, 10);
    return { pool: Math.max(0, pool), breakdown: bd, specialtyName: specs.join(", "), specialtyEligible: specs.length > 0,
      physicalBonus: phys || auto, physicalDisplay: Math.max(Number(phys) || 0, Number(potentialAuto) || 0),
      physicalPotentialAuto: Number(potentialAuto) || 0, attr, phys: Number(phys) || 0, diffAuto, diffSit, effDifficulty, auto: Number(auto) || 0 };
  }

  /** Итоговый пул. Фиксированный пул остаётся базовым, но принимает явные модификаторы окна и пассивные физические кости. */
  #rollPool(c) {
    const v = this.values, cfg = this.cfg;
    if (cfg.pool == null) return c.pool;
    return Math.max(0, cfg.pool + v.bonus + this.#overdraw()
      + (v.wounds ? this.actor.system.health.penalty : 0)
      + (v.physical ? c.phys : 0));
  }

  /**
   * Столп (V20, гл. 7): аура морали меняет сложность проверок, прямо с ней связанных (10 — −2, 9–8 — −1, 7–4 — нет, 3–2 — +1, 1 — +2).
   * У Человечности (Нормальность) — социальные броски, где персонаж выдаёт себя за человека или ищет симпатии смертных;
   * у Путей — любые броски, к которым относится их аура. Галочкой: применимость решает рассказчик.
   */
  #bearing(social) {
    const a = this.actor, m = a.system.morality;
    if (!a.isVampire || !m || this.cfg.lockTraits) return [];
    const path = Codex.path(m.path ?? "humanity"), bm = VTM20.bearingMod(m.value);
    if (!bm || !path?.bearing || (path.key === "humanity" && !social)) return [];
    return [{ label: `${t("Sheet.Bearing")}: ${path.bearing}`, value: bm, kind: "bearing" }];
  }

  /** Перебор (гл. 9, с. 252): только в призыве падшего, у которого есть слуги или «Договоры»; не больше постоянной Веры. */
  #overdrawMax() {
    const a = this.actor;
    if (this.cfg.extra?.torment == null || a.type !== "demon") return 0;
    const pacts = a.system.thralls?.length || a.items.some(i => i.type === "background" && i.name === "Договоры" && i.system.value > 0);
    return pacts ? a.system.faith.permanent : 0;
  }
  #overdraw() { return Math.clamp(this.values.overdraw ?? 0, 0, this.#overdrawMax()); }
  /** Кубики ритуала почитания: только в призыве Привязанного. */
  #veneration() { const a = this.actor; return this.cfg.extra?.torment != null && a.type === "demon" && a.system.earthbound ? a.system.cult?.veneration ?? 0 : 0; }

  /** Табличка Муки в окне призыва: шанс эффекта высокой Муки по выбранному правилу. */
  #torment(pool, difficulty) {
    const n = this.cfg.extra?.torment;
    if (n == null) return null;
    const errata = tormentRule() === "errata";
    const high = errata ? Math.round(tormentOdds(pool, difficulty, n) * 100) : Math.clamp(n, 0, 10) * 10;
    return { n, errata, high, normal: 100 - high };
  }

  /** Проверка с заданными чертами (добродетели, воля, узы): вместо списков — плашка с чертой и точками. */
  #locked(v) {
    if (!this.cfg.lockTraits) return null;
    const ICONS = { frenzy: "fa-face-angry", rotschreck: "fa-fire-flame-curved", degeneration: "fa-scale-unbalanced", bond: "fa-link", willpower: "fa-shield-heart" };
    const traits = [v.trait1, v.trait2].filter(Boolean).map(p => {
      const value = this.actor.traitValue(p);
      return { label: this.actor.traitLabel(p), value, pips: Array.from({ length: Math.max(5, Math.min(10, value)) }, (_, i) => i < value) };
    });
    return { kind: this.cfg.kind ?? "check", icon: ICONS[this.cfg.kind] ?? "fa-dice-d10", traits };
  }

  async _prepareContext() {
    const c = this.compute();
    const v = this.values;
    const { groups1, groups2 } = this.#traitOptions();
    const mark = (groups, cur) => groups.map(g => ({ ...g, options: g.options.map(o => ({ ...o, selected: o.value === cur })) }));
    // Шансы: тот же пул, что уйдёт в бросок (фиксированный пул сил — со своими модификаторами)
    const pool = this.#rollPool(c);
    const specialty = v.specialty && c.specialtyEligible;
    const o = odds({ pool, difficulty: c.effDifficulty, specialty, willpower: v.willpower && !this.cfg.noWillpower,
      auto: c.auto });
    const chances = chancesView(o);
    return {
      v: { ...v, specialty }, ...c, canUseSpecialty: c.specialtyEligible, chances, shownPool: pool,
      groups1: mark(groups1, v.trait1), groups2: mark(groups2, v.trait2),
      celerityAction: !!this.cfg.celerityAction,
      lockTraits: !!this.cfg.lockTraits, fixedPool: this.cfg.pool != null, locked: this.#locked(v),
      // одна шкала (В2): пунктир — выбранная сложность, заливка — итог с поправками от сил и черт
      difficulties: [...new Set([3, 4, 5, 6, 7, 8, 9, 10, v.difficulty, c.effDifficulty])].sort((x, y) => x - y)
        .map(n => ({ n, active: n === c.effDifficulty, base: n === v.difficulty && n !== c.effDifficulty })),
      diffWhy: c.effDifficulty === v.difficulty ? null
        : [...c.diffAuto.filter(d => !d.dice), ...c.diffSit.filter(d => d.on && !d.dice)].map(d => ({ label: d.label, value: d.value })),
      woundPenalty: this.actor.system.health.penalty,
      sways: this.cfg.pool != null ? [] : swayOf(this.actor).map(x => ({ ...x, selected: x.key === v.sway })),
      contests: this.cfg.onRolled ? [] : ["simple", "extended", "resisted", "teamwork"].map(k => ({ value: k, label: t(`Contest.Mode.${k}`), selected: k === v.contest })),
      isExtended: v.contest === "extended",
      willpowerLeft: this.actor.system.willpower.temporary,
      noWillpower: !!this.cfg.noWillpower, totemWill: this.#totemWill()?.left ?? 0,
      bloodCost: this.cfg.bloodCost ?? 0, hasBlood: this.actor.hasBlood, bloodLeft: this.actor.system.blood?.value ?? 0,
      willpowerCost: !!this.cfg.willpowerCost, diffNote: this.cfg.diffNote ?? "",
      // призыв демона: высокая Мука по отдельной кости или по большинству успехов (настройка мира)
      torment: this.#torment(pool, c.effDifficulty),
      overdraw: this.#overdrawMax() ? { max: this.#overdrawMax(), value: this.#overdraw(), thralls: this.actor.system.thralls?.length ?? 0 } : null,
      lightBane: VTM20.lightBane.includes(this.actor.system.clan),
      horridAvail: this.horridAvailable,
      physicalLabel: c.physicalPotentialAuto > 0 ? t("Roll.AutoSuccess") : c.physicalBonus ? Codex.disciplineLabel(c.attr === "strength" ? "potence" : "celerity") : "",
      physicalAuto: c.auto > 0,
      messageModes: Object.entries(CONFIG.ChatMessage.modes ?? {}).map(([k, m]) => ({ value: k, label: game.i18n.localize(m.label ?? k), selected: k === v.messageMode }))
    };
  }

  // Слушатели — один раз: корневой элемент окна живёт между перерисовками (раньше они копились с каждой)
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener("change", ev => this.#read(ev));
    this.element.addEventListener("input", ev => { if (ev.target.type === "number") this.#read(ev); });
  }

  /** Воля из запаса тотема стаи (W20, гл. 12): тратится вместо своей, если лист стаи доступен и запрет не нарушен. */
  #totemWill() {
    if (this.actor.type !== "werewolf") return null;
    const pack = game.actors.get(totemOf(this.actor)?.packId);
    if (!pack?.isOwner || totemBanned(pack)) return null;
    const p = totemPools(pack).willpower;
    return p?.left ? { pack, left: p.left } : null;
  }

  #read(ev) {
    const f = new foundry.applications.ux.FormDataExtended(this.element).object;
    Object.assign(this.values, {
      trait1: f.trait1 ?? this.values.trait1, trait2: f.trait2 ?? this.values.trait2,
      bonus: Number(f.bonus) || 0, actions: Math.clamp(Number(f.actions) || 1, 1, 6), sway: f.sway ?? this.values.sway,
      contest: f.contest ?? this.values.contest, need: Math.clamp(Number(f.need) || 1, 1, 50),
      difficulty: Math.clamp(Number(f.difficulty) || 6, 2, 12),
      specialty: !!f.specialty, willpower: !!f.willpower, totemWill: !!f.totemWill, wounds: !!f.wounds, physical: !!f.physical,
      payBlood: !!f.payBlood, payWill: !!f.payWill, light: !!f.light, horrid: this.horridAvailable ? !!f.horrid : this.values.horrid, overdraw: Math.max(0, Number(f.overdraw) || 0),
      messageMode: f.messageMode ?? this.values.messageMode
    });
    // отмеченные обстоятельства сил: name="fx.<kind>:<сила>"
    this.values.fxOn = Object.entries(f).filter(([k, on]) => k.startsWith("fxs_") && on).map(([k]) => k.slice(4));
    this.render();
  }

  static #onSetDifficulty(event, target) {
    this.values.difficulty = Number(target.dataset.n);
    this.render();
  }

  static #onBump(event, target) {
    const k = target.dataset.field, d = Number(target.dataset.d);
    if (k === "difficulty") this.values.difficulty = Math.clamp(this.values.difficulty + d, 2, 12);
    else if (k === "actions") this.values.actions = this.cfg.celerityAction ? 1 : Math.clamp(this.values.actions + d, 1, 6);
    else this.values.bonus += d;
    this.render();
  }

  static #onCancel() { this.close(); }

  static async #onSubmit() {
    const c = this.compute();
    const v = this.values, cfg = this.cfg;
    const od = this.#overdraw();
    const pool = this.#rollPool(c);
    const title = cfg.title || c.breakdown.slice(0, 2).map(x => x.label).join(" + ") || t("Roll.Title");
    // Цена силы: кровь и воля списываются до броска (V20, гл. 4)
    const notes = [];
    if (v.payBlood && cfg.bloodCost > 0 && this.actor.hasBlood) {
      if (!(await this.actor.spendBlood(cfg.bloodCost))) return;
      notes.push(`<i class="fa-solid fa-droplet"></i> ${t("Roll.BloodPaid", { n: cfg.bloodCost })}`);
    }
    if (v.payWill && cfg.willpowerCost) {
      if (!(await this.actor.spendWillpower(1))) return;
      notes.push(`<i class="fa-solid fa-star"></i> ${t("Roll.WillPaid")}`);
    }
    // Воля тотема стаи — вместо своей (списывается здесь, бросок свою не трогает)
    let willpowerPaid = false;
    if (v.willpower && v.totemWill && !cfg.noWillpower) {
      const tw = this.#totemWill();
      if (tw && await spendTotemPool(tw.pack, "willpower", this.actor)) willpowerPaid = true;
    }
    if (cfg.diffNote) notes.push(cfg.diffNote);
    if (od) notes.push(`<i class="fa-solid fa-hand-holding-droplet"></i> ${t("Demon.OverdrawNote", { n: od })}`);
    const res = await rollPool({
      actor: this.actor, title, subtitle: cfg.subtitle ?? "",
      pool, difficulty: c.effDifficulty, specialty: v.specialty && c.specialtyEligible, specialtyName: c.specialtyName,
      willpower: v.willpower && !cfg.noWillpower, willpowerPaid,
      breakdown: cfg.pool != null
        ? [...(cfg.breakdown ?? []), ...(v.physical && c.phys ? [{ label: Codex.disciplineLabel(c.attr === "strength" ? "potence" : "celerity"), value: c.phys }] : []), ...(v.physical && c.auto ? [{ label: t("Roll.AutoSuccess"), value: c.auto }] : [])]
        : c.breakdown,
      kind: cfg.kind ?? "check", messageMode: v.messageMode, auto: c.auto,
      extra: { ...(cfg.extra ?? {}), contest: v.contest, ...(v.contest === "extended" ? { extended: { need: v.need, prev: 0, step: 0 } } : {}) },
      notes, effect: cfg.effect ?? ""
    });
    // Использованное доп. действие списывается сразу после успешного броска,
    // до связанных обработчиков результата: ошибка карточки не должна возвращать действие.
    if (cfg.celerityAction && res) await this.actor.consumeCelerityAction();
    // Перебор: слуги платят Волей, провал — минус Вера (apps/torment.mjs)
    if (od) await (await import("../apps/torment.mjs")).overdrawPay(this.actor, od, res);
    // кубики почитания израсходованы
    if (this.#veneration()) await this.actor.update({ "system.cult.veneration": 0 });
    // Связанные броски (защита от атаки и т. п.) подводят итог сами
    if (cfg.onRolled) await cfg.onRolled(res);
  }
}
