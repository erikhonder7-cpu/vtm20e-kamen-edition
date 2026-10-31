// module/apps/hunter.mjs
// Охотник: Расплата (основная книга, гл. 4–5; пересказ — data/hunter.json, глава правил «Охотник: Расплата»).
// Охотник — смертный в режиме наделённого (system.hunter.creed): кредо, Добродетели Милосердие / Прозрение / Рвение (0–10),
// Убеждённость 0–10 (начальная — по кредо), Грани — ключи «путь|уровень» в system.hunter.edges.
//   · Грань стоит очков своей Добродетели по уровню; сумма уровней Граней одной Добродетели не больше её значения;
//     уровни пути — по порядку; Грани чужих путей не выше высшей Грани пути кредо.
//   · Бросок Грани — Атрибут + Добродетель (сложность обычно 6); раз за сцену можно рискнуть Убеждённостью — кубик за пункт:
//     успех — вложенное остаётся и +1, неудача — вложенное пропадает, провал — пропадает вся Убеждённость.
//   · Пункт Убеждённости на сцену — второе зрение и защита разума и тела; 10 Убеждённости можно обменять на пункт Добродетели.
// Необязательные правила Players Guide, гл. 2 (настройки мира): рост за опыт или Деяниями, Жертва, упрощённая цена Граней 1/1/2/2/4,
// Грани «свыше» (своих нет — воззвание на сцену), Грани V уровня.

import { rollPool } from "../dice/roll.mjs";
import { Codex } from "../data/codex.mjs";
import { SYSTEM_ID } from "../config.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Hunter.${k}`, d) : game.i18n.localize(`VTM20.Hunter.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
export const VIRTUE_KEYS = ["mercy", "vision", "zeal"];
const notice = (actor, icon, html, cls = "") => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-hunter ${cls}"><i class="fa-solid ${icon}"></i> ${html}</div>` });

/** Окно броска Грани и воззвания: подпись, текст Грани карточкой, строка пула, числовые поля в ряд, пояснения под чертой. */
const edgeForm = ({ kicker, text, pool, poolLabel, fields = [], notes = [] }) => `<div class="r-edge-form">
  ${kicker ? `<span class="r-kicker">${esc(kicker)}</span>` : ""}
  ${text ? `<p class="r-edge-text">${esc(text)}</p>` : ""}
  ${pool ? `<div class="r-edge-pool"><span class="r-edge-lab">${esc(poolLabel ?? t("PoolLine"))}</span><div>${pool}</div></div>` : ""}
  <div class="r-edge-nums">${fields.map(f => `<label class="r-edge-num"><span class="r-edge-lab">${esc(f.label)}</span>
    <input type="number" name="${f.name}" value="${f.value}" min="${f.min}" max="${f.max}">${f.sub ? `<em>${esc(f.sub)}</em>` : ""}</label>`).join("")}</div>
  ${notes.filter(Boolean).length ? `<div class="r-edge-notes">${notes.filter(Boolean).map(n => `<p>${esc(n)}</p>`).join("")}</div>` : ""}
</div>`;

export const H = () => Codex.hunter ?? { creeds: [], edges: [], virtues: {} };
/** Свидетель (Players Guide, гл. 1): кредо «bystander» — без Граней, свои Добродетели, Убеждённость как рассудок. */
export const isLost = actor => actor?.system?.hunter?.creed === "bystander";
export const LOST_KEYS = ["courage", "reason", "selfControl"];
export const creedOf = key => H().creeds.find(c => c.key === key) ?? null;
export const edgeOf = key => H().edges.find(e => e.key === key) ?? null;

/* ── Рост наделённых (Players Guide, гл. 2) ─────────────────────────────── */
const setting = k => { try { return game.settings.get(SYSTEM_ID, k); } catch { return null; } };
/** «core» — по книге (10 Убеждённости → пункт Добродетели); «xp» — Убеждённость, Добродетели и Грани за опыт;
 *  «deeds» — временные Добродетели за поступки, 10 → пункт постоянной. */
export const growth = () => { const g = setting("hunterGrowth"); return g === "xp" || g === "deeds" ? g : "core"; };
export const fifthOn = () => !!setting("hunterFifth");
export const sacrificeOn = () => !!setting("hunterSacrifice");
export const freeformOn = () => !!setting("hunterFreeform");
/** С какой Добродетели начинаются психозы: 7, при Жертве — 9. */
const madFrom = () => sacrificeOn() ? 9 : 7;
/** Добродетель застыла: Грань V другой Добродетели, если условие не снято жертвой. */
const isFrozen = (h, v) => !!h.fifth && h.fifth !== v && !(h.fifthFree ?? []).includes("frozen");
/** Может ли Добродетель вырасти на пункт: не 10, не застыла, основная не ниже остальных. */
function canRaise(h, v) {
  const pv = creedOf(h.creed)?.virtue;
  return (h[v] ?? 0) < 10 && !isFrozen(h, v) && (v === pv || (h[v] ?? 0) < (h[pv] ?? 0));
}
const ROMAN = ["", "I", "II", "III", "IV", "V"];
const COSTS = { core: [1, 2, 3, 4, 0], cheap: [1, 1, 2, 2, 4] };
/** Цена уровня Грани в очках Добродетели. По книге V уровень вне счёта (его оплачивают Силой воли), упрощённо — 4. */
export const edgeCost = level => COSTS[setting("hunterEdgeCost") === "cheap" ? "cheap" : "core"][level - 1] ?? 0;
/** Сколько Добродетели нужно для уровня (сумма цен уровней 1…L); для V — 10. */
const needFor = level => level >= 5 ? 10 : Array.from({ length: level }, (_, i) => edgeCost(i + 1)).reduce((s, c) => s + c, 0);
/** Высший уровень Грани при значении Добродетели. */
export function levelCap(v) {
  let cap = 0;
  for (let l = 1; l <= 5; l++) if (needFor(l) <= v) cap = l;
  return cap;
}
/** Начальная Убеждённость: купленная опытом или по кредо. */
export const startConviction = actor => actor.system.hunter?.start || creedOf(actor.system.hunter?.creed)?.conviction || 3;
/** Цена Грани опытом: путь кредо — уровень × 5, чужой — уровень × 7. */
export const edgeXp = (actor, e) => e.level * (e.path === actor.system.hunter?.creed ? 5 : 7);

