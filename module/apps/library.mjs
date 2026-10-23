// module/apps/library.mjs
// Библиотека: выбор Дисциплины, пути магии крови, ритуала, достоинства, недостатка,
// факта биографии или психоза из справочника — карточками с полным текстом книги.
//
// Доступное стоит выше недоступного; поиск и фильтры (уровень, цена, категория,
// «только доступные») работают прямо в списке, без перерисовки.
//
// Правила V20: новая Дисциплина — 10 опыта (гулю 20), новый путь — 7; уровень ритуала
// не выше точек Дисциплины, ритуалы добываются сюжетом и опытом не покупаются;
// путь требует самой Дисциплины. «Даром» — награда рассказчика или правка листа.

import { VTM20, SYSTEM_PATH, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { blockerFor } from "../data/trait-rules.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const L = (k, d) => t(`Library.${k}`, d);
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const plain = html => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const norm = s => s.toLowerCase().replace(/ё/g, "е");
const ICON = type => `systems/${SYSTEM_ID}/assets/icons/${type}.svg`;
const KINDS = ["discipline", "path", "ritual", "combo", "merit", "flaw", "background", "derangement"];

/** Возможные цены черты: «1 / 3» → [1, 3], «1–6» → [1…6], «2» → [2]. */
function costsOf(m) {
  const raw = String(m.cost ?? "");
  if (/[–-]/.test(raw)) return Array.from({ length: m.max - m.min + 1 }, (_, i) => m.min + i);
  const list = raw.split("/").map(x => Number(x.trim())).filter(Number.isFinite);
  return list.length ? list : [m.min || 1];
}

/* ── Данные предметов (общие для листа и библиотеки) ─────────────────── */

export const LibraryItems = {
  discipline(key, value = 1) {
    const d = Codex.discipline(key);
    // «Клановость» считается по клану на лету; флаг inClan — только ручное исключение
    return { name: d?.name ?? key, type: "discipline", img: Codex.disciplineIcon(key), system: { key, value, inClan: false } };
  },
  path(disc, name, primary) {
    const pd = Codex.bloodPath(disc, name);
    return { name, type: "thaumPath", img: Codex.disciplineIcon(disc), system: { discipline: disc, value: 1, primary, description: pd?.html ?? "" } };
  },
  ritual(disc, r) {
    return { name: r.name, type: "ritual", img: Codex.disciplineIcon(disc), system: { discipline: disc, level: r.level, description: r.html, source: r.en, ...(r.roll ? { roll: r.roll } : {}) } };
  },
  /** Комбинированная Дисциплина — запись силы у первой из нужных Дисциплин. */
  combo(c) {
    const first = c.requires?.[0] ?? {};
    return { name: c.name, type: "power", img: Codex.disciplineIcon(first.key), system: {
      discipline: first.key ?? "", path: "", level: first.level ?? 1, description: c.html ?? "", source: c.en ?? "", ...(c.roll ? { roll: c.roll } : {}) } };
  },
  background(b, value = 1) {
    return { name: b.name, type: "background", img: ICON("background"), system: { value, description: b.html ?? "", source: b.en ?? "" } };
  },
  trait(m, cost) {
    return { name: m.name, type: m.kind, img: ICON(m.kind), system: { cost: cost ?? m.min ?? 1, category: m.category ?? "physical",
      clan: m.clan ?? "", sect: m.sect ?? "", description: m.html ?? "", source: m.en ?? "" } };
  },
  derangement(d) {
    return { name: d.name, type: "derangement", img: ICON("derangement"), system: { permanent: false, description: d.html ?? "", source: d.en ?? "" } };
  }
};

export class VtMLibrary extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {object} o
   * @param {Actor}  o.actor
   * @param {string} o.kind         discipline | path | ritual | merit | flaw | background | derangement
   * @param {string} [o.discipline] для путей и ритуалов
   */
  constructor(o = {}) {
    super({ id: `r-library-${o.actor?.id ?? "free"}-${o.kind}-${o.discipline ?? "all"}` });
    this.o = o;
    this.search = "";
    this.filters = { avail: false, level: 0, cat: "", scope: "" };
  }

  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-library"],
    window: { title: "VTM20.Library.Title", icon: "fa-solid fa-book-skull", resizable: true },
    position: { width: 780, height: 760 },
    actions: {
      take: VtMLibrary.#onTake,
      buy: VtMLibrary.#onBuy,
      peek: VtMLibrary.#onPeek,
      expand: VtMLibrary.#onExpand,
      setFilter: VtMLibrary.#onSetFilter
    }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/library.hbs`, scrollable: [".r-lib-list"] } };

  get title() {
    const disc = this.o.discipline ? ` · ${Codex.disciplineLabel(this.o.discipline)}` : "";
    return `${L(`Kinds.${this.o.kind}`)}${disc}`;
  }

  get actor() { return this.o.actor ?? null; }
  itemsOf(type) { return this.actor?.items.filter(i => i.type === type) ?? []; }
  dotsOf(key) { return this.itemsOf("discipline").find(i => i.system.key === key)?.system.value ?? 0; }

  async _prepareContext() {
    await Codex.load();
    const { kind } = this.o;
    const build = {
      discipline: () => this.#disciplines(), path: () => this.#paths(), ritual: () => this.#rituals(), combo: () => this.#combos(),
      merit: () => this.#traits("merit"), flaw: () => this.#traits("flaw"),
      background: () => this.#backgrounds(), derangement: () => this.#derangements()
    }[kind];
    const entries = build?.() ?? [];

    // Группы (категории черт) — с заголовком; внутри и без групп доступное выше
    const grouped = entries.some(e => e.group);
    entries.sort((a, b) => (grouped ? (a.groupOrder - b.groupOrder) : 0)
      || (b.canTake - a.canTake) || (a.has - b.has) || (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "ru"));
    let last = null;
    for (const e of entries) { e.groupHead = grouped && e.group !== last; last = e.group; }

    const f = this.filters;
    const chip = (key, value, label, icon) => ({ key, value, label, icon, active: f[key] === value });
    let chips = null;
    if (kind === "ritual") chips = [0, 1, 2, 3, 4, 5].map(v => chip("level", v, v ? ROMAN[v - 1] : L("Filter.All")));
    else if (kind === "merit" || kind === "flaw") {
      chips = [chip("cat", "", L("Filter.All")), ...Object.entries(VTM20.meritCategories)
        .map(([k, c]) => chip("cat", k, game.i18n.localize(c.label))),
        chip("cat", "sect", L("Filter.SectTraits")), chip("cat", "clan", L("Filter.Clan"))];
    } else if (kind === "discipline" && this.actor?.type === "vampire") {
      chips = [chip("scope", "", L("Filter.All")), chip("scope", "clan", L("Filter.Clan"), "fa-droplet")];
    }
    const costChips = (kind === "merit" || kind === "flaw")
      ? [chip("level", 0, L("Filter.AnyCost")), ...[1, 2, 3, 4, 5, 6, 7].map(v => chip("level", v, String(v)))] : null;

    const xp = this.actor?.system?.experience;
    return {
      kind, entries, chips, costChips, avail: f.avail,
      availCount: entries.filter(e => e.canTake).length, total: entries.length,
      rule: L(`Rule.${kind}`),
      info: this.o.discipline ? { name: Codex.disciplineLabel(this.o.discipline), dots: this.dotsOf(this.o.discipline) } : null,
      xpAvailable: xp ? xp.available : null,
      search: this.search, isGM: game.user.isGM
    };
  }

  /* ── Записи по видам ─────────────────────────────────────────────────── */

  #entry(x) {
    const reasons = x.reasons ?? [];
    const text = plain(x.text);
    return {
      group: "", groupOrder: 0, level: 0, levels: "", tags: [], powers: null, variants: null, xp: 0,
      ...x, reasons,
      // сворачиваем только длинные тексты (таблицы точек, подробные правила)
      long: !!x.long && (text.length > 280 || /<table/.test(x.text)),
      single: x.variants?.length === 1,
      canTake: !x.has && !reasons.length,
      search: norm(`${x.name} ${x.en ?? ""} ${text}`)
    };
  }

  #disciplines() {
    const a = this.actor;
    const clanD = a?.clanDisciplines ?? [];
    const have = new Set(this.itemsOf("discipline").map(i => i.system.key));
    const xp = a ? a.xpCost("discipline", 0) : 0;
    return Object.values(Codex.disciplines).map(d => {
      const sym = Codex.disciplineSymbol(d.key);
      const inClan = clanD.includes(d.key);
      const paths = d.paths ?? [];
      return this.#entry({
        id: d.key, name: d.name, en: d.en, sym, inClan, has: have.has(d.key), xp, order: inClan ? 0 : 1,
        scope: inClan ? "clan" : "",
        tags: [inClan && { label: t("Sheet.InClan"), red: true }, paths.length && { label: L("PathsN", { n: paths.length }) }].filter(Boolean),
        text: d.rules?.find(r => !r.title)?.html ?? "", long: true,
        powers: (d.powers ?? []).map((p, i) => ({ roman: ROMAN[p.level - 1] ?? p.level, name: p.name, ref: `${d.key}|${i}` })),
        pathNames: paths.map(p => p.name).join(" · ")
      });
    });
  }

  #paths() {
    const disc = this.o.discipline;
    const d = Codex.discipline(disc);
    const mine = this.itemsOf("thaumPath").filter(p => p.system.discipline === disc).map(p => p.name);
    const dots = this.dotsOf(disc);
    const xp = this.actor ? this.actor.xpCost("path", 0) : 0;
    return (d?.paths ?? []).map((p, pi) => this.#entry({
      id: String(pi), name: p.name, en: p.en, has: mine.includes(p.name), xp, sym: Codex.disciplineSymbol(disc),
      reasons: dots < 1 ? [L("NeedDiscipline", { name: d.name })] : [],
      tags: !mine.length ? [{ label: L("Primary"), red: true }] : [],
      text: p.html ?? "",
      powers: (p.powers ?? []).map((x, i) => ({ roman: ROMAN[x.level - 1] ?? x.level, name: x.name, ref: `${disc}|path|${pi}|${i}` }))
    }));
  }

  #rituals() {
    const disc = this.o.discipline;
    const mine = new Set(this.itemsOf("ritual").map(r => r.name));
    const dots = this.dotsOf(disc);
    return (Codex.rituals[disc]?.rituals ?? []).map((r, i) => this.#entry({
      id: String(i), name: r.name, en: r.en, level: r.level, levels: String(r.level), order: r.level,
      roman: ROMAN[r.level - 1] ?? r.level, has: mine.has(r.name), text: r.html ?? "", long: true,
      reasons: r.level > dots ? [L("NeedLevel", { name: Codex.disciplineLabel(disc), level: r.level })] : []
    }));
  }

  /** Комбинированные Дисциплины: нужны все перечисленные Дисциплины нужного уровня; цена в опыте — из книги. */
  #combos() {
    const mine = new Set(this.itemsOf("power").map(p => p.name));
    return (Codex.combos ?? []).map((c, i) => {
      const miss = (c.requires ?? []).filter(r => this.dotsOf(r.key) < r.level)
        .map(r => L("NeedLevel", { name: Codex.disciplineLabel(r.key), level: r.level }));
      return this.#entry({
        id: String(i), name: c.name, en: c.en, has: mine.has(c.name), text: c.html ?? "", long: true,
        xp: c.xp ?? 0, order: c.xp ?? 0, reasons: this.actor ? miss : [],
        tags: [{ label: c.requiresText }]
      });
    });
  }

  #traits(kind) {
    const mine = this.itemsOf("merit").concat(this.itemsOf("flaw")).map(i => i.name);
    const cats = Object.keys(VTM20.meritCategories);
    // Клановые и сектантские черты — своими группами после общих категорий; свой клан и своя секта — первыми
    const myClan = Codex.traitClan(this.actor?.system?.clan ?? "");
    const mySect = Codex.sectKey(this.actor?.system?.details?.sect ?? "");
    const clanOrder = [...new Set(Codex.merits.filter(m => m.clan).map(m => m.clan))];
    const sectOrder = ["camarilla", "sabbat", "anarchs"];
    const place = m => {
      if (m.clan) return { group: `clan:${m.clan}`, cat: "clan", groupName: `${L("Filter.Clan")}: ${Codex.clanName(m.clan)}`,
        groupOrder: 200 + (m.clan === myClan ? 0 : 1 + clanOrder.indexOf(m.clan)) };
      if (m.sect) return { group: `sect:${m.sect}`, cat: "sect", groupName: `${L("Filter.SectTraits")}: ${t(`Sect.${m.sect}`)}`,
        groupOrder: 100 + (m.sect === mySect ? 0 : 1 + sectOrder.indexOf(m.sect)) };
      return { group: m.category, cat: m.category, groupOrder: cats.indexOf(m.category),
        groupName: game.i18n.localize(VTM20.meritCategories[m.category]?.label ?? m.category) };
    };
    return Codex.merits.filter(m => m.kind === kind).map(m => {
      const costs = costsOf(m);
      const blocker = blockerFor(m.name, mine);
      return this.#entry({
        id: String(Codex.merits.indexOf(m)), name: m.name, en: m.en, has: mine.includes(m.name), text: m.html ?? "", long: true,
        flaw: kind === "flaw", cost: m.cost, order: costs[0],
        ...place(m),
        levels: costs.join(","),
        tags: m.source && m.source !== "V20" ? [{ label: m.source }] : [],
        variants: costs.map(c => ({ value: c, label: String(c) })),
        reasons: blocker ? [L("Blocked", { name: blocker })] : []
      });
    });
  }

  #backgrounds() {
    const mine = new Set(this.itemsOf("background").map(i => i.name));
    return Codex.backgrounds.map((b, i) => this.#entry({
      id: String(i), name: b.name, en: b.en, has: mine.has(b.name), text: b.html ?? "", long: true,
      tags: [b.sabbat && { label: t("Sect.sabbat"), red: true }, b.source && b.source !== "V20" && { label: b.source }].filter(Boolean),
      variants: [1, 2, 3, 4, 5].map(v => ({ value: v, label: "●".repeat(v) }))
    }));
  }

  #derangements() {
    const mine = new Set(this.itemsOf("derangement").map(i => i.name));
    return (Codex.derangements ?? []).map((d, i) => this.#entry({
      id: String(i), name: d.name, en: d.en, has: mine.has(d.name), text: d.html ?? "", long: true
    }));
  }

  /* ── Рендер и фильтры ────────────────────────────────────────────────── */

  _onRender(context, options) {
    super._onRender(context, options);
    const input = this.element.querySelector("[data-search]");
    input?.addEventListener("input", () => { this.search = norm(input.value.trim()); this.#applyFilter(); });
    this.#applyFilter();
  }

  #applyFilter() {
    const f = this.filters;
    let shown = 0;
    for (const card of this.element.querySelectorAll("[data-entry]")) {
      const d = card.dataset;
      const ok = (!this.search || d.search.includes(this.search))
        && (!f.level || d.levels.split(",").map(Number).includes(f.level))
        && (!f.cat || d.cat === f.cat)
        && (!f.scope || d.scope === f.scope)
        && (!f.avail || d.can === "1");
      card.hidden = !ok;
      if (ok) shown++;
    }
    for (const head of this.element.querySelectorAll("[data-group-head]")) {
      head.hidden = !this.element.querySelector(`[data-entry][data-group="${head.dataset.groupHead}"]:not([hidden])`);
    }
    // Черта между доступным и недоступным — если видны обе части
    const cards = [...this.element.querySelectorAll("[data-entry]:not([hidden]):not([data-group])")];
    cards.forEach((c, i) => c.classList.toggle("is-first-locked", c.dataset.can !== "1" && i > 0 && cards[i - 1].dataset.can === "1"));
    const empty = this.element.querySelector("[data-empty]");
    if (empty) empty.hidden = shown > 0;
    const count = this.element.querySelector("[data-count]");
    if (count) count.textContent = String(shown);
  }

  static #onSetFilter(event, target) {
    const { key } = target.dataset;
    const raw = target.dataset.value;
    if (key === "avail") this.filters.avail = !this.filters.avail;
    else this.filters[key] = key === "level" ? Number(raw) : raw;
    for (const b of this.element.querySelectorAll(`[data-action=setFilter][data-key="${key}"]`)) {
      const v = key === "level" ? Number(b.dataset.value) : b.dataset.value;
      b.classList.toggle("is-active", key === "avail" ? this.filters.avail : v === this.filters[key]);
    }
    this.#applyFilter();
  }

  /** Текст силы — под списком сил карточки, по запросу (полный справочник в DOM не кладём). */
  static #onPeek(event, target) {
    const card = target.closest("[data-entry]");
    const box = card.querySelector("[data-peek]");
    const ref = target.dataset.ref;
    const was = target.classList.contains("is-active");
    for (const a of card.querySelectorAll("[data-action=peek]")) a.classList.remove("is-active");
    if (was) { box.hidden = true; return; }
    const [k, a, b, c] = ref.split("|");
    const d = Codex.discipline(k);
    const p = a === "path" ? d?.paths[Number(b)]?.powers[Number(c)] : d?.powers[Number(a)];
    if (!p) return;
    target.classList.add("is-active");
    box.innerHTML = `<h4>${ROMAN[p.level - 1] ?? p.level} · ${p.name}${p.en ? ` <em>${p.en}</em>` : ""}</h4>${p.html ?? ""}`;
    box.hidden = false;
  }

  static #onExpand(event, target) {
    target.closest("[data-entry]")?.classList.toggle("is-open");
  }

  /* ── Взять и купить ──────────────────────────────────────────────────── */

  /** Данные предмета по карточке; value — точки факта биографии или цена черты. */
  #itemFor(target) {
    const card = target.closest("[data-entry]");
    const id = card.dataset.entry;
    const value = Number(target.dataset.value) || undefined;
    const disc = this.o.discipline;
    switch (this.o.kind) {
      case "discipline": return LibraryItems.discipline(id, 1);
      case "path": {
        const p = Codex.discipline(disc)?.paths[Number(id)];
        const first = !this.itemsOf("thaumPath").some(x => x.system.discipline === disc);
        return p ? LibraryItems.path(disc, p.name, first) : null;
      }
      case "ritual": { const r = Codex.rituals[disc]?.rituals[Number(id)]; return r ? LibraryItems.ritual(disc, r) : null; }
      case "combo": { const c = Codex.combos?.[Number(id)]; return c ? LibraryItems.combo(c) : null; }
      case "merit": case "flaw": { const m = Codex.merits[Number(id)]; return m ? LibraryItems.trait(m, value) : null; }
      case "background": { const b = Codex.backgrounds[Number(id)]; return b ? LibraryItems.background(b, value ?? 1) : null; }
      case "derangement": { const d = Codex.derangements[Number(id)]; return d ? LibraryItems.derangement(d) : null; }
    }
    return null;
  }

  static async #onTake(event, target) {
    const data = this.#itemFor(target);
    if (!data || !this.actor) return;
    await this.actor.createEmbeddedDocuments("Item", [data]);
    ui.notifications.info(L("Added", { name: data.name }));
    return this.#after(data);
  }

  /** Новая Дисциплина или путь за опыт (V20, гл. 01, таблица опыта). */
  static async #onBuy(event, target) {
    const data = this.#itemFor(target);
    const actor = this.actor;
    if (!data || !actor) return;
    const cost = Number(target.dataset.xp ?? 0);
    const xp = actor.system.experience;
    if (xp.available < cost) return ui.notifications.warn(t("Notify.NoXp", { cost, have: xp.available }));
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Xp.BuyTitle") }, content: `<p>${L("BuyConfirm", { name: data.name, cost })}</p>`
    });
    if (!ok) return;
    const log = foundry.utils.deepClone(actor._source.system.experience.log);
    log.unshift({ amount: -cost, reason: L("Learned", { name: data.name }), date: new Date().toLocaleDateString("ru-RU") });
    await actor.update({ "system.experience.spent": actor._source.system.experience.spent + cost, "system.experience.log": log });
    await actor.createEmbeddedDocuments("Item", [data]);
    ui.notifications.info(L("Added", { name: data.name }));
    return this.#after(data);
  }

  /** Новая Тауматургия или Некромантия — сразу выбрать первичный путь. */
  async #after(data) {
    const key = data.type === "discipline" ? data.system.key : null;
    if (key && VTM20.pathDisciplines.includes(key) && Codex.discipline(key)?.paths?.length) {
      await this.close();
      return openLibrary({ actor: this.actor, kind: "path", discipline: key });
    }
    this.render();
  }
}

/** Открыть библиотеку (одно окно на персонажа и вид записей). */
export function openLibrary(o) {
  if (!KINDS.includes(o.kind)) return null;
  const app = new VtMLibrary(o);
  const existing = foundry.applications.instances.get(app.id);
  if (existing) { existing.o = app.o; existing.render({ force: true }); return existing; }
  app.render({ force: true });
  return app;
}
