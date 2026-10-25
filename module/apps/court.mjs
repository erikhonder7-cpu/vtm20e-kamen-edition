// module/apps/court.mjs
// Двор города (план 3): должности Камарильи, примогены, Шабаш и анархи — кто занимает, Статус с листа,
// домен на карте города, заметка ведущего (игрокам не видна) и история назначений с датой хроники.
// Всё — в настройке мира «court»: { offices: { camarilla: [...], primogen: [...], sabbat: [...], anarch: [...] }, history: [...] }.
// Правит ведущий, игроки смотрят.

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { getClock, shortDate, nightNumber } from "./calendar.mjs";
import { citySpots, showSpotOnMap } from "../ui/citymap.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

/** Должности по умолчанию: ключи строк перевода VTM20.Court.Office.*. */
const DEFAULTS = {
  camarilla: ["prince", "seneschal", "sheriff", "harpy", "scourge", "keeper", "whip", "herald"],
  primogen: ["primogen", "primogen", "primogen", "primogen", "primogen"],
  sabbat: ["archbishop", "bishop", "priscus", "paladin", "templar", "inquisitor"],
  anarch: ["baron", "sheriff", "emissary", "herald"]
};
const SECTS = ["camarilla", "primogen", "sabbat", "anarch"];
const uid = () => foundry.utils.randomID(8);

export function registerCourt() {
  game.settings.register(SYSTEM_ID, "court", {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => foundry.applications.instances.get("r-court")?.render()
  });
}

export function openCourt(sect) {
  const open = foundry.applications.instances.get("r-court");
  if (open) { if (sect) open.sect = sect; open.render({ force: true }); open.bringToFront?.(); return open; }
  const app = new Court();
  if (sect) app.sect = sect;
  return app.render({ force: true });
}

/** Данные двора с должностями по умолчанию там, где ведущий ещё ничего не менял. */
function readCourt() {
  const raw = foundry.utils.deepClone(game.settings.get(SYSTEM_ID, "court") ?? {});
  raw.offices ??= {};
  // у должностей по умолчанию — постоянные id: пока ведущий ничего не сохранил, двор читается заново при каждой перерисовке
  for (const s of SECTS) raw.offices[s] ??= DEFAULTS[s].map((key, i) => ({ id: `${s}-${i}`, key, title: "", actorId: "", name: "", domain: null, note: "" }));
  raw.history ??= [];
  return raw;
}

const officeTitle = o => o.title || t(`Court.Office.${o.key || "custom"}`);

/** Статус персонажа — фон «Статус…» с листа (наибольший из сектантских). */
function statusOf(actor) {
  return Math.max(0, ...(actor?.items ?? []).filter(i => i.type === "background" && /^статус/i.test(i.name)).map(i => i.system.value ?? 0));
}

