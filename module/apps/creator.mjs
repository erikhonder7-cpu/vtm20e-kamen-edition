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
import { traitIcon, backgroundIcon } from "../data/icons.mjs";
import { W as werewolfData, ownGift, wwGlyphSrc, feraSym } from "./werewolf.mjs";
import { M as mageData, mageGlyphSrc, subLabel } from "./mage.mjs";
import { H as hunterData, edgeCost, growth as hunterGrowth, sacrificeOn as hunterSacrificeOn, hasOwnPath, creedCapped, edgeBarred, HERMIT_PATH, hermitEdgeMadness, hasPrevEdge } from "./hunter.mjs";

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
  // Охотник (Hunter: The Reckoning, гл. 4): Добродетели охоты с нуля, 3 очка (слоты: Милосердие, Прозрение, Рвение), Убеждённость
  // по кредо (слот morality, 1 за точку, не выше 8), Воля 3; Добродетели свободными пунктами не покупаются
  hunter: { attr: [6, 4, 3], abil: [11, 7, 4], disc: 0, bg: 5, virt: 3, free: 21,
    cost: { attr: 5, abil: 2, disc: 0, bg: 1, virt: 0, morality: 1, will: 1 } },
  // Слуга падшего (Damned and Deceived, гл. 4): Добродетели падших по точке и ещё 3, Вера слуги 1 (слот morality, 7 за точку), 15 свободных
  thrall: { attr: [6, 4, 3], abil: [11, 7, 4], disc: 0, bg: 5, virt: 3, free: 15,
    cost: { attr: 5, abil: 2, disc: 0, bg: 1, virt: 2, morality: 7, will: 1 } },
  // Гару и Фера (W20, гл. 3): Факты 5, три Дара 1-го уровня (свой шаг), Добродетелей и морали нет; Ярость по аугурии,
  // Гнозис по породе, Воля по племени; 15 бонусных: Атрибут 5, Способность 2, Факт 1, Дар 7, Ярость 1, Гнозис 2, Воля 1
  werewolf: { attr: [7, 5, 3], abil: [13, 9, 5], disc: 0, bg: 5, virt: 0, free: 15,
    cost: { attr: 5, abil: 2, disc: 0, bg: 1, virt: 0, morality: 0, will: 1, rage: 1, gnosis: 2, gift: 7 } },
  // Маг (M20, гл. 6): Факты 7, Сферы 6 (на месте Дисциплин: слот disc), Арете 1 (слот morality, до 3 при создании), Воля 5;
  // 15 свободных: Атрибут 5, Способность 2, Факт 1, Сфера 7, Арете 4, Воля 1. Добродетелей и Человечности нет.
  mage: { attr: [7, 5, 3], abil: [13, 9, 5], disc: 6, bg: 7, virt: 0, free: 15,
    cost: { attr: 5, abil: 2, disc: 7, bg: 1, virt: 0, morality: 4, will: 1, quint: 1 } }   // quint: 1 пункт — 4 Квинтэссенции
};
/** Шаги, где у мага свой текст подсказки (ключ + «Mage»). */
const MAGE_HINTS = new Set(["disciplines", "advantages", "freebies"]);
/** Слава Гару: Слава, Честь, Мудрость. */
const RENOWN = ["glory", "honor", "wisdom"];
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
  concept: "ConceptHint", clan: "ClanHint", house: "HouseHint", garou: "GarouHint", mage: "MageHint", gifts: "GiftsHint", attributes: "AttrHintShort", abilities: "AbilHintShort",
  disciplines: "DiscHint", advantages: "AdvHint", edges: "EdgesHint", bloodrights: "BloodrightsHint", merits: "MeritHint", freebies: "FreeHint", xp: "XpHint", pact: "PactHint", summary: "FinishHint"
};
/** Сколько Даров у рода Фера на старте, если не три (W20 Changing Breeds: Мокол — аспект и общий, Рокеа — общий и аугурии). */
const FERA_START_GIFTS = { mokole: 2, rokea: 2 };
/** Шаги, где у гуля свой текст подсказки (ключ + «Ghoul»). */
const GHOUL_HINTS = new Set(["concept", "disciplines", "summary"]);
/** Шаги, где у демона свой текст подсказки (ключ + «Demon»). */
const DEMON_HINTS = new Set(["concept", "disciplines", "advantages", "freebies", "summary"]);
// у Привязанного свои подсказки: Знания с Тёмными, Потребности вместо Добродетелей, 21 пункт, Мука 10
const EB_HINTS = new Set(["disciplines", "advantages", "freebies", "summary"]);
const THRALL_HINTS = new Set(["concept", "advantages", "freebies", "summary"]);
const HUNTER_HINTS = new Set(["concept", "advantages", "freebies", "summary"]);
const GAROU_HINTS = new Set(["concept", "abilities", "advantages", "freebies", "xp", "summary"]);
/** Слоты Добродетелей мастера → Добродетели охоты. */
const HUNTER_SLOTS = { conscience: "mercy", selfControl: "vision", courage: "zeal" };
/** Свидетель (Players Guide, гл. 1): свои Добродетели в тех же слотах — Рассудок, Самоконтроль, Смелость. */
const LOST_SLOTS = { conscience: "reason", selfControl: "selfControl", courage: "courage" };
/** Достоинство, делающее одну Дисциплину клановой (V20, Appendix: Merits and Flaws), — по английскому имени. */
const EXTRA_DISC_MERIT = "Additional Discipline";

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
      creed: VtMCreator.#onCreed, edgeToggle: VtMCreator.#onEdgeToggle, brSet: VtMCreator.#onBrSet, dhSwap: VtMCreator.#onDhSwap,
      magePick: VtMCreator.#onMagePick, garouPick: VtMCreator.#onGarouPick, garouGift: VtMCreator.#onGarouGift, garouExtra: VtMCreator.#onGarouExtra,
      house: VtMCreator.#onHouse, earthbound: VtMCreator.#onEarthbound, thrall: VtMCreator.#onThrall, mark: VtMCreator.#onMark, markPower: VtMCreator.#onMarkPower, pactShare: VtMCreator.#onPactShare, pactGift: VtMCreator.#onPactGift, reliquary: VtMCreator.#onReliquary, visage: VtMCreator.#onVisage, faction: VtMCreator.#onFaction, houseAtlas: VtMCreator.#onHouseAtlas,
      gen: VtMCreator.#onGen, choice: VtMCreator.#onChoice, clanAtlas: VtMCreator.#onClanAtlas,
      dot: VtMCreator.#onDot, prio: VtMCreator.#onPrio,
      bgToggle: VtMCreator.#onBgToggle, mfToggle: VtMCreator.#onMfToggle, mfTab: VtMCreator.#onMfTab, mfCat: VtMCreator.#onMfCat,
      addDisc: VtMCreator.#onAddDisc, dropDisc: VtMCreator.#onDropDisc, read: VtMCreator.#onRead,
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
      domitor: s.domitor ?? "", path: "humanity", tier: "fledgling", xpTotal: 0, hunterExtra: 0,
      house: s.house || "devils", visage: s.visage ?? "", faction: s.faction ?? "",
      names: { celestial: s.names?.celestial ?? "", trueName: s.names?.trueName ?? "" },
      attrPrio: ["physical", "social", "mental"], abilPrio: ["talents", "skills", "knowledges"],
      attr: {}, abil: {}, disc: {}, bg: {},
      virt: { conscience: 0, selfControl: 0, courage: 0 },
      merits: [], flaws: [],
      extraDisc: "",                    // Дисциплина, ставшая клановой по достоинству «Дополнительная Дисциплина» (V20, Appendix)
      free: { attr: {}, abil: {}, disc: {}, bg: {}, virt: {}, morality: 0, will: 0, rage: 0, gnosis: 0 },
      xp: { attr: {}, abil: {}, disc: {}, virt: {}, morality: 0, will: 0, rage: 0, gnosis: 0 },
      blood: null,
      // слуга: «Танец с Дьяволом» — хозяин (uuid демона), доля Веры хозяину (−1 — наибольшая), условия, дары словами и прибавками
      pact: { master: "", share: -1, terms: "", gifts: "", attr: {}, abil: {} },
      // охотник: кредо и Грани (ключи «путь|уровень»)
      creed: s.hunter?.creed || "defense", edges: [...(s.hunter?.edges ?? [])],
      // дампир (Accursed Heirs): концепция, клан Предка, Кровные права (ключ → точки)
      dhConcept: s.dhampir?.concept ?? "", dhSwap: false, antecedent: s.dhampir?.antecedent ?? "", antecedentClan: s.dhampir?.antecedentClan ?? "",
      bloodrights: { ...(s.dhampir?.bloodrights ?? {}) },
      // особый смертный (W20 Kinfolk, W20 Umbra, Book of the Wyrm): Родня Гару, Ками, фомор — отметки на листе смертного
      mark: s.kinfolk?.on ? "kinfolk" : s.kami?.on ? "kami" : s.fomor?.on ? "fomor" : "",
      markTribe: s.kinfolk?.tribe || "", kamiKind: s.kami?.kind || "human", kamiGeas: s.kami?.geas || "",
      kamiPowers: (s.kami?.powers ?? []).map(x => x.key), fomorBreed: s.fomor?.breed || "", fomorPowers: [],
      // Гару (W20, гл. 3) и Фера (W20 Changing Breeds): порода, аугурия, племя или род с выбором внутри рода, Дары по ячейкам,
      // Дары сверх трёх (7 бонусных), уродство метиса, Слава (у Рагабаша и Фера — 3 точки на выбор)
      // Маг (M20): фракция, Сущность, родовая Сфера, фокус (парадигма и практика); Сферы — в disc, Арете — в morality
      mg: { faction: s.mage?.faction || "", sub: s.mage?.sub || "", essence: s.mage?.essence || "", affinity: s.mage?.affinity || "", group: "",
        paradigm: s.mage?.paradigm || "", practice: s.mage?.practice || "" },
      ww: { breed: s.werewolf?.breed || "homid", auspice: s.werewolf?.auspice || "ragabash", tribe: s.werewolf?.tribe || "boneGnawers",
        fera: s.werewolf?.fera || "", sub: {}, gifts: {}, extra: [], deform: "", renown: { glory: 0, honor: 0, wisdom: 0 } }
    };
    this.ui = { clanGroup: "clan", mfTab: "merit", mfCat: "all", mfSearch: "", open: new Set() };
  }

  /* ── Шаги ──────────────────────────────────────────────────────────── */

  get steps() {
    const s = ["concept"];
    if (this.type === "vampire") s.push("clan");
    if (this.type === "demon") s.push("house");
    if (this.isWerewolf) s.push("garou");                   // порода, аугурия, племя — или род Фера
    if (this.isMage) s.push("mage");                        // фракция, Сущность, родовая Сфера, фокус
    s.push("attributes", "abilities");
    if (this.rules.disc > 0) s.push("disciplines");
    if (this.isWerewolf) s.push("gifts");                   // три Дара 1-го уровня
    s.push("advantages");
    if (this.isHunter && !this.isLost) s.push("edges");     // Грани — на очки Добродетелей охоты; у Свидетеля Граней нет
    if (this.isDhampir) s.push("bloodrights");              // Кровные права дампира (Accursed Heirs, гл. 4)
    s.push("merits", "freebies");
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
    // Свидетель: 7 точек Добродетелей (1–5), свободными — по 2; Убеждённость 10 не покупается
    if (this.isLost) return { ...this.baseRules, virt: 7, cost: { ...this.baseRules.cost, virt: 2, morality: 0 } };
    // опытный охотник (Players Guide, гл. 2): рассказчик даёт 3–6 очков Добродетелей сверх трёх
    if (this.isHunter) return { ...this.baseRules, virt: this.baseRules.virt + (this.st?.hunterExtra ?? 0) };
    // дампир (Accursed Heirs, гл. 4): как гуль, но 18 свободных пунктов и Кровное право 1 (дальше — 5 за точку)
    if (this.isDhampir) return { ...this.baseRules, free: 18, disc: this.baseRules.disc + (this.st?.dhSwap ? 1 : 0) };
    return this.type === "vampire" ? { ...this.baseRules, ...(SECT_RULES[this.st?.sectKey] ?? {}) } : this.baseRules;
  }
  /** Особый смертный для шаблона: варианты, поля и силы. */
  markView() {
    const W = Codex.werewolf ?? {}, st = this.st, lbl = x => VTM20.label(x);
    const fb = (W.fomori?.breeds ?? []).find(b => b.key === st.fomorBreed);
    const own = new Set((fb?.powers ?? []).filter(k => !k.startsWith("~")));
    return {
      mark: st.mark,
      opts: ["kinfolk", "kami", "fomor"].map(k => ({ key: k, label: t(`Creator.Mark.${k}`), active: st.mark === k })),
      hint: st.mark ? t(`Creator.Mark.${st.mark}Hint`) : t("Creator.Mark.none"),
      tribes: (W.tribes ?? []).map(x => ({ key: x.key, label: lbl(x), selected: x.key === st.markTribe })),
      kamiKinds: ["human", "animal", "plant"].map(k => ({ key: k, label: loc(`VTM20.Werewolf.Kami.form.${k}`), selected: k === st.kamiKind })),
      kamiPowers: (W.kami?.powers ?? []).filter(x => x.kind === "kami" || (st.kamiKind === "plant" && x.kind === "immobile"))
        .map(x => ({ key: x.key, label: lbl(x), text: VtMCreator.#preview(x.text, 700), on: st.kamiPowers.includes(x.key) })),
      fomorBreeds: (W.fomori?.breeds ?? []).map(b => ({ key: b.key, label: lbl(b), selected: b.key === st.fomorBreed })),
      fomorText: fb ? String(fb.text ?? "").replace(/<[^>]+>/g, "").slice(0, 400) : "",
      fomorPowers: (W.fomori?.powers ?? []).map(x => ({ key: x.key, label: lbl(x), text: VtMCreator.#preview(x.text, 700),
        own: own.has(x.key), on: own.has(x.key) || st.fomorPowers.includes(x.key) }))
    };
  }

  /** Падший создаётся Привязанным к Земле (переключатель на шаге Дома). */
  get isEarthbound() { return this.type === "demon" && !!this.st?.earthbound; }
  /** Смертный создаётся слугой падшего (переключатель на шаге концепции). */
  get isThrall() { return this.type === "mortal" && !!this.st?.thrall; }
  /** Охотник (Hunter: The Reckoning). */
  get isHunter() { return this.type === "hunter"; }
  /** Дампир (Accursed Heirs: Dhampirs) — гуль с типом «dhampir» (выбирается в шапке листа). */
  get isDhampir() { return this.type === "ghoul" && this.actor.system.ghoulType === "dhampir"; }
  /* ── Маг (M20, гл. 6) ── */
  get isMage() { return this.type === "mage"; }
  get mageFaction() { return (mageData().factions ?? []).find(f => f.key === this.st.mg.faction) ?? null; }
  get mageTech() { return this.mageFaction?.group === "technocracy"; }
  /** Сфера как «Дисциплина» мастера: имя (у Технократии — своё) и ранги вместо сил. */
  mageSphere(k) {
    const D = mageData(), sp = (D.spheres ?? []).find(x => x.key === k), alt = this.mageTech && sp?.tech ? sp.tech : null;
    return sp ? { key: k, name: alt?.name ?? sp.name, en: alt?.en ?? sp.en,
      powers: (alt?.ranks ?? sp.ranks ?? []).map((html, i) => ({ level: i + 1, name: D.ranks?.[i] ?? "", en: "", html })) } : null;
  }
  get mageIssues() {
    const g = this.st.mg, out = [];
    if (!g.faction) out.push(loc("VTM20.MageCr.NeedFaction"));
    if (!g.essence) out.push(loc("VTM20.MageCr.NeedEssence"));
    if (!g.affinity) out.push(loc("VTM20.MageCr.NeedAffinity"));
    return out;
  }
  /** Сферы: точка в родовой обязательна; ни одна Сфера не выше Арете. */
  get sphereIssues() {
    const out = [], a = this.st.mg.affinity;
    if (a && this.value("disc", a) < 1) out.push(loc("VTM20.MageCr.NeedAffinityDot"));
    if (VTM20.mageSpheres.some(k => this.value("disc", k) > this.morality)) out.push(loc("VTM20.MageCr.OverArete"));
    return out;
  }
  /** Начальная Квинтэссенция — по рейтингу Аватара (у Технократии — Гения). */
  /** Квинтэссенция на старте: рейтинг Аватара и по 4 за свободный пункт (M20, гл. 6), на колесе — не больше 20. */
  get mageQuint() { return Math.min(20, this.mageAvatar + 4 * (this.st.free.quint ?? 0)); }
  get mageAvatar() { return Math.max(0, ...Codex.backgrounds.filter(b => b.line === "mage" && /^(Avatar|Genius)/i.test(b.en ?? "")).map(b => this.value("bg", b.name))); }

  /* ── Гару и Фера (W20, гл. 3; W20 Changing Breeds) ── */
  get isWerewolf() { return this.type === "werewolf"; }
  get garouBreed() { return werewolfData().breeds.find(x => x.key === this.st.ww.breed) ?? null; }
  get garouAuspice() { return werewolfData().auspices.find(x => x.key === this.st.ww.auspice) ?? null; }
  get garouTribe() { return werewolfData().tribes.find(x => x.key === this.st.ww.tribe) ?? null; }
  get feraData() { return this.st.ww.fera ? (werewolfData().fera ?? []).find(b => b.key === this.st.ww.fera) ?? null : null; }
  /** Измерения рода Фера, в которых есть выбор (порода, аспект, племя, варна…). */
  get feraDims() { return (this.feraData?.dims ?? []).filter(d => d.options.length); }
  /** Начальные Ярость, Гнозис и Воля: у Гару — по аугурии, породе и племени; у Фера — по выбранному внутри рода, иначе по роду. */
  get garouBase() {
    const f = this.feraData;
    if (!f) return { rage: this.garouAuspice?.rage ?? 1, gnosis: this.garouBreed?.gnosis ?? 1, will: this.garouTribe?.willpower ?? 3 };
    const picked = this.feraDims.map(d => d.options.find(o => o.key === this.st.ww.sub[d.key])).filter(Boolean);
    const stat = k => picked.find(o => o.stats?.[k] != null)?.stats[k] ?? f.base?.[k];
    return { rage: stat("rage") ?? 1, gnosis: stat("gnosis") ?? 1, will: stat("will") ?? 3 };
  }
  /** Ячейки стартовых Даров: у Гару — порода, аугурия, племя; у Фера — общий список рода и списки выбранного (всего три). */
  get giftSlots() {
    if (!this.feraData) return ["breed", "auspice", "tribe"].map(k => ({ key: k, label: loc(`VTM20.GarouCr.GiftFrom.${k}`), sub: null }));
    const D = werewolfData(), f = this.feraData.key, sub = this.st.ww.sub;
    // ячейка выбора рода — если у него вообще есть Дары 1-го уровня; пока вариант не выбран, ячейка просит его выбрать
    const has = (d, o) => D.gifts.some(g => g.level === 1 && g.groups.some(x => x.kind === "fera" && x.key === f && (o ? x.sub === `${d.key}:${o}` : x.sub?.startsWith(`${d.key}:`))));
    const lists = this.feraDims.filter(d => sub[d.key] ? has(d, sub[d.key]) : has(d))
      .map(d => ({ key: d.key, sub: sub[d.key] ? `${d.key}:${sub[d.key]}` : null, need: sub[d.key] ? "" : d.label,
        // «Дар: Аспект — Восходящее Солнце»: видно, из чьего списка ячейка
        label: t("GarouCr.GiftOf", { what: sub[d.key] ? `${d.label} — ${VTM20.label(d.options.find(o => o.key === sub[d.key]) ?? {})}` : d.label }) }));
    // стартовых Даров у Фера обычно три; у Мокол — Дар аспекта и общий, у Рокеа — общий и Дар аугурии (W20 Changing Breeds)
    const total = FERA_START_GIFTS[f] ?? 3;
    const general = Array.from({ length: Math.max(1, total - lists.length) }, (_, i) => ({ key: `general${i}`, label: loc("VTM20.GarouCr.GiftGeneral"), sub: "" }));
    return [...general, ...lists];
  }
  /** Дары 1-го уровня для ячейки. */
  slotGifts(slot) {
    if (slot.need) return [];
    if (slot.sub === null) return ({ breed: this.garouBreed, auspice: this.garouAuspice, tribe: this.garouTribe }[slot.key]?.startGifts ?? []);
    const f = this.feraData.key;
    return werewolfData().gifts.filter(g => g.level === 1 && g.groups.some(x => x.kind === "fera" && x.key === f && (x.sub ?? "") === slot.sub)).map(g => g.key);
  }
  /** Кто такой персонаж для «своих» Даров (ownGift). */
  get garouSelf() { const w = this.st.ww; return this.feraData ? { fera: w.fera, feraSub: w.sub } : { breed: w.breed, auspice: w.auspice, tribe: w.tribe }; }
  /** Слава: по аугурии; у Рагабаша и у Фера — 3 точки в любом сочетании. */
  get renownFixed() { return !this.feraData && !!this.garouAuspice?.renown; }
  get garouRenown() {
    const r = this.renownFixed ? this.garouAuspice.renown : null;
    return r ? Object.fromEntries(RENOWN.map((k, i) => [k, r[i] ?? 0])) : { ...this.st.ww.renown };
  }
  get isMetis() { return this.feraData ? this.st.ww.sub.breed === "metis" : this.st.ww.breed === "metis"; }
  get garouRage() { return Math.min(10, this.garouBase.rage + this.st.free.rage + this.st.xp.rage); }
  get garouGnosis() { return Math.min(10, this.garouBase.gnosis + this.st.free.gnosis + this.st.xp.gnosis); }
  /** Что не выбрано на шаге «Порода и племя» и «Дары». */
  get garouIssues() {
    const w = this.st.ww, out = [];
    if (this.feraData) { if (this.feraDims.some(d => d.key !== "pryio" && !w.sub[d.key])) out.push(loc("VTM20.GarouCr.NeedFera")); }
    else if (!this.garouBreed || !this.garouAuspice || !this.garouTribe) out.push(loc("VTM20.GarouCr.NeedConcept"));
    if (this.isMetis && !w.deform) out.push(loc("VTM20.GarouCr.NeedDeformity"));
    return out;
  }
  get giftIssues() {
    return this.giftSlots.some(s => !this.st.ww.gifts[s.key]) ? [loc(this.feraData ? "VTM20.GarouCr.NeedFeraGifts" : "VTM20.GarouCr.NeedGifts")] : [];
  }
  get renownIssues() { return !this.renownFixed && RENOWN.reduce((n, k) => n + this.st.ww.renown[k], 0) !== 3 ? [loc("VTM20.GarouCr.NeedRenown")] : []; }
  /** Сбросить Дары, которых нет в новых ячейках (после смены породы, аугурии, племени или выбора у Фера). */
  fixGiftSlots() {
    const w = this.st.ww, slots = this.giftSlots;
    for (const s of Object.keys(w.gifts)) if (!slots.some(x => x.key === s)) delete w.gifts[s];
    for (const s of slots) if (w.gifts[s.key] && !this.slotGifts(s).includes(w.gifts[s.key])) w.gifts[s.key] = "";
    w.extra = w.extra.filter(k => !Object.values(w.gifts).includes(k));
  }

  /** Бесплатных точек Кровных прав: 1, Древность 3–4 — ещё 1, 5 — ещё 2. */
  get bloodrightBase() { const a = this.value("bg", Codex.backgrounds.find(b => b.en === "Antiquity")?.name ?? ""); return 1 + (a >= 5 ? 2 : a >= 3 ? 1 : 0); }
  get bloodrightDots() { return this.sum(this.st.bloodrights); }
  /** Дисциплины клана Предка дампира (Мощь — всегда «своя»). */
  get dhampirClanDiscs() {
    const c = Codex.clan(Codex.traitClan(this.st.antecedentClan)) ?? Codex.clan(this.st.antecedentClan);
    return ["potence", ...(c?.disciplines ?? [])];
  }
  /** Точки сверх бесплатных — за свободные пункты (5 за точку). */
  get bloodrightExtra() { return this.isDhampir ? Math.max(0, this.bloodrightDots - this.bloodrightBase) : 0; }
  get creedData() { return this.isHunter ? hunterData().creeds.find(c => c.key === this.st.creed) ?? null : null; }
  /** Свидетель — кредо «bystander». */
  get isLost() { return this.isHunter && this.st?.creed === "bystander"; }
  /** Добродетели охоты по слотам мастера. */
  hunterVirtue(v) { return this.value("virt", Object.keys(HUNTER_SLOTS).find(k => HUNTER_SLOTS[k] === v)); }
  /** Почему Грань нельзя взять (охотник, гл. 4): уровни по порядку, очки Добродетели, не выше высшей Грани пути кредо. */
  edgeIssues(key) {
    const H = hunterData(), e = H.edges.find(x => x.key === key);
    if (!e) return [];
    const have = new Set(this.st.edges), own = this.st.edges.map(k => H.edges.find(x => x.key === k)).filter(Boolean);
    const used = own.filter(x => x.virtue === e.virtue && x.key !== key).reduce((s, x) => s + edgeCost(x.level), 0);
    const top = Math.max(0, ...own.filter(x => x.path === this.st.creed && x.key !== key).map(x => x.level));
    const out = [];
    if (!hasPrevEdge(have, e)) out.push(t("Hunter.NeedPrev", { n: e.level - 1 }));
    if (used + edgeCost(e.level) > this.hunterVirtue(e.virtue)) out.push(t("Hunter.NeedVirtue", { v: H.virtues[e.virtue], n: used + edgeCost(e.level) }));
    if (edgeBarred(this.st.creed, key)) out.push(t("Hunter.Barred", { creed: this.creedData?.who ?? "" }));
    if (e.path !== this.st.creed && creedCapped(this.st.creed) && e.level > top) out.push(t("Hunter.NeedCreed", { n: top }));
    if (e.path === HERMIT_PATH && this.st.creed !== HERMIT_PATH && this.hunterVirtue("vision") < 4) out.push(t("Hunter.NeedVision4"));
    if ((this.st.hunterExtra ?? 0) > 0 && e.path !== this.st.creed && e.level >= 4) out.push(t("Hunter.AdvancedOther"));
    if (e.level >= 5) out.push(t("Hunter.FifthLevel"));
    return out;
  }
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
    if (this.isHunter) return 0;                        // Добродетели охоты — с нуля
    if (slot === "courage") return 1;
    return this.altVirtues.includes(slot === "conscience" ? "conviction" : "instinct") ? 0 : 1;
  }
  get ugly() { return this.type === "vampire" && VTM20.uglyClans.includes(this.st.clan); }

  /** Взято ли достоинство «Дополнительная Дисциплина» (только Сородичу; каитифам и пандерам — нельзя, V20, Appendix). */
  get extraDiscMerit() { return this.type === "vampire" && this.st.merits.some(m => m.en === EXTRA_DISC_MERIT); }
  /** Дисциплина, выбранная по этому достоинству («» — ещё не выбрана). */
  get extraDisc() { return this.extraDiscMerit && this.baseClanDisciplines ? this.st.extraDisc || "" : ""; }
  /** Клановые Дисциплины по крови, без достоинства; null — любые. */
  get baseClanDisciplines() {
    const c = this.clanData;
    if (!c || !c.disciplines.length) return null;
    return [...c.disciplines, ...(c.choice?.includes(this.st.clanChoice) ? [this.st.clanChoice] : [])];
  }
  /** Что можно выбрать по «Дополнительной Дисциплине»: любая видимая не из клана и не закрытая сектой. */
  get extraDiscOptions() {
    const base = this.baseClanDisciplines ?? [];
    const banned = k => this.st.sectKey === "camarilla" && CAMARILLA_BANNED.includes(k);
    return Object.values(Codex.disciplines).filter(d => !base.includes(d.key) && Codex.visible(d) && !banned(d.key))
      .map(d => ({ value: d.key, label: d.name, selected: d.key === this.st.extraDisc })).sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }

  /** Клановые Дисциплины; null — любые (каитиф, пандеры, гуль). */
  get clanDisciplines() {
    if (this.type === "ghoul") return null;
    if (this.isMage) return VTM20.mageSpheres;
    if (this.isDemon) return [...(this.houseData?.lores ?? []), ...(Codex.demon?.common ?? []),        // Знания Дома и общие
      ...(this.isEarthbound ? Codex.lores.filter(l => l.dark).map(l => l.key) : [])];                     // Привязанному — и Тёмные
    const base = this.baseClanDisciplines;
    if (!base) return null;
    return this.extraDisc && !base.includes(this.extraDisc) ? [...base, this.extraDisc] : base;
  }
  inClan(k) { const c = this.clanDisciplines; return c ? c.includes(k) : false; }

  attrGroupOf(k) { return Object.entries(VTM20.attributeGroups).find(([, g]) => g.attributes.includes(k))[0]; }
  attrLimit(g) { return this.rules.attr[this.st.attrPrio.indexOf(g)]; }
  abilLimit(g) { return this.rules.abil[this.st.abilPrio.indexOf(g)]; }
  sum(o, f = () => true) { return Object.entries(o).filter(([k]) => f(k)).reduce((s, [, v]) => s + (v || 0), 0); }

  base(kind, k) {
    if (kind === "attr") return (k === "appearance" && this.ugly) ? 0 : 1;
    if (kind === "virt") return this.virtueBase(k);
    // гуль — Мощь 1 даром; дампир клана может взять вместо неё Дисциплину клана Предка (Accursed Heirs, гл. 3)
    if (kind === "disc") return this.type === "ghoul" && k === "potence" && !(this.isDhampir && this.st.dhSwap) ? 1 : 0;
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
    if (this.isWerewolf) return 0;                     // у Гару морали нет — на её месте Ярость и Гнозис
    if (this.isMage) return Math.min(mageData().creation?.areteMax ?? 3, (mageData().creation?.arete ?? 1) + this.st.free.morality);   // у мага — Арете
    if (this.isDemon) return Math.min(10, (this.isEarthbound ? 4 : DEMON_FAITH) + this.st.free.morality);   // у падшего — Вера
    if (this.isThrall) return Math.min(5, 1 + this.st.free.morality);                                        // у слуги — Вера слуги
    if (this.isLost) return 10;                                                                              // у Свидетеля — 10, рассудок
    if (this.isHunter) return Math.min(8, (this.creedData?.conviction ?? 3) + this.st.free.morality);         // у охотника — Убеждённость
    const v = this.value("virt", "conscience") + this.value("virt", "selfControl") + this.st.free.morality;
    return this.st.path === "humanity" ? Math.min(10, v) : Math.min(5, v);
  }
  get morality() { return Math.min(this.isThrall ? 5 : 10, this.moralityBase + this.st.xp.morality); }
  get willpowerBase() {
    // у падшего Воля — сумма двух высших Добродетелей (гл. 6), у охотника — 3, у прочих — Смелость
    if (this.isHunter) return Math.min(10, 3 + this.st.free.will);
    if (this.isMage) return Math.min(10, (mageData().creation?.willpower ?? 5) + this.st.free.will);
    if (this.isWerewolf) return Math.min(10, this.garouBase.will + this.st.free.will);   // Воля Гару — по племени (у Фера — по роду)
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

  get flawPoints() { return Math.min(VTM20.creation.flawCap, this.st.flaws.reduce((s, f) => s + (Number(f.cost) || 0), 0)); }
  get meritPoints() { return this.st.merits.reduce((s, m) => s + (Number(m.cost) || 0), 0); }
  get freeSpent() {
    const c = this.rules.cost, f = this.st.free;
    return this.sum(f.attr) * c.attr + this.sum(f.abil) * c.abil + this.sum(f.disc) * c.disc + this.sum(f.bg) * c.bg
      + this.sum(f.virt) * c.virt + f.morality * c.morality + f.will * c.will + this.bloodrightExtra * 5
      + (this.isWerewolf ? f.rage * c.rage + f.gnosis * c.gnosis + this.st.ww.extra.length * c.gift : 0)
      + (this.isMage ? (f.quint ?? 0) * c.quint : 0);
  }
  get freeTotal() { return this.rules.free + this.flawPoints; }
  get freeLeft() { return this.freeTotal - this.meritPoints - this.freeSpent; }

  /** Цена опыта за n точек сверх значения from (01, гули — 07). */
  xpCostOf(kind, k, from, n) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const c = from + i;
      // охотник при росте за опыт (Players Guide, гл. 2): основная Добродетель — новое × 3, прочие — × 5, начальная Убеждённость — × 5
      if (this.isLost && kind === "virt") { total += Math.max(1, c) * 2; continue; }       // Свидетель: текущее × 2
      if (this.isHunter && (kind === "virt" || kind === "morality")) {
        total += kind === "virt" ? (c + 1) * (HUNTER_SLOTS[k] === this.creedData?.virtue ? 3 : 5) : (c + 1) * 5;
        continue;
      }
      if (this.isEarthbound) {
        const L = Codex.lore(k), near = kind === "disc" && (this.inClan(k) && !L?.dark);
        total += kind === "attr" ? c * 5 : kind === "abil" ? (c === 0 ? 4 : c * 3) : kind === "disc" ? (c === 0 ? (near ? 6 : 8) : c * 4)
          : kind === "bg" ? Math.max(1, c) * 4 : kind === "virt" ? c * 2 : kind === "morality" ? c * 6 : kind === "will" ? c : 0;
        continue;
      }
      if (this.isWerewolf) {                           // опыт Гару (W20, гл. 4): Ярость — текущее, Гнозис — текущее × 2
        total += kind === "attr" ? c * 4 : kind === "abil" ? (c === 0 ? 3 : c * 2) : kind === "rage" ? c : kind === "gnosis" ? c * 2 : kind === "will" ? c : 0;
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
      else if (kind === "morality" && this.isMage) total += c * 8;                                      // Арете
      else if (kind === "disc" && this.isMage) total += c === 0 ? 10 : c * (k === this.st.mg.affinity ? 7 : 8);   // Сфера: новая 10, родовая × 7
      else if (kind === "disc") {
        if (this.type === "ghoul") total += c === 0 ? 20 : c * ((this.isDhampir ? this.dhampirClanDiscs : ["potence", "fortitude", "celerity"]).includes(k) ? 15 : 25);
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
    if (this.isWerewolf) {
      s += this.xpCostOf("rage", "", this.garouBase.rage + this.st.free.rage, x.rage);
      s += this.xpCostOf("gnosis", "", this.garouBase.gnosis + this.st.free.gnosis, x.gnosis);
    }
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
      case "garou": return !this.garouIssues.length;
      case "mage": return !this.mageIssues.length;
      case "gifts": return !this.giftIssues.length;
      case "attributes": return Object.values(rem.attr).every(v => v === 0);
      case "abilities": return Object.values(rem.abil).every(v => v === 0);
      case "disciplines": return rem.disc === 0 && !(this.isMage && this.sphereIssues.length);
      case "bloodrights": return this.bloodrightDots >= this.bloodrightBase;
      case "advantages": return rem.bg === 0 && rem.virt === 0 && (!this.isWerewolf || !this.renownIssues.length);
      case "freebies": return rem.free === 0;
      case "xp": return rem.xp >= 0;
      // итог отмечен, только когда записывать уже можно — нечего распределять и нет ошибок
      case "summary": return !this.problems(rem).length;
      case "pact": return !!this.st.pact.master && this.giftUsed <= this.giftPoints;
      case "edges": return this.st.edges.every(k => !this.edgeIssues(k).length);
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
    // «Дополнительная Дисциплина»: нужен выбор; каитифам и пандерам черта недоступна (V20, Appendix)
    if (this.extraDiscMerit && !this.baseClanDisciplines) out.push(t("Creator.ExtraDiscCaitiff"));
    else if (this.extraDiscMerit && !this.st.extraDisc) out.push(t("Creator.ExtraDiscNeed"));
    // начальные точки — только в клановые (V20, гл. 1); внеклановые — свободными пунктами и опытом
    if (this.type === "vampire" && this.clanDisciplines)
      for (const [k, n] of Object.entries(this.st.disc)) if (n > 0 && !this.inClan(k)) out.push(t("Creator.InitialOutOfClan", { name: Codex.disciplineLabel(k) }));
    if (this.isDemon && !this.st.visage) out.push(t("Creator.NeedVisage"));
    if (this.isEarthbound && this.value("bg", "Поклонение") > 0 && this.value("bg", "Культ") < 1) out.push(t("Creator.WorshipNeedsCult"));
    if (this.isThrall && !this.st.pact.master) out.push(t("Creator.PactNoMaster"));
    if (this.isLost) {
      for (const [slot, k] of Object.entries(LOST_SLOTS)) if (this.value("virt", slot) < 1)
        out.push(t("Creator.LostVirtueMin", { v: hunterData().bystander?.virtues?.[k] ?? k }));
    } else if (this.isHunter) {
      const pv = this.creedData?.virtue, H = hunterData();
      for (const v of ["mercy", "vision", "zeal"]) if (pv && v !== pv && this.hunterVirtue(v) > this.hunterVirtue(pv))
        out.push(t("Creator.HunterPrimary", { v: H.virtues[v], p: H.virtues[pv] }));
      for (const k of this.st.edges) for (const why of this.edgeIssues(k)) out.push(`${H.edges.find(x => x.key === k)?.name ?? k}: ${why}`);
    }
    if (this.isThrall && this.giftUsed > this.giftPoints) out.push(t("Creator.PactOver", { n: this.giftUsed - this.giftPoints }));
    if (this.isWerewolf) out.push(...this.garouIssues, ...this.giftIssues, ...this.renownIssues);
    if (this.isMage) out.push(...this.mageIssues, ...this.sphereIssues);
    if (this.isDhampir) {
      if (this.st.dhSwap && !this.dhampirClanDiscs.slice(1).some(k => this.value("disc", k) > 0))
        out.push(t("Creator.DhSwapNeedsClan"));
      if (this.bloodrightDots < this.bloodrightBase) out.push(t("Creator.BloodrightsLeft", { n: this.bloodrightBase - this.bloodrightDots }));
      for (const [k, n] of Object.entries(this.st.bloodrights)) {
        const r = Codex.dhampir?.bloodrights?.find(x => x.key === k);
        if (r?.req && !this.brReqOk(r)) out.push(t("Creator.BloodrightReq", { name: r.name, d: Codex.disciplineLabel(r.req) }));
        if (n > 3) out.push(t("Creator.BloodrightMax", { name: r?.name ?? k }));
      }
    }
    for (const c of this.traitIssues) out.push(t(`Creator.Trait${c.key}`, c.data));
    return out;
  }

  /** Подпись шага: у падшего Знания вместо Дисциплин и Дополнения вместо фактов биографии. */
  stepName(k) {
    if (this.isWerewolf && k === "advantages") return "advantagesGarou";      // у Гару справа Слава, а не Добродетели
    if (this.isMage) return { disciplines: "spheres", advantages: "advantagesMage" }[k] ?? k;
    return this.isDemon ? ({ disciplines: "lores", advantages: "advantagesDemon" }[k] ?? k) : k;
  }
  /** «Факты биографии» или «Дополнения» (у падшего). */
  get bgLabel() { return this.isDemon ? t("Demon.Backgrounds") : t("Sheet.Backgrounds"); }
  /** «Дисциплины» или «Знания» (у падшего). */
  get discLabel() { return this.isMage ? loc("VTM20.Mage.Spheres") : this.isDemon ? t("Demon.Lores") : t("Sheet.Disciplines"); }
  /** Сила справочника по ключу: Дисциплина или Знание падшего. */
  discData(k) { return this.isMage ? this.mageSphere(k) : this.isDemon ? Codex.lore(k) : Codex.discipline(k); }

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
      marks: this.type === "mortal" ? this.markView() : null,
      isVampire: this.type === "vampire", isGhoul: this.type === "ghoul", isDemon: this.isDemon, isEarthbound: this.isEarthbound, isThrall: this.isThrall, isMortal: this.type === "mortal", isHunter: this.isHunter, isLost: this.isLost, isWerewolf: this.isWerewolf, discLabel: this.discLabel, bgLabel: this.bgLabel,
      typeLabel: loc(`TYPES.Actor.${this.type}`), typeSigil: VTM20.typeSigil(this.type), typeSym: this.type === "werewolf" ? { src: foundry.utils.getRoute(VTM20.typeSigil(this.type)) } : null,
      steps: this.steps.map((k, i) => ({ i, key: k, n: i + 1, label: t(`Creator.Step.${this.stepName(k)}`), active: i === this.step, done: this.stepOk(k, rem) && i !== this.step })),
      stepKey: key, stepNumber: this.step + 1, stepCount: this.steps.length,
      // у гуля свои подсказки там, где правила другие (нет Становления, Дисциплины — от домитора)
      title: t(`Creator.Step.${this.stepName(key)}`),
      hint: t(`Creator.${STEP_HINTS[key]}${this.type === "ghoul" && GHOUL_HINTS.has(key) ? "Ghoul" : this.isEarthbound && EB_HINTS.has(key) ? "Earthbound" : this.isThrall && THRALL_HINTS.has(key) ? "Thrall" : this.isLost && HUNTER_HINTS.has(key) ? "Lost" : this.isHunter && HUNTER_HINTS.has(key) ? "Hunter" : this.isWerewolf && GAROU_HINTS.has(key) ? "Garou" : this.isMage && MAGE_HINTS.has(key) ? "Mage" : this.isDemon && DEMON_HINTS.has(key) ? "Demon" : key === "advantages" && !this.rules.bg ? "NoBg" : ""}`, { n: this.rules.disc, bg: this.rules.bg, virt: this.rules.virt }),
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
    if (this.rules.virt) add(t("Sheet.Virtues"), rem.virt, this.rules.virt);
    if (this.isWerewolf) { const slots = this.giftSlots; add(loc("VTM20.GarouCr.Gifts"), slots.filter(s => !st.ww.gifts[s.key]).length, slots.length); }
    add(t("Creator.Freebies"), rem.free, this.freeTotal);
    if (st.xpTotal) add(t("Sheet.Experience"), rem.xp, st.xpTotal);
    const gen = this.type === "vampire" ? 13 - Math.min(5, this.value("bg", "Поколение")) : null;
    ctx.patent = {
      img: this.actor.img, name: st.name, concept: st.concept, sect: st.sect, sectSym: Codex.sectSymbol(st.sect),
      clan: this.clanData?.name ?? "",
      sym: this.type === "vampire" ? Codex.clanSymbol(st.clan) : Codex.sectSymbol(st.sect),
      generation: gen, blood: gen ? VTM20.generationOf(gen).pool : null,
      morality: this.morality, willpower: this.willpower, pathName: this.isMage ? loc("VTM20.Mage.Arete") : this.isDemon ? t("Demon.Faith") : this.isThrall ? t("Creator.ThrallFaith") : this.isHunter ? t("Hunter.Conviction") : this.pathData?.name ?? "", ledger,
      torment: this.houseData?.torment ?? null, demon: this.isDemon
    };
    if (this.isDemon) Object.assign(ctx.patent, { clan: this.houseData?.name ?? "", sect: Codex.faction(st.faction)?.name ?? "", sectSym: null });
    // Маг: фракция со знаком, Сущность и родовая Сфера; Арете на месте морали
    if (this.isMage) {
      const D = mageData(), f = this.mageFaction;
      Object.assign(ctx.patent, { clan: f?.name ?? "", sectSym: null, sym: f ? { src: mageGlyphSrc(`faction-${f.key}`) } : null,
        sect: [(D.essences ?? []).find(e => e.key === st.mg.essence)?.name, st.mg.affinity && this.mageSphere(st.mg.affinity)?.name].filter(Boolean).join(" · ") });
    }
    // Гару: племя (у Фера — род), аугурия и порода, Ярость и Гнозис вместо морали
    if (this.isWerewolf) {
      const f = this.feraData, lbl = x => x ? VTM20.label(x) : "";
      const sub = f ? this.feraDims.map(d => lbl(d.options.find(o => o.key === st.ww.sub[d.key]))).filter(Boolean).join(" · ") : "";
      Object.assign(ctx.patent, { clan: f ? lbl(f) : lbl(this.garouTribe), sect: f ? sub : [lbl(this.garouAuspice), lbl(this.garouBreed)].filter(Boolean).join(" · "),
        sectSym: null, sym: null, morality: this.garouRage, pathName: loc("VTM20.Werewolf.Rage"), garou: true, gnosis: this.garouGnosis });
    }
    const by = hunterData().bystander;
    if (this.isHunter) Object.assign(ctx.patent, { clan: this.isLost ? `${by?.name} · ${by?.who}` : this.creedData ? `${this.creedData.name} · ${this.creedData.who}` : "", sectSym: null });
    // Охотник: кредо (концепция) и Грани (свой шаг)
    if (this.isHunter) {
      const H = hunterData();
      ctx.creeds = [...H.creeds.map(c => ({ ...c, tips: c.rules ? `${c.tips} ${c.rules}` : c.tips, virtueName: H.virtues[c.virtue], active: c.key === st.creed })),
        ...(by ? [{ ...by, virtueName: Object.values(by.virtues).join(" · "), active: this.isLost }] : [])];
      ctx.creed = this.creedData;
      if (key === "edges") ctx.edgePaths = H.creeds.filter(c => hasOwnPath(c.key)).map(c => ({ key: c.key, name: c.name, virtue: H.virtues[c.virtue], primary: c.key === st.creed,
        edges: H.edges.filter(e => e.path === c.key).map(e => {
          const on = st.edges.includes(e.key), why = this.edgeIssues(e.key);
          // Грань Одиночества у кредо Милосердия и Рвения — с неизлечимым расстройством (Hunter Book: Hermit)
          const mad = e.path === HERMIT_PATH && hermitEdgeMadness(st.creed);
          return { ...e, on, mad, text: mad ? `${t("Hunter.HermitMadnessShort")} ${e.text}` : e.text, why: why.join(" "), ok: on || !why.length };
        }) })).sort((a, b) => b.primary - a.primary);
      ctx.edgeBudget = ["mercy", "vision", "zeal"].map(v => ({ label: H.virtues[v], value: this.hunterVirtue(v),
        used: st.edges.map(k => H.edges.find(x => x.key === k)).filter(e => e?.virtue === v).reduce((s, e) => s + edgeCost(e.level), 0) }));
    }

    // Дампир (Accursed Heirs): концепция и клан Предка — на шаге концепции, Кровные права — свой шаг
    if (this.isDhampir) {
      const DH = Codex.dhampir ?? {};
      ctx.isDhampir = true;
      ctx.dhConcepts = (DH.concepts ?? []).map(c => ({ value: c.key, label: c.name, tip: `${c.text} ${c.tips}`, selected: c.key === st.dhConcept }));
      ctx.antecedentClans = Codex.clans.filter(c => Codex.visible(c)).map(c => ({ value: c.key, label: c.name, selected: c.key === st.antecedentClan }));
      ctx.dhWeakness = DH.clans?.[Codex.traitClan(st.antecedentClan)]?.weakness ?? "";
      if (key === "bloodrights") {
        const favored = new Set(DH.clans?.[Codex.traitClan(st.antecedentClan)]?.rights ?? []);
        ctx.brBudget = { base: this.bloodrightBase, used: this.bloodrightDots, extra: this.bloodrightExtra };
        ctx.brList = (DH.bloodrights ?? []).filter(r => (st.bloodrights[r.key] ?? 0) > 0 || this.brReqOk(r)).map(r => {
          const n = st.bloodrights[r.key] ?? 0;
          return { key: r.key, name: r.name, en: r.en, rare: r.rare, favored: favored.has(r.key), n, text: r.text,
            req: r.req ? (r.key === "dririmancy" ? t("Dhampir.BloodMagic") : Codex.disciplineLabel(r.req)) : "",
            powers: r.levels.map(l => `${r.scaling ? "I–III" : ["I", "II", "III"][l.level - 1]}. ${l.name}`).join(" · "),
            dots: [1, 2, 3].map(i => ({ i, on: i <= n })) };
        }).sort((a, b) => b.favored - a.favored || a.rare - b.rare || a.name.localeCompare(b.name, "ru"));
      }
    }

    // I. Концепция и возраст
    // Привязанному чужды архетипы человеческих надежд (Earthbound, гл. 3)
    const EB_NO = ["Бонвиван", "Опекун", "Ребёнок", "Конформист", "Щёголь", "Мученик", "Кающийся грешник", "Искатель удовольствий"];
    const RELIC_ICON = { ideal: "fa-gem", improvised: "fa-box-open", natural: "fa-mountain-sun" };
    ctx.reliquaryKinds = ["ideal", "improvised", "natural"].map(k => ({ value: k, label: t(`Demon.ReliquaryKind.${k}`), hint: t(`Demon.ReliquaryHint.${k}`).replace(/^[^:]+:\s*/, ""), icon: RELIC_ICON[k], active: (st.reliquary || "ideal") === k }));
    ctx.archetypes = this.isEarthbound ? Codex.archetypes.filter(a => !EB_NO.includes(a.name)) : Codex.archetypes;
    ctx.natureRegain = Codex.archetypes.find(a => a.name === st.nature)?.regain ?? "";
    ctx.demeanorRegain = Codex.archetypes.find(a => a.name === st.demeanor)?.regain ?? "";
    // у гуля «срок службы» вместо возраста в Крови — опыт тот же
    const tierKey = this.type === "ghoul" ? "TierGhoul" : this.isMage ? "TierMage" : "Tier";
    ctx.tiers = Object.entries(TIERS).map(([k, v]) => ({ key: k, xp: v.xp, label: t(`Creator.${tierKey}.${k}`), hint: t(`Creator.${tierKey}.${k}Hint`), active: st.tier === k }));
    ctx.tierTitle = t(this.type === "ghoul" ? "Creator.TierTitleGhoul" : this.isMage ? "Creator.TierTitleMage" : "Creator.TierTitle");
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

    // II. Маг: группа (Традиции, Технократия, Ремёсла) вкладками, фракция плитками со знаком, Сущность, родовая Сфера, фокус
    if (this.isMage) {
      const D = mageData(), g = st.mg, f = this.mageFaction, grp = g.group || f?.group || D.groups?.[0]?.key || "";
      const allowed = f?.affinity?.length ? f.affinity : VTM20.mageSpheres;
      ctx.isMage = true;
      ctx.mage = {
        groups: (D.groups ?? []).map(x => ({ key: x.key, label: x.name, active: x.key === grp, sym: { src: mageGlyphSrc(x.key === "technocracy" ? "group-technocracy" : x.key === "traditions" ? "group-traditions" : "faction-orphans") } })),
        factions: (D.factions ?? []).filter(x => x.group === grp).map(x => ({ key: x.key, label: x.name, en: x.en, active: x.key === g.faction, sub: x.affinityText ?? "", sym: { src: mageGlyphSrc(`faction-${x.key}`) } })),
        faction: f ? { ...f, sym: { src: mageGlyphSrc(`faction-${f.key}`) } } : null,
        essences: (D.essences ?? []).map(e => ({ key: e.key, label: e.name, active: e.key === g.essence, text: VtMCreator.#plain(e.text ?? "") })),
        affinities: VTM20.mageSpheres.map(k => ({ key: k, label: this.mageSphere(k)?.name ?? k, active: k === g.affinity, off: !allowed.includes(k), sym: { src: mageGlyphSrc(`sphere-${k}`) } })),
        paradigms: (D.focus?.paradigms ?? []).map(p => p.name), practices: (D.focus?.practices ?? []).map(p => p.name),
        subs: (f?.subs ?? []).map(x => ({ key: x.key, label: x.name, en: x.en, note: x.note, active: x.key === g.sub,
          sym: f.key === "order-of-hermes" ? { src: mageGlyphSrc(`house-${x.key}`) } : null })), subLabel: subLabel(f),
        issues: this.mageIssues, arete: this.morality, will: this.willpower, quint: this.mageQuint
      };
    }
    // II. Гару: род (Гару или Фера), порода, аугурия, племя — плитками, как кланы; у Фера — выбор внутри рода; уродство метиса
    if (this.isWerewolf) {
      const D = werewolfData(), w = st.ww, f = this.feraData, lbl = x => VTM20.label(x), plain = h => VtMCreator.#plain(h);
      const g = name => ({ src: wwGlyphSrc(name) }), feraGlyph = feraSym;
      const base = this.garouBase;
      ctx.garou = {
        base, renownFixed: this.renownFixed, isFera: !!f, isMetis: this.isMetis,
        kinds: [{ key: "", label: loc("VTM20.Werewolf.Garou"), sym: g("glyph-garou"), active: !f },
          ...(D.fera ?? []).map(b => ({ key: b.key, label: lbl(b), en: b.en, sym: feraGlyph(b.key), active: b.key === w.fera }))],
        breeds: D.breeds.map(b => ({ key: b.key, label: lbl(b), sym: g(`breed-${b.key}`), active: b.key === w.breed, sub: t("Creator.GarouGnosis", { n: b.gnosis }), tip: plain(b.notes) })),
        auspices: D.auspices.map(b => ({ key: b.key, label: lbl(b), sym: g(`auspice-${b.key}`), active: b.key === w.auspice, sub: b.role, tip: t("Creator.GarouAuspiceTip", { rage: b.rage, renown: b.renownText ?? "" }) })),
        tribes: D.tribes.map(b => ({ key: b.key, label: lbl(b), sym: g(`tribe-${b.key}`), active: b.key === w.tribe, sub: t("Creator.GarouTribeSub", { will: b.willpower, totem: b.totem ?? "" }), wyrm: !!b.wyrm })),
        tribe: !f && this.garouTribe ? { ...this.garouTribe, label: lbl(this.garouTribe), bg: this.garouTribe.backgrounds, sym: g(`tribe-${this.garouTribe.key}`) } : null,
        breedNotes: !f ? this.garouBreed?.notes ?? "" : "",
        fera: f ? { label: lbl(f), en: f.en, sym: feraGlyph(f.key), facts: Object.entries(f.facts ?? {}).map(([k, v]) => ({ k, v })),
          dims: this.feraDims.map(d => ({ key: d.key, label: d.label, options: d.options.map(o => ({ key: o.key, label: lbl(o), active: o.key === w.sub[d.key],
            ...(() => { const stats = Object.entries(o.stats ?? {}).map(([k, n]) => `${loc(`VTM20.GarouCr.T.${k}`)} ${n}`).join(", ");
              const text = (o.text ?? "").replace(/^(?:(?:Гнозис|Ярость|Воля)\s*\d+[,;.]?\s*)+/i, "");
              return { stats, text, tip: plain(o.text ?? "") }; })() })) })) } : null,
        deformities: this.isMetis ? (D.deformities ?? []).map(x => ({ key: x.key, label: lbl(x), selected: x.key === w.deform })) : null,
        deformText: (D.deformities ?? []).find(x => x.key === w.deform)?.text ?? "",
        issues: this.garouIssues
      };
      // Дары: ячейки и Дары сверх трёх (свои 1-го уровня, 7 бонусных за каждый)
      const taken = new Set([...Object.values(w.gifts), ...w.extra]);
      const card = (g, on) => ({ key: g.key, label: lbl(g), en: g.en, on, text: VtMCreator.#preview(g.text, 700), cost: g.cost ? Object.entries(g.cost).map(([k, n]) => `${n} ${loc(`VTM20.GarouCr.T.${k === "willpower" ? "will" : k}`)}`).join(", ") : "" });
      ctx.giftSlots = this.giftSlots.map(s => ({ key: s.key, label: s.label, need: s.need ? t("GarouCr.GiftNeedPick", { what: s.need }) : "",
        list: this.slotGifts(s).map(k => D.gifts.find(g => g.key === k)).filter(g => g && (g.key === w.gifts[s.key] || !taken.has(g.key))).map(g => card(g, g.key === w.gifts[s.key])) }));
      // несколько ячеек «Общий Дар рода» (у Корвов и Нувиша — все три) — одной колонкой «выберите N», а не тремя одинаковыми списками
      const gen = this.giftSlots.filter(s => s.key.startsWith("general"));
      if (gen.length > 1) {
        const mine = new Set(gen.map(s => w.gifts[s.key]).filter(Boolean));
        const list = this.slotGifts(gen[0]).map(k => D.gifts.find(g => g.key === k)).filter(g => g && (mine.has(g.key) || !taken.has(g.key))).map(g => card(g, mine.has(g.key)));
        ctx.giftSlots = [{ key: "general", label: t("GarouCr.GiftGeneralN", { have: mine.size, n: gen.length }), need: "", wide: true, list }, ...ctx.giftSlots.filter(s => !s.key.startsWith("general"))];
      }
      // сверх трёх — только когда три ячейки заполнены, иначе список повторял бы их целиком; у карточки — откуда Дар и цена
      const from = g => g.groups.filter(x => x.kind !== "fera" || x.key === w.fera).map(x => x.label ?? "").filter(Boolean).slice(0, 2).join(" · ");
      ctx.giftExtraReady = this.giftSlots.every(s => !!w.gifts[s.key]);
      ctx.giftExtra = ctx.giftExtraReady ? D.gifts.filter(g => g.level === 1 && ownGift(this.garouSelf, g) && !Object.values(w.gifts).includes(g.key))
        .map(g => ({ ...card(g, w.extra.includes(g.key)), from: from(g) })).sort((a, b) => b.on - a.on || a.label.localeCompare(b.label, "ru")) : [];
      ctx.giftCost = this.rules.cost.gift;
      // Слава на шаге фактов биографии: по аугурии или 3 точки на выбор
      const r = this.garouRenown;
      ctx.renown = RENOWN.map(k => ({ key: k, label: loc(`VTM20.Werewolf.Renown.${k}`), value: r[k],
        dots: [1, 2, 3].map(n => ({ n, kind: "renown", key: k, state: n <= r[k] ? (this.renownFixed ? "base" : "alloc") : "empty", locked: this.renownFixed })) }));
      ctx.renownLeft = this.renownFixed ? 0 : 3 - RENOWN.reduce((n, k) => n + w.renown[k], 0);
      ctx.renownText = f ? loc("VTM20.GarouCr.FeraRenown") : this.garouAuspice?.renownText ?? "";
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
        key: k, name: d.name, en: d.en, value: v, inClan: this.isMage ? k === st.mg.affinity : this.inClan(k),
        sym: this.isMage ? { src: mageGlyphSrc(`sphere-${k}`) } : this.isDemon ? null : Codex.disciplineSymbol(k),
        icon: this.isDemon ? (d.house ? "fa-fire-flame-curved" : "fa-book") : VTM20.disciplineIcons[k] ?? "fa-droplet", dots: dotRow("disc", k),
        powers: d.powers.filter(p => p.level <= Math.max(1, v) && p.level <= 5).map(p => ({ level: p.level, name: p.name, en: p.en, owned: p.level <= v, tip: VtMCreator.#preview(p.html, 600) })),
        pathed: VTM20.pathDisciplines.includes(k)
      };
    }).sort((a, b) => (b.inClan - a.inClan) || a.name.localeCompare(b.name, "ru"));
    ctx.anyDiscipline = allowed == null;
    // внеклановые Дисциплины: Сородич добавляет любую (точки — свободными пунктами и опытом), каитиф и гуль — как раньше
    ctx.canAddDisc = !this.isDemon && !this.isMage && (allowed == null || this.type === "vampire");
    for (const c of ctx.discCards) {
      c.outOfClan = this.type === "vampire" && allowed != null && !c.inClan;
      c.extra = c.key === this.extraDisc;
      c.removable = !this.isMage && !c.inClan && this.value("disc", c.key) <= this.base("disc", c.key);
    }
    // выбор по «Дополнительной Дисциплине» — на шаге Дисциплин и у взятого достоинства
    ctx.extraDisc = this.extraDiscMerit && this.baseClanDisciplines
      ? { value: this.st.extraDisc, name: this.st.extraDisc ? Codex.disciplineLabel(this.st.extraDisc) : "", options: this.extraDiscOptions } : null;
    ctx.inClanLabel = this.isMage ? loc("VTM20.Mage.AffinityShort") : this.isDemon ? t("Demon.OwnHouse") : t("Sheet.InClan");
    if (this.isMage) ctx.sphereIssues = this.sphereIssues;
    ctx.discChoices = Object.values(Codex.disciplines).filter(d => !discKeys.has(d.key) && Codex.visible(d) && !this.bannedDisc(d.key)).map(d => ({ value: d.key, label: d.name }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));

    // VI. Факты биографии — каталог карточек, и Добродетели
    // Earthbound: факты биографии Привязанных — только им; Привязанному нельзя связей с людьми, наставника, договоров и наследия
    const EB_BANNED = ["Contacts", "Fame", "Followers", "Mentor", "Pacts", "Legacy"];
    const ebOk = b => !b.thrall && (this.isEarthbound ? !EB_BANNED.includes(b.en) : b.source !== "Earthbound");
    // слуга: факты биографии падших без запретных и без фактов Привязанных, плюс свои (Заботливый хозяин, Приобщение)
    const bgOk = b => this.isThrall ? b.line === "demon" && b.source !== "Earthbound" && !THRALL_BANNED.includes(b.en)
      : VTM20.backgroundAllowed(b, this.type) && ebOk(b) && !(this.isLost && b.noBystander) && (!b.dhampir || this.isDhampir)
        && !(b.technocracy && this.isMage && !this.mageTech);        // Заявки и Секретное оружие — только Технократии
    // выбранный Факт держим в списке, даже если он из другой линейки или скрыт, — но одной карточкой: «Союзники» есть
    // у Сородичей, охотников и оборотней с одним именем, и выбор одного не должен показывать все три
    const bgList = Codex.backgrounds.filter(b => Codex.visible(b) && bgOk(b)), bgNames = new Set(bgList.map(b => b.name)), bgKept = new Set();
    ctx.bgCards = Codex.backgrounds.filter(b => bgList.includes(b) || (b.name in st.bg && !bgNames.has(b.name) && !bgKept.has(b.name) && bgKept.add(b.name))).map(b => {
      const on = b.name in st.bg || (st.free.bg[b.name] ?? 0) > 0;
      const bonus = this.isHunter && !this.isLost && b.en === "Patron" ? this.creedData?.patron ?? 0 : 0;   // Отшельник — Покровители 3 даром
      return { name: b.name, en: b.en, sectLabel: b.sabbat ? t("Sect.sabbat") : b.sect ? t(`Sect.${b.sect}`) : "", bonus, on, value: this.value("bg", b.name), dots: dotRow("bg", b.name),
          text: VtMCreator.#preview(b.html, 170), html: b.html, open: this.ui.open.has(`bg:${b.name}`) };
    });
    ctx.virtues = ["conscience", "selfControl", "courage"].map(slot => {
      const vk = slot === "courage" ? "courage" : this.isDemon || this.isThrall ? (slot === "selfControl" ? "conviction" : "conscience") : slot === "conscience" ? (this.altVirtues.includes("conviction") ? "conviction" : "conscience")
        : (this.altVirtues.includes("instinct") ? "instinct" : "selfControl");
      // у Привязанного в слотах Добродетелей — Потребности: Плоть, Мысль, Эмоция
      const urge = { conscience: "flesh", selfControl: "thought", courage: "emotion" }[slot];
      // у охотника в слотах — Добродетели охоты, до 10 (на старте — 3 очка)
      if (this.isLost) return { key: slot, label: hunterData().bystander?.virtues?.[LOST_SLOTS[slot]], value: this.value("virt", slot), dots: dotRow("virt", slot) };
      if (this.isHunter) return { key: slot, label: hunterData().virtues[HUNTER_SLOTS[slot]], value: this.value("virt", slot), dots: dotRow("virt", slot, 10),
        primary: this.creedData?.virtue === HUNTER_SLOTS[slot] };
      return { key: slot, label: this.isEarthbound ? t(`Demon.Urge.${urge}`) : loc(VTM20.virtues[vk].label), value: this.value("virt", slot), dots: dotRow("virt", slot) };
    });

    // VII. Достоинства и недостатки — каталог с поиском
    const q = this.ui.mfSearch.trim().toLowerCase();
    const chosen = this.ui.mfTab === "merit" ? st.merits : st.flaws;
    ctx.mfTabs = ["merit", "flaw"].map(k => ({ key: k, label: t(k === "merit" ? "Sheet.Merits" : "Sheet.Flaws"), active: this.ui.mfTab === k,
      n: (k === "merit" ? st.merits : st.flaws).length }));
    // Клановые черты и черты секты — только своего клана/секты: на своей вкладке и во «Всех»
    const myClan = this.type === "vampire" ? Codex.traitClan(st.clan) : "";
    const mySect = st.sectKey || Codex.sectKey(st.sect);
    // кому видна черта — VTM20.traitFor (то же правило, что в библиотеке); слуга берёт черты падших, кроме инфернальных
    const who = { type: this.type, dhampir: this.isDhampir, lost: this.isLost, thrall: this.isThrall };
    // черты гулей (Ghouls & Revenants) — своей вкладкой «Гулевые», как клановые у вампира
    // запрет клану или линии (notClan: «Тореадорам недоступно», DA High/Low Clans) — черту не показываем
    const banned = m => !!st.clan && (m.notClan ?? []).includes(st.clan);
    const inCat = (m, cat) => !Codex.visible(m) || !VTM20.traitFor(m, who) || banned(m) ? false : cat === "clan" ? !!myClan && m.clan === myClan
      : cat === "sect" ? !m.clan && !!mySect && m.sect === mySect
      : cat === "ghoul" ? !!m.ghoul
      : cat === "all" ? (!m.clan || (!!myClan && m.clan === myClan)) && (!m.sect || (!!mySect && m.sect === mySect))
      : !m.clan && !m.sect && !m.ghoul && m.category === cat;
    const extra = ["ghoul", "sect", "clan"].filter(k => Codex.merits.some(m => m.kind === this.ui.mfTab && inCat(m, k)));
    if (!["all", ...Object.keys(VTM20.meritCategories), ...extra].includes(this.ui.mfCat)) this.ui.mfCat = "all";
    const catLabel = k => k === "all" ? t("Creator.All") : k === "clan" ? t("Library.Filter.Clan") : k === "ghoul" ? t("Library.Filter.GhoulTraits")
      : k === "sect" ? t("Library.Filter.SectTraits") : loc(VTM20.meritCategories[k].label);
    // только разделы, где у этой линии есть черты (у вампиров нет инфернальных, у демонов — сверхъестественных)
    // категория «clan» — та же вкладка «Клановые» (extra), второй раз не показываем
    const cats = Object.keys(VTM20.meritCategories).filter(k => k !== "clan" && Codex.merits.some(m => m.kind === this.ui.mfTab && inCat(m, k)));
    ctx.mfCats = ["all", ...cats, ...extra].map(k => ({ key: k, label: catLabel(k), active: this.ui.mfCat === k }));
    ctx.mfCards = Codex.merits.filter(m => m.kind === this.ui.mfTab && inCat(m, this.ui.mfCat)
      && (!q || m.name.toLowerCase().includes(q) || (m.en ?? "").toLowerCase().includes(q)))
      .map(m => ({ name: m.name, en: m.en, cost: m.cost,
        cat: m.clan ? Codex.clanName(m.clan) : m.sect ? t(`Sect.${m.sect}`) : m.ghoul ? t("Library.Filter.GhoulTraits") : loc(VTM20.meritCategories[m.category]?.label ?? ""),
        // откуда черта: Тёмные века — отдельной пометкой, иначе — книга
        da: m.era === "darkAges", src: m.source ?? "", srcShort: m.era === "darkAges" ? t("Library.Filter.DarkAges") : String(m.source ?? "").replace(/\s*[,(].*$/, ""),
        on: chosen.some(x => x.name === m.name), text: VtMCreator.#preview(m.html, 200),
        html: m.html, open: this.ui.open.has(`mf:${m.kind}:${m.name}`), key: `mf:${m.kind}:${m.name}` }));
    const daOf = m => Codex.merits.find(x => x.name === m.name && x.kind === m.kind)?.era === "darkAges";
    ctx.merits = st.merits.map((m, i) => ({ ...m, kind: "merit", index: i, ranged: m.max > m.min })).map(m => ({ ...m, da: daOf(m) }));
    ctx.flaws = st.flaws.map((m, i) => ({ ...m, kind: "flaw", index: i, ranged: m.max > m.min })).map(m => ({ ...m, da: daOf(m) }));
    ctx.meritPoints = this.meritPoints; ctx.flawPoints = this.flawPoints;
    ctx.traitIssues = this.traitIssues.map(c => ({ ...c, text: t(`Creator.Trait${c.key}`, c.data) }));
    ctx.flawRaw = st.flaws.reduce((s, f) => s + (Number(f.cost) || 0), 0);

    // VIII. Свободные пункты и IX. Опыт — общий список строк
    const rows = (mode) => {
      const cost = this.rules.cost;
      const scalar = kind => ["morality", "will", "rage", "gnosis", "quint"].includes(kind);
      const row = (kind, k, label, group, value) => ({
        kind, key: k, label, group, value,
        added: mode === "free" ? (scalar(kind) ? st.free[kind] ?? 0 : st.free[kind]?.[k] ?? 0)
          : (scalar(kind) ? st.xp[kind] : st.xp[kind]?.[k] ?? 0),
        price: mode === "free" ? cost[kind] : this.xpCostOf(kind, k, value, 1)
      });
      const list = [
        ...ctx.attrGroups.flatMap(g => g.list.filter(x => !x.locked).map(x => row("attr", x.key, x.label, t("Creator.Step.attributes"), x.value))),
        ...ctx.abilGroups.flatMap(g => g.list.map(x => row("abil", x.key, x.label, g.label, x.value))),
        ...(this.rules.disc ? ctx.discCards.map(x => row("disc", x.key, x.name, this.discLabel, x.value)) : []),
        ...(mode === "free" ? ctx.bgCards.filter(b => b.on).map(b => row("bg", b.name, b.name, this.bgLabel, b.value)) : []),
        // у Гару вместо Добродетелей и морали — Ярость и Гнозис (W20, гл. 3)
        ...(this.isWerewolf ? [row("rage", "", loc("VTM20.Werewolf.Rage"), t("Sheet.Other"), this.garouRage), row("gnosis", "", loc("VTM20.Werewolf.Gnosis"), t("Sheet.Other"), this.garouGnosis)] : [
        // Добродетели охоты — только охотой; при росте за опыт — и опытом
        ...(this.isMage ? [] : !this.isHunter || this.isLost ? ctx.virtues.map(x => row("virt", x.key, x.label, t("Sheet.Virtues"), x.value))
          : mode === "xp" && hunterGrowth() === "xp" ? ctx.virtues.map(x => row("virt", x.key, x.label, t("Creator.HunterVirtues"), x.value)) : []),
        ...(this.isLost || (this.isHunter && mode === "xp" && hunterGrowth() !== "xp") ? [] : [row("morality", "", this.isMage ? loc("VTM20.Mage.Arete") : this.isDemon ? t("Demon.Faith") : this.isThrall ? t("Creator.ThrallFaith") : this.isHunter ? t("Hunter.Conviction") : this.pathData?.name ?? t("Humanity"), t("Sheet.Other"), this.morality)])]),
        row("will", "", t("Willpower"), t("Sheet.Other"), this.willpower),
        // маг: 1 свободный пункт — 4 Квинтэссенции (M20, гл. 6)
        ...(this.isMage && mode === "free" ? [row("quint", "", loc("VTM20.MageCr.QuintRow"), t("Sheet.Other"), this.mageQuint)] : [])
      ];
      return [...new Set(list.map(r => r.group))].map(g => ({ label: g, rows: list.filter(r => r.group === g) }));
    };
    if (key === "freebies" || key === "xp") ctx.canAddDisc = !!this.rules.disc && !this.isDemon && !this.isMage && (this.clanDisciplines == null || this.type === "vampire");
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
        discs: ctx.discCards.filter(d => d.value > 0).map(d => ({ name: d.name, en: d.en, value: d.value, sym: d.sym })),
        bgs: ctx.bgCards.filter(b => b.value > 0).map(b => ({ name: b.name, en: b.en, value: b.value })),
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
      ctx.pathName = this.isMage ? loc("VTM20.Mage.Arete") : this.isDemon ? t("Demon.Faith") : this.isThrall ? t("Creator.ThrallFaith") : this.isHunter ? t("Hunter.Conviction") : this.pathData?.name;
      if (this.isHunter) ctx.summary.edges = st.edges.map(k => hunterData().edges.find(e => e.key === k)).filter(Boolean)
        .sort((a, b) => a.path.localeCompare(b.path) || a.level - b.level);
      if (this.isDemon) Object.assign(ctx, { torment: this.isEarthbound ? 10 : this.houseData?.torment ?? 3, houseName: this.houseData?.name ?? "",
        visageName: this.houseData?.visages?.[st.visage] ?? "", factionName: Codex.faction(st.faction)?.name ?? "" });
      // Привязанный: Потребности вместо Добродетелей, реликварий
      ctx.virtLabel = this.isEarthbound ? t("Demon.Urges") : this.isHunter && !this.isLost ? t("Creator.HunterVirtues") : loc("VTM20.Sheet.Virtues");
      // Маг: вместо Добродетелей — фокус и то, с чем он начинает
      if (this.isMage) {
        const g = st.mg;
        ctx.virtLabel = loc("VTM20.Mage.Focus");
        ctx.summary.virtues = [[loc("VTM20.Mage.Essence"), (mageData().essences ?? []).find(e => e.key === g.essence)?.name], [loc("VTM20.Mage.Affinity"), g.affinity && this.mageSphere(g.affinity)?.name],
          [loc("VTM20.Mage.Paradigm"), g.paradigm], [loc("VTM20.Mage.Practice"), g.practice], [loc("VTM20.Mage.Quintessence"), this.mageQuint]]
          .filter(([, v]) => v !== "" && v != null).map(([label, value]) => ({ label, value }));
        ctx.garouLine = [ctx.patent.clan, ctx.patent.sect].filter(Boolean).join(" · ");
      }
      if (this.isEarthbound) ctx.reliquaryName = t(`Demon.ReliquaryKind.${st.reliquary || "ideal"}`);
      // Гару: Ярость и Гнозис вместо морали, Дары и Слава вместо Дисциплин и Добродетелей
      if (this.isWerewolf) {
        const D = werewolfData(), w = st.ww;
        Object.assign(ctx, { morality: this.garouRage, pathName: loc("VTM20.Werewolf.Rage"), gnosis: this.garouGnosis, virtLabel: loc("VTM20.GarouCr.Renown") });
        ctx.summary.virtues = RENOWN.map(k => ({ label: loc(`VTM20.Werewolf.Renown.${k}`), value: this.garouRenown[k] }));
        ctx.summary.gifts = [...Object.values(w.gifts), ...w.extra].map(k => D.gifts.find(g => g.key === k)).filter(Boolean).map(g => ({ name: g.name, en: g.en, level: g.level }));
        ctx.garouLine = [ctx.patent.clan, ctx.patent.sect].filter(Boolean).join(" · ");
      }
    }
    ctx.footFree = rem.free; ctx.footXp = st.xpTotal ? rem.xp : null;
    return ctx;
  }

  /** Начало описания для превью карточки; многоточие — только если текст обрезан. */
  static #preview(html, n) {
    const t = VtMCreator.#plain(html);
    return t.length > n ? t.slice(0, n).replace(/[\s.,;:—-]+$/, "") + "…" : t;
  }

  // теги — пробелом (абзацы не слипаются), но перед знаком препинания пробел не нужен («к <b>Бреду</b>, знают» → «к Бреду, знают»)
  static #plain(html) { return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/ ([,.;:!?»)])/g, "$1").trim(); }

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
      if (f === "hunterExtra") { this.st.hunterExtra = Math.clamp(Number(v) || 0, 0, 6); return this.render(); }
      if (f === "extraDisc") { VtMCreator.#setExtraDisc.call(this, v); return this.render(); }
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
  /** Гару: выбор рода, породы, аугурии, племени или варианта внутри рода Фера; Дары, которых больше нет в ячейках, — сбрасываются. */
  static #onGarouPick(event, target) {
    const { what, key } = target.dataset, w = this.st.ww;
    if (what === "fera") { w.fera = key; w.sub = {}; w.gifts = {}; w.extra = []; w.deform = ""; w.renown = { glory: 0, honor: 0, wisdom: 0 }; }
    else if (what.startsWith("sub.")) w.sub[what.slice(4)] = w.sub[what.slice(4)] === key ? "" : key;
    else w[what] = key;
    if (!this.isMetis) w.deform = "";
    this.fixGiftSlots();
    this.render();
  }
  /** Шаг мага: вкладка группы, фракция, Сущность, родовая Сфера. */
  static #onMagePick(event, target) {
    const { what, key } = target.dataset, g = this.st.mg;
    g[what] = what === "sub" && g.sub === key ? "" : key;        // течение — по желанию: повторный щелчок снимает
    if (what === "faction") g.sub = "";
    // у фракции свои родовые Сферы: прежний выбор не из её списка — сбросить
    if (what === "faction") { const aff = this.mageFaction?.affinity ?? []; if (aff.length && !aff.includes(g.affinity)) g.affinity = aff.length === 1 ? aff[0] : ""; }
    this.render();
  }
  /** Дар в ячейку (повторный щелчок — снять). */
  static #onGarouGift(event, target) {
    const { slot, key } = target.dataset, w = this.st.ww;
    if (slot === "general") {                          // общая колонка: снять выбранный или занять первую свободную ячейку
      const gen = this.giftSlots.filter(s => s.key.startsWith("general")).map(s => s.key), had = gen.find(k => w.gifts[k] === key);
      if (had) w.gifts[had] = "";
      else { const free = gen.find(k => !w.gifts[k]); if (!free) return ui.notifications.info(t("GarouCr.GiftGeneralFull", { n: gen.length })); w.gifts[free] = key; }
    } else w.gifts[slot] = w.gifts[slot] === key ? "" : key;
    w.extra = w.extra.filter(k => k !== key);
    this.render();
  }
  /** Дар сверх трёх — за бонусные очки (W20, гл. 3: 7 за Дар 1-го уровня). */
  static #onGarouExtra(event, target) {
    const k = target.dataset.key, w = this.st.ww;
    w.extra = w.extra.includes(k) ? w.extra.filter(x => x !== k) : [...w.extra, k];
    this.render();
  }
  static #onEarthbound() { this.st.earthbound = !this.st.earthbound; this.render(); }
  static #onThrall() { this.st.thrall = !this.st.thrall; if (this.st.thrall) this.st.mark = ""; this.render(); }
  /** Особый смертный: Родня, Ками или фомор (повторный щелчок — обычный смертный). */
  static #onMark(event, target) { const m = target.dataset.mark; this.st.mark = this.st.mark === m ? "" : m; if (this.st.mark) this.st.thrall = false; this.render(); }
  /** Сила Ками (1–3) или фомора (до двух сверх сил породы). */
  static #onMarkPower(event, target) {
    const k = target.dataset.key, list = this.st.mark === "kami" ? "kamiPowers" : "fomorPowers", cap = this.st.mark === "kami" ? 3 : 2;
    const cur = this.st[list];
    this.st[list] = cur.includes(k) ? cur.filter(x => x !== k) : cur.length < cap ? [...cur, k] : cur;
    this.render();
  }
  /** Охотник: кредо — основная Добродетель и начальная Убеждённость; Грани чужих путей пересчитываются. */
  static #onCreed(event, target) { this.st.creed = target.dataset.creed; this.render(); }
  /** Кровное право дампира: точка n (повторный щелчок по последней точке — снять). */
  static #onDhSwap() { this.st.dhSwap = !this.st.dhSwap; this.render(); }
  static #onBrSet(event, target) {
    const k = target.dataset.key, n = Number(target.dataset.n), cur = this.st.bloodrights[k] ?? 0;
    const v = cur === n ? n - 1 : n;
    if (v <= 0) delete this.st.bloodrights[k]; else this.st.bloodrights[k] = v;
    this.render();
  }
  /** Требование Кровного права: Дисциплина I (с учётом точек мастера), Дриримантия — любая магия крови. */
  brReqOk(r) {
    if (!r.req) return true;
    const has = k => this.value("disc", k) > 0;
    if (r.key === "dririmancy") return ["thaumaturgy", "necromancy", "assamiteSorcery", "setiteSorcery", "koldunism", "darkThaumaturgy"].some(has);
    return has(r.req);
  }

  static #onEdgeToggle(event, target) {
    const k = target.dataset.key, list = this.st.edges;
    if (list.includes(k)) {
      // снять Грань — и те выше по тому же пути, которым больше не на что опереться (у Граней книг кредо — свой уровень рядом)
      const E = key => hunterData().edges.find(x => x.key === key);
      let rest = list.filter(x => x !== k), changed = true;
      while (changed) {
        const keep = rest.filter(x => { const e = E(x); return !e || hasPrevEdge(rest, e); });
        changed = keep.length !== rest.length; rest = keep;
      }
      this.st.edges = rest;
    } else {
      const why = this.edgeIssues(k);
      if (why.length) return ui.notifications.warn(why.join(" "));
      list.push(k);
    }
    this.render();
  }
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
    // Слава Рагабаша и Фера: 3 точки в любом сочетании (у прочих аугурий — по книге, без выбора)
    if (kind === "renown") {
      if (this.renownFixed) return;
      st.ww.renown[key] = st.ww.renown[key] === n ? n - 1 : n;
      return this.render();
    }
    if (kind === "disc" && this.isEarthbound && Codex.lore(key)?.dark) { ui.notifications.warn(t("Creator.DarkFreeOnly")); return; }
    const store = kind === "attr" ? st.attr : kind === "abil" ? st.abil : kind === "disc" ? st.disc : kind === "bg" ? st.bg : st.virt;
    const base = this.base(kind, key);
    const extra = (st.free[kind]?.[key] ?? 0) + (st.xp[kind]?.[key] ?? 0);
    const cur = base + (store[key] ?? 0);
    let want = n === cur ? n - 1 : n;
    want = Math.max(base, Math.min(want, (kind === "virt" && this.isHunter && !this.isLost ? 10 : 5) - extra));
    if (kind === "abil") want = Math.min(want, VTM20.creation.abilityCap);
    if (kind === "disc" && (this.type === "vampire" || this.isDemon) && this.clanDisciplines && !this.clanDisciplines.includes(key) && want > base) {
      ui.notifications.warn(t(this.isDemon ? "Creator.OnlyHouse" : "Creator.OnlyClan")); return;
    }
    if (kind === "disc" && want > base && this.bannedDisc(key)) { ui.notifications.warn(t("Creator.SectBanned", { name: Codex.disciplineLabel(key) })); return; }
    if (kind === "disc" && this.isMage && want + extra > this.morality) { ui.notifications.warn(loc("VTM20.MageCr.OverArete")); want = Math.max(base, this.morality - extra); }
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

  static #onAddDisc(event, target) {
    const sel = target.closest(".r-toolbar")?.querySelector("select[name=cr-disc]") ?? this.element.querySelector("select[name=cr-disc]");
    const k = sel?.value;
    if (k) { this.st.disc[k] ??= 0; this.render(); }
  }
  /** Убрать добавленную внеклановую Дисциплину без точек. */
  static #onDropDisc(event, target) {
    const k = target.dataset.key;
    if (!k || this.inClan(k) || this.value("disc", k) > this.base("disc", k)) return;
    for (const bag of [this.st.disc, this.st.free.disc, this.st.xp.disc]) delete bag[k];
    this.render();
  }
  /** Выбор по «Дополнительной Дисциплине»; прежняя Дисциплина снова внеклановая — её начальные точки снимаются. */
  static #setExtraDisc(k) {
    const old = this.st.extraDisc;
    if (old && old !== k && this.st.disc[old]) delete this.st.disc[old];
    this.st.extraDisc = k || "";
    if (k) this.st.disc[k] ??= 0;
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
    if (i >= 0) {
      if (list[i].en === EXTRA_DISC_MERIT) VtMCreator.#setExtraDisc.call(this, "");
      list.splice(i, 1);
    }
    else {
      // Прямой запрет в тексте черты — не даём взять (trait-rules.mjs)
      const blocker = blockerFor(name, [...this.st.merits, ...this.st.flaws].map(x => x.name));
      if (blocker) return ui.notifications.warn(t("Creator.TraitBlocked", { a: name, b: blocker }));
      const m = Codex.merits.find(x => x.kind === kind && x.name === name);
      if (m) list.push({ name, cost: Number(m.min) || 1, min: Number(m.min) || 1, max: Number(m.max) || Number(m.min) || 1, html: m.html, category: m.category, en: m.en, clan: m.clan ?? "", sect: m.sect ?? "" });
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
    const hxp = this.isHunter && mode === "xp" && hunterGrowth() === "xp";
    if (this.isLost && kind === "morality") return ui.notifications.warn(t("Creator.LostNoConviction"));
    if (this.isHunter && !this.isLost && !hxp && (kind === "virt" || (kind === "morality" && mode === "xp"))) return ui.notifications.warn(t("Creator.HunterNoBuy"));
    // начальная Убеждённость за опыт — не выше Силы воли
    if (hxp && kind === "morality" && d > 0 && this.morality >= this.willpower) return ui.notifications.warn(t("Creator.HunterConvWill"));
    if (kind === "quint") {                                // маг: Квинтэссенция по 4 за пункт, на колесе — до 20
      if (mode !== "free" || (d > 0 && this.mageAvatar + 4 * ((bag.quint ?? 0) + 1) > 20)) return;
      bag.quint = Math.max(0, (bag.quint ?? 0) + d);
    } else if (kind === "rage" || kind === "gnosis") {     // Гару: Ярость и Гнозис — до 10
      if (d > 0 && (kind === "rage" ? this.garouRage : this.garouGnosis) >= 10) return;
      bag[kind] = Math.max(0, bag[kind] + d);
    } else if (kind === "morality" || kind === "will") {
      const cap = this.isMage ? (mode === "xp" ? 10 : mageData().creation?.areteMax ?? 3) : this.isHunter ? (mode === "xp" ? 10 : 8) : this.st.path === "humanity" || mode === "xp" ? 10 : 5;
      if (d > 0 && (kind === "will" ? this.willpower >= 10 : this.morality >= cap)) return;
      bag[kind] = Math.max(0, bag[kind] + d);
    } else {
      const max = kind === "disc" && this.isMage ? Math.min(5, this.morality) : kind === "disc" && this.type === "vampire" ? VTM20.generationOf(13 - Math.min(5, this.value("bg", "Поколение"))).trait : kind === "virt" && this.isHunter && !this.isLost ? 10 : 5;
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
    // дампир: своя кровь — полный запас (10 + Древность пересчитает лист), концепция, Предок, Кровные права
    if (this.isDhampir) Object.assign(sys, { domitor: "", blood: { value: 10 + this.value("bg", Codex.backgrounds.find(b => b.en === "Antiquity")?.name ?? ""), max: 10 },
      dhampir: { concept: st.dhConcept, antecedent: st.antecedent, antecedentClan: st.antecedentClan, bloodrights: { ...st.bloodrights },
        rituals: [...(a.system.dhampir?.rituals ?? [])] } });
    // Слуга: Вера слуги и хозяин; Человечность не трогаем (грех слуги — по его Воле); дары-прибавки — сразу в черты
    if (this.isThrall) {
      delete sys.morality;
      for (const [k, n] of Object.entries(st.pact.attr)) sys.attributes[k].value = Math.min(5, sys.attributes[k].value + n);
      for (const [k, n] of Object.entries(st.pact.abil)) sys.abilities[k].value = Math.min(5, sys.abilities[k].value + n);
      const boosts = (kind, store) => Object.entries(store).filter(([, n]) => n > 0)
        .map(([k, n]) => ({ kind, name: "", key: `${kind === "attr" ? "attributes" : "abilities"}.${k}`, dots: n, high: false, cost: 0, note: "" }));
      sys.thrall = { master: st.pact.master, faith: this.morality, gifts: [...boosts("attr", st.pact.attr), ...boosts("abil", st.pact.abil)] };
    }
    // особый смертный: отметка Родни, Ками или фомора с выбранным
    if (this.type === "mortal" && !this.isThrall) {
      const W = Codex.werewolf ?? {}, m = st.mark;
      sys.kinfolk = { ...(a.system.kinfolk ?? {}), on: m === "kinfolk", ...(m === "kinfolk" ? { tribe: st.markTribe || W.tribes?.[0]?.key || "", breed: "homid" } : {}) };
      const ks = W.kami?.start?.[st.kamiKind] ?? { gnosis: 1, rage: 0, willpower: 3 };
      sys.kami = { ...(a.system.kami ?? {}), on: m === "kami", ...(m === "kami" ? { kind: st.kamiKind, geas: st.kamiGeas, gnosis: ks.gnosis, rage: ks.rage,
        powers: st.kamiPowers.map(key => ({ key, n: 1 })) } : {}) };
      const fb = (W.fomori?.breeds ?? []).find(b => b.key === st.fomorBreed);
      const own = (fb?.powers ?? []).filter(k => !k.startsWith("~") && (W.fomori?.powers ?? []).some(x => x.key === k));
      sys.fomor = { ...(a.system.fomor ?? {}), on: m === "fomor", ...(m === "fomor" ? { breed: st.fomorBreed, rage: 0,
        powers: [...new Set([...own, ...st.fomorPowers])].map(key => ({ key, n: 1 })) } : {}) };
      if (m === "fomor" && fb?.willpower) sys.willpower = { permanent: Math.max(sys.willpower.permanent, fb.willpower), temporary: Math.max(sys.willpower.permanent, fb.willpower) };
      if (m === "kami") sys.willpower = { permanent: Math.max(sys.willpower.permanent, ks.willpower), temporary: Math.max(sys.willpower.permanent, ks.willpower) };
    }
    // Охотник: кредо, Добродетели охоты, Убеждённость, Грани; Человечности и Добродетелей V20 нет
    if (this.isHunter) {
      delete sys.morality; delete sys.virtues;
      // начальная Убеждённость, купленная опытом, — постоянная; свободные пункты — только текущая шкала
      sys.hunter = this.isLost
        ? { creed: "bystander", mercy: 0, vision: 0, zeal: 0, conviction: 10, edges: [],
            bystander: Object.fromEntries(Object.entries(LOST_SLOTS).map(([slot, k]) => [k, this.value("virt", slot)])) }
        : { creed: st.creed, mercy: this.hunterVirtue("mercy"), vision: this.hunterVirtue("vision"), zeal: this.hunterVirtue("zeal"),
            conviction: this.morality, edges: [...st.edges], start: st.xp.morality ? (this.creedData?.conviction ?? 3) + st.xp.morality : 0 };
    }
    // Маг: фракция, Сущность, родовая Сфера, Арете, Сферы, фокус; Квинтэссенция — по Аватару; Человечности и Добродетелей нет
    if (this.isMage) {
      delete sys.morality; delete sys.virtues;
      const g = st.mg;
      sys.mage = { ...(a.system.toObject?.().mage ?? {}), faction: g.faction, essence: g.essence, affinity: g.affinity, arete: this.morality,
        spheres: Object.fromEntries(VTM20.mageSpheres.map(k => [k, this.value("disc", k)])),
        sub: (this.mageFaction?.subs ?? []).some(x => x.key === g.sub) ? g.sub : "",
        quintessence: this.mageQuint, paradox: 0, paradigm: g.paradigm, practice: g.practice };
    }
    // Гару и Фера: порода, аугурия, племя (или род с выбором внутри), Ранг 1, форма рождения, Ярость, Гнозис, Дары, Слава, уродство
    if (this.isWerewolf) {
      delete sys.morality; delete sys.virtues;
      const w = st.ww, f = this.feraData, r = this.garouRenown;
      sys.werewolf = { ...(a.system.toObject?.().werewolf ?? {}),
        breed: w.breed, auspice: w.auspice, tribe: w.tribe, rank: 1, fera: w.fera,
        feraSub: { breed: "", aspect: "", tribe: "", faction: "", pryio: "", varna: "", ...w.sub },
        form: f ? f.forms[0]?.key ?? "homid" : w.breed === "lupus" ? "lupus" : w.breed === "metis" ? "crinos" : "homid",
        rage: { permanent: this.garouRage, value: this.garouRage }, gnosis: { permanent: this.garouGnosis, value: this.garouGnosis },
        gifts: [...Object.values(w.gifts), ...w.extra].filter(Boolean),
        deformities: this.isMetis && w.deform ? [w.deform] : [],
        renown: Object.fromEntries(RENOWN.map(k => [k, { permanent: r[k], temporary: 0 }])) };
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
    // Кровные права — словарь: снятые в мастере права убрать отдельно (обычное обновление словарь только дополняет)
    const goneRights = this.isDhampir ? Object.keys(a.system.dhampir?.bloodrights ?? {}).filter(k => !(k in st.bloodrights)) : [];
    if (goneRights.length) await a.update(Object.fromEntries(goneRights.map(k => [`system.dhampir.bloodrights.-=${k}`, null])));
    await a.update({ name: st.name, system: sys });

    const kill = a.items.filter(i => ["discipline", "thaumPath", "lore", "background", "merit", "flaw"].includes(i.type)).map(i => i.id);
    if (kill.length) await a.deleteEmbeddedDocuments("Item", kill);
    const icon = n => `systems/${SYSTEM_ID}/assets/icons/${n}.svg`;
    const items = [];
    const discKeys = new Set([...(this.clanDisciplines ?? []), ...Object.keys(st.disc), ...Object.keys(st.free.disc), ...Object.keys(st.xp.disc)]);
    if (this.type === "ghoul") discKeys.add("potence");
    for (const k of discKeys) {
      if (this.isMage) continue;                        // Сферы мага — числа на листе (system.mage.spheres), не предметы
      if (this.isDemon) {                               // Знания падшего — предметами «Знание» со справочным ключом
        const l = Codex.lore(k), v = this.value("disc", k);
        if (l && v > 0) items.push({ name: l.name, type: "lore", img: icon(l.dark ? "darkLore" : "lore"),
          system: { key: k, value: v, description: `<p><em>${l.en}</em> · ${Codex.house(l.house)?.name ?? t("Demon.Common")}</p>` } });
        continue;
      }
      const v = this.value("disc", k), d = Codex.discipline(k);
      if (!d || (v <= 0 && !this.inClan(k))) continue;
      // Дисциплина по «Дополнительной Дисциплине» — с ручной отметкой «клановая» (цена опыта ×5 и на листе)
      items.push({ name: d.name, type: "discipline", img: Codex.disciplineIcon(k), system: { key: k, value: v, inClan: k === this.extraDisc } });
      const firstPath = { thaumaturgy: "Путь Крови", necromancy: "Путь Склепа" }[k];
      if (firstPath && v > 0) items.push({ name: firstPath, type: "thaumPath", img: Codex.disciplineIcon(k),
        system: { discipline: k, value: Math.min(5, v), primary: true, description: Codex.bloodPath(k, firstPath)?.html ?? "" } });
    }
    const bgLine = this.isThrall ? "demon" : VTM20.traitLine(this.type);       // слуга — факты биографии из книги падших
    const bgDone = new Set();                           // одноимённые (охотничий и анархов «Арсенал») — один раз, своя линия первой
    const bgList = Codex.backgrounds.filter(b => (!b.dhampir || this.isDhampir) && ((b.line ?? "") === bgLine || (this.isHunter && VTM20.backgroundAllowed(b, "hunter"))) && !(this.isLost && b.noBystander))
      .sort((x, y) => ((y.line ?? "") === bgLine) - ((x.line ?? "") === bgLine));
    for (const b of bgList) {   // одноимённые у демонов — своя линия
      if (bgDone.has(b.name)) continue;
      bgDone.add(b.name);
      // Отшельник (Hunter Players Guide, с. 19): Покровители 3 даром, купленные точки — сверху (4-я и 5-я — как 1-я и 2-я)
      const free = this.isHunter && !this.isLost && b.en === "Patron" ? this.creedData?.patron ?? 0 : 0;
      const v = Math.min(5, this.value("bg", b.name) + free);
      if (v > 0) items.push({ name: b.name, type: "background", img: backgroundIcon(b.en) ?? icon("background"), system: { value: v, description: b.html, source: b.en } });
    }
    for (const m of st.merits) {
      // у «Дополнительной Дисциплины» в описании — какая Дисциплина выбрана
      const chosen = m.en === EXTRA_DISC_MERIT && this.extraDisc ? `<p><b>${t("Creator.ExtraDiscChosen", { name: Codex.disciplineLabel(this.extraDisc) })}</b></p>` : "";
      items.push({ name: m.name, type: "merit", img: traitIcon(m.category), system: { cost: m.cost, category: m.category, clan: m.clan ?? "", sect: m.sect ?? "", description: chosen + m.html, source: m.en } });
    }
    for (const m of st.flaws) items.push({ name: m.name, type: "flaw", img: traitIcon(m.category, true), system: { cost: m.cost, category: m.category, clan: m.clan ?? "", sect: m.sect ?? "", description: m.html, source: m.en } });
    // опытный охотник: по психозу за каждую точку Добродетели от 7 (при Жертве — от 9); какие — игрок выбирает в библиотеке
    if (this.isHunter && !this.isLost) {
      const from = hunterSacrificeOn() ? 9 : 7, n = ["mercy", "vision", "zeal"].reduce((s, v) => s + Math.max(0, this.hunterVirtue(v) - from + 1), 0);
      for (let i = 0; i < n; i++) items.push({ name: t("Creator.HunterMadnessName", { n: i + 1 }), type: "derangement", img: icon("derangement"),
        system: { permanent: true, description: `<p>${t("Creator.HunterMadnessHint")}</p>` } });
    }
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
