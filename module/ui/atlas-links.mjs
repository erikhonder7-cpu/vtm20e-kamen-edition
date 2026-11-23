// module/ui/atlas-links.mjs
// Ссылки между книгами правил и справочниками со знака листа.
//   журнал → карточка: первое упоминание клана, Дома, племени, Традиции, Арканоса, кита… на странице — ссылка на его карточку;
//   карточка → журнал: openRulesFor(line, name) открывает страницу книги правил, где запись описана.

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";

const L = "А-Яа-яЁё";
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Падежные формы одного слова: «Аргос» → Аргоса, Аргосу…; «Фианна» → Фианны…; несколько слов — как есть. */
function forms(name) {
  if (/\s/.test(name)) return [name];
  if (/[ая]$/.test(name)) { const st = name.slice(0, -1), y = name.endsWith("я"); return [name, ...(y ? ["и", "е", "ю", "ей"] : ["ы", "е", "у", "ой", "и"]).map(e => st + e)]; }
  if (/[бвгджзйклмнпрстфхцчшщ]$/i.test(name)) return [name, ...["а", "у", "ом", "е", "ы", "ов", "ам", "ами", "ах", "и"].map(e => name + e)];
  return [name];
}

const cache = new Map();
/** Записи линейки для ссылок: [{ re, key }], длинные имена первыми. */
function linkIndex(line) {
  if (!cache.has(line)) cache.set(line, (async () => {
    await Codex.load();
    let list = [];
    if (line === "vampire") list = (Codex.clans ?? []).map(c => ({ name: c.name, key: c.key }));
    else if (line === "demon") list = [...(Codex.houses ?? []), ...(Codex.factions ?? [])].map(h => ({ name: h.name, key: h.key }));
    else { const { atlasLinkIndex } = await import("../apps/atlas.mjs"); list = await atlasLinkIndex(line); }
    return list.filter(x => x.name && x.name.length > 2).sort((a, b) => b.name.length - a.name.length)
      .map(x => ({ key: x.key, name: x.name, re: new RegExp(`(?<![${L}])(?:${forms(x.name).map(esc).join("|")})(?![${L}])`) }));
  })());
  return cache.get(line);
}

const SKIP = "h1, h2, h3, h4, a, .r-term, .r-src, .r-at-src, summary";

/** Ссылки на карточки на странице журнала (один раз на страницу). */
export async function linkifyPage(page, line) {
  if (!page || page.dataset.rLinks) return;
  page.dataset.rLinks = "1";
  const index = await linkIndex(line);
  for (const ent of index) {
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const m = ent.re.exec(node.data);
      if (!m) continue;
      const hit = node.splitText(m.index); hit.splitText(m[0].length);
      const a = document.createElement("a");
      a.className = "r-atlas-link"; a.dataset.atlasLine = line; a.dataset.atlasKey = ent.key;
      a.dataset.tooltip = game.i18n.format("VTM20.Atlas.OpenCard", { name: ent.name });
      hit.replaceWith(a); a.append(hit);
      break;
    }
  }
}

/** Открыть карточку записи по линейке и ключу. */
export async function openCard(line, key) {
  if (line === "vampire") return (await import("../apps/clans.mjs")).openClans(key);
  if (line === "demon") return (await import("../apps/houses.mjs")).openHouses(key);
  return (await import("../apps/atlas.mjs")).openAtlas(line, key);
}

/** Компендий книги правил линейки. */
const RULES_PACK = { vampire: "rules", ghoul: "rules", dhampir: "dhampir-rules", werewolf: "werewolf-rules", mage: "mage-books",
  wraith: "wraith-books", changeling: "changeling-books", hunter: "hunter-rules", demon: "demon-rules" };

