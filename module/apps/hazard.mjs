// module/apps/hazard.mjs
// Опасности среды (V20_Основные_правила/04): огонь, солнце, падение, электричество.
// Огонь и солнце: урона не кидают — повреждения по площади, прочность со сложностью
// по интенсивности (огонь — только Стойкостью, солнце — только у владеющих Стойкостью),
// броня не помогает; повторяется каждый ход. Падение: 1d10 за 3 м, с 30 м — 10d10
// тяжёлых, броня вдвое слабее. Электричество: тяжёлые каждый ход, провал прочности —
// губительные.

import { VTM20, SYSTEM_PATH } from "../config.mjs";
import { rollPool } from "../dice/roll.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

const FIRE_HEAT = { candle: 3, torch: 5, burner: 7, arc: 8, thermite: 9, metal: 10 };
const SUN_LIGHT = { dim: 3, covered: 5, window: 7, overcast: 9, direct: 10 };
const AREA = { part: 1, half: 2, whole: 3 };
const SHOCK = { outlet: 1, fence: 2, battery: 3, line: 4 };

export function openHazard(actor) {
  return new HazardDialog(actor).render({ force: true });
}

/** Прочность против опасности и запись повреждений. */
async function sufferHazard(actor, amount, type, { pool, difficulty, title, botchToAggravated = false }) {
  let soaked = 0, botch = false;
  if (pool > 0) {
    const r = await rollPool({
      actor, title: t("Roll.Soak"), subtitle: title, pool, difficulty, kind: "soak", noBotch: !botchToAggravated,
      breakdown: [{ label: t("Roll.Incoming"), value: amount }]
    });
    soaked = r.successes; botch = r.outcome === "botch";
  }
  let left = Math.max(0, amount - soaked);
  if (botch && botchToAggravated) type = "aggravated";
  if (type === "bashing" && actor.isVampire) left = Math.floor(left / 2);
  if (left > 0) await actor.applyDamage(left, type);
  else ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice"><i class="fa-solid fa-shield"></i> ${t("Notify.NoDamage")}</div>` });
  return left;
}

class HazardDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-hazard"],
    tag: "form",
    window: { title: "VTM20.Hazard.Title", icon: "fa-solid fa-fire" },
    position: { width: 420 },
    form: { handler: HazardDialog.#onSubmit, closeOnSubmit: false, submitOnChange: false },
    actions: { kind: HazardDialog.#onKind }
  };

  static PARTS = { form: { template: `${SYSTEM_PATH}/templates/apps/hazard.hbs` } };

  constructor(actor) {
    super({ window: { title: `${t("Hazard.Title")}: ${actor.name}` } });
    this.actor = actor;
    this.v = { kind: "fire", heat: "torch", light: "direct", area: "part", meters: 6, sharp: false, shock: "outlet" };
  }

  get tough() { const a = this.actor; return a.isVampire || (a.type === "creature" && a.system.supernatural); }

  /** Что произойдёт за ход: повреждения, тип, пул и сложность прочности. */
  preview() {
    const a = this.actor, v = this.v, fort = a.discipline("fortitude"), stamina = a.system.attributes.stamina.total;
    if (v.kind === "fire") {
      const type = this.tough ? "aggravated" : "lethal";
      return { amount: AREA[v.area], type, difficulty: FIRE_HEAT[v.heat], pool: type === "aggravated" ? fort : (this.tough ? stamina : 0) + fort, perTurn: true };
    }
    if (v.kind === "sun") {
      if (!a.isVampire) return { harmless: true };
      // Светобоязнь: солнце наносит вдвое больше урона (V20, Appendix)
      const mult = a.hasTrait?.("Светобоязнь") ? 2 : 1;
      return { amount: AREA[v.area] * mult, type: "aggravated", difficulty: SUN_LIGHT[v.light], pool: fort, perTurn: true };
    }
    if (v.kind === "fall") {
      const terminal = v.meters >= 30;
      const dice = terminal ? 10 : Math.floor(v.meters / 3);
      const type = terminal || v.sharp ? "lethal" : "bashing";
      const arm = Math.floor(a.armor.rating / (terminal ? 2 : 1));
      const pool = type === "bashing" || this.tough ? stamina + fort + arm : fort + arm;
      return { dice, type, difficulty: 6, pool, terminal };
    }
    const type = "lethal";
    return { amount: SHOCK[v.shock], type, difficulty: 6, pool: (this.tough ? stamina : 0) + fort, perTurn: true, botchToAggravated: true, breakFree: a.isVampire ? 5 : 9 };
  }

  async _prepareContext() {
    const v = this.v, p = this.preview();
    const opt = (map, cur, prefix) => Object.entries(map).map(([k, n]) => ({ value: k, label: `${t(`${prefix}.${k}`)} (${n})`, selected: k === cur }));
    return {
      v, p, kinds: ["fire", "sun", "fall", "shock"].map(k => ({ key: k, label: t(`Hazard.Kind.${k}`), active: v.kind === k,
        icon: { fire: "fa-fire", sun: "fa-sun", fall: "fa-person-falling", shock: "fa-bolt" }[k] })),
      heats: opt(FIRE_HEAT, v.heat, "Hazard.Heat"), lights: opt(SUN_LIGHT, v.light, "Hazard.Light"),
      areas: opt(AREA, v.area, "Hazard.Area"), shocks: opt(SHOCK, v.shock, "Hazard.Shock"),
      typeLabel: p.type ? game.i18n.localize(VTM20.damageTypes[p.type].label) : "",
      isFire: v.kind === "fire", isSun: v.kind === "sun", isFall: v.kind === "fall", isShock: v.kind === "shock"
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.addEventListener("change", () => {
      const f = new foundry.applications.ux.FormDataExtended(this.element).object;
      Object.assign(this.v, { heat: f.heat ?? this.v.heat, light: f.light ?? this.v.light, area: f.area ?? this.v.area,
        shock: f.shock ?? this.v.shock, meters: Math.max(0, Number(f.meters) || 0), sharp: !!f.sharp });
      this.render();
    });
  }

  static #onKind(event, target) { this.v.kind = target.dataset.kind; this.render(); }

  static async #onSubmit() {
    const a = this.actor, p = this.preview(), title = t(`Hazard.Kind.${this.v.kind}`);
    if (p.harmless) return ui.notifications.info(t("Hazard.SunHarmless", { name: a.name }));
    if (this.v.kind === "fall") {
      if (p.dice <= 0) return ui.notifications.info(t("Hazard.NoFall"));
      const dmg = await rollPool({ actor: a, title, subtitle: game.i18n.localize(VTM20.damageTypes[p.type].label), pool: p.dice, difficulty: 6, kind: "damage", noBotch: true });
      return sufferHazard(a, dmg.successes, p.type, { pool: p.pool, difficulty: 6, title });
    }
    return sufferHazard(a, p.amount, p.type, { pool: p.pool, difficulty: p.difficulty, title, botchToAggravated: p.botchToAggravated });
  }
}
