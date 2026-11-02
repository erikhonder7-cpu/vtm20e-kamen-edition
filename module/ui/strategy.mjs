// module/ui/strategy.mjs
// Стратегия города: долгие ходы старейшин между сессиями (по мотивам стратегической игры Зиора, «Request for Quest»).
//
// Доска на шторе «Город» (registerCityExtension → boards): гексы-сферы города (полиция, мэрия, порт, пресса…),
// в каждом — фишки влияния (0–7) персонажей, NPC и фракций. Ход длится месяцы и годы:
//   · игрок раскладывает по гексам жетоны — 3 жетона внимания, по жетону за каждые 2 точки Влияния, по жетону
//     за каждую точку Подручных (гуль действует сам) и услуги (кого-то зовут на помощь — долг в реестре услуг);
//     к жетону — заявка: что делаем (усилить, вытеснить, подорвать, разведать, защитить) и каким пулом;
//   · ведущий на «Столе» бросает всё разом (пул = Атрибут + Способность + свои фишки в гексе ± поправки;
//     сопротивление — рефлекторный пул из фишек соперника), смотрит итог, при нужде перебрасывает и «проводит ход»;
//   · отчёт хода — журнал: общая страница всем и личная страница каждому игроку; ход сменяется.
// Туман войны: игрок видит свои фишки, фишки гексов, открытых ведущим, и разведанное своим персонажем.
// Сектор можно привязать к кварталу карты (кварталы дают модули — EXT.strategy.districts).
//
// Состояние — настройка мира «strategy» (пишет ведущий); заявки — флаг актёра «strategy» (пишет владелец).

import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { EXT, registerCityExtension } from "./city-ext.mjs";
import { odds } from "../dice/roll.mjs";

