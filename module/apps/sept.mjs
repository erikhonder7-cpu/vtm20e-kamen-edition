// module/apps/sept.mjs
// Септ Гару (W20 Rage Across the World, гл. 1; каэрны — W20, гл. 7): каэрн (рейтинг → Преграда и лунный мост, тип — что даёт),
// тотем септа, члены с Положением в септе (1–5), должности с требуемым Положением, бонусом и тем, кто их занимает.
// Всё — в настройке мира «septs»; правит ведущий, игроки смотрят септы, где состоят их персонажи.

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { wwGlyph, wwHead } from "./werewolf.mjs";

const { ApplicationV2 } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.Sept.${k}`, d) : game.i18n.localize(`VTM20.Sept.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const ROMAN = ["", "I", "II", "III", "IV", "V"];
const D = () => Codex.werewolf?.sept ?? { standing: [], positions: [], caerns: [] };
/** Тотемы, для которых есть глиф (assets/werewolf/totem-*.png); ключ справочника «grandfather-thunder» → grandfatherThunder. */
const TOTEM_GLYPHS = new Set(["chimera", "cockroach", "falcon", "fenris", "grandfatherThunder", "griffin", "owl", "pegasus", "rat", "stag", "uktena", "unicorn", "wendigo"]);
const totemGlyph = key => { const k = String(key ?? "").replace(/-(\w)/g, (m, c) => c.toUpperCase()); return TOTEM_GLYPHS.has(k) ? `totem-${k}` : "glyph-totem"; };

export function registerSepts() {
  game.settings.register(SYSTEM_ID, "septs", { scope: "world", config: false, type: Array, default: [],
    onChange: () => { foundry.applications.instances.get("r-sept")?.render(); for (const a of foundry.applications.instances.values()) if (a.document?.type === "werewolf" && a.rendered) a.render(); } });
}
const read = () => foundry.utils.deepClone(game.settings.get(SYSTEM_ID, "septs") ?? []);
const save = list => game.settings.set(SYSTEM_ID, "septs", list);

/** Преграда каэрна (W20, гл. 7): 1–2 — 4, 3–4 — 3, 5 — 2; лунный мост: 1–3 — 1600 км × рейтинг, 4 — 9700, 5 — 16000. */
export const caernGauntlet = r => r >= 5 ? 2 : r >= 3 ? 3 : 4;
const bridgeKm = r => r >= 5 ? 16000 : r === 4 ? 9700 : 1600 * r;

/** Септы персонажа и его должности — для карточки Гару и шага в Умбру. */
export function septOf(actor) {
  const s = read().find(x => (x.members ?? []).includes(actor?.id));
  if (!s) return null;
  const posts = Object.entries(s.positions ?? {}).filter(([, id]) => id === actor.id).map(([k]) => D().positions.find(p => p.key === k)).filter(Boolean);
  return { id: s.id, name: s.name, caern: s.caern?.rating ?? 0, gauntlet: caernGauntlet(s.caern?.rating ?? 1), posts, standing: s.standing?.[actor.id] ?? 0 };
}

export function openSept(actor = null) {
  const app = foundry.applications.instances.get("r-sept") ?? new SeptWindow();
  if (actor) app.current = read().find(x => (x.members ?? []).includes(actor.id))?.id ?? app.current;
  return app.render({ force: true });
}

