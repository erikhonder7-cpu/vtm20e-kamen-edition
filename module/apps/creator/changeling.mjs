// module/apps/creator/changeling.mjs
// Мастер создания: подменыш (C20, гл. 3 «Character Creation») и его варианты (st.cl.variant):
//   · китейн — кит, ступень, двор, Дом, Наследия, Порог и Антитеза; Искусства (3) и Царства (5) на слоте Дисциплин; Гламур — на слоте
//     морали; Воля 4, Гламур 4, Банальность 3 и поправки ступени; свободные: Атрибут 5, Способность 2, Искусство 5, Царство 2, Фон 1,
//     Гламур 3, Воля 1;
//   · ликиец (Players Guide, гл. 7) — Облик, Форма, Тезис, Кошмар-Наследие, Реды на 5 химерических очков (apps/lykeian.mjs);
//   · Хсиен (гл. 39) — Кваннон-цзинь со стартовым Чи (Чу Цзюн и Нянь 1/3, Суйдзен и Хэн По 3/1, Комуко и Ханумэн 2/2,
//     Чу-и-ю и Тануки 2/1, Хоу-ци и Фу-си 1/2 — у последних ещё точка в Инь или Ян); Ву Тань: точка в школе стихии кита и 3 точки
//     в любых школах (не выше 3, Ней Тань — только за свободные); Воля 4; Гламура и Банальности нет; на слоте морали — Ян, отдельно Инь;
//     свободные: Способность 2, Атрибут 5, Фон 1, Чи 4, Воля 1, Ву Тань 5; опыт: Ву Тань × 5, новая школа 6, Чи × 3;
//   · инанимае (гл. 40) — фила (Гламур, Воля и Банальность по таблице), двор (Глэйдлинги — точка в Слайвере склонности даром),
//     Слайверы — 4 точки; свободные: Слайвер 5, Атрибут 4, Гламур 3, Способность и Воля 2, Фон 1; опыт как у китейна;
//   · Тёмные века: Фэ — Происхождение (Мгла / Плетение / очки Доменов: подменыш 2/4/2, инанимае 3/3/3, перворождённый 4/2/3) и Двор
//     (любимый Домен); Домены не выше 3; кантрипов по одному в Домене за точку Плетения, уровень не выше Домена; Воля 4; на слоте
//     морали — Мгла, отдельно Плетение; свободные: Атрибут 5, Способность 2, Фон 1, Домен 7, Воля 2, Мгла и Плетение 4;
//     опыт: любимый Домен × 5, прочий × 6, новый 10, Мгла и Плетение × 3, Воля — текущее.

import { VTM20 } from "../../config.mjs";
import { C as clData, CHANGELING_SIGIL, kithGlyph, clGlyph } from "../changeling.mjs";
import { SHAPE_BONUS, LYKEIAN_COST } from "../lykeian.mjs";
import { SCHOOLS, HSIEN_ELEMENT, HSIEN_COURTS, SLIVERS } from "../fae-variants.mjs";
import { DOMINIONS } from "../dark-fae.mjs";
import { plain } from "./rules.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const sum = o => Object.values(o ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);

/** Стартовое Чи Кваннон-цзинь (C20, гл. 39): [Инь, Ян, точка на выбор]. */
const HSIEN_CHI = { "hsien-chujung": [1, 3], "hsien-nyan": [1, 3], "hsien-suijen": [3, 1], "hsien-hengpo": [3, 1], "hsien-komuko": [2, 2], "hsien-hanumen": [2, 2],
  "hsien-chuihyu": [2, 1, true], "hsien-tanuki": [2, 1, true], "hsien-houchi": [1, 2, true], "hsien-fuhsi": [1, 2, true] };
/** Правила вариантов: сколько точек на слоте Дисциплин и цены свободных пунктов. */
const VARIANT_RULES = {
  hsien: { disc: 3, cost: { attr: 5, abil: 2, disc: 5, bg: 1, virt: 0, morality: 4, will: 1, yin: 4 } },
  inanimae: { disc: 4, cost: { attr: 4, abil: 2, disc: 5, bg: 1, virt: 0, morality: 3, will: 2 } },
  daf: { disc: 2, cost: { attr: 5, abil: 2, disc: 7, bg: 1, virt: 0, morality: 4, will: 2, weave: 4 } }
};

