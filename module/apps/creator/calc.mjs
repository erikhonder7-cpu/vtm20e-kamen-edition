// module/apps/creator/calc.mjs
// Мастер создания: расчёты — числа создания, значения черт, остатки очков, цены опыта, проверки шагов.
// Примесь к VtMCreator (module/apps/creator.mjs): методы и геттеры работают с this мастера.

import { VTM20 } from "../../config.mjs";
import { Codex } from "../../data/codex.mjs";
import { checkTraits } from "../../data/trait-rules.mjs";
import { RULES, DEMON_FAITH, SECT_RULES, CAMARILLA_BANNED, HUNTER_SLOTS, LOST_SLOTS, EXTRA_DISC_MERIT, preview } from "./rules.mjs";
import { M as mageData } from "../mage.mjs";
import { H as hunterData } from "../hunter.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const loc = k => game.i18n.localize(k);

export class CalcCreator {
  /* ── Расчёты ───────────────────────────────────────────────────────── */

  /** Числа создания: по типу персонажа, у вампира — с поправкой секты (SECT_RULES). */
  get rules() {
    if (this.isWraith) return this.wraithRules;          // призрак и его пути: Спектр, Восставший, проектор (creator/wraith.mjs)
    if (this.isEarthbound) return RULES.earthbound;
    if (this.isThrall) return RULES.thrall;
    // колдун (M20 Sorcerer, гл. 3): 5 точек нумин, Путь за свободные пункты — 7
    if (this.isSorcerer) return { ...this.baseRules, disc: 5, cost: { ...this.baseRules.cost, disc: 7 } };
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
      opts: ["sorcerer", "consor", "kinfolk", "kami", "fomor"].map(k => ({ key: k, label: t(`Creator.Mark.${k}`), active: st.mark === k })),
      affiliations: st.mark === "sorcerer" ? this.sorcAffiliations() : [],
      hint: st.mark ? t(`Creator.Mark.${st.mark}Hint`) : t("Creator.Mark.none"),
      tribes: (W.tribes ?? []).map(x => ({ key: x.key, label: lbl(x), selected: x.key === st.markTribe })),
      kamiKinds: ["human", "animal", "plant"].map(k => ({ key: k, label: loc(`VTM20.Werewolf.Kami.form.${k}`), selected: k === st.kamiKind })),
      kamiPowers: (W.kami?.powers ?? []).filter(x => x.kind === "kami" || (st.kamiKind === "plant" && x.kind === "immobile"))
        .map(x => ({ key: x.key, label: lbl(x), text: preview(x.text, 700), on: st.kamiPowers.includes(x.key) })),
      fomorBreeds: (W.fomori?.breeds ?? []).map(b => ({ key: b.key, label: lbl(b), selected: b.key === st.fomorBreed })),
      fomorText: fb ? String(fb.text ?? "").replace(/<[^>]+>/g, "").slice(0, 400) : "",
      fomorPowers: (W.fomori?.powers ?? []).map(x => ({ key: x.key, label: lbl(x), text: preview(x.text, 700),
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
  get isMage() { return this.type === "mage"; }
  // маг, Гару и Фера, охотник и дампир — примеси из creator/*.mjs (см. конец файла)

  get isWerewolf() { return this.type === "werewolf"; }

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
    if (this.isSorcerer) return this.sorcKeys;
    if (this.isMage) return VTM20.mageSpheres;
    if (this.isWraith) return this.wraithArcanoiKeys;
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
    if (kind === "disc" && this.isWraith) return this.wraithDiscBase(k);   // Сговор Спектра, Воплощение и Паутина проектора — даром
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
    if (this.isWerewolf || this.isWraith) return 0;    // у Гару и призрака морали нет
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
    if (this.isWraith) return Math.min(10, (this.wrNums.willpower ?? 5) + this.st.free.will);     // Воля призрака 5 (гл. 4)
    if (this.isSorcerer) return Math.min(10, 5 + this.st.free.will);                       // колдун: Воля 5 (M20 Sorcerer, гл. 3)
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
      + (this.isMage ? (f.quint ?? 0) * c.quint + this.mageResCost : 0)
      + (this.isWraith ? (f.pathos ?? 0) * c.pathos + this.sum(f.pas ?? {}) * c.pas + this.sum(f.fet ?? {}) * c.fet + this.risenDiscSpent : 0);
  }
  // призрак: торг с Тенью — её очки взаймы прибавляются к своим (или свои уходят на урезание её пула)
  get freeTotal() { return this.rules.free + this.flawPoints + (this.isWraith ? this.wraithTrade : 0); }
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
      if (this.isWraith) {                             // опыт призрака (гл. 8): Арканос новый 7, далее × 3; Воля — текущее
        total += kind === "attr" ? c * 4 : kind === "abil" ? (c === 0 ? 3 : c * 2) : kind === "disc" ? (c === 0 ? 7 : c * 3) : kind === "will" ? c : 0;
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
      case "wraith": return !this.wraithIssues.length;
      case "passions": return !this.passionIssues.length;
      case "shadow": return !this.shadowIssues.length;
      case "gifts": return !this.giftIssues.length;
      case "attributes": return Object.values(rem.attr).every(v => v === 0);
      case "abilities": return Object.values(rem.abil).every(v => v === 0);
      case "disciplines": return rem.disc === 0 && !(this.isMage && this.sphereIssues.length) && !(this.isWraith && this.arcanoiIssues.length);
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
    if (this.isSorcerer) out.push(...this.sorcIssues);
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
    if (this.isWraith) out.push(...this.wraithAllIssues);
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
    if (this.isWraith) return { disciplines: "arcanoi", advantages: "advantagesWraith",
      shadow: this.wrPath === "spectre" ? "psyche" : this.wrPath === "projector" ? "stains" : "shadow" }[k] ?? k;
    return this.isDemon ? ({ disciplines: "lores", advantages: "advantagesDemon" }[k] ?? k) : k;
  }
  /** «Факты биографии» или «Дополнения» (у падшего). */
  get bgLabel() { return this.isDemon ? t("Demon.Backgrounds") : t("Sheet.Backgrounds"); }
  /** «Дисциплины» или «Знания» (у падшего). */
  get discLabel() { return this.isWraith ? loc("VTM20.Wraith.Arcanoi") : this.isSorcerer ? loc("VTM20.SorcCr.Numina") : this.isMage ? loc("VTM20.Mage.Spheres") : this.isDemon ? t("Demon.Lores") : t("Sheet.Disciplines"); }
  /** Сила справочника по ключу: Дисциплина или Знание падшего. */
  discData(k) { return this.isWraith ? this.wraithArcanos(k) : this.isSorcerer ? this.sorcNumen(k) : this.isMage ? this.mageSphere(k) : this.isDemon ? Codex.lore(k) : Codex.discipline(k); }

  /** Противоречия выбранных достоинств и недостатков. */
  get traitIssues() {
    return checkTraits([...this.st.merits, ...this.st.flaws].map(x => x.name), { sectKey: this.st.sectKey });
  }
}
