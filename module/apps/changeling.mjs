// module/apps/changeling.mjs
// Подменыш (Changeling: The Dreaming 20th, C20) — данные data/changeling.json (tools/changeling_data.py):
//   · Темперы (гл. 6): Гламур (постоянный и временный), Банальность (рейтинг и пул; пул выше Гламура — Туманы),
//     Кошмар 0–10 (10 — Дисбаланс: Кошмар обнуляется, клетка Воли отмечена, +1 Гламур; вся Воля в Дисбалансе — Бедлам).
//   · Кантрип (гл. 4): Искусство + Царства; пул — Искусство + наименьшее основное Царство (Актёр, Фэ, Природа, Предмет);
//     Сцена и Время — по +1 к сложности; сл. 8; Вирд — 1 Гламур, «жульничество» Царством (его нет) — +1 Гламур за каждое;
//     кубиков Кошмара — рейтинг Кошмара (не больше пула), каждая 10 на них — +1 Кошмар; ещё 3 кубика Кошмара — −1 к сложности;
//     обряд-условие −1…−5; склонность кита −1; ботч — +1 Кошмар. Сложность — от 3 до 10 (правило системы, как у магов).
//   · Высвобождение: 2 Гламура и +1 Кошмар до броска; Гламур + Кошмар кубиков, сл. 7; исход — по успехам и рейтингу Искусства.

import { Codex } from "../data/codex.mjs";
import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { registerEmblem, registerCardBlock } from "../ui/themes.mjs";

export const C = () => Codex.changeling ?? { arts: [], realms: [], kiths: [], seemings: [], houses: [], legacies: [], backgrounds: [] };
export const t = (k, d) => d ? game.i18n.format(`VTM20.Changeling.${k}`, d) : game.i18n.localize(`VTM20.Changeling.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const PRIMARY = ["actor", "fae", "nature", "prop"], MODIFIERS = ["scene", "time"];
export const CHANGELING_SIGIL = "systems/vtm20e-kamen-edition/assets/ui/changeling-sigil.svg";
export const say = (actor, icon, html, cls = "") => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-changeling ${cls}"><i class="fa-solid ${icon}"></i> ${html}</div>` });

export const artOf = key => C().arts.find(a => a.key === key) ?? null;
export const realmOf = key => C().realms.find(r => r.key === key) ?? null;
export const kithOf = key => C().kiths.find(k => k.key === key) ?? null;

/* ── Лист ──────────────────────────────────────────────────────────────── */

/** Шапка и карточка «Грёза»: кит, ступень, Дом, двор, Наследия; Гламур, Банальность, Кошмар, Дисбаланс. */
export function changelingInfo(actor, dots) {
  const s = actor.system, c = s.changeling, D = C();
  const opts = (list, cur) => list.map(x => ({ key: x.key, name: x.name, selected: x.key === cur }));
  const kith = kithOf(c.kith), house = D.houses.find(h => h.key === c.house) ?? null, seeming = D.seemings.find(x => x.key === c.seeming) ?? null;
  const legacy = court => D.legacies.find(l => l.key === c.legacies[court]) ?? null;
  const boxes = (n, max, path) => Array.from({ length: max }, (_, i) => ({ n: i + 1, filled: i < n, path }));
  const will = s.willpower.permanent;
  return {
    kiths: opts(D.kiths, c.kith), seemings: opts(D.seemings, c.seeming), houses: opts(D.houses, c.house),
    legaciesSeelie: opts(D.legacies.filter(l => l.court === "seelie"), c.legacies.seelie),
    legaciesUnseelie: opts(D.legacies.filter(l => l.court === "unseelie"), c.legacies.unseelie),
    courts: ["seelie", "unseelie"].map(k => ({ key: k, name: t(`Court.${k}`), selected: k === c.court })),
    kith, house, seeming, court: t(`Court.${c.court || "seelie"}`), legacy: legacy(c.court || "seelie"), legacyOther: legacy(c.court === "unseelie" ? "seelie" : "unseelie"),
    affinity: kith?.affinity ? realmOf(kith.affinity)?.name ?? "" : "",
    glamour: c.glamour.temporary, glamourPerm: c.glamour.permanent,
    glamourDots: dots(c.glamour.permanent, 10, { path: "system.changeling.glamour.permanent" }),
    glamourBoxes: boxes(c.glamour.temporary, 10, "system.changeling.glamour.temporary"),
    banality: c.banality.permanent, banalityPool: c.banality.temporary,
    banalityDots: dots(c.banality.permanent, 10, { path: "system.changeling.banality.permanent" }),
    banalityBoxes: boxes(c.banality.temporary, 10, "system.changeling.banality.temporary"),
    nightmare: c.nightmare, nightmareBoxes: boxes(c.nightmare, 10, "system.changeling.nightmare"),
    imbalance: c.imbalance, imbalanceWill: Array.from({ length: will }, (_, i) => ({ on: i >= will - c.imbalance })),
    mists: c.mists, undone: c.undone, bedlam: c.bedlam, isGM: game.user.isGM
  };
}

