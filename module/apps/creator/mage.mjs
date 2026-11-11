// module/apps/creator/mage.mjs
// Мастер создания: маг (M20, гл. 6) — фракция, Сущность, родовая Сфера; Сферы на слоте Дисциплин, Арете на слоте морали.

import { VTM20 } from "../../config.mjs";
import { Codex } from "../../data/codex.mjs";
import { M as mageData, mageGlyphSrc, subLabel, factionGlyph } from "../mage.mjs";
import { plain } from "./rules.mjs";

const loc = k => game.i18n.localize(k);

export class MageCreator {
  get isMage() { return this.type === "mage"; }
  get mageFaction() { return (mageData().factions ?? []).find(f => f.key === this.st.mg.faction) ?? null; }
  get mageTech() { return this.mageFaction?.group === "technocracy"; }
  get mageFallen() { return this.mageFaction?.group === "nephandi"; }
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
  /** Резонанс: одна точка даром, каждая следующая — новая степень × 3 свободных пунктов (Book of Secrets). */
  get mageRes() { return 1 + (this.st.free.res ?? 0); }
  get mageResCost() { let s = 0; for (let r = 2; r <= this.mageRes; r++) s += 3 * r; return s; }
  get mageAvatar() { return Math.max(0, ...Codex.backgrounds.filter(b => b.line === "mage" && /^(Avatar|Genius)/i.test(b.en ?? "")).map(b => this.value("bg", b.name))); }

  /** Патент: фракция со знаком, Сущность и родовая Сфера; Арете на месте морали. */
  magePatent(ctx) {
    const st = this.st;
    const D = mageData(), f = this.mageFaction;
    Object.assign(ctx.patent, { clan: f?.name ?? "", sectSym: null, sym: f ? { src: mageGlyphSrc(factionGlyph(f)) } : null,
      sect: [(D.essences ?? []).find(e => e.key === st.mg.essence)?.name, st.mg.affinity && this.mageSphere(st.mg.affinity)?.name].filter(Boolean).join(" · ") });
  }

  /** Шаг «Фракция»: группа вкладками, фракция плитками со знаком, Сущность, родовая Сфера, фокус. */
  mageContext(ctx) {
    const st = this.st;
    const D = mageData(), g = st.mg, f = this.mageFaction, grp = g.group || f?.group || D.groups?.[0]?.key || "";
    const allowed = f?.affinity?.length ? f.affinity : VTM20.mageSpheres;
    const fallen = this.mageFallen, own = list => [...(list ?? []).filter(x => x.nephandi && fallen), ...(list ?? []).filter(x => !x.nephandi)];
    ctx.isMage = true;
    ctx.mage = {
      groups: (D.groups ?? []).map(x => ({ key: x.key, label: x.name, active: x.key === grp, sym: { src: mageGlyphSrc(x.key === "nephandi" ? "group-nephandi" : x.key === "technocracy" ? "group-technocracy" : x.key === "marauders" ? "group-marauders" : x.key === "traditions" ? "group-traditions" : "faction-orphans") } })),
      factions: (D.factions ?? []).filter(x => x.group === grp).map(x => ({ key: x.key, label: x.name, en: x.en, active: x.key === g.faction, sub: x.affinityText ?? "", sym: { src: mageGlyphSrc(factionGlyph(x)) } })),
      faction: f ? { ...f, sym: { src: mageGlyphSrc(factionGlyph(f)) } } : null,
      essences: (D.essences ?? []).map(e => ({ key: e.key, label: e.name, active: e.key === g.essence, text: plain(e.text ?? "") })),
      affinities: VTM20.mageSpheres.map(k => ({ key: k, label: this.mageSphere(k)?.name ?? k, active: k === g.affinity, off: !allowed.includes(k), sym: { src: mageGlyphSrc(`sphere-${k}`) } })),
      // парадигмы и практики Падших — только Нефанду, и первыми в списке; остальным их не показываем
      paradigms: own(D.focus?.paradigms).map(p => p.name), practices: own(D.focus?.practices).map(p => p.name),
      subs: (f?.subs ?? []).map(x => ({ key: x.key, label: x.name, en: x.en, note: x.note, active: x.key === g.sub,
        sym: f.key === "order-of-hermes" ? { src: mageGlyphSrc(`house-${x.key}`) } : null })), subLabel: subLabel(f),
      issues: this.mageIssues, arete: this.morality, will: this.willpower, quint: this.mageQuint
    };
  }
}
