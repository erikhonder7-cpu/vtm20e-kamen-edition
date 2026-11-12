// module/ui/strategy-rules.mjs
// Стратегия города — правила и данные без отрисовки: жетоны и намерения, владельцы, заявки, пул заявки, исход в секторе,
// заготовка «современный город». Вынесено из strategy.mjs; состояние доски — strategy-state.mjs.

import { SYSTEM_ID } from "../config.mjs";
import { ST } from "./strategy-state.mjs";

export const FLAG = "strategy";

export const S = (k, d) => d ? game.i18n.format(`VTM20.Strategy.${k}`, d) : game.i18n.localize(`VTM20.Strategy.${k}`);

export const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

export const uid = () => foundry.utils.randomID(8);

/** «2 года», «5 лет»: формы единицы срока через «|» (ru — три формы, en — две). */
export function unitText(n, unit) {
  const f = S(`Unit.${unit}`).split("|");
  if (f.length < 3) return `${n} ${n === 1 ? f[0] : f.at(-1)}`;
  const d = n % 10, h = n % 100;
  return `${n} ${d === 1 && h !== 11 ? f[0] : d >= 2 && d <= 4 && (h < 12 || h > 14) ? f[1] : f[2]}`;
}

export const unitLabel = unit => S(`Unit.${unit}`).split("|").at(-1);

export const MAX = 7, HEX = 56;

/** Жетоны хода: сколько у персонажа (null — без предела). */
export const KINDS = {
  attention: { icon: "fa-chess-pawn", count: () => 3 },
  influence: { icon: "fa-landmark", count: a => Math.floor(bg(a, /^(Влияние|Influence)$/i) / 2) },
  retainer: { icon: "fa-user-secret", count: a => bg(a, /^(Подручные|Retainers)$/i) },
  boon: { icon: "fa-handshake", count: () => 2 },
  // Гару и их Родня: родичи-люди в городе — жетон за каждые 2 точки Факта «Родня» (W20)
  kinfolk: { icon: "fa-people-group", count: a => Math.floor(bg(a, /^(Родня|Kinfolk)$/i) / 2) }
};

