// module/apps/hazard.mjs
// Опасности среды (V20_Основные_правила/04): огонь, солнце, падение, электричество.
// Огонь и солнце: урона не кидают — повреждения по площади, прочность со сложностью
// по интенсивности (огонь — только Стойкостью, солнце — только у владеющих Стойкостью),
// броня не помогает; повторяется каждый ход. Падение: 1d10 за 3 м, с 30 м — 10d10
// тяжёлых, броня вдвое слабее. Электричество: тяжёлые каждый ход, провал прочности —
// губительные. Окно — в стиле окна броска: вид и сила опасности плитками, модификаторы
// прочности ступеньками, разбор пула и шансы.
// Падший (Demon: The Fallen, гл. 9, с. 255–256): солнца нет — вместо него освящённая земля и святыни: при Муке 4+
// летальные раны по Вере места или предмета (1–5) каждый ход, на земле — ещё бросок Воли, чтобы остаться; при Муке 3-
// не действуют (кроме недостатка «Невозможность ступить на освящённую землю»). Летальный урон он поглощает
// Выносливостью только в апокалиптической форме; Облик с «Устойчивостью»/«Невосприимчивостью к огню» в форме не горит.

import { VTM20, SYSTEM_PATH } from "../config.mjs";
import { rollPool, odds, chancesView } from "../dice/roll.mjs";
import { suggestCheck } from "../dice/virtue-checks.mjs";
import { Codex } from "../data/codex.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

const FIRE_HEAT = { candle: 3, torch: 5, burner: 7, arc: 8, thermite: 9, metal: 10 };
const SUN_LIGHT = { dim: 3, covered: 5, window: 7, overcast: 9, direct: 10 };
const AREA = { part: 1, half: 2, whole: 3 };
const SHOCK = { outlet: 1, fence: 2, battery: 3, line: 4 };
const KIND_ICONS = { fire: "fa-fire", sun: "fa-sun", fall: "fa-person-falling", shock: "fa-bolt" };
/** Падшим: освящённая земля и святыни вместо солнца; потенциал Веры места или предмета — 1–5. */
const DEMON_KINDS = { fire: "fa-fire", holyGround: "fa-church", holyRelic: "fa-cross", fall: "fa-person-falling", shock: "fa-bolt" };
const HOLY_GROUND = { chapel: 1, church: 2, shrine: 3, ancient: 4, great: 5 };
const HOLY_RELIC = { water: 1, blessed: 2, relic: 3, venerated: 4, unique: 5 };

export function openHazard(actor) {
  return new HazardDialog(actor).render({ force: true });
}

