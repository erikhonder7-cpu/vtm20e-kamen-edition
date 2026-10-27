// module/apps/hunter.mjs
// Охотник: Расплата (основная книга, гл. 4–5; пересказ — data/hunter.json, глава правил «Охотник: Расплата»).
// Охотник — смертный в режиме наделённого (system.hunter.creed): кредо, Добродетели Милосердие / Прозрение / Рвение (0–10),
// Убеждённость 0–10 (начальная — по кредо), Грани — ключи «путь|уровень» в system.hunter.edges.
//   · Грань стоит очков своей Добродетели по уровню; сумма уровней Граней одной Добродетели не больше её значения;
//     уровни пути — по порядку; Грани чужих путей не выше высшей Грани пути кредо.
//   · Бросок Грани — Атрибут + Добродетель (сложность обычно 6); раз за сцену можно рискнуть Убеждённостью — кубик за пункт:
//     успех — вложенное остаётся и +1, неудача — вложенное пропадает, провал — пропадает вся Убеждённость.
//   · Пункт Убеждённости на сцену — второе зрение и защита разума и тела; 10 Убеждённости можно обменять на пункт Добродетели.

import { rollPool } from "../dice/roll.mjs";
import { Codex } from "../data/codex.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Hunter.${k}`, d) : game.i18n.localize(`VTM20.Hunter.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
export const VIRTUE_KEYS = ["mercy", "vision", "zeal"];
const notice = (actor, icon, html, cls = "") => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-hunter ${cls}"><i class="fa-solid ${icon}"></i> ${html}</div>` });

export const H = () => Codex.hunter ?? { creeds: [], edges: [], virtues: {} };
export const creedOf = key => H().creeds.find(c => c.key === key) ?? null;
export const edgeOf = key => H().edges.find(e => e.key === key) ?? null;

/** Грани персонажа (данные справочника) по порядку путей и уровней. */
export function edgesOf(actor) {
  return (actor.system.hunter?.edges ?? []).map(edgeOf).filter(Boolean);
}

/** Бюджет Граней: по Добродетели — сумма уровней и значение; высшая Грань пути кредо. */
export function edgeBudget(actor) {
  const h = actor.system.hunter ?? {}, own = edgesOf(actor);
  const used = Object.fromEntries(VIRTUE_KEYS.map(v => [v, own.filter(e => e.virtue === v).reduce((s, e) => s + e.level, 0)]));
  const top = Math.max(0, ...own.filter(e => e.path === h.creed).map(e => e.level));
  return { used, top, over: VIRTUE_KEYS.filter(v => used[v] > (h[v] ?? 0)) };
}

/** Можно ли взять Грань: причины отказа (пусто — можно). */
export function edgeReasons(actor, key) {
  const e = edgeOf(key), h = actor.system.hunter ?? {};
  if (!e) return [t("NoEdge")];
  const have = new Set(h.edges ?? []), out = [];
  if (have.has(key)) return [];
  if (e.level > 1 && !have.has(`${e.path}|${e.level - 1}`)) out.push(t("NeedPrev", { n: e.level - 1 }));
  const b = edgeBudget(actor);
  if (b.used[e.virtue] + e.level > (h[e.virtue] ?? 0)) out.push(t("NeedVirtue", { v: H().virtues[e.virtue], n: b.used[e.virtue] + e.level }));
  if (e.path !== h.creed && e.level > b.top) out.push(t("NeedCreed", { n: b.top }));
  if (e.level >= 5) out.push(t("FifthLevel"));
  return out;
}

