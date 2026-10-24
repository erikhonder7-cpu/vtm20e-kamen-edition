// module/apps/downtime.mjs
// Ночь простоя: между сессиями персонаж пускает в ход факты биографии — Влияние, Богатство, Стадо, Союзников,
// Информаторов, Подручных, Славу, Статус, Домен, Ментора. Пул — характеристика + рейтинг факта (или способность);
// сложность и модификаторы задаёт рассказчик. Итог — бросок в чат и строка в «Хронике» персонажа;
// бросок рассказчика ещё и дописывается в журнал ночей (настройку мира пишет только он).

import { VTM20, SYSTEM_PATH } from "../config.mjs";
import { rollPool, odds, chancesView } from "../dice/roll.mjs";
import { getClock, longDate, nightNumber, nightNote, setNightNote } from "./calendar.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

/** Факты, которые работают между сессиями: название (как в data/backgrounds.json) → характеристика, значок, цели. */
export const DOWNTIME_BACKGROUNDS = {
  influence: { name: "влияние", attr: "manipulation", icon: "fa-landmark", goals: ["pressure", "coverUp", "learn", "hinder"] },
  resources: { name: "богатство", attr: "intelligence", icon: "fa-coins", goals: ["purchase", "bribe", "haven", "invest"] },
  herd: { name: "стадо", attr: "charisma", icon: "fa-people-group", goals: ["feed", "rumors", "vessel"] },
  allies: { name: "союзники", attr: "charisma", icon: "fa-handshake", goals: ["help", "cover", "learn"] },
  contacts: { name: "информаторы", attr: "wits", icon: "fa-user-secret", goals: ["kindred", "streets", "watch"] },
  retainers: { name: "подручные", attr: "charisma", icon: "fa-user-shield", goals: ["errand", "guard", "watch"] },
  fame: { name: "слава", attr: "charisma", icon: "fa-star", goals: ["doors", "distract"] },
  status: { name: "статус", attr: "charisma", icon: "fa-crown", goals: ["gathering", "right", "favor"] },
  domain: { name: "домен", attr: "wits", icon: "fa-chess-rook", goals: ["hunt", "expel", "watch"] },
  mentor: { name: "ментор", attr: "manipulation", icon: "fa-user-graduate", goals: ["advice", "intercede"] }
};

const bgItem = (actor, name) => actor.items.find(i => i.type === "background" && i.name.trim().toLowerCase() === name);

export function openDowntime(actor, key) {
  return new DowntimeDialog(actor, key).render({ force: true });
}

