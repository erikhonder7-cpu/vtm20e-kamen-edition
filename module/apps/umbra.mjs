// module/apps/umbra.mjs
// Умбра (W20 Umbra: The Velvet Shadow; W20, гл. 7): где персонаж — в мире, в Пенумбре или в Царстве (флаг актёра «umbra»);
// каталог мест с описаниями, лунные тропы по фазе Луны хроники, бросок поиска пути (Интеллект + Загадки, сл. 7).

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";

const { ApplicationV2 } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.Umbra.${k}`, d) : game.i18n.localize(`VTM20.Umbra.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const U = () => Codex.werewolf?.umbra ?? { realms: [], paths: {} };
const GROUPS = ["penumbra", "near", "homeland", "membrane", "astral", "dark", "deep"];
const MOON = { new: "new", waxingCrescent: "crescent", waningCrescent: "crescent", firstQuarter: "half", lastQuarter: "half", waxingGibbous: "gibbous", waningGibbous: "gibbous", full: "full" };

/** Где персонаж в Умбре: null — в материальном мире. */
export function umbraOf(actor) {
  const k = actor?.getFlag(SYSTEM_ID, "umbra");
  return k ? U().realms.find(r => r.key === k) ?? { key: k, name: k } : null;
}
export const setUmbra = (actor, key) => key ? actor.setFlag(SYSTEM_ID, "umbra", key) : actor.unsetFlag(SYSTEM_ID, "umbra");

export function openUmbra(actor) {
  return new UmbraWindow(actor).render({ force: true });
}

class UmbraWindow extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-type-werewolf", "r-umbra-app"], window: { title: "VTM20.Umbra.Title", icon: "fa-solid fa-moon-over-sun", resizable: true },
    position: { width: 880, height: 700 }, actions: { pick: UmbraWindow.#pick, go: UmbraWindow.#go, home: UmbraWindow.#home, find: UmbraWindow.#find }
  };
  constructor(actor) { super({ window: { title: `${t("Title")}: ${actor.name}` } }); this.actor = actor; this.sel = umbraOf(actor)?.key ?? "penumbra"; this.q = ""; }
  async _renderHTML() { return this.#html(); }
  _replaceHTML(html, el) { const sc = el.querySelector(".r-um-list")?.scrollTop ?? 0; el.innerHTML = html; const l = el.querySelector(".r-um-list"); if (l) l.scrollTop = sc; }
  _onFirstRender(c, o) {
    super._onFirstRender(c, o);
    this.element.addEventListener("input", ev => { if (!ev.target.matches(".r-um-search")) return; this.q = ev.target.value.trim().toLowerCase();
      for (const a of this.element.querySelectorAll(".r-um-list a[data-key]")) a.hidden = !!this.q && !a.dataset.s.includes(this.q); });
  }
  async #html() {
    const { moonPhase } = await import("./calendar.mjs");
    const m = moonPhase(), d = U(), here = umbraOf(this.actor), r = d.realms.find(x => x.key === this.sel);
    const list = GROUPS.map(g => { const rs = d.realms.filter(x => x.group === g); return rs.length ? `<h4>${t(`Group.${g}`)}</h4>${rs.map(x =>
      `<a class="${x.key === this.sel ? "on" : ""} ${x.key === here?.key ? "is-here" : ""}" data-action="pick" data-key="${x.key}" data-s="${esc((x.name + " " + x.en).toLowerCase())}">${esc(x.name)}${x.en ? ` <small>${esc(x.en)}</small>` : ""}${x.key === here?.key ? ` <i class="fa-solid fa-location-dot"></i>` : ""}</a>`).join("")}` : ""; }).join("");
    const path = d.paths[MOON[m.key] ?? "half"];
    return `<div class="r-um"><aside><input type="search" class="r-um-search" placeholder="${esc(t("Search"))}" value="${esc(this.q)}"><div class="r-um-list">${list}</div></aside>
      <main><div class="r-um-here"><i class="fa-solid ${here ? "fa-moon" : "fa-earth-europe"}"></i> ${esc(here ? t("Here", { name: here.name }) : t("InWorld"))}
        ${here ? `<a class="r-btn" data-action="home"><i class="fa-solid fa-door-open"></i> ${t("Return")}</a>` : ""}</div>
        <p class="r-um-moon">${m.glyph} ${esc(m.label)}${path ? ` — ${path}` : ""}</p>
        ${r ? `<h2>${esc(r.name)}${r.en ? ` <small>${esc(r.en)}</small>` : ""}</h2><div class="r-um-actions">
          <a class="r-btn is-primary" data-action="go"><i class="fa-solid fa-person-walking-arrow-right"></i> ${t("Go")}</a>
          <a class="r-btn" data-action="find" data-tooltip="${esc(t("FindHint"))}"><i class="fa-solid fa-compass"></i> ${t("Find")}</a></div>
          <div class="r-um-text">${r.html}</div>` : `<p class="r-hint">${t("Pick")}</p>`}</main></div>`;
  }
  static #pick(ev, el) { this.sel = el.dataset.key; this.render(); }
  static async #go() {
    const r = U().realms.find(x => x.key === this.sel);
    if (!r) return;
    await setUmbra(this.actor, r.key);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-moon"></i> ${esc(t("Went", { name: this.actor.name, realm: r.name }))}</div>` });
    this.render();
  }
  static async #home() { await setUmbra(this.actor, null); await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-door-open"></i> ${esc(t("Returned", { name: this.actor.name }))}</div>` }); this.render(); }
  static #find() { return RollDialog.prompt(this.actor, { title: t("Find"), trait1: "attributes.intelligence", trait2: "abilities.enigmas", difficulty: 7, diffNote: t("FindHint") }); }
}
