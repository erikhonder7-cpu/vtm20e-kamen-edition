// module/apps/web.mjs
// Паутина хроники (план 5): одна схема из того, что уже записано в листах.
//   светлая стрелка — сир → потомок (поле «Сир», module/data/lineage.mjs);
//   красная — Кровавые узы от того, кто поит, к пьющему; толщина — ступень (system.bonds);
//   золотой пунктир — открытый долг услуги от должника к кредитору (system.boons).
// Имя без персонажа в мире — пустой пунктирный кружок, ведущий заводит на него лист одной кнопкой.
// Ведущий видит всё, игрок — связи своих персонажей. Кружки перетаскиваются; раскладка ведущего —
// в настройке мира webLayout, игрока — в его браузере.

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { nameKey, actorByName, childrenOf } from "../data/lineage.mjs";
import { boonLevelLabel } from "./boons.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

const W = 860, H = 600, R = 26;
const LOCAL = "vtm20.webLayout";

export function registerWeb() {
  game.settings.register(SYSTEM_ID, "webLayout", { scope: "world", config: false, type: Object, default: {} });
}

export function openWeb(focus = null) {
  const open = foundry.applications.instances.get("r-web");
  const app = open ?? new ChronicleWeb();
  if (focus) app.selected = `a:${focus.id}`;
  app.render({ force: true });
  return app;
}

/** Связи и узлы: { nodes: Map(key → node), edges: [] }. Ключ узла — «a:id» у персонажа или «n:имя» без листа. */
function buildGraph() {
  const gm = game.user.isGM;
  const nodes = new Map(), edges = [];
  const keyOf = (name, actor) => actor ? `a:${actor.id}` : `n:${nameKey(name)}`;
  const node = (name, actor) => {
    const key = keyOf(name, actor);
    if (!nodes.has(key)) nodes.set(key, {
      key, actor, name: actor?.name ?? String(name).trim(), img: actor?.img ?? null, missing: !actor,
      gen: actor?.isVampire ? actor.system.generation : null, type: actor?.type ?? "",
      clan: actor ? (actor.isVampire ? actor.clanLabel : game.i18n.localize(`TYPES.Actor.${actor.type}`)) : "",
      dead: !!actor?.statuses?.has?.("dead") || !!actor?.getFlag?.(SYSTEM_ID, "finalDeath")
    });
    return nodes.get(key);
  };
  const source = gm ? game.actors.filter(a => ["vampire", "ghoul", "mortal"].includes(a.type)) : game.actors.filter(a => a.isOwner);
  const seen = new Set();
  for (const a of source) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    const me = node(a.name, a), s = a.system;
    const sireName = String(s.details?.sire ?? "").trim();
    if (sireName) edges.push({ kind: "sire", from: node(sireName, actorByName(sireName)).key, to: me.key });
    if (!gm) for (const k of childrenOf(a)) edges.push({ kind: "sire", from: me.key, to: node(k.name, k).key });
    for (const b of s.bonds ?? []) {
      if (!String(b.name ?? "").trim()) continue;
      const other = node(b.name, actorByName(b.name));
      // regnant — у него пили: узы идут от того, кто поит, к пьющему
      edges.push(b.role === "regnant" ? { kind: "bond", from: other.key, to: me.key, rating: b.rating }
        : { kind: "bond", from: me.key, to: other.key, rating: b.rating });
    }
    for (const b of s.boons ?? []) {
      if (b.done || !String(b.name ?? "").trim()) continue;
      const other = node(b.name, actorByName(b.name));
      // owed — должны мне: долг от должника к кредитору
      edges.push(b.dir === "owe" ? { kind: "boon", from: me.key, to: other.key, level: b.level }
        : { kind: "boon", from: other.key, to: me.key, level: b.level });
    }
    // Винкулум Шабаша: верность этого персонажа к члену стаи (у каждого своя, поэтому стрелка от него)
    for (const v of s.vinculi ?? []) {
      if (!String(v.name ?? "").trim()) continue;
      edges.push({ kind: "vinc", from: me.key, to: node(v.name, actorByName(v.name)).key, rating: v.rating });
    }
  }
  // одна и та же связь, записанная в двух листах, — одной линией
  const uniq = new Map();
  for (const e of edges) {
    if (e.from === e.to) continue;
    const k = `${e.kind}|${e.from}|${e.to}|${e.level ?? ""}`;
    const prev = uniq.get(k);
    if (!prev || (e.rating ?? 0) > (prev.rating ?? 0)) uniq.set(k, e);
  }
  // смертные и гули без связей у ведущего не нужны на схеме
  const list = [...uniq.values()];
  for (const [k, n] of nodes) if (gm && n.type !== "vampire" && !list.some(e => e.from === k || e.to === k)) nodes.delete(k);
  return { nodes, edges: list };
}

