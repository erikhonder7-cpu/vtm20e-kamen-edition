// module/apps/umbra.mjs
// Умбра (W20 Umbra: The Velvet Shadow; W20, гл. 7): где персонаж — в мире, в Пенумбре или в Царстве (флаг актёра «umbra»);
// каталог мест с описаниями, лунные тропы по фазе Луны хроники, бросок поиска пути (Интеллект + Загадки, сл. 7).

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { wwGlyph, wwHead } from "./werewolf.mjs";

const { ApplicationV2 } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.Umbra.${k}`, d) : game.i18n.localize(`VTM20.Umbra.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const U = () => Codex.werewolf?.umbra ?? { realms: [], paths: {} };
const GROUPS = ["penumbra", "near", "homeland", "membrane", "astral", "dark", "deep"];
/** Знак группы мест; родины племён — знак племени (у Фера — знак Фера, у пропавших племён — стаи). */
const GROUP_GLYPH = { penumbra: "glyph-umbra", near: "glyph-middleUmbra", homeland: "glyph-pack", membrane: "glyph-moonBridge", astral: "glyph-luna", dark: "glyph-darkUmbra", deep: "glyph-deepUmbra" };
const FERA_HOMES = ["Коракс", "Нувиша"];
function realmGlyph(r) {
  if (r?.group !== "homeland") return GROUP_GLYPH[r?.group] ?? "glyph-umbra";
  const tribe = (Codex.werewolf?.tribes ?? []).find(x => r.name.startsWith(x.name));
  return tribe ? `tribe-${tribe.key}` : FERA_HOMES.includes(r.name) ? "glyph-fera" : "glyph-pack";
}
/** Луна хроники — знаком аугурии, рождённой под этой фазой. */
const MOON_AUSPICE = { new: "ragabash", crescent: "theurge", half: "philodox", gibbous: "galliard", full: "ahroun" };
const MOON = { new: "new", waxingCrescent: "crescent", waningCrescent: "crescent", firstQuarter: "half", lastQuarter: "half", waxingGibbous: "gibbous", waningGibbous: "gibbous", full: "full" };

/** Где персонаж в Умбре: null — в материальном мире. */
export function umbraOf(actor) {
  const k = actor?.getFlag(SYSTEM_ID, "umbra");
  return k ? U().realms.find(r => r.key === k) ?? { key: k, name: k } : null;
}
export async function setUmbra(actor, key) {
  await (key ? actor.setFlag(SYSTEM_ID, "umbra", key) : actor.unsetFlag(SYSTEM_ID, "umbra"));
  // жетоны на сцене: в Умбре — полупрозрачные, в мире — как были
  for (const tk of actor.getActiveTokens(false, true)) if (tk.isOwner) await tk.update({ alpha: key ? 0.45 : 1 });
}

export function openUmbra(actor) {
  return new UmbraWindow(actor).render({ force: true });
}

class UmbraWindow extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-type-werewolf", "r-umbra-app"], window: { title: "VTM20.Umbra.Title", icon: "fa-solid fa-moon", resizable: true },
    position: { width: 940, height: 740 }, actions: { pick: UmbraWindow.#pick, go: UmbraWindow.#go, home: UmbraWindow.#home, find: UmbraWindow.#find, step: UmbraWindow.#step }
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
    const m = moonPhase(), d = U(), here = umbraOf(this.actor), r = d.realms.find(x => x.key === this.sel), cls = MOON[m.key] ?? "half";
    const list = GROUPS.map(g => { const rs = d.realms.filter(x => x.group === g); return rs.length ? `<h4 class="r-um-group">${wwGlyph(GROUP_GLYPH[g])}<span>${t(`Group.${g}`)}</span></h4>${rs.map(x =>
      `<a class="${x.key === this.sel ? "is-on" : ""} ${x.key === here?.key ? "is-here" : ""}" data-action="pick" data-key="${x.key}" data-s="${esc((x.name + " " + x.en).toLowerCase())}"><span>${esc(x.name)}${x.en ? `<small>${esc(x.en)}</small>` : ""}</span>${x.key === here?.key ? `<i class="fa-solid fa-location-dot" data-tooltip="${esc(t("YouAreHere"))}"></i>` : ""}</a>`).join("")}` : ""; }).join("");
    // дорожка: мир — Пенумбра — царство (если персонаж дальше Пенумбры)
    const deep = here && here.key !== "penumbra";
    const node = (glyph, label, on, cls2 = "") => `<span class="r-um-node ${on ? "is-here" : ""} ${cls2}"><span class="r-um-ring">${glyph}</span><small>${label}</small></span>`;
    const track = `<div class="r-um-track">
        ${node(`<i class="fa-solid fa-earth-europe"></i>`, t("World"), !here)}
        ${node(wwGlyph("glyph-umbra"), t("Group.penumbra"), here?.key === "penumbra", here ? "is-past" : "")}
        ${node(wwGlyph(deep ? realmGlyph(here) : "glyph-middleUmbra"), deep ? esc(here.name) : t("Realms"), deep, deep ? "" : "is-far")}
      </div>`;
    const where = `<section class="r-um-where">
        <div class="r-um-loc"><small>${t("WhereNow")}</small>${here ? "" : `<b>${esc(t("InWorld"))}</b>`}${track}
          <div class="r-um-loc-act">${here
            ? `<a class="r-btn" data-action="home"><i class="fa-solid fa-door-open"></i> ${t("Return")}</a>`
            : `<a class="r-btn is-primary" data-action="step" data-tooltip="${esc(game.i18n.localize("VTM20.Werewolf.StepHint"))}"><i class="fa-solid fa-moon"></i> ${game.i18n.localize("VTM20.Werewolf.StepSideways")}</a>`}</div></div>
        <div class="r-um-moon"><span class="r-um-moon-disc">${wwGlyph(`auspice-${MOON_AUSPICE[cls]}`)}</span>
          <div><small>${t("Moon")}</small><b>${esc(m.label)}</b>${d.paths[cls] ? `<p>${t("MoonPaths")}: ${d.paths[cls]}</p>` : ""}</div></div>
      </section>`;
    const realm = r ? `<article class="r-um-realm">${wwHead({ glyph: realmGlyph(r), kicker: t(`Group.${r.group}`), title: esc(r.name), sub: r.en ? esc(r.en) : "" })}
        <div class="r-um-actions">
          ${r.key === here?.key ? `<span class="r-um-here-tag"><i class="fa-solid fa-location-dot"></i> ${t("YouAreHere")}</span>` : `<a class="r-btn is-primary" data-action="go"><i class="fa-solid fa-person-walking-arrow-right"></i> ${t("Go")}</a>`}
          <a class="r-btn" data-action="find" data-tooltip="${esc(t("FindHint"))}"><i class="fa-solid fa-compass"></i> ${t("Find")}</a></div>
        <div class="r-um-text">${r.html}</div></article>` : `<p class="r-um-empty">${t("Pick")}</p>`;
    return `<div class="r-um"><aside><input type="search" class="r-um-search" placeholder="${esc(t("Search"))}" value="${esc(this.q)}"><div class="r-um-list">${list}</div></aside>
      <main>${where}${realm}</main></div>`;
  }
  static async #step() { const { stepSideways } = await import("./werewolf.mjs"); await stepSideways(this.actor); }
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
