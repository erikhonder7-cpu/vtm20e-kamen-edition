// module/apps/creator/wraith.mjs
// Мастер создания: призрак (Wraith 20, гл. 4 — создание персонажа, гл. 6 — создание Тени) и его пути:
//   · Призрак — Арканои 5 (не больше 3 в одном), Фоны 7, Страсти 10 и Оковы 10, Пафос 5 + Мемориум, Воля 5, 15 свободных
//     (Атрибут 5, Арканос 5, Воля 2, Способность 2, Страсть 2, Фон 1, Оковы 1, Пафос 1 за 2 точки); торг с Тенью — до 7 взаймы.
//     Тень: архетип, постоянный Ангст — бросок Воли (сл. 6, единицы не отменяют, минимум 1, не выше Воли), Тёмные Страсти 7,
//     10 свободных Тени (цены в книге не названы — по примеру книги: Тёмная Страсть 1, Ангст 2, правило системы); Шипы — по цене.
//   · Спектр (гл. 10) — каста: какие Арканои, бесплатный Тёмный Арканос и точки на выбор; у всех Сговор 1; Фоны 5 (без Эйдолона,
//     Известности, Богатства); Тёмные Страсти 10 (у Стриплинга 8, у Шейда 12) вместо Страстей; Оковы — только Мортвайтам и
//     Двойникам; Ангст 5 — запас вместо Пафоса; 20 свободных + до 7 за больший пул Психеи (1:1). Психея вместо Тени: архетип,
//     Пафос (рейтинг не выше Воли Спектра), Страсти 7; очки Психеи — отданные ей свободные (правило системы: книга иных не даёт).
//   · Восставший (гл. 11) — Кукловодство и 2 точки в Паутину жизни, Вселение или Воплощение (Арканоев 5 вместе с Очарованием и
//     Случайностью); Сила не ниже 3, Внешность не выше 3; Фоны 5 (без Артефакта, Наставника, Статуса); Пафос 5, Воля 6;
//     15 свободных: «Дисциплины» тела 7, Страсть 1, Пафос 1; Тень — как у призрака.
//   · Проектор «Орфея» (приложение) — Оттенок: Арканос Оттенка 1, Воплощение 1, Паутина жизни 1 и ещё 2; Фоны 7 (без Эйдолона,
//     Обиталища, Наследия, Мемориума); Страсти 5, Тетеры 10; Пафос, Воля, Ангст — по 5 с поправками Оттенка; 18 свободных
//     (цены — как у призрака, правило системы); Тени нет — Пятна: одно на 2 постоянного Ангста.
//   · Оттенок цвета («Орфей», Hue Character Creation) — Арканои 5 без Гильдии (Гильдию не выбирают: толкование системы слов
//     «no Guild Arcanoi»), Фоны 5, Страсти 10 (одна — тёмная), Оковы 8, Пятна 3; Пафос 5 (Мемориум не в счёт) и Воля 5;
//     15 свободных, Пафос свободными не выше 7. Тень — Тихая (Quiescent): её Тёмные Страсти повторяют Страсти Оттенка.

import { W as wraithData, arcSym, legionSym } from "../wraith.mjs";
import { VTM20 } from "../../config.mjs";

const loc = k => game.i18n.localize(`VTM20.WraithCr.${k}`);
const fmt = (k, d) => game.i18n.format(`VTM20.WraithCr.${k}`, d);
export const SHADOW_COST = { dark: 1, angst: 2 };
const PSYCHE_COST = { rating: 5, passion: 1 };
const sum = list => list.reduce((s, x) => s + (Number(x?.value) || 0), 0);
const RISEN_DISC = ["potence", "fortitude", "celerity"];
/** Оттенок цвета («Орфей», Hue Character Creation). */
const HUE = { backgrounds: 5, fetters: 8, stains: 3, pathos: 5, willpower: 5, freebies: 15, pathosMax: 7, archetype: "Quiescent" };
const quiescent = () => (wraithData().shadowArchetypes ?? []).find(a => a.en === HUE.archetype)?.name ?? "";