/** Цены опыта охотника (xpCost): Убеждённость — новое × 5 (не выше Силы воли), основная Добродетель — новое × 3, прочие — × 5. */
export function hunterXpCost(actor, kind, current, key) {
  if (kind === "lostVirtue") return isLost(actor) && current < 5 ? Math.max(1, current) * 2 : null;   // Свидетель: текущее × 2
  if (growth() !== "xp" || actor.type !== "hunter" || isLost(actor)) return null;
  const h = actor.system.hunter ?? {}, pv = creedOf(h.creed)?.virtue;
  if (kind === "hunterConviction") return current >= 10 || current + 1 > (actor.system.willpower?.permanent ?? 0) ? null : (current + 1) * 5;
  if (current >= 10 || isFrozen(h, key)) return null;                        // после Грани V прочие Добродетели застыли
  if (key !== pv && current + 1 > (h[pv] ?? 0)) return null;                // основная не ниже остальных
  return (current + 1) * (key === pv ? 3 : 5);
}

function spendXp(actor, cost, reason) {
  const log = foundry.utils.deepClone(actor._source.system.experience.log);
  log.unshift({ amount: -cost, reason, date: new Date().toLocaleDateString("ru-RU") });
  return { "system.experience.spent": actor._source.system.experience.spent + cost, "system.experience.log": log };
}

export function registerHunter() {
  const rerender = () => { for (const app of foundry.applications.instances.values()) if (app.document?.type === "hunter" || app.id?.startsWith("r-library")) app.render(); };
  const S = k => ({ name: `VTM20.Settings.${k}.Name`, hint: `VTM20.Settings.${k}.Hint`, scope: "world", config: true, onChange: rerender });
  game.settings.register(SYSTEM_ID, "hunterGrowth", { ...S("HunterGrowth"), type: String, default: "core",
    choices: { core: "VTM20.Settings.HunterGrowth.core", xp: "VTM20.Settings.HunterGrowth.xp", deeds: "VTM20.Settings.HunterGrowth.deeds" } });
  game.settings.register(SYSTEM_ID, "hunterSacrifice", { ...S("HunterSacrifice"), type: Boolean, default: false });
  game.settings.register(SYSTEM_ID, "hunterFreeform", { ...S("HunterFreeform"), type: Boolean, default: false });
  game.settings.register(SYSTEM_ID, "hunterEdgeCost", { ...S("HunterEdgeCost"), type: String, default: "core",
    choices: { core: "VTM20.Settings.HunterEdgeCost.core", cheap: "VTM20.Settings.HunterEdgeCost.cheap" } });
  game.settings.register(SYSTEM_ID, "hunterFifth", { ...S("HunterFifth"), type: Boolean, default: false });
}

/** Грани персонажа (данные справочника) по порядку путей и уровней. */
export function edgesOf(actor) {
  return (actor.system.hunter?.edges ?? []).map(edgeOf).filter(Boolean);
}

/** Бюджет Граней: по Добродетели — сумма уровней и значение; высшая Грань пути кредо. */
export function edgeBudget(actor) {
  const h = actor.system.hunter ?? {}, own = edgesOf(actor);
  const used = Object.fromEntries(VIRTUE_KEYS.map(v => [v, own.filter(e => e.virtue === v).reduce((s, e) => s + edgeCost(e.level), 0)]));
  const top = Math.max(0, ...own.filter(e => e.path === h.creed).map(e => e.level));
  return { used, top, over: growth() === "xp" ? [] : VIRTUE_KEYS.filter(v => used[v] > (h[v] ?? 0)) };
}

/** Можно ли взять Грань: причины отказа (пусто — можно). */
export function edgeReasons(actor, key) {
  const e = edgeOf(key), h = actor.system.hunter ?? {};
  if (!e) return [t("NoEdge")];
  const have = new Set(h.edges ?? []), out = [];
  if (have.has(key)) return [];
  if (isLost(actor)) return [t("LostNoEdges")];
  if (freeformOn()) return [t("FreeformNoTake")];                            // своих Граней нет — только воззвание
  if (e.level > 1 && !have.has(`${e.path}|${e.level - 1}`)) out.push(t("NeedPrev", { n: e.level - 1 }));
  const b = edgeBudget(actor), v = h[e.virtue] ?? 0;
  // за опытом Добродетель ограничивает лишь высший уровень, по книге — сумму цен Граней
  if (growth() === "xp") { if (e.level < 5 && e.level > levelCap(v)) out.push(t("NeedLevel", { v: H().virtues[e.virtue], n: needFor(e.level) })); }
  else if (b.used[e.virtue] + edgeCost(e.level) > v) out.push(t("NeedVirtue", { v: H().virtues[e.virtue], n: b.used[e.virtue] + edgeCost(e.level) }));
  if (e.path !== h.creed && e.level > b.top) out.push(t("NeedCreed", { n: b.top }));
  if (e.level >= 5) out.push(...fifthReasons(actor, e));
  return out;
}

/** Грань V уровня (Players Guide, гл. 2): включена настройкой, Добродетель 10, одна на охотника, Сила воли — чем заплатить. */
export function fifthReasons(actor, e) {
  const h = actor.system.hunter ?? {};
  if (!fifthOn()) return [t("FifthLevel")];
  const out = [];
  if ((h[e.virtue] ?? 0) < 10) out.push(t("FifthVirtue", { v: H().virtues[e.virtue] }));
  if (h.fifth) out.push(t("FifthOnce"));
  if ((actor.system.willpower?.permanent ?? 0) < 6) out.push(t("FifthWill"));
  return out;
}

const FIFTH_ARCH = ["Автократ", "Фанатик", "Перфекционист"];

/** Обряд Грани V: Сила воли −5, Натура и Маска из трёх, прочие Добродетели замирают, Покровители 5. Возвращает правки или null. */
const FIFTH_TERMS = ["will", "arch", "frozen", "presence", "patron", "curse"];

