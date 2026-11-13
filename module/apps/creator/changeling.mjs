// module/apps/creator/changeling.mjs
// Мастер создания: подменыш (C20, гл. 3 «Character Creation»). Шаг «Грёза» — кит, ступень, двор, Дом, Наследия, Порог и Антитеза;
// Искусства (3) и Царства (5) — на слоте Дисциплин одним шагом с раздельной проверкой; Гламур — на слоте морали;
// Воля 4, Гламур 4, Банальность 3 и поправки ступени (дитя +1 Гламур, дикарь +1 Гламур или Воля, ворчун +1 Воля).
// Свободные: Атрибут 5, Способность 2, Искусство 5, Царство 2, Фон 1, Гламур 3, Воля 1; Банальность не покупается.

import { VTM20 } from "../../config.mjs";
import { C as clData, CHANGELING_SIGIL, kithGlyph, clGlyph } from "../changeling.mjs";
import { SHAPE_BONUS, LYKEIAN_COST } from "../lykeian.mjs";
import { plain } from "./rules.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

export class ChangelingCreator {
  get isChangeling() { return this.type === "changeling"; }
  /** Ликиец (C20 Players Guide, гл. 7): Облик и Форма вместо кита и ступени, Реды вместо Искусств и Царств. */
  get isLykeian() { return this.isChangeling && this.st?.cl?.variant === "lykeian"; }
  get lyRedePts() { return (this.st.cl.redes ?? []).reduce((s, r) => s + (Number(r.pts) || 0), 0); }
  /** Реды в шаге «Реды»: выбранные с ценой, доступные, очки против 5 (сверх — по 2 свободных за очко). */
  get lyRedesView() {
    const all = clData().redes ?? [], mine = this.st.cl.redes ?? [];
    return { list: mine.map((r, i) => ({ i, ...r, name: all.find(x => x.key === r.key)?.name ?? r.key, text: all.find(x => x.key === r.key)?.text ?? "" })),
      avail: all.filter(r => !mine.some(x => x.key === r.key)).map(r => ({ key: r.key, label: `${r.name} (${r.cost})` })),
      pts: this.lyRedePts, budget: LYKEIAN_COST.redes, extra: Math.max(0, this.lyRedePts - LYKEIAN_COST.redes) * LYKEIAN_COST.rede };
  }
  get clCreation() { return clData().creation ?? {}; }
  get clKith() { return (clData().kiths ?? []).find(k => k.key === this.st.cl.kith) ?? null; }
  get clSeeming() { return (clData().seemings ?? []).find(k => k.key === this.st.cl.seeming) ?? null; }
  isArt(k) { return VTM20.changelingArts.includes(k); }
  isRealm(k) { return VTM20.changelingRealms.includes(k); }

  /** Искусство или Царство как «Дисциплина» мастера: имя и уровни вместо сил. */
  clTrait(k) {
    const D = clData(), x = this.isArt(k) ? (D.arts ?? []).find(a => a.key === k) : (D.realms ?? []).find(r => r.key === k);
    return x ? { key: k, name: x.name, en: x.en, powers: (x.levels ?? []).map(l => ({ level: l.level, name: l.name, en: l.en ?? "", html: l.html ?? "" })) } : null;
  }

  /** Поправки ступени: дитя +1 Гламур, дикарь — +1 к выбранному, ворчун +1 Воля. */
  clSeemingBonus(what) {
    if (this.isLykeian) {
      const b = SHAPE_BONUS[this.st.cl.shape];
      if (!b) return 0;
      return b.choice ? (this.st.cl.wilder === what ? 1 : 0) : Number(b[what]) || 0;
    }
    const s = this.clSeeming;
    if (!s) return 0;
    if (s.choice) return this.st.cl.wilder === what ? 1 : 0;
    return Number(s[what]) || 0;
  }
  get clGlamourBase() { return (this.clCreation.glamour ?? 4) + this.clSeemingBonus("glamour"); }
  get clWillBase() { return (this.clCreation.willpower ?? 4) + this.clSeemingBonus("willpower"); }
  get clBanality() { return this.clCreation.banality ?? 3; }

  /** Точки создания по Искусствам и Царствам (без свободных и опыта). */
  get clArtDots() { return Object.entries(this.st.disc).filter(([k]) => this.isArt(k)).reduce((s, [, v]) => s + (v || 0), 0); }
  get clRealmDots() { return Object.entries(this.st.disc).filter(([k]) => this.isRealm(k)).reduce((s, [, v]) => s + (v || 0), 0); }
  /** Свободные пункты на Искусства (5) и Царства (2). */
  get clDiscFreeCost() {
    if (this.isLykeian) return Math.max(0, this.lyRedePts - LYKEIAN_COST.redes) * LYKEIAN_COST.rede;
    const f = this.st.free.disc, cost = clData().freebies ?? {};
    return Object.entries(f).reduce((s, [k, v]) => s + (v || 0) * (this.isArt(k) ? cost.art ?? 5 : cost.realm ?? 2), 0);
  }