export class WraithCreator {
  get isWraith() { return this.type === "wraith"; }
  /** Путь: «» — призрак, spectre, risen, projector, hue. */
  get wrPath() { return this.st?.wr?.path ?? ""; }
  get wrCaste() { return (wraithData().castes ?? []).find(c => c.key === this.st.wr.caste) ?? null; }
  get wrShade() { return (wraithData().shades ?? []).find(s => s.key === this.st.wr.shade) ?? null; }
  get wrNums() {
    const D = wraithData(), base = D.creation ?? { passions: 10, fetters: 10, darkPassions: 7, shadowFreebies: 10, shadowTrade: 7, arcanosMax: 3, pathosBase: 5, willpower: 5 };
    const p = this.wrPath, caste = this.wrCaste, shade = this.wrShade;
    if (p === "spectre") return { ...base, passions: caste?.darkPassions ?? D.spectre?.darkPassions ?? 10, fetters: caste?.fetters ? 10 : 0, pathosBase: D.spectre?.angstStart ?? 5,
      willpower: caste?.willpower ?? D.spectre?.willpower ?? 5, shadowTrade: D.spectre?.psycheTrade ?? 7, psyche: D.spectre?.psychePassions ?? 7 };
    if (p === "risen") return { ...base, pathosBase: D.risen?.pathos ?? 5, willpower: D.risen?.willpower ?? 6 };
    if (p === "hue") return { ...base, fetters: HUE.fetters, pathosBase: HUE.pathos, willpower: HUE.willpower, pathosMax: HUE.pathosMax };
    if (p === "projector") return { ...base, passions: D.projector?.passions ?? 5, fetters: D.projector?.tethers ?? 10,
      pathosBase: (D.projector?.pathos ?? 5) + (shade?.pathos ?? 0), willpower: (D.projector?.willpower ?? 5) + (shade?.willpower ?? 0) };
    return base;
  }
  /** Числа создания пути (calc.rules). */
  get wraithRules() {
    const b = this.baseRules, p = this.wrPath, D = wraithData();
    if (p === "spectre") return { ...b, bg: D.spectre?.backgrounds ?? 5, free: D.spectre?.freebies ?? 20, disc: this.wrCaste?.points ?? 5,
      cost: { ...b.cost, pas: 2, fet: 1, pathos: 1, will: 2, disc: 5 } };
    if (p === "risen") return { ...b, bg: D.risen?.backgrounds ?? 5, free: D.risen?.freebies ?? 15, disc: 5, cost: { ...b.cost, pas: 1, pathos: 1, rdisc: D.risen?.disciplineCost ?? 7 } };
    if (p === "hue") return { ...b, bg: HUE.backgrounds, free: HUE.freebies, disc: 5 };
    // проектор: Арканос Оттенка, Воплощение и Паутина жизни даны (по 1), на выбор — 2 (правило книги: «1 Оттенка + 1 + 1 + 2»)
    if (p === "projector") return { ...b, bg: D.projector?.backgrounds ?? 7, free: D.projector?.freebies ?? 18, disc: 2 };
    return b;
  }