/** Начальная раскладка: ряды по поколениям (старшие сверху), без поколения — нижним рядом. */
function autoLayout(nodes) {
  const rows = new Map();
  for (const n of nodes.values()) {
    const g = n.gen ?? 99;
    if (!rows.has(g)) rows.set(g, []);
    rows.get(g).push(n);
  }
  const gens = [...rows.keys()].sort((a, b) => a - b);
  const pos = {};
  gens.forEach((g, i) => {
    const row = rows.get(g).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const y = gens.length === 1 ? H / 2 : 60 + i * ((H - 120) / (gens.length - 1));
    row.forEach((n, j) => { pos[n.key] = { x: Math.round((j + 1) * W / (row.length + 1)), y: Math.round(y + (j % 2 ? 18 : 0)) }; });
  });
  return pos;
}

class ChronicleWeb extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "r-web",
    classes: ["vtm20", "r-dialog", "r-web-app"],
    window: { title: "VTM20.Web.Title", icon: "fa-solid fa-circle-nodes", resizable: true },
    position: { width: 1240, height: 720 },
    actions: { layer: ChronicleWeb.#onLayer, mine: ChronicleWeb.#onMine, sheet: ChronicleWeb.#onSheet, create: ChronicleWeb.#onCreate, relayout: ChronicleWeb.#onRelayout }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/web.hbs` } };

  layers = { sire: true, bond: true, boon: true, vinc: true };
  onlyMine = false;
  selected = null;
  #graph = null;
  #pos = {};

  #savedLayout() {
    if (game.user.isGM) return foundry.utils.deepClone(game.settings.get(SYSTEM_ID, "webLayout") ?? {});
    try { return JSON.parse(localStorage.getItem(LOCAL) ?? "{}"); } catch { return {}; }
  }

  async #saveLayout() {
    if (game.user.isGM) await game.settings.set(SYSTEM_ID, "webLayout", this.#pos);
    else try { localStorage.setItem(LOCAL, JSON.stringify(this.#pos)); } catch { /* браузер без хранилища — не беда */ }
  }

  /** Видимые узлы и связи: слои и «Только мой» (связанная ветка выбранного или своего персонажа). */
  #visible() {
    const { nodes, edges } = this.#graph;
    let es = edges.filter(e => this.layers[e.kind]);
    let keys = new Set(nodes.keys());
    if (this.onlyMine) {
      const own = game.actors.filter(a => a.isOwner && !game.user.isGM).map(a => `a:${a.id}`);
      const start = this.selected && nodes.has(this.selected) ? [this.selected] : own.filter(k => nodes.has(k));
      keys = new Set(start);
      let grew = true;
      while (grew) {
        grew = false;
        for (const e of es) if (keys.has(e.from) !== keys.has(e.to)) { keys.add(e.from); keys.add(e.to); grew = true; }
      }
      es = es.filter(e => keys.has(e.from) && keys.has(e.to));
    }
    return { nodes: [...nodes.values()].filter(n => keys.has(n.key)), edges: es };
  }

  /** Схема целиком — SVG строкой (перерисовывается и при перетаскивании). */
  #svg() {
    const { nodes, edges } = this.#visible();
    const P = this.#pos;
    const line = e => {
      const a = P[e.from], b = P[e.to];
      if (!a || !b) return "";
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      // связи разного вида между теми же двумя — со сдвигом, чтобы не лечь друг на друга;
      // сторону сдвига берём от пары, а не от направления, иначе встречные узы и долг сойдутся
      const flip = e.from < e.to ? 1 : -1;
      // Винкулум — от направления: встречные узы стаи ложатся по разные стороны
      const off = e.kind === "vinc" ? 11 : (e.kind === "bond" ? 6 : e.kind === "boon" ? -6 : 0) * flip, ox = -uy * off, oy = ux * off;
      const x1 = a.x + ux * (R + 2) + ox, y1 = a.y + uy * (R + 2) + oy, x2 = b.x - ux * (R + 8) + ox, y2 = b.y - uy * (R + 8) + oy;
      const cls = `r-web-e is-${e.kind}${this.selected && (e.from === this.selected || e.to === this.selected) ? " is-hot" : ""}`;
      const w = e.kind === "bond" ? 1 + (e.rating ?? 1) * 1.2 : e.kind === "vinc" ? .8 + (e.rating ?? 1) * .25 : 1.4;
      // подпись — по ту же сторону от линии, куда сдвинута сама линия
      const lx = ((x1 + x2) / 2 - Math.sign(off) * uy * 12).toFixed(1), ly = ((y1 + y2) / 2 + Math.sign(off) * ux * 12 + 3).toFixed(1);
      const text = e.kind === "boon" ? boonLevelLabel(e.level).toLocaleLowerCase("ru") : e.kind === "bond" ? t("Web.BondN", { n: e.rating ?? 1 })
        : e.kind === "vinc" ? t("Web.VincN", { n: e.rating ?? 1 }) : "";
      const label = text ? `<text class="r-web-el is-${e.kind}" x="${lx}" y="${ly}">${esc(text)}</text>` : "";
      return `<line class="${cls}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="${w}" marker-end="url(#rw-${e.kind})"/>${label}`;
    };
    const dot = n => {
      const p = P[n.key];
      if (!p) return "";
      const sel = n.key === this.selected;
      const img = n.img ? `<image href="${esc(n.img)}" x="${-R}" y="${-R}" width="${R * 2}" height="${R * 2}" clip-path="url(#rw-clip)" preserveAspectRatio="xMidYMin slice"/>` : "";
      const sub = n.missing ? t("Web.NotInWorld") : [n.clan, n.gen ? t("Web.Gen", { n: n.gen }) : ""].filter(Boolean).join(" · ");
      return `<g class="r-web-n${n.missing ? " is-missing" : ""}${sel ? " is-sel" : ""}${n.dead ? " is-dead" : ""}" data-node="${esc(n.key)}" transform="translate(${p.x},${p.y})">
        <circle class="r-web-bg" r="${R}"/>${img}<circle class="r-web-ring" r="${R}"/>
        <text class="r-web-name" y="${R + 15}">${esc(n.name)}</text><text class="r-web-sub" y="${R + 28}">${esc(sub)}</text></g>`;
    };
    return `<svg class="r-web-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(t("Web.Title"))}">
      <defs><clipPath id="rw-clip"><circle r="${R - 1}"/></clipPath>
        ${["sire", "bond", "boon", "vinc"].map(k => `<marker id="rw-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="r-web-arrow is-${k}"/></marker>`).join("")}</defs>
      ${edges.map(line).join("")}${nodes.map(dot).join("")}</svg>`;
  }

  async _prepareContext() {
    this.#graph = buildGraph();
    const saved = this.#savedLayout(), auto = autoLayout(this.#graph.nodes);
    this.#pos = {};
    for (const k of this.#graph.nodes.keys()) this.#pos[k] = saved[k] ?? auto[k];
    if (this.selected && !this.#graph.nodes.has(this.selected)) this.selected = null;
    const sel = this.selected ? this.#graph.nodes.get(this.selected) : null;
    let card = null;
    if (sel) {
      const by = (kind, dir) => this.#graph.edges.filter(e => e.kind === kind && e[dir] === sel.key).map(e => ({ e, n: this.#graph.nodes.get(dir === "to" ? e.from : e.to) }));
      card = {
        name: sel.name, img: sel.img, missing: sel.missing, actorId: sel.actor?.id ?? "",
        sub: [sel.clan, sel.gen ? t("Web.Gen", { n: sel.gen }) : ""].filter(Boolean).join(" · "),
        sire: by("sire", "to")[0]?.n?.name ?? "", childer: by("sire", "from").map(x => x.n.name),
        bonds: [...by("bond", "to").map(x => t("Web.DrankFrom", { name: x.n.name, n: x.e.rating ?? 1 })),
          ...by("bond", "from").map(x => t("Web.Fed", { name: x.n.name, n: x.e.rating ?? 1 }))],
        boons: [...by("boon", "to").map(x => t("Web.Owes", { name: x.n.name, level: boonLevelLabel(x.e.level).toLocaleLowerCase("ru") })),
          ...by("boon", "from").map(x => t("Web.OwesTo", { name: x.n.name, level: boonLevelLabel(x.e.level).toLocaleLowerCase("ru") }))],
        vinc: [...by("vinc", "from").map(x => t("Web.VincTo", { name: x.n.name, n: x.e.rating ?? 1 })),
          ...by("vinc", "to").map(x => t("Web.VincFrom", { name: x.n.name, n: x.e.rating ?? 1 }))]
      };
    }
    const count = k => this.#graph.edges.filter(e => e.kind === k).length;
    return {
      svg: this.#svg(), card, gm: game.user.isGM, onlyMine: this.onlyMine,
      layers: ["sire", "bond", "boon", "vinc"].map(k => ({ key: k, on: this.layers[k], label: t(`Web.Layer.${k}`), n: count(k) })),
      nodes: this.#graph.nodes.size
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    const root = this.element;
    let drag = null;
    const toSvg = ev => {
      const svg = root.querySelector(".r-web-svg"), r = svg.getBoundingClientRect();
      const s = Math.min(r.width / W, r.height / H), ox = (r.width - W * s) / 2, oy = (r.height - H * s) / 2;
      return { x: Math.clamp((ev.clientX - r.left - ox) / s, R, W - R), y: Math.clamp((ev.clientY - r.top - oy) / s, R, H - R - 28) };
    };
    // схема перерисовывается целиком на каждом шаге — поэтому указатель слушаем на окне браузера,
    // а двойной щелчок считаем сами: после первого щелчка кружок уже другой элемент
    let last = { key: null, at: 0 };
    const move = ev => {
      if (!drag.moved && Math.hypot(ev.clientX - drag.start.x, ev.clientY - drag.start.y) < 4) return;
      drag.moved = true;
      this.#pos[drag.key] = toSvg(ev);
      root.querySelector(".r-web-stage").innerHTML = this.#svg();
    };
    const up = async () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const d = drag; drag = null;
      if (d.moved) { this.#pos[d.key] = { x: Math.round(this.#pos[d.key].x), y: Math.round(this.#pos[d.key].y) }; await this.#saveLayout(); return; }
      const twice = last.key === d.key && Date.now() - last.at < 400;
      last = { key: d.key, at: Date.now() };
      if (twice) return this.#graph?.nodes.get(d.key)?.actor?.sheet.render(true);
      this.selected = this.selected === d.key ? null : d.key;
      this.render();
    };
    root.addEventListener("pointerdown", ev => {
      const g = ev.target.closest(".r-web-n");
      if (!g || ev.button !== 0 || drag) return;
      ev.preventDefault();
      drag = { key: g.dataset.node, moved: false, start: { x: ev.clientX, y: ev.clientY } };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
    this.hook = Hooks.on("updateActor", () => this.render());
  }

  async close(options) {
    Hooks.off("updateActor", this.hook);
    return super.close(options);
  }

  static #onLayer(event, target) { this.layers[target.dataset.layer] = !this.layers[target.dataset.layer]; this.render(); }
  static #onMine() { this.onlyMine = !this.onlyMine; this.render(); }
  static #onSheet(event, target) { game.actors.get(target.dataset.actorId)?.sheet.render(true); }

  /** Имя без персонажа — завести лист Сородича (ведущий). */
  static async #onCreate() {
    const n = this.selected && this.#graph?.nodes.get(this.selected);
    if (!n?.missing || !game.user.isGM) return;
    const a = await Actor.create({ name: n.name, type: "vampire" });
    if (a) { this.#pos[`a:${a.id}`] = this.#pos[n.key]; await this.#saveLayout(); this.selected = `a:${a.id}`; a.sheet.render(true); }
  }

  /** Раскладка заново — ряды по поколениям. */
  static async #onRelayout() {
    this.#pos = autoLayout(this.#graph.nodes);
    await this.#saveLayout();
    this.render();
  }
}
