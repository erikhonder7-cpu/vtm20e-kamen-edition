// module/apps/lore-search.mjs
// «Справочники» — одно окно на все справочники системы. Пустой запрос — плитки справочников (кланы, Дома падших,
// маги, оборотни, охотники, призраки, подменыши, гули, дампиры): открыть любой без листа. Запрос от двух букв —
// поиск сразу по всем: имя, английское имя, предание, правила, факты, имена Даров и уровней. Щелчок — справочник
// открывается на найденной записи. Открывается кнопкой на панели сцены и сочетанием клавиш (Ctrl+K).
// Разметка и стили — справочника кланов (r-cl-*), своё — r-ls-*.

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { plainText } from "../data/text.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const loc = k => game.i18n.localize(`VTM20.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const MAX = 80;

/** Текст без разметки, одной строкой. */
const plain = plainText;
/** Без регистра и ё: «Чёрные» находится по «черные». */
const norm = s => String(s ?? "").toLowerCase().replace(/ё/g, "е");

let INDEX = null;

/** Индекс всех справочников (строится один раз, при первом поиске). */
async function buildIndex() {
  await Codex.load();
  const { atlasEntries } = await import("./atlas.mjs");
  const lines = await atlasEntries();
  const clans = (Codex.clans ?? []).map(c => ({ book: "clans", title: "VTM20.Clans.Title", group: loc(`ClanGroup.${c.group}`), key: c.key, name: c.name,
    sub: [c.en, c.nickname && `«${c.nickname}»`].filter(Boolean).join(" · "), sym: Codex.clanSymbol(c.key),
    text: [Codex["clan-lore"]?.[c.key], c.sect, c.disciplinesText, c.weakness].filter(Boolean).join(" \n ") }));
  const houses = [
    ...(Codex.houses ?? []).map(h => ({ book: "houses", title: "VTM20.Demon.Atlas", group: loc("Demon.AtlasHouses"), key: h.key, name: h.name,
      sub: [h.akkadian, h.en].filter(Boolean).join(" · "), icon: "fa-fire-flame-curved", text: h.text ?? "" })),
    ...(Codex.factions ?? []).map(f => ({ book: "houses", title: "VTM20.Demon.Atlas", group: loc("Demon.AtlasFactions"), key: f.key, name: f.name,
      sub: "", icon: "fa-flag", text: [f.text, Codex["line-lore"]?.demon?.faction?.[f.key]].filter(Boolean).join(" \n ") }))
  ];
  // строка карточки (Дар, Грань, уровень) встречается у нескольких записей — одна запись, «где» перечисляет все
  const entries = [], rows = new Map();
  for (const x of lines) {
    if (!x.row) { entries.push({ ...x, book: x.line }); continue; }
    const id = `${x.line}|${x.name}`, have = rows.get(id);
    if (have) { if (!have.parents.includes(x.parent)) have.parents.push(x.parent); continue; }
    rows.set(id, { ...x, book: x.line, parents: [x.parent], section: x.group.split(" · ")[0] });
  }
  for (const r of rows.values()) {
    const more = r.parents.length > 3 ? ` +${r.parents.length - 3}` : "";
    entries.push({ ...r, group: `${r.section} · ${r.parents.slice(0, 3).join(", ")}${more}` });
  }
  INDEX = [...clans, ...houses, ...entries].map(x => {
    const body = plain(x.text);
    return { ...x, body, n: norm(x.name), s: norm(x.sub), b: norm(body) };
  });
  return INDEX;
}

/** Кусок текста вокруг совпадения, совпадение — <mark>. */
function snippet(body, at, len) {
  const from = Math.max(0, at - 70), to = Math.min(body.length, at + len + 110);
  return `${from > 0 ? "…" : ""}${esc(body.slice(from, at))}<mark>${esc(body.slice(at, at + len))}</mark>${esc(body.slice(at + len, to))}${to < body.length ? "…" : ""}`;
}

/** Поиск: имя с начала > имя > английское имя/прозвище > текст карточки. */
export async function searchLore(query) {
  const q = norm(query.trim());
  if (q.length < 2) return [];
  const all = INDEX ?? await buildIndex(), hits = [];
  for (const x of all) {
    let score = 0, at = -1;
    if (x.n.startsWith(q)) score = x.row ? 95 : 100;
    else if (x.n.includes(q)) score = x.row ? 75 : 80;
    else if (x.s.includes(q)) score = 60;
    else if ((at = x.b.indexOf(q)) >= 0) score = 20 + Math.min(19, (x.b.split(q).length - 1) * 3);
    if (!score) continue;
    if (at < 0) at = x.b.indexOf(q);
    hits.push({ x, score, snip: at >= 0 ? snippet(x.body, at, q.length) : esc(x.body.slice(0, 160)) });
  }
  return hits.sort((a, b) => b.score - a.score || a.x.name.localeCompare(b.x.name)).slice(0, MAX);
}