export class ChangelingCreator {
  get isChangeling() { return this.type === "changeling"; }
  get clVariant() { return this.isChangeling ? (this.st?.cl?.variant ?? "") : ""; }
  /** Ликиец (C20 Players Guide, гл. 7): Облик и Форма вместо кита и ступени, Реды вместо Искусств и Царств. */
  get isLykeian() { return this.clVariant === "lykeian"; }
  get isHsienCr() { return this.clVariant === "hsien"; }
  get isInanCr() { return this.clVariant === "inanimae"; }
  get isDafCr() { return this.clVariant === "daf"; }
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
  get clOtherKith() { return (clData().otherKiths ?? []).find(k => k.key === this.st.cl.kith) ?? null; }
  get clSeeming() { return (clData().seemings ?? []).find(k => k.key === this.st.cl.seeming) ?? null; }
  get clPhylum() { return (clData().inanimae?.phyla ?? []).find(p => p.key === this.st.cl.kith) ?? null; }
  get clDafOrigin() { return (clData().daf?.origins ?? []).find(o => o.key === this.st.cl.origin) ?? null; }
  get clDafCourt() { return (clData().daf?.courts ?? []).find(c => c.key === this.st.cl.dafCourt) ?? null; }
  isArt(k) { return VTM20.changelingArts.includes(k); }
  isRealm(k) { return VTM20.changelingRealms.includes(k); }

  /** Ключи слота Дисциплин варианта: школы Ву Тань, Слайверы, Домены; null — Искусства и Царства китейна. */
  get clMagicKeys() { return this.isHsienCr ? SCHOOLS : this.isInanCr ? SLIVERS : this.isDafCr ? DOMINIONS : null; }
  /** Правила варианта поверх правил подменыша (слот Дисциплин и цены). */
  get clVariantRules() {
    const r = VARIANT_RULES[this.clVariant];
    if (!r) return null;
    return this.isDafCr ? { ...r, disc: this.clDafOrigin?.dominions ?? 2 } : r;
  }
  /** Даровые точки: школа стихии кита у Хсиен, Слайвер склонности у Глэйдлингов (кроме манников). */
  clDiscBase(k) {
    if (this.isHsienCr) return HSIEN_ELEMENT[this.st.cl.kith] === k ? 1 : 0;
    if (this.isInanCr) return (this.st.cl.inanCourt || "gladeling") === "gladeling" && this.clPhylum?.affinity === k ? 1 : 0;
    return 0;
  }

  /** Искусство, Царство, школа, Слайвер или Домен как «Дисциплина» мастера: имя и уровни. */
  clTrait(k) {
    const D = clData();
    if (this.isHsienCr) return { key: k, name: t(`Fae.Hsien.School.${k}`), en: "", powers: [] };
    if (this.isInanCr) { const s = (D.inanimae?.slivers ?? []).find(x => x.key === k); return s ? { key: k, name: s.name, en: s.en, powers: [{ level: 1, name: s.perk, en: "", html: `<p>${s.text}</p>` }] } : null; }
    if (this.isDafCr) return { key: k, name: t(`Fae.Daf.Dom.${k}`), en: "", powers: (D.daf?.cantrips ?? []).filter(c => c.domain === k).sort((a, b) => a.level - b.level)
      .map(c => ({ level: c.level, name: c.name, en: c.traitName, html: `<p>${c.text}</p>` })) };
    const x = this.isArt(k) ? (D.arts ?? []).find(a => a.key === k) : (D.realms ?? []).find(r => r.key === k);
    return x ? { key: k, name: x.name, en: x.en, powers: (x.levels ?? []).map(l => ({ level: l.level, name: l.name, en: l.en ?? "", html: l.html ?? "" })) } : null;
  }
  clInClan(k) {
    if (this.isHsienCr) return HSIEN_ELEMENT[this.st.cl.kith] === k;
    if (this.isInanCr) return this.clPhylum?.affinity === k;
    if (this.isDafCr) return this.clDafCourt?.favorite === k;
    return this.isArt(k);
  }
  clIcon(k) { return this.isHsienCr ? "fa-yin-yang" : this.isInanCr ? "fa-gem" : this.isDafCr ? "fa-sun" : this.isArt(k) ? "fa-wand-sparkles" : "fa-compass"; }
  get clStepName() { return this.isLykeian ? "redes" : this.isHsienCr ? "wutan" : this.isInanCr ? "slivers" : this.isDafCr ? "dominions" : "arts"; }
  get clDiscLabel() { return t(`Creator.Step.${this.clStepName === "arts" ? "arts" : this.clStepName}`); }

