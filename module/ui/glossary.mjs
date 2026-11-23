// module/ui/glossary.mjs
// Термины с подсказкой в карточках справочников (кланы, Дома, атласы линеек): первое упоминание термина в тексте карточки
// подчёркивается пунктиром, по наведению — пояснение (data-tooltip, подсказки Foundry). Заголовки, плашки и ссылки не трогаем.

import { glossaryFor } from "../data/glossary.mjs";

const L = "А-Яа-яЁё";
const cache = new Map();
/** Регулярные выражения линейки: каждая форма — отдельным словом, с учётом регистра. */
function compiled(line) {
  if (!cache.has(line)) cache.set(line, glossaryFor(line).map(t => ({
    def: t.def, title: t.forms[0],
    re: new RegExp(`(?<![${L}])(?:${t.forms.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![${L}])`)
  })));
  return cache.get(line);
}

const SKIP = "h1, h2, h3, h4, summary, a, button, .r-term, .r-cl-head, .r-cl-disc, .r-at-src, .r-src, dt, .r-at-lvl";

/** Расставить подсказки в карточке root (элемент .r-cl-card) для линейки line. */
export function applyGlossary(root, line) {
  const card = root?.querySelector?.(".r-cl-card");
  if (!card || card.dataset.rGloss) return;
  card.dataset.rGloss = "1";
  for (const term of compiled(line)) {
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const m = term.re.exec(node.data);
      if (!m) continue;
      const hit = node.splitText(m.index);
      hit.splitText(m[0].length);
      const span = document.createElement("span");
      span.className = "r-term";
      span.dataset.tooltip = `${term.title} — ${term.def}`;
      span.dataset.tooltipDirection = "UP";
      hit.replaceWith(span);
      span.append(hit);
      break;   // только первое упоминание
    }
  }
}