  get clIssues() {
    const c = this.st.cl, out = [];
    if (this.isLykeian) {
      if (!c.guise) out.push(t("LyCr.NeedGuise"));
      if (!c.shape) out.push(t("LyCr.NeedShape"));
      if (c.shape === "animal" && !c.wilder) out.push(t("ClCr.NeedWilder"));
      if (!(c.court === "unseelie" ? c.legacyUnseelie : c.legacySeelie)) out.push(t("LyCr.NeedLegacy"));
      if (!c.nightmareLegacy) out.push(t("LyCr.NeedNightmare"));
      if (!c.thesis?.trim()) out.push(t("LyCr.NeedThesis"));
      return out;
    }
    if (!c.kith) out.push(t("ClCr.NeedKith"));
    if (!c.seeming) out.push(t("ClCr.NeedSeeming"));
    if (this.clSeeming?.choice && !c.wilder) out.push(t("ClCr.NeedWilder"));
    if (!c.legacySeelie || !c.legacyUnseelie) out.push(t("ClCr.NeedLegacies"));
    return out;
  }
  /** Искусств ровно 3 точки, Царств — 5 (гл. 3). */
  get clArtIssues() {
    if (this.isLykeian) { const left = LYKEIAN_COST.redes - this.lyRedePts; return left > 0 ? [t("LyCr.RedesLeft", { n: left })] : []; }
    const out = [], a = (this.clCreation.arts ?? 3) - this.clArtDots, r = (this.clCreation.realms ?? 5) - this.clRealmDots;
    if (a) out.push(t(a > 0 ? "ClCr.ArtsLeft" : "ClCr.ArtsOver", { n: Math.abs(a) }));
    if (r) out.push(t(r > 0 ? "ClCr.RealmsLeft" : "ClCr.RealmsOver", { n: Math.abs(r) }));
    return out;
  }

  /** Цена опыта (гл. 3): Искусство новое 7, далее × 4; Царство новое 5, далее × 3; Гламур × 3; Воля × 2. */
  clXp(kind, k, c) {
    if (kind === "attr") return c * 4;
    if (kind === "abil") return c === 0 ? 3 : c * 2;
    if (kind === "disc") return this.isArt(k) ? (c === 0 ? 7 : c * 4) : (c === 0 ? 5 : c * 3);
    if (kind === "morality") return c * 3;
    if (kind === "will") return c * 2;
    return 0;
  }

  /** Патент: кит, ступень и двор, знак подменыша. */
  clPatent(ctx) {
    const c = this.st.cl;
    if (this.isLykeian) {
      const L = clData().lykeian ?? {}, g = (L.guises ?? []).find(x => x.key === c.guise), s = (L.shapes ?? []).find(x => x.key === c.shape);
      return Object.assign(ctx.patent, { clan: g?.name ?? t("Lykeian.Variant.lykeian"), sectSym: clGlyph("court", c.court), sym: clGlyph("guise", c.guise) ?? { src: foundry.utils.getRoute(CHANGELING_SIGIL) },
        sect: [s?.name, c.court ? t(`Changeling.Court.${c.court}`) : ""].filter(Boolean).join(" · ") });
    }
    Object.assign(ctx.patent, { clan: this.clKith?.name ?? "", sectSym: clGlyph("court", c.court), sym: kithGlyph(c.kith) ?? { src: foundry.utils.getRoute(CHANGELING_SIGIL) },
      sect: [this.clSeeming?.name, c.court ? t(`Changeling.Court.${c.court}`) : ""].filter(Boolean).join(" · ") });
  }