  /** Арканос мастера: обычный, Тёмный (Спектр) или Восставших. */
  wraithArcanos(k) {
    const D = wraithData(), a = (D.arcanoi ?? []).find(x => x.key === k) ?? (D.darkArcanoi ?? []).find(x => x.key === k) ?? (D.risenArcanoi ?? []).find(x => x.key === k);
    return a ? { key: k, name: a.name, en: a.en, guild: a.guild ?? "", icon: a.icon,
      powers: a.levels.filter(l => !l.kind || l.kind === "common").map(l => ({ level: l.level, name: l.name, en: l.en, html: l.html })) } : null;
  }
  get wraithArcanoiKeys() {
    const D = wraithData(), all = (D.arcanoi ?? []).map(a => a.key), p = this.wrPath;
    if (p === "spectre") return [...(this.wrCaste?.arcanoi === "dark" ? [] : all), ...(D.darkArcanoi ?? []).map(a => a.key)];
    if (p === "risen") return [...all, ...(D.risenArcanoi ?? []).map(a => a.key)];
    return all;
  }
  /** Даром: Спектру — Сговор 1 и Тёмный Арканос касты; проектору — Арканос Оттенка, Воплощение и Паутина жизни по 1. */
  wraithDiscBase(k) {
    if (this.wrPath === "spectre") return k === "collogue" ? Math.max(1, this.wrCaste?.free?.[k] ?? 0) : this.wrCaste?.free?.[k] ?? 0;
    // Арканос Оттенка — первый Любимый из стигийских (Очарование Огонька — Арканос Восставших, его на листе проектора нет)
    if (this.wrPath === "projector") return ["embody", "lifeweb", (this.wrShade?.favored ?? []).find(x => VTM20.wraithArcanoi.includes(x))].includes(k) ? 1 : 0;
    return 0;
  }

  /* ── числа ── */
  get wraithMemoriam() { const n = (wraithData().backgrounds ?? []).find(b => b.en === "Memoriam")?.name; return n ? this.value("bg", n) : 0; }
  /** Пафос (у Спектра — Ангст): база пути + Мемориум (только призраку и Восставшему) + свободные (по 2, у Восставшего — по 1). */
  get wraithPathos() {
    const mem = ["", "risen"].includes(this.wrPath) ? this.wraithMemoriam : 0, per = this.wrPath === "risen" ? 1 : 2;
    return Math.min(this.wrNums.pathosMax ?? 10, (this.wrNums.pathosBase ?? 5) + mem + per * (this.st.free.pathos ?? 0));
  }
  passionValue(kind, i) {
    const list = kind === "pas" ? this.st.wr.passions : this.st.wr.fetters;
    return (Number(list[i]?.value) || 0) + (this.st.free[kind]?.[i] ?? 0);
  }
  get passionsLeft() { return this.wrNums.passions - sum(this.st.wr.passions); }
  get fettersLeft() { return this.wrNums.fetters - sum(this.st.wr.fetters); }
  /** Торг: призраку и Восставшему — с Тенью (+ взаймы у Тени, − урезать её пул); Спектру — только +, свободные за пул Психеи. */
  get wraithTrade() { return this.st.free.trade ?? 0; }
  get shadowPool() { return (this.wrNums.shadowFreebies ?? 10) + this.wraithTrade; }
  thornPrice(key, n) { const d = (wraithData().thorns ?? []).find(x => x.key === key); return d ? (d.perLevel ? d.cost * n : d.max ? n : d.cost) : 0; }
  get shadowSpent() {
    const w = this.st.wr, extraDark = Math.max(0, sum(w.dark) - (this.wrNums.darkPassions ?? 7));
    return extraDark * SHADOW_COST.dark + (w.angstTemp + w.angstExtra) * SHADOW_COST.angst
      + Object.entries(w.thorns).reduce((s, [k, n]) => s + this.thornPrice(k, n), 0);
  }
  get shadowLeft() { return this.shadowPool - this.shadowSpent; }
  get angstPerm() {
    if (this.wrPath === "projector") return Math.clamp((wraithData().projector?.angst ?? 5) + (this.wrShade?.angst ?? 0) + this.st.wr.angstExtra, 1, 10);
    return Math.min(this.willpower, Math.max(1, this.st.wr.angstRoll ?? 0) + this.st.wr.angstExtra);
  }
  /** Психея Спектра: очки — отданные ей свободные; рейтинг Пафоса 1 даром (правило системы), +1 за 5; Страсть — 1 за точку сверх 7. */
  get psychePool() { return Math.max(0, this.wraithTrade); }
  get psycheSpent() { const ps = this.st.wr.psyche; return (ps.rating - 1) * PSYCHE_COST.rating + Math.max(0, sum(ps.passions) - (this.wrNums.psyche ?? 7)) * PSYCHE_COST.passion; }
  get psycheLeft() { return this.psychePool - this.psycheSpent; }
  /** «Дисциплины» тела Восставшего — свободными по 7. */
  get risenDiscSpent() { return this.wrPath === "risen" ? RISEN_DISC.reduce((s, k) => s + (this.st.free.rdisc?.[k] ?? 0), 0) * (this.rules.cost.rdisc ?? 7) : 0; }

