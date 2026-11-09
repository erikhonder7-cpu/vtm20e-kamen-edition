// module/combat/turn.mjs
// Ход боя V20 (правила системы, гл. 4 «Ход боя»): три фазы.
//   1. Инициатива — каждый ход заново: 1d10 + Ловкость + Смекалка − раны + свободная Стремительность
//      (быстрый вариант — 6 вместо кости). Ничья — выше показатель инициативы; если и он равен — одновременно.
//   2. Заявки — от низшей инициативы к высшей: действие, множественные действия, Дисциплины, трата Воли, выжидание.
//   3. Действия — от высшей к низшей (обычные ходы трекера). Выжидающий действует в конце хода;
//      дополнительные действия Стремительности — фазой после всех (combat/celerity.mjs).
// Защита без заявленной защиты — отмена действия: бросок Воли (сл. 6) или 1 пункт Воли.
// Заявку пишет владелец персонажа (флаг актёра declared — игрок не может менять бой), фазу ведёт рассказчик.

import { SYSTEM_ID } from "../config.mjs";
import { playSound } from "../ui/sounds.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Turn.${k}`, d) : game.i18n.localize(`VTM20.Turn.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
const setting = k => { try { return game.settings.get(SYSTEM_ID, k); } catch { return null; } };

/** Виды заявок: значок и подпись. */
export const DECLARE = {
  attack: { icon: "fa-khanda" },
  defense: { icon: "fa-shield-halved" },
  multi: { icon: "fa-layer-group" },
  power: { icon: "fa-wand-sparkles" },
  move: { icon: "fa-person-running" },
  other: { icon: "fa-comment-dots" },
  delay: { icon: "fa-hourglass-half" }
};

/** Бой с порядком V20: ничья по инициативе — выше показатель инициативы. */
export class VtmCombat extends Combat {
  _sortCombatants(a, b) {
    const ia = Number.isFinite(a.initiative) ? a.initiative : -Infinity, ib = Number.isFinite(b.initiative) ? b.initiative : -Infinity;
    if (ib !== ia) return ib - ia;
    const ra = Number(a.actor?.system?.initiative) || 0, rb = Number(b.actor?.system?.initiative) || 0;
    if (rb !== ra) return rb - ra;
    return super._sortCombatants(a, b);
  }
}

/** Заявка персонажа на текущий ход этого боя (или null). */
export function declarationOf(actor, combat = game.combat) {
  const d = actor?.getFlag?.(SYSTEM_ID, "declared");
  return d && combat && d.combat === combat.id && d.round === combat.round ? d : null;
}

/** Сколько действий заявлено (для деления пула в окнах броска и атаки): 1, если не заявлено иное. */
export function declaredActions(actor) {
  const d = declarationOf(actor);
  return d?.kind === "multi" ? Math.clamp(Number(d.actions) || 2, 2, 6) : 1;
}

/** Фаза хода: { round, phase: "declare" | "act" }. */
export const phaseOf = combat => combat?.getFlag?.(SYSTEM_ID, "turnPhase") ?? null;

/** Порядок заявок: от низшей инициативы к высшей (живые бойцы с актёром). */
function declareOrder(combat) {
  return [...combat.turns].filter(c => c.actor && !c.defeated).reverse();
}

/** Кто сейчас заявляет (первый без заявки в порядке от низшей инициативы). */
export function currentDeclarer(combat) {
  return declareOrder(combat).find(c => !declarationOf(c.actor, combat)) ?? null;
}

/** Начало хода (рассказчик): бросок инициативы всем и фаза заявок. */
export async function startTurn(combat) {
  // бой могли удалить, пока шёл ход (конец боя сразу после смены хода) — тогда молча выходим
  try { await beginTurn(combat); }
  catch (e) {
    // удаление боя могло быть ещё в пути — дать ему завершиться и проверить снова
    await new Promise(r => setTimeout(r, 100));
    if (game.combats.has(combat?.id)) throw e;
  }
}