/** Что делаем в гексе: сложность и против кого. */
export const INTENTS = {
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
export const PERKS = ["herd", "resources", "influence", "allies", "contacts", "retainers", "fame", "status", "domain", "mentor", "hunt", "caern", "node"];

export const perkName = k => k === "hunt" ? S("PerkHunt") : k === "caern" ? S("PerkCaern") : k === "node" ? S("PerkNode") : game.i18n.localize(`VTM20.Downtime.Bg.${k}`);

/** Проекты персонажа (флаг актёра): [{ id, sector, name }]; ход и цель — у ведущего (s.progress, s.projNeed). */
export const PROJ = "strategyProj";

export const projectsOf = a => a?.getFlag?.(SYSTEM_ID, PROJ) ?? [];

export const allProjects = () => game.actors.contents.flatMap(a => projectsOf(a).map(p => ({ ...p, actor: a })));

export const needOf = (s, id) => s.projNeed?.[id] ?? 10;

export const bg = (a, re) => a?.items.filter(i => i.type === "background" && re.test(i.name)).reduce((n, i) => n + (i.system.value ?? 0), 0) ?? 0;

export const SPHERES = [
  { key: "power", color: "#8a2b2b" }, { key: "order", color: "#2e4a7d" }, { key: "money", color: "#a8862e" },
  { key: "faith", color: "#6b4f8a" }, { key: "street", color: "#4c5846" }, { key: "culture", color: "#2f6f6a" }
];

export const MODERN = {
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

export const sphereName = s => s.name || S(`Sphere.${s.key}`);

export const sectorName = s => s.name || S(`Sector.${s.key}`);

export const blank = () => ({ spheres: [], sectors: [], tokens: {}, owners: {}, known: {}, reveal: {}, mods: {}, rolls: {}, npc: [], trends: [], pacts: [],
  progress: {}, projNeed: {}, turn: { n: 1, label: "", open: true, shift: { n: 0, unit: "months" } }, draft: null, reports: [] });

export const DEFAULT_BID = { id: "", kind: "attention", intent: "grow", target: "", attr: "manipulation", ability: "subterfuge", text: "", helper: "", proxy: "", crude: false };

export function strat() {
  const s = game.settings.get(SYSTEM_ID, "strategy") ?? {};
  return { ...blank(), ...foundry.utils.deepClone(s) };
}

export async function save(patch) {
  if (!game.user.isGM) return;
  await game.settings.set(SYSTEM_ID, "strategy", { ...strat(), ...patch });
}

/** Чей жетон: актёр (id) или фракция ведущего («f:…»). */
export function owner(k, s = strat()) {
  if (k?.startsWith("f:")) { const f = s.owners[k] ?? {}; return { key: k, name: f.name || "?", color: f.color || "#777", img: f.img || "" }; }
  const a = game.actors.get(k);
  const user = a && game.users.find(u => !u.isGM && a.testUserPermission(u, "OWNER"));
  return { key: k, name: a?.name ?? "?", img: a?.img ?? "", color: user?.color?.css ?? user?.color ?? hue(k), actor: a };
}

export const hue = k => `hsl(${[...String(k)].reduce((n, c) => n * 31 + c.charCodeAt(0) >>> 0, 7) % 360} 45% 45%)`;

/** Мои персонажи (игрок) — те, чьи заявки он пишет. Ведущий видит всех. */
export const mine = () => game.actors.filter(a => a.isOwner && a.hasPlayerOwner && ["vampire", "ghoul", "mortal", "hunter", "werewolf", "demon", "mage", "wraith"].includes(a.type));

export const meActor = () => { const list = mine(); if (!list.some(a => a.id === ST.me)) ST.me = (game.user.character && list.includes(game.user.character) ? game.user.character : list[0])?.id ?? null; return game.actors.get(ST.me) ?? null; };

/** Заявки персонажа на текущий ход. */
export function bidsOf(a, s = strat()) {
  const f = a?.getFlag(SYSTEM_ID, FLAG);
  return f?.turn === s.turn.n ? (f.bids ?? []) : [];
}

export const doneOf = (a, s = strat()) => { const f = a?.getFlag(SYSTEM_ID, FLAG); return f?.turn === s.turn.n && !!f.done; };

export async function setBids(a, bids, done = doneOf(a)) {
  await a.setFlag(SYSTEM_ID, FLAG, { turn: strat().turn.n, bids, done });
}

/** Все заявки хода: [{ actor, bid, key }]. Ходы NPC и фракций (s.npc) — с готовым пулом, «актёр» у них — владелец влияния. */
export function allBids(s = strat()) {
  const npc = (s.npc ?? []).map(b => ({ actor: { id: b.owner, name: owner(b.owner, s).name, npc: true }, bid: b, key: `npc.${b.id}` }));
  return [...game.actors.contents.flatMap(a => bidsOf(a, s).map(b => ({ actor: a, bid: b, key: `${a.id}.${b.id}` }))), ...npc];
}

/** Видит ли пользователь фишки владельца в секторе. */
export function sees(sec, ownerKey, s = strat()) {
  if (game.user.isGM || s.reveal[sec]) return true;
  const mineIds = mine().map(a => a.id);
  if (mineIds.includes(ownerKey)) return true;
  return mineIds.some(id => s.known[id]?.[sec]);
}

export const visibleSectors = s => s.sectors.filter(x => game.user.isGM || !x.hidden);

export function poolOf(a, bid, s = strat(), mods = s.mods[bid.npc ? `npc.${bid.id}` : `${a.id}.${bid.id}`] ?? {}) {
  const at = bid.npc ? bid.dice ?? 0 : a.system.attributes?.[bid.attr]?.total ?? a.system.attributes?.[bid.attr]?.value ?? 0;
  const ab = bid.npc ? 0 : a.system.abilities?.[bid.ability]?.value ?? 0;
  const own = s.tokens[bid.sector]?.[a.id] ?? 0;
  const dice = Math.max(0, at + ab + own + (bid.crude ? 1 : 0) + (mods.dice ?? 0));
  const storm = (s.trends ?? []).some(t => t.sector === bid.sector && t.level >= 3) ? 1 : 0;
  const diff = Math.clamp(6 + (INTENTS[bid.intent]?.diff ?? 0) + (bid.proxy ? 1 : 0) + storm - (mods.disc ?? 0) + (mods.diff ?? 0), 3, 10);
  return { dice, diff, at, ab, own, storm };
}

export async function rollDice(n, diff) {
  if (n <= 0) return { faces: [], succ: 0, botch: false };
  const r = await new Roll(`${n}d10`).evaluate();
  const faces = r.dice[0].results.map(x => x.result);
  const hits = faces.filter(f => f >= diff).length, ones = faces.filter(f => f === 1).length;
  return { faces, succ: Math.max(0, hits - ones), botch: hits === 0 && ones > 0 };
}

export const gain = n => n >= 5 ? 2 : n >= 3 ? 1 : 0;

/**
 * Итог хода по сектору из бросков (s.rolls): прибавки и потери фишек, разведка, беды подручных, долги.
 * Сопротивление — один рефлекторный бросок на соперника: его фишки + успехи его «Защиты» в этом гексе.
 */
export function outcome(sec, s, bids) {
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
export function resistPools(s, bids) {
  const out = {};
  for (const x of bids) {
    if (INTENTS[x.bid.intent]?.target !== "owner" || !x.bid.target) continue;
    const sec = x.bid.sector, t = x.bid.target;
    const def = bids.filter(y => y.bid.sector === sec && y.actor.id === t && y.bid.intent === "defend").reduce((n, y) => n + (s.rolls[y.key]?.succ ?? 0), 0);
    out[`resist.${sec}.${t}.${x.actor.id}`] = (s.tokens[sec]?.[t] ?? 0) + def;
  }
  return out;
}

export const faces = (r, diff) => r.faces.map(f => `<i class="${f >= diff ? "is-hit" : f === 1 ? "is-one" : ""}">${f}</i>`).join("");

/**
 * Конвенции Технократии (M20): пять фракций доски. Стартовое влияние — правило системы: по смыслу Конвенции,
 * 2 фишки в секторе заготовки «современный город» (если такой сектор есть на доске).
 */
export const CONVENTIONS = [
  { key: "new-world-order", color: "#3d5f8f", sectors: ["media", "telecom"] },
  { key: "syndicate", color: "#a2802e", sectors: ["finance", "highsociety"] },
  { key: "iteration-x", color: "#7a7f88", sectors: ["industry"] },
  { key: "progenitors", color: "#3f8a6a", sectors: ["health"] },
  { key: "void-engineers", color: "#5a4a9a", sectors: ["university"] }
];

/**
 * Мир мёртвых (Wraith 20, гл. 1): четыре фракции Стигии на доске. Стартовое влияние — правило системы: по смыслу фракции,
 * 2 фишки в секторах заготовки «современный город» — Иерархия в судах и совете, Отступники среди преступников и профсоюзов,
 * Еретики в церкви, Перевозчики в порту и диких землях.
 */
export const DEAD_FACTIONS = [
  { key: "hierarchy", color: "#6a7280", sectors: ["courts", "council"] },
  { key: "renegade", color: "#8a3a3a", sectors: ["crime", "unions"] },
  { key: "heretic", color: "#a08a4a", sectors: ["church"] },
  { key: "ferryman", color: "#3a5a6a", sectors: ["port", "wilds"] }
];