/** Окно ночи простоя в стиле окна броска: факт плитками, цель, пул, сложность, шансы. */
class DowntimeDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-roll-dialog", "r-downtime-dialog"],
    tag: "form",
    window: { title: "VTM20.Downtime.Button", icon: "fa-solid fa-hourglass-half" },
    position: { width: 500 },
    form: { handler: DowntimeDialog.#onSubmit, closeOnSubmit: true, submitOnChange: false },
    actions: { pick: DowntimeDialog.#onPick, bump: DowntimeDialog.#onBump }
  };

  static PARTS = { form: { template: `${SYSTEM_PATH}/templates/apps/downtime.hbs` } };

  constructor(actor, key) {
    super({ window: { title: t("Downtime.Title", { name: actor.name }) } });
    this.actor = actor;
    this.owned = Object.entries(DOWNTIME_BACKGROUNDS).map(([k, d]) => ({ key: k, ...d, value: bgItem(actor, d.name)?.system.value ?? 0 }));
    const first = this.owned.find(b => b.key === key) ?? this.owned.find(b => b.value > 0) ?? this.owned[0];
    this.v = { key: first.key, goal: first.goals[0], custom: "", attr: first.attr, second: "bg", difficulty: 6, modDice: 0,
      messageMode: game.settings.get("core", "messageMode") };
  }

  get bg() { return this.owned.find(b => b.key === this.v.key); }

  calc() {
    const a = this.actor, v = this.v, bg = this.bg;
    const t1 = `attributes.${v.attr}`;
    const bd = [{ label: a.traitLabel(t1), value: a.traitValue(t1) }];
    if (v.second === "bg") bd.push({ label: t(`Downtime.Bg.${v.key}`), value: bg.value });
    else bd.push({ label: a.traitLabel(`abilities.${v.second}`), value: a.traitValue(`abilities.${v.second}`) });
    const wounds = a.system.health?.penalty ?? 0;
    if (wounds) bd.push({ label: t("Roll.Wounds"), value: wounds });
    if (v.modDice) bd.push({ label: t("Hunt.ModShort"), value: v.modDice });
    const pool = Math.max(0, bd.reduce((s, x) => s + x.value, 0));
    return { pool, diff: Math.min(10, Math.max(2, v.difficulty)), bd };
  }

  goalText() {
    const v = this.v;
    return v.custom.trim() || t(`Downtime.Goal.${v.goal}`);
  }

  async _prepareContext() {
    const a = this.actor, v = this.v, c = this.calc(), modes = CONFIG.ChatMessage?.modes ?? {};
    return {
      v, ...c, bg: this.bg,
      tiles: this.owned.map(b => ({ ...b, label: t(`Downtime.Bg.${b.key}`), active: b.key === v.key, dim: !b.value })),
      goals: this.bg.goals.map(g => ({ key: g, label: t(`Downtime.Goal.${g}`), selected: g === v.goal })),
      attrs: Object.keys(VTM20.attributes).map(k => ({ key: k, label: `${a.traitLabel(`attributes.${k}`)} (${a.traitValue(`attributes.${k}`)})`, selected: k === v.attr })),
      seconds: [{ key: "bg", label: `${t(`Downtime.Bg.${v.key}`)} (${this.bg.value})`, selected: v.second === "bg" },
        ...Object.keys(VTM20.abilities).map(k => ({ key: k, label: `${a.traitLabel(`abilities.${k}`)} (${a.traitValue(`abilities.${k}`)})`, value: a.traitValue(`abilities.${k}`), selected: k === v.second }))
          .filter(x => x.value > 0 || x.selected)],
      chances: chancesView(odds({ pool: c.pool, difficulty: c.diff })),
      messageModes: Object.entries(modes).map(([k, m]) => ({ value: k, label: game.i18n.localize(m.label ?? k), selected: k === v.messageMode }))
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener("change", ev => {
      const f = new foundry.applications.ux.FormDataExtended(this.element).object;
      Object.assign(this.v, { goal: f.goal ?? this.v.goal, custom: f.custom ?? "", attr: f.attr ?? this.v.attr, second: f.second ?? this.v.second,
        difficulty: Math.trunc(Number(f.difficulty) || 6), modDice: Math.trunc(Number(f.modDice) || 0), messageMode: f.messageMode ?? this.v.messageMode });
      if (ev.target.name !== "custom") this.render();
    });
  }

  static #onPick(event, target) {
    const b = this.owned.find(x => x.key === target.dataset.key);
    if (!b) return;
    Object.assign(this.v, { key: b.key, goal: b.goals[0], attr: b.attr, second: "bg" });
    this.render();
  }
  static #onBump(event, target) {
    const k = target.dataset.field, d = Number(target.dataset.d);
    this.v[k] = k === "difficulty" ? Math.max(2, Math.min(10, this.v[k] + d)) : Math.max(-10, Math.min(10, this.v[k] + d));
    this.render();
  }

  static async #onSubmit() {
    const a = this.actor, v = this.v, c = this.calc(), bg = this.bg, goal = this.goalText();
    const r = await rollPool({
      actor: a, title: t("Downtime.Button"), subtitle: `${t(`Downtime.Bg.${v.key}`)} · ${goal}`,
      pool: c.pool, difficulty: c.diff, breakdown: c.bd, kind: "check", messageMode: v.messageMode,
      notes: [`<i class="fa-solid fa-circle-info"></i> ${t("Downtime.ChatNote")}`]
    });
    if (!r) return;
    const result = r.outcome === "botch" ? t("Downtime.Result.botch")
      : r.outcome === "success" ? t("Downtime.Result.success", { n: r.successes }) : t("Downtime.Result.failure");
    const line = t("Downtime.Line", { bg: t(`Downtime.Bg.${v.key}`), goal, result });
    // строка в «Хронику» персонажа — с датой по часам хроники
    const timeline = foundry.utils.deepClone(a._source.system.timeline ?? []);
    timeline.push({ date: longDate(new Date(getClock())), text: line });
    await a.update({ "system.timeline": timeline });
    if (game.user.isGM) {
      const n = nightNumber(), prev = nightNote();
      await setNightNote(n, [prev, `${a.name}: ${line}`].filter(Boolean).join("\n"));
    }
    if (r.outcome === "botch") ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: a }),
      content: `<div class="r-notice is-warn"><i class="fa-solid fa-triangle-exclamation"></i> ${t("Downtime.Botch", { bg: t(`Downtime.Bg.${v.key}`), value: bg.value })}</div>` });
  }
}