async function beginTurn(combat) {
  if (!game.users.activeGM?.isSelf || !combat?.started) return;
  const last = combat.getFlag(SYSTEM_ID, "turnRound") ?? 0;
  if (combat.round <= last) return;
  await combat.setFlag(SYSTEM_ID, "turnRound", combat.round);
  // сводка прошедшего хода — до новых бросков
  if (combat.round > 1) await turnSummary(combat);
  snapshot(combat);
  // клинч: в начале хода оба наносят урон Силой
  await (await import("./combat.mjs")).grappleTick(combat);
  // каждый ход — заново; на первом ходу — только тем, у кого инициативы ещё нет (брошенная вручную сохраняется)
  if (setting("combatInitEachTurn") !== false) await rollTurnInitiative(combat, { onlyMissing: combat.round === 1 });
  if (!game.combats.has(combat.id)) return;
  if (setting("combatDeclare") !== false) await combat.setFlag(SYSTEM_ID, "turnPhase", { round: combat.round, phase: "declare" });
  else await combat.unsetFlag(SYSTEM_ID, "turnPhase");
  ui.combat?.render();
}

/** Инициатива всем живым бойцам: 1d10 (или 6 — быстрый вариант) + показатель; одна карточка в чат. */
export async function rollTurnInitiative(combat, { onlyMissing = false } = {}) {
  const fixed = !!setting("combatInitFixed");
  const rows = [], updates = [];
  for (const c of combat.combatants) {
    if (c.defeated || !c.actor) continue;
    const rating = Number(c.actor.system?.initiative) || 0;
    if (onlyMissing && Number.isFinite(c.initiative)) {
      rows.push({ name: c.token?.name ?? c.name, die: c.initiative - rating, rating, total: c.initiative, hidden: c.hidden, kept: true });
      continue;
    }
    let die = 6;
    if (!fixed) { const r = await new Roll("1d10").evaluate(); die = r.total; }
    updates.push({ _id: c.id, initiative: die + rating });
    rows.push({ name: c.token?.name ?? c.name, die, rating, total: die + rating, hidden: c.hidden });
  }
  if (!game.combats.has(combat.id)) return;
  if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
  rows.sort((a, b) => b.total - a.total || b.rating - a.rating);
  const visible = rows.filter(r => !r.hidden);
  if (!visible.length) return;
  await ChatMessage.create({ speaker: { alias: t("InitTitle") },
    content: `<div class="r-roll-card r-turn-card"><header class="r-turn-head"><i class="fa-solid fa-hourglass-start"></i> <b>${esc(t("InitRound", { n: combat.round }))}</b></header>
      <ol class="r-turn-list">${visible.map(r => `<li><span class="r-turn-name">${esc(r.name)}</span><span class="r-turn-calc">${fixed ? 6 : `<i class="fa-solid fa-dice-d10"></i>${r.die}`} + ${r.rating}</span><b class="r-turn-total">${r.total}</b></li>`).join("")}</ol>
      <p class="r-turn-foot">${esc(t(setting("combatDeclare") !== false ? "InitFootDeclare" : "InitFoot"))}</p></div>` });
}