  /** Поправки ступени: дитя +1 Гламур, дикарь — +1 к выбранному, ворчун +1 Воля; у ликийца — по Форме. */
  clSeemingBonus(what) {
    if (this.isLykeian) {
      const b = SHAPE_BONUS[this.st.cl.shape];
      if (!b) return 0;
      return b.choice ? (this.st.cl.wilder === what ? 1 : 0) : Number(b[what]) || 0;
    }
    if (this.clVariant) return 0;
    const s = this.clSeeming;
    if (!s) return 0;
    if (s.choice) return this.st.cl.wilder === what ? 1 : 0;
    return Number(s[what]) || 0;
  }
  /** Слот морали: Гламур (китейн, ликиец, инанимае), Ян (Хсиен), Мгла (Тёмные века). */
  get clGlamourBase() {
    if (this.isHsienCr) { const c = HSIEN_CHI[this.st.cl.kith] ?? [1, 1]; return c[1] + (c[2] && this.st.cl.wilder === "yang" ? 1 : 0); }
    if (this.isDafCr) return this.clDafOrigin?.mists ?? 2;
    if (this.isInanCr) return this.clPhylum?.start?.[0] ?? 4;
    return (this.clCreation.glamour ?? 4) + this.clSeemingBonus("glamour");
  }
  get clMoralityCap() { return this.isHsienCr ? 5 : 10; }
  get clMoralityLabel() { return t(this.isHsienCr ? "Fae.Hsien.Yang" : this.isDafCr ? "Fae.Daf.Mists" : "Changeling.Glamour"); }
  /** Второй Темпер: Инь у Хсиен, Плетение у Тёмных веков. */
  get clYinBase() { const c = HSIEN_CHI[this.st.cl.kith] ?? [1, 1]; return c[0] + (c[2] && this.st.cl.wilder === "yin" ? 1 : 0); }
  get clYin() { return Math.min(5, this.clYinBase + (this.st.free.yin ?? 0) + (this.st.xp.yin ?? 0)); }
  get clWeaveBase() { return this.clDafOrigin?.weaving ?? 4; }
  get clWeaving() { return Math.min(10, this.clWeaveBase + (this.st.free.weave ?? 0) + (this.st.xp.weave ?? 0)); }
  get clWillBase() {
    if (this.isInanCr) return this.clPhylum?.start?.[1] ?? 4;
    if (this.isHsienCr || this.isDafCr) return 4;
    return (this.clCreation.willpower ?? 4) + this.clSeemingBonus("willpower");
  }
  get clBanality() { return this.isHsienCr || this.isDafCr ? 0 : this.isInanCr ? this.clPhylum?.start?.[2] ?? 3 : this.clCreation.banality ?? 3; }

