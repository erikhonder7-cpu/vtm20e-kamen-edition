// module/ui/strategy-views.mjs
// Стратегия города — панели доски: шапка, сота гексов, сектор, обзор, формы заявок, «Мой ход», стол ведущего, отчёты, устройство.
// Вынесено из strategy.mjs; состояние доски — strategy-state.mjs.

import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { EXT } from "./city-ext.mjs";
import { odds } from "../dice/roll.mjs";
import { ST } from "./strategy-state.mjs";
import { S, HEX, esc, unitLabel, MAX, KINDS, INTENTS, PERKS, perkName, projectsOf, allProjects, needOf, sphereName, sectorName, DEFAULT_BID, owner, mine, meActor, bidsOf, doneOf, allBids, sees, visibleSectors, poolOf, outcome, resistPools, faces } from "./strategy-rules.mjs";
import { viewOf } from "./strategy.mjs";

/** Шапка: ход, вкладки, выбор персонажа игрока. */
export function head(s) {
  const gm = game.user.isGM, a = meActor();
  const tabs = [["map", "fa-hexagon-nodes"], ["turn", gm ? "fa-dice-d10" : "fa-feather-pointed"], ["reports", "fa-scroll"], ...(gm ? [["setup", "fa-gear"]] : [])];
  const who = !gm && mine().length > 1 ? `<select class="rs-me" data-rs-me>${mine().map(x => `<option value="${x.id}" ${x.id === a?.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : "";
  return `<header class="rs-head">
    <div class="rs-title"><i class="fa-solid fa-chess-knight"></i><b>${esc(S("Title"))}</b>
      <span class="rs-turn">${esc(S("TurnN", { n: s.turn.n }))}${s.turn.label ? ` · ${esc(s.turn.label)}` : ""}${s.turn.open ? "" : ` · <em>${esc(S("Closed"))}</em>`}</span></div>
    <nav class="rs-tabs">${tabs.map(([k, i]) => `<a class="${ST.view === k ? "on" : ""}" data-rs="view" data-v="${k}"><i class="fa-solid ${i}"></i> ${esc(S(`View.${k}${k === "turn" && gm ? "Gm" : ""}`))}</a>`).join("")}</nav>
    ${who}<a class="rs-help" data-rs="guide" data-tooltip="${esc(S("Guide"))}"><i class="fa-solid fa-circle-question"></i></a></header>`;
}

export function emptyView(s) {
  if (!game.user.isGM) return `<p class="rs-note">${esc(S("EmptyPlayer"))}</p>`;
  const presets = [{ id: "modern", name: S("PresetModern") }, ...EXT.strategy.presets.map(p => ({ id: p.id, name: p.name }))];
  return `<div class="rs-empty"><p>${esc(S("EmptyGm"))}</p>
    <div class="rs-row">${presets.map(p => `<a class="r-btn" data-rs="preset" data-id="${p.id}"><i class="fa-solid fa-hexagon-nodes"></i> ${esc(p.name)}</a>`).join("")}</div></div>`;
}

export function hexes(s) {
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
    toks.sort((p, q) => q[1] - p[1]);
    const pips = toks.flatMap(([k, n]) => Array(n).fill(owner(k, s).color));
    // кто держит гекс: единственный лидер среди видимых печатей — его цвет на ободе и медальон над названием; поровну — спорный
    const most = toks[0]?.[1] ?? 0, lead = toks.filter(([, n]) => n === most);
    const holder = most > 0 && lead.length === 1 ? owner(lead[0][0], s) : null, contested = most > 0 && lead.length > 1;
    const my = (c.y - 36).toFixed(1), mx = c.x.toFixed(1);
    const crest = holder ? `<g class="rs-crest"><title>${esc(S("HeldBy", { name: holder.name, n: most }))}</title><circle cx="${mx}" cy="${my}" r="10.5"/>${holder.img
        ? `<clipPath id="rsc-${x.key}"><circle cx="${mx}" cy="${my}" r="8.6"/></clipPath><image href="${esc(holder.img)}" x="${(c.x - 8.6).toFixed(1)}" y="${(c.y - 44.6).toFixed(1)}" width="17.2" height="17.2" clip-path="url(#rsc-${x.key})" preserveAspectRatio="xMidYMid slice"/>`
        : `<text x="${mx}" y="${(c.y - 32.2).toFixed(1)}">${esc(holder.name.slice(0, 1))}</text>`}</g>`
      : contested ? `<g class="rs-crest is-contest"><title>${esc(S("Contested"))}</title><circle cx="${mx}" cy="${my}" r="9"/><text class="rs-fa" x="${mx}" y="${(c.y - 32.6).toFixed(1)}">\uf71d</text></g>` : "";
    // сургучные печати в ряд под названием: цвет владельца, тёмный ободок, блик
    const seals = pips.slice(0, MAX).map((col, j) => { const cx = c.x + (j - (Math.min(pips.length, MAX) - 1) / 2) * 12, cy = c.y + 20;
      return `<g class="rs-seal" style="--o:${col}"><circle cx="${cx.toFixed(1)}" cy="${cy}" r="5.4"/><circle class="rs-seal-in" cx="${cx.toFixed(1)}" cy="${cy}" r="2.7"/></g>`; }).join("");
    const nb = myBids.filter(b => b.sector === x.key).length;
    // подпись в пластину: строки не длиннее 12 знаков, до трёх строк, по центру над печатями
    const label = (c, t) => {
      const lines = [];
      for (const w of t.split(" ")) { const last = lines.at(-1); if (last && (last + " " + w).length <= 12) lines[lines.length - 1] = `${last} ${w}`; else lines.push(w); }
      // с медальоном подпись опускается ниже — между ним и печатями
      const ls = lines.slice(0, 3), top = most > 0 ? c.y + 2 - (ls.length - 1) * 5.75 : c.y - 4 - (ls.length - 1) * 11.5;
      return `<text class="rs-name" x="${c.x.toFixed(1)}" y="${top.toFixed(1)}">${ls.map((l, k) => `<tspan x="${c.x.toFixed(1)}" dy="${k ? 11.5 : 0}">${esc(l)}</tspan>`).join("")}</text>`;
    };
    return `<g class="rs-hex ${ST.sel === x.key ? "is-sel" : ""} ${x.hidden ? "is-hidden" : ""} ${ST.focus && x.sphere !== ST.focus ? "is-dim" : ""} ${holder ? "is-held" : ""}" ${holder ? `style="--o:${holder.color}"` : ""} data-rs="sector" data-key="${x.key}">
      <polygon class="rs-plate" points="${ring(c, HEX - 2)}" style="--h:${color}"/><polygon class="rs-inlay" points="${ring(c, HEX - 7)}" style="--h:${color}"/>
      ${label(c, sectorName(x))}${seals}${crest}
      ${hiddenToks ? `<g class="rs-fog"><circle cx="${c.x.toFixed(1)}" cy="${(c.y + 36).toFixed(1)}" r="6.5"/><text x="${c.x.toFixed(1)}" y="${(c.y + 39.2).toFixed(1)}">?</text></g>` : ""}
      ${(() => { const tr = (s.trends ?? []).filter(t => t.sector === x.key); const lv = Math.max(0, ...tr.map(t => t.level));
        const tx = c.x - 31, ty = c.y - 24;
        return tr.length ? `<g class="rs-trendmark ${lv >= 3 ? "is-storm" : ""}"><title>${esc(tr.map(t => `${t.name} · ${t.level}`).join("; "))}</title><rect x="${(tx - 12).toFixed(1)}" y="${(ty - 7.5).toFixed(1)}" width="24" height="15" rx="7.5"/>
          <text class="rs-fa" x="${(tx - 5).toFixed(1)}" y="${(ty + 3.4).toFixed(1)}">\uf06d</text><text x="${(tx + 5.5).toFixed(1)}" y="${(ty + 3.6).toFixed(1)}">${lv}</text></g>` : ""; })()}
      ${nb ? `<g class="rs-bidmark"><title>${esc(S("KeyBids"))}: ${nb}</title><rect x="${(c.x + 19).toFixed(1)}" y="${(c.y - 31.5).toFixed(1)}" width="24" height="15" rx="7.5"/>
        <text class="rs-fa" x="${(c.x + 26).toFixed(1)}" y="${(c.y - 20.6).toFixed(1)}">\uf56b</text><text x="${(c.x + 36.5).toFixed(1)}" y="${(c.y - 20.4).toFixed(1)}">${nb}</text></g>` : ""}</g>`;
  }).join("");
  // рамка всех гексов; если сота поменялась (гекс добавили или сдвинули) — масштаб и центр с нуля
  const nb = { minX, minY, w, h };
  if (!ST.base || ["minX", "minY", "w", "h"].some(k => Math.abs(ST.base[k] - nb[k]) > 0.5)) ST.zoom = { k: 1, cx: null, cy: null };
  ST.base = nb;
  const v = viewOf();
  // легенда сфер — на поле; щелчок подсвечивает гексы сферы
  const legend = s.spheres.map(x => `<a class="${ST.focus === x.key ? "on" : ""}" data-rs="focus" data-key="${x.key}" style="--h:${x.color}"><i></i>${esc(sphereName(x))}
    <small>${list.filter(y => y.sphere === x.key).length}</small></a>`).join("");
  const tools = `<div class="rs-zoom" data-tooltip="${esc(S("ZoomHint"))}" data-tooltip-direction="LEFT">
    <a data-rs="zoom" data-d="in" data-tooltip="${esc(S("ZoomIn"))}"><i class="fa-solid fa-plus"></i></a>
    <b data-rs-zoomval>${Math.round(ST.zoom.k * 100)}%</b>
    <a data-rs="zoom" data-d="out" data-tooltip="${esc(S("ZoomOut"))}"><i class="fa-solid fa-minus"></i></a>
    <a data-rs="zoom" data-d="fit" data-tooltip="${esc(S("ZoomFit"))}"><i class="fa-solid fa-expand"></i></a></div>`;
  return `<div class="rs-map ${ST.focus ? "has-focus" : ""}">
    <svg viewBox="${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}" preserveAspectRatio="xMidYMid meet">${cells}</svg>
    ${tools}<div class="rs-keys"><span><i class="rs-key-crest"></i>${esc(S("KeyHeld"))}</span><span><i class="fa-solid fa-fire"></i>${esc(S("KeyTrend"))}</span><span><i class="fa-solid fa-feather-pointed"></i>${esc(S("KeyBids"))}</span>${game.user.isGM ? "" : `<span><i class="fa-solid fa-question"></i>${esc(S("KeyFog"))}</span>`}</div>
    <div class="rs-legend">${legend}</div></div>`;
}