async function fifthRite(actor, e) {
  const opts = sel => FIFTH_ARCH.map(a => `<option ${a === sel ? "selected" : ""}>${a}</option>`).join("");
  const d = actor.system.details ?? {}, h = actor.system.hunter ?? {}, cv = creedOf(h.creed)?.virtue ?? e.virtue;
  // Жертва: 10 очков роста снимают одно условие
  const can = sacrificeOn() ? Math.floor((h.advance ?? 0) / 10) : 0;
  const text = { will: t("FifthWillCost"), arch: t("FifthArch"), frozen: t("FifthFrozen"), presence: t("FifthPresence"), patron: t("FifthPatron"), curse: t(`FifthCurse.${cv}`) };
  const content = `<p>${t("FifthIntro", { name: esc(e.name) })}</p><ul class="r-fifth-list">${FIFTH_TERMS.map(k => `<li>${can
    ? `<label><input type="checkbox" name="free_${k}"> ${text[k]}</label>` : text[k]}</li>`).join("")}<li>${t("FifthGuard")}</li></ul>
    ${can ? `<p class="r-note">${t("FifthWaive", { n: can, pts: h.advance })}</p>` : ""}<div class="r-fields">
    <label class="r-f"><span>${t("FifthNature")}</span><select name="nature">${opts(d.nature)}</select></label>
    <label class="r-f"><span>${t("FifthDemeanor")}</span><select name="demeanor">${opts(d.demeanor)}</select></label></div>`;
  const v = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("FifthTitle") }, classes: ["vtm20", "r-dialog"], position: { width: 560 }, content,
    ok: { label: t("FifthOk"), callback: (ev, btn) => { const f = btn.form.elements;
      return { nature: f.nature.value, demeanor: f.demeanor.value, free: FIFTH_TERMS.filter(k => f[`free_${k}`]?.checked) }; } }
  }).catch(() => null);
  if (!v) return null;
  if (v.free.length > can) { ui.notifications.warn(t("FifthWaiveOver", { n: can })); return null; }
  const upd = { "system.hunter.fifth": e.virtue, "system.hunter.fifthFree": v.free };
  if (v.free.length) upd["system.hunter.advance"] = (h.advance ?? 0) - v.free.length * 10;
  if (!v.free.includes("will")) {
    const wp = actor.system.willpower, perm = Math.max(1, wp.permanent - 5);
    Object.assign(upd, { "system.willpower.permanent": perm, "system.willpower.temporary": Math.min(wp.temporary, perm) });
  }
  if (!v.free.includes("arch")) Object.assign(upd, { "system.details.nature": v.nature, "system.details.demeanor": v.demeanor });
  if (!v.free.includes("patron")) {
    const patron = H().backgrounds.find(b => b.en === "Patron");
    const bg = actor.items.find(i => i.type === "background" && (i.name === patron?.name || i.system.source === "Patron"));
    if (bg) await bg.update({ "system.value": 5 });
    else if (patron) await actor.createEmbeddedDocuments("Item", [{ name: patron.name, type: "background", system: { value: 5, source: "Patron", description: patron.html } }]);
  }
  return upd;
}

/**
 * Взять Грань (библиотека). По книге — даром в пределах очков Добродетели; при росте за опыт — за опыт (путь кредо × 5, чужой × 7);
 * V уровень — через обряд. Мастер может выдать Грань в обход правил (без обряда, если Грани V выключены).
 */
export async function takeEdge(actor, key) {
  const e = edgeOf(key), h = actor.system.hunter ?? {};
  if (!e || (h.edges ?? []).includes(key)) return false;
  const why = edgeReasons(actor, key);
  if (why.length && !game.user.isGM) { ui.notifications.warn(why.join(" ")); return false; }
  const xp = growth() === "xp" ? edgeXp(actor, e) : 0, have = actor.system.experience?.available ?? 0;
  if (xp && have < xp) { ui.notifications.warn(game.i18n.format("VTM20.Notify.NoXp", { cost: xp, have })); return false; }
  let upd = {};
  if (e.level >= 5 && fifthOn()) { upd = await fifthRite(actor, e); if (!upd) return false; }
  else if (xp && !(await foundry.applications.api.DialogV2.confirm({ window: { title: e.name }, content: `<p>${t("BuyEdge", { name: esc(e.name), n: xp })}</p>` }))) return false;
  Object.assign(upd, { "system.hunter.edges": [...new Set([...(h.edges ?? []), key])] }, xp ? spendXp(actor, xp, t("EdgeLearned", { name: e.name })) : {});
  await actor.update(upd);
  if (upd["system.hunter.fifth"]) await notice(actor, "fa-sun", t("FifthDone", { name: esc(actor.name), edge: esc(e.name) })
    + (upd["system.hunter.fifthFree"]?.length ? " " + t("FifthWaived", { list: upd["system.hunter.fifthFree"].map(k => t(`FifthTerm.${k}`)).join(", ") }) : ""), "is-sin");
  return true;
}

/** Контекст карточки охотника на листе. */
export function hunterInfo(actor, dots) {
  if (isLost(actor)) return lostInfo(actor, dots);
  const h = actor.system.hunter ?? {}, creed = creedOf(h.creed), b = edgeBudget(actor);
  return {
    creed, creedName: creed ? `${creed.name} · ${creed.who}` : "", creedVirtue: creed?.virtue ?? "",
    conviction: h.conviction ?? 0, base: startConviction(actor), xpGrowth: growth() === "xp", deeds: growth() === "deeds",
    convDots: dots(h.conviction ?? 0, 10, { path: "system.hunter.conviction" }), canTrade: growth() === "core" && (h.conviction ?? 0) >= 10,
    canCash: growth() === "deeds" && VIRTUE_KEYS.some(v => (h.temp?.[v] ?? 0) >= 10 && canRaise(h, v)),
    canShift: growth() === "deeds" && (h.temp?.[creed?.virtue] ?? 0) >= 2,
    sacrifice: sacrificeOn(), advance: h.advance ?? 0,
    canAdvance: sacrificeOn() && VIRTUE_KEYS.some(v => canRaise(h, v) && ((h[v] ?? 0) + 1) * (v === creed?.virtue ? 2 : 3) <= (h.advance ?? 0)),
    fifth: h.fifth ? H().virtues[h.fifth] ?? h.fifth : "",
    fifthNotes: ["frozen", "presence", "curse"].filter(k => !(h.fifthFree ?? []).includes(k)).map(k => t(`FifthShort.${k}`)).join("; ") || t("FifthShort.none"),
    madFrom: madFrom(),
    virtues: VIRTUE_KEYS.map(v => ({ key: v, label: H().virtues[v], value: h[v] ?? 0, primary: creed?.virtue === v, temp: h.temp?.[v] ?? 0,
      dots: dots(h[v] ?? 0, 10, { path: `system.hunter.${v}` }), used: b.used[v], over: b.over.includes(v), cap: levelCap(h[v] ?? 0),
      frozen: isFrozen(h, v), madness: Math.max(0, (h[v] ?? 0) - madFrom() + 1) })),
    madness: VIRTUE_KEYS.reduce((s, v) => s + Math.max(0, (h[v] ?? 0) - madFrom() + 1), 0)
  };
}