  /** Точки создания по Искусствам и Царствам (без свободных и опыта). */
  get clArtDots() { return Object.entries(this.st.disc).filter(([k]) => this.isArt(k)).reduce((s, [, v]) => s + (v || 0), 0); }
  get clRealmDots() { return Object.entries(this.st.disc).filter(([k]) => this.isRealm(k)).reduce((s, [, v]) => s + (v || 0), 0); }
  /** Свободные пункты на слот Дисциплин: Искусство 5 и Царство 2; у вариантов — по цене варианта. */
  get clDiscFreeCost() {
    if (this.isLykeian) return Math.max(0, this.lyRedePts - LYKEIAN_COST.redes) * LYKEIAN_COST.rede;
    if (this.clVariantRules) return sum(this.st.free.disc) * this.clVariantRules.cost.disc;
    const f = this.st.free.disc, cost = clData().freebies ?? {};
    return Object.entries(f).reduce((s, [k, v]) => s + (v || 0) * (this.isArt(k) ? cost.art ?? 5 : cost.realm ?? 2), 0);
  }
  /** Свободные на второй Темпер: Инь (Хсиен) и Плетение (Тёмные века) — по 4. */
  get clExtraFree() { return ((this.st.free.yin ?? 0) + (this.st.free.weave ?? 0)) * 4; }

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
    if (this.isHsienCr) {
      if (!HSIEN_CHI[c.kith]) out.push(t("FaeCr.NeedKwannon"));
      if (HSIEN_CHI[c.kith]?.[2] && !["yin", "yang"].includes(c.wilder)) out.push(t("FaeCr.NeedChiDot"));
      if (!c.legacyYin || !c.legacyYang) out.push(t("FaeCr.NeedYinYang"));
      return out;
    }
    if (this.isInanCr) {
      if (!this.clPhylum) out.push(t("FaeCr.NeedPhylum"));
      if (!c.legacySeelie || !c.legacyUnseelie) out.push(t("ClCr.NeedLegacies"));
      return out;
    }
    if (this.isDafCr) {
      if (!this.clDafOrigin) out.push(t("FaeCr.NeedOrigin"));
      if (!this.clDafCourt) out.push(t("FaeCr.NeedCourt"));
      return out;
    }
    if (!c.kith) out.push(t("ClCr.NeedKith"));
    if (!c.seeming) out.push(t("ClCr.NeedSeeming"));
    if (this.clSeeming?.choice && !c.wilder) out.push(t("ClCr.NeedWilder"));
    if (!c.legacySeelie || !c.legacyUnseelie) out.push(t("ClCr.NeedLegacies"));
    return out;
  }
  /** Проверка слота Дисциплин: Искусств 3 и Царств 5; у вариантов — пределы создания и кантрипы Тёмных веков. */
  get clArtIssues() {
    if (this.isLykeian) { const left = LYKEIAN_COST.redes - this.lyRedePts; return left > 0 ? [t("LyCr.RedesLeft", { n: left })] : []; }
    if (this.isHsienCr) {
      const out = [];
      if ((this.st.disc.neitan ?? 0) > 0) out.push(t("FaeCr.NeiFree"));
      if (SCHOOLS.some(k => k !== "neitan" && this.clDiscBase(k) + (this.st.disc[k] ?? 0) > 3)) out.push(t("FaeCr.SchoolCap"));
      return out;
    }
    if (this.isDafCr) {
      const out = [];
      if (DOMINIONS.some(k => (this.st.disc[k] ?? 0) > 3)) out.push(t("FaeCr.DomCap"));
      const v = this.dafCrView;
      for (const d of v.list) if (d.chosen.length > d.limit) out.push(t("FaeCr.CantripsOver", { dom: d.name, n: d.limit }));
      return out;
    }
    if (this.isInanCr) return [];
    const out = [], a = (this.clCreation.arts ?? 3) - this.clArtDots, r = (this.clCreation.realms ?? 5) - this.clRealmDots;
    if (a) out.push(t(a > 0 ? "ClCr.ArtsLeft" : "ClCr.ArtsOver", { n: Math.abs(a) }));
    if (r) out.push(t(r > 0 ? "ClCr.RealmsLeft" : "ClCr.RealmsOver", { n: Math.abs(r) }));
    return out;
  }

  /** Цена опыта: китейн, ликиец и инанимае (гл. 3) — Искусство (Слайвер) новое 7, × 4; Царство новое 5, × 3; Гламур × 3; Воля × 2.
   *  Хсиен — Ву Тань новая 6, × 5; Ян и Инь × 3; Воля × 2. Тёмные века — Домен новый 10, любимый × 5, прочий × 6; Мгла и Плетение × 3; Воля — текущее. */
  clXp(kind, k, c) {
    if (kind === "attr") return c * 4;
    if (kind === "abil") return c === 0 ? 3 : c * 2;
    if (this.isHsienCr) return kind === "disc" ? (c === 0 ? 6 : c * 5) : kind === "morality" || kind === "yin" ? c * 3 : kind === "will" ? c * 2 : 0;
    if (this.isDafCr) return kind === "disc" ? (c === 0 ? 10 : c * (this.clDafCourt?.favorite === k ? 5 : 6)) : kind === "morality" || kind === "weave" ? c * 3 : kind === "will" ? c : 0;
    if (kind === "disc") return this.isInanCr || this.isArt(k) ? (c === 0 ? 7 : c * 4) : (c === 0 ? 5 : c * 3);
    if (kind === "morality") return c * 3;
    if (kind === "will") return c * 2;
    return 0;
  }

  /** Патент: кит (Облик, Кваннон-цзинь, фила, Происхождение), ступень или Форма и двор, знак. */
  clPatent(ctx) {
    const c = this.st.cl, sigil = { src: foundry.utils.getRoute(CHANGELING_SIGIL) };
    if (this.isLykeian) {
      const L = clData().lykeian ?? {}, g = (L.guises ?? []).find(x => x.key === c.guise), s = (L.shapes ?? []).find(x => x.key === c.shape);
      return Object.assign(ctx.patent, { clan: g?.name ?? t("Lykeian.Variant.lykeian"), sectSym: clGlyph("court", c.court), sym: clGlyph("guise", c.guise) ?? sigil,
        sect: [s?.name, c.court ? t(`Changeling.Court.${c.court}`) : ""].filter(Boolean).join(" · ") });
    }
    if (this.isHsienCr) return Object.assign(ctx.patent, { clan: this.clOtherKith?.name ?? t("Lykeian.Variant.hsien"), sectSym: null, sym: sigil,
      sect: [c.hsienCourt ? t(`Fae.Hsien.Court.${c.hsienCourt}`) : "", t("Lykeian.Variant.hsien")].filter(Boolean).join(" · ") });
    if (this.isInanCr) return Object.assign(ctx.patent, { clan: this.clOtherKith?.name ?? t("Lykeian.Variant.inanimae"), sectSym: null, sym: kithGlyph(c.kith) ?? sigil,
      sect: [t(`Fae.Inan.Court.${c.inanCourt || "gladeling"}`), this.clPhylum?.empire].filter(Boolean).join(" · ") });
    if (this.isDafCr) {
      const cs = clGlyph("daf-court", c.dafCourt);
      return Object.assign(ctx.patent, { clan: this.clDafOrigin?.name ?? t("Lykeian.Variant.daf"), sectSym: null, sym: cs ? { src: cs.src } : sigil,
        sect: [this.clDafCourt?.name, t("Lykeian.Variant.daf")].filter(Boolean).join(" · ") });
    }
    Object.assign(ctx.patent, { clan: this.clKith?.name ?? "", sectSym: clGlyph("court", c.court), sym: kithGlyph(c.kith) ?? sigil,
      sect: [this.clSeeming?.name, c.court ? t(`Changeling.Court.${c.court}`) : ""].filter(Boolean).join(" · ") });
  }

  /** Кантрипы Тёмных веков в мастере: по Домену с точками — выбранные, предел (Плетение), доступные (уровень ≤ Домена). */
  get dafCrView() {
    const all = clData().daf?.cantrips ?? [], chosen = new Set(this.st.cl.cantrips ?? []), limit = this.clWeaving;
    return { list: DOMINIONS.filter(k => this.value("disc", k) > 0).map(k => {
      const lvl = this.value("disc", k), pick = all.filter(c => (c.domain === k || c.domain === "common") && c.level <= lvl);
      return { key: k, name: t(`Fae.Daf.Dom.${k}`), limit, favorite: this.clDafCourt?.favorite === k,
        chosen: pick.filter(c => chosen.has(`${k}:${c.key}`)).map(c => ({ id: `${k}:${c.key}`, name: c.name, level: c.level, tip: `${c.params} — ${c.text}` })),
        avail: pick.filter(c => !chosen.has(`${k}:${c.key}`)).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
          .map(c => ({ id: `${k}:${c.key}`, label: `${"•".repeat(c.level)} ${c.name}${c.domain === "common" ? ` (${t("Fae.Daf.Common")})` : ""}` })) };
    }) };
  }

  /** Шаг «Грёза»: по варианту — киты и ступени, Облик и Форма, Кваннон-цзинь и Чи, фила и двор, Происхождение и Двор. */
  clContext(ctx) {
    const D = clData(), c = this.st.cl, kith = this.clKith;
    const leg = court => (D.legacies ?? []).filter(l => l.court === court).map(l => ({ key: l.key, name: l.name, selected: l.key === (court === "seelie" ? c.legacySeelie : c.legacyUnseelie),
      tip: [l.text, l.quest && `${t("ClCr.Quest")}: ${l.quest}`, l.ban && `${t("ClCr.Ban")}: ${l.ban}`].filter(Boolean).join(" · ") }));
    const anyLeg = cur => (D.legacies ?? []).map(l => ({ key: l.key, name: l.name, selected: l.key === cur }));
    const L = D.lykeian ?? { guises: [], shapes: [] }, ly = this.isLykeian;
    const guise = ly ? (L.guises ?? []).find(g => g.key === c.guise) ?? null : null;
    const other = g => (D.otherKiths ?? []).filter(k => k.group === g);
    const hk = HSIEN_CHI[c.kith];
    ctx.cl = {
      variants: ["", "lykeian", "hsien", "inanimae", "daf"].map(k => ({ key: k, label: t(`Lykeian.Variant.${k || "kithain"}`), active: (c.variant ?? "") === k })),
      lykeian: ly, hsien: this.isHsienCr, inan: this.isInanCr, daf: this.isDafCr, kithain: !this.clVariant,
      guises: (L.guises ?? []).map(g => ({ key: g.key, label: g.name, en: g.en, sub: g.theme, active: g.key === c.guise })),
      guise: guise ? { ...guise } : null,
      shapes: (L.shapes ?? []).map(s => ({ key: s.key, label: s.name, text: s.text, active: s.key === c.shape })),
      shapeChoice: ly && c.shape === "animal" ? ["glamour", "willpower"].map(k => ({ key: k, label: t(`ClCr.Wilder.${k}`), active: c.wilder === k })) : null,
      nightmareLegacies: (D.legacies ?? []).map(l => ({ key: l.key, name: l.name, selected: l.key === c.nightmareLegacy })),
      redes: ly ? this.lyRedesView : null,
      // Хсиен: Кваннон-цзинь со стартовым Чи и стихией, точка на выбор, двор, Наследия Инь и Ян
      kwannon: other("hsien").map(k => { const ch = HSIEN_CHI[k.key] ?? [1, 1]; return { key: k.key, label: k.name, active: k.key === c.kith,
        sub: `${t("Fae.Hsien.Yin")} ${ch[0]} · ${t("Fae.Hsien.Yang")} ${ch[1]}${ch[2] ? " +1" : ""} · ${t(`Fae.Hsien.School.${HSIEN_ELEMENT[k.key]}`)}` }; }),
      chiChoice: this.isHsienCr && hk?.[2] ? ["yin", "yang"].map(k => ({ key: k, label: t(`Fae.Hsien.${k === "yin" ? "Yin" : "Yang"}`), active: c.wilder === k })) : null,
      hsienCourts: [{ key: "", name: "—", selected: !c.hsienCourt }, ...HSIEN_COURTS.map(k => ({ key: k, name: t(`Fae.Hsien.Court.${k}`), selected: k === c.hsienCourt }))],
      legaciesYin: anyLeg(c.legacyYin), legaciesYang: anyLeg(c.legacyYang), otherKith: this.clOtherKith,
      chi: this.isHsienCr ? { yin: this.clYin, yang: this.morality } : null,
      // инанимае: фила с Империей и склонностью, двор
      phyla: other("inanimae").map(k => { const p = (D.inanimae?.phyla ?? []).find(x => x.key === k.key); return { key: k.key, label: k.name, active: k.key === c.kith,
        sub: [p?.empire, p?.affinity ? t(`FaeCr.Sliver.${p.affinity}`) : t("FaeCr.NoAffinity"), p?.start?.length ? `${p.start[0]}/${p.start[1]}/${p.start[2]}` : ""].filter(Boolean).join(" · ") }; }),
      inanCourts: ["gladeling", "krofted"].map(k => ({ key: k, label: t(`Fae.Inan.Court.${k}`), active: k === (c.inanCourt || "gladeling") })),
      // Тёмные века: Происхождение и Двор
      origins: (D.daf?.origins ?? []).map(o => ({ key: o.key, label: o.name, active: o.key === c.origin, sub: `${t("Fae.Daf.Mists")} ${o.mists} · ${t("Fae.Daf.Weaving")} ${o.weaving} · ${t("Fae.Daf.Dominions")} ${o.dominions}` })),
      origin: this.clDafOrigin, dafCourts: (D.daf?.courts ?? []).map(k => ({ key: k.key, label: k.name, active: k.key === c.dafCourt,
        sub: k.favorite ? t(`Fae.Daf.Dom.${k.favorite}`) : "—" })), dafCourt: this.clDafCourt,
      tempers2: this.isDafCr ? { mists: this.morality, weaving: this.clWeaving } : null,
      // китейн
      kiths: (D.kiths ?? []).map(k => ({ key: k.key, label: k.name, en: k.en, active: k.key === c.kith, sub: k.affinityText ?? "" })),
      kith: kith ? { ...kith, birthrights: (kith.birthrights ?? []).map(b => ({ name: b.name, en: b.en, text: plain(b.html) })),
        frailty: kith.frailty ? { name: kith.frailty.name ?? "", text: plain(kith.frailty.html ?? kith.frailty.text ?? "") } : null } : null,
      seemings: (D.seemings ?? []).map(s => ({ key: s.key, label: s.name, active: s.key === c.seeming, temper: s.temper ?? "", text: s.banality ?? "" })),
      wilder: !this.clVariant && this.clSeeming?.choice ? ["glamour", "willpower"].map(k => ({ key: k, label: t(`ClCr.Wilder.${k}`), active: c.wilder === k })) : null,
      courts: ["seelie", "unseelie"].map(k => ({ key: k, label: t(`Changeling.Court.${k}`), active: k === c.court })),
      houses: [{ key: "", name: t("ClCr.NoHouse"), selected: !c.house }, ...(D.houses ?? []).map(h => ({ key: h.key, name: `${h.name} (${h.courtText ?? ""})`, selected: h.key === c.house }))],
      house: (D.houses ?? []).find(h => h.key === c.house) ?? null,
      legaciesSeelie: leg("seelie"), legaciesUnseelie: leg("unseelie"),
      issues: this.clVariant && this.clVariant !== "inanimae" ? [...this.clIssues, ...(ly ? this.clArtIssues : [])] : this.clIssues,
      glamour: this.morality, will: this.willpower, banality: this.clBanality
    };
  }

  /** Сводка итога: что видно в строке «Грёза». */
  clSummaryRows() {
    const c = this.st.cl, D = clData(), L = k => (D.legacies ?? []).find(l => l.key === k)?.name, loc = k => game.i18n.localize(k);
    if (this.isHsienCr) return [[t("Fae.Hsien.Kith"), this.clOtherKith?.name], [loc("VTM20.Changeling.CourtLabel"), c.hsienCourt && t(`Fae.Hsien.Court.${c.hsienCourt}`)],
      [t("Fae.Hsien.LegacyYin"), L(c.legacyYin)], [t("Fae.Hsien.LegacyYang"), L(c.legacyYang)], [t("Fae.Hsien.Yin"), this.clYin], [t("Fae.Hsien.Yang"), this.morality]];
    if (this.isInanCr) return [[t("Fae.Inan.Phylum"), this.clOtherKith?.name], [loc("VTM20.Changeling.CourtLabel"), t(`Fae.Inan.Court.${c.inanCourt || "gladeling"}`)],
      [loc("VTM20.Changeling.LegacySeelie"), L(c.legacySeelie)], [loc("VTM20.Changeling.LegacyUnseelie"), L(c.legacyUnseelie)],
      [t("Fae.Inan.Anchor"), c.anchor], [loc("VTM20.Changeling.Banality"), this.clBanality]];
    if (this.isDafCr) return [[t("Fae.Daf.Origin"), this.clDafOrigin?.name], [loc("VTM20.Changeling.CourtLabel"), this.clDafCourt?.name],
      [t("Fae.Daf.Mists"), this.morality], [t("Fae.Daf.Weaving"), this.clWeaving], [t("FaeCr.Cantrips"), (c.cantrips ?? []).length]];
    return [[loc("VTM20.Changeling.Kith"), this.clKith?.name], [loc("VTM20.Changeling.Seeming"), this.clSeeming?.name],
      [loc("VTM20.Changeling.CourtLabel"), c.court && loc(`VTM20.Changeling.Court.${c.court}`)], [loc("VTM20.Changeling.House"), (D.houses ?? []).find(h => h.key === c.house)?.name],
      [loc("VTM20.Changeling.LegacySeelie"), L(c.legacySeelie)], [loc("VTM20.Changeling.LegacyUnseelie"), L(c.legacyUnseelie)], [loc("VTM20.Changeling.Banality"), this.clBanality]];
  }

  /** Запись в лист: system.changeling. */
  clWrite(prev) {
    const c = this.st.cl, val = k => this.value("disc", k);
    const zero = { arts: Object.fromEntries(VTM20.changelingArts.map(k => [k, 0])), realms: Object.fromEntries(VTM20.changelingRealms.map(k => [k, 0])) };
    const tempers = { glamour: { permanent: this.morality, temporary: this.morality }, banality: { permanent: this.clBanality, temporary: 0 }, nightmare: 0, imbalance: 0 };
    if (this.isLykeian) return { ...prev, variant: "lykeian", kith: "", seeming: "", house: "", court: c.court || "seelie",
      legacies: { seelie: c.legacySeelie, unseelie: c.legacyUnseelie }, threshold: "", antithesis: "",
      lykeian: { ...(prev.lykeian ?? {}), guise: c.guise, shape: c.shape, thesis: c.thesis, analog: c.analog, nightmareLegacy: c.nightmareLegacy, redes: foundry.utils.deepClone(c.redes ?? []) },
      ...zero, ...tempers };
    if (this.isHsienCr) return { ...prev, variant: "hsien", kith: c.kith, seeming: "", house: "", threshold: "", antithesis: "", ...zero,
      glamour: { permanent: 0, temporary: 0 }, banality: { permanent: 0, temporary: 0 }, nightmare: 0, imbalance: 0,
      hsien: { ...(prev.hsien ?? {}), yin: this.clYin, yang: Math.min(5, this.morality), yugen: 0, court: c.hsienCourt ?? "", legacyYin: c.legacyYin, legacyYang: c.legacyYang,
        schools: Object.fromEntries(SCHOOLS.map(k => [k, val(k)])) } };
    if (this.isInanCr) return { ...prev, variant: "inanimae", kith: c.kith, seeming: "", house: "", threshold: "", antithesis: "", ...zero, ...tempers,
      legacies: { seelie: c.legacySeelie, unseelie: c.legacyUnseelie },
      inanimae: { ...(prev.inanimae ?? {}), court: c.inanCourt || "gladeling", anchor: c.anchor ?? "", husk: c.husk ?? "", anchorLost: false,
        slivers: Object.fromEntries(SLIVERS.map(k => [k, val(k)])) } };
    if (this.isDafCr) return { ...prev, variant: "daf", kith: "", seeming: "", house: "", threshold: "", antithesis: "", ...zero,
      glamour: { permanent: 0, temporary: 0 }, banality: { permanent: 0, temporary: 0 }, nightmare: 0, imbalance: 0,
      daf: { ...(prev.daf ?? {}), origin: c.origin, court: c.dafCourt, echoes: 1, mists: { permanent: this.morality, temporary: this.morality },
        weaving: { permanent: this.clWeaving, temporary: this.clWeaving }, dominions: Object.fromEntries(DOMINIONS.map(k => [k, val(k)])), cantrips: [...(c.cantrips ?? [])] } };
    return { ...prev, variant: "", kith: c.kith, seeming: c.seeming, house: c.house, court: c.court || "seelie",
      legacies: { seelie: c.legacySeelie, unseelie: c.legacyUnseelie }, threshold: c.threshold, antithesis: c.antithesis,
      arts: Object.fromEntries(VTM20.changelingArts.map(k => [k, val(k)])), realms: Object.fromEntries(VTM20.changelingRealms.map(k => [k, val(k)])), ...tempers };
  }
}

