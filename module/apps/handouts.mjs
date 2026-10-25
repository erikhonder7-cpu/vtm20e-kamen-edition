// module/apps/handouts.mjs
// Раздатки игрокам: страница журнала — посланием Сородича (тёмный лист в цветах системы), указом двора,
// письмом, запиской или газетной вырезкой, одной кнопкой. Без примет эпохи — годится для любой хроники.
// В заголовке журнала у ведущего — «Раздатка игрокам»: стиль, кому, подпись, печать. Текст страницы
// (секреты вырезаются) уходит в сообщение чата — игрокам не нужен доступ к журналу; у адресатов документ
// открывается сам, а карточка в чате открывает его снова.

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

export const HANDOUT_STYLES = ["kindred", "decree", "letter", "note", "gazette"];

export function registerHandouts() {
  // кнопка в заголовке журнала — только ведущему
  Hooks.on("getHeaderControlsJournalEntrySheet", (app, controls) => {
    if (!game.user.isGM) return;
    controls.push({ icon: "fa-solid fa-envelope-open-text", label: "VTM20.Handout.Give", action: "vtm20Handout",
      onClick: () => giveHandout(app.document.pages.get(app.pageId) ?? app.document.pages.contents[0]) });
  });
  // адресату документ открывается сам (кроме того, кто отправил); карточка — открыть снова
  Hooks.on("createChatMessage", message => {
    const h = message.flags?.[SYSTEM_ID]?.handout;
    if (h && message.isContentVisible && message.author?.id !== game.user.id) showHandout(message);
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.flags?.[SYSTEM_ID]?.handout) return;
    html.querySelector("[data-r-handout]")?.addEventListener("click", () => showHandout(message));
  });
}

/** Диалог раздатки для страницы журнала: стиль, адресаты, подпись, печать. */
export async function giveHandout(page) {
  if (!page) return ui.notifications.warn(t("Handout.NoPage"));
  const players = game.users.filter(u => !u.isGM);
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Handout.Title", { name: page.name }), icon: "fa-solid fa-envelope-open-text" }, classes: ["vtm20", "r-dialog"],
    content: `<label class="r-field"><span>${t("Handout.Style")}</span><select name="style">${HANDOUT_STYLES.map(s => `<option value="${s}">${t(`Handout.S.${s}`)}</option>`).join("")}</select></label>
      <label class="r-field"><span>${t("Handout.Sign")}</span><input type="text" name="sign" placeholder="${t("Handout.SignHint")}"></label>
      <label class="r-field r-field-check"><input type="checkbox" name="seal" checked> ${t("Handout.Seal")}</label>
      <p class="r-hint">${t("Handout.To")}</p>
      ${players.map(u => `<label class="r-field r-field-check"><input type="checkbox" name="to" value="${u.id}" checked> ${esc(u.name)}${u.character ? ` <em>(${esc(u.character.name)})</em>` : ""}</label>`).join("") || `<p class="r-empty">${t("Handout.NoPlayers")}</p>`}`,
    ok: { label: t("Handout.Send"), callback: (e, b) => ({ style: b.form.elements.style.value, sign: b.form.elements.sign.value.trim(), seal: b.form.elements.seal.checked,
      to: [...b.form.querySelectorAll("input[name=to]:checked")].map(x => x.value) }) },
    rejectClose: false
  });
  if (!res) return;
  // секреты страницы игрокам не уходят; ссылки и броски — как в журнале
  const body = page.type === "image" ? `<img src="${esc(page.src)}" alt="">`
    : await foundry.applications.ux.TextEditor.implementation.enrichHTML(page.text?.content ?? "", { secrets: false, relativeTo: page });
  const all = res.to.length === players.length;
  const msg = await ChatMessage.create({
    speaker: { alias: t("Handout.From") },
    whisper: all ? [] : [...res.to, game.user.id],
    flags: { [SYSTEM_ID]: { handout: { title: page.name, html: body, style: res.style, sign: res.sign, seal: res.seal } } },
    content: `<div class="r-notice r-ho-card"><i class="fa-solid fa-envelope-open-text"></i> <b>${t("Handout.Card", { title: esc(page.name) })}</b>
      <div class="r-card-buttons"><button type="button" data-r-handout><i class="fa-solid fa-scroll"></i> ${t("Handout.Open")}</button></div></div>`
  });
  if (msg) showHandout(msg);
}

/** Открыть документ из сообщения. */
export function showHandout(message) {
  const id = `r-handout-${message.id}`;
  const open = foundry.applications.instances.get(id);
  if (open) return open.render({ force: true });
  return new HandoutWindow({ id, message }).render({ force: true });
}

class HandoutWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-handout-app"],
    window: { icon: "fa-solid fa-scroll", resizable: true },
    position: { width: 560, height: 680 }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/handout.hbs`, scrollable: [".r-ho-scroll"] } };

  constructor(options) {
    super(options);
    this.message = options.message;
  }

  get title() { return this.message.flags[SYSTEM_ID].handout.title; }

  async _prepareContext() {
    const h = this.message.flags[SYSTEM_ID].handout;
    return { ...h, styleClass: `is-${HANDOUT_STYLES.includes(h.style) ? h.style : "kindred"}`, path: SYSTEM_PATH };
  }
}
