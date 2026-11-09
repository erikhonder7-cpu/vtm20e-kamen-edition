// module/apps/help.mjs
// Окно «Подсказки» — всегда под рукой: кнопка «?» на верхней плашке. Разделы слева, текст справа, поиск по всему.
// Тексты — в lang (VTM20.Help.*): разделы и пункты; пункт — «заголовок» и «как».

const { ApplicationV2 } = foundry.applications.api;
const t = k => game.i18n.localize(`VTM20.Help.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));

/** Разделы: ключ, значок, число пунктов (тексты — VTM20.Help.<key>.<n>.t / .d). */
const SECTIONS = [
  ["sheet", "fa-scroll", 6], ["hud", "fa-circle-dot", 5], ["turn", "fa-hourglass-half", 6], ["fight", "fa-khanda", 6],
  ["powers", "fa-wand-sparkles", 6], ["blood", "fa-droplet", 5], ["chat", "fa-comments", 4], ["gm", "fa-crown", 6]
];

class HelpWindow extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "r-help", classes: ["vtm20", "r-dialog", "r-help-app"],
    window: { title: "VTM20.Help.Title", icon: "fa-solid fa-circle-question", resizable: true }, position: { width: 720, height: 560 }
  };

  section = "sheet";
  query = "";

  async _renderHTML() {
    const q = this.query.trim().toLowerCase();
    const items = key => Array.from({ length: SECTIONS.find(s => s[0] === key)[2] }, (_, i) => ({ t: t(`${key}.${i + 1}.t`), d: t(`${key}.${i + 1}.d`) }));
    // поиск — по всем разделам сразу
    const found = q ? SECTIONS.flatMap(([key, icon]) => items(key).filter(x => `${x.t} ${x.d}`.toLowerCase().includes(q)).map(x => ({ ...x, key, icon }))) : null;
    const list = found ?? items(this.section).map(x => ({ ...x, key: this.section, icon: SECTIONS.find(s => s[0] === this.section)[1] }));
    return `<div class="r-help">
      <nav class="r-help-nav">
        <label class="r-help-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" name="q" value="${esc(this.query)}" placeholder="${esc(t("Search"))}"></label>
        ${SECTIONS.map(([key, icon]) => `<a class="r-help-tab${!q && key === this.section ? " is-active" : ""}" data-sec="${key}"><i class="fa-solid ${icon}"></i><span>${esc(t(`${key}.title`))}</span></a>`).join("")}
      </nav>
      <section class="r-help-body">
        <header class="r-help-head"><span class="r-help-kicker">${esc(t(q ? "Found" : "Kicker"))}</span><b>${esc(q ? `«${this.query.trim()}»` : t(`${this.section}.title`))}</b>
          ${q ? "" : `<p>${esc(t(`${this.section}.lead`))}</p>`}</header>
        ${list.length ? `<ol class="r-help-list">${list.map(x => `<li><i class="fa-solid ${x.icon}"></i><div><b>${esc(x.t)}</b><p>${esc(x.d)}</p></div></li>`).join("")}</ol>`
          : `<p class="r-help-none">${esc(t("Nothing"))}</p>`}
      </section>
    </div>`;
  }

  _replaceHTML(html, el) {
    el.innerHTML = html;
    for (const a of el.querySelectorAll("[data-sec]")) a.addEventListener("click", () => { this.section = a.dataset.sec; this.query = ""; this.render(); });
    const q = el.querySelector('[name="q"]');
    q?.addEventListener("input", foundry.utils.debounce(() => { this.query = q.value; this.render().then(() => {
      const f = this.element.querySelector('[name="q"]'); f?.focus(); f?.setSelectionRange(f.value.length, f.value.length); }); }, 180));
  }
}

let win = null;
/** Открыть подсказки (по умолчанию — раздел section). */
export function openHelp(section = null) {
  win ??= new HelpWindow();
  if (section) { win.section = section; win.query = ""; }
  return win.render({ force: true });
}