/** Окно заявки: вид действия, сколько действий, что именно. */
export async function openDeclare(actor, combat = game.combat) {
  if (!actor?.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: actor?.name ?? "" }));
  const prev = declarationOf(actor, combat);
  const kinds = Object.keys(DECLARE);
  let res = null;
  await foundry.applications.api.DialogV2.wait({
    window: { title: t("DeclareTitle"), icon: "fa-solid fa-bullhorn" }, classes: ["vtm20", "r-dialog", "r-declare-dialog"], position: { width: 460 },
    content: `<div class="r-cel">
      <div class="r-cel-head"><span class="r-cel-kicker">${esc(t("DeclareKicker", { n: combat.round }))}</span><b class="r-cel-name">${esc(actor.name)}</b>
        <span class="r-cel-left">${esc(t("DeclareHint"))}</span></div>
      <div class="r-decl-kinds">${kinds.map(k => `<label class="r-decl-kind${(prev?.kind ?? "attack") === k ? " is-active" : ""}"><input type="radio" name="kind" value="${k}"${(prev?.kind ?? "attack") === k ? " checked" : ""}>
        <i class="fa-solid ${DECLARE[k].icon}"></i><span><b>${esc(t(`Kind.${k}`))}</b><em>${esc(t(`KindSub.${k}`))}</em></span></label>`).join("")}</div>
      <div class="r-decl-multi${prev?.kind === "multi" ? "" : " is-off"}"><span>${esc(t("Actions"))}</span>
        <span class="r-bw-step" data-min="2" data-max="6"><button type="button" data-d="-1"><i class="fa-solid fa-minus"></i></button><b>${prev?.actions ?? 2}</b><button type="button" data-d="1"><i class="fa-solid fa-plus"></i></button><input type="hidden" name="actions" value="${prev?.actions ?? 2}"></span>
        <em>${esc(t("ActionsHint"))}</em></div>
      <input class="r-use-say" type="text" name="text" value="${esc(prev?.text ?? "")}" placeholder="${esc(t("TextHint"))}">
      <label class="r-check"><input type="checkbox" name="will"${prev?.will ? " checked" : ""}><span>${esc(t("Will"))}</span></label>
    </div>`,
    render: (ev, dlg) => {
      const el = dlg.element;
      const sync = () => {
        for (const l of el.querySelectorAll(".r-decl-kind")) l.classList.toggle("is-active", l.querySelector("input").checked);
        el.querySelector(".r-decl-multi").classList.toggle("is-off", el.querySelector('[name="kind"]:checked')?.value !== "multi");
      };
      el.addEventListener("change", sync);
      for (const b of el.querySelectorAll(".r-bw-step button")) b.addEventListener("click", () => {
        const s = b.closest(".r-bw-step"), inp = s.querySelector("input");
        inp.value = Math.clamp((Number(inp.value) || 2) + Number(b.dataset.d), 2, 6); s.querySelector("b").textContent = inp.value;
      });
      el.querySelector('[name="text"]')?.focus();
    },
    buttons: [{ action: "ok", icon: "fa-solid fa-bullhorn", label: t("Declare"), default: true,
      callback: (e, b) => { const f = b.form.elements; res = { kind: b.form.querySelector('[name="kind"]:checked')?.value ?? "attack",
        actions: Math.clamp(Number(f.actions.value) || 2, 2, 6), text: f.text.value.trim(), will: !!f.will.checked }; } }],
    rejectClose: false
  });
  if (!res) return null;
  await actor.setFlag(SYSTEM_ID, "declared", { combat: combat.id, round: combat.round, ...res, aborted: false });
  return res;
}

/** Рассказчик: заявки всех статистов одним окном (вид и что делают). */
export async function declareNpcs(combat) {
  const npcs = declareOrder(combat).filter(c => !c.actor.hasPlayerOwner);
  if (!npcs.length) return ui.notifications.info(t("NoNpcs"));
  const kinds = Object.keys(DECLARE);
  let res = null;
  await foundry.applications.api.DialogV2.wait({
    window: { title: t("NpcDeclare"), icon: "fa-solid fa-users" }, classes: ["vtm20", "r-dialog", "r-declare-dialog"], position: { width: 560 },
    content: `<div class="r-npc-decl">${npcs.map(c => { const d = declarationOf(c.actor, combat);
      return `<div class="r-npc-row" data-id="${c.id}"><b>${esc(c.token?.name ?? c.name)}</b>
        <select name="k-${c.id}">${kinds.map(k => `<option value="${k}"${(d?.kind ?? "attack") === k ? " selected" : ""}>${esc(t(`Kind.${k}`))}</option>`).join("")}</select>
        <input type="text" name="t-${c.id}" value="${esc(d?.text ?? "")}" placeholder="${esc(t("TextHintShort"))}"></div>`; }).join("")}</div>`,
    buttons: [{ action: "ok", icon: "fa-solid fa-bullhorn", label: t("Declare"), default: true,
      callback: (e, b) => { const f = b.form.elements; res = npcs.map(c => ({ c, kind: f[`k-${c.id}`].value, text: f[`t-${c.id}`].value.trim() })); } }],
    rejectClose: false
  });
  if (!res) return;
  for (const { c, kind, text } of res)
    await c.actor.setFlag(SYSTEM_ID, "declared", { combat: combat.id, round: combat.round, kind, text, actions: kind === "multi" ? 2 : 1, will: false, aborted: false });
}