export function sectorView(s) {
  const x = s.sectors.find(y => y.key === ST.sel);
  if (!x) return overviewView(s);
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
    <a class="rs-back" data-rs="overview"><i class="fa-solid fa-arrow-left"></i> ${esc(S("OvBack"))}</a>
    <h3 style="--h:${sph?.color ?? "#555"}"><i></i>${esc(sectorName(x))}${gm ? ` <a class="rs-eye ${s.reveal[x.key] ? "is-open" : ""}" data-rs="reveal" data-tooltip="${esc(S(s.reveal[x.key] ? "RevealOff" : "RevealOn"))}"><i class="fa-solid ${s.reveal[x.key] ? "fa-eye" : "fa-eye-slash"}"></i></a>` : ""}</h3>
    <p class="rs-sph">${esc(sph ? sphereName(sph) : "")}${district ? ` · <a data-rs="fly" data-key="${x.district}"><i class="fa-solid fa-map-location-dot"></i> ${esc(district.name)}</a>` : ""}</p>
    ${x.about ? `<p class="rs-about">${esc(x.about)}</p>` : ""}
    ${x.perk ? `<p class="rs-perk"><i class="fa-solid fa-gift"></i> ${esc(S(x.perk === "hunt" ? "PerkHuntLine" : x.perk === "caern" ? "PerkCaernLine" : x.perk === "node" ? "PerkNodeLine" : "PerkLineSector", { name: perkName(x.perk) }))}</p>` : ""}
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

/**
 * Обзор города, пока гекс не выбран: по каждой сфере — сколько гексов, сколько видимых печатей и кто впереди
 * (только то, что этот пользователь видит); тренды всего города по силе; у игрока — его жетоны.
 */
export function overviewView(s) {
  const list = visibleSectors(s);
  const spheres = s.spheres.map(sp => {
    const secs = list.filter(x => x.sphere === sp.key), by = {};
    for (const x of secs) for (const [k, n] of Object.entries(s.tokens[x.key] ?? {})) if (n > 0 && sees(x.key, k, s)) by[k] = (by[k] ?? 0) + n;
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]), total = top.reduce((n, [, v]) => n + v, 0);
    const lead = top[0] && (!top[1] || top[0][1] > top[1][1]) ? owner(top[0][0], s) : null;
    return `<li style="--h:${sp.color}" class="${ST.focus === sp.key ? "on" : ""}"><a data-rs="focus" data-key="${sp.key}"><i></i><span>${esc(sphereName(sp))}</span></a>
      <small>${esc(S("OvSectors", { n: secs.length }))}</small>
      <em>${total ? `${lead ? `<b style="--c:${lead.color}">${esc(lead.name)}</b>` : esc(S("OvTie"))} · ${esc(S("OvSeals", { n: total }))}` : esc(S("OvNobody"))}</em></li>`;
  }).join("");
  const trends = (s.trends ?? []).filter(t => list.some(x => x.key === t.sector)).sort((a, b) => b.level - a.level).slice(0, 8)
    .map(t => `<li class="rs-trendrow ${t.level >= 3 ? "is-storm" : ""}"><i class="fa-solid fa-fire"></i><a data-rs="sector" data-key="${t.sector}">${esc(t.name)}
      <small>${esc(sectorName(s.sectors.find(x => x.key === t.sector) ?? {}))}</small></a><b class="rs-lvl">${"▲".repeat(t.level)}<small>${"△".repeat(Math.max(0, 5 - t.level))}</small></b></li>`).join("");
  return `<section class="rs-overview">
    <h3><i class="fa-solid fa-chess-board"></i>${esc(S("OvTitle"))}</h3>
    <p class="rs-sph">${esc(S("OvLead", { n: list.length }))}</p>
    <h4>${esc(S("OvSpheres"))}</h4><ul class="rs-ovsph">${spheres}</ul>
    ${trends ? `<h4>${esc(S("Trends"))}</h4><ul class="rs-trends">${trends}</ul>` : ""}
    ${myCounters(s) ? `<h4>${esc(S("OvTokens"))}</h4>${myCounters(s)}` : ""}
    <p class="rs-note"><i class="fa-solid fa-hand-pointer"></i> ${esc(S("PickSector"))}</p>
  </section>`;
}

