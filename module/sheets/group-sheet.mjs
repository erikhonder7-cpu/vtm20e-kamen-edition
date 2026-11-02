// module/sheets/group-sheet.mjs
// Листы актёров-групп — в языке листа персонажа («дело»: портрет с печатью, досье строкой, главы с кровавой чертой):
//   · котерия, стая или ячейка охотников — участники (перетащить лист из каталога), общие факты, домен, тотем, сеть охотников;
//   · домен — владелец (перетащить лист персонажа или котерии), допущенные к охоте и свои люди, рейтинг, защищённость,
//     угроза Маскараду, угодья и зона карты города.

import { VTM20, SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { coterieFromActor, poolValue, openCoterie } from "../apps/coterie.mjs";
import { HUNTING_GROUNDS } from "../apps/night.mjs";
import { citySpots, showSpotOnMap } from "../ui/citymap.mjs";
import { domainOwner } from "../apps/domain.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const loc = k => game.i18n.localize(k);
const PEOPLE = ["vampire", "ghoul", "mortal", "demon", "hunter", "werewolf", "creature"];
const KIND_ICON = { coterie: "fa-droplet", sabbat: "fa-wine-glass", pack: "fa-paw", cell: "fa-crosshairs" };
/** Население (V20 Dark Ages Companion, гл. 7): точки → домохозяйства (и ополченцы), жители, территория в кв. милях. */
const POPULACE = [[0, 0, ""], [3, 15, "1"], [7, 35, "1–2"], [15, 75, "1–3"], [30, 150, "2–5"], [60, 300, "3–10"], [120, 600, "6–25"], [250, 1250, "10–50"],
  [500, 2500, "20–100"], [1000, 5000, "40–200"], [2000, 10000, "80–400"]];
/** Челядь (там же): сколько слуг можно взять в поездку или на дело. */
const SERVANTS = [0, 3, 7, 15, 30, 60];
/** События домена (там же): ключи — тексты механики в языке. */
export const DOMAIN_EVENTS = ["curse", "disaster", "saint", "famine", "invasion", "court", "heresy", "miracle", "brigands", "pilgrims"];
const dots = (v, max = 5) => Array.from({ length: Math.max(max, v) }, (_, i) => i < v);

/** Строка о персонаже: клан и поколение, племя и аугурия, кредо, Дом… */
function personLine(a) {
  const s = a.system, W = Codex.werewolf ?? {};
  switch (a.type) {
    case "vampire": return [Codex.clanName(s.clan), t("GenerationN", { n: s.generation })].filter(Boolean).join(" · ");
    case "ghoul": return loc(`VTM20.GhoulType.${s.ghoulType}`);
    case "werewolf": return s.werewolf?.fera ? VTM20.label((W.fera ?? []).find(b => b.key === s.werewolf.fera) ?? {})
      : [VTM20.label((W.tribes ?? []).find(x => x.key === s.werewolf?.tribe) ?? {}), VTM20.label((W.auspices ?? []).find(x => x.key === s.werewolf?.auspice) ?? {})].filter(Boolean).join(" · ");
    case "hunter": return [VTM20.label((Codex.hunter?.creeds ?? []).find(c => c.key === s.hunter?.creed) ?? {}), t("Group.Conviction", { n: s.hunter?.conviction ?? 0 })].join(" · ");
    case "demon": return Codex.house(s.house)?.name ?? "";
    case "coterie": return t(`Group.Kind.${s.kind}`);
    default: return s.details?.concept ?? "";
  }
}
const card = a => ({ id: a.id, name: a.name, img: a.img, type: loc(`TYPES.Actor.${a.type}`), line: personLine(a), concept: a.system.details?.concept ?? "" });

/** Общее: окно, перетаскивание листов из каталога в зоны [data-drop]. */
class GroupSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-group-sheet"], position: { width: 820, height: 760 }, window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };
  get title() { return `${loc(`TYPES.Actor.${this.actor.type}`)}: ${this.actor.name}`; }

  _onRender(context, options) {
    super._onRender(context, options);
    if (this._dropBound) return;
    this._dropBound = true;
    const el = this.element;
    el.addEventListener("dragover", ev => { ev.preventDefault(); el.querySelectorAll("[data-drop]").forEach(z => z.classList.toggle("is-over", z.contains(ev.target))); });
    el.addEventListener("dragleave", ev => { if (!el.contains(ev.relatedTarget)) el.querySelectorAll(".is-over").forEach(z => z.classList.remove("is-over")); });
    el.addEventListener("drop", async ev => {
      el.querySelectorAll(".is-over").forEach(z => z.classList.remove("is-over"));
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
      if (data?.type !== "Actor" || !this.isEditable) return;
      ev.preventDefault(); ev.stopPropagation();
      const a = await fromUuid(data.uuid);
      if (a && a.id !== this.actor.id) await this._dropActor(a, ev.target.closest("[data-drop]")?.dataset.drop ?? "");
    });
  }
  async _dropActor() {}
}

