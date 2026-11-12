// module/apps/xp.mjs
// Окно опыта (01): все черты персонажа с ценой следующей точки, что по карману, покупка в один клик
// (через VtMActor.buyWithXp — единственный путь развития, кнопок «+» на листе нет), начисление и история трат.

import { trainingOf, trainingView, planTraining, dropTraining, finishTraining, teacherRoll, setMentor } from "./training.mjs";
import { numenOf as sorcNumenOf, numenXpExtra as sorcExtra } from "./sorcerer.mjs";
import { VTM20, SYSTEM_PATH } from "../config.mjs";
import { growth, startConviction, VIRTUE_KEYS, LOST_KEYS, isLost, H as hunterData } from "./hunter.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const loc = k => game.i18n.localize(k);

const OPEN = new Map();

export function openXp(actor) {
  const app = OPEN.get(actor.id) ?? new XpWindow(actor);
  return app.render({ force: true });
}

const sorcNumenName = k => sorcNumenOf(k)?.name ?? k;

class XpWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-xp-app"],
    window: { title: "VTM20.Xp.Window", icon: "fa-solid fa-star", resizable: true },
    position: { width: 900, height: 680 },
    actions: { buy: XpWindow.#onBuy, filter: XpWindow.#onFilter, grant: XpWindow.#onGrant, cat: XpWindow.#onCat,
      plan: XpWindow.#onPlan, trainDone: XpWindow.#onTrain, trainDrop: XpWindow.#onTrain, trainRoll: XpWindow.#onTrain }
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
      const r = { ref, label, cur, next: cur + 1, max, cost, dots, isNew: cur === 0, can: cost != null && cost <= avail,
        why: a.constructor.xpWhy(cur, cost), planned: this.planned?.has(ref), flash: ref === this.flash, search: label.toLocaleLowerCase("ru") };
      this.rows.set(ref, r);
      return r;
    };
    this.rows = new Map();
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
    const hunter = a.type === "hunter", lost = hunter && isLost(a), hxp = hunter && !lost && growth() === "xp", garou = a.type === "werewolf", mage = a.type === "mage", wraith = a.type === "wraith";
    // Маг: Арете и девять Сфер (родовая дешевле); Добродетелей и Человечности у магов нет
    // Колдун (M20 Sorcerer, гл. 3): точки нумин за опыт; новая нумина — на листе, первая её точка — здесь (7, вторичный вид — 21)
    if (s.sorcerer?.on && s.sorcerer.numina.length) groups.push({ key: "sorc", icon: "fa-hand-sparkles", label: loc("VTM20.Sorcerer.Numina"),
      rows: s.sorcerer.numina.map(n => row(`a:system.sorcerer.numina.${n.key}:sorcNumen`, sorcNumenName(n.key), n.dots, 5, "sorcNumen", sorcExtra(a, n.key))) });
    if (mage) groups.push({ key: "virt", icon: "fa-hat-wizard", label: loc("VTM20.Mage.Spheres"), rows: [
      // точку Арете покупают после Поиска — его исход отмечает рассказчик (кнопка на карточке Арете)
      (r => s.mage.seeking ? r : { ...r, can: false, label: `${r.label} — ${loc("VTM20.Mage.SeekingNeed")}` })(row("a:system.mage.arete:mageArete", loc("VTM20.Mage.Arete"), s.mage.arete, 10, "mageArete")),
      ...VTM20.mageSpheres.map(k => row(`a:system.mage.spheres.${k}:mageSphere`, a.traitLabel(`mage.${k}`), s.mage.spheres[k], 5, "mageSphere", { key: k }))] });
    // Призрак (Wraith 20, гл. 8): Арканои — новый 7, далее × 3; Добродетелей и Человечности нет
    else if (wraith) groups.push({ key: "virt", icon: "fa-ghost", label: loc("VTM20.Wraith.Arcanoi"), rows:
      VTM20.wraithArcanoi.map(k => row(`a:system.wraith.arcanoi.${k}.value:arcanos`, a.traitLabel(`wraith.${k}`), s.wraith.arcanoi[k].value, 5, "arcanos", { key: k }))
        .sort((x, y) => (y.cur > 0) - (x.cur > 0) || x.label.localeCompare(y.label, "ru")) });
    // Спектр (гл. 10): Тёмные Арканои — по той же цене, что Арканои Спектра (новый 6, далее × 2)
    if (wraith && s.wraith.spectre?.on) groups.push({ key: "dark", icon: "fa-skull", label: loc("VTM20.Wraith.Spectre.Dark"), rows:
      VTM20.wraithDark.map(k => row(`a:system.wraith.spectre.dark.${k}:arcanos`, a.traitLabel(`spectre.${k}`), s.wraith.spectre.dark[k], 5, "arcanos"))
        .sort((x, y) => (y.cur > 0) - (x.cur > 0) || x.label.localeCompare(y.label, "ru")) });
    else if (garou) groups.push({ key: "virt", icon: "fa-moon", label: loc("VTM20.Werewolf.Garou"), rows: [
      row("a:system.werewolf.rage.permanent:rage", loc("VTM20.Werewolf.Rage"), s.werewolf.rage.permanent, 10, "rage"),
      row("a:system.werewolf.gnosis.permanent:gnosis", loc("VTM20.Werewolf.Gnosis"), s.werewolf.gnosis.permanent, 10, "gnosis")] });
    else if (!hunter) groups.push({ key: "virt", icon: "fa-scale-balanced", label: loc("VTM20.Sheet.Virtues"), rows: ["conscience", "selfControl", "courage"].map(k =>
      row(`a:system.virtues.${k}.value:virtue`, a.traitLabel(`virtues.${k}`), s.virtues[k].value, 5, "virtue")) });
    else if (lost) groups.push({ key: "virt", icon: "fa-scale-balanced", label: loc("VTM20.Sheet.Virtues"), rows: LOST_KEYS.map(k =>
      row(`a:system.hunter.bystander.${k}:lostVirtue`, hunterData().bystander?.virtues?.[k] ?? k, s.hunter.bystander?.[k] ?? 0, 5, "lostVirtue")) });
    else if (hxp) groups.push({ key: "virt", icon: "fa-scale-balanced", label: t("Creator.HunterVirtues"), rows: VIRTUE_KEYS.map(k =>
      row(`a:system.hunter.${k}:hunterVirtue`, hunterData().virtues[k], s.hunter[k] ?? 0, 10, "hunterVirtue", { key: k })) });
    groups.push({ key: "other", icon: "fa-shield-heart", label: loc("VTM20.Sheet.Other"), rows: [
      a.type === "demon" ? row("a:system.faith.permanent:faith", loc("VTM20.Demon.Faith"), s.faith.permanent, 10, "faith")
        : garou || mage || wraith ? null
        : hunter ? (hxp ? row("a:system.hunter.start:hunterConviction", t("Hunter.StartConviction"), startConviction(a), 10, "hunterConviction") : null)
        : row("a:system.morality.value:morality", a.traitLabel("morality.value"), s.morality.value, 10, "morality"),
      row("a:system.willpower.permanent:willpower", t("Willpower"), s.willpower.permanent, 10, "willpower")
    ].filter(Boolean) });
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
    this.planned = new Set(trainingOf(this.actor).map(p => p.ref));
    const all = this.#groups();
    const train = this.cat === "train" ? await trainingView(this.actor, this.rows) : null;
    for (const g of all) for (const r of g.rows) r.short = r.can || r.cost == null ? 0 : r.cost - x.available;
    if (!["all", "history", "train"].includes(this.cat) && !all.some(g => g.key === this.cat)) this.cat = "all";
    const cats = [
      { key: "all", icon: "fa-layer-group", label: t("Xp.All"), afford: all.reduce((n, g) => n + g.rows.filter(r => r.can).length, 0) },
      ...all.map(g => ({ key: g.key, icon: g.icon, label: g.label, afford: g.rows.filter(r => r.can).length })),
      { key: "train", icon: "fa-graduation-cap", label: t("Train.Cat"), count: this.planned.size },
      { key: "history", icon: "fa-clock-rotate-left", label: t("Xp.History"), count: x.log.length }
    ].map(c => ({ ...c, active: c.key === this.cat }));
    const groups = ["all", "history", "train"].includes(this.cat) ? all : all.filter(g => g.key === this.cat);
    return {
      xp: x, onlyAffordable: this.onlyAffordable, groups, query: this.query, cats, history: this.cat === "history", train,
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
    // наставник в карточке обучения — сохраняется по уходу из поля
    this.element.addEventListener("change", ev => {
      const ref = ev.target.matches("input[name=mentor]") && ev.target.closest("[data-train]")?.dataset.train;
      if (ref) setMentor(this.actor, ref, ev.target.value.trim());
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
    else if (kind === "mageArete") await this.actor.update({ "system.mage.seeking": false });   // Поиск «израсходован» новой точкой
  }

  static #onFilter() { this.onlyAffordable = !this.onlyAffordable; this.render(); }

  /** Взять черту в обучение (раздел «Обучение»). */
  static async #onPlan(event, target) {
    await planTraining(this.actor, target.dataset.ref, target.dataset.label);
    this.render();
  }
  /** Карточка обучения: завершить (покупка), бросок учителя, убрать. */
  static async #onTrain(event, target) {
    const ref = target.closest("[data-train]")?.dataset.train, act = target.dataset.action;
    if (!ref) return;
    if (act === "trainDone") await finishTraining(this.actor, ref);
    else if (act === "trainRoll") await teacherRoll(this.actor, ref);
    else await dropTraining(this.actor, ref);
    this.render();
  }
  static #onCat(event, target) { this.cat = target.dataset.cat; this.render(); }

  static async #onGrant() {
    const f = this.element.querySelector(".r-xw-grant");   // класс блока в шаблоне — r-xw-grant (с r-xp-grant кнопка не работала)
    const amount = Math.trunc(Number(f.querySelector("[name=amount]").value) || 0);
    if (!amount) return;
    const reason = f.querySelector("[name=reason]").value.trim();
    const s = this.actor._source.system.experience;
    const log = foundry.utils.deepClone(s.log);
    log.unshift({ amount, reason, date: new Date().toLocaleDateString("ru-RU") });
    await this.actor.update({ "system.experience.log": log, "system.experience.total": Math.max(0, s.total + amount) });
    await this.actor.shareXpWithRetainers(amount, reason);
  }
}
