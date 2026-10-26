// module/apps/creator.mjs
// Мастер создания персонажа V20 — по образцу мастера Становления из vtm5e-kamen-edition.
// Правила: V20_Основные_правила/01 (Сородич), 07 (гуль); смертный — числа гуля без Дисциплин
// (правило системы); падший — Demon: The Fallen, гл. 6 (шаг «Дом» вместо клана, Знания вместо Дисциплин,
// Вера вместо морали, Воля — две высшие Добродетели, Мука — по Дому).
//
// Шаги: концепция и возраст → клан и поколение → характеристики (7/5/3) → способности (13/9/5) →
// Дисциплины → факты биографии и Добродетели → достоинства и недостатки → свободные пункты →
// опыт (если персонаж старше птенца) → итог.
//
// Значение черты = база + распределение + свободные пункты + опыт. Всё пишется в персонажа
// разом в конце; до того лист показывает плашку «создайте по правилам».

import { VTM20, SYSTEM_PATH, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { openClans } from "./clans.mjs";
import { openHouses } from "./houses.mjs";
import { blockerFor, checkTraits } from "../data/trait-rules.mjs";
import { attachCombos } from "../ui/combo.mjs";
import { weaponIcon, armorIcon, traitIcon, backgroundIcon } from "../data/icons.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const loc = k => game.i18n.localize(k);

/** Числа создания по типу персонажа. */
const RULES = {
  vampire: { attr: [7, 5, 3], abil: [13, 9, 5], disc: 3, bg: 5, virt: 7, free: 15,
    cost: { attr: 5, abil: 2, disc: 7, bg: 1, virt: 2, morality: 2, will: 1 } },
  ghoul: { attr: [6, 4, 3], abil: [11, 7, 4], disc: 1, bg: 5, virt: 7, free: 21,
    cost: { attr: 5, abil: 2, disc: 10, bg: 1, virt: 2, morality: 1, will: 1 } },
  mortal: { attr: [6, 4, 3], abil: [11, 7, 4], disc: 0, bg: 5, virt: 7, free: 21,
    cost: { attr: 5, abil: 2, disc: 0, bg: 1, virt: 2, morality: 1, will: 1 } },
  // Demon: The Fallen, гл. 6: Знания 3 (слот disc), Добродетели — по точке и ещё 3, Вера 3 (слот morality), 15 свободных
  demon: { attr: [7, 5, 3], abil: [13, 9, 5], disc: 3, bg: 5, virt: 3, free: 15,
    cost: { attr: 5, abil: 2, disc: 7, bg: 1, virt: 2, morality: 6, will: 1 } },
  // Привязанный к Земле (Earthbound, гл. 3): Знаний 10 пунктов, Потребности в слотах Добродетелей (по точке и ещё 3), Вера 4, 21 свободный
  earthbound: { attr: [8, 6, 4], abil: [17, 12, 7], disc: 10, bg: 10, virt: 3, free: 21,
    cost: { attr: 6, abil: 2, disc: 5, bg: 1, virt: 3, morality: 5, will: 1 } },
  // Слуга падшего (Damned and Deceived, гл. 4): Добродетели падших по точке и ещё 3, Вера слуги 1 (слот morality, 7 за точку), 15 свободных
  thrall: { attr: [6, 4, 3], abil: [11, 7, 4], disc: 0, bg: 5, virt: 3, free: 15,
    cost: { attr: 5, abil: 2, disc: 0, bg: 1, virt: 2, morality: 7, will: 1 } }
};
/** Слуге нельзя: Высокое положение, Наследие, Договоры, Совершенство; знание ритуалов — удел падших. */
const THRALL_BANNED = ["Eminence", "Legacy", "Pacts", "Paragon", "Ritual Knowledge"];
/** Начальная Вера падшего. */
const DEMON_FAITH = 3;

/** Возраст в Крови и опыт сверх создания (01: неонат 0–35, анцилла 75–220, старейшина 250–600). */
const TIERS = {
  fledgling: { xp: 0 }, neonate: { xp: 35 }, ancilla: { xp: 120 }, elder: { xp: 300 }
};

const SECTS = [
  { key: "camarilla", label: "Sect.camarilla" }, { key: "sabbat", label: "Sect.sabbat" },
  { key: "anarchs", label: "Sect.anarchs" }, { key: "independent", label: "Sect.independent" },
  { key: "autarkis", label: "Sect.autarkis" }
];

/**
 * Поправки создания по секте (только вампиры). Шабаш — Guide to the Sabbat (1999), гл. 3: 4 точки клановых
 * Дисциплин (пандеры — любых), фактов биографии нет — только за свободные пункты, 5 точек Добродетелей.
 * Анархи — V20 Anarchs Unbound: числа V20, свои факты биографии, архетипы и черты (в данных с пометкой секты).
 * Камарилья — Guide to the Camarilla, гл. 3: числа V20, но внеклановые Дисциплины независимых и Шабаша недоступны.
 */
const SECT_RULES = { sabbat: { disc: 4, bg: 0, virt: 5 } };
const CAMARILLA_BANNED = ["chimerstry", "melpominee", "mytherceria", "necromancy", "obeah", "obtenebration", "quietus",
  "serpentis", "thanatosis", "visceratika", "vicissitude"];

const STEP_HINTS = {
  concept: "ConceptHint", clan: "ClanHint", house: "HouseHint", attributes: "AttrHintShort", abilities: "AbilHintShort",
  disciplines: "DiscHint", advantages: "AdvHint", merits: "MeritHint", freebies: "FreeHint", xp: "XpHint", pact: "PactHint", summary: "FinishHint"
};
/** Шаги, где у гуля свой текст подсказки (ключ + «Ghoul»). */
const GHOUL_HINTS = new Set(["concept", "disciplines", "summary"]);
/** Шаги, где у демона свой текст подсказки (ключ + «Demon»). */
const DEMON_HINTS = new Set(["concept", "disciplines", "advantages", "freebies", "summary"]);
// у Привязанного свои подсказки: Знания с Тёмными, Потребности вместо Добродетелей, 21 пункт, Мука 10
const EB_HINTS = new Set(["disciplines", "advantages", "freebies", "summary"]);
const THRALL_HINTS = new Set(["concept", "advantages", "freebies", "summary"]);

export function openCreator(actor) {
  const existing = [...foundry.applications.instances.values()].find(a => a instanceof VtMCreator && a.actor === actor);
  if (existing) return existing.render({ force: true });
  return new VtMCreator(actor).render({ force: true });
}

export class VtMCreator extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-creator"],
    window: { title: "VTM20.Creator.Title", icon: "fa-solid fa-feather-pointed", resizable: true },
    position: { width: 1260, height: 880 },
    actions: {
      goto: VtMCreator.#onGoto, next: VtMCreator.#onNext, prev: VtMCreator.#onPrev,
      tier: VtMCreator.#onTier, sect: VtMCreator.#onSect, clan: VtMCreator.#onClan, clanGroup: VtMCreator.#onClanGroup,
      house: VtMCreator.#onHouse, earthbound: VtMCreator.#onEarthbound, thrall: VtMCreator.#onThrall, pactShare: VtMCreator.#onPactShare, pactGift: VtMCreator.#onPactGift, reliquary: VtMCreator.#onReliquary, visage: VtMCreator.#onVisage, faction: VtMCreator.#onFaction, houseAtlas: VtMCreator.#onHouseAtlas,
      gen: VtMCreator.#onGen, choice: VtMCreator.#onChoice, clanAtlas: VtMCreator.#onClanAtlas,
      dot: VtMCreator.#onDot, prio: VtMCreator.#onPrio,
      bgToggle: VtMCreator.#onBgToggle, mfToggle: VtMCreator.#onMfToggle, mfTab: VtMCreator.#onMfTab, mfCat: VtMCreator.#onMfCat,
      addDisc: VtMCreator.#onAddDisc, read: VtMCreator.#onRead,
      free: { handler: VtMCreator.#onFree, buttons: [0, 2] },
      xp: { handler: VtMCreator.#onXp, buttons: [0, 2] },
      rollBlood: VtMCreator.#onRollBlood, finish: VtMCreator.#onFinish
    }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/creator.hbs`, scrollable: [".r-cr-body"] } };

  constructor(actor) {
    super({ window: { title: t("Creator.TitleFor", { name: actor.name }) } });
    this.actor = actor;
    const s = actor.system;
    this.type = actor.type in RULES ? actor.type : "mortal";
    this.baseRules = RULES[this.type];
    // ревенант: 5 точек Добродетелей вместо 7 (Ghouls & Revenants)
    if (this.type === "ghoul" && actor.system.ghoulType === "revenant") this.baseRules = { ...this.baseRules, virt: 5 };
    this.step = 0;
    this.st = {
      name: actor.name, concept: s.details.concept, nature: s.details.nature, demeanor: s.details.demeanor,
      sire: s.details.sire, sect: s.details.sect || "", sectKey: Codex.sectKey(s.details.sect),
      clan: s.clan ?? "brujah", clanChoice: s.clanChoice ?? "", weaknessNote: s.weaknessNote ?? "",
      domitor: s.domitor ?? "", path: "humanity", tier: "fledgling", xpTotal: 0,
      house: s.house || "devils", visage: s.visage ?? "", faction: s.faction ?? "",
      names: { celestial: s.names?.celestial ?? "", trueName: s.names?.trueName ?? "" },
      attrPrio: ["physical", "social", "mental"], abilPrio: ["talents", "skills", "knowledges"],
      attr: {}, abil: {}, disc: {}, bg: {},
      virt: { conscience: 0, selfControl: 0, courage: 0 },
      merits: [], flaws: [],
      free: { attr: {}, abil: {}, disc: {}, bg: {}, virt: {}, morality: 0, will: 0 },
      xp: { attr: {}, abil: {}, disc: {}, virt: {}, morality: 0, will: 0 },
      blood: null,
      // слуга: «Танец с Дьяволом» — хозяин (uuid демона), доля Веры хозяину (−1 — наибольшая), условия, дары словами и прибавками
      pact: { master: "", share: -1, terms: "", gifts: "", attr: {}, abil: {} }
    };
    this.ui = { clanGroup: "clan", mfTab: "merit", mfCat: "all", mfSearch: "", open: new Set() };
  }

  /* ── Шаги ──────────────────────────────────────────────────────────── */

  get steps() {
    const s = ["concept"];
    if (this.type === "vampire") s.push("clan");
    if (this.type === "demon") s.push("house");
    s.push("attributes", "abilities");
    if (this.rules.disc > 0) s.push("disciplines");
    s.push("advantages", "merits", "freebies");
    if (this.st.xpTotal > 0) s.push("xp");
    if (this.isThrall) s.push("pact");                 // «Танец с Дьяволом»: хозяин, доля, дары
    s.push("summary");
    return s;
  }
  get stepKey() { return this.steps[Math.min(this.step, this.steps.length - 1)]; }

  /* ── Расчёты ───────────────────────────────────────────────────────── */

  /** Числа создания: по типу персонажа, у вампира — с поправкой секты (SECT_RULES). */
  get rules() {
    if (this.isEarthbound) return RULES.earthbound;
    if (this.isThrall) return RULES.thrall;
    return this.type === "vampire" ? { ...this.baseRules, ...(SECT_RULES[this.st?.sectKey] ?? {}) } : this.baseRules;
  }
  /** Падший создаётся Привязанным к Земле (переключатель на шаге Дома). */
  get isEarthbound() { return this.type === "demon" && !!this.st?.earthbound; }
  /** Смертный создаётся слугой падшего (переключатель на шаге концепции). */
  get isThrall() { return this.type === "mortal" && !!this.st?.thrall; }
  /** Дисциплина закрыта сектой: Камарилья не учит внеклановым Дисциплинам независимых и Шабаша. */
  bannedDisc(k) { return this.type === "vampire" && this.st.sectKey === "camarilla" && CAMARILLA_BANNED.includes(k) && !this.inClan(k); }
  /** Подсказка о правилах выбранной секты (шаги концепции, Дисциплин, преимуществ и свободных пунктов). */
  get sectRule() {
    const k = this.type === "vampire" ? this.st.sectKey : "";
    if (k === "camarilla") return t("Creator.SectRule.camarilla", { list: CAMARILLA_BANNED.map(d => Codex.disciplineLabel(d)).join(", ") });
    return k === "sabbat" || k === "anarchs" ? t(`Creator.SectRule.${k}`) : "";
  }

  get clanData() { return this.type === "vampire" ? Codex.clan(this.st.clan) : null; }
  get houseData() { return this.type === "demon" ? Codex.house(this.st.house) : null; }
  get isDemon() { return this.type === "demon"; }
  get pathData() { return Codex.path(this.st.path); }
  get altVirtues() { return (this.pathData?.virtues ?? []).filter(v => v === "conviction" || v === "instinct"); }
  virtueBase(slot) {
    if (slot === "courage") return 1;
    return this.altVirtues.includes(slot === "conscience" ? "conviction" : "instinct") ? 0 : 1;
  }
  get ugly() { return this.type === "vampire" && VTM20.uglyClans.includes(this.st.clan); }

  /** Клановые Дисциплины; null — любые (каитиф, пандеры, гуль). */
  get clanDisciplines() {
    if (this.type === "ghoul") return null;
    if (this.isDemon) return [...(this.houseData?.lores ?? []), ...(Codex.demon?.common ?? []),        // Знания Дома и общие
      ...(this.isEarthbound ? Codex.lores.filter(l => l.dark).map(l => l.key) : [])];                     // Привязанному — и Тёмные
    const c = this.clanData;
    if (!c || !c.disciplines.length) return null;
    return [...c.disciplines, ...(c.choice?.includes(this.st.clanChoice) ? [this.st.clanChoice] : [])];
  }
  inClan(k) { const c = this.clanDisciplines; return c ? c.includes(k) : false; }

  attrGroupOf(k) { return Object.entries(VTM20.attributeGroups).find(([, g]) => g.attributes.includes(k))[0]; }
  attrLimit(g) { return this.rules.attr[this.st.attrPrio.indexOf(g)]; }
  abilLimit(g) { return this.rules.abil[this.st.abilPrio.indexOf(g)]; }
  sum(o, f = () => true) { return Object.entries(o).filter(([k]) => f(k)).reduce((s, [, v]) => s + (v || 0), 0); }

  base(kind, k) {
    if (kind === "attr") return (k === "appearance" && this.ugly) ? 0 : 1;
    if (kind === "virt") return this.virtueBase(k);
    if (kind === "disc") return this.type === "ghoul" && k === "potence" ? 1 : 0;
    return 0;
  }
  /** Без опыта — то, что видит шаг свободных пунктов. */
  valueBeforeXp(kind, k) {
    const st = this.st;
    const alloc = (kind === "attr" ? st.attr : kind === "abil" ? st.abil : kind === "disc" ? st.disc : kind === "bg" ? st.bg : st.virt)[k] ?? 0;
    return this.base(kind, k) + alloc + (st.free[kind]?.[k] ?? 0);
  }
  value(kind, k) { return this.valueBeforeXp(kind, k) + (this.st.xp[kind]?.[k] ?? 0); }

  get moralityBase() {
    if (this.isDemon) return Math.min(10, (this.isEarthbound ? 4 : DEMON_FAITH) + this.st.free.morality);   // у падшего — Вера
    if (this.isThrall) return Math.min(5, 1 + this.st.free.morality);                                        // у слуги — Вера слуги
    const v = this.value("virt", "conscience") + this.value("virt", "selfControl") + this.st.free.morality;
    return this.st.path === "humanity" ? Math.min(10, v) : Math.min(5, v);
  }
  get morality() { return Math.min(this.isThrall ? 5 : 10, this.moralityBase + this.st.xp.morality); }
  get willpowerBase() {
    // у падшего Воля — сумма двух высших Добродетелей (гл. 6), у прочих — Смелость
    const base = this.isDemon || this.isThrall ? ["conscience", "selfControl", "courage"].map(k => this.value("virt", k)).sort((x, y) => y - x).slice(0, 2).reduce((x, y) => x + y, 0)
      : this.value("virt", "courage");
    return Math.min(10, base + this.st.free.will);
  }
  get willpower() { return Math.min(10, this.willpowerBase + this.st.xp.will); }

  /* Договор слуги (Damned and Deceived, гл. 4): до половины Веры слуги (вверх) — хозяину, остальное — на дары;
     дары-прибавки: Характеристики — 2 точки за пункт, Способности — до 5 точек за пункт */
  get pactShareMax() { return Math.ceil(this.morality / 2); }
  get pactShare() { const s = this.st.pact.share; return s < 0 ? this.pactShareMax : Math.min(s, this.pactShareMax); }
  get giftPoints() { return Math.max(0, this.morality - this.pactShare); }
  get giftUsed() { const p = this.st.pact; return Math.ceil(this.sum(p.attr) / 2) + Math.ceil(this.sum(p.abil) / 5); }

  get flawPoints() { return Math.min(VTM20.creation.flawCap, this.st.flaws.reduce((s, f) => s + f.cost, 0)); }
  get meritPoints() { return this.st.merits.reduce((s, m) => s + m.cost, 0); }
  get freeSpent() {
    const c = this.rules.cost, f = this.st.free;
    return this.sum(f.attr) * c.attr + this.sum(f.abil) * c.abil + this.sum(f.disc) * c.disc + this.sum(f.bg) * c.bg
      + this.sum(f.virt) * c.virt + f.morality * c.morality + f.will * c.will;
  }
  get freeTotal() { return this.rules.free + this.flawPoints; }
  get freeLeft() { return this.freeTotal - this.meritPoints - this.freeSpent; }

  /** Цена опыта за n точек сверх значения from (01, гули — 07). */
  xpCostOf(kind, k, from, n) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const c = from + i;
      if (this.isEarthbound) {
        const L = Codex.lore(k), near = kind === "disc" && (this.inClan(k) && !L?.dark);
        total += kind === "attr" ? c * 5 : kind === "abil" ? (c === 0 ? 4 : c * 3) : kind === "disc" ? (c === 0 ? (near ? 6 : 8) : c * 4)
          : kind === "bg" ? Math.max(1, c) * 4 : kind === "virt" ? c * 2 : kind === "morality" ? c * 6 : kind === "will" ? c : 0;
        continue;
      }
      if (this.isThrall) {                             // опыт слуги (Damned and Deceived): Вера слуги × 10
        total += kind === "attr" ? c * 4 : kind === "abil" ? (c === 0 ? 3 : c * 2) : kind === "virt" ? c * 2 : kind === "morality" ? c * 10 : kind === "will" ? c : 0;
        continue;
      }
      if (kind === "attr") total += c * 4;
      else if (kind === "abil") total += c === 0 ? 3 : c * 2;
      else if (kind === "disc" && this.isDemon) total += c === 0 ? (this.inClan(k) ? 7 : 10) : c * 5;   // гл. 6
      else if (kind === "morality" && this.isDemon) total += c * 7;                                     // Вера
      else if (kind === "disc") {
        if (this.type === "ghoul") total += c === 0 ? 20 : c * (["potence", "fortitude", "celerity"].includes(k) ? 15 : 25);
        else if (c === 0) total += 10;
        else if (this.st.clan === "caitiff" || this.st.clan === "pandery") total += c * 6;
        else total += c * (this.inClan(k) ? 5 : 7);
      } else if (kind === "virt" || kind === "morality") total += c * 2;
      else if (kind === "will") total += c;
    }
    return total;
  }
  get xpSpent() {
    const x = this.st.xp;
    let s = 0;
    for (const kind of ["attr", "abil", "disc", "virt"]) for (const [k, n] of Object.entries(x[kind])) if (n) s += this.xpCostOf(kind, k, this.valueBeforeXp(kind, k), n);
    s += this.xpCostOf("morality", "", this.moralityBase, x.morality);
    s += this.xpCostOf("will", "", this.willpowerBase, x.will);
    return s;
  }
  get xpLeft() { return this.st.xpTotal - this.xpSpent; }

  remaining() {
    const st = this.st;
    return {
      attr: Object.fromEntries(Object.keys(VTM20.attributeGroups).map(g => [g, this.attrLimit(g) - this.sum(st.attr, k => this.attrGroupOf(k) === g)])),
      abil: Object.fromEntries(Object.keys(VTM20.abilityGroups).map(g => [g, this.abilLimit(g) - this.sum(st.abil, k => VTM20.abilities[k]?.group === g)])),
      disc: this.rules.disc - this.sum(st.disc), bg: this.rules.bg - this.sum(st.bg), virt: this.rules.virt - this.sum(st.virt),
      free: this.freeLeft, xp: this.xpLeft
    };
  }

  stepOk(key, rem) {
    switch (key) {
      case "concept": return !!this.st.name;
      case "clan": return !!this.clanData && !(this.clanData.choice?.length && !this.st.clanChoice);
      case "house": return !!this.houseData && !!this.st.visage;
      case "attributes": return Object.values(rem.attr).every(v => v === 0);
      case "abilities": return Object.values(rem.abil).every(v => v === 0);
      case "disciplines": return rem.disc === 0;
      case "advantages": return rem.bg === 0 && rem.virt === 0;
      case "freebies": return rem.free === 0;
      case "xp": return rem.xp >= 0;
      case "pact": return !!this.st.pact.master && this.giftUsed <= this.giftPoints;
      default: return true;
    }
  }

  problems(rem) {
    const out = [];
    const msg = (what, v) => out.push(t(v > 0 ? "Creator.Left" : "Creator.Over", { what, n: Math.abs(v) }));
    for (const [g, v] of Object.entries(rem.attr)) if (v) msg(loc(VTM20.attributeGroups[g].label), v);
    for (const [g, v] of Object.entries(rem.abil)) if (v) msg(loc(VTM20.abilityGroups[g].label), v);
    if (rem.disc && this.rules.disc) msg(this.discLabel, rem.disc);
    if (rem.bg) msg(this.bgLabel, rem.bg);
    if (rem.virt) msg(t("Sheet.Virtues"), rem.virt);
    if (rem.free) msg(t("Creator.Freebies"), rem.free);
    if (rem.xp < 0) msg(t("Sheet.Experience"), rem.xp);
    if (this.st.path !== "humanity" && this.willpower < 5) out.push(t("Creator.PathWill"));
    for (const k of Object.keys({ ...this.st.disc, ...this.st.free.disc, ...this.st.xp.disc }))
      if (this.bannedDisc(k) && this.value("disc", k) > this.base("disc", k)) out.push(t("Creator.SectBanned", { name: Codex.disciplineLabel(k) }));
    if (this.type === "vampire" && this.clanData?.choice?.length && !this.st.clanChoice) out.push(t("Creator.NeedChoice"));
    if (this.isDemon && !this.st.visage) out.push(t("Creator.NeedVisage"));
    if (this.isEarthbound && this.value("bg", "Поклонение") > 0 && this.value("bg", "Культ") < 1) out.push(t("Creator.WorshipNeedsCult"));
    if (this.isThrall && !this.st.pact.master) out.push(t("Creator.PactNoMaster"));
    if (this.isThrall && this.giftUsed > this.giftPoints) out.push(t("Creator.PactOver", { n: this.giftUsed - this.giftPoints }));
    for (const c of this.traitIssues) out.push(t(`Creator.Trait${c.key}`, c.data));
    return out;
  }

  /** Подпись шага: у падшего Знания вместо Дисциплин и Дополнения вместо фактов биографии. */
  stepName(k) { return this.isDemon ? ({ disciplines: "lores", advantages: "advantagesDemon" }[k] ?? k) : k; }
  /** «Факты биографии» или «Дополнения» (у падшего). */
  get bgLabel() { return this.isDemon ? t("Demon.Backgrounds") : t("Sheet.Backgrounds"); }
  /** «Дисциплины» или «Знания» (у падшего). */
  get discLabel() { return this.isDemon ? t("Demon.Lores") : t("Sheet.Disciplines"); }
  /** Сила справочника по ключу: Дисциплина или Знание падшего. */
  discData(k) { return this.isDemon ? Codex.lore(k) : Codex.discipline(k); }

  /** Противоречия выбранных достоинств и недостатков. */
  get traitIssues() {
    return checkTraits([...this.st.merits, ...this.st.flaws].map(x => x.name), { sectKey: this.st.sectKey });
  }

  /* ── Контекст ──────────────────────────────────────────────────────── */

  async _prepareContext() {
    await Codex.load();
    const st = this.st, rem = this.remaining(), key = this.stepKey;
    const dotRow = (kind, k, max = 5, locked = false) => {
      const b = this.base(kind, k);
      const store = kind === "attr" ? st.attr : kind === "abil" ? st.abil : kind === "disc" ? st.disc : kind === "bg" ? st.bg : st.virt;
      const a = store[k] ?? 0, f = st.free[kind]?.[k] ?? 0, x = st.xp[kind]?.[k] ?? 0;
      return Array.from({ length: max }, (_, i) => ({
        n: i + 1, kind, key: k, locked,
        state: i < b ? "base" : i < b + a ? "alloc" : i < b + a + f ? "free" : i < b + a + f + x ? "xp" : "empty"
      }));
    };
    const ctx = {
      st, ui: this.ui, rem, rules: this.rules, type: this.type,
      isVampire: this.type === "vampire", isGhoul: this.type === "ghoul", isDemon: this.isDemon, isEarthbound: this.isEarthbound, isThrall: this.isThrall, isMortal: this.type === "mortal", discLabel: this.discLabel, bgLabel: this.bgLabel,
      typeLabel: loc(`TYPES.Actor.${this.type}`), typeSigil: VTM20.typeSigil(this.type),
      steps: this.steps.map((k, i) => ({ i, key: k, n: i + 1, label: t(`Creator.Step.${this.stepName(k)}`), active: i === this.step, done: this.stepOk(k, rem) && i !== this.step })),
      stepKey: key, stepNumber: this.step + 1, stepCount: this.steps.length,
      // у гуля свои подсказки там, где правила другие (нет Становления, Дисциплины — от домитора)
      title: t(`Creator.Step.${this.stepName(key)}`),
      hint: t(`Creator.${STEP_HINTS[key]}${this.type === "ghoul" && GHOUL_HINTS.has(key) ? "Ghoul" : this.isEarthbound && EB_HINTS.has(key) ? "Earthbound" : this.isThrall && THRALL_HINTS.has(key) ? "Thrall" : this.isDemon && DEMON_HINTS.has(key) ? "Demon" : key === "advantages" && !this.rules.bg ? "NoBg" : ""}`, { n: this.rules.disc, bg: this.rules.bg, virt: this.rules.virt }),
      sectRule: ["concept", "disciplines", "advantages", "freebies"].includes(key) ? this.sectRule : "",
      isFirst: this.step === 0, isLast: this.step === this.steps.length - 1,
      [`is_${key}`]: true
    };

    // Патент справа: живой предпросмотр персонажа и остатки очков по разделам
    const total = arr => arr.reduce((s, v) => s + v, 0);
    const ledger = [];
    const add = (label, left, all) => ledger.push({
      label, left, pct: all ? Math.max(0, Math.min(100, Math.round((all - left) / all * 100))) : 100,
      state: left < 0 ? "over" : left === 0 ? "done" : "open"
    });
    add(t("Sheet.Attributes"), total(Object.values(rem.attr)), total(this.rules.attr));
    add(t("Sheet.Abilities"), total(Object.values(rem.abil)), total(this.rules.abil));
    if (this.rules.disc) add(this.discLabel, rem.disc, this.rules.disc);
    add(this.bgLabel, rem.bg, this.rules.bg);
    add(t("Sheet.Virtues"), rem.virt, this.rules.virt);
    add(t("Creator.Freebies"), rem.free, this.freeTotal);
    if (st.xpTotal) add(t("Sheet.Experience"), rem.xp, st.xpTotal);
    const gen = this.type === "vampire" ? 13 - Math.min(5, this.value("bg", "Поколение")) : null;
    ctx.patent = {
      img: this.actor.img, name: st.name, concept: st.concept, sect: st.sect, sectSym: Codex.sectSymbol(st.sect),
      clan: this.clanData?.name ?? "",
      sym: this.type === "vampire" ? Codex.clanSymbol(st.clan) : Codex.sectSymbol(st.sect),
      generation: gen, blood: gen ? VTM20.generationOf(gen).pool : null,
      morality: this.morality, willpower: this.willpower, pathName: this.isDemon ? t("Demon.Faith") : this.isThrall ? t("Creator.ThrallFaith") : this.pathData?.name ?? "", ledger,
      torment: this.houseData?.torment ?? null, demon: this.isDemon
    };
    if (this.isDemon) Object.assign(ctx.patent, { clan: this.houseData?.name ?? "", sect: Codex.faction(st.faction)?.name ?? "", sectSym: null });

    // I. Концепция и возраст
    // Привязанному чужды архетипы человеческих надежд (Earthbound, гл. 3)
    const EB_NO = ["Бонвиван", "Опекун", "Ребёнок", "Конформист", "Щёголь", "Мученик", "Кающийся грешник", "Искатель удовольствий"];
    const RELIC_ICON = { ideal: "fa-gem", improvised: "fa-box-open", natural: "fa-mountain-sun" };
    ctx.reliquaryKinds = ["ideal", "improvised", "natural"].map(k => ({ value: k, label: t(`Demon.ReliquaryKind.${k}`), hint: t(`Demon.ReliquaryHint.${k}`).replace(/^[^:]+:\s*/, ""), icon: RELIC_ICON[k], active: (st.reliquary || "ideal") === k }));
    ctx.archetypes = this.isEarthbound ? Codex.archetypes.filter(a => !EB_NO.includes(a.name)) : Codex.archetypes;
    ctx.natureRegain = Codex.archetypes.find(a => a.name === st.nature)?.regain ?? "";
    ctx.demeanorRegain = Codex.archetypes.find(a => a.name === st.demeanor)?.regain ?? "";
    // у гуля «срок службы» вместо возраста в Крови — опыт тот же
    const tierKey = this.type === "ghoul" ? "TierGhoul" : "Tier";
    ctx.tiers = Object.entries(TIERS).map(([k, v]) => ({ key: k, xp: v.xp, label: t(`Creator.${tierKey}.${k}`), hint: t(`Creator.${tierKey}.${k}Hint`), active: st.tier === k }));
    ctx.tierTitle = t(this.type === "ghoul" ? "Creator.TierTitleGhoul" : "Creator.TierTitle");
    ctx.sects = SECTS.map(s => ({ ...s, label: t(s.label), sym: Codex.sectSymbol(t(s.label)), active: st.sectKey === s.key }));

    // II. Клан
    if (this.type === "vampire") {
      ctx.clanGroupTabs = ["clan", "bloodline", "variant", "antitribu"].map(g => ({ key: g, label: t(`ClanGroup.${g}`), active: this.ui.clanGroup === g }));
      ctx.clans = Codex.clans.filter(c => c.group === this.ui.clanGroup).map(c => ({
        key: c.key, name: c.name, nickname: c.nickname, sym: Codex.clanSymbol(c.key), active: c.key === st.clan,
        disciplines: [...c.disciplines.map(k => Codex.disciplineLabel(k)), ...(c.choice?.length ? [`${c.choice.map(k => Codex.disciplineLabel(k)).join(" / ")}`] : [])].join(", ") || t("Creator.AnyDisc")
      }));
      const c = this.clanData;
      ctx.clan = c ? {
        ...c, sym: Codex.clanSymbol(c.key),
        choiceOptions: (c.choice ?? []).map(k => ({ value: k, label: Codex.disciplineLabel(k), active: k === st.clanChoice, sym: Codex.disciplineSymbol(k) })),
        discCards: (c.disciplines ?? []).map(k => ({ label: Codex.disciplineLabel(k), sym: Codex.disciplineSymbol(k) }))
      } : null;
      ctx.isVentrue = ["ventrue", "ventruAntitribu"].includes(st.clan);
      const genBg = this.value("bg", "Поколение");
      ctx.generation = 13 - Math.min(5, genBg);
      ctx.gens = [13, 12, 11, 10, 9, 8].map(g => ({ g, cost: 13 - g, active: g === ctx.generation, pool: VTM20.generationOf(g).pool, perTurn: VTM20.generationOf(g).perTurn }));
      ctx.paths = Codex.paths.filter(p => Codex.visible(p) || p.key === st.path)
        .map(p => ({ key: p.key, name: p.name, selected: p.key === st.path,
          group: p.key === "humanity" ? p.name : p.fan ? t("Library.Filter.Src.fan") : p.era ? t("Library.Filter.DarkAges") : t("Sheet.EnlightenmentPaths") }));
      ctx.pathName = ctx.paths.find(p => p.selected)?.name ?? "";
      ctx.pathInfo = this.pathData ? { bearing: this.pathData.bearing, virtues: this.pathData.virtues.map(v => loc(VTM20.virtues[v].label)).join(", ") } : null;
    }

    // II. Дом падшего: Дом, Облик (главное Знание), фракция, Небесное и Истинное имя
    if (this.isDemon) {
      const h = this.houseData;
      ctx.houses = Codex.houses.map(x => ({ key: x.key, name: x.name, akkadian: x.akkadian, torment: x.torment, active: x.key === st.house,
        lores: x.lores.map(k => Codex.lore(k)?.name ?? k).join(", ") }));
      ctx.house = h ? { ...h, visages: Object.entries(h.visages).map(([k, name]) => ({ key: k, name, lore: Codex.lore(k)?.name ?? k, active: k === st.visage,
        low: Codex.lore(k)?.form?.low ?? [] })) } : null;
      ctx.factions = Codex.factions.map(f => ({ ...f, active: f.key === st.faction }));
    }

    // III–IV. Характеристики и способности
    const prioLabels = [t("Creator.Primary"), t("Creator.Secondary"), t("Creator.Tertiary")];
    ctx.attrGroups = Object.entries(VTM20.attributeGroups).map(([g, grp]) => ({
      key: g, label: loc(grp.label), left: rem.attr[g],
      prios: prioLabels.map((l, i) => ({ i, label: l, n: this.rules.attr[i], active: i === st.attrPrio.indexOf(g) })),
      list: grp.attributes.map(k => {
        const locked = k === "appearance" && this.ugly;
        return { key: k, label: loc(VTM20.attributes[k].label), value: this.value("attr", k), locked, dots: dotRow("attr", k, 5, locked) };
      })
    }));
    const abil = VTM20.abilitiesForEra(game.settings.get(SYSTEM_ID, "era"), this.type);
    ctx.abilGroups = Object.entries(abil).map(([g, keys]) => ({
      key: g, label: loc(VTM20.abilityGroups[g].label), left: rem.abil[g],
      prios: prioLabels.map((l, i) => ({ i, label: l, n: this.rules.abil[i], active: i === st.abilPrio.indexOf(g) })),
      list: keys.map(k => ({ key: k, label: loc(VTM20.abilities[k].label), value: this.value("abil", k), dots: dotRow("abil", k) }))
    }));

    // V. Дисциплины — карточки со знаком и силами по уровню
    const allowed = this.clanDisciplines;
    const discKeys = new Set([...(allowed ?? []), ...Object.keys(st.disc), ...Object.keys(st.free.disc), ...Object.keys(st.xp.disc)]);
    if (this.type === "ghoul") discKeys.add("potence");
    ctx.discCards = [...discKeys].filter(k => this.discData(k)).map(k => {
      const d = this.discData(k), v = this.value("disc", k);
      return {
        key: k, name: d.name, en: d.en, value: v, inClan: this.inClan(k), sym: this.isDemon ? null : Codex.disciplineSymbol(k),
        icon: this.isDemon ? (d.house ? "fa-fire-flame-curved" : "fa-book") : VTM20.disciplineIcons[k] ?? "fa-droplet", dots: dotRow("disc", k),
        powers: d.powers.filter(p => p.level <= Math.max(1, v) && p.level <= 5).map(p => ({ level: p.level, name: p.name, owned: p.level <= v })),
        pathed: VTM20.pathDisciplines.includes(k)
      };
    }).sort((a, b) => (b.inClan - a.inClan) || a.name.localeCompare(b.name, "ru"));
    ctx.anyDiscipline = allowed == null;
    ctx.inClanLabel = this.isDemon ? t("Demon.OwnHouse") : t("Sheet.InClan");
    ctx.discChoices = Object.values(Codex.disciplines).filter(d => !discKeys.has(d.key) && Codex.visible(d) && !this.bannedDisc(d.key)).map(d => ({ value: d.key, label: d.name }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));

    // VI. Факты биографии — каталог карточек, и Добродетели
    // Earthbound: факты биографии Привязанных — только им; Привязанному нельзя связей с людьми, наставника, договоров и наследия
    const EB_BANNED = ["Contacts", "Fame", "Followers", "Mentor", "Pacts", "Legacy"];
    const ebOk = b => !b.thrall && (this.isEarthbound ? !EB_BANNED.includes(b.en) : b.source !== "Earthbound");
    // слуга: факты биографии падших без запретных и без фактов Привязанных, плюс свои (Заботливый хозяин, Приобщение)
    const bgOk = b => this.isThrall ? b.line === "demon" && b.source !== "Earthbound" && !THRALL_BANNED.includes(b.en)
      : VTM20.backgroundAllowed(b, this.type) && ebOk(b);
    ctx.bgCards = Codex.backgrounds.filter(b => (Codex.visible(b) && bgOk(b)) || b.name in st.bg).map(b => {
      const on = b.name in st.bg || (st.free.bg[b.name] ?? 0) > 0;
      return { name: b.name, en: b.en, sectLabel: b.sabbat ? t("Sect.sabbat") : b.sect ? t(`Sect.${b.sect}`) : "", on, value: this.value("bg", b.name), dots: dotRow("bg", b.name),
          text: VtMCreator.#preview(b.html, 170), html: b.html, open: this.ui.open.has(`bg:${b.name}`) };
    });
    ctx.virtues = ["conscience", "selfControl", "courage"].map(slot => {
      const vk = slot === "courage" ? "courage" : this.isDemon || this.isThrall ? (slot === "selfControl" ? "conviction" : "conscience") : slot === "conscience" ? (this.altVirtues.includes("conviction") ? "conviction" : "conscience")
        : (this.altVirtues.includes("instinct") ? "instinct" : "selfControl");
      // у Привязанного в слотах Добродетелей — Потребности: Плоть, Мысль, Эмоция
      const urge = { conscience: "flesh", selfControl: "thought", courage: "emotion" }[slot];
      return { key: slot, label: this.isEarthbound ? t(`Demon.Urge.${urge}`) : loc(VTM20.virtues[vk].label), value: this.value("virt", slot), dots: dotRow("virt", slot) };
    });

    // VII. Достоинства и недостатки — каталог с поиском
    const q = this.ui.mfSearch.trim().toLowerCase();
    const chosen = this.ui.mfTab === "merit" ? st.merits : st.flaws;
    ctx.mfTabs = ["merit", "flaw"].map(k => ({ key: k, label: t(k === "merit" ? "Sheet.Merits" : "Sheet.Flaws"), active: this.ui.mfTab === k,
      n: (k === "merit" ? st.merits : st.flaws).length }));
    // Клановые черты и черты секты — только в своих категориях и только своего клана/секты
    const myClan = this.type === "vampire" ? Codex.traitClan(st.clan) : "";
    const mySect = st.sectKey || Codex.sectKey(st.sect);
    const line = this.isThrall ? "demon" : VTM20.traitLine(this.type);      // слуга берёт черты из книги падших, кроме инфернальных
    const inCat = (m, cat) => !Codex.visible(m) || (m.line ?? "") !== line || (this.isThrall && m.category === "infernal") ? false : cat === "clan" ? !!myClan && m.clan === myClan
      : cat === "sect" ? !m.clan && !!mySect && m.sect === mySect
      : !m.clan && !m.sect && (cat === "all" || m.category === cat);
    const extra = ["sect", "clan"].filter(k => Codex.merits.some(m => m.kind === this.ui.mfTab && inCat(m, k)));
    if (!["all", ...Object.keys(VTM20.meritCategories), ...extra].includes(this.ui.mfCat)) this.ui.mfCat = "all";
    const catLabel = k => k === "all" ? t("Creator.All") : k === "clan" ? t("Library.Filter.Clan")
      : k === "sect" ? t("Library.Filter.SectTraits") : loc(VTM20.meritCategories[k].label);
    // только разделы, где у этой линии есть черты (у вампиров нет инфернальных, у демонов — сверхъестественных)
    const cats = Object.keys(VTM20.meritCategories).filter(k => Codex.merits.some(m => m.kind === this.ui.mfTab && inCat(m, k)));
    ctx.mfCats = ["all", ...cats, ...extra].map(k => ({ key: k, label: catLabel(k), active: this.ui.mfCat === k }));
    ctx.mfCards = Codex.merits.filter(m => m.kind === this.ui.mfTab && inCat(m, this.ui.mfCat)
      && (!q || m.name.toLowerCase().includes(q) || (m.en ?? "").toLowerCase().includes(q)))
      .map(m => ({ name: m.name, en: m.en, cost: m.cost,
        cat: m.clan ? Codex.clanName(m.clan) : m.sect ? t(`Sect.${m.sect}`) : loc(VTM20.meritCategories[m.category]?.label ?? ""),
        on: chosen.some(x => x.name === m.name), text: VtMCreator.#preview(m.html, 200),
        html: m.html, open: this.ui.open.has(`mf:${m.kind}:${m.name}`), key: `mf:${m.kind}:${m.name}` }));
    ctx.merits = st.merits.map((m, i) => ({ ...m, index: i, ranged: m.max > m.min }));
    ctx.flaws = st.flaws.map((m, i) => ({ ...m, index: i, ranged: m.max > m.min }));
    ctx.meritPoints = this.meritPoints; ctx.flawPoints = this.flawPoints;
    ctx.traitIssues = this.traitIssues.map(c => ({ ...c, text: t(`Creator.Trait${c.key}`, c.data) }));
    ctx.flawRaw = st.flaws.reduce((s, f) => s + f.cost, 0);

    // VIII. Свободные пункты и IX. Опыт — общий список строк
    const rows = (mode) => {
      const cost = this.rules.cost;
      const row = (kind, k, label, group, value) => ({
        kind, key: k, label, group, value,
        added: mode === "free" ? (kind === "morality" || kind === "will" ? st.free[kind] : st.free[kind]?.[k] ?? 0)
          : (kind === "morality" || kind === "will" ? st.xp[kind] : st.xp[kind]?.[k] ?? 0),
        price: mode === "free" ? cost[kind] : this.xpCostOf(kind, k, value, 1)
      });
      const list = [
        ...ctx.attrGroups.flatMap(g => g.list.filter(x => !x.locked).map(x => row("attr", x.key, x.label, t("Creator.Step.attributes"), x.value))),
        ...ctx.abilGroups.flatMap(g => g.list.map(x => row("abil", x.key, x.label, g.label, x.value))),
        ...(this.rules.disc ? ctx.discCards.map(x => row("disc", x.key, x.name, this.discLabel, x.value)) : []),
        ...(mode === "free" ? ctx.bgCards.filter(b => b.on).map(b => row("bg", b.name, b.name, this.bgLabel, b.value)) : []),
        ...ctx.virtues.map(x => row("virt", x.key, x.label, t("Sheet.Virtues"), x.value)),
        row("morality", "", this.isDemon ? t("Demon.Faith") : this.isThrall ? t("Creator.ThrallFaith") : this.pathData?.name ?? t("Humanity"), t("Sheet.Other"), this.morality),
        row("will", "", t("Willpower"), t("Sheet.Other"), this.willpower)
      ];
      return [...new Set(list.map(r => r.group))].map(g => ({ label: g, rows: list.filter(r => r.group === g) }));
    };
    if (key === "freebies") {
      ctx.cost = this.rules.cost;
      ctx.freeTotal = this.freeTotal; ctx.freeSpent = this.freeSpent + this.meritPoints; ctx.freeLeft = this.freeLeft;
      ctx.freeGroups = rows("free");
    }
    if (key === "xp") {
      ctx.xpTotal = st.xpTotal; ctx.xpSpent = this.xpSpent; ctx.xpLeft = this.xpLeft;
      ctx.xpGroups = rows("xp");
    }

    // IX½. Танец с Дьяволом — договор слуги
    if (key === "pact") {
      const p = st.pact;
      ctx.pact = {
        masters: game.actors.filter(a => a.type === "demon" && a.id !== this.actor.id).map(a => ({ value: a.uuid, label: a.name, selected: a.uuid === p.master }))
          .sort((a, b) => a.label.localeCompare(b.label, "ru")),
        faith: this.morality, share: this.pactShare, shareMax: this.pactShareMax, points: this.giftPoints, used: this.giftUsed,
        over: this.giftUsed > this.giftPoints,
        attrs: ctx.attrGroups.map(g => ({ label: g.label, list: g.list.map(x => ({ key: x.key, label: x.label, base: x.value, gift: p.attr[x.key] ?? 0, total: x.value + (p.attr[x.key] ?? 0) })) })),
        abils: ctx.abilGroups.map(g => ({ label: g.label, list: g.list.map(x => ({ key: x.key, label: x.label, base: x.value, gift: p.abil[x.key] ?? 0, total: x.value + (p.abil[x.key] ?? 0) })) }))
      };
    }

    // X. Итог
    if (key === "summary") {
      ctx.summary = {
        attrs: ctx.attrGroups.map(g => ({ label: g.label, list: g.list.map(x => ({ label: x.label, value: x.value })) })),
        abils: ctx.abilGroups.map(g => ({ label: g.label, list: g.list.filter(x => x.value > 0).map(x => ({ label: x.label, value: x.value })) })),
        discs: ctx.discCards.filter(d => d.value > 0).map(d => ({ name: d.name, value: d.value, sym: d.sym })),
        bgs: ctx.bgCards.filter(b => b.value > 0).map(b => ({ name: b.name, value: b.value })),
        virtues: ctx.virtues.map(v => ({ label: v.label, value: v.value })),
        merits: st.merits, flaws: st.flaws
      };
      ctx.morality = this.morality; ctx.willpower = this.willpower;
      if (this.type === "vampire") {
        ctx.generation = 13 - Math.min(5, this.value("bg", "Поколение"));
        ctx.bloodMax = VTM20.generationOf(ctx.generation).pool;
      }
      ctx.problems = this.problems(rem);
      ctx.clanSym = this.type === "vampire" ? Codex.clanSymbol(st.clan) : null;
      ctx.pathName = this.isDemon ? t("Demon.Faith") : this.isThrall ? t("Creator.ThrallFaith") : this.pathData?.name;
      if (this.isDemon) Object.assign(ctx, { torment: this.isEarthbound ? 10 : this.houseData?.torment ?? 3, houseName: this.houseData?.name ?? "",
        visageName: this.houseData?.visages?.[st.visage] ?? "", factionName: Codex.faction(st.faction)?.name ?? "" });
      // Привязанный: Потребности вместо Добродетелей, реликварий
      ctx.virtLabel = this.isEarthbound ? t("Demon.Urges") : loc("VTM20.Sheet.Virtues");
      if (this.isEarthbound) ctx.reliquaryName = t(`Demon.ReliquaryKind.${st.reliquary || "ideal"}`);
    }
    ctx.footFree = rem.free; ctx.footXp = st.xpTotal ? rem.xp : null;
    return ctx;
  }

  /** Начало описания для превью карточки; многоточие — только если текст обрезан. */
  static #preview(html, n) {
    const t = VtMCreator.#plain(html);
    return t.length > n ? t.slice(0, n).replace(/[\s.,;:—-]+$/, "") + "…" : t;
  }

  static #plain(html) { return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }

  /* ── Поля ──────────────────────────────────────────────────────────── */

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.classList.toggle("r-earthbound", this.isEarthbound);      // огненная палитра Привязанного (styles/types/demon.css)
    attachCombos(this.element);                         // Натура и Маска — список с поиском, можно вписать свой архетип
    this.element.querySelectorAll("[data-field]").forEach(el => el.addEventListener("change", () => {
      const f = el.dataset.field;
      // список с ключами (Путь): берём ключ выбранного варианта, а не подпись
      const v = el.dataset.combo && "key" in el.dataset ? el.dataset.key : el.type === "number" ? Number(el.value) : el.value;
      if (f === "xpTotal") { this.st.xpTotal = Math.max(0, v); this.st.tier = "custom"; return this.render(); }
      foundry.utils.setProperty(this.st, f, v);
      if (f === "path") this.st.virt = { conscience: 0, selfControl: 0, courage: 0 };
      this.render();
    }));
    const search = this.element.querySelector("[data-mf-search]");
    if (search) {
      search.addEventListener("input", foundry.utils.debounce(() => { this.ui.mfSearch = search.value; this._focusSearch = true; this.render(); }, 300));
      if (this._focusSearch) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); this._focusSearch = false; }
    }
  }

  /* ── Действия ──────────────────────────────────────────────────────── */

  static #onGoto(event, target) { this.step = Number(target.dataset.i); this.render(); }
  static #onNext() { this.step = Math.min(this.steps.length - 1, this.step + 1); this.render(); }
  static #onPrev() { this.step = Math.max(0, this.step - 1); this.render(); }

  static #onTier(event, target) {
    const k = target.dataset.tier;
    this.st.tier = k; this.st.xpTotal = TIERS[k]?.xp ?? 0;
    this.render();
  }
  static #onSect(event, target) {
    const s = SECTS.find(x => x.key === target.dataset.sect);
    this.st.sectKey = s.key; this.st.sect = t(s.label);
    // новые числа секты меньше уже распределённого — распределение сбрасывается (факты биографии остаются отмеченными)
    const r = this.rules, st = this.st, reset = [];
    if (this.sum(st.disc) > r.disc) { st.disc = {}; reset.push(t("Sheet.Disciplines")); }
    if (this.sum(st.bg) > r.bg) {
      // «Поколение» Шабаш покупает свободными пунктами — переносим туда
      if (!r.bg && st.bg["Поколение"]) st.free.bg["Поколение"] = (st.free.bg["Поколение"] ?? 0) + st.bg["Поколение"];
      for (const k of Object.keys(st.bg)) st.bg[k] = 0;
      reset.push(t("Sheet.Backgrounds"));
    }
    if (this.sum(st.virt) > r.virt) { st.virt = { conscience: 0, selfControl: 0, courage: 0 }; reset.push(t("Sheet.Virtues")); }
    if (reset.length) ui.notifications.info(t("Creator.SectReset", { what: reset.join(", ") }));
    this.render();
  }
  /** Дом: Знания чужих Домов, взятые раньше, снимаются; Облик — заново. */
  static #onHouse(event, target) {
    this.st.house = target.dataset.house;
    this.st.visage = "";
    const ok = new Set(this.clanDisciplines);
    for (const bag of [this.st.disc, this.st.free.disc, this.st.xp.disc]) for (const k of Object.keys(bag)) if (!ok.has(k)) delete bag[k];
    this.render();
  }
  static #onVisage(event, target) { this.st.visage = target.dataset.visage; this.render(); }
  static #onEarthbound() { this.st.earthbound = !this.st.earthbound; this.render(); }
  static #onThrall() { this.st.thrall = !this.st.thrall; this.render(); }
  /** Доля Веры слуги хозяину: ±1 в пределах половины (вверх). */
  static #onPactShare(event, target) {
    this.st.pact.share = Math.max(0, Math.min(this.pactShareMax, this.pactShare + Number(target.dataset.d)));
    this.render();
  }
  /** Дар-прибавка к Характеристике или Способности: ±1, не выше 5 и в пределах пунктов даров. */
  static #onPactGift(event, target) {
    const { kind, key } = target.dataset, d = Number(target.dataset.d), store = this.st.pact[kind];
    const cur = store[key] ?? 0, next = cur + d;
    if (next < 0 || this.value(kind, key) + next > 5) return;
    store[key] = next;
    if (d > 0 && this.giftUsed > this.giftPoints) { store[key] = cur; ui.notifications.warn(t("Creator.PactNoPoints")); return; }
    if (!store[key]) delete store[key];
    this.render();
  }
  static #onReliquary(event, target) { this.st.reliquary = target.dataset.kind; this.render(); }
  static #onFaction(event, target) { this.st.faction = this.st.faction === target.dataset.faction ? "" : target.dataset.faction; this.render(); }
  static #onHouseAtlas() { return openHouses(this.st.house); }
  static #onClanGroup(event, target) { this.ui.clanGroup = target.dataset.group; this.render(); }
  static #onClan(event, target) {
    this.st.clan = target.dataset.clan; this.st.clanChoice = "";
    this.st.disc = {}; this.st.free.disc = {}; this.st.xp.disc = {};
    this.render();
  }
  static #onChoice(event, target) { this.st.clanChoice = target.dataset.key; this.render(); }
  static #onClanAtlas(event, target) { return openClans(target.dataset.clan); }
  /** Поколение покупается фактом биографии «Поколение» (01). */
  static #onGen(event, target) {
    const n = 13 - Number(target.dataset.gen);
    // у Шабаша фактов биографии на старте нет — «Поколение» идёт за свободные пункты
    if (n > 0 && !this.rules.bg) { this.st.bg["Поколение"] = 0; this.st.free.bg["Поколение"] = n; }
    else if (n > 0) this.st.bg["Поколение"] = n; else { delete this.st.bg["Поколение"]; delete this.st.free.bg["Поколение"]; }
    this.render();
  }

  static #onDot(event, target) {
    const { kind, key } = target.dataset;
    const n = Number(target.dataset.n);
    const st = this.st;
    if (kind === "disc" && this.isEarthbound && Codex.lore(key)?.dark) { ui.notifications.warn(t("Creator.DarkFreeOnly")); return; }
    const store = kind === "attr" ? st.attr : kind === "abil" ? st.abil : kind === "disc" ? st.disc : kind === "bg" ? st.bg : st.virt;
    const base = this.base(kind, key);
    const extra = (st.free[kind]?.[key] ?? 0) + (st.xp[kind]?.[key] ?? 0);
    const cur = base + (store[key] ?? 0);
    let want = n === cur ? n - 1 : n;
    want = Math.max(base, Math.min(want, 5 - extra));
    if (kind === "abil") want = Math.min(want, VTM20.creation.abilityCap);
    if (kind === "disc" && (this.type === "vampire" || this.isDemon) && this.clanDisciplines && !this.clanDisciplines.includes(key) && want > base) {
      ui.notifications.warn(t(this.isDemon ? "Creator.OnlyHouse" : "Creator.OnlyClan")); return;
    }
    if (kind === "disc" && want > base && this.bannedDisc(key)) { ui.notifications.warn(t("Creator.SectBanned", { name: Codex.disciplineLabel(key) })); return; }
    if (kind === "bg" && want > base && !this.rules.bg) { ui.notifications.warn(t("Creator.SabbatNoBg")); return; }
    store[key] = want - base;
    this.render();
  }

  static #onPrio(event, target) {
    const { group, kind } = target.dataset, i = Number(target.dataset.i);
    const arr = kind === "attr" ? this.st.attrPrio : this.st.abilPrio;
    const j = arr.indexOf(group);
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.render();
  }

  static #onAddDisc() {
    const k = this.element.querySelector("select[name=cr-disc]")?.value;
    if (k) { this.st.disc[k] ??= 0; this.render(); }
  }

  /** Раскрыть или свернуть полное описание факта биографии, достоинства или недостатка. */
  static #onRead(event, target) {
    const k = target.dataset.key;
    if (this.ui.open.has(k)) this.ui.open.delete(k); else this.ui.open.add(k);
    this.render();
  }

  static #onBgToggle(event, target) {
    const n = target.dataset.name;
    if (n in this.st.bg || this.st.free.bg[n]) { delete this.st.bg[n]; delete this.st.free.bg[n]; }
    else this.st.bg[n] = 0;
    this.render();
  }

  static #onMfTab(event, target) { this.ui.mfTab = target.dataset.tab; this.render(); }
  static #onMfCat(event, target) { this.ui.mfCat = target.dataset.cat; this.render(); }
  static #onMfToggle(event, target) {
    const name = target.dataset.name, kind = target.dataset.kind ?? this.ui.mfTab;
    const list = kind === "merit" ? this.st.merits : this.st.flaws;
    const i = list.findIndex(x => x.name === name);
    if (i >= 0) list.splice(i, 1);
    else {
      // Прямой запрет в тексте черты — не даём взять (trait-rules.mjs)
      const blocker = blockerFor(name, [...this.st.merits, ...this.st.flaws].map(x => x.name));
      if (blocker) return ui.notifications.warn(t("Creator.TraitBlocked", { a: name, b: blocker }));
      const m = Codex.merits.find(x => x.kind === kind && x.name === name);
      if (m) list.push({ name, cost: m.min || 1, min: m.min, max: m.max, html: m.html, category: m.category, en: m.en, clan: m.clan ?? "", sect: m.sect ?? "" });
    }
    this.render();
  }

  /** Свободные пункты и опыт: левый клик +1, правый −1. */
  static #onFree(event, target) { VtMCreator.#bump.call(this, "free", event, target); }
  static #onXp(event, target) { VtMCreator.#bump.call(this, "xp", event, target); }
  static #bump(mode, event, target) {
    const { kind, key } = target.dataset;
    const d = event.button === 2 || target.dataset.d === "-1" ? -1 : 1;
    const bag = this.st[mode];
    if (kind === "morality" || kind === "will") {
      if (d > 0 && (kind === "will" ? this.willpower >= 10 : this.morality >= (this.st.path === "humanity" || mode === "xp" ? 10 : 5))) return;
      bag[kind] = Math.max(0, bag[kind] + d);
    } else {
      const max = kind === "disc" && this.type === "vampire" ? VTM20.generationOf(13 - Math.min(5, this.value("bg", "Поколение"))).trait : 5;
      if (d > 0 && kind === "disc" && this.bannedDisc(key)) return ui.notifications.warn(t("Creator.SectBanned", { name: Codex.disciplineLabel(key) }));
      if (d > 0 && this.value(kind, key) >= max) return;
      bag[kind][key] = Math.max(0, (bag[kind][key] ?? 0) + d);
    }
    this.render();
  }

  static async #onRollBlood() {
    const r = await new Roll("1d10").evaluate();
    this.st.blood = r.total;
    r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: t("Creator.BloodRoll") }, { messageMode: "self" });
    this.render();
  }

  /* ── Запись ────────────────────────────────────────────────────────── */

  static async #onFinish() {
    const rem = this.remaining(), probs = this.problems(rem);
    if (probs.length) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("Creator.FinishTitle") },
        content: `<p>${t("Creator.HasProblems")}</p><ul>${probs.map(p => `<li>${p}</li>`).join("")}</ul>`
      });
      if (!ok) return;
    }
    await this.#write();
    this.close();
    this.actor.sheet.render(true);
  }

  async #write() {
    const a = this.actor, st = this.st;
    const sys = {
      attributes: Object.fromEntries(Object.keys(VTM20.attributes).map(k => [k, { value: this.value("attr", k), specialty: a.system.attributes[k].specialty }])),
      abilities: Object.fromEntries(Object.keys(VTM20.abilities).map(k => [k, { value: this.value("abil", k), specialty: a.system.abilities[k].specialty }])),
      virtues: Object.fromEntries(["conscience", "selfControl", "courage"].map(k => [k, { value: this.value("virt", k) }])),
      morality: { path: st.path, value: this.morality },
      willpower: { permanent: this.willpower, temporary: this.willpower },
      experience: {
        total: st.xpTotal, spent: this.xpSpent,
        log: st.xpTotal ? [{ amount: st.xpTotal, reason: t("Creator.XpStart"), date: "" },
          ...(this.xpSpent ? [{ amount: -this.xpSpent, reason: t("Creator.XpCreation"), date: "" }] : [])] : []
      },
      details: { ...a.system.details, concept: st.concept, nature: st.nature, demeanor: st.demeanor, sire: st.sire, sect: st.sect }
    };
    if (this.type === "vampire") {
      const gen = 13 - Math.min(5, this.value("bg", "Поколение"));
      const max = VTM20.generationOf(gen).pool;
      Object.assign(sys, { clan: st.clan, clanChoice: st.clanChoice, weaknessNote: st.weaknessNote, generation: gen,
        blood: { value: Math.min(max, st.blood ?? Math.ceil(max / 2)) } });
    }
    if (this.type === "ghoul") Object.assign(sys, { domitor: st.domitor, blood: { value: 1, max: a.system.blood.max } });
    // Слуга: Вера слуги и хозяин; Человечность не трогаем (грех слуги — по его Воле); дары-прибавки — сразу в черты
    if (this.isThrall) {
      delete sys.morality;
      for (const [k, n] of Object.entries(st.pact.attr)) sys.attributes[k].value = Math.min(5, sys.attributes[k].value + n);
      for (const [k, n] of Object.entries(st.pact.abil)) sys.abilities[k].value = Math.min(5, sys.abilities[k].value + n);
      sys.thrall = { master: st.pact.master, faith: this.morality };
    }
    if (this.isDemon) {
      delete sys.morality;
      Object.assign(sys, { house: st.house, visage: st.visage, faction: st.faction, names: { ...st.names },
        faith: { permanent: this.morality, temporary: this.morality },
        torment: { permanent: this.houseData?.torment ?? 3, temporary: 0 }, apocalyptic: false });
      // Привязанный: Мука 10, Добродетелей нет — их точки стали Потребностями
      if (this.isEarthbound) Object.assign(sys, { earthbound: true, torment: { permanent: 10, temporary: 0 }, reliquary: { kind: st.reliquary || "ideal", faith: 0 },
        urges: { flesh: this.value("virt", "conscience"), thought: this.value("virt", "selfControl"), emotion: this.value("virt", "courage") },
        virtues: { conscience: { value: 0 }, selfControl: { value: 0 }, courage: { value: 0 } } });
    }
    await a.update({ name: st.name, system: sys });

    const kill = a.items.filter(i => ["discipline", "thaumPath", "lore", "background", "merit", "flaw"].includes(i.type)).map(i => i.id);
    if (kill.length) await a.deleteEmbeddedDocuments("Item", kill);
    const icon = n => `systems/${SYSTEM_ID}/assets/icons/${n}.svg`;
    const items = [];
    const discKeys = new Set([...(this.clanDisciplines ?? []), ...Object.keys(st.disc), ...Object.keys(st.free.disc), ...Object.keys(st.xp.disc)]);
    if (this.type === "ghoul") discKeys.add("potence");
    for (const k of discKeys) {
      if (this.isDemon) {                               // Знания падшего — предметами «Знание» со справочным ключом
        const l = Codex.lore(k), v = this.value("disc", k);
        if (l && v > 0) items.push({ name: l.name, type: "lore", img: icon(l.dark ? "darkLore" : "lore"),
          system: { key: k, value: v, description: `<p><em>${l.en}</em> · ${Codex.house(l.house)?.name ?? t("Demon.Common")}</p>` } });
        continue;
      }
      const v = this.value("disc", k), d = Codex.discipline(k);
      if (!d || (v <= 0 && !this.inClan(k))) continue;
      items.push({ name: d.name, type: "discipline", img: Codex.disciplineIcon(k), system: { key: k, value: v, inClan: false } });
      const firstPath = { thaumaturgy: "Путь Крови", necromancy: "Путь Склепа" }[k];
      if (firstPath && v > 0) items.push({ name: firstPath, type: "thaumPath", img: Codex.disciplineIcon(k),
        system: { discipline: k, value: Math.min(5, v), primary: true, description: Codex.bloodPath(k, firstPath)?.html ?? "" } });
    }
    const bgLine = this.isThrall ? "demon" : VTM20.traitLine(this.type);       // слуга — факты биографии из книги падших
    for (const b of Codex.backgrounds.filter(b => (b.line ?? "") === bgLine)) {   // одноимённые у демонов — своя линия
      const v = this.value("bg", b.name);
      if (v > 0) items.push({ name: b.name, type: "background", img: backgroundIcon(b.en) ?? icon("background"), system: { value: v, description: b.html, source: b.en } });
    }
    for (const m of st.merits) items.push({ name: m.name, type: "merit", img: traitIcon(m.category), system: { cost: m.cost, category: m.category, clan: m.clan ?? "", sect: m.sect ?? "", description: m.html, source: m.en } });
    for (const m of st.flaws) items.push({ name: m.name, type: "flaw", img: traitIcon(m.category, true), system: { cost: m.cost, category: m.category, clan: m.clan ?? "", sect: m.sect ?? "", description: m.html, source: m.en } });
    if (this.type === "vampire" && /^malkavian/.test(st.clan) && !a.items.some(i => i.type === "derangement")) {
      items.push({ name: t("Creator.MalkDerangement"), type: "derangement", img: icon("derangement"), system: { permanent: true, description: `<p>${t("Creator.MalkDerangementHint")}</p>` } });
    }
    await a.createEmbeddedDocuments("Item", items);
    await a.setFlag(SYSTEM_ID, "created", true);
    if (this.isThrall) await this.#writePact();
    ui.notifications.info(t("Creator.Done", { name: st.name }));
  }

  /** Договор слуги — строкой в листе хозяина (system.thralls): Вера, доля, Воля, условия и дары. */
  async #writePact() {
    const a = this.actor, p = this.st.pact;
    const master = p.master ? await fromUuid(p.master) : null;
    if (!master || master.type !== "demon") return;
    if (!master.isOwner) { ui.notifications.warn(t("Creator.PactNoAccess", { name: master.name })); return; }
    const boosts = [...Object.entries(p.attr).map(([k, n]) => `${loc(VTM20.attributes[k].label)} +${n}`),
      ...Object.entries(p.abil).map(([k, n]) => `${loc(VTM20.abilities[k].label)} +${n}`)].join(", ");
    const row = { name: a.name, uuid: a.uuid, faith: this.morality, share: Math.min(3, this.pactShare), will: this.willpower, wounds: 0, lost: 0,
      terms: p.terms, gifts: [p.gifts, boosts].filter(Boolean).join(" · ") };
    await master.update({ "system.thralls": [...master.system.thralls.filter(x => x.uuid !== a.uuid), row] });
  }
}
