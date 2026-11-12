// module/apps/creator/wraith.mjs
// Мастер создания: призрак (Wraith 20, гл. 4 — создание персонажа, гл. 6 — создание Тени).
// Арканои — на слоте Дисциплин (5 точек, не больше 3 в одном), Фоны 7, Страсти 10 и Оковы 10 — свой шаг,
// Пафос 5 + Мемориум, Воля 5, Корпус 10; 15 свободных: Атрибут 5, Арканос 5, Воля 2, Способность 2, Страсть 2, Фон 1, Оковы 1,
// Пафос 1 за 2 точки; торг с Тенью — до 7 свободных у Тени взаймы (или своими очками урезать её пул 1:1).
// Тень: архетип, постоянный Ангст — бросок Воли (сл. 6, единицы не отменяют успехов, минимум 1, не выше Воли), Тёмные Страсти 7,
// 10 свободных Тени. Цены свободных Тени в книге не названы — по примеру из книги: Тёмная Страсть 1 за точку, Ангст 2 за точку
// (правило системы); Шипы — по своей цене.

import { W as wraithData, arcSym, legionSym } from "../wraith.mjs";

const loc = k => game.i18n.localize(`VTM20.WraithCr.${k}`);
const fmt = (k, d) => game.i18n.format(`VTM20.WraithCr.${k}`, d);
export const SHADOW_COST = { dark: 1, angst: 2 };
const sum = list => list.reduce((s, x) => s + (Number(x?.value) || 0), 0);

export class WraithCreator {
  get isWraith() { return this.type === "wraith"; }
  get wrNums() { return wraithData().creation ?? { passions: 10, fetters: 10, darkPassions: 7, shadowFreebies: 10, shadowTrade: 7, arcanosMax: 3, pathosBase: 5, willpower: 5 }; }

  /** Арканос как «Дисциплина» мастера: имя, Гильдия и Общие уровни по рангам. */
  wraithArcanos(k) {
    const a = (wraithData().arcanoi ?? []).find(x => x.key === k);
    return a ? { key: k, name: a.name, en: a.en, guild: a.guild, icon: a.icon,
      powers: a.levels.filter(l => l.kind === "common").map(l => ({ level: l.level, name: l.name, en: l.en, html: l.html })) } : null;
  }
  get wraithArcanoiKeys() { return (wraithData().arcanoi ?? []).map(a => a.key); }

  /* ── числа ── */
  /** Мемориум — по Фону (для стартового Пафоса). */
  get wraithMemoriam() { const n = (wraithData().backgrounds ?? []).find(b => b.en === "Memoriam")?.name; return n ? this.value("bg", n) : 0; }
  get wraithPathos() { return Math.min(10, (this.wrNums.pathosBase ?? 5) + this.wraithMemoriam + 2 * (this.st.free.pathos ?? 0)); }
  passionValue(kind, i) {
    const list = kind === "pas" ? this.st.wr.passions : this.st.wr.fetters;
    return (Number(list[i]?.value) || 0) + (this.st.free[kind]?.[i] ?? 0);
  }
  get passionsLeft() { return this.wrNums.passions - sum(this.st.wr.passions); }
  get fettersLeft() { return this.wrNums.fetters - sum(this.st.wr.fetters); }
  /** Торг с Тенью: + — свободные взаймы у Тени (до 7), − — свои очки на урезание её пула. */
  get wraithTrade() { return this.st.free.trade ?? 0; }
  get shadowPool() { return (this.wrNums.shadowFreebies ?? 10) + this.wraithTrade; }
  thornPrice(key, n) { const d = (wraithData().thorns ?? []).find(x => x.key === key); return d ? (d.perLevel ? d.cost * n : d.max ? n : d.cost) : 0; }
  get shadowSpent() {
    const w = this.st.wr, extraDark = Math.max(0, sum(w.dark) - (this.wrNums.darkPassions ?? 7));
    return extraDark * SHADOW_COST.dark + (w.angstTemp + w.angstExtra) * SHADOW_COST.angst
      + Object.entries(w.thorns).reduce((s, [k, n]) => s + this.thornPrice(k, n), 0);
  }
  get shadowLeft() { return this.shadowPool - this.shadowSpent; }
  get angstPerm() { return Math.min(this.willpower, Math.max(1, this.st.wr.angstRoll ?? 0) + this.st.wr.angstExtra); }