class SeptWindow extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "r-sept", classes: ["vtm20", "r-dialog", "r-type-werewolf", "r-sept-app"],
    window: { title: "VTM20.Sept.Title", icon: "fa-solid fa-campground", resizable: true }, position: { width: 900, height: 700 },
    actions: { pick: SeptWindow.#pick, create: SeptWindow.#create, remove: SeptWindow.#remove, addMember: SeptWindow.#addMember, dropMember: SeptWindow.#dropMember,
      stand: SeptWindow.#stand, sheet: SeptWindow.#sheet }
  };
  current = null;

  #visible() { const all = read(); return game.user.isGM ? all : all.filter(s => (s.members ?? []).some(id => game.actors.get(id)?.isOwner)); }
  async _renderHTML() { return this.#html(); }
  _replaceHTML(html, el) { el.innerHTML = html; }
  _onFirstRender(c, o) {
    super._onFirstRender(c, o);
    this.element.addEventListener("change", ev => {
      const f = ev.target.dataset.f;
      if (!f || !game.user.isGM) return;
      const v = ev.target.type === "number" ? Number(ev.target.value) : ev.target.value;
      return this.#edit(s => {
        if (f.startsWith("pos.")) { s.positions ??= {}; if (v) s.positions[f.slice(4)] = v; else delete s.positions[f.slice(4)]; }
        else foundry.utils.setProperty(s, f, v);
      });
    });
  }
  async #edit(fn) {
    if (!game.user.isGM) return;
    const all = read(), s = all.find(x => x.id === this.current);
    if (!s) return;
    s.members ??= []; s.standing ??= {}; s.positions ??= {}; s.caern ??= { rating: 1, type: "" };
    fn(s); await save(all);
  }

  #html() {
    const list = this.#visible(), gm = game.user.isGM;
    if (!list.some(s => s.id === this.current)) this.current = list[0]?.id ?? null;
    const s = list.find(x => x.id === this.current), d = D();
    const side = `<aside class="r-sept-side"><h4 class="r-um-group">${wwGlyph("glyph-moot")}<span>${t("List")}</span></h4>
      <div class="r-sept-list">${list.map(x => `<a class="${x.id === this.current ? "is-on" : ""}" data-action="pick" data-id="${x.id}"><span>${esc(x.name)}<small>${esc(x.caern?.name || "")}</small></span></a>`).join("")
        || `<p class="r-sept-none">${t("None")}</p>`}</div>
      ${gm ? `<a class="r-btn" data-action="create"><i class="fa-solid fa-plus"></i> ${t("New")}</a>` : ""}<p class="r-sept-rule">${t("Rule")}</p></aside>`;
    if (!s) return `<div class="r-sept">${side}<main><div class="r-sept-empty"><span class="r-wh-sigil">${wwGlyph("glyph-caern")}</span>
      <b>${t("Title")}</b><p>${t(gm ? "EmptyGM" : "EmptyPlayer")}</p></div></main></div>`;
    const members = (s.members ?? []).map(id => game.actors.get(id)).filter(Boolean);
    const rating = s.caern?.rating ?? 1, ct = d.caerns.find(c => c.key === s.caern?.type);
    const dis = gm ? "" : "disabled";
    const totems = Codex.werewolf?.totems ?? [], tot = totems.find(x => x.key === s.totem);
    // Положение в септе — точками, как черты на листе (щелчок по последней — на точку меньше)
    const dots = (id, n) => `<span class="r-dots is-sept">${[1, 2, 3, 4, 5].map(i => `<a class="r-dot ${i <= n ? "is-filled" : ""}" ${gm ? `data-action="stand" data-actor="${id}" data-n="${i}"` : ""}></a>`).join("")}</span>`;
    const stName = n => d.standing.find(x => x.n === n)?.name ?? "";
    const holder = k => game.actors.get(s.positions?.[k] ?? "");
    const pos = d.positions.map(p => `<tr><td><b>${esc(p.name)}</b><small>${p.duty}</small></td><td class="r-sept-need">${"●".repeat(p.need)}</td><td><small>${p.bonus}</small></td>
      <td>${gm ? `<select data-f="pos.${p.key}"><option value="">—</option>${members.map(a => `<option value="${a.id}" ${s.positions?.[p.key] === a.id ? "selected" : ""}>${esc(a.name)}${(s.standing?.[a.id] ?? 0) < p.need ? " ⚠" : ""}</option>`).join("")}</select>` : esc(holder(p.key)?.name ?? "—")}</td></tr>`).join("");
    const cands = game.actors.filter(a => (a.type === "werewolf" || a.system.kinfolk?.on) && !(s.members ?? []).includes(a.id));
    const card = (title, status, body) => `<section class="r-vcard r-sept-card"><div class="r-vc-head"><h4 class="r-banner">${title}</h4>${status ? `<div class="r-vc-status">${status}</div>` : ""}</div>${body}</section>`;
    const head = wwHead({ glyph: "glyph-moot", kicker: t("Kicker"), title: gm ? `<input type="text" class="r-sept-name" data-f="name" value="${esc(s.name)}">` : esc(s.name),
      sub: esc([s.caern?.name, ct?.name].filter(Boolean).join(" · ")) });
    return `<div class="r-sept">${side}<main>
      <div class="r-sept-top">${head}${gm ? `<a class="r-sept-del" data-action="remove" data-tooltip="${esc(t("Remove"))}"><i class="fa-solid fa-trash"></i></a>` : ""}</div>
      <div class="r-sept-grid">
        ${card(t("Caern"), `<b>${ROMAN[rating]}</b>`, `
          <div class="r-sept-row"><label class="r-f"><span>${t("CaernName")}</span><input type="text" data-f="caern.name" value="${esc(s.caern?.name ?? "")}" ${dis}></label>
            <label class="r-f is-narrow"><span>${t("Rating")}</span><select data-f="caern.rating" ${dis}>${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === rating ? "selected" : ""}>${ROMAN[n]}</option>`).join("")}</select></label>
            <label class="r-f"><span>${t("CaernType")}</span><select data-f="caern.type" ${dis}><option value="">—</option>${d.caerns.map(c => `<option value="${c.key}" ${c.key === s.caern?.type ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label></div>
          <ul class="r-sept-facts"><li>${wwGlyph("glyph-umbra")} ${t("Gauntlet", { n: caernGauntlet(rating) })}</li><li>${wwGlyph("glyph-moonBridge")} ${t("Bridge", { n: bridgeKm(rating).toLocaleString(game.i18n.lang) })}</li>
            ${ct ? `<li>${wwGlyph("glyph-gaia")} ${ct.gives}</li><li>${wwGlyph("glyph-spirit")} ${ct.spirits}</li>` : ""}</ul>`)}
        ${card(t("Totem"), "", `
          <div class="r-sept-totem"><span class="r-sept-totem-sym">${wwGlyph(totemGlyph(s.totem))}</span>
            <select data-f="totem" ${dis}><option value="">—</option>${totems.map(x => `<option value="${x.key}" ${x.key === s.totem ? "selected" : ""}>${esc(x.name)} (${esc(x.cat)})</option>`).join("")}</select></div>
          ${tot ? `<p class="r-sept-text">${[tot.individual, tot.pack, tot.text].filter(Boolean).join(" · ")}${tot.ban ? ` <span class="r-sept-ban">${tot.ban}</span>` : ""}</p><p class="r-sept-rule">${t("TotemRule")}</p>` : ""}`)}
      </div>
      ${card(t("Members"), `<b>${members.length}</b>`, `
        <ul class="r-sept-members">${members.map(a => `<li><a class="r-sept-who" data-action="sheet" data-actor="${a.id}"><img src="${esc(a.img)}" alt=""> ${esc(a.name)}</a>${dots(a.id, s.standing?.[a.id] ?? 0)}<small>${esc(stName(s.standing?.[a.id] ?? 0))}</small>
          ${gm ? `<a class="r-sept-drop" data-action="dropMember" data-actor="${a.id}" data-tooltip="${esc(t("DropMember"))}"><i class="fa-solid fa-xmark"></i></a>` : ""}</li>`).join("") || `<li class="r-sept-none">${t("NoMembers")}</li>`}</ul>
        ${gm && cands.length ? `<div class="r-sept-add"><select class="r-sept-cand">${cands.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select><a class="r-btn" data-action="addMember"><i class="fa-solid fa-plus"></i> ${t("AddMember")}</a></div>` : ""}
        <p class="r-sept-rule">${t("StandingRule")}</p>`)}
      ${card(t("Positions"), "", `<table class="r-sept-pos"><thead><tr><th>${t("Position")}</th><th>${t("Need")}</th><th>${t("Bonus")}</th><th>${t("Holder")}</th></tr></thead><tbody>${pos}</tbody></table>`)}
    </main></div>`;
  }

  static #pick(ev, el) { this.current = el.dataset.id; this.render(); }
  static #sheet(ev, el) { game.actors.get(el.dataset.actor)?.sheet.render(true); }
  static async #create() {
    const all = read(), id = foundry.utils.randomID(8);
    all.push({ id, name: t("NewName"), members: [], standing: {}, positions: {}, caern: { rating: 2, type: "", name: "" }, totem: "" });
    this.current = id; await save(all);
  }
  static async #remove() {
    if (!(await foundry.applications.api.DialogV2.confirm({ window: { title: t("Remove") }, content: `<p>${t("RemoveAsk")}</p>` }))) return;
    await save(read().filter(x => x.id !== this.current)); this.current = null;
  }
  static #addMember() { const id = this.element.querySelector(".r-sept-cand")?.value; if (id) return this.#edit(s => { if (!s.members.includes(id)) s.members.push(id); }); }
  static #dropMember(ev, el) { const id = el.dataset.actor; return this.#edit(s => { s.members = s.members.filter(x => x !== id); delete s.standing[id];
    for (const [k, v] of Object.entries(s.positions)) if (v === id) delete s.positions[k]; }); }
  static #stand(ev, el) { const id = el.dataset.actor, n = Number(el.dataset.n); return this.#edit(s => { s.standing[id] = s.standing[id] === n ? n - 1 : n; }); }
}
