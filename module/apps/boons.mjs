// module/apps/boons.mjs
// Престация — долги услуг между Сородичами. Запись у персонажа (system.boons):
//   name — с кем, dir — «owed» (мне должны) или «owe» (я должен), level — вес услуги,
//   note — за что, date — ночь по часам хроники (ГГГГ-ММ-ДД), done — погашена.
// Реестр услуг собирает записи всех видимых персонажей в одну тетрадь гарпии.

import { SYSTEM_PATH } from "../config.mjs";
import { getClock, ymd } from "./calendar.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

/** Вес услуги — от пустяка до долга жизнью. */
export const BOON_LEVELS = ["trivial", "minor", "major", "blood", "life"];
export const boonLevelLabel = level => t(`Boon.Level.${BOON_LEVELS.includes(level) ? level : "minor"}`);
const today = () => ymd(new Date(getClock()));

/** Новая услуга в конец списка: по умолчанию малая, сегодняшней ночью. */
export async function addBoon(actor, dir = "owed") {
  const list = foundry.utils.deepClone(actor._source.system.boons ?? []);
  list.push({ name: "", dir, level: "minor", note: "", date: today(), done: false });
  await actor.update({ "system.boons": list });
}

/** Погасить услугу или вернуть её в открытые. */
export async function toggleBoon(actor, index) {
  const list = foundry.utils.deepClone(actor._source.system.boons ?? []);
  const b = list[index];
  if (!b) return;
  b.done = !b.done;
  await actor.update({ "system.boons": list });
}

export async function removeBoon(actor, index) {
  const list = foundry.utils.deepClone(actor._source.system.boons ?? []);
  list.splice(index, 1);
  await actor.update({ "system.boons": list });
}

/** Записи всех персонажей, которых пользователь видит: должник → кредитор. Встречные записи двух листов — одной строкой. */
export function boonLedger() {
  const rows = new Map();
  for (const actor of game.actors) {
    if (!actor.testUserPermission(game.user, "OBSERVER")) continue;
    (actor.system.boons ?? []).forEach((b, index) => {
      const other = (b.name || "").trim() || "?";
      const [debtor, creditor] = b.dir === "owe" ? [actor.name, other] : [other, actor.name];
      const key = [debtor, creditor, b.level, b.done ? 1 : 0, (b.note || "").trim()].map(s => String(s).toLowerCase()).join("|");
      const row = rows.get(key) ?? { debtor, creditor, level: b.level, note: b.note || "", date: b.date || "", done: !!b.done, sources: [] };
      row.sources.push({ actorId: actor.id, index });
      if (b.date && (!row.date || b.date < row.date)) row.date = b.date;
      rows.set(key, row);
    });
  }
  return [...rows.values()].sort((a, b) => (a.done - b.done) || (BOON_LEVELS.indexOf(b.level) - BOON_LEVELS.indexOf(a.level)) || b.date.localeCompare(a.date));
}

export function openBoons() {
  const open = foundry.applications.instances.get("r-boons");
  if (open) { open.render(); open.bringToFront(); return open; }
  return new BoonLedger().render({ force: true });
}

/** Баланс по открытым услугам: на каждого — сколько должен и сколько должны ему; ромб за ступень веса (тривиальная 1 … жизненная 5). */
function balanceOf(rows) {
  const by = new Map(), get = name => by.get(name) ?? by.set(name, { name, owes: [], owed: [] }).get(name);
  for (const r of rows) if (!r.done) { get(r.debtor).owes.push(r.level); get(r.creditor).owed.push(r.level); }
  const marks = list => "◆".repeat(Math.min(15, list.reduce((s, l) => s + BOON_LEVELS.indexOf(l) + 1, 0)));
  const tip = list => list.map(boonLevelLabel).join(", ");
  return [...by.values()].map(x => ({ name: x.name, owes: marks(x.owes), owed: marks(x.owed), owesTip: tip(x.owes), owedTip: tip(x.owed),
    weight: x.owes.length + x.owed.length })).sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name, "ru"));
}

/** Реестр услуг: открытые долги сверху, тяжёлые раньше пустяков; фильтр по состоянию, весу и имени. */
class BoonLedger extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "r-boons",
    classes: ["vtm20", "r-dialog", "r-boons"],
    window: { title: "VTM20.Boon.Ledger", icon: "fa-solid fa-scale-balanced", resizable: true },
    position: { width: 900, height: 560 },
    actions: { state: BoonLedger.#onState, level: BoonLedger.#onLevel, open: BoonLedger.#onOpen }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/boons.hbs`, scrollable: [".r-bn-list"] } };

  v = { state: "open", level: "", q: "" };

  async _prepareContext() {
    const v = this.v, all = boonLedger();
    const rows = all.filter(r => (v.state === "all" || (v.state === "done") === r.done) && (!v.level || r.level === v.level));
    return {
      v,
      states: ["open", "done", "all"].map(k => ({ key: k, label: t(`Boon.State.${k}`), active: v.state === k,
        n: k === "all" ? all.length : all.filter(r => r.done === (k === "done")).length })),
      levels: BOON_LEVELS.map(k => ({ key: k, label: boonLevelLabel(k), active: v.level === k, n: all.filter(r => !r.done && r.level === k).length })),
      rows: rows.map(r => ({ ...r, levelLabel: boonLevelLabel(r.level), weight: BOON_LEVELS.indexOf(r.level),
        source: r.sources[0], text: [r.debtor, r.creditor, r.note].join(" ").toLowerCase() })),
      empty: !all.length,
      openN: all.filter(r => !r.done).length, doneN: all.filter(r => r.done).length,
      balance: balanceOf(all)
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // поиск по имени и заметке без перерисовки окна
    const input = this.element.querySelector(".r-bn-search");
    const apply = () => {
      const q = (this.v.q = input.value.trim().toLowerCase());
      let shown = 0;
      for (const li of this.element.querySelectorAll(".r-bn-row")) { const on = !q || li.dataset.text.includes(q); li.hidden = !on; shown += on; }
      this.element.querySelector(".r-bn-none").hidden = !!shown;
    };
    input?.addEventListener("input", apply);
    if (input) apply();
  }

  static #onState(event, target) { this.v.state = target.dataset.state; this.render(); }
  static #onLevel(event, target) { this.v.level = this.v.level === target.dataset.level ? "" : target.dataset.level; this.render(); }
  static #onOpen(event, target) { game.actors.get(target.dataset.actorId)?.sheet.render({ force: true }); }
}

// реестр живёт вместе с листами: любая правка услуг — перерисовать открытый реестр
Hooks.on("updateActor", (actor, change) => {
  if (change.system?.boons !== undefined) foundry.applications.instances.get("r-boons")?.render();
});
