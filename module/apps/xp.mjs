// module/apps/xp.mjs
// Окно опыта (01): все черты персонажа с ценой следующей точки, что по карману, покупка в один клик
// (через VtMActor.buyWithXp — так же, как кнопки «+» в листе), начисление и история трат.

import { VTM20, SYSTEM_PATH } from "../config.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const loc = k => game.i18n.localize(k);

const OPEN = new Map();

export function openXp(actor) {
  const app = OPEN.get(actor.id) ?? new XpWindow(actor);
  return app.render({ force: true });
}

class XpWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-xp-app"],
    window: { title: "VTM20.Xp.Window", icon: "fa-solid fa-star", resizable: true },
    position: { width: 900, height: 680 },
    actions: { buy: XpWindow.#onBuy, filter: XpWindow.#onFilter, grant: XpWindow.#onGrant, cat: XpWindow.#onCat }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/xp.hbs`, scrollable: [".r-xp-list"] } };

  constructor(actor) {
    super({ id: `vtm20-xp-${actor.id}`, window: { title: `${t("Xp.Window")}: ${actor.name}` } });
    this.actor = actor;
    this.onlyAffordable = false;
    this.query = "";        // поиск по названию — фильтруется без перерисовки
    this.cat = "all";       // раздел слева: all, attr, talents, skills, knowledges, disc, paths, virt, other, fresh, history
    this.flash = null;      // строка, купленная последней, — короткая вспышка
    this.hook = Hooks.on("updateActor", a => { if (a === this.actor) this.render(); });
    this.hookItem = Hooks.on("updateItem", i => { if (i.parent === this.actor) this.render(); });
    OPEN.set(actor.id, this);
  }

  async close(options) {
    Hooks.off("updateActor", this.hook); Hooks.off("updateItem", this.hookItem);
    OPEN.delete(this.actor.id);
    return super.close(options);
  }

  /** Строки покупок по группам: [{ label, rows: [{ ref, label, cur, max, cost, can }] }]. */
  #groups() {
    const a = this.actor, s = a.system, avail = s.experience.available, cap = s.traitMax ?? 5;
    const row = (ref, label, cur, max, kind, extra = {}) => {
      const cost = cur >= max ? null : a.xpCost(kind, cur, extra);
      const dots = Array.from({ length: max }, (_, i) => ({ on: i < cur, next: i === cur }));
      return { ref, label, cur, next: cur + 1, max, cost, dots, isNew: cur === 0, can: cost != null && cost <= avail,
        flash: ref === this.flash, search: label.toLocaleLowerCase("ru") };
    };
    const era = game.settings.get("vtm20e-kamen-edition", "era");
    const groups = [
      { key: "attr", icon: "fa-person", label: loc("VTM20.Sheet.Attributes"), rows: Object.keys(VTM20.attributes).map(k =>
        row(`a:system.attributes.${k}.value:attribute`, loc(VTM20.attributes[k].label), s.attributes[k].value, cap, "attribute")) },
      ...Object.entries(VTM20.abilitiesForEra(era, a.type)).map(([g, keys]) => ({
        key: g, icon: { talents: "fa-bolt", skills: "fa-hammer", knowledges: "fa-book-open" }[g] ?? "fa-feather", label: loc(VTM20.abilityGroups[g].label),
        rows: keys.map(k => row(`a:system.abilities.${k}.value:ability`, loc(VTM20.abilities[k].label), s.abilities[k].value, cap, "ability"))
      }))
    ];
    if (a.hasBlood) {
      const discs = a.items.filter(i => i.type === "discipline").sort((x, y) => x.name.localeCompare(y.name, "ru"));
      if (discs.length) groups.push({ key: "disc", icon: "fa-droplet", label: loc("VTM20.Sheet.Disciplines"), rows: discs.map(i =>
        row(`i:${i.id}:system.value:discipline`, i.name, i.system.value, cap, "discipline", { key: i.system.key, inClan: i.system.inClan || a.clanDisciplines.includes(i.system.key) })) });
      const paths = a.items.filter(i => i.type === "thaumPath" && !i.system.primary);
      if (paths.length) groups.push({ key: "paths", icon: "fa-hand-sparkles", label: t("Xp.Paths"), rows: paths.map(i => row(`i:${i.id}:system.value:path`, i.name, i.system.value, 5, "path")) });
    }
    // Демон: Знания (свой Дом и общие дешевле чужих) и Вера
    if (a.type === "demon") {
      const lores = a.items.filter(i => i.type === "lore").sort((x, y) => x.name.localeCompare(y.name, "ru"));
      if (lores.length) groups.push({ key: "lore", icon: "fa-fire-flame-curved", label: loc("VTM20.Demon.Lores"), rows: lores.map(i =>
        row(`i:${i.id}:system.value:lore`, i.name, i.system.value, 5, "lore", { key: i.system.key })) });
    }
    groups.push({ key: "virt", icon: "fa-scale-balanced", label: loc("VTM20.Sheet.Virtues"), rows: ["conscience", "selfControl", "courage"].map(k =>
      row(`a:system.virtues.${k}.value:virtue`, a.traitLabel(`virtues.${k}`), s.virtues[k].value, 5, "virtue")) });
    groups.push({ key: "other", icon: "fa-shield-heart", label: loc("VTM20.Sheet.Other"), rows: [
      a.type === "demon" ? row("a:system.faith.permanent:faith", loc("VTM20.Demon.Faith"), s.faith.permanent, 10, "faith")
        : row("a:system.morality.value:morality", a.traitLabel("morality.value"), s.morality.value, 10, "morality"),
      row("a:system.willpower.permanent:willpower", t("Willpower"), s.willpower.permanent, 10, "willpower")
    ] });
    // Новые Способности (с нуля) — отдельной свёрнутой группой, чтобы не тонуть в списке
    const fresh = { key: "fresh", icon: "fa-seedling", label: t("Xp.NewAbilities"), fresh: true, rows: [] };
    for (const g of groups) {
      if (g.rows[0]?.ref.includes("system.abilities.")) { fresh.rows.push(...g.rows.filter(r => r.isNew)); g.rows = g.rows.filter(r => !r.isNew); }
      g.rows = g.rows.filter(r => r.cost != null && (!this.onlyAffordable || r.can));
    }
    fresh.rows = fresh.rows.filter(r => !this.onlyAffordable || r.can).sort((x, y) => x.label.localeCompare(y.label, "ru"));
    fresh.cost = fresh.rows[0]?.cost;
    if (fresh.rows.length) groups.push(fresh);
    return groups.filter(g => g.rows.length);
  }

  async _prepareContext() {
    const x = this.actor.system.experience;
    const all = this.#groups();
    for (const g of all) for (const r of g.rows) r.short = r.can || r.cost == null ? 0 : r.cost - x.available;
    if (this.cat !== "all" && this.cat !== "history" && !all.some(g => g.key === this.cat)) this.cat = "all";
    const cats = [
      { key: "all", icon: "fa-layer-group", label: t("Xp.All"), afford: all.reduce((n, g) => n + g.rows.filter(r => r.can).length, 0) },
      ...all.map(g => ({ key: g.key, icon: g.icon, label: g.label, afford: g.rows.filter(r => r.can).length })),
      { key: "history", icon: "fa-clock-rotate-left", label: t("Xp.History"), count: x.log.length }
    ].map(c => ({ ...c, active: c.key === this.cat }));
    const groups = this.cat === "all" || this.cat === "history" ? all : all.filter(g => g.key === this.cat);
    return {
      xp: x, onlyAffordable: this.onlyAffordable, groups, query: this.query, cats, history: this.cat === "history",
      pct: x.total > 0 ? Math.min(100, Math.round((x.spent / x.total) * 100)) : 0,
      affordable: groups.reduce((n, g) => n + g.rows.filter(r => r.can).length, 0),
      log: x.log.map(l => ({ ...l, spend: l.amount < 0, abs: Math.abs(l.amount) })),
      editable: this.actor.isOwner
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    // Поиск и раскрытие группы — делегированием на корне окна (он не пересоздаётся при перерисовке)
    this.element.addEventListener("input", ev => {
      if (!ev.target.matches(".r-xp-search-input")) return;
      this.query = ev.target.value.trim().toLocaleLowerCase("ru");
      this.#applyQuery();
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#applyQuery();
    // покупка перерисовывает окно дважды (черта, затем журнал) — вспышку гасим по времени, а не первой перерисовкой
    if (this.flash) { clearTimeout(this.flashTimer); this.flashTimer = setTimeout(() => { this.flash = null; }, 1200); }
  }

  /** Спрятать строки и группы, не подходящие под поиск. */
  #applyQuery() {
    const q = this.query;
    for (const sec of this.element.querySelectorAll(".r-xp-sec")) {
      let shown = 0;
      for (const row of sec.querySelectorAll(".r-xp-item")) {
        const ok = !q || row.dataset.search.includes(q);
        row.hidden = !ok; shown += ok;
      }
      sec.hidden = !shown;
    }
  }

  static async #onBuy(event, target) {
    const [scope, a1, a2, a3] = target.dataset.ref.split(":");
    const doc = scope === "i" ? this.actor.items.get(a1) : this.actor;
    const [path, kind] = scope === "i" ? [a2, a3] : [a1, a2];
    if (!doc || target.classList.contains("is-off")) return;
    this.flash = target.dataset.ref;
    if (!(await this.actor.buyWithXp({ doc, path, kind, label: target.dataset.label, confirm: false }))) this.flash = null;
  }

  static #onFilter() { this.onlyAffordable = !this.onlyAffordable; this.render(); }
  static #onCat(event, target) { this.cat = target.dataset.cat; this.render(); }

  static async #onGrant() {
    const f = this.element.querySelector(".r-xp-grant");
    const amount = Math.trunc(Number(f.querySelector("[name=amount]").value) || 0);
    if (!amount) return;
    const reason = f.querySelector("[name=reason]").value.trim();
    const s = this.actor._source.system.experience;
    const log = foundry.utils.deepClone(s.log);
    log.unshift({ amount, reason, date: new Date().toLocaleDateString("ru-RU") });
    await this.actor.update({ "system.experience.log": log, "system.experience.total": Math.max(0, s.total + amount) });
  }
}