/** Вкладка «Грани»: по путям, у каждой — бросок словами. */
export function edgesView(actor) {
  const h = actor.system.hunter ?? {}, own = edgesOf(actor), V = H().virtues;
  const paths = [...new Set(own.map(e => e.path))].sort((a, b) => (a === h.creed ? -1 : b === h.creed ? 1 : a.localeCompare(b)));
  return paths.map(p => {
    const c = H().creeds.find(x => x.key === p);
    return { path: p, name: c?.name ?? p, primary: p === h.creed, virtue: V[c?.virtue] ?? "",
      edges: own.filter(e => e.path === p).sort((a, b) => a.level - b.level).map(e => ({ ...e, pool: poolLabel(actor, e) })) };
  });
}

export function poolLabel(actor, e) {
  if (!e.roll) return t("Passive");
  const a = e.roll.trait1 === "pick" ? t("AnyAttribute") : e.roll.trait1 ? actor.traitLabel(e.roll.trait1) : "";
  const v = e.roll.trait2.startsWith("hunter.") ? H().virtues[e.roll.trait2.slice(7)] : actor.traitLabel(e.roll.trait2);
  return `${[a, v].filter(Boolean).join(" + ")}, ${e.roll.byTarget ? t("DiffByTarget") : t("Diff", { n: e.roll.difficulty })}`;
}

/** Применить Грань: цена в Убеждённости, бросок с риском, итог риска. */
export async function useEdge(actor, key) {
  const e = edgeOf(key), h = actor.system.hunter ?? {};
  if (!e) return null;
  if (freeformOn() && h.sceneEdge !== key) return ui.notifications.warn(t("CallFirst"));
  const conv = h.conviction ?? 0;
  if (e.conviction > conv) return ui.notifications.warn(t("NoConviction", { n: e.conviction }));
  if (!e.roll) {
    // без броска: Нужда — уровень ушибов, Всплеск — пункт Убеждённости, Обновление — само
    if (e.conviction) await actor.update({ "system.hunter.conviction": conv - e.conviction });
    if (key === "martyrdom|1") await actor.applyDamage(1, "bashing");
    return notice(actor, "fa-hand-sparkles", `<b>${esc(e.name)}</b> — ${esc(e.text)}`);
  }
  const attrs = ["strength", "dexterity", "stamina", "charisma", "manipulation", "intelligence", "perception", "wits"];
  const free = h.sceneRisk ? 0 : conv - e.conviction;
  const val = p => !p ? 0 : p.startsWith("hunter.") ? (h[p.slice(7)] ?? 0) : actor.traitValue(p);
  const lab = p => p.startsWith("hunter.") ? H().virtues[p.slice(7)] : actor.traitLabel(p);
  const pick = e.roll.trait1 === "pick";
  const pool = pick
    ? `<select name="attr">${attrs.map(k => `<option value="attributes.${k}">${actor.traitLabel(`attributes.${k}`)} (${actor.traitValue(`attributes.${k}`)})</option>`).join("")}</select>
       <span>+ ${esc(lab(e.roll.trait2))} <b>${val(e.roll.trait2)}</b></span>`
    : `<span>${[e.roll.trait1, e.roll.trait2].filter(Boolean).map(p => `${esc(lab(p))} <b>${val(p)}</b>`).join(" + ")}</span>
       <em>= ${val(e.roll.trait1) + val(e.roll.trait2)}</em>`;
  const content = edgeForm({
    kicker: t("EdgeKicker", { path: creedOf(e.path)?.name ?? e.path, n: e.level }), text: e.text, pool,
    fields: [{ label: t("Difficulty"), name: "diff", value: e.roll.difficulty, min: 2, max: 10 },
      { label: t("Risk"), name: "risk", value: 0, min: 0, max: free, sub: t("RiskLeft", { n: free }) }],
    notes: [e.conviction && t("CostNote", { n: e.conviction }), h.sceneRisk ? t("RiskUsed") : t("RiskNote", { n: free }),
      e.roll.byTarget && t("ByTargetNote")] });
  const v = await foundry.applications.api.DialogV2.prompt({
    window: { title: e.name, icon: "fa-solid fa-hand-sparkles" }, classes: ["vtm20", "r-dialog", "r-edge-dialog"], position: { width: 480 }, content,
    ok: { label: t("Roll"), callback: (ev, btn) => { const f = btn.form.elements;
      return { attr: f.attr?.value ?? e.roll.trait1, diff: Number(f.diff.value) || 6, risk: Math.clamp(Number(f.risk.value) || 0, 0, free) }; } }
  }).catch(() => null);
  if (!v) return null;
  const t1 = v.attr, t2 = e.roll.trait2;
  const breakdown = [t1 && { label: lab(t1), value: val(t1) }, { label: lab(t2), value: val(t2) },
    v.risk && { label: t("Risk"), value: v.risk }].filter(Boolean);
  if (e.conviction || v.risk) await actor.update({ "system.hunter.conviction": conv - e.conviction, ...(v.risk ? { "system.hunter.sceneRisk": true } : {}) });
  const res = await rollPool({ actor, title: e.name, subtitle: t("EdgeKicker", { path: creedOf(e.path)?.name ?? e.path, n: e.level }),
    pool: val(t1) + val(t2) + v.risk, difficulty: v.diff, kind: "check", breakdown, effect: `<p>${esc(e.text)}</p>` });
  if (!v.risk) return res;
  // риск Убеждённостью: успех — вложенное остаётся и +1; неудача — вложенное сгорает; провал — вся Убеждённость
  const now = actor.system.hunter.conviction ?? 0;
  if (res.outcome === "botch") {
    await actor.update({ "system.hunter.conviction": 0 });
    await notice(actor, "fa-heart-crack", t("RiskBotch", { name: esc(actor.name) }), "is-sin");
  } else if (res.successes > 0) {
    await actor.update({ "system.hunter.conviction": Math.min(10, now + 1) });
    await notice(actor, "fa-fire", t("RiskWon", { name: esc(actor.name), n: Math.min(10, now + 1) }));
  } else {
    await actor.update({ "system.hunter.conviction": Math.max(0, now - v.risk) });
    await notice(actor, "fa-arrow-down", t("RiskLost", { name: esc(actor.name), n: v.risk }), "is-sin");
  }
  return res;
}

/** Второе зрение и самообладание на сцену — пункт Убеждённости. */
export async function secondSight(actor) {
  const c = actor.system.hunter?.conviction ?? 0;
  if (c < 1) return ui.notifications.warn(t("NoConviction", { n: 1 }));
  await actor.update({ "system.hunter.conviction": c - 1 });
  return notice(actor, "fa-eye", t("SightOn", { name: esc(actor.name) }));
}