/** Вкладка «Искусства»: свои Искусства с уровнями (тип — химерический / Вирд), Царства со ступенями целей. */
export function artsView(actor, dots) {
  const c = actor.system.changeling, kith = kithOf(c.kith);
  const own = C().arts.filter(a => (c.arts[a.key] ?? 0) > 0).map(a => {
    const value = c.arts[a.key];
    return { key: a.key, name: a.name, en: a.en, value, html: a.html, unleashing: a.unleashing, bunks: a.bunks,
      dots: dots(value, 5, { path: `system.changeling.arts.${a.key}` }), xp: actor.xpCost("art", value),
      levels: a.levels.map((l, i) => ({ ...l, i, known: l.level <= value, typeLabel: l.type ? t(`Type.${l.type}`) : "" })) };
  });
  const realms = C().realms.map(r => {
    const value = c.realms[r.key] ?? 0;
    return { key: r.key, name: r.name, en: r.en, modifier: r.modifier, value, affinity: kith?.affinity === r.key,
      dots: dots(value, 5, { path: `system.changeling.realms.${r.key}` }), xp: actor.xpCost("realm", value),
      levels: r.levels.map(l => ({ ...l, known: l.level <= value })) };
  });
  return { own, realms, avail: C().arts.filter(a => !(c.arts[a.key] > 0)).map(a => ({ key: a.key, label: a.name })),
    nightmare: c.nightmare, glamour: c.glamour.temporary };
}

/** Добавить или убрать Искусство (кнопка вкладки). */
export function artRow(actor, op, key) {
  if (!key) return null;
  return actor.update({ [`system.changeling.arts.${key}`]: op === "del" ? 0 : Math.max(1, actor.system.changeling.arts[key] ?? 0) });
}

/* ── Гламур, Банальность, Кошмар ──────────────────────────────────────── */

export async function spendGlamour(actor, n = 1) {
  const g = actor.system.changeling.glamour.temporary;
  if (g < n) { ui.notifications.warn(t("NoGlamour", { n })); return false; }
  await actor.update({ "system.changeling.glamour.temporary": g - n });
  return true;
}
export async function gainGlamour(actor, n = 1) {
  const g = actor.system.changeling.glamour, now = Math.min(g.permanent, g.temporary + n);
  if (now !== g.temporary) await actor.update({ "system.changeling.glamour.temporary": now });
  return now - g.temporary;
}

/**
 * Кошмар +n (гл. 6): на 10 — Дисбаланс: Кошмар обнуляется, отмечается клетка Воли, возвращается 1 Гламур;
 * вся Воля в Дисбалансе — подменыш потерян для Бедлама.
 */
export async function gainNightmare(actor, n = 1, { reason = "" } = {}) {
  if (!n) return 0;
  const c = actor.system.changeling;
  let nm = c.nightmare + n, imb = c.imbalance, turns = 0;
  while (nm >= 10) { nm -= 10; imb++; turns++; }
  const upd = { "system.changeling.nightmare": Math.max(0, nm), "system.changeling.imbalance": Math.min(imb, actor.system.willpower.permanent) };
  if (turns) upd["system.changeling.glamour.temporary"] = Math.min(c.glamour.permanent, c.glamour.temporary + turns);
  await actor.update(upd);
  if (turns) await say(actor, "fa-masks-theater", t(actor.system.changeling.bedlam ? "BedlamLost" : "ImbalanceGained", { name: esc(actor.name), n: actor.system.changeling.imbalance }), "is-warn");
  else if (reason) await say(actor, "fa-moon", t("NightmareGained", { name: esc(actor.name), n, total: actor.system.changeling.nightmare, reason: esc(reason) }));
  return n;
}