  /* ── проверки ── */
  get wraithIssues() {
    const out = [], p = this.wrPath;
    if (!this.st.wr.legion && p !== "spectre") out.push(loc("NeedLegion"));
    if (p === "spectre" && !this.st.wr.caste) out.push(loc("NeedCaste"));
    if (p === "projector" && !this.st.wr.shade) out.push(loc("NeedShade"));
    if (p === "risen") {
      if (this.value("attr", "strength") < 3) out.push(loc("RisenStrength"));
      if (this.value("attr", "appearance") > 3) out.push(loc("RisenAppearance"));
    }
    return out;
  }
  get passionIssues() {
    const out = [], w = this.st.wr;
    if (this.passionsLeft) out.push(fmt(this.passionsLeft > 0 ? "PassionsLeft" : "PassionsOver", { n: Math.abs(this.passionsLeft) }));
    if (this.wrNums.fetters && this.fettersLeft) out.push(fmt(this.fettersLeft > 0 ? "FettersLeft" : "FettersOver", { n: Math.abs(this.fettersLeft) }));
    if ([...w.passions, ...w.fetters].some(x => (x.value ?? 0) > 0 && !String(x.text ?? "").trim())) out.push(loc("NeedText"));
    if (this.wrPath === "projector" && this.passionValue("fet", 0) < (wraithData().projector?.bodyTether ?? 5)) out.push(loc("BodyTether"));
    if (this.wrPath === "risen" && !String(w.conduit ?? "").trim()) out.push(loc("NeedConduit"));
    if (this.wrPath === "hue" && !((w.hueDark ?? -1) >= 0 && this.passionValue("pas", w.hueDark) > 0)) out.push(loc("HueDark"));
    return out;
  }
  get arcanoiIssues() {
    const max = this.wrNums.arcanosMax ?? 3, out = [];
    if (this.wraithArcanoiKeys.some(k => this.value("disc", k) > max)) out.push(fmt("ArcanosMax", { n: max }));
    if (this.wrPath === "risen") {
      if (this.value("disc", "puppetry") < 1) out.push(loc("RisenPuppetry"));
      if (["lifeweb", "inhabit", "embody"].reduce((s, k) => s + this.value("disc", k), 0) < 2) out.push(loc("RisenTriad"));
    }
    return out;
  }
  get shadowIssues() {
    const out = [], w = this.st.wr, p = this.wrPath;
    if (p === "spectre") {
      const ps = w.psyche;
      if (!ps.archetype) out.push(loc("NeedPsycheArchetype"));
      if (sum(ps.passions) < (this.wrNums.psyche ?? 7)) out.push(fmt("PsycheLeft", { n: (this.wrNums.psyche ?? 7) - sum(ps.passions) }));
      if (ps.rating > this.willpower) out.push(loc("PsycheOverWill"));
      if (this.psycheLeft < 0) out.push(fmt("ShadowOver", { n: -this.psycheLeft }));
      return out;
    }
    if (p === "projector") {
      const n = Math.floor(this.angstPerm / 2);
      if (w.stains.length !== n) out.push(fmt("StainsNeed", { n }));
      return out;
    }
    if (!w.angstRoll) out.push(loc("NeedAngstRoll"));
    if (p === "hue") {   // Тихая Тень: архетип дан, Тёмные Страсти — зеркало Страстей; Пятна — 3
      if (w.stains.length !== HUE.stains) out.push(fmt("StainsNeed", { n: HUE.stains }));
      if (this.shadowLeft) out.push(fmt(this.shadowLeft > 0 ? "ShadowLeft" : "ShadowOver", { n: Math.abs(this.shadowLeft) }));
      if (w.angstTemp > 9) out.push(loc("AngstTempMax"));
      return out;
    }
    const dark = sum(w.dark);
    if (dark < (this.wrNums.darkPassions ?? 7)) out.push(fmt("DarkLeft", { n: (this.wrNums.darkPassions ?? 7) - dark }));
    const pas = this.st.wr.passions.reduce((s, x, i) => s + this.passionValue("pas", i), 0);
    if (dark > pas) out.push(fmt("DarkOverPassions", { n: pas }));
    if (this.shadowLeft) out.push(fmt(this.shadowLeft > 0 ? "ShadowLeft" : "ShadowOver", { n: Math.abs(this.shadowLeft) }));
    if (w.angstTemp > 9) out.push(loc("AngstTempMax"));
    if (!w.archetype) out.push(loc("NeedArchetype"));
    return out;
  }
  get wraithAllIssues() { return [...this.wraithIssues, ...this.arcanoiIssues, ...this.passionIssues, ...this.shadowIssues]; }

