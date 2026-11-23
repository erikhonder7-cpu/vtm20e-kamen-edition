// module/apps/clans.mjs
// Справочник кланов: кланы, линии крови, ветви и антитрибу (data/clans.json) — знак, прозвище,
// секта, Дисциплины, слабость, клановые достоинства и недостатки (data/merits.json, поле clan).
// Открывается из мастера создания (карточка клана) и из листа (герб на корешке, прозвище в шапке).

import { SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { applyGlossary } from "../ui/glossary.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Открыть справочник (на клане `key`, если он задан); уже открытое окно переключается на клан. */
export async function openClans(key = "") {
  await Codex.load();
  const open = foundry.applications.instances.get("r-clans");
  if (open) { if (key) open.show(key); open.bringToFront(); return open; }
  return new ClanAtlas(key).render({ force: true });
}

class ClanAtlas extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "r-clans",
    classes: ["vtm20", "r-dialog", "r-clans"],
    window: { title: "VTM20.Clans.Title", icon: "fa-solid fa-droplet", resizable: true },
    position: { width: 880, height: 660 },
    actions: { pick: ClanAtlas.#onPick, group: ClanAtlas.#onGroup }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/clans.hbs`, scrollable: [".r-cl-list", ".r-cl-card"] } };

  constructor(key) {
    super();
    const c = Codex.clan(key) ?? Codex.clan("brujah") ?? Codex.clans[0];
    this.v = { key: c?.key ?? "", group: c?.group ?? "clan", q: "" };
  }

  show(key) {
    const c = Codex.clan(key);
    if (!c) return;
    Object.assign(this.v, { key, group: c.group, q: "" });
    this.render();
  }

  async _prepareContext() {
    const v = this.v, c = Codex.clan(v.key);
    return {
      v,
      groups: Codex.clanGroups().map(g => ({ key: g.key, label: g.label, n: g.clans.length, active: g.key === v.group })),
      list: Codex.clans.map(x => ({
        key: x.key, name: x.name.replace(/(\p{L})'(\p{L})/gu, "$1’$2"), nickname: x.nickname, group: x.group, sym: Codex.clanSymbol(x.key), active: x.key === v.key,
        text: [x.name, x.nickname, x.en, x.sect, x.disciplinesText].join(" ").toLowerCase()
      })),
      card: c ? this.#card(c) : null
    };
  }

  /** Карточка клана: всё, что нужно за столом, на одной странице. */
  #card(c) {
    const parentKey = Codex.traitClan(c.key), parent = parentKey !== c.key ? Codex.clan(parentKey) : null;
    const traits = Codex.merits.filter(m => m.clan === parentKey && Codex.visible(m));
    return {
      ...c, sym: Codex.clanSymbol(c.key), groupLabel: t(`ClanGroup.${c.group}`), parent,
      // о клане: кто они и чем живут (data/clan-lore.json, пересказ по книгам)
      lore: Codex["clan-lore"]?.[c.key] ?? "",
      discs: (c.disciplines ?? []).map(k => ({ label: Codex.disciplineLabel(k), sym: Codex.disciplineSymbol(k) })),
      choice: (c.choice ?? []).map(k => ({ label: Codex.disciplineLabel(k), sym: Codex.disciplineSymbol(k) })),
      merits: ClanAtlas.#merge(traits.filter(m => m.kind === "merit")),
      flaws: ClanAtlas.#merge(traits.filter(m => m.kind === "flaw"))
    };
  }

  /** Одно достоинство из разных книг (обычно V20 и Тёмные века) — одной строкой: основной текст, ниже вариант эпохи. */
  static #merge(list) {
    const by = new Map();
    for (const m of list) (by.get(m.name) ?? by.set(m.name, []).get(m.name)).push(m);
    return [...by.values()].map(([main, ...rest]) => {
      if (!rest.length) return main;
      const norm = c => String(c ?? "").replace(/\s*или\s*/g, " / ");
      const costs = [...new Set([main, ...rest].map(x => norm(x.cost)))];
      const tail = rest.map(x => `<h4 class="r-sec r-cl-era">${t(x.era === "darkAges" ? "Clans.DarkAges" : "Clans.OtherBook")}${x.source ? ` — ${esc(x.source)}` : ""}${norm(x.cost) !== norm(main.cost) ? ` · ${esc(x.cost)}` : ""}</h4>${x.html ?? ""}`).join("");
      return { ...main, cost: costs.join(" / "), html: `${main.html ?? ""}${tail}` };
    });
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    // Поиск фильтрует уже нарисованный список — без перерисовки, фокус не теряется
    this.element.addEventListener("input", ev => {
      if (!ev.target.matches(".r-cl-search")) return;
      this.v.q = ev.target.value;
      this.#filter();
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#filter();
    applyGlossary(this.element, "vampire");
  }

  #filter() {
    const q = this.v.q.trim().toLowerCase(), list = this.element.querySelector(".r-cl-list");
    if (!list) return;
    list.classList.toggle("is-search", !!q);
    this.element.querySelectorAll(".r-cl-groups a").forEach(a => a.classList.toggle("is-dim", !!q));
    let shown = 0;
    for (const li of list.querySelectorAll(".r-cl-item")) {
      const hit = q ? li.dataset.text.includes(q) : li.dataset.group === this.v.group;
      li.hidden = !hit;
      shown += hit;
    }
    list.querySelector(".r-cl-empty").hidden = shown > 0;
  }

  static #onPick(event, target) { this.v.key = target.dataset.key; this.render(); }
  static #onGroup(event, target) { Object.assign(this.v, { group: target.dataset.group, q: "" }); this.render(); }
}