/** Триггер Банальности (гл. 6): бросок Гламура, сл. 8; провал — +1 к пулу, ботч — по 1 за каждую единицу. */
export async function banalityTrigger(actor) {
  const { rollPool } = await import("../dice/roll.mjs"), c = actor.system.changeling;
  const roll = await rollPool({ actor, title: t("TriggerTitle"), subtitle: t("TriggerSub"), pool: c.glamour.permanent, difficulty: C().banality?.triggerDiff ?? 8,
    kind: "check", breakdown: [{ label: t("Glamour"), value: c.glamour.permanent }], extra: { changeling: { kind: "trigger" } } });
  if (!roll) return null;
  const gain = roll.outcome === "botch" ? roll.state.values.filter(v => v === 1).length : roll.successes > 0 ? 0 : 1;
  if (gain) await addBanality(actor, gain);
  return roll;
}
/** Пул Банальности +n; больше 10 — рейтинг растёт (гл. 6). */
export async function addBanality(actor, n) {
  const b = actor.system.changeling.banality;
  let pool = b.temporary + n, perm = b.permanent;
  while (pool > 10) { pool -= 10; perm++; }
  await actor.update({ "system.changeling.banality.temporary": Math.max(0, pool), "system.changeling.banality.permanent": Math.min(10, perm) });
  if (perm >= 10) await say(actor, "fa-snowflake", t("Undone", { name: esc(actor.name) }), "is-warn");
}

/* ── Кантрип ───────────────────────────────────────────────────────────── */

/**
 * Окно кантрипа: Искусство и уровень, Царства (основные и модификаторы), Вирд или химерический, обряд-условие,
 * модификаторы сложности, добровольные кубики Кошмара. Гламур — до броска.
 */