class Court extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "r-court",
    classes: ["vtm20", "r-dialog", "r-court-app"],
    window: { title: "VTM20.Court.Title", icon: "fa-solid fa-crown", resizable: true },
    position: { width: 1060, height: 640 },
    actions: {
      sect: Court.#onSect, pick: Court.#onPick, vacate: Court.#onVacate, addOffice: Court.#onAdd,
      removeOffice: Court.#onRemove, showDomain: Court.#onShowDomain, allDomains: Court.#onAllDomains,
      openSheet: Court.#onOpenSheet
    }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/court.hbs`, scrollable: [".r-court-list", ".r-court-side-scroll"] } };

  /** Открытый раздел: секта, примогены или история. */
  sect = "camarilla";
  /** Выбранная должность — справа её карточка. */
  picked = null;

  async _prepareContext() {
    await Codex.load();
    const c = readCourt(), gm = game.user.isGM, spots = citySpots();
    const spotName = d => d ? ([...spots.zones, ...spots.markers].find(x => x.kind === d.kind && x.id === d.id)?.name ?? null) : null;
    const row = o => {
      const a = o.actorId ? game.actors.get(o.actorId) : null;
      const st = statusOf(a);
      return {
        id: o.id, title: officeTitle(o), vacant: !a && !o.name, name: a?.name ?? o.name, img: a?.img ?? null, actorId: a?.id ?? "",
        clan: a ? (a.isVampire ? a.clanLabel : game.i18n.localize(`TYPES.Actor.${a.type}`)) : "",
        gen: a?.isVampire ? a.system.generation : null, noSheet: !a && !!o.name,
        status: st, dots: Array.from({ length: Math.max(5, st) }, (_, i) => ({ on: i < st })),
        domain: spotName(o.domain), domainRef: o.domain, note: gm ? o.note : "", picked: o.id === this.picked,
        primogenLink: o.key === "primogen" && this.sect === "camarilla"
      };
    };
    const filled = s => c.offices[s].filter(o => o.actorId || o.name).length;
    const cats = SECTS.map(s => ({ key: s, label: t(`Court.Sect.${s}`), n: c.offices[s].length, filled: filled(s), active: this.sect === s }));
    const history = this.sect === "history";
    const list = history ? [] : c.offices[this.sect].map(row);
    // примоген в списке Камарильи — одна строка-ссылка на раздел «Примогены»
    if (this.sect === "camarilla") list.push({ id: "primogen-link", primogenLink: true, title: t("Court.Office.primogen"),
      seats: c.offices.primogen.length, filled: filled("primogen") });
    const pickedRow = !history && this.picked ? c.offices[this.sect].map(row).find(r => r.id === this.picked) ?? null : null;
    if (!pickedRow) this.picked = null;
    const all = Object.values(c.offices).flat();
    const actors = game.actors.filter(a => a.type !== "creature").sort((x, y) => x.name.localeCompare(y.name, "ru"))
      .map(a => ({ id: a.id, name: a.name, selected: pickedRow?.actorId === a.id }));
    return {
      gm, cats, list, history, historyList: c.history.slice(0, 80), sect: this.sect,
      sectLabel: history ? t("Court.History") : t(`Court.Sect.${this.sect}`),
      picked: pickedRow, actors, city: spots.city,
      zones: spots.zones.map(z => ({ ...z, value: `zone:${z.id}`, selected: pickedRow?.domainRef?.kind === "zone" && pickedRow.domainRef.id === z.id })),
      markers: spots.markers.map(m => ({ ...m, value: `marker:${m.id}`, selected: pickedRow?.domainRef?.kind === "marker" && pickedRow.domainRef.id === m.id })),
      hasSpots: spots.zones.length + spots.markers.length > 0,
      total: all.length, taken: all.filter(o => o.actorId || o.name).length
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    const root = this.element;
    // Поля карточки должности — по уходу из поля
    root.addEventListener("change", ev => {
      const f = ev.target.closest("[data-field]");
      if (f && game.user.isGM && this.picked) this.#setField(this.picked, f.dataset.field, f.value);
    });
    // Перетаскивание персонажа (из каталога Foundry) на строку должности
    root.addEventListener("dragover", ev => { if (game.user.isGM && ev.target.closest("[data-office]")) ev.preventDefault(); });
    root.addEventListener("drop", async ev => {
      const rowEl = ev.target.closest("[data-office]");
      if (!rowEl || !game.user.isGM) return;
      ev.preventDefault();
      let data; try { data = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch { return; }
      if (data?.type !== "Actor") return;
      const actor = await fromUuid(data.uuid);
      if (actor) { this.picked = rowEl.dataset.office; await this.#assign(rowEl.dataset.office, actor.id, ""); }
    });
    this.hook = Hooks.on("updateActor", () => this.render());
  }

  async close(options) {
    Hooks.off("updateActor", this.hook);
    return super.close(options);
  }

  /** Записать изменение одной должности (и, если нужно, строку истории). */
  async #edit(id, fn, historyText = null) {
    const c = readCourt();
    const o = Object.values(c.offices).flat().find(x => x.id === id);
    if (!o) return;
    fn(o, c);
    if (historyText) c.history.unshift({ date: t("Court.Date", { date: shortDate(new Date(getClock())), n: nightNumber() }), text: historyText(o) });
    await game.settings.set(SYSTEM_ID, "court", c);
  }

  async #assign(id, actorId, name) {
    const who = actorId ? game.actors.get(actorId)?.name : name;
    await this.#edit(id, o => { o.actorId = actorId; o.name = actorId ? "" : name; },
      o => who ? t("Court.Appointed", { who, office: officeTitle(o) }) : t("Court.Vacated", { office: officeTitle(o) }));
  }

  async #setField(id, field, value) {
    if (field === "holder") {
      const [kind, ref] = String(value).split(":");
      return kind === "actor" ? this.#assign(id, ref, "") : this.#assign(id, "", "");
    }
    if (field === "freeName") return this.#assign(id, "", String(value).trim());
    if (field === "domain") {
      const [kind, ref] = String(value).split(":");
      return this.#edit(id, o => { o.domain = ref ? { kind, id: ref } : null; });
    }
    if (field === "title") return this.#edit(id, o => { o.title = String(value).trim(); });
    if (field === "note") return this.#edit(id, o => { o.note = String(value); });
  }

  static #onSect(event, target) {
    this.sect = target.dataset.sect; this.picked = null; this.render();
  }

  static #onPick(event, target) {
    if (target.dataset.office === "primogen-link") { this.sect = "primogen"; this.picked = null; return this.render(); }
    this.picked = this.picked === target.dataset.office ? null : target.dataset.office;
    this.render();
  }

  static async #onVacate(event, target) {
    await this.#assign(target.dataset.office ?? this.picked, "", "");
  }

  /** Своя должность — в конец открытого раздела. */
  static async #onAdd() {
    if (this.sect === "history") return;
    const title = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("Court.AddTitle"), icon: "fa-solid fa-plus" },
      classes: ["vtm20", "r-dialog"],
      content: `<div class="r-form"><label class="r-field"><span>${t("Court.AddName")}</span><input type="text" name="title" autofocus></label></div>`,
      ok: { label: t("Court.Add"), callback: (e, b) => b.form.elements.title.value.trim() },
      rejectClose: false
    });
    if (!title) return;
    const c = readCourt(), id = uid();
    c.offices[this.sect].push({ id, key: "custom", title, actorId: "", name: "", domain: null, note: "" });
    await game.settings.set(SYSTEM_ID, "court", c);
    this.picked = id;
  }

  static async #onRemove() {
    const c = readCourt();
    c.offices[this.sect] = c.offices[this.sect].filter(o => o.id !== this.picked);
    this.picked = null;
    await game.settings.set(SYSTEM_ID, "court", c);
  }

  static async #onShowDomain(event, target) {
    const [kind, id] = String(target.dataset.domain).split(":");
    if (!kind || !id) return;
    await this.minimize();   // карта города — под окном двора
    await showSpotOnMap(kind, id);
  }

  /** «Домены на карте»: просто открыть город (зоны видны на карте). */
  static async #onAllDomains() {
    const { openCity } = await import("../ui/citymap.mjs");
    await this.minimize();
    await openCity();
  }

  static #onOpenSheet(event, target) {
    game.actors.get(target.dataset.actor)?.sheet.render(true);
  }
}