/** Выбор на шаге «Грёза» (вариант, кит, ступень, двор, точка на выбор). */
function onClPick(event, target) {
  const { what, key } = target.dataset;
  this.st.cl[what] = key;
  if (what === "seeming" && !this.clSeeming?.choice) this.st.cl.wilder = "";
  if (what === "shape" && key !== "animal") this.st.cl.wilder = "";
  if (what === "kith" && this.isHsienCr) this.st.cl.wilder = "";
  if (what === "variant") {
    Object.assign(this.st.cl, { wilder: "", kith: "", cantrips: [] });
    this.st.disc = {}; this.st.free.disc = {}; this.st.xp.disc = {};
    this.st.free.yin = 0; this.st.free.weave = 0; this.st.xp.yin = 0; this.st.xp.weave = 0; this.st.free.morality = 0; this.st.xp.morality = 0;
  }
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
/** Кантрипы Тёмных веков в мастере: выучить выбранный в списке Домена, забыть. */
function onDafCantrip(event, target) {
  const { op, key } = target.dataset, list = this.st.cl.cantrips ?? (this.st.cl.cantrips = []);
  if (op === "add") { const id = target.closest(".r-cl-add")?.querySelector("select")?.value; if (id && !list.includes(id)) list.push(id); }
  else if (op === "del") this.st.cl.cantrips = list.filter(x => x !== key);
  this.render();
}
export const CHANGELING_CR_ACTIONS = { clPick: onClPick, lyRede: onLyRede, dafCantrip: onDafCantrip };
