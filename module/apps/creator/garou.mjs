// module/apps/creator/garou.mjs
// Мастер создания: Гару и Фера (W20, гл. 3; W20 Changing Breeds) — порода, аугурия, племя или род, стартовые Дары, Слава.

import { VTM20 } from "../../config.mjs";
import { W as werewolfData, ownGift, wwGlyphSrc, feraSym } from "../werewolf.mjs";
import { RENOWN, FERA_START_GIFTS, plain, preview } from "./rules.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const loc = k => game.i18n.localize(k);

export class GarouCreator {
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

  /** Патент: племя (у Фера — род), аугурия и порода, Ярость и Гнозис вместо морали. */
  garouPatent(ctx) {
    const st = this.st;
    const f = this.feraData, lbl = x => x ? VTM20.label(x) : "";
    const sub = f ? this.feraDims.map(d => lbl(d.options.find(o => o.key === st.ww.sub[d.key]))).filter(Boolean).join(" · ") : "";
    Object.assign(ctx.patent, { clan: f ? lbl(f) : lbl(this.garouTribe), sect: f ? sub : [lbl(this.garouAuspice), lbl(this.garouBreed)].filter(Boolean).join(" · "),
      sectSym: null, sym: null, morality: this.garouRage, pathName: loc("VTM20.Werewolf.Rage"), garou: true, gnosis: this.garouGnosis });
  }

  /** Шаги «Порода и племя», «Дары» и Слава: плитки рода, ячейки стартовых Даров, Дары сверх трёх. */
  garouContext(ctx) {
    const st = this.st;
    const D = werewolfData(), w = st.ww, f = this.feraData, lbl = x => VTM20.label(x);
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
    const card = (g, on) => ({ key: g.key, label: lbl(g), en: g.en, on, text: preview(g.text, 700), cost: g.cost ? Object.entries(g.cost).map(([k, n]) => `${n} ${loc(`VTM20.GarouCr.T.${k === "willpower" ? "will" : k}`)}`).join(", ") : "" });
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
}