  /* ── проверки ── */
  get wraithIssues() { return this.st.wr.legion ? [] : [loc("NeedLegion")]; }
  get passionIssues() {
    const out = [], w = this.st.wr;
    if (this.passionsLeft) out.push(fmt(this.passionsLeft > 0 ? "PassionsLeft" : "PassionsOver", { n: Math.abs(this.passionsLeft) }));
    if (this.fettersLeft) out.push(fmt(this.fettersLeft > 0 ? "FettersLeft" : "FettersOver", { n: Math.abs(this.fettersLeft) }));
    if ([...w.passions, ...w.fetters].some(x => (x.value ?? 0) > 0 && !String(x.text ?? "").trim())) out.push(loc("NeedText"));
    return out;
  }
  get arcanoiIssues() {
    return this.wraithArcanoiKeys.some(k => (this.st.disc[k] ?? 0) > (this.wrNums.arcanosMax ?? 3)) ? [fmt("ArcanosMax", { n: this.wrNums.arcanosMax ?? 3 })] : [];
  }
  get shadowIssues() {
    const out = [], w = this.st.wr;
    if (!w.angstRoll) out.push(loc("NeedAngstRoll"));
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
    const D = wraithData(), w = this.st.wr;
    const legion = (D.legions ?? []).find(l => l.key === w.legion), guild = (D.arcanoi ?? []).find(a => a.key === w.guild);
    Object.assign(ctx.patent, { clan: legion?.name ?? "", sect: guild?.guild ?? "", sectSym: null, sym: legionSym(w.legion), pathName: loc("Pathos"), morality: this.wraithPathos });
  }

  wraithContext(ctx, key) {
    const D = wraithData(), w = this.st.wr;
    ctx.isWraith = true;
    const rows = (list, kind) => list.map((x, i) => ({ i, text: x.text, emotion: x.emotion ?? "", value: this.passionValue(kind, i), alloc: Number(x.value) || 0,
      dots: Array.from({ length: 5 }, (_, j) => ({ n: j + 1, state: j < (Number(x.value) || 0) ? "alloc" : j < this.passionValue(kind, i) ? "free" : "empty" })) }));
    ctx.wraith = {
      legions: (D.legions ?? []).map(l => ({ key: l.key, sym: legionSym(l.key), label: l.name, en: l.en, sub: l.death, tip: `${l.lord} · ${l.seat}`, active: l.key === w.legion })),
      guilds: ["high", "working", "criminal", "forbidden"].map(g => ({ label: game.i18n.localize(`VTM20.Wraith.GuildGroup.${g}`),
        list: (D.arcanoi ?? []).filter(a => a.group === g).map(a => ({ key: a.key, sym: arcSym(a.key), label: a.guild, sub: a.name, icon: a.icon, active: a.key === w.guild })) })),
      factions: (D.factions ?? []).map(f => ({ key: f.key, label: f.name, active: f.key === w.faction })),
      issues: this.wraithIssues, pathos: this.wraithPathos, will: this.willpower, memoriam: this.wraithMemoriam,
      passions: rows(w.passions, "pas"), fetters: rows(w.fetters, "fet"), dark: w.dark.map((x, i) => ({ ...x, i,
        dots: Array.from({ length: 5 }, (_, j) => ({ n: j + 1, state: j < (Number(x.value) || 0) ? "alloc" : "empty" })) })),
      passionsLeft: this.passionsLeft, fettersLeft: this.fettersLeft, passionIssues: this.passionIssues,
      archetypes: (D.shadowArchetypes ?? []).map(a => ({ key: a.name, label: a.name, en: a.en, text: a.text, catharsis: a.catharsis, active: a.name === w.archetype })),
      angstRoll: w.angstRoll, angstDice: w.angstDice ?? "", angstPerm: this.angstPerm, angstTemp: w.angstTemp, angstExtra: w.angstExtra,
      darkSum: sum(w.dark), darkBase: this.wrNums.darkPassions ?? 7,
      shadowPool: this.shadowPool, shadowSpent: this.shadowSpent, shadowLeft: this.shadowLeft, shadowIssues: this.shadowIssues, trade: this.wraithTrade,
      thorns: (D.thorns ?? []).map(x => {
        const n = w.thorns[x.key] ?? 0, multi = x.perLevel || !!x.max;
        return { key: x.key, label: x.name, en: x.en, costText: x.costText, n, on: n > 0, multi, max: x.max ?? 5, price: this.thornPrice(x.key, Math.max(1, n)),
          text: String(x.html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 260) };
      })
    };
    ctx.wraith.arcanosMax = this.wrNums.arcanosMax ?? 3;
  }

