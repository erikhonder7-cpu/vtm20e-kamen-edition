// module/ui/strategy-turn.mjs
// Стратегия города — проведение хода: заявки, броски, итог по секторам, публикация отчёта, сдвиг часов, договоры, жар Маскарада.
// Вынесено из strategy.mjs.

import { SYSTEM_ID } from "../config.mjs";
import { EXT } from "./city-ext.mjs";
import { ST } from "./strategy-state.mjs";
import { S, esc, uid, unitText, unitLabel, INTENTS, MODERN, sectorName, strat, save, owner, meActor, bidsOf, setBids, allBids, poolOf, rollDice, outcome, resistPools } from "./strategy-rules.mjs";
import { counters } from "./strategy-views.mjs";
import { domainSecurity } from "./strategy-domain.mjs";

/** Заявка игрока: проверить жетоны и записать во флаг актёра. */
export async function saveBid(form) {
  const a = meActor(), s = strat();
  if (!a || !s.turn.open) return;
  const fd = new foundry.applications.ux.FormDataExtended(form).object, id = form.dataset.id;
  const bid = { id: id || uid(), sector: form.dataset.sec, kind: fd.kind, intent: fd.intent, target: INTENTS[fd.intent]?.target ? fd.target ?? "" : "",
    attr: fd.attr, ability: fd.ability, text: String(fd.text ?? "").trim(), helper: fd.helper ?? "", proxy: fd.proxy ?? "", crude: !!fd.crude };
  if (INTENTS[bid.intent].target && !bid.target) return ui.notifications.warn(S("NeedTarget"));
  const left = counters(a, s).find(c => c.k === bid.kind);
  if (!id && (!left || left.left <= 0)) return ui.notifications.warn(S("NoTokens"));
  const bids = bidsOf(a, s), next = id ? bids.map(b => b.id === id ? bid : b) : [...bids, bid];
  ST.editBid = null;
  await setBids(a, next);
}

/** Бросить заявки (и нужное им сопротивление). force — перебросить уже брошенные. */
export async function rollKeys(keys, force) {
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
export async function resolve() {
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
export async function publish() {
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
  ST.hist = null;
  ui.notifications.info(S("Published", { n: s.turn.n }));
  await notify(S("NotifyPublished", { n: s.turn.n, next: s.turn.n + 1 }) + (clock.shiftText ? ` ${S("NotifyShift", { span: clock.shiftText })}` : ""));
}

/** Срок хода в часах хроники: подтвердить, поменять или не сдвигать. */
export async function askShift(shift = { n: 0, unit: "months" }) {
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

export function shiftDate(ms, { n, unit }) {
  const d = new Date(ms);
  if (unit === "years") d.setFullYear(d.getFullYear() + n);
  else if (unit === "months") d.setMonth(d.getMonth() + n);
  else d.setDate(d.getDate() + n);
  return d.getTime();
}

/** Отменить сдвиг часов, сделанный публикацией хода. */
export async function undoClock(n) {
  const s = strat(), r = s.reports.find(x => x.n === n);
  if (!r || r.clockFrom == null) return;
  if (!(await foundry.applications.api.DialogV2.confirm({ window: { title: S("ClockUndo") }, content: `<p>${esc(S("ClockUndoAsk", { span: r.shiftText ?? "" }))}</p>` }))) return;
  const { getClock, setClock } = await import("../apps/calendar.mjs");
  await setClock(getClock() - (r.clockTo - r.clockFrom));
  await save({ reports: s.reports.map(x => x.n === n ? { ...x, clockUndone: true } : x) });
  return notify(S("NotifyShiftUndone", { span: r.shiftText ?? "" }));
}

/** Сообщение в чат для всех: открыт ход, закрыт приём, вышел отчёт. */
export function notify(text) {
  return ChatMessage.create({ speaker: { alias: S("Title") }, content: `<div class="r-notice"><i class="fa-solid fa-chess-knight"></i> ${esc(text)}</div>` });
}

/** Договор: в реестр услуг обоим (если это персонажи), в стратегию — для проверки нарушений. */
export async function addPact(fd) {
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
export async function breakPacts(s, broken) {
  for (const b of broken) {
    const v = game.actors.get(b.who), w = game.actors.get(b.victim);
    if (v?.system.boons) await v.update({ "system.boons": [...v.system.boons, { name: owner(b.victim, s).name, dir: "owe", level: "major", note: S("PactBrokenNote", { n: s.turn.n }), date: "", done: false }] });
    if (w?.system.boons) await w.update({ "system.boons": [...w.system.boons, { name: owner(b.who, s).name, dir: "owed", level: "major", note: S("PactBrokenNote", { n: s.turn.n }), date: "", done: false }] });
  }
}

/** Жар Маскарада от грубых заявок — нарушение на карте в квартале сектора (ui/masquerade.mjs). */
export async function addHeat(list, n) {
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

/** Заготовка: сферы и сектора (свои или модуля). */
export async function loadPreset(id) {
  const p = id === "modern" ? MODERN : EXT.strategy.presets.find(x => x.id === id);
  if (!p) return;
  const s = strat();
  await save({ spheres: foundry.utils.deepClone(p.spheres), sectors: foundry.utils.deepClone(p.sectors), owners: { ...s.owners, ...(p.owners ?? {}) }, tokens: { ...(p.tokens ?? {}), ...s.tokens } });
}