/** Рассказчик: заявки закончены (или пропущены) — фаза действий; выжидающие уходят в конец хода. */
export async function endDeclarations(combat) {
  if (!game.user.isGM) return;
  const live = combat.turns.filter(c => Number.isFinite(c.initiative));
  const low = live.length ? Math.min(...live.map(c => c.initiative)) : 0;
  const delayed = combat.turns.filter(c => declarationOf(c.actor, combat)?.kind === "delay");
  if (delayed.length) await combat.updateEmbeddedDocuments("Combatant", delayed.map((c, i) => ({ _id: c.id, initiative: low - 1 - i })));
  await combat.setFlag(SYSTEM_ID, "turnPhase", { round: combat.round, phase: "act" });
  await combat.update({ turn: 0 });
  await ChatMessage.create({ speaker: { alias: t("InitTitle") }, content: `<div class="r-notice"><i class="fa-solid fa-play"></i> ${esc(t("ActNow"))}</div>` });
}

/**
 * Защита без заявленной защиты — отмена действия: бросок Воли (сл. 6) или 1 Воля (правила системы).
 * true — защищаться можно.
 */
export async function abortForDefense(actor) {
  const combat = game.combat;
  if (!combat?.started || !combat.combatants.some(c => c.actor === actor)) return true;
  const d = declarationOf(actor, combat);
  if (!d || ["defense", "multi"].includes(d.kind) || d.aborted) return true;
  const how = await foundry.applications.api.DialogV2.wait({
    window: { title: t("AbortTitle"), icon: "fa-solid fa-shield-halved" }, classes: ["vtm20", "r-dialog"], position: { width: 500 },
    content: `<div class="r-gate-body"><i class="fa-solid fa-shield-halved r-gate-ico"></i><div class="r-gate-text">
      <p class="r-gate-why">${esc(t("AbortWhy", { what: t(`Kind.${d.kind}`) }))}</p><p class="r-gate-hint">${esc(t("AbortHint"))}</p></div></div>`,
    buttons: [{ action: "roll", icon: "fa-solid fa-dice-d10", label: t("AbortRoll"), default: true },
      { action: "spend", icon: "fa-solid fa-star", label: t("AbortSpend") },
      { action: "cancel", icon: "fa-solid fa-xmark", label: game.i18n.localize("VTM20.Gate.Cancel") }],
    rejectClose: false
  });
  if (!how || how === "cancel") return false;
  if (how === "spend") { if (!(await actor.spendWillpower(1))) return false; }
  else {
    const { rollPool } = await import("../dice/roll.mjs");
    const res = await rollPool({ actor, title: t("AbortTitle"), pool: actor.system.willpower?.permanent ?? 0, difficulty: 6, kind: "check" });
    if ((res?.successes ?? 0) < 1) { ui.notifications.info(t("AbortFailed")); return false; }
  }
  await actor.setFlag(SYSTEM_ID, "declared", { ...d, kind: "defense", aborted: true, text: [d.text, t("Aborted")].filter(Boolean).join(" · ") });
  return true;
}

/** Строка трекера: заявка бойца. */
function chip(combat, c) {
  const d = declarationOf(c.actor, combat);
  if (!d) return "";
  const k = DECLARE[d.kind] ?? DECLARE.other;
  const label = d.kind === "multi" ? t("MultiN", { n: d.actions }) : t(`Kind.${d.kind}`);
  return `<span class="r-ct-decl is-${d.kind}" data-tooltip="${esc([label, d.text, d.will ? t("Will") : ""].filter(Boolean).join(" · "))}"><i class="fa-solid ${k.icon}"></i> ${esc(label)}${d.text ? ` · <em>${esc(d.text)}</em>` : ""}${d.will ? ` <i class="fa-solid fa-star"></i>` : ""}</span>`;
}

/** Здоровье бойцов на начало хода — для сводки. */
const healthAt = new Map();
function snapshot(combat) {
  for (const c of combat.combatants) if (c.actor?.system?.health) {
    const h = c.actor._source.system.health ?? {};
    healthAt.set(`${combat.id}:${c.id}`, { b: h.bashing ?? 0, l: h.lethal ?? 0, a: h.aggravated ?? 0 });
  }
}

