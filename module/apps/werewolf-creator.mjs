// module/apps/werewolf-creator.mjs
// Мастер создания Гару (W20, гл. 3): порода, аугурия, племя; Атрибуты 7/5/3, Способности 13/9/5 (на старте не выше 3),
// Факты 5, три Дара (породы, аугурии, племени), Слава по аугурии, Ярость по аугурии, Гнозис по породе, Воля по племени;
// 15 бонусных очков (Атрибут 5, Способность 2, Факт 1, Дар 7, Ярость 1, Гнозис 2, Воля 1; достоинства — по цене,
// недостатки дают очки, не больше 7). Приоритеты групп подбираются сами — как выгоднее; всё сверх — за бонусные.

import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { W, ownGift } from "./werewolf.mjs";
import { LibraryItems } from "./library.mjs";

const { ApplicationV2 } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.GarouCr.${k}`, d) : game.i18n.localize(`VTM20.GarouCr.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const COST = { attr: 5, abil: 2, bg: 1, gift: 7, rage: 1, gnosis: 2, will: 1 };
const RENOWN = ["glory", "honor", "wisdom"];

export function openWerewolfCreator(actor) {
  return new GarouCreator(actor).render({ force: true });
}

class GarouCreator extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-type-werewolf", "r-gcr"],
    window: { title: "VTM20.GarouCr.Title", icon: "fa-solid fa-paw", resizable: true },
    position: { width: 980, height: 780 },
    actions: { dot: GarouCreator.#onDot, step: GarouCreator.#onStep, untrait: GarouCreator.#onUntrait, create: GarouCreator.#onCreate }
  };

  constructor(actor) {
    super({ window: { title: `${t("Title")}: ${actor.name}` } });
    this.actor = actor;
    const D = W();
    this.st = { breed: D.breeds[0]?.key ?? "", auspice: D.auspices[0]?.key ?? "", tribe: D.tribes[0]?.key ?? "",
      attr: Object.fromEntries(Object.keys(VTM20.attributes).map(k => [k, 1])), abil: {}, bg: {}, gifts: { breed: "", auspice: "", tribe: "" }, extra: [],
      rage: 0, gnosis: 0, will: 0, renown: { glory: 0, honor: 0, wisdom: 0 }, traits: [], deform: "",
      // Фера (W20 Changing Breeds): род и выбор внутри рода (порода, аспект, племя…)
      fera: "", sub: {} };
  }

  get D() { return W(); }
  get breed() { return this.D.breeds.find(x => x.key === this.st.breed); }
  get auspice() { return this.D.auspices.find(x => x.key === this.st.auspice); }
  get tribe() { return this.D.tribes.find(x => x.key === this.st.tribe); }
  get fera() { return this.st.fera ? (this.D.fera ?? []).find(b => b.key === this.st.fera) ?? null : null; }
  /** Измерения рода, в которых есть выбор. */
  get dims() { return (this.fera?.dims ?? []).filter(d => d.options.length); }
  /** Начальные Ярость, Гнозис и Воля: у Фера — по выбранным породе, аспекту, племени, варне, иначе по роду. */
  get base() {
    if (!this.fera) return { rage: this.auspice?.rage ?? 1, gnosis: this.breed?.gnosis ?? 1, will: this.tribe?.willpower ?? 3 };
    const picked = this.dims.map(d => d.options.find(o => o.key === this.st.sub[d.key])).filter(Boolean);
    const stat = k => picked.find(o => o.stats?.[k] != null)?.stats[k] ?? this.fera.base?.[k];
    return { rage: stat("rage") ?? 1, gnosis: stat("gnosis") ?? 1, will: stat("will") ?? 3 };
  }
  /** Ячейки стартовых Даров: у Гару — порода, аугурия, племя; у Фера — общий список рода и списки выбранного (всего три). */
  get giftSlots() {
    if (!this.fera) return ["breed", "auspice", "tribe"].map(k => ({ key: k, label: t(`GiftFrom.${k}`), sub: null }));
    const D = this.D, f = this.fera.key;
    const lists = this.dims.filter(d => this.st.sub[d.key] && D.gifts.some(g => g.level === 1 && g.groups.some(x => x.kind === "fera" && x.key === f && x.sub === `${d.key}:${this.st.sub[d.key]}`)))
      .map(d => ({ key: d.key, label: t("GiftOf", { what: d.label }), sub: `${d.key}:${this.st.sub[d.key]}` }));
    const general = Array.from({ length: Math.max(1, 3 - lists.length) }, (_, i) => ({ key: `general${i}`, label: t("GiftGeneral"), sub: "" }));
    return [...general, ...lists];
  }
  /** Варианты для ячейки Дара (уровень 1). */
  slotGifts(slot) {
    if (slot.sub === null) return ({ breed: this.breed, auspice: this.auspice, tribe: this.tribe }[slot.key]?.startGifts ?? []);
    const f = this.fera.key;
    return this.D.gifts.filter(g => g.level === 1 && g.groups.some(x => x.kind === "fera" && x.key === f && (x.sub ?? "") === slot.sub)).map(g => g.key);
  }

  get abilGroups() { return VTM20.abilitiesForEra(game.settings.get(SYSTEM_ID, "era"), "werewolf"); }

  /** Слава аугурии: [Слава, Честь, Мудрость]; у Рагабаша — 3 в любом сочетании (выбирает игрок). */
  get renown() {
    const r = this.fera ? null : this.auspice?.renown;
    return r ? Object.fromEntries(RENOWN.map((k, i) => [k, r[i] ?? 0])) : { ...this.st.renown };
  }

  /** Сколько стоит раскладка: приоритеты групп — как выгоднее; сверх бюджета и сверх 3 у Способностей — бонусные. */
  ledger() {
    const st = this.st, out = { lines: [], free: 15, spent: 0, left: {} };
    const attrSpent = Object.entries(VTM20.attributeGroups).map(([g, x]) => [g, x.attributes.reduce((n, k) => n + st.attr[k] - 1, 0)]).sort((p, q) => q[1] - p[1]);
    attrSpent.forEach(([g, n], i) => { const b = [7, 5, 3][i]; out.left[`attr.${g}`] = b - n; if (n > b) out.lines.push([t("FreeAttr", { g: game.i18n.localize(VTM20.attributeGroups[g].label) }), (n - b) * COST.attr]); });
    const ag = this.abilGroups;
    const abSpent = Object.entries(ag).map(([g, keys]) => [g, keys.reduce((n, k) => n + Math.min(3, st.abil[k] ?? 0), 0), keys.reduce((n, k) => n + Math.max(0, (st.abil[k] ?? 0) - 3), 0)]).sort((p, q) => q[1] - p[1]);
    abSpent.forEach(([g, n, high], i) => { const b = [13, 9, 5][i]; out.left[`abil.${g}`] = b - n;
      const over = Math.max(0, n - b) + high; if (over) out.lines.push([t("FreeAbil", { g: game.i18n.localize(VTM20.abilityGroups[g].label) }), over * COST.abil]); });
    const bgSum = Object.values(st.bg).reduce((a, b) => a + b, 0); out.left.bg = 5 - bgSum;
    if (bgSum > 5) out.lines.push([t("FreeBg"), (bgSum - 5) * COST.bg]);
    if (st.extra.length) out.lines.push([t("FreeGift", { n: st.extra.length }), st.extra.length * COST.gift]);
    if (st.rage) out.lines.push([t("FreeRage"), st.rage * COST.rage]);
    if (st.gnosis) out.lines.push([t("FreeGnosis"), st.gnosis * COST.gnosis]);
    if (st.will) out.lines.push([t("FreeWill"), st.will * COST.will]);
    let flawPts = 0;
    for (const x of st.traits) {
      if (x.kind === "merit") out.lines.push([x.name, x.cost]);
      else flawPts += x.cost;
    }
    flawPts = Math.min(7, flawPts);
    if (flawPts) out.lines.push([t("FlawPts"), -flawPts]);
    out.spent = out.lines.reduce((n, [, c]) => n + c, 0);
    out.remaining = 15 - out.spent;
    return out;
  }

  /** Что мешает создать. */
  problems(l = this.ledger()) {
    const p = [];
    if (this.fera) { if (this.dims.some(d => d.key !== "pryio" && !this.st.sub[d.key])) p.push(t("NeedFera")); }
    else if (!this.breed || !this.auspice || !this.tribe) p.push(t("NeedConcept"));
    if (this.giftSlots.some(s => !this.st.gifts[s.key])) p.push(this.fera ? t("NeedFeraGifts") : t("NeedGifts"));
    if (this.isMetis && !this.st.deform) p.push(t("NeedDeformity"));
    if (!this.renownFixed && RENOWN.reduce((n, k) => n + this.st.renown[k], 0) !== 3) p.push(t("NeedRenown"));
    if (l.remaining < 0) p.push(t("OverFree", { n: -l.remaining }));
    return p;
  }

  get isMetis() { return this.fera ? this.st.sub.breed === "metis" : this.st.breed === "metis"; }
  get renownFixed() { return !this.fera && !!this.auspice?.renown; }

  async _renderHTML() { return this.#html(); }
  _replaceHTML(html, content) {
    const sc = content.querySelector(".r-gcr-body")?.scrollTop ?? 0;
    content.innerHTML = html;
    const b = content.querySelector(".r-gcr-body"); if (b) b.scrollTop = sc;
  }
  _onFirstRender(ctx, opts) {
    super._onFirstRender(ctx, opts);
    this.element.addEventListener("change", ev => {
      const el = ev.target, f = el.dataset.f;
      if (!f) return;
      if (f === "fera") { this.st.fera = el.value; this.st.sub = {}; this.st.gifts = {}; this.st.extra = []; this.st.deform = ""; }
      else if (f.startsWith("sub.")) {
        this.st.sub[f.slice(4)] = el.value;
        const slots = this.giftSlots;
        for (const s of Object.keys(this.st.gifts)) if (!slots.some(x => x.key === s)) delete this.st.gifts[s];
        for (const s of slots) if (this.st.gifts[s.key] && !this.slotGifts(s).includes(this.st.gifts[s.key])) this.st.gifts[s.key] = "";
      }
      else if (["breed", "auspice", "tribe"].includes(f)) { this.st[f] = el.value; this.st.gifts[f] = ""; }
      else if (f.startsWith("gift.")) this.st.gifts[f.slice(5)] = el.value;
      else if (f === "deform") this.st.deform = el.value;
      else if (f === "extraGift" && el.value) this.st.extra = [...new Set([...this.st.extra, el.value])];
      else if (f === "addTrait" && el.value) { const m = Codex.merits.find(x => x.line === "werewolf" && `${x.kind}:${x.name}` === el.value); if (m) this.st.traits.push({ kind: m.kind, name: m.name, cost: m.min || 1 }); }
      else if (f === "addBg" && el.value) this.st.bg[el.value] = Math.max(1, this.st.bg[el.value] ?? 0);
      this.render();
    });
  }

  #dots(kind, key, v, max, min = 0) {
    return `<span class="r-gcr-dots">${Array.from({ length: max }, (_, i) => `<a class="${i < v ? "on" : ""} ${i < min ? "is-base" : ""}" data-action="dot" data-kind="${kind}" data-key="${esc(key)}" data-n="${i + 1}"></a>`).join("")}</span>`;
  }

  #html() {
    const D = this.D, st = this.st, a = this.actor, l = this.ledger(), probs = this.problems(l);
    const opt = (list, cur) => list.map(x => `<option value="${x.key}" ${x.key === cur ? "selected" : ""}>${esc(VTM20.label(x))}</option>`).join("");
    const giftOpts = (keys, cur) => `<option value="">—</option>` + keys.map(k => D.gifts.find(g => g.key === k)).filter(Boolean)
      .map(g => `<option value="${g.key}" ${g.key === cur ? "selected" : ""}>${esc(VTM20.label(g))}</option>`).join("");
    const left = k => { const n = l.left[k] ?? 0; return n > 0 ? `<em class="is-left">${t("Left", { n })}</em>` : n < 0 ? `<em class="is-over">${t("Over", { n: -n })}</em>` : `<em class="is-ok"><i class="fa-solid fa-check"></i></em>`; };
    const attrs = Object.entries(VTM20.attributeGroups).map(([g, x]) => `<div class="r-gcr-col"><h4>${esc(game.i18n.localize(x.label))} ${left(`attr.${g}`)}</h4>
      ${x.attributes.map(k => `<div class="r-gcr-row"><span>${esc(a.traitLabel(`attributes.${k}`))}</span>${this.#dots("attr", k, st.attr[k], 5, 1)}</div>`).join("")}</div>`).join("");
    const abils = Object.entries(this.abilGroups).map(([g, keys]) => `<div class="r-gcr-col"><h4>${esc(game.i18n.localize(VTM20.abilityGroups[g].label))} ${left(`abil.${g}`)}</h4>
      ${keys.map(k => `<div class="r-gcr-row"><span>${esc(a.traitLabel(`abilities.${k}`))}</span>${this.#dots("abil", k, st.abil[k] ?? 0, 5)}</div>`).join("")}</div>`).join("");
    const bgs = Codex.backgrounds.filter(b => b.line === "werewolf");
    const bgRows = Object.entries(st.bg).map(([n, v]) => `<div class="r-gcr-row"><span>${esc(VTM20.label(bgs.find(b => b.name === n) ?? { name: n }))}</span>${this.#dots("bg", n, v, 5)}</div>`).join("");
    const traitsAll = Codex.merits.filter(m => m.line === "werewolf");
    const r = this.renown, base = this.base, fera = this.fera;
    const me = fera ? { fera: fera.key, feraSub: st.sub } : { breed: st.breed, auspice: st.auspice, tribe: st.tribe };
    const ownLvl1 = D.gifts.filter(g => g.level === 1 && ownGift(me, g) && !Object.values(st.gifts).includes(g.key) && !st.extra.includes(g.key));
    const feraSel = `<label><span>${t("Fera")}</span><select data-f="fera"><option value="">${game.i18n.localize("VTM20.Werewolf.Garou")}</option>${(D.fera ?? []).map(b => `<option value="${b.key}" ${b.key === st.fera ? "selected" : ""}>${esc(VTM20.label(b))}</option>`).join("")}</select><small>${esc(fera?.en ?? "")}</small></label>`;
    const deformSel = this.isMetis ? `<label><span>${t("Deformity")}</span><select data-f="deform"><option value=""></option>${opt(D.deformities ?? [], st.deform)}</select><small>${(D.deformities ?? []).find(x => x.key === st.deform)?.text ?? ""}</small></label>` : "";
    const statLine = o => Object.entries(o?.stats ?? {}).map(([k, n]) => `${t(`T.${k}`)} ${n}`).join(", ");
    const concept = fera
      ? feraSel + this.dims.map(d => `<label><span>${esc(d.label)}</span><select data-f="sub.${d.key}"><option value="">—</option>${d.options.map(o => `<option value="${o.key}" ${o.key === st.sub[d.key] ? "selected" : ""}>${esc(VTM20.label(o))}</option>`).join("")}</select>
          <small>${esc(statLine(d.options.find(o => o.key === st.sub[d.key])))}</small></label>`).join("") + deformSel
      : null;
    return `<div class="r-gcr-wrap"><div class="r-gcr-body">
      <section class="r-gcr-concept">
        ${concept ?? `${feraSel}
        <label><span>${t("Breed")}</span><select data-f="breed">${opt(D.breeds, st.breed)}</select><small>${this.breed?.notes ?? ""}</small></label>
        ${deformSel}
        <label><span>${t("Auspice")}</span><select data-f="auspice">${opt(D.auspices, st.auspice)}</select><small>${esc(this.auspice?.role ?? "")}</small></label>
        <label><span>${t("Tribe")}</span><select data-f="tribe">${opt(D.tribes, st.tribe)}</select><small>${esc(t("TribeLine", { totem: this.tribe?.totem ?? "", bg: this.tribe?.backgrounds ?? "" }))}</small></label>`}
      </section>
      <h3>${t("Attributes")} <small>${t("AttrHint")}</small></h3><div class="r-gcr-cols">${attrs}</div>
      <h3>${t("Abilities")} <small>${t("AbilHint")}</small></h3><div class="r-gcr-cols">${abils}</div>
      <div class="r-gcr-cols is-two">
        <div><h3>${t("Backgrounds")} ${left("bg")}</h3>${bgRows}
          <select data-f="addBg"><option value="">${t("AddBg")}</option>${bgs.filter(b => !(b.name in st.bg)).map(b => `<option value="${esc(b.name)}">${esc(VTM20.label(b))}</option>`).join("")}</select></div>
        <div><h3>${t("Gifts")}</h3>
          ${this.giftSlots.map(s => `<label class="r-gcr-gift"><span>${esc(s.label)}</span><select data-f="gift.${s.key}">${giftOpts(this.slotGifts(s).filter(k => k === st.gifts[s.key] || !Object.values(st.gifts).includes(k)), st.gifts[s.key])}</select></label>`).join("")}
          ${st.extra.map(k => `<div class="r-gcr-row"><span><i class="fa-solid fa-star"></i> ${esc(VTM20.label(D.gifts.find(g => g.key === k) ?? { name: k }))}</span><a data-action="untrait" data-gift="${k}"><i class="fa-solid fa-xmark"></i></a></div>`).join("")}
          <select data-f="extraGift"><option value="">${t("ExtraGift")}</option>${ownLvl1.map(g => `<option value="${g.key}">${esc(VTM20.label(g))}</option>`).join("")}</select></div>
      </div>
      <div class="r-gcr-cols is-two">
        <div><h3>${t("Traits")}</h3>
          ${[["rage", base.rage, 10], ["gnosis", base.gnosis, 10], ["will", base.will, 10]].map(([k, b, m]) => `<div class="r-gcr-row"><span>${t(`T.${k}`)} <small>${t("Base", { n: b })}</small></span>
            <a class="r-gcr-step" data-action="step" data-k="${k}" data-d="-1">−</a><b>${b + st[k]}</b><a class="r-gcr-step" data-action="step" data-k="${k}" data-d="1">+</a></div>`).join("")}
          <h4>${t("Renown")} <small>${esc(fera ? t("FeraRenown") : this.auspice?.renownText ?? "")}</small></h4>
          ${RENOWN.map(k => `<div class="r-gcr-row"><span>${game.i18n.localize(`VTM20.Werewolf.Renown.${k}`)}</span>${this.renownFixed ? `<b>${r[k]}</b>` : this.#dots("renown", k, st.renown[k], 3)}</div>`).join("")}
        </div>
        <div><h3>${t("MeritsFlaws")}</h3>
          ${st.traits.map((x, i) => `<div class="r-gcr-row"><span class="${x.kind === "flaw" ? "is-flaw" : ""}">${esc(x.name)}</span><b>${x.kind === "flaw" ? "+" : "−"}${x.cost}</b><a data-action="untrait" data-i="${i}"><i class="fa-solid fa-xmark"></i></a></div>`).join("")}
          <select data-f="addTrait"><option value="">${t("AddTrait")}</option>
            <optgroup label="${t("Merits")}">${traitsAll.filter(m => m.kind === "merit").map(m => `<option value="merit:${esc(m.name)}">${esc(VTM20.label(m))} (${esc(m.cost)})</option>`).join("")}</optgroup>
            <optgroup label="${t("Flaws")}">${traitsAll.filter(m => m.kind === "flaw").map(m => `<option value="flaw:${esc(m.name)}">${esc(VTM20.label(m))} (${esc(m.cost)})</option>`).join("")}</optgroup></select>
        </div>
      </div>
    </div>
    <aside class="r-gcr-ledger">
      <div class="r-gcr-free ${l.remaining < 0 ? "is-over" : ""}"><b>${l.remaining}</b><span>${t("FreeLeft")}</span></div>
      <ul>${l.lines.map(([n, c]) => `<li><span>${esc(n)}</span><b>${c > 0 ? "−" : "+"}${Math.abs(c)}</b></li>`).join("") || `<li class="r-hint">${t("NoFree")}</li>`}</ul>
      <p class="r-hint">${t("CostHint")}</p>
      ${probs.length ? `<ul class="r-gcr-probs">${probs.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
      <a class="r-btn is-primary ${probs.length ? "is-off" : ""}" data-action="create"><i class="fa-solid fa-moon"></i> ${t("Create")}</a>
    </aside></div>`;
  }

  static #onDot(ev, el) {
    const { kind, key } = el.dataset, n = Number(el.dataset.n), st = this.st;
    if (kind === "attr") st.attr[key] = Math.max(1, st.attr[key] === n ? n - 1 : n);
    else if (kind === "abil") st.abil[key] = (st.abil[key] ?? 0) === n ? n - 1 : n;
    else if (kind === "bg") { st.bg[key] = st.bg[key] === n ? n - 1 : n; if (!st.bg[key]) delete st.bg[key]; }
    else if (kind === "renown") st.renown[key] = st.renown[key] === n ? n - 1 : n;
    this.render();
  }
  static #onStep(ev, el) {
    const k = el.dataset.k, base = this.base[k];
    this.st[k] = Math.clamp(this.st[k] + Number(el.dataset.d), 0, 10 - base);
    this.render();
  }
  static #onUntrait(ev, el) {
    if (el.dataset.gift) this.st.extra = this.st.extra.filter(k => k !== el.dataset.gift);
    else this.st.traits.splice(Number(el.dataset.i), 1);
    this.render();
  }

  /** Записать персонажа: черты, Факты, Дары, Слава, Ярость, Гнозис, Воля, достоинства и недостатки. */
  static async #onCreate() {
    const probs = this.problems();
    if (probs.length) return ui.notifications.warn(probs[0]);
    const st = this.st, a = this.actor, r = this.renown;
    const b = this.base, rage = b.rage + st.rage, gnosis = b.gnosis + st.gnosis, will = b.will + st.will, fera = this.fera;
    const upd = {
      "system.werewolf.breed": st.breed, "system.werewolf.auspice": st.auspice, "system.werewolf.tribe": st.tribe, "system.werewolf.rank": 1,
      "system.werewolf.form": fera ? fera.forms[0]?.key ?? "homid" : st.breed === "lupus" ? "lupus" : st.breed === "metis" ? "crinos" : "homid",
      "system.werewolf.fera": st.fera, "system.werewolf.feraSub": { breed: "", aspect: "", tribe: "", faction: "", pryio: "", varna: "", ...st.sub },
      "system.werewolf.rage": { permanent: rage, value: rage }, "system.werewolf.gnosis": { permanent: gnosis, value: gnosis },
      "system.werewolf.gifts": [...Object.values(st.gifts), ...st.extra].filter(Boolean),
      "system.werewolf.deformities": this.isMetis && st.deform ? [st.deform] : [],
      "system.werewolf.renown": Object.fromEntries(RENOWN.map(k => [k, { permanent: r[k], temporary: 0 }])),
      "system.willpower.permanent": will, "system.willpower.temporary": will
    };
    for (const [k, v] of Object.entries(st.attr)) upd[`system.attributes.${k}.value`] = v;
    for (const keys of Object.values(this.abilGroups)) for (const k of keys) upd[`system.abilities.${k}.value`] = st.abil[k] ?? 0;
    await a.update(upd);
    const bgs = Codex.backgrounds.filter(b => b.line === "werewolf");
    const items = [
      ...Object.entries(st.bg).filter(([, v]) => v > 0).map(([n, v]) => LibraryItems.background(bgs.find(b => b.name === n) ?? { name: n }, v)),
      ...st.traits.map(x => LibraryItems.trait(Codex.merits.find(m => m.line === "werewolf" && m.kind === x.kind && m.name === x.name) ?? x, x.cost))
    ];
    if (items.length) await a.createEmbeddedDocuments("Item", items);
    await a.setFlag(SYSTEM_ID, "created", true);
    ui.notifications.info(t("Done", { name: a.name }));
    await this.close();
    a.sheet?.render(true);
  }
}
