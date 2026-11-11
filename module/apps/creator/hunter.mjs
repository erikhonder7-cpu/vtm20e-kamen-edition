// module/apps/creator/hunter.mjs
// Мастер создания: охотник (Hunter: The Reckoning — кредо и Грани) и дампир (Accursed Heirs — клан Предка и Кровные права).

import { Codex } from "../../data/codex.mjs";
import { H as hunterData, edgeCost, hasOwnPath, creedCapped, edgeBarred, HERMIT_PATH, hermitEdgeMadness, hasPrevEdge } from "../hunter.mjs";
import { HUNTER_SLOTS } from "./rules.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

export class HunterCreator {
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

  /** Кредо (шаг концепции) и Грани (свой шаг). */
  hunterContext(ctx, key) {
    const st = this.st, by = hunterData().bystander;
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

  /** Дампир: концепция и клан Предка — на шаге концепции, Кровные права — свой шаг. */
  dhampirContext(ctx, key) {
    const st = this.st;
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
}
