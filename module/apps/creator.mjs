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
import { blockerFor } from "../data/trait-rules.mjs";
import { attachCombos } from "../ui/combo.mjs";
import { traitIcon, backgroundIcon } from "../data/icons.mjs";
import { RULES, RENOWN, TIERS, SECTS, LOST_SLOTS, EXTRA_DISC_MERIT, mix } from "./creator/rules.mjs";
import { MageCreator } from "./creator/mage.mjs";
import { GarouCreator } from "./creator/garou.mjs";
import { HunterCreator } from "./creator/hunter.mjs";
import { SorcererCreator } from "./creator/sorcerer.mjs";
import { CalcCreator } from "./creator/calc.mjs";
import { ContextCreator } from "./creator/context.mjs";

import { M as mageData } from "./mage.mjs";
import { H as hunterData, growth as hunterGrowth, sacrificeOn as hunterSacrificeOn, hasPrevEdge } from "./hunter.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const loc = k => game.i18n.localize(k);

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
      sorcAff: s.sorcerer?.affiliation || "", markTribe: s.kinfolk?.tribe || "", kamiKind: s.kami?.kind || "human", kamiGeas: s.kami?.geas || "",
      kamiPowers: (s.kami?.powers ?? []).map(x => x.key), fomorBreed: s.fomor?.breed || "", fomorPowers: [],
      // Гару (W20, гл. 3) и Фера (W20 Changing Breeds): порода, аугурия, племя или род с выбором внутри рода, Дары по ячейкам,
      // Дары сверх трёх (7 бонусных), уродство метиса, Слава (у Рагабаша и Фера — 3 точки на выбор)
      // Маг (M20): фракция, Сущность, родовая Сфера, фокус (парадигма и практика); Сферы — в disc, Арете — в morality
      mg: { faction: s.mage?.faction || "", sub: s.mage?.sub || "", essence: s.mage?.essence || "", resName: s.mage?.resonances?.[0]?.name || "", affinity: s.mage?.affinity || "", group: "",
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
    if (kind === "res") {                                  // маг: Резонанс — до 5 точек
      if (mode !== "free" || (d > 0 && this.mageRes >= 5)) return;
      bag.res = Math.max(0, (bag.res ?? 0) + d);
    } else if (kind === "quint") {                                // маг: Квинтэссенция по 4 за пункт, на колесе — до 20
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
      // колдун и консор (M20 Sorcerer; Gods & Monsters): отметка; нумины колдун берёт на листе
      const sorcOld = a.system.toObject?.().sorcerer ?? {};
      sys.sorcerer = m === "sorcerer" ? this.sorcWrite(sorcOld) : { ...sorcOld, on: false };
      sys.consor = { ...(a.system.toObject?.().consor ?? {}), on: m === "consor" };
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
        quintessence: this.mageQuint, paradox: 0, resonances: g.resName ? [{ name: g.resName, flavor: "", value: this.mageRes }] : [], paradigm: g.paradigm, practice: g.practice };
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

// линейки: геттеры и куски контекста мага, Гару и Фера, охотника и дампира
for (const Part of [CalcCreator, ContextCreator, MageCreator, GarouCreator, HunterCreator, SorcererCreator]) mix(VtMCreator, Part);