export class CoterieSheet extends GroupSheet {
  static DEFAULT_OPTIONS = {
    classes: ["r-coterie-sheet"],
    actions: { openActor: CoterieSheet.#onOpen, dropMember: CoterieSheet.#onDropMember, pools: CoterieSheet.#onPools, haven: CoterieSheet.#onHaven, vaulderie: CoterieSheet.#onVaulderie }
  };
  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/actor/coterie-sheet.hbs`, scrollable: [".r-gs-body"] } };

  async _prepareContext() {
    await Codex.load();
    const a = this.actor, s = a.system, c = coterieFromActor(a);
    const members = (s.members ?? []).map(id => game.actors.get(id)).filter(Boolean);
    const H = {};
    for (const m of members.filter(x => x.type === "hunter")) for (const v of ["mercy", "vision", "zeal"]) H[v] = (H[v] ?? 0) + (m.system.hunter?.[v] ?? 0);
    const totem = c.totem ? (Codex.werewolf?.totems ?? []).find(x => x.key === c.totem) : null;
    const dom = s.domain ? game.actors.get(s.domain) : null;
    return {
      actor: a, system: s, editable: this.isEditable, icon: KIND_ICON[s.kind] ?? "fa-droplet",
      kindLabel: t(`Group.Kind.${s.kind}`), typeLabel: loc("TYPES.Actor.coterie"),
      kinds: ["coterie", "sabbat", "pack", "cell"].map(k => ({ key: k, label: t(`Group.Kind.${k}`), selected: k === s.kind })),
      haven: (() => {   // «Общее убежище» (Anarchs Unbound): точки общего факта делятся на роскошь, размер и защиту
        const pool = "Общее убежище" in (c.pools ?? {}) ? poolValue(c, "Общее убежище") : null, h = s.haven ?? {};
        const used = (h.luxury ?? 0) + (h.size ?? 0) + (h.security ?? 0);
        return { pool, used, over: pool != null && used > pool, rows: ["luxury", "size", "security"].map(k => ({ key: k, label: t(`Group.Haven.${k}`),
          hint: t(`Group.HavenHint.${k}.${h[k] ?? 0}`), dots: Array.from({ length: 5 }, (_, i) => ({ n: i + 1, on: i < (h[k] ?? 0) })) })) };
      })(),
      sabbat: s.kind === "sabbat", gm: game.user.isGM,
      members: members.map(card),
      pools: Object.keys(c.pools ?? {}).map(bg => { const v = poolValue(c, bg); return { bg, value: v, primary: bg === c.primary, dots: dots(v, 5) }; }),
      totem: totem ? { name: totem.name, individual: totem.individual, pack: totem.pack, ban: totem.ban } : null,
      cell: s.kind === "cell" ? ["mercy", "vision", "zeal"].map(v => ({ label: t(`NpcGen.HV.${v}`), n: H[v] ?? 0 })) : null,
      domain: dom ? { ...card(dom), rating: dom.system.rating, dots: dots(dom.system.rating, 5) } : null,
      domains: game.actors.filter(x => x.type === "domain").map(d => ({ id: d.id, name: d.name, selected: d.id === s.domain }))
    };
  }

  async _dropActor(a, zone) {
    if (a.type === "domain") return this.actor.update({ "system.domain": a.id });
    if (PEOPLE.includes(a.type) && !this.actor.system.members.includes(a.id)) return this.actor.update({ "system.members": [...this.actor.system.members, a.id] });
  }

  static #onOpen(event, target) { game.actors.get(target.dataset.id)?.sheet.render(true); }
  static #onDropMember(event, target) { return this.actor.update({ "system.members": this.actor.system.members.filter(x => x !== target.dataset.id) }); }
  static #onPools() { return openCoterie(null, this.actor.id); }
  static #onHaven(event, target) { const k = target.dataset.key, n = Number(target.dataset.n), v = this.actor.system.haven?.[k] ?? 0;
    return this.actor.update({ [`system.haven.${k}`]: v === n ? n - 1 : n }); }
  static async #onVaulderie() { const { openVaulderie } = await import("../apps/vaulderie.mjs"); return openVaulderie(game.actors.get(this.actor.system.members?.[0]) ?? null); }
}

export class DomainSheet extends GroupSheet {
  static DEFAULT_OPTIONS = {
    classes: ["r-domain-sheet"],
    actions: { rate: DomainSheet.#onRate, openActor: DomainSheet.#onOpen, unlink: DomainSheet.#onUnlink, showMap: DomainSheet.#onShowMap,
      addEvent: DomainSheet.#onAddEvent, delEvent: DomainSheet.#onDelEvent, syncPool: DomainSheet.#onSyncPool }
  };
  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/actor/domain-sheet.hbs`, scrollable: [".r-gs-body"] } };

  async _prepareContext() {
    const a = this.actor, s = a.system, owner = domainOwner(a);
    const row = (key, max = 5) => Array.from({ length: max }, (_, i) => ({ n: i + 1, on: i < (s[key] ?? 0), key }));
    let zones = [];
    try { zones = citySpots().zones; } catch { zones = []; }
    const diff = HUNTING_GROUNDS[s.ground] ?? 6;
    const list = ids => (ids ?? []).map(id => game.actors.get(id)).filter(Boolean).map(card);
    const stat = (k, icon, max = 5) => ({ key: k, icon, label: t(`Group.Stat.${k}`), hint: t(`Group.StatHint.${k}`), value: s[k] ?? 0, dots: row(k, max) });
    // сюзерен и вассалы (DA Companion): объединённый домен — свой размер и размеры вассалов
    const vassals = game.actors.filter(x => x.type === "domain" && x.system.liege === a.id);
    const liege = s.liege ? game.actors.get(s.liege) : null;
    // домен котерии: общий факт «Домен» (V20 — можно сделать общим)
    const pool = owner?.type === "coterie" && "Домен" in (owner.system.pools ?? {}) ? poolValue(coterieFromActor(owner), "Домен") : null;
    const pop = POPULACE[s.populace] ?? POPULACE[0];
    return {
      v20: [stat("rating", "fa-chess-rook"), stat("security", "fa-shield-halved")],
      estate: [stat("prosperity", "fa-wheat-awn"), stat("passages", "fa-door-closed")],
      populace: { dots: row("populace", 10), value: s.populace, line: s.populace ? t("Group.PopulaceLine", { h: pop[0], p: pop[1], a: pop[2] }) : t("Group.PopulaceNone") },
      servants: { dots: row("servants"), value: s.servants, line: s.servants ? t("Group.ServantsLine", { n: s.servants, k: SERVANTS[s.servants] }) : t("Group.ServantsNone") },
      startBlood: t("Group.StartBlood", { n: s.rating }),
      combined: vassals.length ? { size: s.rating + vassals.reduce((n, x) => n + (x.system.rating ?? 0), 0), list: vassals.map(card) } : null,
      liege: liege ? card(liege) : null,
      lieges: game.actors.filter(x => x.type === "domain" && x.id !== a.id && x.system.liege !== a.id).map(x => ({ id: x.id, name: x.name, selected: x.id === s.liege })),
      pool, poolDiff: pool != null && pool !== s.rating,
      events: (s.events ?? []).map((e, i) => ({ i, ...e, name: t(`Group.Event.${e.key}.name`), text: t(`Group.Event.${e.key}.text`) })),
      eventKinds: DOMAIN_EVENTS.map(k => ({ key: k, label: t(`Group.Event.${k}.name`) })),
      actor: a, system: s, editable: this.isEditable, typeLabel: loc("TYPES.Actor.domain"),
      owners: game.actors.filter(x => [...PEOPLE, "coterie"].includes(x.type)).sort((x, y) => (y.type === "coterie") - (x.type === "coterie") || x.name.localeCompare(y.name, "ru"))
        .map(x => ({ id: x.id, name: `${x.name} — ${loc(`TYPES.Actor.${x.type}`)}`, selected: x.id === s.owner })),
      owner: owner ? card(owner) : null,
      grounds: Object.entries(HUNTING_GROUNDS).map(([k, d]) => ({ key: k, label: `${t(`Hunt.Ground.${k}`)} — ${d}`, selected: k === s.ground })),

      zones: zones.map(z => ({ id: z.id, name: z.name, selected: z.id === s.zone })),
      zoneName: zones.find(z => z.id === s.zone)?.name ?? "",
      huntLine: t("Group.HuntLine", { diff, cut: s.rating, res: Math.max(3, diff - s.rating) }),
      guests: list(s.guests), people: list(s.people)
    };
  }

  /** Лист в зону: владелец, допущенные, свои люди; иначе — владелец, если его нет, или допущенный. */
  async _dropActor(a, zone) {
    if (![...PEOPLE, "coterie"].includes(a.type)) return;
    const s = this.actor.system;
    const where = zone || (s.owner ? "guests" : "owner");
    if (where === "owner") return this.actor.update({ "system.owner": a.id });
    if (a.type === "coterie") return ui.notifications.warn(t("Group.OnlyPeople"));
    const key = where === "people" ? "people" : "guests";
    if (!(s[key] ?? []).includes(a.id)) return this.actor.update({ [`system.${key}`]: [...(s[key] ?? []), a.id] });
  }

  static #onRate(event, target) {
    const k = target.dataset.key, n = Number(target.dataset.n);
    return this.actor.update({ [`system.${k}`]: this.actor.system[k] === n ? n - 1 : n });
  }
  static #onOpen(event, target) { game.actors.get(target.dataset.id)?.sheet.render(true); }
  static #onUnlink(event, target) {
    const { list, id } = target.dataset;
    if (list === "owner") return this.actor.update({ "system.owner": "" });
    return this.actor.update({ [`system.${list}`]: (this.actor.system[list] ?? []).filter(x => x !== id) });
  }
  static #onShowMap() { if (this.actor.system.zone) return showSpotOnMap("zone", this.actor.system.zone); }
  /** Событие домена — в журнал (механика события — в подписи; точки рассказчик правит по ней). */
  static #onAddEvent() {
    const key = this.element.querySelector("[data-ev=kind]")?.value, note = this.element.querySelector("[data-ev=note]")?.value?.trim() ?? "";
    if (!key) return;
    const { getClock } = game.vtm20 ?? {};
    const date = typeof getClock === "function" ? new Date(getClock()).toLocaleDateString(game.i18n.lang, { day: "numeric", month: "long", year: "numeric" }) : "";
    return this.actor.update({ "system.events": [...(this.actor.system.events ?? []), { key, note, date }] });
  }
  static #onDelEvent(event, target) { const list = [...(this.actor.system.events ?? [])]; list.splice(Number(target.dataset.i), 1); return this.actor.update({ "system.events": list }); }
  /** Размер домена — по общему факту «Домен» котерии-хозяина. */
  static #onSyncPool() {
    const owner = domainOwner(this.actor);
    if (owner?.type !== "coterie") return;
    return this.actor.update({ "system.rating": poolValue(coterieFromActor(owner), "Домен") });
  }
}