/** Контекст карточки охотника на листе. */
export function hunterInfo(actor, dots) {
  const h = actor.system.hunter ?? {}, creed = creedOf(h.creed), b = edgeBudget(actor);
  return {
    creed, creedName: creed ? `${creed.name} · ${creed.who}` : "", creedVirtue: creed?.virtue ?? "",
    conviction: h.conviction ?? 0, base: creed?.conviction ?? h.base ?? 3,
    convDots: dots(h.conviction ?? 0, 10, { path: "system.hunter.conviction" }), canTrade: (h.conviction ?? 0) >= 10,
    virtues: VIRTUE_KEYS.map(v => ({ key: v, label: H().virtues[v], value: h[v] ?? 0, primary: creed?.virtue === v,
      dots: dots(h[v] ?? 0, 10, { path: `system.hunter.${v}` }), used: b.used[v], over: b.used[v] > (h[v] ?? 0),
      madness: Math.max(0, (h[v] ?? 0) - 6) })),
    madness: VIRTUE_KEYS.reduce((s, v) => s + Math.max(0, (h[v] ?? 0) - 6), 0)
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
  const conv = h.conviction ?? 0;
  if (e.conviction > conv) return ui.notifications.warn(t("NoConviction", { n: e.conviction }));
  if (!e.roll) {
    // без броска: Нужда — уровень ушибов, Всплеск — пункт Убеждённости, Обновление — само
    if (e.conviction) await actor.update({ "system.hunter.conviction": conv - e.conviction });
    if (key === "martyrdom|1") await actor.applyDamage(1, "bashing");
    return notice(actor, "fa-hand-sparkles", `<b>${esc(e.name)}</b> — ${esc(e.text)}`);
  }
  const attrs = ["strength", "dexterity", "stamina", "charisma", "manipulation", "intelligence", "perception", "wits"];
  const free = conv - e.conviction;
  const content = `<p class="r-choice-hint">${esc(e.text)}</p><div class="r-fields">
    ${e.roll.trait1 === "pick" ? `<label class="r-f is-span2"><span>${t("Attribute")}</span><select name="attr">${attrs.map(k => `<option value="attributes.${k}">${actor.traitLabel(`attributes.${k}`)}</option>`).join("")}</select></label>` : ""}
    <label class="r-f"><span>${t("Difficulty")}</span><input type="number" name="diff" value="${e.roll.difficulty}" min="2" max="10"></label>
    <label class="r-f"><span>${t("Risk")}</span><input type="number" name="risk" value="0" min="0" max="${free}"></label></div>
    <p class="r-note">${e.conviction ? t("CostNote", { n: e.conviction }) + " " : ""}${t("RiskNote", { n: free })}${e.roll.byTarget ? " " + t("ByTargetNote") : ""}</p>`;
  const v = await foundry.applications.api.DialogV2.prompt({
    window: { title: e.name }, classes: ["vtm20", "r-dialog"], position: { width: 460 }, content,
    ok: { label: t("Roll"), callback: (ev, btn) => { const f = btn.form.elements;
      return { attr: f.attr?.value ?? e.roll.trait1, diff: Number(f.diff.value) || 6, risk: Math.clamp(Number(f.risk.value) || 0, 0, free) }; } }
  }).catch(() => null);
  if (!v) return null;
  const t1 = v.attr, t2 = e.roll.trait2;
  const val = p => !p ? 0 : p.startsWith("hunter.") ? (h[p.slice(7)] ?? 0) : actor.traitValue(p);
  const lab = p => p.startsWith("hunter.") ? H().virtues[p.slice(7)] : actor.traitLabel(p);
  const breakdown = [t1 && { label: lab(t1), value: val(t1) }, { label: lab(t2), value: val(t2) },
    v.risk && { label: t("Risk"), value: v.risk }].filter(Boolean);
  if (e.conviction) await actor.update({ "system.hunter.conviction": conv - e.conviction });
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
  const opts = VIRTUE_KEYS.filter(v => (h[v] ?? 0) < 10 && (v === creed?.virtue || (h[v] ?? 0) < (h[creed?.virtue] ?? 0)));
  if (!opts.length) return ui.notifications.warn(t("NoVirtueRoom"));
  const v = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Trade") }, classes: ["vtm20", "r-dialog"], position: { width: 420 }, content: `<p>${t("TradeHow")}</p>`,
    buttons: opts.map((k, i) => ({ action: k, label: H().virtues[k], default: i === 0 }))
  }).catch(() => null);
  if (!v || !opts.includes(v)) return null;
  await actor.update({ [`system.hunter.${v}`]: (h[v] ?? 0) + 1, "system.hunter.conviction": creed?.conviction ?? 3 });
  return notice(actor, "fa-arrow-up", t("Traded", { name: esc(actor.name), v: H().virtues[v], n: (h[v] ?? 0) + 1 }));
}

/** Начальная Убеждённость в начале истории (если упала ниже). */
export async function restoreConviction(actor) {
  const h = actor.system.hunter ?? {}, base = creedOf(h.creed)?.conviction ?? 3;
  if ((h.conviction ?? 0) >= base) return ui.notifications.info(t("AtBase", { n: base }));
  await actor.update({ "system.hunter.conviction": base });
  return notice(actor, "fa-rotate-left", t("Restored", { name: esc(actor.name), n: base }));
}
