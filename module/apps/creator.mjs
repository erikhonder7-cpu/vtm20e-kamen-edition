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

import { SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { attachCombos } from "../ui/combo.mjs";
import { RULES, mix } from "./creator/rules.mjs";
import { MageCreator } from "./creator/mage.mjs";
import { GarouCreator } from "./creator/garou.mjs";
import { HunterCreator } from "./creator/hunter.mjs";
import { SorcererCreator } from "./creator/sorcerer.mjs";
import { WraithCreator, WRAITH_CR_ACTIONS } from "./creator/wraith.mjs";
import { CalcCreator } from "./creator/calc.mjs";
import { ContextCreator } from "./creator/context.mjs";
import { ACTIONS, setExtraDisc } from "./creator/actions.mjs";
import { WriteCreator } from "./creator/write.mjs";


const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

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
    actions: { ...ACTIONS, ...WRAITH_CR_ACTIONS }
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
      free: { attr: {}, abil: {}, disc: {}, bg: {}, virt: {}, morality: 0, will: 0, rage: 0, gnosis: 0, pathos: 0, trade: 0, pas: {}, fet: {} },
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
      sorcAff: s.sorcerer?.affiliation || "", markTribe: s.kinfolk?.tribe || "", kamiKind: s.kami?.kind || "human", kamiGeas: s.kami?.geas || "",
      kamiPowers: (s.kami?.powers ?? []).map(x => x.key), fomorBreed: s.fomor?.breed || "", fomorPowers: [],
      // Гару (W20, гл. 3) и Фера (W20 Changing Breeds): порода, аугурия, племя или род с выбором внутри рода, Дары по ячейкам,
      // Дары сверх трёх (7 бонусных), уродство метиса, Слава (у Рагабаша и Фера — 3 точки на выбор)
      // Маг (M20): фракция, Сущность, родовая Сфера, фокус (парадигма и практика); Сферы — в disc, Арете — в morality
      mg: { faction: s.mage?.faction || "", sub: s.mage?.sub || "", essence: s.mage?.essence || "", resName: s.mage?.resonances?.[0]?.name || "", affinity: s.mage?.affinity || "", group: "",
        paradigm: s.mage?.paradigm || "", practice: s.mage?.practice || "" },
      // Призрак (Wraith 20, гл. 4, 6): Легион, Гильдия, фракция, смерть; Страсти и Оковы (очки создания); Тень — архетип,
      // бросок Ангста, Тёмные Страсти, Ангст и Шипы за свободные очки Тени
      wr: { legion: s.wraith?.legion || "", guild: s.wraith?.guild || "", faction: s.wraith?.faction || "", death: s.wraith?.death || "",
        passions: [{ text: "", emotion: "", value: 0 }, { text: "", emotion: "", value: 0 }, { text: "", emotion: "", value: 0 }],
        fetters: [{ text: "", value: 0 }, { text: "", value: 0 }, { text: "", value: 0 }],
        dark: [{ text: "", emotion: "", value: 0 }, { text: "", emotion: "", value: 0 }],
        archetype: s.wraith?.shadow?.archetype || "", angstRoll: 0, angstDice: "", angstTemp: 0, angstExtra: 0, thorns: {} },
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
    if (this.isWraith) s.push("wraith");                    // Легион, Гильдия, фракция, смерть
    s.push("attributes", "abilities");
    if (this.rules.disc > 0) s.push("disciplines");
    if (this.isWerewolf) s.push("gifts");                   // три Дара 1-го уровня
    s.push("advantages");
    if (this.isWraith) s.push("passions");                  // Страсти и Оковы — по 10 очков
    if (this.isHunter && !this.isLost) s.push("edges");     // Грани — на очки Добродетелей охоты; у Свидетеля Граней нет
    if (this.isDhampir) s.push("bloodrights");              // Кровные права дампира (Accursed Heirs, гл. 4)
    if (!this.isWraith) s.push("merits");                   // у призраков Wraith 20 достоинств и недостатков нет
    s.push("freebies");
    if (this.isWraith) s.push("shadow");                    // Тень — после торга свободными очками (гл. 6)
    if (this.st.xpTotal > 0) s.push("xp");
    if (this.isThrall) s.push("pact");                 // «Танец с Дьяволом»: хозяин, доля, дары
    s.push("summary");
    return s;
  }
  get stepKey() { return this.steps[Math.min(this.step, this.steps.length - 1)]; }

  /** Начало описания для превью карточки; многоточие — только если текст обрезан. */
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
      if (f === "extraDisc") { setExtraDisc.call(this, v); return this.render(); }
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

  /* ── Кнопки — creator/actions.mjs; запись — creator/write.mjs ── */

  /** Требование Кровного права: Дисциплина I (с учётом точек мастера), Дриримантия — любая магия крови. */
  brReqOk(r) {
    if (!r.req) return true;
    const has = k => this.value("disc", k) > 0;
    if (r.key === "dririmancy") return ["thaumaturgy", "necromancy", "assamiteSorcery", "setiteSorcery", "koldunism", "darkThaumaturgy"].some(has);
    return has(r.req);
  }
}

// линейки: геттеры и куски контекста мага, Гару и Фера, охотника и дампира
for (const Part of [CalcCreator, ContextCreator, WriteCreator, MageCreator, GarouCreator, HunterCreator, SorcererCreator, WraithCreator]) mix(VtMCreator, Part);
