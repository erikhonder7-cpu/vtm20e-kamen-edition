// module/ui/hint-fold.mjs
// Пояснения к правилам не занимают места в окнах: абзац-пояснение (классы ниже и .r-explain) после отрисовки окна
// сворачивается в значок ⓘ — в заголовок своего раздела, если он стоит прямо перед абзацем, иначе в шапку окна;
// текст — подсказкой при наведении. Предупреждения (.is-warn), меняющийся на ходу текст (data-warn, data-note…)
// и абзацы с [data-keep] остаются на месте.

const HINTS = [".r-choice-hint", ".r-hint", ".r-feed-hint", ".r-wc-lead", ".r-cr-hint", ".r-hint-note", ".r-court-hint", ".r-sn-hint",
  ".r-editor-hint", ".r-roll-note", ".r-explain"];
const SKIP = ".is-warn, [data-keep], [data-warn], [data-note], [data-why], [data-instinct-note], [hidden]";
const HEADS = "h1, h2, h3, h4, .r-h2, .r-banner, .r-vc-head, .r-wh";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Значок с подсказкой: один на заголовок, тексты нескольких абзацев — через пустую строку. */
function addIcon(host, text, cls = "") {
  let i = host.querySelector(":scope > .r-hint-i");
  if (!i) {
    i = document.createElement("i");
    i.className = `fa-solid fa-circle-info r-hint-i ${cls}`.trim();
    i.setAttribute("aria-label", text);
    host.append(i);
  }
  const all = [...(i._hints ?? []), text].filter((x, n, a) => a.indexOf(x) === n);
  i._hints = all;
  i.dataset.tooltipHtml = all.map(esc).join("<br><br>");
  i.dataset.tooltipClass = "r-hint-tip";
}

/**
 * Заголовок раздела над абзацем: сосед слева или первый заголовок родителя до абзаца; если нет — то же для родителей
 * (до четырёх уровней: заглушка внутри редактора — к заголовку над редактором).
 */
const bannerOf = h => h.matches(".r-vc-head") ? h.querySelector(".r-banner") ?? h : h;
function headOf(el, root) {
  for (let n = el, depth = 0; n && n !== root && depth < 4; n = n.parentElement, depth++) {
    const prev = n.previousElementSibling;
    if (prev?.matches(HEADS)) return bannerOf(prev);
    const h = n.parentElement && [...n.parentElement.children].find(c => c !== n && c.matches(HEADS) && (c.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (h) return bannerOf(h);
  }
  return null;
}

function foldHints(app, root) {
  if (!(root instanceof HTMLElement)) return;
  const header = app?.window?.header ?? null;
  // шапка окна перерисовывается не всегда — старый значок окна сначала убрать
  header?.querySelector(":scope > .r-hint-i")?.remove();
  for (const el of root.querySelectorAll(HINTS.join(", "))) {
    if (el.matches(SKIP) || el.closest(SKIP)) continue;
    const text = el.textContent.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const head = headOf(el, root);
    if (head) addIcon(head, text);
    else if (header) {
      const title = header.querySelector(".window-title");
      addIcon(header, text, "is-window");
      const i = header.querySelector(":scope > .r-hint-i");
      if (title && i) title.after(i);
    }
    else continue;                     // окно без шапки (HUD, штора) — абзац остаётся
    el.classList.add("is-folded");
  }
}

export function registerHintFold() {
  Hooks.on("renderApplicationV2", (app, el) => foldHints(app, el));
}