  /* ── шаблон ── */
  wraithPatent(ctx) {
    const D = wraithData(), w = this.st.wr, p = this.wrPath;
    const legion = (D.legions ?? []).find(l => l.key === w.legion), guild = (D.arcanoi ?? []).find(a => a.key === w.guild);
    Object.assign(ctx.patent, { clan: p === "spectre" ? this.wrCaste?.name ?? "" : p === "projector" ? this.wrShade?.name ?? "" : legion?.name ?? "",
      sect: p === "spectre" ? game.i18n.localize("VTM20.Wraith.Spectre.Title") : p === "risen" ? game.i18n.localize("VTM20.Wraith.Risen.Title")
        : p === "hue" ? loc("Path.hue")
        : p === "projector" ? game.i18n.localize("VTM20.Wraith.Proj.Title") : guild?.guild ?? "",
      sectSym: null, sym: legionSym(w.legion), pathName: p === "spectre" ? game.i18n.localize("VTM20.Wraith.Spectre.Angst") : loc("Pathos"), morality: this.wraithPathos });
  }

  wraithContext(ctx) {
    const D = wraithData(), w = this.st.wr, p = this.wrPath;
    ctx.isWraith = true;
    const rows = (list, kind) => list.map((x, i) => ({ i, text: x.text, emotion: x.emotion ?? "", value: this.passionValue(kind, i), alloc: Number(x.value) || 0,
      dots: Array.from({ length: 5 }, (_, j) => ({ n: j + 1, state: j < (Number(x.value) || 0) ? "alloc" : j < this.passionValue(kind, i) ? "free" : "empty" })) }));
    const plain = (list, field) => list.map((x, i) => ({ ...x, i, dots: Array.from({ length: 5 }, (_, j) => ({ n: j + 1, state: j < (Number(x.value) || 0) ? "alloc" : "empty" })) }));
    ctx.wraith = {
      path: p, isSpectre: p === "spectre", isRisen: p === "risen", isProjector: p === "projector", isHue: p === "hue", noGuild: p === "spectre" || p === "hue",
      paths: ["", "spectre", "risen", "projector", "hue"].map(k => ({ key: k, label: loc(`PathShort.${k || "wraith"}`), full: loc(`Path.${k || "wraith"}`), sub: loc(`PathSub.${k || "wraith"}`),
        icon: { "": "fa-ghost", spectre: "fa-skull", risen: "fa-person-rays", projector: "fa-person-falling-burst", hue: "fa-droplet" }[k], active: k === p })),
      hueDark: w.hueDark ?? -1, quiescent: quiescent(), hueStains: HUE.stains,
      castes: (D.castes ?? []).map(c => ({ key: c.key, label: c.name, en: c.en, sub: String(c.creation ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160), active: c.key === w.caste })),
      shades: (D.shades ?? []).map(s => ({ key: s.key, label: s.name, en: s.en, active: s.key === w.shade,
        sub: `${(s.favored ?? []).map(k => (D.arcanoi ?? []).find(a => a.key === k)?.name ?? (D.risenArcanoi ?? []).find(a => a.key === k)?.name ?? k).join(", ")} · ${s.natures}` })),
      laments: ["skimmer", "sleeper"].map(k => ({ key: k, label: game.i18n.localize(`VTM20.Wraith.Proj.${k === "skimmer" ? "Skimmer" : "Sleeper"}`), active: (w.lament || "skimmer") === k })),
      legions: (D.legions ?? []).map(l => ({ key: l.key, sym: legionSym(l.key), label: l.name, en: l.en, sub: l.death, tip: `${l.lord} · ${l.seat}`, active: l.key === w.legion })),
      guilds: ["high", "working", "criminal", "forbidden"].map(g => ({ label: game.i18n.localize(`VTM20.Wraith.GuildGroup.${g}`),
        list: (D.arcanoi ?? []).filter(a => a.group === g).map(a => ({ key: a.key, sym: arcSym(a.key), label: a.guild, sub: a.name, icon: a.icon, active: a.key === w.guild })) })),
      factions: (D.factions ?? []).map(f => ({ key: f.key, label: f.name, active: f.key === w.faction })),
      issues: this.wraithIssues, pathos: this.wraithPathos, will: this.willpower, memoriam: this.wraithMemoriam,
      passions: rows(w.passions, "pas"), fetters: rows(w.fetters, "fet"), dark: plain(w.dark),
      hasFetters: !!this.wrNums.fetters, conduit: w.conduit ?? "",
      passionsLeft: this.passionsLeft, fettersLeft: this.fettersLeft, passionIssues: this.passionIssues,
      archetypes: (D.shadowArchetypes ?? []).map(a => ({ key: a.name, label: a.name, en: a.en, text: a.text, catharsis: a.catharsis, active: a.name === w.archetype })),
      angstRoll: w.angstRoll, angstDice: w.angstDice ?? "", angstPerm: this.angstPerm, angstTemp: w.angstTemp, angstExtra: w.angstExtra,
      darkSum: sum(w.dark), darkBase: this.wrNums.darkPassions ?? 7,
      shadowPool: this.shadowPool, shadowSpent: this.shadowSpent, shadowLeft: this.shadowLeft, shadowIssues: this.shadowIssues, trade: this.wraithTrade,
      thorns: (D.thorns ?? []).map(x => {
        const n = w.thorns[x.key] ?? 0, multi = x.perLevel || !!x.max;
        return { key: x.key, label: x.name, en: x.en, costText: x.costText, n, on: n > 0, multi, max: x.max ?? 5, price: this.thornPrice(x.key, Math.max(1, n)),
          text: String(x.html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 260) };
      }),
      // Спектр: Психея
      psyche: { archetypes: (D.psyche?.archetypes ?? []).map(a => ({ key: a.name, label: a.name, en: a.en, active: a.name === w.psyche.archetype })),
        rating: w.psyche.rating, passions: plain(w.psyche.passions), sum: sum(w.psyche.passions), base: this.wrNums.psyche ?? 7,
        pool: this.psychePool, spent: this.psycheSpent, left: this.psycheLeft },
      // проектор: Пятна
      stains: (D.stains ?? []).map(s => ({ key: s.key, label: s.name, en: s.en, adv: s.adv, dis: s.dis, on: w.stains.includes(s.key) })),
      stainsNeed: p === "hue" ? HUE.stains : Math.floor(this.angstPerm / 2)
    };
    ctx.wraith.arcanosMax = this.wrNums.arcanosMax ?? 3;
  }