/** Сводка хода: кто сколько получил, кто выбыл. */
async function turnSummary(combat) {
  const rows = [];
  for (const c of combat.combatants) {
    const a = c.actor, was = healthAt.get(`${combat.id}:${c.id}`);
    if (!a?.system?.health || !was || c.hidden) continue;
    const h = a._source.system.health ?? {};
    const d = { b: (h.bashing ?? 0) - was.b, l: (h.lethal ?? 0) - was.l, a: (h.aggravated ?? 0) - was.a };
    const hurt = [d.b > 0 && t("SumB", { n: d.b }), d.l > 0 && t("SumL", { n: d.l }), d.a > 0 && t("SumA", { n: d.a })].filter(Boolean);
    const healed = d.b + d.l + d.a < 0;
    if (!hurt.length && !healed && !c.defeated) continue;
    const state = c.defeated ? t("SumOut") : a.system.health.status === "healthy" ? "" : game.i18n.localize(`VTM20.Health.${a.system.health.status}`);
    rows.push(`<li><span class="r-turn-name">${esc(c.token?.name ?? c.name)}</span><span class="r-turn-calc">${esc(hurt.join(", ") || (healed ? t("SumHealed") : ""))}</span><b class="r-turn-state">${esc(state)}</b></li>`);
  }
  if (!rows.length) return;
  await ChatMessage.create({ speaker: { alias: t("InitTitle") }, content: `<div class="r-roll-card r-turn-card"><header class="r-turn-head"><i class="fa-solid fa-scroll"></i> <b>${esc(t("SumTitle", { n: combat.round - 1 }))}</b></header>
    <ol class="r-turn-list is-plain">${rows.join("")}</ol></div>` });
}

/** Боец выбыл: смертный — шкала здоровья полна, вампир — торпор или кол (рассказчик отмечает «выбыл» в трекере). */
async function markDefeated(actor) {
  const combat = game.combat;
  if (!game.users.activeGM?.isSelf || !combat?.started) return;
  const out = !!(actor?.system?.health?.incapacitated && !actor.isVampire) || actor?.statuses?.has("r-torpor") || actor?.statuses?.has("r-staked") || actor?.statuses?.has("dead");
  for (const c of combat.combatants.filter(c => c.actor === actor && c.defeated !== out && (out || c.getFlag(SYSTEM_ID, "autoDefeated"))))
    await c.update({ defeated: out, [`flags.${SYSTEM_ID}.autoDefeated`]: out });
}

/** «Твоя очередь» владельцу бойца: заявлять или действовать — уведомление, колокол, импульс на жетоне. */
let lastNotified = "";
function notifyMine(combat) {
  if (!combat?.started || game.user.isGM) return;
  const ph = phaseOf(combat), declaring = ph?.phase === "declare" && ph.round === combat.round;
  const who = declaring ? currentDeclarer(combat) : combat.combatant;
  if (!who?.actor?.isOwner) return;
  const key = `${combat.id}:${combat.round}:${declaring ? "d" : "a"}:${who.id}:${combat.turn}`;
  if (key === lastNotified) return;
  lastNotified = key;
  ui.notifications.info(t(declaring ? "YourDeclare" : "YourTurn", { name: who.token?.name ?? who.name }));
  playSound("turn");
  const tk = who.token?.object;
  if (tk) { try { canvas.ping(tk.center, { style: "pulse", color: "#c4474c" }); } catch { /* без импульса */ } }
}

