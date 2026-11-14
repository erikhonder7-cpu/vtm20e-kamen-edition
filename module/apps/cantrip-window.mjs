// module/apps/cantrip-window.mjs
// Окно кантрипа подменыша (C20, гл. 4): слева — Искусства витражами, лестница кантрипов (правила выбранного — под ней);
// справа — Царства карточками (знак, точки, цель текущего уровня; Сцена и Время — модификаторы +1 к сложности),
// вид кантрипа и обряд-условие переключателями, поправки сложности фишками. Внизу — итог до броска:
// пул, сложность, Гламур, кубики Кошмара и шансы (cantripCalc — тот же расчёт, что у броска rollCantrip).

import { SYSTEM_PATH } from "../config.mjs";
import { C, t, artOf, kithOf, clGlyph, cantripCalc, rollCantrip, sceneBanality } from "./changeling.mjs";
import { odds, chancesView } from "../dice/roll.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const ROMAN = ["I", "II", "III", "IV", "V"];
/** Искусства без витража — значок по смыслу (как на листе). */
const ART_ICONS = { infusion: "fa-flask-vial", taleCraft: "fa-book-open" };
const dotRow = (v, max = 5) => Array.from({ length: max }, (_, i) => ({ on: i < v }));

/** Открыть окно кантрипа (одно на персонажа; preset — Искусство, уровень, Царства, Вирд). */
export function openCantrip(actor, preset = {}) {
  const open = foundry.applications.instances.get(`r-cantrip-${actor.id}`);
  if (open) { open.preset(preset); open.bringToFront(); return open; }
  return new CantripWindow(actor, preset).render({ force: true });
}

class CantripWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-cantrip-win", "r-type-changeling"],
    window: { icon: "fa-solid fa-wand-sparkles", resizable: true },
    position: { width: 820, height: "auto" },
    actions: { art: CantripWindow.#onArt, level: CantripWindow.#onLevel, realm: CantripWindow.#onRealm, wyrd: CantripWindow.#onWyrd,
      bunk: CantripWindow.#onBunk, mod: CantripWindow.#onMod, buy: CantripWindow.#onBuy, cast: CantripWindow.#onCast }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/cantrip.hbs`, scrollable: [".r-cnt-text"] } };

  constructor(actor, preset) {
    super({ id: `r-cantrip-${actor.id}` });
    this.actor = actor;
    this.v = { art: "", level: 1, realms: [], wyrd: false, bunk: 0, mods: sceneBanality() > 0 ? ["placeBanality"] : [], buy: false };
    this.preset(preset, false);
  }

  get title() { return `${t("Cantrip")}: ${this.actor.name}`; }

  /** Принять заготовку (с листа: Искусство и уровень кантрипа). */
  preset(p = {}, rerender = true) {
    const c = this.actor.system.changeling, own = C().arts.filter(a => (c.arts[a.key] ?? 0) > 0);
    const art = own.find(a => a.key === p.art) ?? own.find(a => a.key === this.v.art) ?? own[0];
    this.v.art = art?.key ?? "";
    this.v.level = Math.clamp(p.level ?? c.arts[this.v.art] ?? 1, 1, Math.max(1, c.arts[this.v.art] ?? 1));
    if (p.realms) this.v.realms = [...p.realms];
    this.v.wyrd = p.wyrd ?? this.#fixedWyrd() ?? this.v.wyrd;
    if (rerender) this.render();
  }

  /** Вид кантрипа задан самим кантрипом (Вирд или химерический) — иначе null, выбирает игрок. */
  #fixedWyrd() {
    const type = artOf(this.v.art)?.levels.find(l => l.level === this.v.level)?.type;
    return type === "wyrd" ? true : type === "chimerical" ? false : null;
  }

  async _prepareContext() {
    const a = this.actor, c = a.system.changeling, v = this.v, R = C().cantrip ?? {}, kith = kithOf(c.kith);
    const art = artOf(v.art), calc = cantripCalc(a, v), fixed = this.#fixedWyrd();
    const glamour = (c.glamour?.temporary ?? 0) + (c.dross ?? 0);
    const realm = r => {
      const val = c.realms[r.key] ?? 0, target = val ? r.levels.find(l => l.level === Math.min(5, val)) : null;
      return { key: r.key, name: r.name, en: r.en, value: val, dots: dotRow(val), sym: clGlyph("realm", r.key), on: v.realms.includes(r.key),
        affinity: kith?.affinity === r.key, target: target?.name ?? "", targetText: target?.text ?? "", cheat: !val };
    };
    const lv = art?.levels.find(l => l.level === v.level);
    return {
      v, actor: a,
      arts: C().arts.filter(x => (c.arts[x.key] ?? 0) > 0).map(x => ({ key: x.key, name: x.name, value: c.arts[x.key], dots: dotRow(c.arts[x.key]),
        sym: clGlyph("art", x.key), icon: ART_ICONS[x.key] ?? "fa-wand-sparkles", active: x.key === v.art })),
      levels: (art?.levels ?? []).map(l => ({ level: l.level, roman: ROMAN[l.level - 1], name: l.name, type: l.type, typeLabel: l.type ? t(`Type.${l.type}`) : "",
        known: l.level <= calc.rating, active: l.level === v.level })),
      current: lv ? { name: lv.name, en: lv.en, typeLabel: lv.type ? t(`Type.${lv.type}`) : "", html: lv.html } : null,
      primary: C().realms.filter(r => !r.modifier).map(realm),
      modifiers: C().realms.filter(r => r.modifier).map(realm),
      wyrd: { on: calc.wyrd, fixed: fixed !== null, free: calc.wyrdOn, cost: R.wyrdCost ?? 1 },
      bunks: [0, 1, 2, 3, 4, 5].map(n => ({ n, label: n ? `−${n}` : "—", on: v.bunk === n })),
      mods: (R.mods ?? []).filter(m => m.key !== "affinity").map(m => ({ key: m.key, label: t(`Mod.${m.key}`), sign: m.n > 0 ? `+${m.n}` : `−${Math.abs(m.n)}`,
        up: m.n > 0, on: v.mods.includes(m.key) })),
      buy: { on: v.buy, n: R.nightmareBuy ?? 3 },
      calc, glamour, short: calc.cost > glamour, noRealm: !calc.primary.length,
      affinity: calc.affinity, nightmareNow: c.nightmare,
      chances: chancesView(odds({ pool: calc.pool, difficulty: calc.diff })),
      canCast: !!calc.primary.length && calc.cost <= glamour
    };
  }

  static #onArt(event, target) {
    const c = this.actor.system.changeling;
    this.v.art = target.dataset.key;
    this.v.level = Math.clamp(this.v.level, 1, c.arts[this.v.art] ?? 1);
    this.v.wyrd = this.#fixedWyrd() ?? this.v.wyrd;
    this.render();
  }
  static #onLevel(event, target) {
    this.v.level = Number(target.dataset.level) || 1;
    this.v.wyrd = this.#fixedWyrd() ?? this.v.wyrd;
    this.render();
  }
  static #onRealm(event, target) {
    const k = target.dataset.key, list = this.v.realms;
    this.v.realms = list.includes(k) ? list.filter(x => x !== k) : [...list, k];
    this.render();
  }
  static #onWyrd(event, target) {
    if (this.#fixedWyrd() !== null) return;
    this.v.wyrd = target.dataset.wyrd === "1";
    this.render();
  }
  static #onBunk(event, target) { this.v.bunk = Number(target.dataset.n) || 0; this.render(); }
  static #onMod(event, target) {
    const k = target.dataset.key;
    this.v.mods = this.v.mods.includes(k) ? this.v.mods.filter(x => x !== k) : [...this.v.mods, k];
    this.render();
  }
  static #onBuy() { this.v.buy = !this.v.buy; this.render(); }
  static async #onCast() {
    const o = { ...this.v, realms: [...this.v.realms], mods: [...this.v.mods] };
    if (!cantripCalc(this.actor, o).primary.length) return ui.notifications.warn(t("NeedRealm"));
    await this.close();
    return rollCantrip(this.actor, o);
  }
}