const FLAG = "strategy";
const S = (k, d) => d ? game.i18n.format(`VTM20.Strategy.${k}`, d) : game.i18n.localize(`VTM20.Strategy.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const uid = () => foundry.utils.randomID(8);
/** «2 года», «5 лет»: формы единицы срока через «|» (ru — три формы, en — две). */
function unitText(n, unit) {
  const f = S(`Unit.${unit}`).split("|");
  if (f.length < 3) return `${n} ${n === 1 ? f[0] : f.at(-1)}`;
  const d = n % 10, h = n % 100;
  return `${n} ${d === 1 && h !== 11 ? f[0] : d >= 2 && d <= 4 && (h < 12 || h > 14) ? f[1] : f[2]}`;
}
const unitLabel = unit => S(`Unit.${unit}`).split("|").at(-1);
const MAX = 7, HEX = 56;

/** Жетоны хода: сколько у персонажа (null — без предела). */
const KINDS = {
  attention: { icon: "fa-chess-pawn", count: () => 3 },
  influence: { icon: "fa-landmark", count: a => Math.floor(bg(a, /^(Влияние|Influence)$/i) / 2) },
  retainer: { icon: "fa-user-secret", count: a => bg(a, /^(Подручные|Retainers)$/i) },
  boon: { icon: "fa-handshake", count: () => 2 },
  // Гару и их Родня: родичи-люди в городе — жетон за каждые 2 точки Факта «Родня» (W20)
  kinfolk: { icon: "fa-people-group", count: a => Math.floor(bg(a, /^(Родня|Kinfolk)$/i) / 2) }
};
/** Что делаем в гексе: сложность и против кого. */
const INTENTS = {
  grow: { icon: "fa-arrow-trend-up", diff: 0 },
  displace: { icon: "fa-people-arrows", diff: 1, target: "owner" },
  undermine: { icon: "fa-burst", diff: 0, target: "owner" },
  scout: { icon: "fa-eye", diff: 0 },
  defend: { icon: "fa-shield-halved", diff: 0 },
  curb: { icon: "fa-fire-extinguisher", diff: 0, target: "trend" },
  project: { icon: "fa-compass-drafting", diff: 0, target: "project" }
};
/** Польза сектора: факт ночи простоя (+1 кубик за каждые 2 фишки) или охота (сложность −1, от 5 фишек −2). */
// «caern» — каэрн в секторе: шаг в Умбру отсюда легче (Преграда −1 за каждые 2 фишки, не больше −2)
const PERKS = ["herd", "resources", "influence", "allies", "contacts", "retainers", "fame", "status", "domain", "mentor", "hunt", "caern"];
const perkName = k => k === "hunt" ? S("PerkHunt") : k === "caern" ? S("PerkCaern") : game.i18n.localize(`VTM20.Downtime.Bg.${k}`);
/** Проекты персонажа (флаг актёра): [{ id, sector, name }]; ход и цель — у ведущего (s.progress, s.projNeed). */
const PROJ = "strategyProj";
const projectsOf = a => a?.getFlag?.(SYSTEM_ID, PROJ) ?? [];
const allProjects = () => game.actors.contents.flatMap(a => projectsOf(a).map(p => ({ ...p, actor: a })));
const needOf = (s, id) => s.projNeed?.[id] ?? 10;
const bg = (a, re) => a?.items.filter(i => i.type === "background" && re.test(i.name)).reduce((n, i) => n + (i.system.value ?? 0), 0) ?? 0;

/* ── Заготовка по умолчанию: современный город (сферы, как у Зиора) ───────── */

const SPHERES = [
  { key: "power", color: "#8a2b2b" }, { key: "order", color: "#2e4a7d" }, { key: "money", color: "#a8862e" },
  { key: "faith", color: "#6b4f8a" }, { key: "street", color: "#4c5846" }, { key: "culture", color: "#2f6f6a" }
];
const MODERN = {
  id: "modern", spheres: SPHERES.map(s => ({ ...s, name: "" })),
  sectors: [
    ["mayor", "power", 0, 0], ["council", "power", 1, -1], ["courts", "order", -1, 1], ["police", "order", 0, 1],
    ["crime", "street", 1, 1], ["port", "street", 2, 0], ["unions", "street", 2, 1], ["industry", "money", 2, -1],
    ["finance", "money", 1, 0], ["highsociety", "money", -1, 0], ["church", "faith", -2, 1], ["health", "faith", -2, 2],
    ["media", "culture", -1, -1], ["university", "culture", 0, -1], ["telecom", "culture", -2, 0], ["internet", "culture", -3, 1],
    ["wilds", "street", 3, -1]
  ].map(([key, sphere, q, r]) => ({ key, sphere, q, r, name: "", about: "",
    perk: { finance: "resources", health: "herd", police: "contacts", crime: "hunt", media: "influence", highsociety: "allies", mayor: "status", unions: "retainers",
      wilds: "caern" }[key] ?? "" }))
};
const sphereName = s => s.name || S(`Sphere.${s.key}`);
const sectorName = s => s.name || S(`Sector.${s.key}`);

/* ── Состояние ─────────────────────────────────────────────────────────── */

const blank = () => ({ spheres: [], sectors: [], tokens: {}, owners: {}, known: {}, reveal: {}, mods: {}, rolls: {}, npc: [], trends: [], pacts: [],
  progress: {}, projNeed: {}, turn: { n: 1, label: "", open: true, shift: { n: 0, unit: "months" } }, draft: null, reports: [] });
const DEFAULT_BID = { id: "", kind: "attention", intent: "grow", target: "", attr: "manipulation", ability: "subterfuge", text: "", helper: "", proxy: "", crude: false };
export function strat() {
  const s = game.settings.get(SYSTEM_ID, "strategy") ?? {};
  return { ...blank(), ...foundry.utils.deepClone(s) };
}
async function save(patch) {
  if (!game.user.isGM) return;
  await game.settings.set(SYSTEM_ID, "strategy", { ...strat(), ...patch });
}

/** Чей жетон: актёр (id) или фракция ведущего («f:…»). */
function owner(k, s = strat()) {
  if (k?.startsWith("f:")) { const f = s.owners[k] ?? {}; return { key: k, name: f.name || "?", color: f.color || "#777", img: f.img || "" }; }
  const a = game.actors.get(k);
  const user = a && game.users.find(u => !u.isGM && a.testUserPermission(u, "OWNER"));
  return { key: k, name: a?.name ?? "?", img: a?.img ?? "", color: user?.color?.css ?? user?.color ?? hue(k), actor: a };
}
const hue = k => `hsl(${[...String(k)].reduce((n, c) => n * 31 + c.charCodeAt(0) >>> 0, 7) % 360} 45% 45%)`;

/** Мои персонажи (игрок) — те, чьи заявки он пишет. Ведущий видит всех. */
const mine = () => game.actors.filter(a => a.isOwner && a.hasPlayerOwner && ["vampire", "ghoul", "mortal", "hunter", "werewolf", "demon"].includes(a.type));
let me = null;            // выбранный персонаж игрока
const meActor = () => { const list = mine(); if (!list.some(a => a.id === me)) me = (game.user.character && list.includes(game.user.character) ? game.user.character : list[0])?.id ?? null; return game.actors.get(me) ?? null; };

/** Заявки персонажа на текущий ход. */
function bidsOf(a, s = strat()) {
  const f = a?.getFlag(SYSTEM_ID, FLAG);
  return f?.turn === s.turn.n ? (f.bids ?? []) : [];
}
const doneOf = (a, s = strat()) => { const f = a?.getFlag(SYSTEM_ID, FLAG); return f?.turn === s.turn.n && !!f.done; };
async function setBids(a, bids, done = doneOf(a)) {
  await a.setFlag(SYSTEM_ID, FLAG, { turn: strat().turn.n, bids, done });
}
/** Все заявки хода: [{ actor, bid, key }]. Ходы NPC и фракций (s.npc) — с готовым пулом, «актёр» у них — владелец влияния. */
function allBids(s = strat()) {
  const npc = (s.npc ?? []).map(b => ({ actor: { id: b.owner, name: owner(b.owner, s).name, npc: true }, bid: b, key: `npc.${b.id}` }));
  return [...game.actors.contents.flatMap(a => bidsOf(a, s).map(b => ({ actor: a, bid: b, key: `${a.id}.${b.id}` }))), ...npc];
}

/** Видит ли пользователь фишки владельца в секторе. */
function sees(sec, ownerKey, s = strat()) {
  if (game.user.isGM || s.reveal[sec]) return true;
  const mineIds = mine().map(a => a.id);
  if (mineIds.includes(ownerKey)) return true;
  return mineIds.some(id => s.known[id]?.[sec]);
}
const visibleSectors = s => s.sectors.filter(x => game.user.isGM || !x.hidden);

/* ── Пул заявки ───────────────────────────────────────────────────────── */

function poolOf(a, bid, s = strat(), mods = s.mods[bid.npc ? `npc.${bid.id}` : `${a.id}.${bid.id}`] ?? {}) {
  const at = bid.npc ? bid.dice ?? 0 : a.system.attributes?.[bid.attr]?.total ?? a.system.attributes?.[bid.attr]?.value ?? 0;
  const ab = bid.npc ? 0 : a.system.abilities?.[bid.ability]?.value ?? 0;
  const own = s.tokens[bid.sector]?.[a.id] ?? 0;
  const dice = Math.max(0, at + ab + own + (bid.crude ? 1 : 0) + (mods.dice ?? 0));
  const storm = (s.trends ?? []).some(t => t.sector === bid.sector && t.level >= 3) ? 1 : 0;
  const diff = Math.clamp(6 + (INTENTS[bid.intent]?.diff ?? 0) + (bid.proxy ? 1 : 0) + storm - (mods.disc ?? 0) + (mods.diff ?? 0), 3, 10);
  return { dice, diff, at, ab, own, storm };
}

async function rollDice(n, diff) {
  if (n <= 0) return { faces: [], succ: 0, botch: false };
  const r = await new Roll(`${n}d10`).evaluate();
  const faces = r.dice[0].results.map(x => x.result);
  const hits = faces.filter(f => f >= diff).length, ones = faces.filter(f => f === 1).length;
  return { faces, succ: Math.max(0, hits - ones), botch: hits === 0 && ones > 0 };
}
const gain = n => n >= 5 ? 2 : n >= 3 ? 1 : 0;

/**
 * Итог хода по сектору из бросков (s.rolls): прибавки и потери фишек, разведка, беды подручных, долги.
 * Сопротивление — один рефлекторный бросок на соперника: его фишки + успехи его «Защиты» в этом гексе.
 */
function outcome(sec, s, bids) {
  const here = bids.filter(x => x.bid.sector === sec);
  const tokens = { ...(s.tokens[sec] ?? {}) };
  const res = { delta: {}, lines: [], scouted: [], trouble: [], debts: [], curbed: {}, progress: {}, broken: [] };
  const succ = x => s.rolls[x.key]?.succ ?? 0;
  const defend = {};
  for (const x of here.filter(x => x.bid.intent === "defend")) defend[x.actor.id] = (defend[x.actor.id] ?? 0) + succ(x);
  const groups = {};
  for (const x of here) {
    if (s.rolls[x.key]?.botch && x.bid.kind === "retainer") res.trouble.push(x);
    if (x.bid.kind === "boon") res.debts.push(x);
    if (x.bid.intent === "defend") continue;
    const g = `${x.actor.id}|${x.bid.intent}|${x.bid.target ?? ""}|${x.bid.proxy ?? ""}`;
    (groups[g] ??= { actor: x.actor, intent: x.bid.intent, target: x.bid.target, proxy: x.bid.proxy, total: 0 }).total += succ(x);
  }
  const add = (k, n) => { if (!n) return; tokens[k] = Math.max(0, (tokens[k] ?? 0) + n); res.delta[k] = (res.delta[k] ?? 0) + n; };
  for (const g of Object.values(groups)) {
    // под видом подставного: в строках итога — его имя (свой персонаж видит пометку в личном отчёте)
    const who = g.proxy ? owner(g.proxy, s).name : g.actor.name, sum = () => Object.values(tokens).reduce((a, b) => a + b, 0);
    const say = (t, ...ids) => res.lines.push({ t, ids: [g.actor.id, ...ids] });
    if (g.intent === "curb") {
      const tr = (s.trends ?? []).find(t => t.id === g.target), n = gain(g.total);
      if (tr) { res.curbed[tr.id] = (res.curbed[tr.id] ?? 0) + n; say(S(n ? "Out.curb" : "Out.curbFail", { who, name: tr.name, n })); }
      continue;
    }
    if (g.intent === "project") {
      const pr = allProjects().find(p => p.id === g.target);
      if (pr) { res.progress[pr.id] = (res.progress[pr.id] ?? 0) + g.total;
        const now = (s.progress?.[pr.id] ?? 0) + res.progress[pr.id], need = needOf(s, pr.id);
        say(S(now >= need ? "Out.projectDone" : "Out.project", { who, name: pr.name, n: g.total, now: Math.min(now, need), need })); }
      continue;
    }
    if (g.intent === "scout") { if (g.total > 0) res.scouted.push(g.actor.id); say(S(g.total > 0 ? "Out.scoutOk" : "Out.scoutFail", { who })); continue; }
    if (g.intent === "grow") {
      const n = Math.min(gain(g.total), MAX - sum());
      add(g.actor.id, n);
      say(n ? S("Out.grow", { who, n }) : S(sum() >= MAX ? "Out.full" : "Out.growFail", { who, n: g.total }));
      continue;
    }
    // вытеснить / подорвать: против фишек цели
    const t = g.target, rr = s.rolls[`resist.${sec}.${t}.${g.actor.id}`];
    // договор с целью, покрывающий этот гекс, — нарушение (под видом подставного его не видно)
    const pact = !g.proxy && (s.pacts ?? []).find(p => (p.scope === "*" || p.scope === sec) && [p.a, p.b].includes(g.actor.id) && [p.a, p.b].includes(t));
    if (pact) { res.broken.push({ pact, who: g.actor.id, victim: t }); say(S("Out.pactBroken", { who, target: owner(t, s).name }), t); }
    const net = g.total - (rr?.succ ?? 0), n = Math.min(gain(net), tokens[t] ?? 0);
    add(t, -n);
    if (g.intent === "displace") add(g.actor.id, Math.min(n, MAX - sum()));
    say(S(n ? `Out.${g.intent}` : "Out.resisted", { who, target: owner(t, s).name, n, net: g.total, resist: rr?.succ ?? 0 }), t);
  }
  return { ...res, tokens };
}

/** Броски сопротивления, которые нужны этому ходу: «resist.сектор.цель.нападающий» → пул. */
function resistPools(s, bids) {
  const out = {};
  for (const x of bids) {
    if (INTENTS[x.bid.intent]?.target !== "owner" || !x.bid.target) continue;
    const sec = x.bid.sector, t = x.bid.target;
    const def = bids.filter(y => y.bid.sector === sec && y.actor.id === t && y.bid.intent === "defend").reduce((n, y) => n + (s.rolls[y.key]?.succ ?? 0), 0);
    out[`resist.${sec}.${t}.${x.actor.id}`] = (s.tokens[sec]?.[t] ?? 0) + def;
  }
  return out;
}

/* ── Доска ─────────────────────────────────────────────────────────────── */

let host = null, mode = "map", view = "map", sel = null, editBid = null, hist = null;

export function registerStrategy() {
  game.settings.register(SYSTEM_ID, "strategy", { scope: "world", config: false, type: Object, default: {}, onChange: () => { renderBoard(); host?.drawOverlay?.(); } });
  Hooks.on("updateActor", (a, ch) => { if (mode !== "map" && foundry.utils.hasProperty(ch, `flags.${SYSTEM_ID}.${FLAG}`)) renderBoard(); });
  registerCityExtension({
    boards: [{ order: 10, attach, drawModes, renderBoard, mode: () => mode, setMode }],
    // печати влияния над кварталами, к которым привязаны сектора (кнопка в «Слоях»)
    overlays: [{ add: api => addLayer(api), draw: api => drawLayer(api), world: api => drawLayer(api) }],
    tools: [api => strat().sectors.some(x => x.district) && EXT.strategy.districts.length
      ? `<a class="${api.view().strat ? "on" : ""}" data-act="stratLayer" data-tooltip="${esc(S("MapLayer"))}"><i class="fa-solid fa-chess-knight"></i></a>` : ""],
    acts: { stratLayer: (el, api) => api.setView({ strat: !api.view().strat }).then(() => { api.drawTools(); api.drawOverlay(); }) }
  });
}

/* ── Слой на карте: печати влияния по кварталам ───────────────────────── */

function addLayer(api) {
  const map = api.map;
  if (!map.getSource("rs-infl")) map.addSource("rs-infl", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  const add = l => { if (!map.getLayer(l.id)) map.addLayer(l); };
  add({ id: "rs-infl-seal", type: "circle", source: "rs-infl", paint: {
    "circle-color": ["get", "color"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, ["+", 6, ["get", "n"]], 15, ["+", 11, ["*", 1.8, ["get", "n"]]]],
    "circle-opacity": .95, "circle-stroke-color": "#b0894a", "circle-stroke-width": 2.5 } });
  // тёмная подложка под печатью — читается и на светлом старинном плане
  if (!map.getLayer("rs-infl-halo")) map.addLayer({ id: "rs-infl-halo", type: "circle", source: "rs-infl", paint: {
    "circle-color": "#0a0808", "circle-opacity": .55, "circle-blur": .6,
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, ["+", 10, ["get", "n"]], 15, ["+", 17, ["*", 1.8, ["get", "n"]]]] } }, "rs-infl-seal");
  add({ id: "rs-infl-n", type: "symbol", source: "rs-infl", layout: { "text-field": ["to-string", ["get", "n"]], "text-font": ["Noto Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 15, 14], "text-allow-overlap": true },
    paint: { "text-color": "#f3ece0", "text-halo-color": "#0a0808", "text-halo-width": 1.4 } });
  add({ id: "rs-infl-name", type: "symbol", source: "rs-infl", minzoom: 14.5, layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 10,
    "text-offset": [0, 1.9], "text-anchor": "top" }, paint: { "text-color": "#d8cfbf", "text-halo-color": "#0a0808", "text-halo-width": 1.4 } });
  drawLayer(api);
}

/** Видимое пользователю влияние по кварталам: печать на владельца, кругом у центра квартала. */
function drawLayer(api) {
  const map = api.map;
  if (!map?.getSource("rs-infl")) return;
  const on = !!api.view().strat;
  for (const l of ["rs-infl-halo", "rs-infl-seal", "rs-infl-n", "rs-infl-name"]) if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", on ? "visible" : "none");
  if (!on) return;
  const s = strat(), feats = [];
  for (const d of EXT.strategy.districts.flatMap(f => f())) {
    const sum = {};
    for (const x of visibleSectors(s).filter(y => y.district === d.key))
      for (const [k, n] of Object.entries(s.tokens[x.key] ?? {})) if (n > 0 && sees(x.key, k, s)) sum[k] = (sum[k] ?? 0) + n;
    const list = Object.entries(sum).sort((p, q) => q[1] - p[1]);
    list.forEach(([k, n], i) => {
      const a = 2 * Math.PI * i / list.length - Math.PI / 2, r = list.length > 1 ? .0019 : 0, o = owner(k, s);
      feats.push({ type: "Feature", properties: { color: o.color, n, name: o.name },
        geometry: { type: "Point", coordinates: [d.lng + r * Math.cos(a) / Math.cos(d.lat * Math.PI / 180), d.lat + r * Math.sin(a)] } });
    });
  }
  map.getSource("rs-infl").setData({ type: "FeatureCollection", features: feats });
}

/** Гайдбук стратегии — книга в компендии правил. */
async function openGuide() {
  const pack = game.packs.get(`${SYSTEM_ID}.rules`);
  const idx = await pack?.getIndex();
  const e = idx?.find(x => x.name === S("GuideName") || x.name === "Стратегия города — гайдбук");
  if (!e) return ui.notifications.warn(S("GuideMissing"));
  (await pack.getDocument(e._id))?.sheet.render(true);
}

/* ── Польза секторов и лист персонажа ─────────────────────────────────── */

/** Фишки персонажа в секторах с пользой key: { n, dice, names }. */
export function perkBonus(actor, key) {
  let s;
  try { s = strat(); } catch { return { n: 0, dice: 0, names: [] }; }
  const secs = s.sectors.filter(x => x.perk === key && (s.tokens[x.key]?.[actor?.id] ?? 0) > 0);
  const n = secs.reduce((m, x) => m + s.tokens[x.key][actor.id], 0);
  return { n, dice: Math.ceil(n / 2), names: secs.map(sectorName) };
}

/** Блок «Влияние в городе» на листе: сектора с фишками, заявки хода, проекты, договоры. */
export function sheetStrategy(actor) {
  let s;
  try { s = strat(); } catch { return null; }
  if (!s.sectors.length || !actor) return null;
  const sectors = s.sectors.filter(x => (s.tokens[x.key]?.[actor.id] ?? 0) > 0)
    .map(x => { const n = s.tokens[x.key][actor.id]; return { name: sectorName(x), n, pips: "●".repeat(n), perk: x.perk ? perkName(x.perk) : "" }; });
  const projects = projectsOf(actor).map(p => { const need = needOf(s, p.id), now = Math.min(s.progress?.[p.id] ?? 0, need);
    return { name: p.name, now, need, pct: Math.round(now / need * 100), done: now >= need, sector: sectorName(s.sectors.find(x => x.key === p.sector) ?? {}) }; });
  const pacts = (s.pacts ?? []).filter(p => p.a === actor.id || p.b === actor.id)
    .map(p => ({ with: owner(p.a === actor.id ? p.b : p.a, s).name, kind: S(`PactKind.${p.kind}`), where: p.scope === "*" ? S("PactWholeCity") : sectorName(s.sectors.find(x => x.key === p.scope) ?? {}) }));
  const bids = bidsOf(actor, s);
  if (!sectors.length && !projects.length && !pacts.length && !bids.length) return null;
  return { sectors, projects, pacts, turn: S("SheetTurn", { n: s.turn.n, bids: bids.length, done: S(doneOf(actor, s) ? "SheetDone" : "SheetNotDone") }) };
}

/** Открыть штору «Город» на Стратегии (кнопка на листе). */
export async function openStrategy() {
  const { openCity } = await import("./citymap.mjs");
  await openCity();
  setMode("strategy");
}

/* ── Влияние в бросках ────────────────────────────────────────────────── */

/** Сектора, где у персонажа есть влияние: опора для броска (+1 кубик за каждые 2 фишки, вверх). */
export function swayOf(actor) {
  let s;
  try { s = strat(); } catch { return []; }
  return s.sectors.filter(x => (s.tokens[x.key]?.[actor?.id] ?? 0) > 0)
    .map(x => { const n = s.tokens[x.key][actor.id]; return { key: x.key, name: sectorName(x), n, dice: Math.ceil(n / 2) }; });
}

function attach(root, api) {
  host = api;
  const b = api.boardEl;
  b.classList.add("rs-board");
  b.addEventListener("click", onClick);
  b.addEventListener("change", onChange);
  // жетон со счётчика — на гекс: открывается заявка этим жетоном в этом гексе
  b.addEventListener("dragstart", ev => { const k = ev.target.closest?.("[data-rs-drag]")?.dataset.rsDrag; if (k) ev.dataTransfer.setData("text/x-rs-kind", k); });
  b.addEventListener("dragover", ev => { if (ev.target.closest?.(".rs-hex") && ev.dataTransfer.types.includes("text/x-rs-kind")) { ev.preventDefault(); ev.target.closest(".rs-hex").classList.add("is-drop"); } });
  b.addEventListener("dragleave", ev => ev.target.closest?.(".rs-hex")?.classList.remove("is-drop"));
  b.addEventListener("drop", ev => {
    const hex = ev.target.closest?.(".rs-hex"), k = ev.dataTransfer.getData("text/x-rs-kind");
    if (!hex || !k) return;
    ev.preventDefault();
    sel = hex.dataset.key; view = "map"; hist = null; editBid = { ...DEFAULT_BID, kind: k, sector: sel };
    renderBoard();
  });
  api.modesEl.addEventListener("click", ev => { if (ev.target.closest("[data-mode]")) setMode(ev.target.closest("[data-mode]").dataset.mode); });
  drawModes();
}
function setMode(m) {
  if (!host) return;
  if (m !== "map") host.opened?.();
  mode = m === "strategy" ? "strategy" : "map";
  drawModes(); renderBoard(); host.syncModes?.();
}
function drawModes() {
  if (!host?.modesEl) return;
  const s = strat();
  host.modesEl.innerHTML = game.user.isGM || s.sectors.length
    ? `<a class="${mode === "strategy" ? "on" : ""}" data-mode="strategy"><i class="fa-solid fa-chess-knight"></i><span>${esc(S("Tab"))}</span></a>` : "";
  host.syncModes?.();
}

function renderBoard() {
  const b = host?.boardEl;
  if (!b) return;
  drawModes();
  b.hidden = mode === "map";
  if (mode === "map") return;
  const ae = document.activeElement;
  if (b.contains(ae) && ae.matches("textarea, input[type=text]")) return;
  const now = strat(), gm = game.user.isGM;
  if (!now.sectors.length) { b.innerHTML = `<div class="rs-wrap">${head(now)}${emptyView(now)}</div>`; return; }
  // история: сота после выбранного хода — только смотреть
  const snap = hist != null && now.reports.find(r => r.n === hist);
  const s = snap ? { ...now, tokens: snap.tokens ?? {}, sectors: snap.sectors ?? now.sectors } : now;
  const scroll = b.querySelector(".rs-side")?.scrollTop ?? 0;
  const side = view === "turn" ? (gm ? deskView(s) : turnView(s)) : view === "reports" ? reportsView(s) : view === "setup" && gm ? setupView(s) : sectorView(s);
  const banner = snap ? `<div class="rs-histbar"><i class="fa-solid fa-clock-rotate-left"></i> ${esc(S("HistoryTitle", { n: snap.n, label: snap.label || "" }))}<a data-rs="histOff">${esc(S("HistoryBack"))}</a></div>` : "";
  b.innerHTML = `<div class="rs-wrap">${head(now)}<div class="rs-body"><div class="rs-hexes ${snap ? "is-hist" : ""}">${banner}${hexes(s)}</div><aside class="rs-side">${side}</aside></div></div>`;
  const sd = b.querySelector(".rs-side"); if (sd) sd.scrollTop = scroll;
}

/** Шапка: ход, вкладки, выбор персонажа игрока. */
function head(s) {
  const gm = game.user.isGM, a = meActor();
  const tabs = [["map", "fa-hexagon-nodes"], ["turn", gm ? "fa-dice-d10" : "fa-feather-pointed"], ["reports", "fa-scroll"], ...(gm ? [["setup", "fa-gear"]] : [])];
  const who = !gm && mine().length > 1 ? `<select class="rs-me" data-rs-me>${mine().map(x => `<option value="${x.id}" ${x.id === a?.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : "";
  return `<header class="rs-head">
    <div class="rs-title"><i class="fa-solid fa-chess-knight"></i><b>${esc(S("Title"))}</b>
      <span class="rs-turn">${esc(S("TurnN", { n: s.turn.n }))}${s.turn.label ? ` · ${esc(s.turn.label)}` : ""}${s.turn.open ? "" : ` · <em>${esc(S("Closed"))}</em>`}</span></div>
    <nav class="rs-tabs">${tabs.map(([k, i]) => `<a class="${view === k ? "on" : ""}" data-rs="view" data-v="${k}"><i class="fa-solid ${i}"></i> ${esc(S(`View.${k}${k === "turn" && gm ? "Gm" : ""}`))}</a>`).join("")}</nav>
    ${who}<a class="rs-help" data-rs="guide" data-tooltip="${esc(S("Guide"))}"><i class="fa-solid fa-circle-question"></i></a></header>`;
}

function emptyView(s) {
  if (!game.user.isGM) return `<p class="rs-note">${esc(S("EmptyPlayer"))}</p>`;
  const presets = [{ id: "modern", name: S("PresetModern") }, ...EXT.strategy.presets.map(p => ({ id: p.id, name: p.name }))];
  return `<div class="rs-empty"><p>${esc(S("EmptyGm"))}</p>
    <div class="rs-row">${presets.map(p => `<a class="r-btn" data-rs="preset" data-id="${p.id}"><i class="fa-solid fa-hexagon-nodes"></i> ${esc(p.name)}</a>`).join("")}</div></div>`;
}

/* ── Гексы ── */

function hexes(s) {
  const list = visibleSectors(s), sph = Object.fromEntries(s.spheres.map(x => [x.key, x]));
  const px = x => ({ x: HEX * Math.sqrt(3) * (x.q + x.r / 2), y: HEX * 1.5 * x.r });
  const pts = list.map(px), pad = HEX * 1.2;
  const minX = Math.min(...pts.map(p => p.x)) - pad, minY = Math.min(...pts.map(p => p.y)) - pad;
  const w = Math.max(...pts.map(p => p.x)) - minX + pad, h = Math.max(...pts.map(p => p.y)) - minY + pad;
  const ring = (c, rad) => [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 180 * (60 * i - 30); return `${(c.x + rad * Math.cos(a)).toFixed(1)},${(c.y + rad * Math.sin(a)).toFixed(1)}`; }).join(" ");
  const a = meActor(), myBids = game.user.isGM ? allBids(s).map(x => x.bid) : bidsOf(a, s);
  const cells = list.map((x, i) => {
    const c = pts[i], color = sph[x.sphere]?.color ?? "#555";
    const toks = Object.entries(s.tokens[x.key] ?? {}).filter(([k, n]) => n > 0 && sees(x.key, k, s));
    const hiddenToks = !game.user.isGM && Object.entries(s.tokens[x.key] ?? {}).some(([k, n]) => n > 0 && !sees(x.key, k, s));
    const pips = toks.flatMap(([k, n]) => Array(n).fill(owner(k, s).color));
    // сургучные печати в ряд под названием: цвет владельца, тёмный ободок, блик
    const seals = pips.slice(0, MAX).map((col, j) => { const cx = c.x + (j - (Math.min(pips.length, MAX) - 1) / 2) * 12, cy = c.y + 20;
      return `<g class="rs-seal" style="--o:${col}"><circle cx="${cx.toFixed(1)}" cy="${cy}" r="5.4"/><circle class="rs-seal-in" cx="${cx.toFixed(1)}" cy="${cy}" r="2.7"/></g>`; }).join("");
    const nb = myBids.filter(b => b.sector === x.key).length;
    // подпись в пластину: строки не длиннее 12 знаков, до трёх строк, по центру над печатями
    const label = (c, t) => {
      const lines = [];
      for (const w of t.split(" ")) { const last = lines.at(-1); if (last && (last + " " + w).length <= 12) lines[lines.length - 1] = `${last} ${w}`; else lines.push(w); }
      const ls = lines.slice(0, 3), top = c.y - 4 - (ls.length - 1) * 11.5;
      return `<text class="rs-name" x="${c.x.toFixed(1)}" y="${top.toFixed(1)}">${ls.map((l, k) => `<tspan x="${c.x.toFixed(1)}" dy="${k ? 11.5 : 0}">${esc(l)}</tspan>`).join("")}</text>`;
    };
    return `<g class="rs-hex ${sel === x.key ? "is-sel" : ""} ${x.hidden ? "is-hidden" : ""}" data-rs="sector" data-key="${x.key}">
      <polygon class="rs-plate" points="${ring(c, HEX - 2)}" style="--h:${color}"/><polygon class="rs-inlay" points="${ring(c, HEX - 7)}" style="--h:${color}"/>
      ${label(c, sectorName(x))}${seals}
      ${hiddenToks ? `<g class="rs-fog"><circle cx="${c.x.toFixed(1)}" cy="${(c.y + 36).toFixed(1)}" r="6.5"/><text x="${c.x.toFixed(1)}" y="${(c.y + 39.2).toFixed(1)}">?</text></g>` : ""}
      ${(() => { const tr = (s.trends ?? []).filter(t => t.sector === x.key); const lv = Math.max(0, ...tr.map(t => t.level));
        return tr.length ? `<g class="rs-trendmark ${lv >= 3 ? "is-storm" : ""}"><circle cx="${(c.x - 30).toFixed(1)}" cy="${(c.y - 30).toFixed(1)}" r="9"/><text x="${(c.x - 30).toFixed(1)}" y="${(c.y - 26.5).toFixed(1)}">${lv}</text></g>` : ""; })()}
      ${nb ? `<g class="rs-bidmark"><circle cx="${(c.x + 30).toFixed(1)}" cy="${(c.y - 30).toFixed(1)}" r="9"/><text x="${(c.x + 30).toFixed(1)}" y="${(c.y - 26.5).toFixed(1)}">${nb}</text></g>` : ""}</g>`;
  }).join("");
  const legend = s.spheres.map(x => `<span style="--h:${x.color}"><i></i>${esc(sphereName(x))}</span>`).join("");
  return `<svg viewBox="${minX.toFixed(0)} ${minY.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" preserveAspectRatio="xMidYMid meet">${cells}</svg><div class="rs-legend">${legend}</div>`;
}

/* ── Сектор ── */

function sectorView(s) {
  const x = s.sectors.find(y => y.key === sel);
  if (!x) return `<p class="rs-note">${esc(S("PickSector"))}</p>${myCounters(s)}`;
  const gm = game.user.isGM, sph = s.spheres.find(y => y.key === x.sphere);
  const toks = Object.entries(s.tokens[x.key] ?? {}).filter(([, n]) => n > 0);
  const vis = toks.filter(([k]) => sees(x.key, k, s)), total = toks.reduce((n, [, v]) => n + v, 0);
  const row = ([k, n]) => { const o = owner(k, s);
    return `<li style="--c:${o.color}">${o.img ? `<img src="${esc(o.img)}">` : `<i class="rs-dot"></i>`}<span>${esc(o.name)}</span>
      <b class="rs-pips">${"●".repeat(n)}<small>${"○".repeat(Math.max(0, MAX - n))}</small></b>
      ${gm ? `<a data-rs="tok" data-owner="${k}" data-d="-1"><i class="fa-solid fa-minus"></i></a><a data-rs="tok" data-owner="${k}" data-d="1"><i class="fa-solid fa-plus"></i></a>` : ""}</li>`; };
  const district = x.district && EXT.strategy.districts.flatMap(f => f()).find(d => d.key === x.district);
  const addOwner = gm ? `<div class="rs-row"><select data-rs-addowner><option value="">${esc(S("AddOwner"))}</option>
      ${ownerOptions(s).map(o => `<option value="${o.key}">${esc(o.name)}</option>`).join("")}</select></div>` : "";
  const a = meActor(), mineHere = (gm ? allBids(s) : bidsOf(a, s).map(b => ({ actor: a, bid: b }))).filter(y => y.bid.sector === x.key);
  return `<section class="rs-sector">
    <h3 style="--h:${sph?.color ?? "#555"}"><i></i>${esc(sectorName(x))}${gm ? ` <a class="rs-eye ${s.reveal[x.key] ? "is-open" : ""}" data-rs="reveal" data-tooltip="${esc(S(s.reveal[x.key] ? "RevealOff" : "RevealOn"))}"><i class="fa-solid ${s.reveal[x.key] ? "fa-eye" : "fa-eye-slash"}"></i></a>` : ""}</h3>
    <p class="rs-sph">${esc(sph ? sphereName(sph) : "")}${district ? ` · <a data-rs="fly" data-key="${x.district}"><i class="fa-solid fa-map-location-dot"></i> ${esc(district.name)}</a>` : ""}</p>
    ${x.about ? `<p class="rs-about">${esc(x.about)}</p>` : ""}
    ${x.perk ? `<p class="rs-perk"><i class="fa-solid fa-gift"></i> ${esc(S(x.perk === "hunt" ? "PerkHuntLine" : x.perk === "caern" ? "PerkCaernLine" : "PerkLineSector", { name: perkName(x.perk) }))}</p>` : ""}
    ${trendsBlock(s, x, gm)}
    <h4>${esc(S("Influence"))} <small>${gm ? `${total}/${MAX}` : ""}</small></h4>
    <ul class="rs-owners">${vis.map(row).join("") || `<li class="rs-note">${esc(S("NoOneKnown"))}</li>`}</ul>
    ${!gm && vis.length < toks.length ? `<p class="rs-note"><i class="fa-solid fa-question"></i> ${esc(S("Fog"))}</p>` : ""}
    ${addOwner}
    ${projectsBlock(s, x, gm)}${pactsBlock(s, x, gm)}
    <h4>${esc(S(gm ? "BidsHere" : "MyBidsHere"))}</h4>
    <ul class="rs-bids">${mineHere.map(y => bidRow(y.actor, y.bid, s, gm)).join("") || `<li class="rs-note">${esc(S("NoBids"))}</li>`}</ul>
    ${!gm && a && s.turn.open ? bidForm(a, s, x.key) : ""}
  </section>`;
}
/** Тренды гекса: процессы, которые сами растут, пока их не обуздают. */
function trendsBlock(s, x, gm) {
  const list = (s.trends ?? []).filter(t => t.sector === x.key);
  if (!list.length && !gm) return "";
  const row = t => `<li class="rs-trendrow"><i class="fa-solid fa-fire"></i><span>${esc(t.name)}</span>
    <b class="rs-lvl">${"▲".repeat(t.level)}<small>${"△".repeat(Math.max(0, 5 - t.level))}</small></b>
    ${gm ? `<a data-rs="trendLvl" data-id="${t.id}" data-d="-1"><i class="fa-solid fa-minus"></i></a><a data-rs="trendLvl" data-id="${t.id}" data-d="1"><i class="fa-solid fa-plus"></i></a>
      <a data-rs="trendGrow" data-id="${t.id}" data-tooltip="${esc(S(t.grow ? "TrendGrowOn" : "TrendGrowOff"))}"><i class="fa-solid ${t.grow ? "fa-arrow-trend-up" : "fa-pause"}"></i></a>
      <a data-rs="trendDel" data-id="${t.id}"><i class="fa-solid fa-xmark"></i></a>` : ""}</li>`;
  return `<h4>${esc(S("Trends"))}</h4><ul class="rs-trends">${list.map(row).join("")}</ul>
    ${list.some(t => t.level >= 3) ? `<p class="rs-note is-warn">${esc(S("TrendStorm"))}</p>` : ""}
    ${gm ? `<div class="rs-row rs-inline"><input type="text" data-rs-newtrend placeholder="${esc(S("TrendNew"))}"><a class="r-btn" data-rs="trendAdd"><i class="fa-solid fa-plus"></i></a></div>` : ""}`;
}
/** Проекты гекса: многоходовые цели со шкалой. */
function projectsBlock(s, x, gm) {
  const a = meActor();
  const list = (gm ? allProjects() : projectsOf(a).map(p => ({ ...p, actor: a }))).filter(p => p.sector === x.key);
  if (!list.length && (gm || !a)) return "";
  const row = p => { const now = s.progress?.[p.id] ?? 0, need = needOf(s, p.id), done = now >= need;
    return `<li class="rs-projrow ${done ? "is-done" : ""}"><i class="fa-solid ${done ? "fa-flag-checkered" : "fa-compass-drafting"}"></i><span>${gm ? `${esc(p.actor.name)}: ` : ""}${esc(p.name)}</span>
      <b class="rs-bar"><i style="width:${Math.min(100, Math.round(now / need * 100))}%"></i></b><small>${Math.min(now, need)}/${need}</small>
      ${gm ? `<a data-rs="projNeed" data-id="${p.id}" data-d="-1" data-tooltip="${esc(S("ProjNeed"))}">−</a><a data-rs="projNeed" data-id="${p.id}" data-d="1" data-tooltip="${esc(S("ProjNeed"))}">+</a>`
        : `<a data-rs="projDel" data-id="${p.id}" data-tooltip="${esc(S("Delete"))}"><i class="fa-solid fa-xmark"></i></a>`}</li>`; };
  return `<h4>${esc(S("Projects"))}</h4><ul class="rs-projects">${list.map(row).join("")}</ul>
    ${!gm && a ? `<div class="rs-row rs-inline"><input type="text" data-rs-newproj placeholder="${esc(S("ProjectNew"))}"><a class="r-btn" data-rs="projAdd" data-tooltip="${esc(S("ProjectHint"))}"><i class="fa-solid fa-plus"></i></a></div>` : ""}`;
}
/** Договоры, покрывающие гекс (игрок видит только свои). */
function pactsBlock(s, x, gm) {
  const ids = gm ? null : mine().map(a => a.id);
  const list = (s.pacts ?? []).filter(p => (p.scope === "*" || p.scope === x.key) && (gm || ids.includes(p.a) || ids.includes(p.b)));
  if (!list.length) return "";
  return `<h4>${esc(S("Pacts"))}</h4><ul class="rs-pacts">${list.map(p => `<li><i class="fa-solid fa-handshake-simple"></i> ${esc(owner(p.a, s).name)} — ${esc(owner(p.b, s).name)}:
    ${esc(S(`PactKind.${p.kind}`))}${p.scope === "*" ? ` · ${esc(S("PactWholeCity"))}` : ""}${p.note ? ` <small>${esc(p.note)}</small>` : ""}</li>`).join("")}</ul>`;
}
function ownerOptions(s) {
  const acts = game.actors.filter(a => ["vampire", "ghoul", "mortal", "hunter", "werewolf", "demon", "creature"].includes(a.type)).sort((p, q) => p.name.localeCompare(q.name, "ru"));
  return [...Object.keys(s.owners).map(k => owner(k, s)), ...acts.map(a => owner(a.id, s))];
}

/** Строка заявки: жетон, намерение, цель, пул, текст. */
function bidRow(a, b, s, gm) {
  const sec = s.sectors.find(x => x.key === b.sector), p = poolOf(a, b, s);
  const pool = b.npc ? `${esc(S("NpcPool"))} ${b.dice}${p.own ? ` + ${p.own}` : ""} = ${p.dice} · ${esc(S("DiffShort"))} ${p.diff}`
    : `${esc(a.traitLabel?.(`attributes.${b.attr}`) ?? b.attr)} + ${esc(a.traitLabel?.(`abilities.${b.ability}`) ?? b.ability)}${p.own ? ` + ${p.own}` : ""} = ${p.dice} · ${esc(S("DiffShort"))} ${p.diff}`;
  const edit = !gm && s.turn.open && a.isOwner;
  return `<li class="rs-bid">
    <span class="rs-bidk" data-tooltip="${esc(S(`Kind.${b.kind}`))}"><i class="fa-solid ${KINDS[b.kind]?.icon}"></i></span>
    <div><b>${gm ? `${esc(a.name)} → ` : ""}${esc(S(`Intent.${b.intent}`))}${b.target ? ` · ${esc(targetName(b, s))}` : ""}${sec && view !== "map" ? ` · ${esc(sectorName(sec))}` : ""}</b>
      ${b.proxy ? `<em class="rs-tag" data-tooltip="${esc(S("ProxyHint"))}"><i class="fa-solid fa-masks-theater"></i> ${esc(owner(b.proxy, s).name)}</em>` : ""}${b.crude ? `<em class="rs-tag is-crude" data-tooltip="${esc(S("CrudeHint"))}"><i class="fa-solid fa-hand-fist"></i> ${esc(S("Crude"))}</em>` : ""}
      <small>${pool}${b.helper ? ` · ${esc(S("Helper"))}: ${esc(b.helper)}` : ""}</small>${b.text ? `<p>${esc(b.text)}</p>` : ""}</div>
    ${edit ? `<a data-rs="bidEdit" data-id="${b.id}"><i class="fa-solid fa-pen"></i></a><a data-rs="bidDel" data-id="${b.id}"><i class="fa-solid fa-xmark"></i></a>` : ""}
    ${gm && b.npc && !s.draft ? `<a data-rs="npcDel" data-id="${b.id}" data-tooltip="${esc(S("Delete"))}"><i class="fa-solid fa-xmark"></i></a>` : ""}</li>`;
}

/** Имя цели заявки: соперник, тренд или проект. */
function targetName(b, s) {
  const k = INTENTS[b.intent]?.target;
  if (k === "trend") return (s.trends ?? []).find(t => t.id === b.target)?.name ?? "?";
  if (k === "project") return allProjects().find(p => p.id === b.target)?.name ?? "?";
  return owner(b.target, s).name;
}

/** Сколько жетонов осталось у персонажа. */
function counters(a, s) {
  const bids = bidsOf(a, s);
  return Object.entries(KINDS).map(([k, d]) => { const max = d.count(a), used = bids.filter(b => b.kind === k).length; return { k, max, used, left: max - used, icon: d.icon }; });
}
function myCounters(s) {
  const a = meActor();
  if (game.user.isGM || !a) return "";
  const drag = s.turn.open;
  return `<div class="rs-counters">${counters(a, s).filter(c => c.max).map(c => `<span class="${drag && c.left > 0 ? "is-drag" : ""}" ${drag && c.left > 0 ? `draggable="true" data-rs-drag="${c.k}"` : ""}
    data-tooltip="${esc(S(`KindHint.${c.k}`))}${drag && c.left > 0 ? ` ${esc(S("DragHint"))}` : ""}"><i class="fa-solid ${c.icon}"></i> ${esc(S(`Kind.${c.k}`))} <b>${c.left}/${c.max}</b></span>`).join("")}</div>`;
}

/** Выбор цели: соперник в гексе, тренд в гексе или свой проект в гексе. */
function targetSelect(a, s, sec, b, others, opt) {
  const k = INTENTS[b.intent]?.target;
  if (!k) return "";
  const list = k === "trend" ? (s.trends ?? []).filter(t => t.sector === sec).map(t => [t.id, t.name])
    : k === "project" ? projectsOf(a).filter(p => p.sector === sec && (s.progress?.[p.id] ?? 0) < needOf(s, p.id)).map(p => [p.id, p.name])
    : others.map(x => [x.key, x.name]);
  return `<label>${esc(S("Target"))}<select name="target">${list.length ? opt(list, b.target) : `<option value="">${esc(S(k === "trend" ? "NoTrends" : k === "project" ? "NoProjects" : "NoTargets"))}</option>`}</select></label>`;
}

/** Форма заявки игрока: жетон, намерение, цель, пул с шансами, текст. */
function bidForm(a, s, sec) {
  const b = editBid?.sector === sec ? { ...DEFAULT_BID, ...editBid } : DEFAULT_BID;
  const cs = counters(a, s), free = cs.filter(c => c.left > 0 || c.k === b.kind && b.id);
  if (!free.length) return `${myCounters(s)}<p class="rs-note">${esc(S("NoTokens"))}</p>`;
  const others = Object.entries(s.tokens[sec] ?? {}).filter(([k, n]) => n > 0 && k !== a.id && sees(sec, k, s)).map(([k]) => owner(k, s));
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`).join("");
  const attrs = Object.keys(VTM20.attributes).map(k => [k, a.traitLabel?.(`attributes.${k}`) ?? k]);
  const era = game.settings.get(SYSTEM_ID, "era"), eraAbils = Object.values(VTM20.abilitiesForEra(era, a.type)).flat();
  const abils = eraAbils.filter(k => VTM20.abilities[k] && a.system.abilities?.[k]).map(k => [k, a.traitLabel?.(`abilities.${k}`) ?? k]).sort((p, q) => p[1].localeCompare(q[1], "ru"));
  const p = poolOf(a, { ...b, sector: sec }, s), o = odds({ pool: p.dice, difficulty: p.diff });
  return `${myCounters(s)}<form class="rs-form" data-sec="${sec}" data-id="${b.id}">
    <h4>${esc(S(b.id ? "EditBid" : "NewBid"))}</h4>
    <div class="rs-grid">
      <label>${esc(S("Token"))}<select name="kind">${opt(free.map(c => [c.k, `${S(`Kind.${c.k}`)} (${c.left})`]), b.kind)}</select></label>
      <label>${esc(S("IntentLabel"))}<select name="intent">${opt(Object.keys(INTENTS).map(k => [k, S(`Intent.${k}`)]), b.intent)}</select></label>
      ${targetSelect(a, s, sec, b, others, opt)}
      <label>${esc(S("Proxy"))}<select name="proxy" data-tooltip="${esc(S("ProxyHint"))}"><option value="">${esc(S("ProxyNone"))}</option>${opt(ownerOptions(s).filter(o => o.key !== a.id).map(o => [o.key, o.name]), b.proxy)}</select></label>
      <label>${esc(S("Attr"))}<select name="attr">${opt(attrs, b.attr)}</select></label>
      <label>${esc(S("Ability"))}<select name="ability">${opt(abils, b.ability)}</select></label>
      ${b.kind === "boon" ? `<label class="is-wide">${esc(S("Helper"))}<input type="text" name="helper" value="${esc(b.helper)}" placeholder="${esc(S("HelperHint"))}"></label>` : ""}
    </div>
    <label class="rs-chk rs-crude" data-tooltip="${esc(S("CrudeHint"))}"><input type="checkbox" name="crude" ${b.crude ? "checked" : ""}> <i class="fa-solid fa-hand-fist"></i> ${esc(S("CrudeLabel"))}</label>
    <p class="rs-odds">${esc(S("PoolLine", { dice: p.dice, own: p.own, diff: p.diff, mean: (o?.mean ?? 0).toFixed(1) }))}${p.storm ? ` ${esc(S("StormNote"))}` : ""}</p>
    <p class="rs-note">${esc(S(`IntentHint.${b.intent}`))}</p>
    <textarea name="text" rows="4" placeholder="${esc(S("TextHint"))}">${esc(b.text)}</textarea>
    <div class="rs-row"><a class="r-btn is-accent" data-rs="bidSave"><i class="fa-solid fa-check"></i> ${esc(S(b.id ? "Save" : "Place"))}</a>
      ${b.id ? `<a class="r-btn" data-rs="bidCancel">${esc(S("Cancel"))}</a>` : ""}</div>
  </form>`;
}

/* ── Мой ход (игрок) ── */

function turnView(s) {
  const a = meActor();
  if (!a) return `<p class="rs-note">${esc(S("NoActor"))}</p>`;
  const bids = bidsOf(a, s), done = doneOf(a, s);
  return `<section class="rs-turnv"><h3>${esc(S("MyTurn", { name: a.name }))}</h3>${myCounters(s)}
    <p class="rs-note">${esc(S(s.turn.open ? "TurnHint" : "TurnClosedHint"))}</p>
    <ul class="rs-bids">${bids.map(b => bidRow(a, b, s, false)).join("") || `<li class="rs-note">${esc(S("NoBids"))}</li>`}</ul>
    ${s.turn.open ? `<a class="r-btn ${done ? "" : "is-accent"}" data-rs="done"><i class="fa-solid ${done ? "fa-rotate-left" : "fa-flag-checkered"}"></i> ${esc(S(done ? "Undone" : "Done"))}</a>` : ""}
  </section>`;
}

/* ── Стол ведущего ── */

function deskView(s) {
  const bids = allBids(s), secs = [...new Set(bids.map(x => x.bid.sector))];
  const players = game.actors.filter(a => bidsOf(a, s).length || doneOf(a, s));
  const rolled = bids.length && bids.every(x => s.rolls[x.key]);
  if (s.draft) return draftView(s);
  const resist = resistPools(s, bids);
  const sec = secs.map(k => {
    const x = s.sectors.find(y => y.key === k), here = bids.filter(y => y.bid.sector === k);
    const out = here.every(y => s.rolls[y.key]) ? outcome(k, s, bids) : null;
    const rows = here.map(y => { const p = poolOf(y.actor, y.bid, s), m = s.mods[y.key] ?? {}, r = s.rolls[y.key];
      return `<li class="rs-dbid">${bidRow(y.actor, y.bid, s, true).replace(/^<li class="rs-bid">|<\/li>$/g, "")}
        <div class="rs-mods" data-key="${y.key}">
          <label data-tooltip="${esc(S("ModDiceHint"))}">±<input type="number" data-mod="dice" value="${m.dice ?? 0}"></label>
          <label data-tooltip="${esc(S("ModDiscHint"))}"><i class="fa-solid fa-droplet"></i><input type="number" min="0" max="3" data-mod="disc" value="${m.disc ?? 0}"></label>
          <label data-tooltip="${esc(S("ModDiffHint"))}">${esc(S("DiffShort"))}±<input type="number" data-mod="diff" value="${m.diff ?? 0}"></label>
          <span class="rs-res">${r ? `${faces(r, p.diff)} → <b>${r.succ}</b>${r.botch ? ` <em>${esc(S("Botch"))}</em>` : ""}` : `${p.dice}d10 / ${p.diff}`}</span>
          <a data-rs="roll" data-key="${y.key}" data-tooltip="${esc(S(r ? "Reroll" : "Roll"))}"><i class="fa-solid ${r ? "fa-rotate" : "fa-dice-d10"}"></i></a></div></li>`; }).join("");
    const rs = Object.entries(resist).filter(([rk]) => rk.split(".")[1] === k)
      .map(([rk, n]) => { const r = s.rolls[rk], [, , t, at] = rk.split(".");
        return `<li class="rs-resist">${esc(S("Resist", { who: owner(t, s).name, vs: owner(at, s).name }))} · ${n}d10 / 6 ${r ? `→ <b>${r.succ}</b>` : ""}</li>`; }).join("");
    return `<section class="rs-dsec"><h4>${esc(x ? sectorName(x) : k)}</h4><ul class="rs-bids">${rows}${rs}</ul>
      ${out ? `<ul class="rs-out">${out.lines.map(l => `<li>${esc(l.t)}</li>`).join("")}${out.trouble.map(t => `<li class="is-warn">${esc(S("Trouble", { who: t.actor.name }))}</li>`).join("")}</ul>` : ""}</section>`;
  }).join("");
  return `<section class="rs-desk">
    <div class="rs-row"><label class="rs-lbl">${esc(S("TurnLabel"))}<input type="text" data-rs-label value="${esc(s.turn.label)}" placeholder="${esc(S("TurnLabelHint"))}"></label>
      <a class="r-btn" data-rs="open">${esc(S(s.turn.open ? "CloseBids" : "OpenBids"))}</a></div>
    <div class="rs-row rs-inline" data-tooltip="${esc(S("ShiftHint"))}"><span class="rs-lbl">${esc(S("Shift"))}</span>
      <input type="number" min="0" max="999" data-rs-shift="n" value="${s.turn.shift?.n ?? 0}">
      <select data-rs-shift="unit">${["days", "months", "years"].map(u => `<option value="${u}" ${(s.turn.shift?.unit ?? "months") === u ? "selected" : ""}>${esc(unitLabel(u))}</option>`).join("")}</select></div>
    <p class="rs-note">${players.length ? players.map(a => `${doneOf(a, s) ? "✔" : "…"} ${esc(a.name)}`).join(" · ") : esc(S("NoPlayersYet"))}</p>
    ${secs.length ? sec : `<p class="rs-note">${esc(S("NoBidsAll"))}</p>`}
    ${npcForm(s)}${pactForm(s)}
    <div class="rs-row">${bids.length ? `<a class="r-btn" data-rs="rollAll"><i class="fa-solid fa-dice"></i> ${esc(S("RollAll"))}</a>` : ""}
      <a class="r-btn ${rolled ? "is-accent" : ""}" data-rs="resolve"><i class="fa-solid fa-gavel"></i> ${esc(S("Resolve"))}</a></div>
  </section>`;
}
/** Ход NPC или фракции: владелец, гекс, что делает, против кого, готовый пул. */
function npcForm(s) {
  const opt = (list, cur = "") => list.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`).join("");
  const owners = ownerOptions(s).filter(o => !o.actor?.hasPlayerOwner).map(o => [o.key, o.name]);
  return `<details class="rs-npc"><summary><i class="fa-solid fa-chess-rook"></i> ${esc(S("NpcTurn"))}</summary>
    <form class="rs-npcform"><p class="rs-note">${esc(S("NpcHint"))}</p><div class="rs-grid">
      <label>${esc(S("NpcOwner"))}<select name="owner">${opt(owners)}</select></label>
      <label>${esc(S("NpcSector"))}<select name="sector">${opt(visibleSectors(s).map(x => [x.key, sectorName(x)]), sel ?? "")}</select></label>
      <label>${esc(S("IntentLabel"))}<select name="intent">${opt(Object.keys(INTENTS).map(k => [k, S(`Intent.${k}`)]))}</select></label>
      <label>${esc(S("Target"))}<select name="target"><option value="">—</option>${opt(ownerOptions(s).map(o => [o.key, o.name]))}</select></label>
      <label>${esc(S("NpcDice"))}<input type="number" name="dice" value="6" min="0" max="20"></label>
    </div><textarea name="text" rows="2" placeholder="${esc(S("NpcText"))}"></textarea>
    <div class="rs-row"><a class="r-btn" data-rs="npcAdd"><i class="fa-solid fa-plus"></i> ${esc(S("NpcAdd"))}</a></div></form></details>`;
}
/** Договор между владельцами влияния: записывается ведущим (игроки договариваются в игре). */
function pactForm(s) {
  const opt = list => list.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
  const owners = ownerOptions(s).map(o => [o.key, o.name]);
  const list = (s.pacts ?? []).map(p => `<li><i class="fa-solid fa-handshake-simple"></i> ${esc(owner(p.a, s).name)} — ${esc(owner(p.b, s).name)}: ${esc(S(`PactKind.${p.kind}`))} ·
    ${esc(p.scope === "*" ? S("PactWholeCity") : sectorName(s.sectors.find(x => x.key === p.scope) ?? {}))} <a data-rs="pactDel" data-id="${p.id}"><i class="fa-solid fa-xmark"></i></a></li>`).join("");
  return `<details class="rs-npc"><summary><i class="fa-solid fa-handshake-simple"></i> ${esc(S("Pacts"))} (${(s.pacts ?? []).length})</summary>
    <form class="rs-npcform"><p class="rs-note">${esc(S("PactHint"))}</p><ul class="rs-pacts">${list}</ul><div class="rs-grid">
      <label>${esc(S("PactA"))}<select name="a">${opt(owners)}</select></label><label>${esc(S("PactB"))}<select name="b">${opt(owners)}</select></label>
      <label>${esc(S("PactScope"))}<select name="scope"><option value="*">${esc(S("PactWholeCity"))}</option>${opt(visibleSectors(s).map(x => [x.key, sectorName(x)]))}</select></label>
      <label>${esc(S("PactKindLabel"))}<select name="kind">${opt(["peace", "split"].map(k => [k, S(`PactKind.${k}`)]))}</select></label>
    </div><input type="text" name="note" placeholder="${esc(S("PactNote"))}">
    <div class="rs-row"><a class="r-btn" data-rs="pactAdd"><i class="fa-solid fa-plus"></i> ${esc(S("PactAdd"))}</a></div></form></details>`;
}
const faces = (r, diff) => r.faces.map(f => `<i class="${f >= diff ? "is-hit" : f === 1 ? "is-one" : ""}">${f}</i>`).join("");

/** Черновик отчёта: общий текст и личные куски — правит ведущий, потом «Опубликовать». */
function draftView(s) {
  const d = s.draft;
  return `<section class="rs-draft"><h3>${esc(S("Report", { n: s.turn.n }))}</h3>
    <label>${esc(S("ReportPublic"))}<textarea data-rs-draft="public" rows="8">${esc(d.public)}</textarea></label>
    ${Object.entries(d.private).map(([id, t]) => `<label>${esc(S("ReportPrivate", { name: game.actors.get(id)?.name ?? "?" }))}<textarea data-rs-draft="${id}" rows="5">${esc(t)}</textarea></label>`).join("")}
    <div class="rs-row"><a class="r-btn is-accent" data-rs="publish"><i class="fa-solid fa-feather"></i> ${esc(S("Publish"))}</a>
      <a class="r-btn" data-rs="draftCancel">${esc(S("DraftCancel"))}</a></div></section>`;
}

/* ── Отчёты ── */

function reportsView(s) {
  const list = [...s.reports].reverse();
  return `<section class="rs-reports"><h3>${esc(S("Reports"))}</h3>
    <ul>${list.map(r => `<li><a data-rs="openReport" data-uuid="${r.uuid}"><i class="fa-solid fa-scroll"></i> ${esc(S("TurnN", { n: r.n }))}${r.label ? ` · ${esc(r.label)}` : ""}</a> <small>${esc(r.date ?? "")}</small>
      ${r.tokens ? `<a class="rs-histbtn ${hist === r.n ? "on" : ""}" data-rs="hist" data-n="${r.n}" data-tooltip="${esc(S("HistoryShow"))}"><i class="fa-solid fa-hexagon-nodes"></i></a>` : ""}
      ${game.user.isGM && r.clockFrom != null && !r.clockUndone ? `<a class="rs-histbtn" data-rs="clockUndo" data-n="${r.n}" data-tooltip="${esc(S("ClockUndo"))}"><i class="fa-solid fa-clock-rotate-left"></i></a>` : ""}
      ${r.clockFrom != null ? `<small>${esc(S(r.clockUndone ? "ClockUndone" : "ClockShifted", { span: r.shiftText ?? "" }))}</small>` : ""}</li>`).join("") || `<li class="rs-note">${esc(S("NoReports"))}</li>`}</ul></section>`;
}

/* ── Настройка (ведущий) ── */

function setupView(s) {
  const dists = EXT.strategy.districts.flatMap(f => f());
  const sph = s.spheres.map((x, i) => `<li><input type="color" data-rs-sph="${i}" data-f="color" value="${x.color}"><input type="text" data-rs-sph="${i}" data-f="name" value="${esc(sphereName(x))}"></li>`).join("");
  const secs = s.sectors.map((x, i) => `<li class="rs-setsec ${sel === x.key ? "is-sel" : ""}">
    <input type="text" data-rs-sec="${i}" data-f="name" value="${esc(sectorName(x))}">
    <select data-rs-sec="${i}" data-f="sphere">${s.spheres.map(y => `<option value="${y.key}" ${y.key === x.sphere ? "selected" : ""}>${esc(sphereName(y))}</option>`).join("")}</select>
    <span class="rs-qr"><a data-rs="move" data-i="${i}" data-dq="-1" data-dr="0">◀</a><a data-rs="move" data-i="${i}" data-dq="1" data-dr="-1">◥</a><a data-rs="move" data-i="${i}" data-dq="0" data-dr="-1">◤</a>
      <a data-rs="move" data-i="${i}" data-dq="0" data-dr="1">◣</a><a data-rs="move" data-i="${i}" data-dq="-1" data-dr="1">◢</a><a data-rs="move" data-i="${i}" data-dq="1" data-dr="0">▶</a></span>
    ${dists.length ? `<select data-rs-sec="${i}" data-f="district"><option value="">${esc(S("NoDistrict"))}</option>${dists.map(d => `<option value="${d.key}" ${d.key === x.district ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select>` : ""}
    <select data-rs-sec="${i}" data-f="perk" data-tooltip="${esc(S("PerkHint"))}"><option value="">${esc(S("PerkNone"))}</option>${PERKS.map(k => `<option value="${k}" ${x.perk === k ? "selected" : ""}>${esc(perkName(k))}</option>`).join("")}</select>
    <label class="rs-chk"><input type="checkbox" data-rs-sec="${i}" data-f="hidden" ${x.hidden ? "checked" : ""}> ${esc(S("Hidden"))}</label>
    <a data-rs="secDel" data-i="${i}" data-tooltip="${esc(S("Delete"))}"><i class="fa-solid fa-trash"></i></a>
    <textarea data-rs-sec="${i}" data-f="about" rows="2" placeholder="${esc(S("AboutHint"))}">${esc(x.about)}</textarea></li>`).join("");
  const facs = Object.entries(s.owners).map(([k, f]) => `<li><input type="color" data-rs-fac="${k}" data-f="color" value="${f.color}"><input type="text" data-rs-fac="${k}" data-f="name" value="${esc(f.name)}"><a data-rs="facDel" data-key="${k}"><i class="fa-solid fa-trash"></i></a></li>`).join("");
  return `<section class="rs-setup">
    <h4>${esc(S("Spheres"))}</h4><ul class="rs-setsph">${sph}</ul><a class="r-btn" data-rs="sphAdd"><i class="fa-solid fa-plus"></i> ${esc(S("SphereAdd"))}</a>
    <h4>${esc(S("Factions"))}</h4><p class="rs-note">${esc(S("FactionsHint"))}</p><ul class="rs-setsph">${facs}</ul><a class="r-btn" data-rs="facAdd"><i class="fa-solid fa-plus"></i> ${esc(S("FactionAdd"))}</a>
    <h4>${esc(S("Sectors"))}</h4><ul class="rs-setsecs">${secs}</ul><a class="r-btn" data-rs="secAdd"><i class="fa-solid fa-plus"></i> ${esc(S("SectorAdd"))}</a>
    <h4>${esc(S("Danger"))}</h4><a class="r-btn rc-danger" data-rs="wipe"><i class="fa-solid fa-trash"></i> ${esc(S("Wipe"))}</a>
  </section>`;
}

/* ── События ───────────────────────────────────────────────────────────── */

async function onClick(ev) {
  const el = ev.target.closest("[data-rs]");
  if (!el) return;
  ev.preventDefault();
  const s = strat(), gm = game.user.isGM, act = el.dataset.rs;
  switch (act) {
    case "view": view = el.dataset.v; editBid = null; return renderBoard();
    case "sector": sel = el.dataset.key; editBid = null; if (view !== "setup") view = "map"; return renderBoard();
    case "preset": return loadPreset(el.dataset.id);
    case "fly": { const d = EXT.strategy.districts.flatMap(f => f()).find(x => x.key === el.dataset.key); if (d) { setMode("map"); host.fly?.(d.lat, d.lng, 15); } return; }
    case "tok": {
      const t = s.tokens[sel] ?? {}, n = Math.clamp((t[el.dataset.owner] ?? 0) + Number(el.dataset.d), 0, MAX);
      const sum = Object.entries(t).reduce((m, [k, v]) => m + (k === el.dataset.owner ? 0 : v), 0);
      if (sum + n > MAX) return ui.notifications.warn(S("Full", { n: MAX }));
      return save({ tokens: { ...s.tokens, [sel]: { ...t, [el.dataset.owner]: n } } });
    }
    case "reveal": return save({ reveal: { ...s.reveal, [sel]: !s.reveal[sel] } });
    case "bidSave": return saveBid(el.closest("form"));
    case "bidCancel": editBid = null; return renderBoard();
    case "bidEdit": { const a = meActor(); editBid = bidsOf(a, s).find(b => b.id === el.dataset.id) ?? null; if (editBid) { sel = editBid.sector; view = "map"; } return renderBoard(); }
    case "bidDel": { const a = meActor(); return setBids(a, bidsOf(a, s).filter(b => b.id !== el.dataset.id)); }
    case "done": { const a = meActor(); return setBids(a, bidsOf(a, s), !doneOf(a, s)); }
    case "openReport": return (await fromUuid(el.dataset.uuid))?.sheet?.render(true);
    case "hist": hist = hist === Number(el.dataset.n) ? null : Number(el.dataset.n); return renderBoard();
    case "histOff": hist = null; return renderBoard();
    case "guide": return openGuide();
    case "projAdd": {
      const a = meActor(), name = el.closest(".rs-row")?.querySelector("[data-rs-newproj]")?.value.trim();
      if (!a || !name) return;
      return a.setFlag(SYSTEM_ID, PROJ, [...projectsOf(a), { id: uid(), sector: sel, name }]);
    }
    case "projDel": { const a = meActor(); if (a) return a.setFlag(SYSTEM_ID, PROJ, projectsOf(a).filter(p => p.id !== el.dataset.id)); return; }
  }
  if (!gm) return;
  switch (act) {
    case "open": await save({ turn: { ...s.turn, open: !s.turn.open } });
      return notify(S(s.turn.open ? "NotifyClosed" : "NotifyOpened", { n: s.turn.n }));
    case "trendAdd": { const name = el.closest(".rs-row")?.querySelector("[data-rs-newtrend]")?.value.trim();
      if (!name || !sel) return;
      const t = { id: uid(), sector: sel, name, level: 1, grow: 1 };
      await save({ trends: [...(s.trends ?? []), t] });
      return trendToDomains(t, s); }
    case "trendLvl": return save({ trends: (s.trends ?? []).map(t => t.id === el.dataset.id ? { ...t, level: Math.clamp(t.level + Number(el.dataset.d), 1, 5) } : t) });
    case "trendGrow": return save({ trends: (s.trends ?? []).map(t => t.id === el.dataset.id ? { ...t, grow: t.grow ? 0 : 1 } : t) });
    case "trendDel": return save({ trends: (s.trends ?? []).filter(t => t.id !== el.dataset.id) });
    case "projNeed": return save({ projNeed: { ...s.projNeed, [el.dataset.id]: Math.clamp(needOf(s, el.dataset.id) + Number(el.dataset.d), 1, 60) } });
    case "pactAdd": return addPact(new foundry.applications.ux.FormDataExtended(el.closest("form")).object);
    case "pactDel": return save({ pacts: (s.pacts ?? []).filter(p => p.id !== el.dataset.id) });
    case "clockUndo": return undoClock(Number(el.dataset.n));
    case "roll": return rollKeys([el.dataset.key], true);
    case "rollAll": return rollKeys(allBids(s).map(x => x.key), false);
    case "resolve": return resolve();
    case "publish": return publish();
    case "draftCancel": return save({ draft: null });
    case "npcAdd": {
      const fd = new foundry.applications.ux.FormDataExtended(el.closest("form")).object;
      if (!fd.owner || !fd.sector) return;
      if (INTENTS[fd.intent]?.target && !fd.target) return ui.notifications.warn(S("NeedTarget"));
      return save({ npc: [...(s.npc ?? []), { id: uid(), npc: true, owner: fd.owner, sector: fd.sector, kind: "attention", intent: fd.intent,
        target: INTENTS[fd.intent]?.target ? fd.target : "", dice: Number(fd.dice) || 0, text: String(fd.text ?? "").trim() }] });
    }
    case "npcDel": return save({ npc: (s.npc ?? []).filter(b => b.id !== el.dataset.id) });
    case "secAdd": { const key = uid(), q = Math.max(0, ...s.sectors.map(x => x.q)) + 1; sel = key;
      return save({ sectors: [...s.sectors, { key, name: S("NewSector"), sphere: s.spheres[0]?.key ?? "", q, r: 0, about: "" }] }); }
    case "secDel": { const x = s.sectors[Number(el.dataset.i)];
      if (!(await foundry.applications.api.DialogV2.confirm({ window: { title: S("Delete") }, content: `<p>${esc(S("DeleteSector", { name: sectorName(x) }))}</p>` }))) return;
      const tokens = { ...s.tokens }; delete tokens[x.key];
      return save({ sectors: s.sectors.filter((_, i) => i !== Number(el.dataset.i)), tokens }); }
    case "move": { const secs = s.sectors.map(x => ({ ...x })), x = secs[Number(el.dataset.i)];
      x.q += Number(el.dataset.dq); x.r += Number(el.dataset.dr); sel = x.key; return save({ sectors: secs }); }
    case "sphAdd": return save({ spheres: [...s.spheres, { key: uid(), name: S("NewSphere"), color: "#777777" }] });
    case "facAdd": return save({ owners: { ...s.owners, [`f:${uid()}`]: { name: S("NewFaction"), color: "#5a6b7d" } } });
    case "facDel": { const owners = { ...s.owners }; delete owners[el.dataset.key]; return save({ owners }); }
    case "wipe": if (await foundry.applications.api.DialogV2.confirm({ window: { title: S("Wipe") }, content: `<p>${esc(S("WipeConfirm"))}</p>` })) return game.settings.set(SYSTEM_ID, "strategy", {});
  }
}

async function onChange(ev) {
  const el = ev.target, s = strat();
  if (el.matches("[data-rs-me]")) { me = el.value; editBid = null; return renderBoard(); }
  if (el.closest(".rs-npcform") || el.matches("[data-rs-newtrend], [data-rs-newproj]")) return;
  if (el.closest(".rs-form")) {         // форма заявки: пересчитать пул и шансы
    const f = el.closest(".rs-form"), fd = new foundry.applications.ux.FormDataExtended(f).object;
    editBid = { ...(editBid ?? {}), ...fd, id: f.dataset.id, sector: f.dataset.sec };
    if (!INTENTS[editBid.intent]?.target) editBid.target = "";
    return renderBoard();
  }
  if (!game.user.isGM) return;
  if (el.matches("[data-rs-addowner]") && el.value) return save({ tokens: { ...s.tokens, [sel]: { ...(s.tokens[sel] ?? {}), [el.value]: Math.max(1, s.tokens[sel]?.[el.value] ?? 0) } } });
  if (el.matches("[data-rs-label]")) return save({ turn: { ...s.turn, label: el.value } });
  if (el.dataset.rsShift) return save({ turn: { ...s.turn, shift: { ...(s.turn.shift ?? { n: 0, unit: "months" }), [el.dataset.rsShift]: el.dataset.rsShift === "n" ? Math.max(0, Number(el.value) || 0) : el.value } } });
  if (el.dataset.mod) { const k = el.closest("[data-key]").dataset.key; return save({ mods: { ...s.mods, [k]: { ...(s.mods[k] ?? {}), [el.dataset.mod]: Number(el.value) || 0 } } }); }
  if (el.dataset.rsDraft) return save({ draft: el.dataset.rsDraft === "public" ? { ...s.draft, public: el.value } : { ...s.draft, private: { ...s.draft.private, [el.dataset.rsDraft]: el.value } } });
  const v = el.type === "checkbox" ? el.checked : el.value;
  if (el.dataset.rsSec) { const secs = s.sectors.map(x => ({ ...x })); secs[Number(el.dataset.rsSec)][el.dataset.f] = v; return save({ sectors: secs }); }
  if (el.dataset.rsSph) { const sp = s.spheres.map(x => ({ ...x })); sp[Number(el.dataset.rsSph)][el.dataset.f] = v; return save({ spheres: sp }); }
  if (el.dataset.rsFac) return save({ owners: { ...s.owners, [el.dataset.rsFac]: { ...s.owners[el.dataset.rsFac], [el.dataset.f]: v } } });
}

/** Заявка игрока: проверить жетоны и записать во флаг актёра. */
async function saveBid(form) {
  const a = meActor(), s = strat();
  if (!a || !s.turn.open) return;
  const fd = new foundry.applications.ux.FormDataExtended(form).object, id = form.dataset.id;
  const bid = { id: id || uid(), sector: form.dataset.sec, kind: fd.kind, intent: fd.intent, target: INTENTS[fd.intent]?.target ? fd.target ?? "" : "",
    attr: fd.attr, ability: fd.ability, text: String(fd.text ?? "").trim(), helper: fd.helper ?? "", proxy: fd.proxy ?? "", crude: !!fd.crude };
  if (INTENTS[bid.intent].target && !bid.target) return ui.notifications.warn(S("NeedTarget"));
  const left = counters(a, s).find(c => c.k === bid.kind);
  if (!id && (!left || left.left <= 0)) return ui.notifications.warn(S("NoTokens"));
  const bids = bidsOf(a, s), next = id ? bids.map(b => b.id === id ? bid : b) : [...bids, bid];
  editBid = null;
  await setBids(a, next);
}

/** Бросить заявки (и нужное им сопротивление). force — перебросить уже брошенные. */
async function rollKeys(keys, force) {
  const s = strat(), bids = allBids(s), rolls = { ...s.rolls };
  for (const x of bids.filter(y => keys.includes(y.key))) {
    if (rolls[x.key] && !force) continue;
    const p = poolOf(x.actor, x.bid, s);
    rolls[x.key] = await rollDice(p.dice, p.diff);
  }
  // сопротивление — после «Защиты» (её успехи входят в пул)
  for (const [k, n] of Object.entries(resistPools({ ...s, rolls }, bids))) {
    const [, sec, , at] = k.split(".");
    if (rolls[k] && !(force && keys.some(x => x.startsWith(`${at}.`) && bids.find(y => y.key === x)?.bid.sector === sec))) continue;
    rolls[k] = await rollDice(n, 6);
  }
  await save({ rolls });
}

/** Провести ход: добросить недостающее, применить итог, собрать черновик отчёта. */
async function resolve() {
  await rollKeys(allBids().map(x => x.key), false);
  const s = strat(), bids = allBids(s), secs = [...new Set(bids.map(x => x.bid.sector))];
  const tokens = foundry.utils.deepClone(s.tokens), known = foundry.utils.deepClone(s.known);
  const pub = [], priv = {}, curbed = {}, progress = { ...(s.progress ?? {}) }, broken = [], heat = [];
  for (const sec of secs) {
    const x = s.sectors.find(y => y.key === sec), name = x ? sectorName(x) : sec, out = outcome(sec, s, bids);
    tokens[sec] = out.tokens;
    for (const id of out.scouted) (known[id] ??= {})[sec] = true;
    for (const [id, n] of Object.entries(out.curbed)) curbed[id] = (curbed[id] ?? 0) + n;
    for (const [id, n] of Object.entries(out.progress)) progress[id] = (progress[id] ?? 0) + n;
    for (const b of out.broken) { broken.push(b); pub.push(S("Out.pactBroken", { who: owner(b.who, s).name, target: owner(b.victim, s).name })); }
    // грубая работа оставляет след: жар Маскарада в квартале сектора (провал — сильнее, провал с единицами — ещё сильнее)
    for (const y of bids.filter(z => z.bid.sector === sec && z.bid.crude)) {
      const r = s.rolls[y.key], level = r?.botch ? 3 : (r?.succ ?? 0) === 0 ? 2 : 1;
      if (x?.district) heat.push({ district: x.district, level, sector: name });
    }
    if (Object.keys(out.delta).length) pub.push(`${name}: ${Object.entries(out.delta).map(([k, n]) => `${owner(k, s).name} ${n > 0 ? "+" : ""}${n}`).join(", ")}`);
    for (const y of bids.filter(z => z.bid.sector === sec && !z.actor.npc)) {
      const r = s.rolls[y.key];
      (priv[y.actor.id] ??= []).push(`${name} — ${S(`Intent.${y.bid.intent}`)} (${S(`Kind.${y.bid.kind}`)}): ${S("Successes", { n: r?.succ ?? 0 })}${r?.botch ? `, ${S("Botch")}` : ""}.`
        + (y.bid.proxy ? ` ${S("ProxyMine", { name: owner(y.bid.proxy, s).name })}` : "") + (y.bid.crude ? ` ${S("CrudeMine")}` : ""));
    }
    for (const l of out.lines) for (const id of l.ids) if (priv[id]) priv[id].push(`  ${l.t}`);
    for (const t of out.trouble) priv[t.actor.id].push(`  ${S("Trouble", { who: t.actor.name })}`);
    for (const d of out.debts) priv[d.actor.id].push(`  ${S("Debt", { who: d.bid.helper || "?" })}`);
  }
  // тренды: обузданные слабеют, прочие растут; на пятом уровне подтачивают сильнейшего в гексе
  const trends = [];
  for (const t of s.trends ?? []) {
    const sx = s.sectors.find(y => y.key === t.sector), nm = sx ? sectorName(sx) : t.sector, c = curbed[t.id] ?? 0;
    const level = Math.min(5, t.level - c + (c ? 0 : t.grow ?? 1));
    if (level <= 0) { pub.push(S("Out.trendGone", { name: t.name, sector: nm })); continue; }
    trends.push({ ...t, level });
    pub.push(S(level > t.level ? "Out.trendUp" : level < t.level ? "Out.trendDown" : "Out.trendSame", { name: t.name, sector: nm, n: level }));
    if (level >= 5) {
      const top = Object.entries(tokens[t.sector] ?? {}).filter(([, n]) => n > 0).sort((p, q) => q[1] - p[1])[0];
      if (top) { tokens[t.sector] = { ...tokens[t.sector], [top[0]]: top[1] - 1 }; pub.push(S("Out.trendErode", { name: t.name, who: owner(top[0], s).name })); }
    }
  }
  for (const h of heat) pub.push(S("Out.heat", { sector: h.sector }));
  await save({ tokens, known, trends, progress, draft: { broken, heat,
    public: `${S("ReportIntro", { label: s.turn.label || S("TurnN", { n: s.turn.n }) })}\n\n${pub.join("\n") || S("QuietTurn")}`,
    private: Object.fromEntries(Object.entries(priv).map(([k, v]) => [k, v.join("\n")]))
  } });
}

/** Опубликовать отчёт журналом (общая страница + личные), записать долги, начать новый ход. */
async function publish() {
  const s = strat(), d = s.draft;
  if (!d) return;
  const p = t => t.split(/\n{2,}/).map(par => `<p>${esc(par).replace(/\n/g, "<br>")}</p>`).join("");
  const title = `${S("Title")} — ${S("TurnN", { n: s.turn.n })}${s.turn.label ? ` (${s.turn.label})` : ""}`;
  // домены в кварталах: Защищённость по фишкам хода (план 2) — в журналы доменов и в общий отчёт
  const doms = await domainSecurity(s);
  const pages = [{ name: S("ReportCity"), type: "text", text: { content: p(doms.length ? `${d.public}\n\n${doms.join("\n")}` : d.public) } },
    ...Object.entries(d.private).map(([id, t]) => {
      const a = game.actors.get(id), users = game.users.filter(u => !u.isGM && a?.testUserPermission(u, "OWNER"));
      return { name: a?.name ?? "?", type: "text", text: { content: p(t) }, ownership: { default: 0, ...Object.fromEntries(users.map(u => [u.id, 2])) } };
    })];
  // часы хроники: ведущий подтверждает или меняет срок, может и не сдвигать (отменить потом — в «Отчётах»)
  const shift = await askShift(s.turn.shift);
  const je = await JournalEntry.create({ name: title, ownership: { default: 2 }, pages });
  const { getClock, setClock } = await import("../apps/calendar.mjs");
  let clock = {};
  if (shift?.n > 0) {
    const from = getClock(), to = shiftDate(from, shift);
    await setClock(to);
    clock = { clockFrom: from, clockTo: to, shiftText: unitText(shift.n, shift.unit) };
  }
  await breakPacts(s, d.broken ?? []);
  await addHeat(d.heat ?? [], s.turn.n);
  // услуги → долги в реестре
  for (const x of allBids(s).filter(y => y.bid.kind === "boon" && !y.actor.npc)) {
    const boons = [...(x.actor.system.boons ?? []), { name: x.bid.helper || "?", dir: "owe", level: "minor", note: S("DebtNote", { n: s.turn.n, sector: sectorName(s.sectors.find(y => y.key === x.bid.sector) ?? {}) }), date: "", done: false }];
    if (x.actor.system.boons) await x.actor.update({ "system.boons": boons });
  }
  const broken = new Set((d.broken ?? []).map(b => b.pact.id));
  await save({ draft: null, rolls: {}, mods: {}, turn: { n: s.turn.n + 1, label: "", open: true, shift: s.turn.shift },
    npc: [], pacts: (s.pacts ?? []).filter(p => !broken.has(p.id)),
    reports: [...s.reports, { n: s.turn.n, label: s.turn.label, uuid: je.uuid, date: new Date().toLocaleDateString(game.i18n.lang),
      tokens: foundry.utils.deepClone(s.tokens), sectors: foundry.utils.deepClone(s.sectors), ...clock }] });
  hist = null;
  ui.notifications.info(S("Published", { n: s.turn.n }));
  await notify(S("NotifyPublished", { n: s.turn.n, next: s.turn.n + 1 }) + (clock.shiftText ? ` ${S("NotifyShift", { span: clock.shiftText })}` : ""));
}

/** Срок хода в часах хроники: подтвердить, поменять или не сдвигать. */
async function askShift(shift = { n: 0, unit: "months" }) {
  const units = ["days", "months", "years"].map(u => `<option value="${u}" ${shift.unit === u ? "selected" : ""}>${esc(unitLabel(u))}</option>`).join("");
  return foundry.applications.api.DialogV2.wait({
    window: { title: S("ShiftTitle"), icon: "fa-solid fa-clock" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<p>${esc(S("ShiftAsk"))}</p><div class="r-row"><input type="number" name="n" min="0" max="999" value="${shift.n ?? 0}" style="width:80px"> <select name="unit">${units}</select></div>`,
    buttons: [
      { action: "shift", label: S("ShiftDo"), icon: "fa-solid fa-clock", default: true, callback: (ev, btn) => ({ n: Math.max(0, Number(btn.form.elements.n.value) || 0), unit: btn.form.elements.unit.value }) },
      { action: "keep", label: S("ShiftSkip"), icon: "fa-solid fa-ban", callback: () => null }
    ]
  });
}
function shiftDate(ms, { n, unit }) {
  const d = new Date(ms);
  if (unit === "years") d.setFullYear(d.getFullYear() + n);
  else if (unit === "months") d.setMonth(d.getMonth() + n);
  else d.setDate(d.getDate() + n);
  return d.getTime();
}
/** Отменить сдвиг часов, сделанный публикацией хода. */
async function undoClock(n) {
  const s = strat(), r = s.reports.find(x => x.n === n);
  if (!r || r.clockFrom == null) return;
  if (!(await foundry.applications.api.DialogV2.confirm({ window: { title: S("ClockUndo") }, content: `<p>${esc(S("ClockUndoAsk", { span: r.shiftText ?? "" }))}</p>` }))) return;
  const { getClock, setClock } = await import("../apps/calendar.mjs");
  await setClock(getClock() - (r.clockTo - r.clockFrom));
  await save({ reports: s.reports.map(x => x.n === n ? { ...x, clockUndone: true } : x) });
  return notify(S("NotifyShiftUndone", { span: r.shiftText ?? "" }));
}
/** Сообщение в чат для всех: открыт ход, закрыт приём, вышел отчёт. */
function notify(text) {
  return ChatMessage.create({ speaker: { alias: S("Title") }, content: `<div class="r-notice"><i class="fa-solid fa-chess-knight"></i> ${esc(text)}</div>` });
}
/** Договор: в реестр услуг обоим (если это персонажи), в стратегию — для проверки нарушений. */
async function addPact(fd) {
  const s = strat();
  if (!fd.a || !fd.b || fd.a === fd.b) return ui.notifications.warn(S("PactNeedTwo"));
  const pact = { id: uid(), a: fd.a, b: fd.b, scope: fd.scope || "*", kind: fd.kind || "peace", note: String(fd.note ?? "").trim() };
  const where = pact.scope === "*" ? S("PactWholeCity") : sectorName(s.sectors.find(x => x.key === pact.scope) ?? {});
  for (const [me_, other] of [[pact.a, pact.b], [pact.b, pact.a]]) {
    const a = game.actors.get(me_);
    if (a?.system.boons) await a.update({ "system.boons": [...a.system.boons, { name: owner(other, s).name, dir: "owed", level: "trivial",
      note: S("PactBoonNote", { kind: S(`PactKind.${pact.kind}`), where }), date: "", done: false }] });
  }
  await save({ pacts: [...(s.pacts ?? []), pact] });
}
/** Нарушитель договора должен жертве большую услугу — обоим в реестр. */
async function breakPacts(s, broken) {
  for (const b of broken) {
    const v = game.actors.get(b.who), w = game.actors.get(b.victim);
    if (v?.system.boons) await v.update({ "system.boons": [...v.system.boons, { name: owner(b.victim, s).name, dir: "owe", level: "major", note: S("PactBrokenNote", { n: s.turn.n }), date: "", done: false }] });
    if (w?.system.boons) await w.update({ "system.boons": [...w.system.boons, { name: owner(b.who, s).name, dir: "owed", level: "major", note: S("PactBrokenNote", { n: s.turn.n }), date: "", done: false }] });
  }
}
/** Жар Маскарада от грубых заявок — нарушение на карте в квартале сектора (ui/masquerade.mjs). */
async function addHeat(list, n) {
  if (!list.length) return;
  const raw = foundry.utils.deepClone(game.settings.get(SYSTEM_ID, "cityMap") ?? {});
  const c = raw.cities?.[raw.current];
  if (raw.v !== 2 || !c) return;
  const { getClock } = await import("../apps/calendar.mjs");
  const dists = EXT.strategy.districts.flatMap(f => f());
  for (const h of list) {
    const d = dists.find(x => x.key === h.district);
    if (!d) continue;
    (c.breaches ??= []).push({ id: uid(), lat: d.lat + (Math.random() - .5) * .002, lng: d.lng + (Math.random() - .5) * .003, level: h.level, at: getClock(),
      text: S("HeatNote", { n, sector: h.sector }), gmOnly: false });
  }
  await game.settings.set(SYSTEM_ID, "cityMap", raw);
}

/* ── Стратегия ↔ домен (план 2; правило системы, согласовано): квартал домена, Защищённость по фишкам, события ↔ тренды ── */

/** Середина места домена на карте: зона рассказчика или обведённый игроком домен (system.zone) — из настроек, без открытой карты. */
function domainSpot(da) {
  const id = da?.system.zone;
  if (!id) return null;
  const raw = game.settings.get(SYSTEM_ID, "cityMap") ?? {}, cid = raw.current ?? Object.keys(raw.cities ?? {})[0], c = raw.cities?.[cid] ?? {};
  const pts = (c.zones ?? []).find(z => z.id === id)?.points
    ?? game.users.contents.flatMap(u => (u.getFlag(SYSTEM_ID, "cityDomains") ?? {})[cid] ?? []).find(d => d.id === id)?.points;
  return pts?.length ? pts.reduce(([a, b], [x, y]) => [a + x / pts.length, b + y / pts.length], [0, 0]) : null;
}
/** Квартал домена — ближайший к середине его места квартал стратегии (кварталы дают модули города). */
export function domainDistrict(da) {
  const at = domainSpot(da), list = EXT.strategy.districts.flatMap(f => f());
  if (!at || !list.length) return null;
  const far = d => (d.lat - at[0]) ** 2 + ((d.lng - at[1]) * Math.cos(at[0] * Math.PI / 180)) ** 2;
  return list.reduce((best, d) => !best || far(d) < far(best) ? d : best, null);
}
const domainSectors = (da, s = strat()) => { const d = domainDistrict(da); return d ? s.sectors.filter(x => x.district === d.key) : []; };
/** Сторона хозяина домена: сам хозяин, у котерии — она и её участники. */
function ownerSide(da) {
  const o = game.actors.get(da.system.owner);
  return new Set(o ? [o.id, ...(o.type === "coterie" ? o.system.members ?? [] : [])] : []);
}
/** Сдвиг Защищённости по фишкам в секторах квартала: у хозяина больше всех — +1, у кого-то из чужих больше — −1, ничья — 0. */
export function domainSway(da, s = strat()) {
  const secs = domainSectors(da, s);
  if (!secs.length) return null;
  const side = ownerSide(da), sum = {};
  for (const x of secs) for (const [k, n] of Object.entries(s.tokens[x.key] ?? {})) if (n > 0) sum[k] = (sum[k] ?? 0) + n;
  const mine = [...side].reduce((n, k) => n + (sum[k] ?? 0), 0);
  const rival = Object.entries(sum).filter(([k]) => !side.has(k)).sort((p, q) => q[1] - p[1])[0];
  const best = rival?.[1] ?? 0;
  return { d: mine > best ? 1 : best > mine ? -1 : 0, mine, best, rival: rival ? owner(rival[0], s).name : "",
    district: domainDistrict(da)?.name ?? "", sectors: secs.map(sectorName) };
}
/** Дата хроники для журнала домена. */
async function chronicleDate() {
  const { getClock } = await import("../apps/calendar.mjs");
  return new Date(getClock()).toLocaleDateString(game.i18n.lang, { day: "numeric", month: "long", year: "numeric" });
}
/** Конец хода: Защищённость доменов по фишкам в их кварталах; запись в журнал домена; строки для отчёта. Экспорт — для автотестов. */
export async function domainSecurity(s) {
  const out = [], date = await chronicleDate();
  for (const da of game.actors.filter(a => a.type === "domain")) {
    const w = domainSway(da, s);
    if (!w?.d) continue;
    const sec = Math.clamp((da.system.security ?? 0) + w.d, 0, 5);
    if (sec === (da.system.security ?? 0)) continue;
    await da.update({ "system.security": sec, "system.events": [...(da.system.events ?? []),
      { key: "strategy", note: S(w.d > 0 ? "DomainHeld" : "DomainLost", { n: s.turn.n, who: w.rival, sec }), date }] });
    out.push(S(w.d > 0 ? "Out.domainUp" : "Out.domainDown", { name: da.name, n: sec }));
  }
  return out;
}
/** Событие домена (DA Companion) — трендом 1-го уровня в секторе его квартала; ставит только ведущий. */
export async function domainEventTrend(da, key, note = "") {
  if (!game.user.isGM) return null;
  const s = strat(), sec = domainSectors(da, s)[0];
  if (!sec) return null;
  const t = { id: uid(), sector: sec.key, level: 1, grow: 1, domain: da.id,
    name: `${game.i18n.localize(`VTM20.Group.Event.${key}.name`)} — ${da.name}${note ? ` (${note})` : ""}` };
  await save({ trends: [...(s.trends ?? []), t] });
  return t;
}
/** Новый тренд ведущего — событием в журналы доменов этого квартала (тренд из события домена обратно не пишется). Экспорт — для автотестов. */
export async function trendToDomains(t, s) {
  const x = s.sectors.find(y => y.key === t.sector);
  if (t.domain || !x?.district) return;
  const date = await chronicleDate();
  for (const da of game.actors.filter(a => a.type === "domain" && domainDistrict(a)?.key === x.district))
    await da.update({ "system.events": [...(da.system.events ?? []), { key: "trend", note: `${t.name} — ${sectorName(x)}`, date }] });
}

/** Заготовка: сферы и сектора (свои или модуля). */
async function loadPreset(id) {
  const p = id === "modern" ? MODERN : EXT.strategy.presets.find(x => x.id === id);
  if (!p) return;
  const s = strat();
  await save({ spheres: foundry.utils.deepClone(p.spheres), sectors: foundry.utils.deepClone(p.sectors), owners: { ...s.owners, ...(p.owners ?? {}) }, tokens: { ...(p.tokens ?? {}), ...s.tokens } });
}