/** Испытание основной Добродетели против древнего чудовища (сл. по выбору рассказчика). */
export async function virtueTest(actor) {
  const h = actor.system.hunter ?? {}, v = creedOf(h.creed)?.virtue ?? "zeal";
  return rollPool({ actor, title: t("VirtueTest"), subtitle: H().virtues[v], pool: h[v] ?? 0, difficulty: 6, kind: "check",
    breakdown: [{ label: H().virtues[v], value: h[v] ?? 0 }], notes: [t("VirtueTestNote")] });
}

/** 10 Убеждённости — пункт Добродетели (основная не ниже остальных); шкала — к начальной по кредо. */
export async function tradeConviction(actor) {
  const h = actor.system.hunter ?? {}, creed = creedOf(h.creed);
  if ((h.conviction ?? 0) < 10) return null;
  const opts = VIRTUE_KEYS.filter(v => canRaise(h, v));
  if (!opts.length) return ui.notifications.warn(t("NoVirtueRoom"));
  const v = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Trade") }, classes: ["vtm20", "r-dialog"], position: { width: 420 }, content: `<p>${t("TradeHow")}</p>`,
    buttons: opts.map((k, i) => ({ action: k, label: H().virtues[k], default: i === 0 }))
  }).catch(() => null);
  if (!v || !opts.includes(v)) return null;
  await actor.update({ [`system.hunter.${v}`]: (h[v] ?? 0) + 1, "system.hunter.conviction": startConviction(actor) });
  return notice(actor, "fa-arrow-up", t("Traded", { name: esc(actor.name), v: H().virtues[v], n: (h[v] ?? 0) + 1 }));
}

/** Начальная Убеждённость в начале истории (если упала ниже; при росте за опыт — и если выросла выше). */
export async function restoreConviction(actor) {
  if (isLost(actor)) return null;                                            // рассудок Свидетеля не возвращается
  const h = actor.system.hunter ?? {}, base = startConviction(actor);
  if (growth() === "xp" && (h.conviction ?? 0) > base) {
    await actor.update({ "system.hunter.conviction": base });
    return notice(actor, "fa-rotate-left", t("Restored", { name: esc(actor.name), n: base }));
  }
  if ((h.conviction ?? 0) >= base) return ui.notifications.info(t("AtBase", { n: base }));
  await actor.update({ "system.hunter.conviction": base });
  return notice(actor, "fa-rotate-left", t("Restored", { name: esc(actor.name), n: base }));
}

/* ── Общие окна ─────────────────────────────────────────────────────────── */
const form = (title, content, label, read, width = 460) => foundry.applications.api.DialogV2.prompt({
  window: { title }, classes: ["vtm20", "r-dialog", "r-edge-dialog"], position: { width }, content,
  ok: { label, callback: (ev, btn) => read(btn.form.elements) } }).catch(() => null);
const pick = (title, content, opts, label) => foundry.applications.api.DialogV2.wait({
  window: { title }, classes: ["vtm20", "r-dialog"], position: { width: 440 }, content,
  buttons: opts.map((k, i) => ({ action: k, label: label(k), default: i === 0 })) }).catch(() => null);
const vOpts = (keys, sel) => keys.map(v => `<option value="${v}" ${v === sel ? "selected" : ""}>${H().virtues[v]}</option>`).join("");

/* ── Деяния (Players Guide, гл. 2): временные Добродетели за поступки; 10 → пункт постоянной ── */

/** Рассказчик награждает поступок временными пунктами Добродетели (1–2, за подвиг — до 3). */
export async function awardDeed(actor) {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  const h = actor.system.hunter ?? {}, pv = creedOf(h.creed)?.virtue;
  const v = await form(t("Deed"), `<p class="r-choice-hint">${t("DeedHow")}</p><div class="r-fields">
    <label class="r-f"><span>${t("Virtue")}</span><select name="v">${vOpts(VIRTUE_KEYS, pv)}</select></label>
    <label class="r-f"><span>${t("Points")}</span><input type="number" name="n" value="1" min="1" max="3"></label>
    <label class="r-f is-span2"><span>${t("Reason")}</span><input type="text" name="why"></label></div>`, t("DeedOk"),
    f => ({ v: f.v.value, n: Math.clamp(Number(f.n.value) || 1, 1, 3), why: f.why.value.trim() }));
  if (!v) return null;
  const now = Math.min(10, (h.temp?.[v.v] ?? 0) + v.n);
  await actor.update({ [`system.hunter.temp.${v.v}`]: now });
  return notice(actor, "fa-award", t("DeedDone", { name: esc(actor.name), v: H().virtues[v.v], n: v.n, total: now, why: v.why ? ` — ${esc(v.why)}` : "" }));
}

/** Два временных основной Добродетели — один другой; нужна причина в игре. */
export async function shiftDeed(actor) {
  const h = actor.system.hunter ?? {}, pv = creedOf(h.creed)?.virtue, have = h.temp?.[pv] ?? 0;
  if (have < 2) return ui.notifications.warn(t("ShiftNeed", { v: H().virtues[pv] }));
  const others = VIRTUE_KEYS.filter(v => v !== pv && !isFrozen(h, v) && (h.temp?.[v] ?? 0) < 10);
  if (!others.length) return ui.notifications.warn(t("NoVirtueRoom"));
  const max = Math.floor(have / 2);
  const v = await form(t("Shift"), `<p class="r-choice-hint">${t("ShiftHow", { v: H().virtues[pv] })}</p><div class="r-fields">
    <label class="r-f"><span>${t("Virtue")}</span><select name="v">${vOpts(others)}</select></label>
    <label class="r-f"><span>${t("Pairs")}</span><input type="number" name="n" value="1" min="1" max="${max}"></label>
    <label class="r-f is-span2"><span>${t("Reason")}</span><input type="text" name="why"></label></div>`, t("ShiftOk"),
    f => ({ v: f.v.value, n: Math.clamp(Number(f.n.value) || 1, 1, max), why: f.why.value.trim() }));
  if (!v) return null;
  if (!v.why) return ui.notifications.warn(t("ShiftWhy"));
  const to = Math.min(10, (h.temp?.[v.v] ?? 0) + v.n);
  await actor.update({ [`system.hunter.temp.${pv}`]: have - 2 * v.n, [`system.hunter.temp.${v.v}`]: to });
  return notice(actor, "fa-right-left", t("ShiftDone", { name: esc(actor.name), from: H().virtues[pv], k: 2 * v.n, v: H().virtues[v.v], n: v.n, why: esc(v.why) }));
}