/** Тренды гекса: процессы, которые сами растут, пока их не обуздают. */
export function trendsBlock(s, x, gm) {
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
export function projectsBlock(s, x, gm) {
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
export function pactsBlock(s, x, gm) {
  const ids = gm ? null : mine().map(a => a.id);
  const list = (s.pacts ?? []).filter(p => (p.scope === "*" || p.scope === x.key) && (gm || ids.includes(p.a) || ids.includes(p.b)));
  if (!list.length) return "";
  return `<h4>${esc(S("Pacts"))}</h4><ul class="rs-pacts">${list.map(p => `<li><i class="fa-solid fa-handshake-simple"></i> ${esc(owner(p.a, s).name)} — ${esc(owner(p.b, s).name)}:
    ${esc(S(`PactKind.${p.kind}`))}${p.scope === "*" ? ` · ${esc(S("PactWholeCity"))}` : ""}${p.note ? ` <small>${esc(p.note)}</small>` : ""}</li>`).join("")}</ul>`;
}

export function ownerOptions(s) {
  // владельцы фишек: персонажи всех линеек (призраки тоже) и группы — котерия, стая, кабал, Круг
  const acts = game.actors.filter(a => ["vampire", "ghoul", "mortal", "hunter", "werewolf", "mage", "demon", "wraith", "changeling", "creature", "spirit", "coterie"].includes(a.type)).sort((p, q) => p.name.localeCompare(q.name, "ru"));
  return [...Object.keys(s.owners).map(k => owner(k, s)), ...acts.map(a => owner(a.id, s))];
}

/** Строка заявки: жетон, намерение, цель, пул, текст. */
export function bidRow(a, b, s, gm) {
  const sec = s.sectors.find(x => x.key === b.sector), p = poolOf(a, b, s);
  const pool = b.npc ? `${esc(S("NpcPool"))} ${b.dice}${p.own ? ` + ${p.own}` : ""} = ${p.dice} · ${esc(S("DiffShort"))} ${p.diff}`
    : `${esc(a.traitLabel?.(`attributes.${b.attr}`) ?? b.attr)} + ${esc(a.traitLabel?.(`abilities.${b.ability}`) ?? b.ability)}${p.own ? ` + ${p.own}` : ""} = ${p.dice} · ${esc(S("DiffShort"))} ${p.diff}`;
  const edit = !gm && s.turn.open && a.isOwner;
  return `<li class="rs-bid">
    <span class="rs-bidk" data-tooltip="${esc(S(`Kind.${b.kind}`))}"><i class="fa-solid ${KINDS[b.kind]?.icon}"></i></span>
    <div><b>${gm ? `${esc(a.name)} → ` : ""}${esc(S(`Intent.${b.intent}`))}${b.target ? ` · ${esc(targetName(b, s))}` : ""}${sec && ST.view !== "map" ? ` · ${esc(sectorName(sec))}` : ""}</b>
      ${b.proxy ? `<em class="rs-tag" data-tooltip="${esc(S("ProxyHint"))}"><i class="fa-solid fa-masks-theater"></i> ${esc(owner(b.proxy, s).name)}</em>` : ""}${b.crude ? `<em class="rs-tag is-crude" data-tooltip="${esc(S("CrudeHint"))}"><i class="fa-solid fa-hand-fist"></i> ${esc(S("Crude"))}</em>` : ""}
      <small>${pool}${b.helper ? ` · ${esc(S("Helper"))}: ${esc(b.helper)}` : ""}</small>${b.text ? `<p>${esc(b.text)}</p>` : ""}</div>
    ${edit ? `<a data-rs="bidEdit" data-id="${b.id}"><i class="fa-solid fa-pen"></i></a><a data-rs="bidDel" data-id="${b.id}"><i class="fa-solid fa-xmark"></i></a>` : ""}
    ${gm && b.npc && !s.draft ? `<a data-rs="npcDel" data-id="${b.id}" data-tooltip="${esc(S("Delete"))}"><i class="fa-solid fa-xmark"></i></a>` : ""}</li>`;
}

/** Имя цели заявки: соперник, тренд или проект. */
export function targetName(b, s) {
  const k = INTENTS[b.intent]?.target;
  if (k === "trend") return (s.trends ?? []).find(t => t.id === b.target)?.name ?? "?";
  if (k === "project") return allProjects().find(p => p.id === b.target)?.name ?? "?";
  return owner(b.target, s).name;
}

/** Сколько жетонов осталось у персонажа. */
export function counters(a, s) {
  const bids = bidsOf(a, s);
  return Object.entries(KINDS).map(([k, d]) => { const max = d.count(a), used = bids.filter(b => b.kind === k).length; return { k, max, used, left: max - used, icon: d.icon }; });
}

export function myCounters(s) {
  const a = meActor();
  if (game.user.isGM || !a) return "";
  const drag = s.turn.open;
  return `<div class="rs-counters">${counters(a, s).filter(c => c.max).map(c => `<span class="${drag && c.left > 0 ? "is-drag" : ""}" ${drag && c.left > 0 ? `draggable="true" data-rs-drag="${c.k}"` : ""}
    data-tooltip="${esc(S(`KindHint.${c.k}`))}${drag && c.left > 0 ? ` ${esc(S("DragHint"))}` : ""}"><i class="fa-solid ${c.icon}"></i> ${esc(S(`Kind.${c.k}`))} <b>${c.left}/${c.max}</b></span>`).join("")}</div>`;
}

/** Выбор цели: соперник в гексе, тренд в гексе или свой проект в гексе. */
export function targetSelect(a, s, sec, b, others, opt) {
  const k = INTENTS[b.intent]?.target;
  if (!k) return "";
  const list = k === "trend" ? (s.trends ?? []).filter(t => t.sector === sec).map(t => [t.id, t.name])
    : k === "project" ? projectsOf(a).filter(p => p.sector === sec && (s.progress?.[p.id] ?? 0) < needOf(s, p.id)).map(p => [p.id, p.name])
    : others.map(x => [x.key, x.name]);
  return `<label>${esc(S("Target"))}<select name="target">${list.length ? opt(list, b.target) : `<option value="">${esc(S(k === "trend" ? "NoTrends" : k === "project" ? "NoProjects" : "NoTargets"))}</option>`}</select></label>`;
}

/** Форма заявки игрока: жетон, намерение, цель, пул с шансами, текст. */
export function bidForm(a, s, sec) {
  const b = ST.editBid?.sector === sec ? { ...DEFAULT_BID, ...ST.editBid } : DEFAULT_BID;
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

export function turnView(s) {
  const a = meActor();
  if (!a) return `<p class="rs-note">${esc(S("NoActor"))}</p>`;
  const bids = bidsOf(a, s), done = doneOf(a, s);
  return `<section class="rs-turnv"><h3>${esc(S("MyTurn", { name: a.name }))}</h3>${myCounters(s)}
    <p class="rs-note">${esc(S(s.turn.open ? "TurnHint" : "TurnClosedHint"))}</p>
    <ul class="rs-bids">${bids.map(b => bidRow(a, b, s, false)).join("") || `<li class="rs-note">${esc(S("NoBids"))}</li>`}</ul>
    ${s.turn.open ? `<a class="r-btn ${done ? "" : "is-accent"}" data-rs="done"><i class="fa-solid ${done ? "fa-rotate-left" : "fa-flag-checkered"}"></i> ${esc(S(done ? "Undone" : "Done"))}</a>` : ""}
  </section>`;
}

export function deskView(s) {
  const bids = allBids(s), secs = [...new Set(bids.map(x => x.bid.sector))];
  const players = game.actors.filter(a => bidsOf(a, s).length || doneOf(a, s));
  const rolled = bids.length && bids.every(x => s.rolls[x.key]);
  if (s.draft) return draftView(s);
  const resist = resistPools(s, bids);
  const sec = secs.map(k => {
    const x = s.sectors.find(y => y.key === k), here = bids.filter(y => y.bid.sector === k);
    const out = here.every(y => s.rolls[y.key]) ? outcome(k, s, bids) : null;
    const rows = here.map(y => { const p = poolOf(y.actor, y.bid, s), m = s.mods[y.key] ?? {}, r = s.rolls[y.key];
      return `<li class="rs-dbid ${r ? "is-rolled" : ""} ${r?.botch ? "is-botch" : ""}"><div class="rs-dbid-main">${bidRow(y.actor, y.bid, s, true).replace(/^<li class="rs-bid">|<\/li>$/g, "")}</div>
        <div class="rs-mods" data-key="${y.key}">
          <label data-tooltip="${esc(S("ModDiceHint"))}"><span>${esc(S("ModDice"))}</span><input type="number" data-mod="dice" value="${m.dice ?? 0}"></label>
          <label data-tooltip="${esc(S("ModDiscHint"))}"><span><i class="fa-solid fa-droplet"></i> ${esc(S("ModDisc"))}</span><input type="number" min="0" max="3" data-mod="disc" value="${m.disc ?? 0}"></label>
          <label data-tooltip="${esc(S("ModDiffHint"))}"><span>${esc(S("ModDiff"))}</span><input type="number" data-mod="diff" value="${m.diff ?? 0}"></label>
          <span class="rs-res">${r ? `${faces(r, p.diff)} → <b>${r.succ}</b>${r.botch ? ` <em>${esc(S("Botch"))}</em>` : ""}` : `<b>${p.dice}</b>d10 · ${esc(S("DiffShort"))} <b>${p.diff}</b>`}</span>
          <a class="rs-rollbtn" data-rs="roll" data-key="${y.key}" data-tooltip="${esc(S(r ? "Reroll" : "Roll"))}"><i class="fa-solid ${r ? "fa-rotate" : "fa-dice-d10"}"></i></a></div></li>`; }).join("");
    const rs = Object.entries(resist).filter(([rk]) => rk.split(".")[1] === k)
      .map(([rk, n]) => { const r = s.rolls[rk], [, , t, at] = rk.split(".");
        return `<li class="rs-resist"><i class="fa-solid fa-shield-halved"></i> ${esc(S("Resist", { who: owner(t, s).name, vs: owner(at, s).name }))} · ${n}d10 / 6 ${r ? `→ <b>${r.succ}</b>` : ""}</li>`; }).join("");
    const col = s.spheres.find(y => y.key === x?.sphere)?.color ?? "#555";
    return `<section class="rs-dsec"><h4><span><i class="rs-dsec-gem" style="--h:${col}"></i>${esc(x ? sectorName(x) : k)}</span><small>${here.length}</small></h4><ul class="rs-bids">${rows}${rs}</ul>
      ${out ? `<ul class="rs-out">${out.lines.map(l => `<li>${esc(l.t)}</li>`).join("")}${out.trouble.map(t => `<li class="is-warn">${esc(S("Trouble", { who: t.actor.name }))}</li>`).join("")}</ul>` : ""}</section>`;
  }).join("");
  return `<section class="rs-desk">
    <div class="rs-turncard">
      <div class="rs-turncard-top"><b>${esc(S("TurnN", { n: s.turn.n }))}</b><span class="rs-state ${s.turn.open ? "is-open" : ""}"><i class="fa-solid ${s.turn.open ? "fa-envelope-open-text" : "fa-lock"}"></i> ${esc(S(s.turn.open ? "StateOpen" : "Closed"))}</span>
        <a class="r-btn" data-rs="open">${esc(S(s.turn.open ? "CloseBids" : "OpenBids"))}</a></div>
      <div class="rs-turncard-grid">
        <label class="rs-lbl">${esc(S("TurnLabel"))}<input type="text" data-rs-label value="${esc(s.turn.label)}" placeholder="${esc(S("TurnLabelHint"))}"></label>
        <div class="rs-lbl" data-tooltip="${esc(S("ShiftHint"))}">${esc(S("Shift"))}<span class="rs-inline">
          <input type="number" min="0" max="999" data-rs-shift="n" value="${s.turn.shift?.n ?? 0}">
          <select data-rs-shift="unit">${["days", "months", "years"].map(u => `<option value="${u}" ${(s.turn.shift?.unit ?? "months") === u ? "selected" : ""}>${esc(unitLabel(u))}</option>`).join("")}</select></span></div>
      </div>
      <div class="rs-readies">${players.length ? players.map(a => `<span class="rs-ready ${doneOf(a, s) ? "is-done" : ""}" data-tooltip="${esc(S(doneOf(a, s) ? "ReadyDone" : "ReadyWait"))}"><i class="fa-solid ${doneOf(a, s) ? "fa-check" : "fa-hourglass-half"}"></i> ${esc(a.name)} <b>${bidsOf(a, s).length}</b></span>`).join("") : `<span class="rs-note">${esc(S("NoPlayersYet"))}</span>`}</div>
    </div>
    ${secs.length ? sec : `<p class="rs-note">${esc(S("NoBidsAll"))}</p>`}
    ${npcForm(s)}${pactForm(s)}
    <div class="rs-row rs-actions">${bids.length ? `<a class="r-btn" data-rs="rollAll"><i class="fa-solid fa-dice"></i> ${esc(S("RollAll"))}</a>` : ""}
      <a class="r-btn ${rolled ? "is-accent" : ""}" data-rs="resolve"><i class="fa-solid fa-gavel"></i> ${esc(S("Resolve"))}</a></div>
  </section>`;
}

/** Ход NPC или фракции: владелец, гекс, что делает, против кого, готовый пул. */
export function npcForm(s) {
  const opt = (list, cur = "") => list.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`).join("");
  const owners = ownerOptions(s).filter(o => !o.actor?.hasPlayerOwner).map(o => [o.key, o.name]);
  return `<details class="rs-npc"><summary><i class="fa-solid fa-chess-rook"></i> ${esc(S("NpcTurn"))}</summary>
    <form class="rs-npcform"><p class="rs-note">${esc(S("NpcHint"))}</p><div class="rs-grid">
      <label>${esc(S("NpcOwner"))}<select name="owner">${opt(owners)}</select></label>
      <label>${esc(S("NpcSector"))}<select name="sector">${opt(visibleSectors(s).map(x => [x.key, sectorName(x)]), ST.sel ?? "")}</select></label>
      <label>${esc(S("IntentLabel"))}<select name="intent">${opt(Object.keys(INTENTS).map(k => [k, S(`Intent.${k}`)]))}</select></label>
      <label>${esc(S("Target"))}<select name="target"><option value="">—</option>${opt(ownerOptions(s).map(o => [o.key, o.name]))}</select></label>
      <label>${esc(S("NpcDice"))}<input type="number" name="dice" value="6" min="0" max="20"></label>
    </div><textarea name="text" rows="2" placeholder="${esc(S("NpcText"))}"></textarea>
    <div class="rs-row"><a class="r-btn" data-rs="npcAdd"><i class="fa-solid fa-plus"></i> ${esc(S("NpcAdd"))}</a></div></form></details>`;
}

/** Договор между владельцами влияния: записывается ведущим (игроки договариваются в игре). */
export function pactForm(s) {
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

/** Черновик отчёта: общий текст и личные куски — правит ведущий, потом «Опубликовать». */
export function draftView(s) {
  const d = s.draft;
  return `<section class="rs-draft"><h3>${esc(S("Report", { n: s.turn.n }))}</h3>
    <label>${esc(S("ReportPublic"))}<textarea data-rs-draft="public" rows="8">${esc(d.public)}</textarea></label>
    ${Object.entries(d.private).map(([id, t]) => `<label>${esc(S("ReportPrivate", { name: game.actors.get(id)?.name ?? "?" }))}<textarea data-rs-draft="${id}" rows="5">${esc(t)}</textarea></label>`).join("")}
    <div class="rs-row"><a class="r-btn is-accent" data-rs="publish"><i class="fa-solid fa-feather"></i> ${esc(S("Publish"))}</a>
      <a class="r-btn" data-rs="draftCancel">${esc(S("DraftCancel"))}</a></div></section>`;
}

export function reportsView(s) {
  const list = [...s.reports].reverse();
  return `<section class="rs-reports"><h3>${esc(S("Reports"))}</h3>
    <ul>${list.map(r => `<li><a data-rs="openReport" data-uuid="${r.uuid}"><i class="fa-solid fa-scroll"></i> ${esc(S("TurnN", { n: r.n }))}${r.label ? ` · ${esc(r.label)}` : ""}</a> <small>${esc(r.date ?? "")}</small>
      ${r.tokens ? `<a class="rs-histbtn ${ST.hist === r.n ? "on" : ""}" data-rs="hist" data-n="${r.n}" data-tooltip="${esc(S("HistoryShow"))}"><i class="fa-solid fa-hexagon-nodes"></i></a>` : ""}
      ${game.user.isGM && r.clockFrom != null && !r.clockUndone ? `<a class="rs-histbtn" data-rs="clockUndo" data-n="${r.n}" data-tooltip="${esc(S("ClockUndo"))}"><i class="fa-solid fa-clock-rotate-left"></i></a>` : ""}
      ${r.clockFrom != null ? `<small>${esc(S(r.clockUndone ? "ClockUndone" : "ClockShifted", { span: r.shiftText ?? "" }))}</small>` : ""}</li>`).join("") || `<li class="rs-note">${esc(S("NoReports"))}</li>`}</ul></section>`;
}

export function setupView(s) {
  const dists = EXT.strategy.districts.flatMap(f => f());
  const sph = s.spheres.map((x, i) => `<li><input type="color" data-rs-sph="${i}" data-f="color" value="${x.color}"><input type="text" data-rs-sph="${i}" data-f="name" value="${esc(sphereName(x))}"></li>`).join("");
  const secs = s.sectors.map((x, i) => `<li class="rs-setsec ${ST.sel === x.key ? "is-sel" : ""}">
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
    <h4>${esc(S("Factions"))}</h4><p class="rs-note">${esc(S("FactionsHint"))}</p><ul class="rs-setsph">${facs}</ul><a class="r-btn" data-rs="facAdd"><i class="fa-solid fa-plus"></i> ${esc(S("FactionAdd"))}</a> <a class="r-btn" data-rs="facTech" data-tooltip="${esc(S("FactionTechHint"))}"><i class="fa-solid fa-atom"></i> ${esc(S("FactionTech"))}</a> <a class="r-btn" data-rs="facDead" data-tooltip="${esc(S("FactionDeadHint"))}"><i class="fa-solid fa-ghost"></i> ${esc(S("FactionDead"))}</a>
    <h4>${esc(S("Sectors"))}</h4><ul class="rs-setsecs">${secs}</ul><a class="r-btn" data-rs="secAdd"><i class="fa-solid fa-plus"></i> ${esc(S("SectorAdd"))}</a>
    <h4>${esc(S("Danger"))}</h4><a class="r-btn rc-danger" data-rs="wipe"><i class="fa-solid fa-trash"></i> ${esc(S("Wipe"))}</a>
  </section>`;
}