  /** Шаг «Грёза»: киты плитками, ступени, двор, Дом, Наследия, Порог и Антитеза. */
  clContext(ctx) {
    const D = clData(), c = this.st.cl, kith = this.clKith;
    const leg = court => (D.legacies ?? []).filter(l => l.court === court).map(l => ({ key: l.key, name: l.name, selected: l.key === (court === "seelie" ? c.legacySeelie : c.legacyUnseelie),
      tip: [l.text, l.quest && `${t("ClCr.Quest")}: ${l.quest}`, l.ban && `${t("ClCr.Ban")}: ${l.ban}`].filter(Boolean).join(" · ") }));
    const L = D.lykeian ?? { guises: [], shapes: [] }, ly = this.isLykeian;
    const guise = ly ? (L.guises ?? []).find(g => g.key === c.guise) ?? null : null;
    ctx.cl = {
      variants: ["", "lykeian"].map(k => ({ key: k, label: t(`Lykeian.Variant.${k || "kithain"}`), active: (c.variant ?? "") === k })),
      lykeian: ly, guises: (L.guises ?? []).map(g => ({ key: g.key, label: g.name, en: g.en, sub: g.theme, active: g.key === c.guise })),
      guise: guise ? { ...guise } : null,
      shapes: (L.shapes ?? []).map(s => ({ key: s.key, label: s.name, text: s.text, active: s.key === c.shape })),
      shapeChoice: ly && c.shape === "animal" ? ["glamour", "willpower"].map(k => ({ key: k, label: t(`ClCr.Wilder.${k}`), active: c.wilder === k })) : null,
      nightmareLegacies: (D.legacies ?? []).map(l => ({ key: l.key, name: l.name, selected: l.key === c.nightmareLegacy })),
      redes: ly ? this.lyRedesView : null,
      kiths: (D.kiths ?? []).map(k => ({ key: k.key, label: k.name, en: k.en, active: k.key === c.kith, sub: k.affinityText ?? "" })),
      kith: kith ? { ...kith, birthrights: (kith.birthrights ?? []).map(b => ({ name: b.name, en: b.en, text: plain(b.html) })),
        frailty: kith.frailty ? { name: kith.frailty.name ?? "", text: plain(kith.frailty.html ?? kith.frailty.text ?? "") } : null } : null,
      seemings: (D.seemings ?? []).map(s => ({ key: s.key, label: s.name, active: s.key === c.seeming, temper: s.temper ?? "", text: s.banality ?? "" })),
      wilder: this.clSeeming?.choice ? ["glamour", "willpower"].map(k => ({ key: k, label: t(`ClCr.Wilder.${k}`), active: c.wilder === k })) : null,
      courts: ["seelie", "unseelie"].map(k => ({ key: k, label: t(`Changeling.Court.${k}`), active: k === c.court })),
      houses: [{ key: "", name: t("ClCr.NoHouse"), selected: !c.house }, ...(D.houses ?? []).map(h => ({ key: h.key, name: `${h.name} (${h.courtText ?? ""})`, selected: h.key === c.house }))],
      house: (D.houses ?? []).find(h => h.key === c.house) ?? null,
      legaciesSeelie: leg("seelie"), legaciesUnseelie: leg("unseelie"),
      issues: ly ? [...this.clIssues, ...this.clArtIssues] : this.clIssues, glamour: this.morality, will: this.willpower, banality: this.clBanality
    };
  }

  /** Запись в лист: system.changeling. */
  clWrite(prev) {
    const c = this.st.cl, val = k => this.value("disc", k);
    if (this.isLykeian) return { ...prev, variant: "lykeian", kith: "", seeming: "", house: "", court: c.court || "seelie",
      legacies: { seelie: c.legacySeelie, unseelie: c.legacyUnseelie }, threshold: "", antithesis: "",
      lykeian: { ...(prev.lykeian ?? {}), guise: c.guise, shape: c.shape, thesis: c.thesis, analog: c.analog, nightmareLegacy: c.nightmareLegacy, redes: foundry.utils.deepClone(c.redes ?? []) },
      arts: Object.fromEntries(VTM20.changelingArts.map(k => [k, 0])), realms: Object.fromEntries(VTM20.changelingRealms.map(k => [k, 0])),
      glamour: { permanent: this.morality, temporary: this.morality }, banality: { permanent: this.clBanality, temporary: 0 }, nightmare: 0, imbalance: 0 };
    return { ...prev, variant: "", kith: c.kith, seeming: c.seeming, house: c.house, court: c.court || "seelie",
      legacies: { seelie: c.legacySeelie, unseelie: c.legacyUnseelie }, threshold: c.threshold, antithesis: c.antithesis,
      arts: Object.fromEntries(VTM20.changelingArts.map(k => [k, val(k)])), realms: Object.fromEntries(VTM20.changelingRealms.map(k => [k, val(k)])),
      glamour: { permanent: this.morality, temporary: this.morality }, banality: { permanent: this.clBanality, temporary: 0 }, nightmare: 0, imbalance: 0 };
  }
}

/** Выбор на шаге «Грёза» (кит, ступень, двор, выбор дикаря). */
function onClPick(event, target) {
  const { what, key } = target.dataset;
  this.st.cl[what] = key;
  if (what === "seeming" && !this.clSeeming?.choice) this.st.cl.wilder = "";
  if (what === "shape" && key !== "animal") this.st.cl.wilder = "";
  if (what === "variant") { this.st.cl.wilder = ""; this.st.disc = {}; this.st.free.disc = {}; this.st.xp.disc = {}; }
  this.render();
}
/** Реды ликийца в мастере: добавить выбранный в списке, убрать, поменять цену переменного. */
function onLyRede(event, target) {
  const { op } = target.dataset, list = this.st.cl.redes ?? (this.st.cl.redes = []);
  if (op === "add") {
    const key = target.closest(".r-cl-add")?.querySelector("select")?.value, r = (clData().redes ?? []).find(x => x.key === key);
    if (r && !list.some(x => x.key === key)) list.push({ key, pts: r.cost || 1 });
  } else if (op === "del") list.splice(Number(target.dataset.i), 1);
  this.render();
}
export const CHANGELING_CR_ACTIONS = { clPick: onClPick, lyRede: onLyRede };