export function registerTurn() {
  // выбыл — сам: смертный при полной шкале, вампир в торпоре или с колом
  Hooks.on("updateActor", (actor, changed) => { if (foundry.utils.hasProperty(changed, "system.health")) markDefeated(actor); });
  Hooks.on("createActiveEffect", e => { if (e.parent?.documentName === "Actor") markDefeated(e.parent); });
  Hooks.on("deleteActiveEffect", e => { if (e.parent?.documentName === "Actor") markDefeated(e.parent); });
  // своя очередь — всем клиентам: после смены хода, хода боя или заявки
  const later = () => setTimeout(() => notifyMine(game.combat), 400);
  Hooks.on("updateCombat", later);
  Hooks.on("updateCombatant", later);
  Hooks.on("updateActor", (actor, changed) => { if (foundry.utils.hasProperty(changed, `flags.${SYSTEM_ID}.declared`)) later(); });
  game.settings.register(SYSTEM_ID, "combatInitEachTurn", { name: "VTM20.Settings.InitEachTurn.Name", hint: "VTM20.Settings.InitEachTurn.Hint", scope: "world", config: true, type: Boolean, default: true });
  game.settings.register(SYSTEM_ID, "combatInitFixed", { name: "VTM20.Settings.InitFixed.Name", hint: "VTM20.Settings.InitFixed.Hint", scope: "world", config: true, type: Boolean, default: false });
  game.settings.register(SYSTEM_ID, "combatDeclare", { name: "VTM20.Settings.Declare.Name", hint: "VTM20.Settings.Declare.Hint", scope: "world", config: true, type: Boolean, default: true });

  Hooks.on("updateCombat", (combat, changed) => { if ("round" in changed) startTurn(combat); });
  // Заявки: все заявили — рассказчик переводит в фазу действий
  Hooks.on("updateActor", (actor, changed) => {
    if (!game.users.activeGM?.isSelf || !foundry.utils.hasProperty(changed, `flags.${SYSTEM_ID}.declared`)) return;
    const combat = game.combat, ph = phaseOf(combat);
    if (ph?.phase === "declare" && ph.round === combat.round && !currentDeclarer(combat)) endDeclarations(combat);
    else ui.combat?.render();
  });
  Hooks.on("renderCombatTracker", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const combat = app.viewed ?? game.combat;
    if (!root || !combat?.started) return;
    root.querySelector(".r-ct-turn-phase")?.remove();
    const ph = phaseOf(combat);
    if (ph?.phase === "declare" && ph.round === combat.round) {
      const who = currentDeclarer(combat);
      const banner = document.createElement("section");
      banner.className = "r-ct-turn-phase";
      const mine = who?.actor?.isOwner;
      banner.innerHTML = `<span><i class="fa-solid fa-bullhorn"></i> <b>${esc(t("DeclarePhase"))}</b> · ${esc(who ? t("DeclareNow", { name: who.token?.name ?? who.name }) : t("DeclareDone"))}</span>
        <span class="r-ct-turn-btns">${mine ? `<button type="button" data-turn="declare">${esc(t("Declare"))}</button>` : ""}${game.user.isGM ? `<button type="button" data-turn="npcs">${esc(t("NpcDeclare"))}</button><button type="button" data-turn="skip">${esc(t("SkipDeclare"))}</button>` : ""}</span>`;
      banner.querySelector('[data-turn="declare"]')?.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); openDeclare(who.actor, combat); });
      banner.querySelector('[data-turn="skip"]')?.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); endDeclarations(combat); });
      banner.querySelector('[data-turn="npcs"]')?.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); declareNpcs(combat); });
      root.prepend(banner);
    }
    // заявки на строках бойцов; свой боец — клик по заявке меняет её
    for (const li of root.querySelectorAll(".combatant[data-combatant-id]")) {
      const c = combat.combatants.get(li.dataset.combatantId);
      if (!c?.actor) continue;
      const html = chip(combat, c);
      const name = li.querySelector(".token-name");
      if (!name) continue;
      name.querySelector(".r-ct-act")?.remove();
      // строка хода бойца: заявка (по ширине текста) и кнопка атаки статиста — рядом
      const row = document.createElement("div");
      row.className = "r-ct-act";
      if (html) row.insertAdjacentHTML("beforeend", html);
      else if (ph?.phase === "declare" && c.actor.isOwner) row.insertAdjacentHTML("beforeend", `<span class="r-ct-decl is-empty"><i class="fa-solid fa-bullhorn"></i> ${esc(t("NotDeclared"))}</span>`);
      name.append(row);
      name.querySelector(".r-ct-decl")?.addEventListener("click", ev => { if (!c.actor.isOwner) return; ev.preventDefault(); ev.stopPropagation(); openDeclare(c.actor, combat); });
      // статист рассказчика: атака прямо из трекера
      if (game.user.isGM && !c.actor.hasPlayerOwner && ph?.phase !== "declare") {
        row.insertAdjacentHTML("afterbegin", `<button type="button" class="r-ct-npc-atk" data-tooltip="${esc(t("NpcAttack"))}"><i class="fa-solid fa-khanda"></i></button>`);
        row.querySelector(".r-ct-npc-atk").addEventListener("click", async ev => { ev.preventDefault(); ev.stopPropagation(); (await import("./combat.mjs")).openAttack(c.actor); });
      }
    }
  });
}