/** Десять временных — пункт постоянной (в любой момент истории); временная шкала — с нуля. */
export async function cashDeed(actor) {
  const h = actor.system.hunter ?? {}, opts = VIRTUE_KEYS.filter(v => (h.temp?.[v] ?? 0) >= 10 && canRaise(h, v));
  if (!opts.length) return ui.notifications.warn(t("CashNone"));
  const v = opts.length === 1 ? opts[0] : await pick(t("Cash"), `<p>${t("CashHow")}</p>`, opts, k => H().virtues[k]);
  if (!opts.includes(v)) return null;
  await actor.update({ [`system.hunter.${v}`]: (h[v] ?? 0) + 1, [`system.hunter.temp.${v}`]: 0 });
  return notice(actor, "fa-arrow-up", t("Cashed", { name: esc(actor.name), v: H().virtues[v], n: (h[v] ?? 0) + 1 }));
}

/* ── Жертва (Players Guide, гл. 2): точка прежней жизни — очки роста; одна черта — раз за историю ── */
const SAC = { attr: 3, abil: 2, bg: 1 };

function sacrificeOptions(actor) {
  const s = actor.system, done = new Set(s.hunter?.sacrificed ?? []), out = [];
  for (const k of Object.keys(s.attributes ?? {})) {
    const v = s.attributes[k]?.value ?? 0;
    if (v > 1 && !done.has(`attributes.${k}`)) out.push({ key: `attributes.${k}`, group: "attr", label: actor.traitLabel(`attributes.${k}`), v, pts: v * SAC.attr });
  }
  for (const k of Object.keys(s.abilities ?? {})) {
    const v = s.abilities[k]?.value ?? 0;
    if (v > 0 && !done.has(`abilities.${k}`)) out.push({ key: `abilities.${k}`, group: "abil", label: actor.traitLabel(`abilities.${k}`), v, pts: v * SAC.abil });
  }
  for (const i of actor.items.filter(i => i.type === "background" && (i.system.value ?? 0) > 0 && !done.has(`bg:${i.id}`)))
    out.push({ key: `bg:${i.id}`, group: "bg", label: i.name, v: i.system.value, pts: i.system.value * SAC.bg });
  return out;
}

/** Отдать точку Атрибута (прежнее × 3 очков роста), Способности (× 2) или Дополнения (× 1). */
export async function sacrifice(actor) {
  const opts = sacrificeOptions(actor);
  if (!opts.length) return ui.notifications.warn(t("SacNone"));
  const grp = (g, label) => { const o = opts.filter(x => x.group === g);
    return o.length ? `<optgroup label="${label}">${o.map(x => `<option value="${x.key}">${esc(x.label)} ${x.v} → ${x.v - 1} · +${x.pts}</option>`).join("")}</optgroup>` : ""; };
  const v = await form(t("Sacrifice"), `<p class="r-choice-hint">${t("SacHow")}</p><div class="r-fields">
    <label class="r-f is-span2"><span>${t("SacTrait")}</span><select name="k">${grp("attr", t("SacAttr"))}${grp("abil", t("SacAbil"))}${grp("bg", t("SacBg"))}</select></label>
    <label class="r-f is-span2"><span>${t("SacLife")}</span><input type="text" name="why"></label></div>`, t("SacOk"),
    f => ({ k: f.k.value, why: f.why.value.trim() }), 520);
  const o = opts.find(x => x.key === v?.k);
  if (!o) return null;
  const h = actor.system.hunter ?? {};
  if (o.group === "bg") await actor.items.get(o.key.slice(3))?.update({ "system.value": o.v - 1 });
  await actor.update({ ...(o.group === "bg" ? {} : { [`system.${o.key}.value`]: o.v - 1 }),
    "system.hunter.advance": (h.advance ?? 0) + o.pts, "system.hunter.sacrificed": [...(h.sacrificed ?? []), o.key] });
  return notice(actor, "fa-fire-flame-simple", t("SacDone", { name: esc(actor.name), trait: esc(o.label), from: o.v, to: o.v - 1, n: o.pts,
    total: (h.advance ?? 0) + o.pts, why: v.why ? ` — ${esc(v.why)}` : "" }), "is-sin");
}

/** Очки роста — в Добродетель: основная — новое × 2, прочие — × 3. */
export async function advanceVirtue(actor) {
  const h = actor.system.hunter ?? {}, pv = creedOf(h.creed)?.virtue, pts = h.advance ?? 0;
  const cost = v => ((h[v] ?? 0) + 1) * (v === pv ? 2 : 3);
  const opts = VIRTUE_KEYS.filter(v => canRaise(h, v) && cost(v) <= pts);
  if (!opts.length) return ui.notifications.warn(t("AdvNone", { n: pts }));
  const v = await pick(t("Advance"), `<p>${t("AdvHow", { n: pts })}</p>`, opts, k => `${H().virtues[k]} ${(h[k] ?? 0) + 1} · −${cost(k)}`);
  if (!opts.includes(v)) return null;
  await actor.update({ [`system.hunter.${v}`]: (h[v] ?? 0) + 1, "system.hunter.advance": pts - cost(v) });
  return notice(actor, "fa-angles-up", t("AdvDone", { name: esc(actor.name), v: H().virtues[v], n: (h[v] ?? 0) + 1, left: pts - cost(v) }));
}

/* ── Грани «свыше» (Players Guide, гл. 2): своих нет — пункт Убеждённости и бросок Добродетели на сцену ── */

/** Что можно получить: уровень по Добродетели (V — нет), сумма уровней за историю не больше Добродетели. */
function callable(actor) {
  const h = actor.system.hunter ?? {};
  return H().edges.filter(e => { const v = h[e.virtue] ?? 0;
    return e.level < 5 && e.level <= levelCap(v) && (h.story?.[e.virtue] ?? 0) + edgeCost(e.level) <= v; });
}