  /** Запись в system.wraith (creator/write.mjs). */
  wraithWrite(old = {}) {
    const w = this.st.wr;
    const keep = list => list.filter(x => String(x.text ?? "").trim() || (x.value ?? 0) > 0);
    return { ...old, legion: w.legion, guild: w.guild, faction: w.faction, death: w.death, pathos: { value: this.wraithPathos }, corpus: 10, state: "corporeal",
      arcanoi: Object.fromEntries(this.wraithArcanoiKeys.map(k => [k, { value: this.value("disc", k), initiate: [], skip: [] }])),
      passions: keep(w.passions.map((x, i) => ({ text: x.text, emotion: x.emotion ?? "", value: this.passionValue("pas", i) }))),
      fetters: keep(w.fetters.map((x, i) => ({ text: x.text, value: this.passionValue("fet", i), resolved: false }))),
      shadow: { archetype: w.archetype, guide: "", catharsis: false,
        angst: { permanent: this.angstPerm, temporary: w.angstTemp },
        darkPassions: keep(w.dark.map(x => ({ text: x.text, emotion: x.emotion ?? "", value: Number(x.value) || 0 }))),
        thorns: Object.entries(w.thorns).filter(([, n]) => n > 0).map(([key, n]) => ({ key, n, note: "" })) },
      session: { memoriam: false, eidolon: 0 } };
  }
}

/* ── кнопки мастера (this — мастер) ── */
function onWrPick(event, target) {
  const { what, key } = target.dataset, w = this.st.wr;
  if (what === "archetype") w.archetype = w.archetype === key ? "" : key;
  else w[what] = w[what] === key && what !== "legion" ? "" : key;
  this.render();
}
/** Строка Страсти, Оков или Тёмной Страсти: добавить, убрать, точки создания. */
function onWrRow(event, target) {
  const { list, op } = target.dataset, i = Number(target.dataset.i), w = this.st.wr;
  const arr = w[list];
  if (op === "add") arr.push(list === "fetters" ? { text: "", value: 0 } : { text: "", emotion: "", value: 0 });
  else if (op === "del") {
    arr.splice(i, 1);
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
/** Свободные очки Тени: Ангст (временный, постоянный сверх броска) и Шипы. */
function onWrShadow(event, target) {
  const { what, key } = target.dataset, d = event.button === 2 || target.dataset.d === "-1" ? -1 : 1, w = this.st.wr;
  if (what === "angstTemp") w.angstTemp = Math.clamp(w.angstTemp + d, 0, 9);
  else if (what === "angstExtra") { if (d > 0 && this.angstPerm >= this.willpower) return ui.notifications.warn(loc("AngstOverWill")); w.angstExtra = Math.max(0, w.angstExtra + d); }
  else if (what === "thorn") {
    const t = (wraithData().thorns ?? []).find(x => x.key === key), max = t?.max ?? (t?.perLevel ? 5 : 1);
    w.thorns[key] = Math.clamp((w.thorns[key] ?? 0) + d, 0, max);
    if (!w.thorns[key]) delete w.thorns[key];
  }
  this.render();
}
export const WRAITH_CR_ACTIONS = { wrPick: onWrPick, wrRow: onWrRow, wrAngstRoll: onWrAngstRoll, wrShadow: { handler: onWrShadow, buttons: [0, 2] } };