/** Открыть справочник записи; для строки (Дар, Грань, уровень) — раскрыть её в карточке и прокрутить к ней. */
async function openEntry(book, key, row = "") {
  if (book === "clans") return (await import("./clans.mjs")).openClans(key);
  if (book === "houses") return (await import("./houses.mjs")).openHouses(key);
  await (await import("./atlas.mjs")).openAtlas(book, key);
  if (!row) return;
  const app = foundry.applications.instances.get(`r-atlas-${book}`);
  for (let i = 0; i < 20 && app; i++) {                      // карточка перерисовывается асинхронно — ждём строку
    const el = [...(app.element?.querySelectorAll(".r-cl-trait, .r-at-row") ?? [])]
      .find(x => (x.querySelector("summary span, b")?.textContent ?? "").replace(/^[IVX]+\s*/, "").trim().startsWith(row));
    if (el) {
      if (el.tagName === "DETAILS") el.open = true;
      el.scrollIntoView({ block: "center" });
      el.classList.add("r-ls-flash");
      setTimeout(() => el.classList.remove("r-ls-flash"), 1600);
      return;
    }
    await new Promise(r => setTimeout(r, 60));
  }
}

export async function openLoreSearch(query = "") {
  const open = foundry.applications.instances.get("r-lore-search");
  if (open) { open.bringToFront(); if (query) open.find(query); return open; }
  return new LoreSearch(query).render({ force: true });
}

class LoreSearch extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "r-lore-search",
    classes: ["vtm20", "r-dialog", "r-clans", "r-lore-search"],
    window: { title: "VTM20.LoreSearch.Title", icon: "fa-solid fa-book-atlas", resizable: true },
    position: { width: 760, height: 640 },
    actions: { book: LoreSearch.#onBook, hit: LoreSearch.#onHit }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/lore-search.hbs`, scrollable: [".r-ls-results"] } };

  constructor(query = "") {
    super();
    this.q = query;
  }

  async _prepareContext() {
    const { ATLAS_LINES } = await import("./atlas.mjs");
    const books = [
      { book: "clans", title: loc("Clans.Title"), icon: "fa-droplet" },
      { book: "houses", title: loc("Demon.Atlas"), icon: "fa-fire-flame-curved" },
      ...ATLAS_LINES.map(l => ({ book: l.line, title: game.i18n.localize(l.title), icon: l.icon.replace(/^fa-solid\s+/, "") }))
    ];
    return { q: this.q, books };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const input = this.element.querySelector(".r-ls-input");
    let timer = null;
    input?.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => this.find(input.value, false), 160); });
    input?.addEventListener("keydown", ev => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      this.element.querySelector(".r-ls-hit")?.click();
    });
    input?.focus();
    if (this.q) this.find(this.q, false);
  }

  /** Показать результаты запроса (без перерисовки окна — поле ввода не теряет фокус). */
  async find(query, setInput = true) {
    this.q = query;
    const el = this.element;
    if (!el) return;
    if (setInput) el.querySelector(".r-ls-input").value = query;
    const hub = el.querySelector(".r-ls-hub"), box = el.querySelector(".r-ls-results");
    const q = query.trim();
    hub.hidden = q.length >= 2;
    box.hidden = q.length < 2;
    if (q.length < 2) return;
    box.innerHTML = `<p class="r-ls-wait"><i class="fa-solid fa-spinner fa-spin"></i> ${esc(loc("LoreSearch.Indexing"))}</p>`;
    const hits = await searchLore(q);
    if (this.q !== query) return;                         // пока искали, запрос сменился
    if (!hits.length) { box.innerHTML = `<p class="r-ls-none">${esc(loc("LoreSearch.Nothing"))}</p>`; return; }
    // группы по справочнику — в порядке лучшего попадания
    const order = [], by = new Map();
    for (const h of hits) { const k = h.x.book; if (!by.has(k)) { by.set(k, []); order.push(k); } by.get(k).push(h); }
    const sym = x => x.sym ? `<span class="r-cl-medal">${Handlebars.helpers.rSym(x.sym)}</span>` : `<span class="r-cl-medal"><i class="fa-solid ${esc(x.icon ?? "fa-book")}"></i></span>`;
    box.innerHTML = `<p class="r-ls-count">${esc(game.i18n.format("VTM20.LoreSearch.Found", { n: hits.length }))}</p>` + order.map(k => {
      const list = by.get(k);
      return `<section class="r-cl-sec r-ls-book"><h3>${esc(game.i18n.localize(list[0].x.title))} <b>${list.length}</b></h3>`
        + list.map(({ x, snip }) => `<a class="r-ls-hit" data-action="hit" data-book="${esc(x.book)}" data-key="${esc(x.key)}"${x.row ? ` data-row="${esc(x.name)}"` : ""}>${sym(x)}
          <span class="r-ls-main"><span class="r-ls-name">${x.lvl ? `<i class="r-at-lvl">${esc(x.lvl)}</i>` : ""}${esc(x.name)}${x.sub ? ` <em>${esc(x.sub)}</em>` : ""}<i class="r-ls-group">${esc(x.group ?? "")}</i></span>
          <span class="r-ls-snip">${snip}</span></span></a>`).join("") + `</section>`;
    }).join("");
  }

  static #onBook(event, target) { return openEntry(target.dataset.book, ""); }
  static #onHit(event, target) { return openEntry(target.dataset.book, target.dataset.key, target.dataset.row ?? ""); }
}

/** Кнопка «Справочники» на панели сцены и сочетание клавиш (Ctrl+K). */
export function registerLoreSearch() {
  game.keybindings.register(SYSTEM_ID, "loreSearch", {
    name: "VTM20.LoreSearch.Key", editable: [{ key: "KeyK", modifiers: ["Control"] }],
    onDown: () => { openLoreSearch(); return true; }
  });
}