/** Воззвать: Грань сцены не выше числа успехов; неудача — до конца сцены нельзя (пункт цел), провал — до конца сессии. */
export async function callEdge(actor, wantKey = "") {
  const h = actor.system.hunter ?? {}, conv = h.conviction ?? 0, V = H().virtues, pv = creedOf(h.creed)?.virtue;
  if (h.sessionBlock) return ui.notifications.warn(t("CallSession"));
  if (h.sceneBlock) return ui.notifications.warn(t("CallScene"));
  if (h.sceneEdge) return ui.notifications.warn(t("CallHave", { edge: edgeOf(h.sceneEdge)?.name ?? "" }));
  if (conv < 1) return ui.notifications.warn(t("NoConviction", { n: 1 }));
  const list = callable(actor), want0 = edgeOf(wantKey);
  const groups = VIRTUE_KEYS.filter(v => list.some(e => e.virtue === v)).map(v => `<optgroup label="${V[v]} · ${t("CallLeft", { n: (h[v] ?? 0) - (h.story?.[v] ?? 0) })}">
    <option value="v:${v}" ${!want0 && v === pv ? "selected" : ""}>${t("CallAny", { v: V[v] })}</option>${list.filter(e => e.virtue === v).map(e =>
      `<option value="${e.key}" ${e.key === wantKey ? "selected" : ""}>${ROMAN[e.level]} · ${esc(e.name)} (${esc(creedOf(e.path)?.name ?? e.path)})</option>`).join("")}</optgroup>`).join("");
  if (!groups) return ui.notifications.warn(t("CallSpent"));
  const free = h.sceneRisk ? 0 : conv - 1;
  const v = await form(t("Call"), edgeForm({ kicker: t("ConvNow", { n: conv }), text: t("CallHow"),
    pool: `<select name="want">${groups}</select>`, poolLabel: t("CallWant"),
    fields: [{ label: t("Risk"), name: "risk", value: 0, min: 0, max: free, sub: t("RiskLeft", { n: free }) }],
    notes: [h.sceneRisk ? t("RiskUsed") : t("RiskNote", { n: free })] }), t("Roll"),
    f => ({ want: f.want.value, risk: Math.clamp(Number(f.risk.value) || 0, 0, free) }), 500);
  if (!v) return null;
  const want = v.want.startsWith("v:") ? null : edgeOf(v.want), virtue = want?.virtue ?? v.want.slice(2), name = esc(actor.name);
  await actor.update({ "system.hunter.conviction": conv - 1, ...(v.risk ? { "system.hunter.sceneRisk": true } : {}) });
  const res = await rollPool({ actor, title: t("Call"), subtitle: want ? want.name : t("CallAny", { v: V[virtue] }), pool: (h[virtue] ?? 0) + v.risk,
    difficulty: 6, kind: "check", breakdown: [{ label: V[virtue], value: h[virtue] ?? 0 }, v.risk && { label: t("Risk"), value: v.risk }].filter(Boolean) });
  const now = actor.system.hunter.conviction ?? 0;
  if (res.outcome === "botch") {
    await actor.update({ "system.hunter.sessionBlock": true, ...(v.risk ? { "system.hunter.conviction": 0 } : {}) });
    return notice(actor, "fa-cloud-bolt", t("CallBotch", { name }), "is-sin");
  }
  if (res.successes <= 0) {
    await actor.update({ "system.hunter.sceneBlock": true, "system.hunter.conviction": Math.max(0, now + 1 - v.risk) });
    return notice(actor, "fa-ban", t("CallFail", { name }), "is-sin");
  }
  // успехи — предел уровня: желанная Грань, если дотягивает; иначе — ниже по тому же пути; без пожелания — высшая доступная (путь кредо первым)
  const s = res.successes, fits = e => e.virtue === virtue && e.level <= s && list.includes(e);
  let got = want && fits(want) ? want : want ? list.filter(e => e.path === want.path && fits(e)).sort((a, b) => b.level - a.level)[0] : null;
  got ??= list.filter(fits).sort((a, b) => b.level - a.level || (b.path === h.creed) - (a.path === h.creed))[0];
  if (!got) return notice(actor, "fa-ban", t("CallFail", { name }), "is-sin");
  await actor.update({ "system.hunter.sceneEdge": got.key, "system.hunter.sceneLevel": s,
    [`system.hunter.story.${virtue}`]: (h.story?.[virtue] ?? 0) + edgeCost(got.level), "system.hunter.edges": [...new Set([...(h.edges ?? []), got.key])],
    ...(v.risk ? { "system.hunter.conviction": Math.min(10, now + 1) } : {}) });
  return notice(actor, "fa-hand-sparkles", t("CallGot", { name, edge: esc(got.name), n: s }) + (want && got !== want ? " " + t("CallLess", { want: esc(want.name) }) : ""));
}

/** Рассказчик выбирает другую Грань сцены (той же Добродетели, не выше числа успехов). */
export async function swapCalled(actor) {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  const h = actor.system.hunter ?? {}, cur = edgeOf(h.sceneEdge);
  if (!cur) return null;
  const room = (h[cur.virtue] ?? 0) - (h.story?.[cur.virtue] ?? 0) + edgeCost(cur.level);
  const opts = H().edges.filter(e => e.virtue === cur.virtue && e.level < 5 && e.level <= Math.min(h.sceneLevel || 1, levelCap(h[cur.virtue] ?? 0)) && edgeCost(e.level) <= room);
  const v = await form(t("Swap"), `<div class="r-fields"><label class="r-f is-span2"><span>${t("Edge")}</span><select name="k">${opts.map(e =>
    `<option value="${e.key}" ${e.key === cur.key ? "selected" : ""}>${ROMAN[e.level]} · ${esc(e.name)} (${esc(creedOf(e.path)?.name ?? e.path)})</option>`).join("")}</select></label></div>`,
    t("SwapOk"), f => f.k.value);
  const e = edgeOf(v);
  if (!e || e.key === cur.key) return null;
  await actor.update({ "system.hunter.sceneEdge": e.key, [`system.hunter.story.${e.virtue}`]: (h.story?.[e.virtue] ?? 0) - edgeCost(cur.level) + edgeCost(e.level),
    "system.hunter.edges": [...new Set([...(h.edges ?? []), e.key])] });
  return notice(actor, "fa-shuffle", t("Swapped", { name: esc(actor.name), edge: esc(e.name) }));
}

/** Рассказчик снимает запрет воззваний (новая сессия). */
export async function unblockCall(actor) {
  if (!game.user.isGM) return null;
  return actor.update({ "system.hunter.sessionBlock": false, "system.hunter.sceneBlock": false });
}

/** Панель воззвания на вкладке Граней. */
export function callView(actor) {
  if (!freeformOn()) return null;
  const h = actor.system.hunter ?? {}, e = edgeOf(h.sceneEdge);
  return { scene: e ? { ...e, pool: poolLabel(actor, e) } : null, block: h.sessionBlock ? t("CallSession") : h.sceneBlock ? t("CallScene") : "",
    budget: VIRTUE_KEYS.map(v => ({ label: H().virtues[v], used: h.story?.[v] ?? 0, value: h[v] ?? 0 })), isGM: game.user.isGM };
}

/* ── Конец сцены и истории (кнопки рассказчика в каталоге персонажей) ─────── */