export async function castCantrip(actor, preset = {}) {
  if (!actor?.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: actor?.name ?? "" }));
  const c = actor.system.changeling, arts = C().arts.filter(a => (c.arts[a.key] ?? 0) > 0);
  if (!arts.length) return ui.notifications.warn(t("NoArts"));
  const art0 = arts.find(a => a.key === preset.art) ?? arts[0], kith = kithOf(c.kith), R = C().cantrip ?? {};
  const realmBox = r => `<label class="r-check" data-tooltip="${esc(r.levels.find(l => l.level === (c.realms[r.key] || 1))?.name ?? "")}">
      <input type="checkbox" name="r_${r.key}" ${preset.realms?.includes(r.key) ? "checked" : ""}> ${esc(r.name)} <small>${c.realms[r.key] ?? 0}${kith?.affinity === r.key ? " ★" : ""}</small></label>`;
  const mods = (R.mods ?? []).filter(m => m.key !== "affinity");
  const content = `<div class="r-form r-cantrip">
    <label class="r-field"><span>${esc(t("Art"))}</span><select name="art">${arts.map(a => `<option value="${a.key}" ${a.key === art0.key ? "selected" : ""}>${esc(a.name)} (${c.arts[a.key]})</option>`).join("")}</select></label>
    <label class="r-field"><span>${esc(t("Level"))}</span><input type="number" name="level" min="1" max="5" value="${Math.min(preset.level ?? c.arts[art0.key], c.arts[art0.key])}"></label>
    <div class="r-field"><span>${esc(t("Realms"))}</span><div class="r-checks">${C().realms.filter(r => PRIMARY.includes(r.key)).map(realmBox).join("")}</div></div>
    <div class="r-field"><span>${esc(t("Modifiers"))}</span><div class="r-checks">${C().realms.filter(r => MODIFIERS.includes(r.key)).map(realmBox).join("")}</div></div>
    <label class="r-field"><span>${esc(t("Kind"))}</span><select name="wyrd"><option value="0">${esc(t("Type.chimerical"))}</option><option value="1" ${preset.wyrd ? "selected" : ""}>${esc(t("Type.wyrd"))}</option></select></label>
    <label class="r-field"><span>${esc(t("Bunk"))}</span><select name="bunk">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}">${n ? `−${n}` : "—"}</option>`).join("")}</select></label>
    <div class="r-field"><span>${esc(t("DiffMods"))}</span><div class="r-checks">${mods.map(m => `<label class="r-check"><input type="checkbox" name="m_${m.key}"> ${esc(t(`Mod.${m.key}`))} <small>${m.n > 0 ? "+" : "−"}${Math.abs(m.n)}</small></label>`).join("")}
      <label class="r-check"><input type="checkbox" name="buy"> ${esc(t("BuyNightmare"))} <small>−1</small></label></div></div>
    <p class="r-note">${esc(t("CantripRule", { nm: c.nightmare }))}</p></div>`;
  const f = await foundry.applications.api.DialogV2.prompt({ window: { title: `${t("Cantrip")}: ${actor.name}`, icon: "fa-solid fa-wand-sparkles" },
    classes: ["vtm20", "r-dialog", "r-type-changeling"], position: { width: 520 }, rejectClose: false, content,
    ok: { label: t("Cast"), icon: "fa-solid fa-wand-sparkles", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object } });
  if (!f) return null;
  return rollCantrip(actor, {
    art: f.art, level: Number(f.level) || 1, wyrd: f.wyrd === "1" || f.wyrd === 1 || f.wyrd === true, bunk: Number(f.bunk) || 0, buy: !!f.buy,
    realms: VTM20.changelingRealms.filter(k => f[`r_${k}`]), mods: mods.filter(m => f[`m_${m.key}`]).map(m => m.key)
  });
}

/** Сам бросок кантрипа (без окна) — для окна, худа и автотестов. */
export async function rollCantrip(actor, o) {
  const c = actor.system.changeling, art = artOf(o.art), R = C().cantrip ?? {}, kith = kithOf(c.kith);
  const rating = c.arts[o.art] ?? 0, level = Math.clamp(o.level ?? rating, 1, 5);
  if (!art || rating < 1) return ui.notifications.warn(t("NoArts"));
  if (level > rating) return ui.notifications.warn(t("LevelTooHigh", { n: rating }));
  const primary = (o.realms ?? []).filter(k => PRIMARY.includes(k)), modsR = (o.realms ?? []).filter(k => MODIFIERS.includes(k));
  if (!primary.length) return ui.notifications.warn(t("NeedRealm"));
  // «жульничество» — Царство, которого нет: +1 Гламур за каждое
  const cheat = [...primary, ...modsR].filter(k => !(c.realms[k] > 0)).length;
  const cost = (o.wyrd ? R.wyrdCost ?? 1 : 0) + cheat * (R.cheatCost ?? 1);
  if (cost && !(await spendGlamour(actor, cost))) return null;
  const low = Math.min(...primary.map(k => c.realms[k] ?? 0)), pool = rating + low;
  const modN = k => (R.mods ?? []).find(m => m.key === k)?.n ?? 0;
  const affinity = primary.concat(modsR).includes(kith?.affinity);
  let diff = (R.diff ?? 8) + modsR.length - (o.bunk ?? 0) + (o.mods ?? []).reduce((s, k) => s + modN(k), 0) - (affinity ? 1 : 0) - (o.buy ? 1 : 0);
  diff = Math.clamp(diff, 3, 10);
  const nightmare = Math.min(pool, c.nightmare + (o.buy ? R.nightmareBuy ?? 3 : 0));
  const { rollPool } = await import("../dice/roll.mjs");
  const lv = art.levels.find(l => l.level === level);
  const roll = await rollPool({ actor, title: `${art.name}: ${lv?.name ?? ""}`, subtitle: t("CantripSub", { d: diff }), pool, difficulty: diff, kind: "check",
    breakdown: [{ label: art.name, value: rating }, { label: primary.map(k => realmOf(k)?.name).join(" / "), value: low }],
    effect: lv?.html ?? "", extra: { changeling: { kind: "cantrip", art: o.art, level, realms: [...primary, ...modsR], wyrd: !!o.wyrd, cost, cheat, nightmare, bunk: o.bunk ?? 0, affinity } } });
  if (!roll) return null;
  await afterRoll(actor, roll, nightmare, art.name);
  return roll;
}

/** Кубики Кошмара — первые в броске: каждая 10 на них — +1 Кошмар; ботч — ещё +1. */
async function afterRoll(actor, roll, nightmare, reason) {
  const tens = (roll.state?.values ?? []).slice(0, nightmare).filter(v => v === 10).length;
  const n = tens + (roll.outcome === "botch" ? 1 : 0);
  if (n) await gainNightmare(actor, n, { reason });
}

/** Высвобождение (гл. 4): 2 Гламура и +1 Кошмар до броска; Гламур + Кошмар кубиков, сл. 7. */
export async function unleash(actor, artKey) {
  if (!actor?.isOwner) return null;
  const c = actor.system.changeling, art = artOf(artKey), U = C().cantrip?.unleash ?? { diff: 7, glamour: 2, nightmare: 1 };
  if (!art || !(c.arts[artKey] > 0)) return ui.notifications.warn(t("NoArts"));
  if (!(await spendGlamour(actor, U.glamour))) return null;
  await gainNightmare(actor, U.nightmare);
  const now = actor.system.changeling, pool = now.glamour.permanent + now.nightmare;
  const { rollPool } = await import("../dice/roll.mjs");
  const roll = await rollPool({ actor, title: `${t("Unleash")}: ${art.name}`, subtitle: t("UnleashSub"), pool, difficulty: U.diff, kind: "check",
    breakdown: [{ label: t("Glamour"), value: now.glamour.permanent }, { label: t("Nightmare"), value: now.nightmare }],
    extra: { changeling: { kind: "unleash", art: artKey, rating: c.arts[artKey] } } });
  if (!roll) return null;
  // все кубики — Кошмара: 10 на них тоже добавляют Кошмар (пул включает Кошмар)
  await afterRoll(actor, roll, Math.min(pool, now.nightmare), art.name);
  if (roll.successes > (c.arts[artKey] ?? 0)) await gainNightmare(actor, 1, { reason: t("UnleashWild") });
  return roll;
}

/* ── Карточка броска и знак ───────────────────────────────────────────── */

registerCardBlock("changeling", (state, ev) => {
  const x = state.extra.changeling, n = ev.successes ?? 0, botch = ev.outcome === "botch", chips = [];
  if (x.kind === "cantrip") {
    const art = artOf(x.art);
    chips.push({ icon: "fa-wand-sparkles", label: `${art?.name ?? x.art} ${"•".repeat(x.level)}` },
      { icon: x.wyrd ? "fa-sun" : "fa-cloud", label: t(x.wyrd ? "Type.wyrd" : "Type.chimerical") });
    if (x.realms?.length) chips.push({ icon: "fa-compass", label: x.realms.map(k => realmOf(k)?.name ?? k).join(", ") });
    if (x.cost) chips.push({ icon: "fa-star", label: t("CostGlamour", { n: x.cost }) });
    if (x.nightmare) chips.push({ icon: "fa-moon", label: t("NightmareDice", { n: x.nightmare }), cls: "is-warn" });
    if (x.affinity) chips.push({ icon: "fa-leaf", label: t("AffinityChip") });
    return { chips, text: botch ? t("CantripBotch") : n ? t("CantripOk", { n }) : t("CantripFail") };
  }
  if (x.kind === "unleash") {
    chips.push({ icon: "fa-burst", label: artOf(x.art)?.name ?? x.art });
    return { chips, text: botch ? t("UnleashBotch") : !n ? t("UnleashFail") : n > (x.rating ?? 0) ? t("UnleashWild") : t("UnleashOk") };
  }
  if (x.kind === "trigger") return { chips, text: botch ? t("TriggerBotch") : n ? t("TriggerOk") : t("TriggerFail") };
  return null;
});

registerEmblem("changeling", () => ({ src: foundry.utils.getRoute(CHANGELING_SIGIL) }));

export { SYSTEM_ID };