  /** Запись в system.wraith (creator/write.mjs). */
  wraithWrite(old = {}) {
    const w = this.st.wr, p = this.wrPath, D = wraithData();
    const keep = list => list.filter(x => String(x.text ?? "").trim() || (x.value ?? 0) > 0);
    const arc = (D.arcanoi ?? []).map(a => a.key);
    const out = { ...old, legion: w.legion, guild: p === "spectre" || p === "hue" ? "" : w.guild, faction: w.faction, death: w.death, pathos: { value: p === "spectre" ? 0 : this.wraithPathos },
      corpus: 10, state: "corporeal",
      arcanoi: Object.fromEntries(arc.map(k => [k, { value: this.value("disc", k), initiate: [], skip: [] }])),
      passions: keep(w.passions.map((x, i) => ({ text: x.text, emotion: x.emotion ?? "", value: this.passionValue("pas", i) }))),
      fetters: this.wrNums.fetters ? keep(w.fetters.map((x, i) => ({ text: x.text, value: this.passionValue("fet", i), resolved: false }))) : [],
      shadow: { archetype: p === "hue" ? quiescent() : p ? (p === "risen" ? w.archetype : "") : w.archetype, guide: "", catharsis: false,
        angst: { permanent: p === "spectre" ? 0 : this.angstPerm, temporary: p === "projector" || p === "spectre" ? 0 : w.angstTemp },
        // Тихая Тень Оттенка: Тёмные Страсти — зеркало его Страстей
        darkPassions: p === "spectre" || p === "projector" ? [] : p === "hue" ? keep(w.passions.map((x, i) => ({ text: x.text, emotion: x.emotion ?? "", value: this.passionValue("pas", i) })))
          : keep(w.dark.map(x => ({ text: x.text, emotion: x.emotion ?? "", value: Number(x.value) || 0 }))),
        thorns: p === "spectre" || p === "projector" ? [] : Object.entries(w.thorns).filter(([, n]) => n > 0).map(([key, n]) => ({ key, n, note: "" })) },
      session: { memoriam: false, eidolon: 0 } };
    if (p === "spectre") out.spectre = { on: true, caste: w.caste, angst: this.wraithPathos,
      dark: Object.fromEntries((D.darkArcanoi ?? []).map(a => [a.key, this.value("disc", a.key)])), shadecraft: [],
      psyche: { archetype: w.psyche.archetype, guide: "", rating: w.psyche.rating, pool: w.psyche.rating, catharsis: false,
        passions: keep(w.psyche.passions.map(x => ({ text: x.text, emotion: x.emotion ?? "", value: Number(x.value) || 0 }))), fronds: [] } };
    if (p === "risen") out.risen = { on: true, body: false, conduit: w.conduit ?? "",
      arcanoi: Object.fromEntries((D.risenArcanoi ?? []).map(a => [a.key, this.value("disc", a.key)])),
      disc: Object.fromEntries(RISEN_DISC.map(k => [k, this.st.free.rdisc?.[k] ?? 0])) };
    if (p === "projector") out.projector = { on: true, shade: w.shade, lament: w.lament || "skimmer", projecting: false, emblem: false,
      stains: w.stains.map(key => ({ key, shown: false })) };
    if (p === "hue") Object.assign(out, { hue: true, projector: { on: false, shade: "", lament: "", projecting: false, emblem: false,
      stains: w.stains.map(key => ({ key, shown: false })) } });
    return out;
  }
}