/** Конец сцены: Грань «свыше», запрет после неудачи и риск Убеждённостью — заново. */
export async function hunterSceneEnd(actor) {
  const h = actor.system.hunter ?? {};
  if (h.sceneEdge || h.sceneBlock || h.sceneRisk)
    await actor.update({ "system.hunter.sceneEdge": "", "system.hunter.sceneLevel": 0, "system.hunter.sceneBlock": false, "system.hunter.sceneRisk": false });
}

/** Конец истории: Убеждённость — к начальной (при росте за опыт — и сверху вниз), счёт воззваний и жертв — заново, Вестники снова слушают. */
export async function hunterStoryEnd(actor) {
  const h = actor.system.hunter ?? {}, base = startConviction(actor), c = h.conviction ?? 0;
  await actor.update({ "system.hunter.conviction": isLost(actor) ? c : growth() === "xp" ? base : Math.max(c, base),
    "system.hunter.story": { mercy: 0, vision: 0, zeal: 0 }, "system.hunter.sacrificed": [], "system.hunter.sessionBlock": false,
    "system.hunter.sceneEdge": "", "system.hunter.sceneLevel": 0, "system.hunter.sceneBlock": false, "system.hunter.sceneRisk": false });
}

/* ── Свидетели (Players Guide, гл. 1) ───────────────────────────────────── */
const today = () => new Date().toDateString();
/** Психозы Свидетеля по Убеждённости: 3 → один, 2 → два, 1 → три. */
const lostMad = c => c > 0 ? Math.max(0, 4 - c) : 0;

/** Карточка Свидетеля: Убеждённость-рассудок, Смелость, Рассудок, Самоконтроль. */
export function lostInfo(actor, dots) {
  const h = actor.system.hunter ?? {}, b = h.bystander ?? {}, c = h.conviction ?? 10, V = H().bystander?.virtues ?? {};
  return {
    lost: true, conviction: c, convDots: dots(c, 10, { path: "system.hunter.conviction" }), madness: lostMad(c), broken: c <= 0,
    canTrade: (h.tradedOn ?? "") !== today() && c < 10 && LOST_KEYS.some(k => (b[k] ?? 0) > 0),
    virtues: LOST_KEYS.map(k => ({ key: k, label: V[k] ?? k, value: b[k] ?? 0, when: t(`LostWhen.${k}`),
      dots: dots(b[k] ?? 0, 5, { path: `system.hunter.bystander.${k}` }) }))
  };
}

/** Бросок Добродетели Свидетеля: Смекалка + Добродетель, сл. 7. Неудача — −1 Убеждённости, провал — ещё и −1 Добродетели, паника. */
export async function lostVirtue(actor, key) {
  const h = actor.system.hunter ?? {}, b = h.bystander ?? {}, V = H().bystander?.virtues ?? {};
  if (!LOST_KEYS.includes(key)) return null;
  const v = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("LostRoll", { v: V[key] }) }, classes: ["vtm20", "r-dialog"], position: { width: 440 },
    content: `<p class="r-choice-hint">${t(`LostWhen.${key}`)}</p><div class="r-fields">
      <label class="r-f"><span>${t("Difficulty")}</span><input type="number" name="diff" value="7" min="3" max="10"></label></div>
      <p class="r-note">${t("LostRollNote")}</p>`,
    ok: { label: t("Roll"), callback: (ev, btn) => Number(btn.form.elements.diff.value) || 7 }
  }).catch(() => null);
  if (!v) return null;
  const wits = actor.traitValue("attributes.wits"), val = b[key] ?? 0;
  const res = await rollPool({ actor, title: t("LostRoll", { v: V[key] }), subtitle: t("LostKicker"), pool: wits + val, difficulty: v, kind: "check",
    breakdown: [{ label: actor.traitLabel("attributes.wits"), value: wits }, { label: V[key], value: val }] });
  if (res.successes > 0 && res.outcome !== "botch") return res;
  const c = Math.max(0, (h.conviction ?? 10) - 1), botch = res.outcome === "botch";
  await actor.update({ "system.hunter.conviction": c, ...(botch ? { [`system.hunter.bystander.${key}`]: Math.max(0, val - 1) } : {}) });
  const name = esc(actor.name);
  await notice(actor, botch ? "fa-person-running" : "fa-brain", botch ? t("LostBotch", { name, v: V[key], n: c }) : t("LostFail", { name, n: c }), "is-sin");
  if (c <= 0) await notice(actor, "fa-skull", t("LostBroken", { name }), "is-sin");
  else if (c <= 3) await notice(actor, "fa-brain", t("LostMad", { name, n: lostMad(c) }), "is-sin");
  return res;
}

/** Раз за сессию (день): пункт Добродетели — за пункт Убеждённости. */
export async function lostTrade(actor) {
  const h = actor.system.hunter ?? {}, b = h.bystander ?? {}, V = H().bystander?.virtues ?? {};
  if ((h.tradedOn ?? "") === today()) return ui.notifications.warn(t("LostTraded"));
  if ((h.conviction ?? 10) >= 10) return ui.notifications.info(t("LostFull"));
  const opts = LOST_KEYS.filter(k => (b[k] ?? 0) > 0);
  if (!opts.length) return null;
  const k = await foundry.applications.api.DialogV2.wait({
    window: { title: t("LostTrade") }, classes: ["vtm20", "r-dialog"], position: { width: 420 }, content: `<p>${t("LostTradeHow")}</p>`,
    buttons: opts.map((x, i) => ({ action: x, label: `${V[x]} ${b[x]} → ${b[x] - 1}`, default: i === 0 }))
  }).catch(() => null);
  if (!opts.includes(k)) return null;
  const c = Math.min(10, (h.conviction ?? 10) + 1);
  await actor.update({ [`system.hunter.bystander.${k}`]: b[k] - 1, "system.hunter.conviction": c, "system.hunter.tradedOn": today() });
  return notice(actor, "fa-scale-unbalanced", t("LostTradeDone", { name: esc(actor.name), v: V[k], n: c }));
}

/** Закалённый дух: пункт Силы воли — на сцену не бежать от чудовища и устоять перед властью над разумом и телом. */
export async function lostHardened(actor) {
  if (!(await actor.spendWillpower(1))) return null;
  return notice(actor, "fa-shield-halved", t("LostHardenedOn", { name: esc(actor.name) }));
}

/** Общая беда: Восприятие, сл. 6 — узнать другого Свидетеля или охотника. */
export async function lostOrdeal(actor) {
  const p = actor.traitValue("attributes.perception");
  return rollPool({ actor, title: t("LostOrdeal"), subtitle: t("LostKicker"), pool: p, difficulty: 6, kind: "check",
    breakdown: [{ label: actor.traitLabel("attributes.perception"), value: p }], notes: [t("LostOrdealNote")] });
}