/** Найти страницу книги правил, где описана запись name, и открыть её. Сначала — страница с таким заголовком, потом — где имя встречается чаще. */
export async function openRulesFor(line, name) {
  const pack = game.packs.get(`${SYSTEM_ID}.${RULES_PACK[line] ?? "rules"}`);
  if (!pack || !name) return ui.notifications.info(game.i18n.localize("VTM20.Atlas.NoRules"));
  const docs = await pack.getDocuments();
  const re = new RegExp(`(?<![${L}])(?:${forms(name).map(esc).join("|")})(?![${L}])`, "g");
  let best = null;
  for (const d of docs) for (const p of d.pages) {
    const title = re.test(p.name) ? 100 : 0; re.lastIndex = 0;
    const hits = (String(p.text?.content ?? "").replace(/<[^>]+>/g, " ").match(re) ?? []).length;
    const score = title + hits;
    if (score && (!best || score > best.score)) best = { d, p, score };
  }
  if (!best) return ui.notifications.info(game.i18n.format("VTM20.Atlas.NoRulesFor", { name }));
  await best.d.sheet.render(true, { pageId: best.p.id });
  best.d.sheet.goToPage?.(best.p.id);
}

/** Щелчок по ссылке-карточке в любом журнале. Вешается один раз. */
export function registerAtlasLinks() {
  document.addEventListener("click", ev => {
    const a = ev.target.closest?.(".r-atlas-link");
    if (!a) return;
    ev.preventDefault(); ev.stopPropagation();
    openCard(a.dataset.atlasLine, a.dataset.atlasKey);
  }, true);
}

/** Карточку справочника — в чат: имя, подзаголовок, предание или первый абзац и факты. Видят все. */
export async function postCard(card) {
  if (!card) return;
  const name = card.querySelector(".r-cl-head h2")?.textContent?.trim() ?? "";
  const kicker = card.querySelector(".r-cl-kicker")?.textContent?.trim() ?? "";
  const clean = el => { const c = el.cloneNode(true); c.querySelectorAll(".r-term").forEach(t => t.replaceWith(t.textContent)); c.querySelectorAll("a.r-atlas-link").forEach(t => t.replaceWith(t.textContent)); return c; };
  const lore = card.querySelector(".r-cl-lore, .r-at-lore");
  const body = lore ? [...clean(lore).querySelectorAll("p")].slice(0, 2).map(p => p.outerHTML).join("")
    : [...(card.querySelector(".r-at-text, .r-cl-sec p")?.closest("section") ?? card).querySelectorAll("p")].slice(0, 2).map(p => clean(p).outerHTML).join("");
  const facts = card.querySelector(".r-at-facts");
  const content = `<div class="r-atlas-chat"><div class="r-atlas-chat-kicker">${foundry.utils.escapeHTML(kicker)}</div><h3>${foundry.utils.escapeHTML(name)}</h3>${body}${facts ? clean(facts).outerHTML : ""}</div>`;
  return ChatMessage.create({ content, speaker: ChatMessage.getSpeaker() });
}

/** Кнопки в шапке карточки: «назад» (если есть история), «в книге правил», «в чат». */
export function cardTools(app, line, { back } = {}) {
  const head = app.element?.querySelector(".r-cl-card .r-cl-head");
  if (!head || head.querySelector(".r-cl-tools")) return;
  const t = k => game.i18n.localize(`VTM20.Atlas.${k}`);
  const card = head.closest(".r-cl-card"), name = head.querySelector("h2")?.textContent?.trim() ?? "";
  const tools = document.createElement("div");
  tools.className = "r-cl-tools";
  const btn = (icon, tip, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "r-cl-tool";
    b.innerHTML = `<i class="fa-solid ${icon}"></i>`; b.dataset.tooltip = tip; b.setAttribute("aria-label", tip); b.addEventListener("click", fn); tools.append(b); };
  if (back) btn("fa-arrow-left", t("Back"), back);
  btn("fa-book-open", t("ToRules"), () => openRulesFor(line, name));
  btn("fa-comment", t("ToChat"), () => postCard(card));
  head.append(tools);
}
