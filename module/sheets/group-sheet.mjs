// module/sheets/group-sheet.mjs
// Листы актёров-групп — в языке листа персонажа («дело»: портрет с печатью, досье строкой, главы с кровавой чертой):
//   · котерия, стая или ячейка охотников — участники (перетащить лист из каталога), общие факты, домен, тотем, сеть охотников;
//   · домен — владелец (перетащить лист персонажа или котерии), допущенные к охоте и свои люди, рейтинг, защищённость,
//     угроза Маскараду, угодья и зона карты города.

import { VTM20, SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { coterieFromActor, poolValue, openCoterie, totemPools, totemBanned, spendTotemPool, refillTotemPools, acceptTotem, setTotemBan } from "../apps/coterie.mjs";
import { HUNTING_GROUNDS } from "../apps/night.mjs";
import { citySpots, showSpotOnMap } from "../ui/citymap.mjs";
import { domainOwner } from "../apps/domain.mjs";
import { domainSway, domainEventTrend } from "../ui/strategy.mjs";
import { circleCard, bondCrucible, breakCrucible, HAUNT_POOL } from "../apps/circle.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const loc = k => game.i18n.localize(k);
const PEOPLE = ["vampire", "ghoul", "mortal", "demon", "hunter", "mage", "werewolf", "wraith", "creature", "spirit"];
const KIND_ICON = { coterie: "fa-droplet", sabbat: "fa-wine-glass", pack: "fa-paw", cell: "fa-crosshairs", cabal: "fa-hat-wizard", circle: "fa-ghost", motley: "fa-wand-sparkles" };
/** Знаки известных чантри, Конструктов и Лабиринтов (assets/mage/chantry-*.png) — на выбор для своего. */
const CHANTRY_SIGNS = ["crombey-farm", "drachus-vachar", "house-of-helekar", "lodge-of-the-gray-squirrel", "mecha", "maze-of-ebon-gates", "null-b", "research-plantation-4", "sepulcher", "vali-shallar"];
/** Размах чантри по очкам общего пула (M20, Факт «Чантри»): от какого числа очков — какая ступень. */
const CHANTRY_TIERS = [[101, "power"], [71, "fortress"], [31, "chantry"], [21, "sanctum"], [10, "squat"]];
const WHEEL = 20;
/** Население (V20 Dark Ages Companion, гл. 7): точки → домохозяйства (и ополченцы), жители, территория в кв. милях. */
const POPULACE = [[0, 0, ""], [3, 15, "1"], [7, 35, "1–2"], [15, 75, "1–3"], [30, 150, "2–5"], [60, 300, "3–10"], [120, 600, "6–25"], [250, 1250, "10–50"],
  [500, 2500, "20–100"], [1000, 5000, "40–200"], [2000, 10000, "80–400"]];
/** Челядь (там же): сколько слуг можно взять в поездку или на дело. */
const SERVANTS = [0, 3, 7, 15, 30, 60];
/** События домена (там же): ключи — тексты механики в языке. */
const DOMAIN_EVENTS = ["curse", "disaster", "saint", "famine", "invasion", "court", "heresy", "miracle", "brigands", "pilgrims"];
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
    case "mage": return [(Codex.mage?.factions ?? []).find(f => f.key === s.mage?.faction)?.name, `${loc("VTM20.Mage.Arete")} ${s.mage?.arete ?? 0}`].filter(Boolean).join(" · ");
    case "wraith": { const D = Codex.wraith ?? {}, w = s.wraith ?? {};
      return [(D.legions ?? []).find(l => l.key === w.legion)?.name, (D.arcanoi ?? []).find(x => x.key === w.guild)?.guild].filter(Boolean).join(" · "); }
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
  get title() { const k = this.actor.system.kind; return `${k && !["coterie", "sabbat"].includes(k) ? t(`Group.Kind.${k}`) : loc(`TYPES.Actor.${this.actor.type}`)}: ${this.actor.name}`; }

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
    actions: { openActor: CoterieSheet.#onOpen, dropMember: CoterieSheet.#onDropMember, pools: CoterieSheet.#onPools, haven: CoterieSheet.#onHaven, vaulderie: CoterieSheet.#onVaulderie,
      bond: CoterieSheet.#onBond, unbond: CoterieSheet.#onUnbond, nodeWeek: CoterieSheet.#onNodeWeek, nodeStock: CoterieSheet.#onNodeStock, nodeDraw: CoterieSheet.#onNodeDraw,
      totemSpend: CoterieSheet.#onTotemSpend, freehold: CoterieSheet.#onFreehold, sanctuary: CoterieSheet.#onSanctuary, totemRefill: CoterieSheet.#onTotemRefill, totemAccept: CoterieSheet.#onTotemAccept, totemBan: CoterieSheet.#onTotemBan }
  };
  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/actor/coterie-sheet.hbs`, scrollable: [".r-gs-body"] } };

  /** Тотем из компендия оборотней (flags.ww, kind totem) — тотемом стаи, а не предметом на листе. */
  async _onDropItem(event, item) {
    const ww = item?.flags?.[game.system.id]?.ww;
    if (!ww) return super._onDropItem(event, item);
    if (ww.kind === "totem" && this.actor.isOwner) return this.actor.update({ "system.totem": ww.key });
    ui.notifications.warn(game.i18n.format("VTM20.Werewolf.DropNo.other", { name: item.name }));
    return null;
  }

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
      // вампирская котерия или стая Шабаша: «Общее убежище» (Anarchs Unbound) и подпись «Котерия»; остальные — своим видом
      vampiric: ["coterie", "sabbat"].includes(s.kind),
      sealLabel: s.kind === "circle" ? t("Wraith.Circle.Title") : t(`Group.Kind.${s.kind}`),
      kinds: ["coterie", "sabbat", "pack", "cell", "cabal", "circle", "motley"].map(k => ({ key: k, label: t(`Group.Kind.${k}`), selected: k === s.kind })),
      haven: (() => {   // «Общее убежище» (Anarchs Unbound): точки общего факта делятся на роскошь, размер и защиту
        const pool = "Общее убежище" in (c.pools ?? {}) ? poolValue(c, "Общее убежище") : null, h = s.haven ?? {};
        const used = (h.luxury ?? 0) + (h.size ?? 0) + (h.security ?? 0);
        return { pool, used, over: pool != null && used > pool, rows: ["luxury", "size", "security"].map(k => ({ key: k, label: t(`Group.Haven.${k}`),
          hint: t(`Group.HavenHint.${k}.${h[k] ?? 0}`), dots: Array.from({ length: 5 }, (_, i) => ({ n: i + 1, on: i < (h[k] ?? 0) })) })) };
      })(),
      sabbat: s.kind === "sabbat", gm: game.user.isGM,
      cabal: s.kind === "cabal" ? (() => {   // чантри: размах по очкам, Узел и его недельная выработка, общий запас
        const ch = s.chantry, tier = CHANTRY_TIERS.find(([min]) => ch.points >= min)?.[1] ?? "", week = ch.node * ch.rate;
        return { ...ch, tier: tier ? t(`Group.ChantryTier.${tier}`) : "", sym: ch.sign ? { src: foundry.utils.getRoute(`${SYSTEM_PATH}/assets/mage/chantry-${ch.sign}.png`) } : null,
          signs: [{ key: "", label: "—" }, ...CHANTRY_SIGNS.map(k => ({ key: k, label: t(`Group.ChantrySign.${k}`), selected: k === ch.sign }))],
          nodeDots: Array.from({ length: Math.max(5, ch.node) }, (_, i) => ({ n: i + 1, on: i < ch.node })),
          libDots: Array.from({ length: Math.max(5, ch.library) }, (_, i) => ({ n: i + 1, on: i < ch.library })),
          week, weekFree: Math.ceil(week / 2), weekTass: Math.floor(week / 2) };
      })() : null,
      // Мотли подменышей: фригольд (C20, гл. 7) — рейтинг, владелец, «Ночь во фригольде»
      motley: s.kind === "motley" ? { ...s.motley, dots: Array.from({ length: 5 }, (_, i) => ({ n: i + 1, on: i < s.motley.rating })),
        owners: [{ id: "", name: "—", selected: !s.motley.owner }, ...members.map(m => ({ id: m.id, name: m.name, selected: m.id === s.motley.owner }))],
        sleepers: members.filter(m => m.type === "changeling").length } : null,
      // Круг призраков: общее Обиталище из общих фактов, крусибл «Орфея» (apps/circle.mjs)
      circle: s.kind === "circle" ? { haunt: HAUNT_POOL in (c.pools ?? {}) ? poolValue(c, HAUNT_POOL) : null, crucible: !!s.circle?.crucible,
        projectors: members.some(m => m.type === "wraith" && m.system.wraith.projector?.on) } : null,
      members: members.map(m => ({ ...card(m), wraith: s.kind === "circle" ? circleCard(m) : null, mage: s.kind === "cabal" && m.type === "mage" ? { quint: m.system.mage.quintessence, room: WHEEL - m.system.mage.paradox - m.system.mage.quintessence } : null })),
      pools: Object.keys(c.pools ?? {}).map(bg => { const v = poolValue(c, bg); return { bg, value: v, primary: bg === c.primary, dots: dots(v, 5) }; }),
      totem: totem ? { name: totem.name, individual: totem.individual, pack: totem.pack, ban: totem.ban, banned: totemBanned(a),
        pools: Object.entries(totemPools(a)).map(([key, p]) => ({ key, label: t(`Group.TotemPool.${key}`), max: p.max, left: p.left,
          boxes: Array.from({ length: p.max }, (_, i) => ({ filled: i < p.left })) })) } : null,
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
  /** Неделя Узла: выработка — в общий запас, половина свободной Квинтэссенцией, половина Тассом. */
  static async #onNodeWeek() {
    const ch = this.actor.system.chantry, week = ch.node * ch.rate;
    if (!week) return ui.notifications.info(t("Group.NodeNone"));
    await this.actor.update({ "system.chantry.quint": ch.quint + Math.ceil(week / 2), "system.chantry.tass": ch.tass + Math.floor(week / 2) });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="r-notice r-type-mage"><i class="fa-solid fa-sun"></i> ${t("Group.NodeWeekMsg", { name: foundry.utils.escapeHTML(ch.name || this.actor.name), free: Math.ceil(week / 2), tass: Math.floor(week / 2) })}</div>` });
  }
  /** Рейтинг фригольда точкой (повторный щелчок по последней — на точку меньше). */
  static #onFreehold(event, target) {
    const n = Number(target.dataset.n), r = this.actor.system.motley.rating;
    return this.actor.update({ "system.motley.rating": r === n ? n - 1 : n });
  }
  /** «Ночь во фригольде» (Святилище, C20, гл. 6): спящие подменыши делят рейтинг фригольда поровну, каждый — не меньше 1. */
  static async #onSanctuary() {
    const { sanctuary } = await import("../apps/changeling.mjs");
    return sanctuary(this.actor);
  }
  /** Запас и рейтинги чантри: точки Узла и Библиотеки, ±1 к свободной Квинтэссенции или Тассу. */
  static #onNodeStock(event, target) {
    const ch = this.actor.system.chantry, k = target.dataset.key;
    if (target.dataset.n) { const n = Number(target.dataset.n); return this.actor.update({ [`system.chantry.${k}`]: ch[k] === n ? n - 1 : n }); }
    return this.actor.update({ [`system.chantry.${k}`]: Math.max(0, ch[k] + Number(target.dataset.d)) });
  }
  /** Маг кабала вбирает очко из общего запаса: сначала свободная Квинтэссенция, потом Тасс; не больше места на колесе. */
  static async #onNodeDraw(event, target) {
    const m = game.actors.get(target.dataset.id), ch = this.actor.system.chantry;
    if (!m?.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: m?.name ?? "" }));
    const mg = m.system.mage, from = ch.quint > 0 ? "quint" : ch.tass > 0 ? "tass" : null;
    if (!from) return ui.notifications.info(t("Group.NodeEmpty"));
    if (mg.quintessence + mg.paradox >= WHEEL) return ui.notifications.info(t("Group.NodeNoRoom", { name: m.name }));
    // M20, «Квинтэссенция»: личной Квинтэссенции — не больше рейтинга Аватара (впитывается медитацией у Узла)
    const { avatarOf } = await import("../apps/mage.mjs"), cap = avatarOf(m);
    if (mg.quintessence >= cap) return ui.notifications.info(t("Group.NodeAvatarFull", { name: m.name, n: cap }));
    await this.actor.update({ [`system.chantry.${from}`]: ch[from] - 1 });
    await m.update({ "system.mage.quintessence": mg.quintessence + 1 });
    return this.render();
  }
  static #onBond() { return bondCrucible(this.actor); }
  static #onUnbond() { return breakCrucible(this.actor); }
  static #onDropMember(event, target) { return this.actor.update({ "system.members": this.actor.system.members.filter(x => x !== target.dataset.id) }); }
  static #onPools() { return openCoterie(null, this.actor.id); }
  static #onHaven(event, target) { const k = target.dataset.key, n = Number(target.dataset.n), v = this.actor.system.haven?.[k] ?? 0;
    return this.actor.update({ [`system.haven.${k}`]: v === n ? n - 1 : n }); }
  static #onTotemSpend(event, target) { return spendTotemPool(this.actor, target.dataset.key); }
  static #onTotemRefill() { return refillTotemPools(this.actor); }
  static #onTotemAccept() { return acceptTotem(this.actor); }
  static #onTotemBan(event, target) { return setTotemBan(this.actor, target.dataset.on === "1"); }
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
    // место на карте: зоны рассказчика и обведённые игроками домены (план 1)
    let zones = [];
    try { const sp = citySpots(); zones = [...sp.zones, ...(sp.domains ?? [])]; } catch { zones = []; }
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

      zones: zones.map(z => ({ id: z.id, name: z.name, kind: z.kind, selected: z.id === s.zone })),
      zoneName: zones.find(z => z.id === s.zone)?.name ?? "",
      huntLine: t("Group.HuntLine", { diff, cut: s.rating, res: Math.max(3, diff - s.rating) }),
      // квартал стратегии и расклад фишек: к концу хода Защищённость +1 / −1 (план 2)
      swayLine: (() => { try { const w = domainSway(a); return w ? t("Group.SwayLine", { district: w.district, mine: w.mine, best: w.best,
        who: w.rival ? ` (${w.rival})` : "", sway: t(`Group.Sway.${w.d > 0 ? "up" : w.d < 0 ? "down" : "same"}`) }) : ""; } catch { return ""; } })(),
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
  static #onShowMap() {
    const id = this.actor.system.zone;
    if (!id) return;
    let kind = "zone";
    try { if ((citySpots().domains ?? []).some(d => d.id === id)) kind = "domain"; } catch { /* карта не настроена — как зона */ }
    return showSpotOnMap(kind, id);
  }
  /** Событие домена — в журнал (механика события — в подписи; точки рассказчик правит по ней). */
  static async #onAddEvent() {
    const key = this.element.querySelector("[data-ev=kind]")?.value, note = this.element.querySelector("[data-ev=note]")?.value?.trim() ?? "";
    if (!key) return;
    const { getClock } = game.vtm20 ?? {};
    const date = typeof getClock === "function" ? new Date(getClock()).toLocaleDateString(game.i18n.lang, { day: "numeric", month: "long", year: "numeric" }) : "";
    await this.actor.update({ "system.events": [...(this.actor.system.events ?? []), { key, note, date }] });
    // событие — трендом на доске стратегии в квартале домена (план 2; ставит ведущий)
    const tr = await domainEventTrend(this.actor, key, note);
    if (tr) ui.notifications.info(t("Group.EventTrend", { name: tr.name }));
  }
  static #onDelEvent(event, target) { const list = [...(this.actor.system.events ?? [])]; list.splice(Number(target.dataset.i), 1); return this.actor.update({ "system.events": list }); }
  /** Размер домена — по общему факту «Домен» котерии-хозяина. */
  static #onSyncPool() {
    const owner = domainOwner(this.actor);
    if (owner?.type !== "coterie") return;
    return this.actor.update({ "system.rating": poolValue(coterieFromActor(owner), "Домен") });
  }
}