/** Прочность против опасности и запись повреждений. */
async function sufferHazard(actor, amount, type, { pool, difficulty, title, botchToAggravated = false, breakdown = [], messageMode }) {
  let soaked = 0, botch = false;
  if (pool > 0) {
    const r = await rollPool({
      actor, title: t("Roll.Soak"), subtitle: title, pool, difficulty, kind: "soak", noBotch: !botchToAggravated, messageMode,
      breakdown: [{ label: t("Roll.Incoming"), value: amount }, ...breakdown]
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
    classes: ["vtm20", "r-dialog", "r-roll-dialog", "r-hazard"],
    tag: "form",
    window: { title: "VTM20.Hazard.Title", icon: "fa-solid fa-fire" },
    position: { width: 480 },
    form: { handler: HazardDialog.#onSubmit, closeOnSubmit: false, submitOnChange: false },
    actions: { kind: HazardDialog.#onKind, pick: HazardDialog.#onPick, bump: HazardDialog.#onBump }
  };

  static PARTS = { form: { template: `${SYSTEM_PATH}/templates/apps/hazard.hbs` } };

  constructor(actor) {
    super({ window: { title: `${t("Hazard.Title")}: ${actor.name}` } });
    this.actor = actor;
    this.v = { kind: "fire", heat: "torch", light: "direct", area: "part", meters: 6, sharp: false, shock: "outlet", ground: "church", relic: "water",
      modDice: 0, modDiff: 0, messageMode: game.settings.get("core", "messageMode") };
  }

  get tough() { const a = this.actor; return a.isVampire || (a.type === "creature" && a.system.supernatural) || (a.type === "demon" && a.system.apocalyptic); }
  get isDemon() { return this.actor.type === "demon"; }
  /** Облик в принятой форме не горит: черта «Устойчивость к огню» или «Невосприимчивость к огню». */
  get fireproof() {
    const s = this.actor.system;
    return this.isDemon && s.apocalyptic && (Codex.lore(s.visage)?.form?.low ?? []).some(n => /(Устойчивость|Невосприимчивость) к огню/.test(n));
  }
  /** Святыни ранят падшего при Муке 4+ — или при недостатке «Невозможность ступить на освящённую землю». */
  get holyHurts() { const a = this.actor; return a.system.torment.permanent >= 4 || a.items.some(i => i.type === "flaw" && /освящ/i.test(i.name)); }

  /** Что произойдёт за ход: повреждения, тип, пул прочности с разбором и сложность. */
  preview() {
    const a = this.actor, v = this.v, fort = a.discipline("fortitude"), stamina = a.system.attributes.stamina.total;
    const STA = { label: a.traitLabel("attributes.stamina"), value: stamina };
    const FORT = { label: a.traitLabel("disciplines.fortitude"), value: fort };
    let p;
    if (v.kind === "fire" && this.fireproof) return { harmless: true, harmlessText: t("Hazard.Fireproof"), bd: [], pool: 0 };
    if (v.kind === "holyGround" || v.kind === "holyRelic") {
      if (!this.holyHurts) return { harmless: true, harmlessText: t("Hazard.HolyLowTorment"), bd: [], pool: 0 };
      const n = v.kind === "holyGround" ? HOLY_GROUND[v.ground] : HOLY_RELIC[v.relic];
      // поглощение — как у любого летального: Выносливость лишь в апокалиптической форме
      p = { amount: n, type: "lethal", difficulty: 6, parts: this.tough ? [STA, FORT] : [FORT], perTurn: true, holy: v.kind };
    } else if (v.kind === "fire") {
      p = { amount: AREA[v.area], type: this.tough ? "aggravated" : "lethal", difficulty: FIRE_HEAT[v.heat], parts: [FORT], perTurn: true };
    } else if (v.kind === "sun") {
      if (!a.isVampire) return { harmless: true, bd: [], pool: 0 };
      // Светобоязнь: солнце наносит вдвое больше урона (V20, Appendix)
      const mult = a.hasTrait?.("Светобоязнь") ? 2 : 1;
      p = { amount: AREA[v.area] * mult, type: "aggravated", difficulty: SUN_LIGHT[v.light], parts: [FORT], perTurn: true };
    } else if (v.kind === "fall") {
      const terminal = v.meters >= 30;
      const type = terminal || v.sharp ? "lethal" : "bashing";
      const arm = Math.floor(a.armor.rating / (terminal ? 2 : 1));
      const parts = type === "bashing" || this.tough ? [STA, FORT] : [FORT];
      if (arm) parts.push({ label: t("Sheet.Armor"), value: arm });
      p = { dice: terminal ? 10 : Math.floor(v.meters / 3), type, difficulty: 6, parts };
    } else {
      p = { amount: SHOCK[v.shock], type: "lethal", difficulty: 6, parts: this.tough ? [STA, FORT] : [FORT], perTurn: true,
        botchToAggravated: true, breakFree: a.isVampire ? 5 : 9 };
    }
    p.bd = p.parts.filter(x => x.value);
    if (v.modDice) p.bd.push({ label: t("Hunt.ModShort"), value: v.modDice });
    p.pool = Math.max(0, p.bd.reduce((n, x) => n + x.value, 0));
    p.difficulty = Math.clamp(p.difficulty + v.modDiff, 2, 10);
    return p;
  }

  async _prepareContext() {
    const v = this.v, p = this.preview();
    const tiles = (map, cur, prefix, field) => Object.entries(map).map(([k, n]) => ({ key: k, n, field, label: t(`${prefix}.${k}`), active: k === cur }));
    const levels = v.kind === "fire" ? { cap: t("Hazard.HeatLbl"), cols: 3, list: tiles(FIRE_HEAT, v.heat, "Hazard.Heat", "heat") }
      : v.kind === "sun" ? { cap: t("Hazard.LightLbl"), cols: 3, list: tiles(SUN_LIGHT, v.light, "Hazard.Light", "light") }
      : v.kind === "shock" ? { cap: t("Hazard.ShockLbl"), cols: 2, list: tiles(SHOCK, v.shock, "Hazard.Shock", "shock") }
      : v.kind === "holyGround" ? { cap: t("Hazard.HolyGroundLbl"), cols: 3, list: tiles(HOLY_GROUND, v.ground, "Hazard.Ground", "ground") }
      : v.kind === "holyRelic" ? { cap: t("Hazard.HolyRelicLbl"), cols: 3, list: tiles(HOLY_RELIC, v.relic, "Hazard.Relic", "relic") } : null;
    const modes = CONFIG.ChatMessage?.modes ?? {};
    return {
      v, p, levels,
      areas: ["fire", "sun"].includes(v.kind) ? tiles(AREA, v.area, "Hazard.Area", "area") : null,
      kinds: Object.entries(this.isDemon ? DEMON_KINDS : KIND_ICONS).map(([k, icon]) => ({ key: k, icon, label: t(`Hazard.Kind.${k}`), active: v.kind === k })),
      kindCols: this.isDemon ? 5 : 4,
      typeLabel: p.type ? game.i18n.localize(VTM20.damageTypes[p.type].label) : "",
      chances: p.harmless || !p.pool ? null : chancesView(odds({ pool: p.pool, difficulty: p.difficulty, noBotch: !p.botchToAggravated })),
      note: { fire: t(this.isDemon ? "Hazard.FireNoteDemon" : "Hazard.FireNote"), sun: t("Hazard.SunNote"), fall: t("Hazard.FallNote"), shock: t("Hazard.ShockNote", { n: p.breakFree }),
        holyGround: t("Hazard.HolyGroundNote"), holyRelic: t("Hazard.HolyRelicNote") }[v.kind],
      isFall: v.kind === "fall",
      messageModes: Object.entries(modes).map(([k, m]) => ({ value: k, label: game.i18n.localize(m.label ?? k), selected: k === v.messageMode }))
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener("change", () => {
      const f = new foundry.applications.ux.FormDataExtended(this.element).object;
      Object.assign(this.v, {
        meters: Math.clamp(Math.trunc(Number(f.meters ?? this.v.meters) || 0), 0, 500), sharp: !!f.sharp,
        modDice: Math.trunc(Number(f.modDice) || 0), modDiff: Math.trunc(Number(f.modDiff) || 0), messageMode: f.messageMode ?? this.v.messageMode
      });
      this.render();
    });
  }

  static #onKind(event, target) { this.v.kind = target.dataset.kind; this.render(); }
  static #onPick(event, target) { this.v[target.dataset.field] = target.dataset.key; this.render(); }
  static #onBump(event, target) {
    const k = target.dataset.field, d = Number(target.dataset.d);
    if (k === "meters") this.v.meters = Math.clamp(this.v.meters + d, 0, 500);
    else { const lim = k === "modDiff" ? 5 : 10; this.v[k] = Math.clamp(this.v[k] + d, -lim, lim); }
    this.render();
  }

  static async #onSubmit() {
    const a = this.actor, p = this.preview(), title = t(`Hazard.Kind.${this.v.kind}`), messageMode = this.v.messageMode;
    if (p.harmless) return ui.notifications.info(p.harmlessText ? `${a.name}: ${p.harmlessText}` : t("Hazard.SunHarmless", { name: a.name }));
    if (this.v.kind === "fall") {
      if (p.dice <= 0) return ui.notifications.info(t("Hazard.NoFall"));
      const dmg = await rollPool({ actor: a, title, subtitle: game.i18n.localize(VTM20.damageTypes[p.type].label), pool: p.dice, difficulty: 6, kind: "damage", noBotch: true, messageMode });
      return sufferHazard(a, dmg.successes, p.type, { pool: p.pool, difficulty: p.difficulty, title, breakdown: p.bd, messageMode });
    }
    const left = await sufferHazard(a, p.amount, p.type, { pool: p.pool, difficulty: p.difficulty, title, botchToAggravated: p.botchToAggravated, breakdown: p.bd, messageMode });
    // освящённая земля: бросок Воли, чтобы остаться (гл. 9); неудача — демон спешит уйти
    if (p.holy === "holyGround") await rollPool({ actor: a, title: t("Hazard.HolyStay"), pool: a.system.willpower.permanent, difficulty: 6, kind: "holyStay", messageMode,
      breakdown: [{ label: t("Willpower"), value: a.system.willpower.permanent }] });
    // Огонь и солнце — Ротшрек (05): обжёгшись — 7, прямой солнечный свет — 8
    if (["fire", "sun"].includes(this.v.kind)) suggestCheck(a, "rotschreck", { reason: title, difficulty: left > 0 ? (this.v.kind === "sun" ? 8 : 7) : 6 });
    return left;
  }
}