/* ── кнопки мастера (this — мастер) ── */
function onWrPick(event, target) {
  const { what, key } = target.dataset, w = this.st.wr;
  if (what === "archetype") w.archetype = w.archetype === key ? "" : key;
  else if (what === "psycheArch") w.psyche.archetype = w.psyche.archetype === key ? "" : key;
  else if (what === "path") { w.path = key; this.st.free.trade = 0; this.st.disc = {}; if (key === "hue") w.guild = ""; }
  else if (what === "hueDark") w.hueDark = w.hueDark === Number(key) ? -1 : Number(key);
  else if (what === "stain") { const i = w.stains.indexOf(key); if (i >= 0) w.stains.splice(i, 1); else w.stains.push(key); }
  else w[what] = w[what] === key && !["legion", "caste", "shade", "lament"].includes(what) ? "" : key;
  this.render();
}
/** Строка Страсти, Оков, Тёмной Страсти или Страсти Психеи: добавить, убрать, точки создания. */
function onWrRow(event, target) {
  const { list, op } = target.dataset, i = Number(target.dataset.i), w = this.st.wr;
  const arr = list === "psyche" ? w.psyche.passions : w[list];
  if (op === "add") arr.push(list === "fetters" ? { text: "", value: 0 } : { text: "", emotion: "", value: 0 });
  else if (op === "del") {
    arr.splice(i, 1);
    if (list === "passions" && (w.hueDark ?? -1) >= 0) w.hueDark = w.hueDark === i ? -1 : w.hueDark > i ? w.hueDark - 1 : w.hueDark;
    const bag = list === "passions" ? "pas" : list === "fetters" ? "fet" : null;
    if (bag) this.st.free[bag] = Object.fromEntries(Object.entries(this.st.free[bag] ?? {}).filter(([k]) => Number(k) !== i)
      .map(([k, v]) => [Number(k) > i ? Number(k) - 1 : Number(k), v]));
  } else if (op === "dot") {
    const n = Number(target.dataset.n), cur = Number(arr[i]?.value) || 0;
    if (arr[i]) arr[i].value = n === cur ? n - 1 : n;
  }
  this.render();
}
/** Постоянный Ангст (гл. 6): кубиков — Воля, сл. 6, единицы успехов не отменяют; минимум 1, не выше Воли. */
async function onWrAngstRoll() {
  const n = this.willpower, r = await new Roll(`${n}d10`).evaluate(), vals = r.dice[0].results.map(x => x.result);
  const hits = vals.filter(v => v >= 6).length;
  Object.assign(this.st.wr, { angstRoll: Math.min(n, Math.max(1, hits)), angstDice: vals.join(", ") });
  r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: fmt("AngstRolled", { n: this.st.wr.angstRoll }) }, { messageMode: "gm" });
  this.render();
}
/** Свободные очки Тени: Ангст (временный, постоянный сверх броска), Шипы; у Спектра — рейтинг Пафоса Психеи. */
function onWrShadow(event, target) {
  const { what, key } = target.dataset, d = event.button === 2 || target.dataset.d === "-1" ? -1 : 1, w = this.st.wr;
  if (what === "angstTemp") w.angstTemp = Math.clamp(w.angstTemp + d, 0, 9);
  else if (what === "angstExtra") { if (d > 0 && this.wrPath !== "projector" && this.angstPerm >= this.willpower) return ui.notifications.warn(loc("AngstOverWill")); w.angstExtra = Math.max(0, w.angstExtra + d); }
  else if (what === "psycheRating") { if (d > 0 && w.psyche.rating >= this.willpower) return ui.notifications.warn(loc("PsycheOverWill")); w.psyche.rating = Math.clamp(w.psyche.rating + d, 1, 10); }
  else if (what === "thorn") {
    const t = (wraithData().thorns ?? []).find(x => x.key === key), max = t?.max ?? (t?.perLevel ? 5 : 1);
    w.thorns[key] = Math.clamp((w.thorns[key] ?? 0) + d, 0, max);
    if (!w.thorns[key]) delete w.thorns[key];
  }
  this.render();
}
export const WRAITH_CR_ACTIONS = { wrPick: onWrPick, wrRow: onWrRow, wrAngstRoll: onWrAngstRoll, wrShadow: { handler: onWrShadow, buttons: [0, 2] } };
export { RISEN_DISC };
