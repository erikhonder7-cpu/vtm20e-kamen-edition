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
    mists: c.mists, undone: c.undone, bedlam: c.bedlam, isGM: game.user.isGM,
    wyrd: inWyrd(actor), place: sceneBanality(), chim: chimericalView(actor),
    threshold: (b => b ? { key: b.key, name: t(`Bedlam.${b.key}`), n: b.n, text: t(`BedlamText.${b.key}`, { n: b.n }) } : null)(bedlamOf(actor))
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
    nightmare: c.nightmare, glamour: c.glamour.temporary, oaths: oathsView(actor) };
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
  if (bedlamOf(actor)?.key === "drowning") await gainNightmare(actor, n, { reason: t("Bedlam.drowning") });
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
  const roll = await rollGlamour(actor, { title: t("TriggerTitle"), subtitle: t("TriggerSub"), difficulty: C().banality?.triggerDiff ?? 8, kind: "trigger" });
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
    <div class="r-field"><span>${esc(t("DiffMods"))}</span><div class="r-checks">${mods.map(m => `<label class="r-check"><input type="checkbox" name="m_${m.key}" ${m.key === "placeBanality" && sceneBanality() > 0 ? "checked" : ""}> ${esc(t(`Mod.${m.key}`))} <small>${m.n > 0 ? "+" : "−"}${Math.abs(m.n)}</small></label>`).join("")}
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
  if (bedlamOf(actor)?.key === "leash") return ui.notifications.warn(t("LeashBlock"));
  const primary = (o.realms ?? []).filter(k => PRIMARY.includes(k)), modsR = (o.realms ?? []).filter(k => MODIFIERS.includes(k));
  if (!primary.length) return ui.notifications.warn(t("NeedRealm"));
  // Призыв Вирда: все кантрипы — Вирд, но Гламура не стоят (гл. 6)
  const wyrdOn = inWyrd(actor);
  if (wyrdOn) o = { ...o, wyrd: true };
  // «жульничество» — Царство, которого нет: +1 Гламур за каждое
  const cheat = [...primary, ...modsR].filter(k => !(c.realms[k] > 0)).length;
  const cost = (o.wyrd && !wyrdOn ? R.wyrdCost ?? 1 : 0) + cheat * (R.cheatCost ?? 1);
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

/* ── Химерические раны (гл. 6, «Health», «Death»), холодное железо ─────── */

/**
 * Химерический урон: n уровней вида type. Губительные вытесняют прочие; если летального и губительного больше,
 * чем уровней, — химерическая смерть: подменыш просыпается в Туманах, дорожка очищается, пул Банальности +½ её рейтинга (вверх).
 */
export async function chimericalDamage(actor, n = 1, type = "lethal") {
  if (!actor?.isOwner || n <= 0) return null;
  const ch = actor.system.changeling.chimerical;
  let agg = ch.aggravated, let_ = ch.lethal, bash = ch.bashing;
  for (let i = 0; i < n; i++) {
    if (type === "aggravated") agg++;
    else if (type === "lethal") let_++;
    else if (agg + let_ + bash < 7) bash++;
    else if (agg + let_ < 7) { bash--; let_++; }          // ударный по заполненной дорожке — летальный (как у обычных ран)
    else let_++;
  }
  if (agg + let_ > 7) {
    const b = actor.system.changeling.banality.permanent, gain = Math.ceil(b / 2);
    await actor.update({ "system.changeling.chimerical": { bashing: 0, lethal: 0, aggravated: 0 } });
    await addBanality(actor, gain);
    await say(actor, "fa-cloud", t("ChimDeath", { name: esc(actor.name), n: gain }), "is-warn");
    return "death";
  }
  bash = Math.max(0, Math.min(bash, 7 - agg - let_));
  await actor.update({ "system.changeling.chimerical": { bashing: bash, lethal: Math.min(let_, 7 - agg), aggravated: Math.min(agg, 7) } });
  return agg + let_ + bash;
}

/** Холодное железо: n уровней — губительный урон в обе дорожки сразу и −1 Гламур за каждый уровень (гл. 6). */
export async function coldIron(actor, n = 1) {
  if (!actor?.isOwner || n <= 0) return null;
  await actor.applyDamage(n, "aggravated");
  const res = await chimericalDamage(actor, n, "aggravated");
  const g = actor.system.changeling.glamour.temporary;
  await actor.update({ "system.changeling.glamour.temporary": Math.max(0, g - n) });
  await say(actor, "fa-khanda", t("ColdIronHit", { name: esc(actor.name), n }), "is-warn");
  return res;
}

/** Химерические раны для листа: клетки, подпись, штраф. */
export function chimericalView(actor) {
  const ch = actor.system.changeling.chimerical;
  const MARK = { bashing: "/", lethal: "X", aggravated: "✱", empty: "" };
  return { levels: ch.levels.map((l, i) => ({ state: l.state, mark: MARK[l.state], label: game.i18n.localize(l.label ?? ""), current: i === ch.damage - 1 })),
    damage: ch.damage, status: game.i18n.localize(VTM20.healthLevels.find(l => l.key === ch.status)?.label ?? "VTM20.Health.healthy"), penalty: ch.penalty };
}

/* ── Клятвы (гл. 6, «Oaths») ─────────────────────────────────────────── */

/**
 * Механика примеров книги: take — цена и награда при принятии (Гламур и Воля — временные пункты), brk — расплата
 * при нарушении; note — то, что держит рассказчик. Нарушение любой клятвы — ещё и триггер Банальности (гл. 6).
 * Эсчит: Гламур платит сюзерен — на листе вассала цены нет; Скрещённые клинки: пункт Воли меняется на пункт Гламура.
 */
export const OATHS = {
  clasped:       { take: { glamour: -1, will: 1 }, brk: { will: -2 } },
  fealty:        { take: { will: -1 }, brk: { will: -3 } },
  escheat:       { take: {}, brk: { banality: 1 } },
  burden:        { take: { glamour: -1, will: 1 }, brk: { will: -2 } },
  guardianship:  { take: {}, brk: {} },
  trueHearts:    { take: { glamour: -1 }, brk: { banality: 1 } },
  longRoad:      { take: { glamour: 1, will: 1 }, brk: { glamour: -3, will: -3 } },
  crossedBlades: { take: { will: -1, glamour: 1 }, brk: { willPerm: -1 } },
  custom:        { take: { glamour: -1 }, brk: {} }
};
export const oathOf = key => (C().oaths ?? []).find(o => o.key === key) ?? null;

/** Клятвы на листе: имя, с кем, условия, кнопки. */
export function oathsView(actor) {
  return (actor.system.changeling.oaths ?? []).map((o, i) => {
    const d = oathOf(o.key);
    return { i, key: o.key, name: d?.name ?? t("Oath.Custom"), who: o.with, text: o.text || d?.text || "", broken: o.broken,
      take: t(`Oath.Take.${o.key}`), brk: t(`Oath.Break.${o.key}`) };
  });
}

/** Изменить запасы: Гламур и Воля — временные (не выше рейтинга), willPerm — постоянная Воля, banality — пул Банальности. */
async function oathApply(actor, fx) {
  const c = actor.system.changeling, w = actor.system.willpower, upd = {};
  if (fx.glamour) upd["system.changeling.glamour.temporary"] = Math.clamp(c.glamour.temporary + fx.glamour, 0, c.glamour.permanent);
  if (fx.will) upd["system.willpower.temporary"] = Math.clamp(w.temporary + fx.will, 0, w.permanent);
  if (fx.willPerm) { const p = Math.max(0, w.permanent + fx.willPerm); upd["system.willpower.permanent"] = p; upd["system.willpower.temporary"] = Math.min(w.temporary, p); }
  if (Object.keys(upd).length) await actor.update(upd);
  if (fx.banality) await addBanality(actor, fx.banality);
}

/** Принести клятву: окно — какая, с кем, формула; цена — сразу (Гламура не хватает — нельзя). */
export async function takeOath(actor, preset = {}) {
  if (!actor?.isOwner) return null;
  const list = [...(C().oaths ?? []), { key: "custom", name: t("Oath.Custom"), text: "" }];
  const f = preset.key ? preset : await foundry.applications.api.DialogV2.prompt({ window: { title: t("Oath.Title"), icon: "fa-solid fa-handshake-angle" },
    classes: ["vtm20", "r-dialog", "r-type-changeling"], position: { width: 560 }, rejectClose: false,
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("Oath.Which"))}</span><select name="key">${list.map(o => `<option value="${o.key}" title="${esc(o.text)}">${esc(o.name)}</option>`).join("")}</select></label>
      <label class="r-field"><span>${esc(t("Oath.With"))}</span><input type="text" name="with"></label>
      <label class="r-field"><span>${esc(t("Oath.Text"))}</span><input type="text" name="text" placeholder="${esc(t("Oath.TextPh"))}"></label>
      <p class="r-note">${esc(t("Oath.Rule"))}</p></div>`,
    ok: { label: t("Oath.Swear"), icon: "fa-solid fa-handshake-angle", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object } });
  if (!f?.key) return null;
  const rule = OATHS[f.key] ?? OATHS.custom;
  if ((rule.take.glamour ?? 0) < 0 && actor.system.changeling.glamour.temporary < -rule.take.glamour) return ui.notifications.warn(t("NoGlamour", { n: -rule.take.glamour }));
  if ((rule.take.will ?? 0) < 0 && actor.system.willpower.temporary < -rule.take.will) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoWillpower", { name: actor.name }));
  await actor.update({ "system.changeling.oaths": [...actor.system.changeling.toObject?.().oaths ?? actor.system.changeling.oaths.map(o => ({ ...o })),
    { key: f.key, with: f.with ?? "", text: f.text ?? "", broken: false }] });
  await oathApply(actor, rule.take);
  await say(actor, "fa-handshake-angle", t("Oath.Sworn", { name: esc(actor.name), oath: esc(oathOf(f.key)?.name ?? t("Oath.Custom")), with: esc(f.with || "—"), fx: t(`Oath.Take.${f.key}`) }));
  return f.key;
}

/** Нарушить клятву: расплата по книге, отметка «клятвопреступник» и триггер Банальности. */
export async function breakOath(actor, i) {
  if (!actor?.isOwner) return null;
  const oaths = actor.system.changeling.oaths.map(o => ({ ...o })), o = oaths[Number(i)];
  if (!o || o.broken) return null;
  o.broken = true;
  await actor.update({ "system.changeling.oaths": oaths });
  await oathApply(actor, (OATHS[o.key] ?? OATHS.custom).brk);
  await say(actor, "fa-heart-crack", t("Oath.Broken", { name: esc(actor.name), oath: esc(oathOf(o.key)?.name ?? t("Oath.Custom")), fx: t(`Oath.Break.${o.key}`) }), "is-warn");
  return banalityTrigger(actor);
}
/** Снять клятву с листа (исполнена или отменена по согласию). */
export function dropOath(actor, i) {
  const oaths = actor.system.changeling.oaths.map(o => ({ ...o }));
  oaths.splice(Number(i), 1);
  return actor.update({ "system.changeling.oaths": oaths });
}

/* ── Призыв Вирда и Осени, Банальность места (гл. 6) ───────────────────── */

/** Банальность места сцены (гл. 6, «Банальные места»): ставит рассказчик; больше 0 — Банальная структура (кантрипы +1). */
export const sceneBanality = () => Number(game.scenes?.viewed?.getFlag(SYSTEM_ID, "banality")) || 0;
export const inWyrd = actor => !!actor?.getFlag?.(SYSTEM_ID, "wyrd");
export const bedlamOf = actor => actor?.getFlag?.(SYSTEM_ID, "bedlam") ?? null;

export async function setSceneBanality() {
  const scene = game.scenes?.viewed;
  if (!game.user.isGM || !scene) return null;
  const n = await foundry.applications.api.DialogV2.prompt({ window: { title: t("PlaceBanality"), icon: "fa-solid fa-building" },
    classes: ["vtm20", "r-dialog", "r-type-changeling"], rejectClose: false,
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("PlacePrompt"))}</span><input type="number" name="n" min="0" max="10" value="${sceneBanality()}"></label>
      <p class="r-note">${esc(t("PlaceHint"))}</p></div>`,
    ok: { label: game.i18n.localize("VTM20.Common.Save"), callback: (e, b) => Number(b.form.elements.n.value) || 0 } });
  if (n == null) return null;
  await scene.setFlag(SYSTEM_ID, "banality", Math.clamp(n, 0, 10));
  return n;
}

/** Бросок Гламура (рейтинг) с кубиками Кошмара. */
async function rollGlamour(actor, { title, subtitle, difficulty, kind }) {
  const { rollPool } = await import("../dice/roll.mjs"), c = actor.system.changeling, pool = c.glamour.permanent, nightmare = Math.min(pool, c.nightmare);
  const roll = await rollPool({ actor, title, subtitle, pool, difficulty, kind: "check",
    breakdown: [{ label: t("Glamour"), value: pool }], extra: { changeling: { kind, nightmare } } });
  if (roll) await afterRoll(actor, roll, nightmare, title);
  return roll;
}

/**
 * Призыв Вирда (гл. 6): 1 Гламур и 1 Воля; Гламур против Банальности места или своей (что выше). Успех — Вирд на сцену:
 * 10 перебрасываются (dice/roll.mjs), кантрипы — Вирд без Гламура. Провал — +1 Банальность, ботч — по 1 за каждую единицу.
 * Повторный вызов при активном Вирде — Вирд угас.
 */
export async function invokeWyrd(actor) {
  if (!actor?.isOwner) return null;
  if (inWyrd(actor)) { await actor.unsetFlag(SYSTEM_ID, "wyrd"); await say(actor, "fa-sun", t("WyrdEnd", { name: esc(actor.name) })); return null; }
  const c = actor.system.changeling;
  if (c.glamour.temporary < 1) return ui.notifications.warn(t("NoGlamour", { n: 1 }));
  if (actor.system.willpower.temporary < 1) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoWillpower", { name: actor.name }));
  await spendGlamour(actor, 1); await actor.spendWillpower(1);
  const diff = Math.clamp(Math.max(sceneBanality(), c.banality.permanent), 2, 10);
  const roll = await rollGlamour(actor, { title: t("WyrdTitle"), subtitle: t("WyrdSub", { d: diff }), difficulty: diff, kind: "wyrd" });
  if (!roll) return null;
  if (roll.successes > 0) {
    await actor.setFlag(SYSTEM_ID, "wyrd", { scene: game.scenes?.viewed?.id ?? "" });
    await say(actor, "fa-sun", t("WyrdOn", { name: esc(actor.name) }));
  } else {
    const n = roll.outcome === "botch" ? roll.state.values.filter(v => v === 1).length : 1;
    await addBanality(actor, n);
    await say(actor, "fa-snowflake", t("WyrdFail", { name: esc(actor.name), n }), "is-warn");
  }
  return roll;
}

/** Призыв Осени (гл. 6): 1 Воля — химерический эффект на одно действие не касается подменыша; всегда триггер Банальности. */
export async function invokeAutumn(actor) {
  if (!actor?.isOwner) return null;
  if (!(await actor.spendWillpower(1))) return null;
  await say(actor, "fa-leaf", t("AutumnOn", { name: esc(actor.name) }));
  return banalityTrigger(actor);
}

/* ── Эпифании (гл. 6, «Пять путей к Эпифании») ─────────────────────────── */

const PATHS = ["reverie", "rapture", "ravaging", "revelry", "rhapsody"];
const TIME = n => t(`Epi.Time.${Math.clamp(n, 0, 5)}`);

/**
 * Окно Эпифании: путь, черты броска, Порог, «снять Дисбаланс вместо Гламура», «обменять Гламур на Банальность».
 * Мечтание и Восторг — сначала Восприятие + Кеннинг (сл. 8): сколько времени нужно; Разорение — кубики Банальности (сл. 6);
 * Веселье — раз за историю весь пул; Рапсодия — запретная, Гламур уходит в шедевр.
 */
export async function epiphany(actor, preset = {}) {
  if (!actor?.isOwner) return null;
  const c = actor.system.changeling, kith = kithOf(c.kith);
  const abil = Object.keys(VTM20.abilities).filter(k => !([].concat(VTM20.abilities[k].not ?? []).includes("changeling"))
    && (!VTM20.abilities[k].only || [].concat(VTM20.abilities[k].only).includes("changeling")))
    .map(k => ({ k, n: actor.traitValue(`abilities.${k}`), label: actor.traitLabel(`abilities.${k}`) })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  const attrs = Object.keys(VTM20.attributes).map(k => ({ k, n: actor.traitValue(`attributes.${k}`), label: actor.traitLabel(`attributes.${k}`) }));
  const sel = (name, list, cur) => `<select name="${name}">${list.map(x => `<option value="${x.k}" ${x.k === cur ? "selected" : ""}>${esc(x.label)} (${x.n})</option>`).join("")}</select>`;
  const content = `<div class="r-form r-epiphany">
    <label class="r-field"><span>${esc(t("Epi.Path"))}</span><select name="path">${PATHS.map(p => `<option value="${p}" ${p === (preset.path ?? "reverie") ? "selected" : ""}>${esc(t(`Epi.Paths.${p}`))}</option>`).join("")}</select></label>
    <label class="r-field"><span>${esc(t("Epi.Attribute"))}</span>${sel("attr", attrs, preset.attr ?? "manipulation")}</label>
    <label class="r-field"><span>${esc(t("Epi.Ability"))}</span>${sel("abil", abil, preset.abil ?? abil[0]?.k)}</label>
    <div class="r-field"><span>${esc(t("Epi.Options"))}</span><div class="r-checks">
      <label class="r-check" data-tooltip="${esc(c.threshold || t("ThresholdHint"))}"><input type="checkbox" name="own" ${preset.own ? "checked" : ""}> ${esc(t("Epi.OwnThreshold"))}</label>
      ${c.imbalance ? `<label class="r-check"><input type="checkbox" name="heal" ${preset.heal ? "checked" : ""}> ${esc(t("Epi.HealImbalance"))}</label>` : ""}
      ${c.banality.temporary ? `<label class="r-check"><input type="checkbox" name="shed" ${preset.shed ? "checked" : ""}> ${esc(t("Epi.Shed"))}</label>` : ""}</div></div>
    <label class="r-field"><span>${esc(t("Epi.Invest"))}</span><input type="number" name="invest" min="1" max="5" value="${preset.invest ?? 1}"></label>
    <label class="r-field"><span>${esc(t("Epi.ArtistPool"))}</span><input type="number" name="artist" min="0" max="10" value="${preset.artist ?? 3}"></label>
    <p class="r-note">${PATHS.map(p => `<b>${esc(t(`Epi.Paths.${p}`))}</b> — ${esc(t(`Epi.PathHint.${p}`))}`).join("<br>")}</p>
    ${kith?.revelry ? `<p class="r-note"><i class="fa-solid fa-champagne-glasses"></i> ${esc(t("Epi.KithRevelry", { kith: kith.name }))} ${esc(kith.revelry)}</p>` : ""}</div>`;
  const f = preset.path && preset.skipDialog ? preset : await foundry.applications.api.DialogV2.prompt({
    window: { title: `${t("Epi.Title")}: ${actor.name}`, icon: "fa-solid fa-lightbulb" }, classes: ["vtm20", "r-dialog", "r-type-changeling"],
    position: { width: 560 }, rejectClose: false, content,
    ok: { label: t("Epi.Go"), icon: "fa-solid fa-lightbulb", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object } });
  if (!f) return null;
  return runEpiphany(actor, { path: f.path, attr: f.attr, abil: f.abil, own: !!f.own, heal: !!f.heal, shed: !!f.shed,
    invest: Math.clamp(Number(f.invest) || 1, 1, 5), artist: Math.max(0, Number(f.artist) || 0) });
}

/** Сам путь Эпифании (без окна) — для окна и автотестов. Возвращает полученный Гламур. */
export async function runEpiphany(actor, o) {
  const { rollPool } = await import("../dice/roll.mjs"), name = esc(actor.name), pathName = t(`Epi.Paths.${o.path}`);
  const c = () => actor.system.changeling;
  const trait = (p, n) => ({ label: actor.traitLabel(p), value: n ?? actor.traitValue(p) });
  const timeRoll = async () => {
    const pool = actor.traitValue("attributes.perception") + actor.traitValue("abilities.kenning");
    const r = await rollPool({ actor, title: t("Epi.TimeTitle"), subtitle: t("Epi.TimeSub"), pool, difficulty: 8, kind: "check",
      breakdown: [trait("attributes.perception"), trait("abilities.kenning")], extra: { changeling: { kind: "epiTime" } } });
    if (r) await say(actor, "fa-hourglass-half", t("Epi.TimeResult", { name, time: TIME(r.successes) }));
    return r;
  };
  if (o.path === "revelry") {
    if (actor.getFlag(SYSTEM_ID, "revelry") && !(await foundry.applications.api.DialogV2.confirm({ window: { title: pathName }, content: `<p>${esc(t("Epi.RevelryAgain"))}</p>`, rejectClose: false })))
      return null;
    const g = c().glamour, n = g.permanent - g.temporary;
    await actor.update({ "system.changeling.glamour.temporary": g.permanent, [`flags.${SYSTEM_ID}.revelry`]: true });
    await say(actor, "fa-champagne-glasses", t("Epi.RevelryOk", { name, how: esc(kithOf(c().kith)?.revelry ?? "") }));
    return n;
  }
  if (o.path === "rhapsody") {
    if (!(await spendGlamour(actor, o.invest))) return null;
    const r = await rollPool({ actor, title: t("Epi.Paths.rhapsody"), subtitle: t("Epi.RhapsodySub"), pool: o.artist + o.invest, difficulty: 7, kind: "check",
      breakdown: [{ label: t("Epi.Artist"), value: o.artist }, { label: t("Epi.Invested"), value: o.invest }], extra: { changeling: { kind: "rhapsody" } } });
    if (!r) return null;
    const msg = r.outcome === "botch" ? t("Epi.RhapsodyBotch") : r.successes ? t("Epi.RhapsodyOk", { n: r.successes * 2 }) : t("Epi.RhapsodyFail", { n: o.invest });
    await say(actor, "fa-skull", `${t("Epi.RhapsodyWarn")} ${msg}`, "is-warn");
    return 0;
  }
  let roll;
  if (o.path === "reverie" || o.path === "rapture") {
    const tr = await timeRoll();
    if (!tr) return null;
    if (!tr.successes) { await say(actor, "fa-hourglass", t("Epi.TimeNone", { name })); return 0; }
    const p1 = o.path === "reverie" ? "attributes.manipulation" : `attributes.${o.attr}`, p2 = `abilities.${o.abil}`;
    const diff = o.path === "reverie" ? 6 : Math.clamp(c().banality.permanent - c().glamour.permanent + 6, 3, 10);
    roll = await rollPool({ actor, title: pathName, subtitle: t("Epi.MainSub", { d: diff }), pool: actor.traitValue(p1) + actor.traitValue(p2), difficulty: diff, kind: "check",
      breakdown: [trait(p1), trait(p2)], extra: { changeling: { kind: "epiphany", path: o.path } } });
  } else if (o.path === "ravaging") {
    roll = await rollPool({ actor, title: pathName, subtitle: t("Epi.RavageSub"), pool: c().banality.permanent, difficulty: 6, kind: "check",
      breakdown: [{ label: t("Banality"), value: c().banality.permanent }], extra: { changeling: { kind: "epiphany", path: o.path } } });
  }
  if (!roll) return null;
  const n = roll.successes, botch = roll.outcome === "botch";
  if (!n) {
    if (o.path === "ravaging") {
      if (botch) await actor.update({ "system.changeling.banality.permanent": Math.min(10, c().banality.permanent + 1) });
      else await addBanality(actor, 1);
      await say(actor, "fa-snowflake", t(botch ? "Epi.RavageBotch" : "Epi.RavageFail", { name }), "is-warn");
    } else if (o.path === "rapture" && botch) {
      await addBanality(actor, 1); await say(actor, "fa-snowflake", t("Epi.RaptureBotch", { name }), "is-warn");
    } else await say(actor, "fa-cloud", t(botch ? "Epi.Block" : "Epi.GainNone", { name, path: pathName }), botch ? "is-warn" : "");
    return 0;
  }
  // 5+ успехов: Мечтание и Разорение — +1 к рейтингу только по своему Порогу; Восторг — всегда, и пул полон
  const permUp = n >= 5 && (o.path === "rapture" || o.own);
  return applyEpiphany(actor, n, { path: o.path, permUp, full: n >= 5 && o.path === "rapture", heal: o.heal, shed: o.shed });
}

/** Итог Эпифании: Дисбаланс вместо Гламура, обмен Гламура на Банальность (в момент получения), рост рейтинга. */
async function applyEpiphany(actor, n, { path, permUp, full, heal, shed }) {
  const c = actor.system.changeling, name = esc(actor.name), pathName = t(`Epi.Paths.${path}`), upd = {};
  if (heal && c.imbalance > 0) {
    await actor.update({ "system.changeling.imbalance": c.imbalance - 1 });
    await say(actor, "fa-scale-balanced", t("Epi.Healed", { name, path: pathName }));
    return 0;
  }
  const perm = Math.min(10, c.glamour.permanent + (permUp ? 1 : 0));
  const shedN = shed ? Math.min(n, c.banality.temporary) : 0, gain = n - shedN;
  if (shedN) upd["system.changeling.banality.temporary"] = c.banality.temporary - shedN;
  upd["system.changeling.glamour.permanent"] = perm;
  upd["system.changeling.glamour.temporary"] = full ? perm : Math.min(perm, c.glamour.temporary + gain);
  await actor.update(upd);
  const extra = (permUp ? t("Epi.PermUp") : "") + (full ? t("Epi.FullPool") : "") + (shedN ? t("Epi.ShedDone", { n: shedN }) : "");
  await say(actor, "fa-lightbulb", t("Epi.Gain", { name, path: pathName, n: gain, extra }));
  return gain;
}

/* ── Пороги Бедлама (гл. 6): трата Дисбалансной Воли ─────────────────── */

/** Сколько потраченных пунктов Воли пришлось на клетки Дисбаланса (крайние справа). */
export function imbalancedSpent(actor, nextTemp) {
  const w = actor.system.willpower, imb = actor.system.changeling?.imbalance ?? 0;
  let k = 0;
  for (let p = w.temporary; p > nextTemp; p--) if (p > w.permanent - imb) k++;
  return k;
}

Hooks.on("preUpdateActor", (actor, diff, opts) => {
  if (actor.type !== "changeling") return;
  const next = foundry.utils.getProperty(diff, "system.willpower.temporary");
  if (next == null || next >= actor.system.willpower.temporary) return;
  const k = imbalancedSpent(actor, next);
  if (k) opts.clBedlam = k;
});
Hooks.on("updateActor", (actor, diff, opts, userId) => {
  if (userId === game.user.id && opts.clBedlam) bedlamPrompt(actor, opts.clBedlam);
});

/** Карточка рассказчику: подменыш потратил Дисбалансную Волю — выбрать Порог Бедлама (на сцен — по числу Дисбалансов). */
export function bedlamPrompt(actor, k) {
  const n = actor.system.changeling.imbalance;
  const buttons = (C().bedlam ?? []).map(b => `<button type="button" data-r-action="clBedlam" data-key="${b.key}" data-tooltip="${esc(t(`BedlamText.${b.key}`, { n }))}">${esc(t(`Bedlam.${b.key}`))}</button>`).join("");
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter(u => u.isGM).map(u => u.id),
    flags: { [SYSTEM_ID]: { clBedlam: { actor: actor.uuid } } },
    content: `<div class="r-notice r-type-changeling is-warn"><i class="fa-solid fa-masks-theater"></i> ${t("BedlamPrompt", { name: esc(actor.name), k, n })}
      <div class="r-card-buttons r-cl-bedlam">${buttons}</div></div>` });
}

/** Назначить Порог Бедлама: штраф «+1 за каждый Дисбаланс» к броскам Атрибута (dice/dialog.mjs), особые пороги — сразу. */
export async function setBedlam(actor, key) {
  const n = actor.system.changeling.imbalance, def = (C().bedlam ?? []).find(b => b.key === key);
  if (!def) return null;
  await actor.setFlag(SYSTEM_ID, "bedlam", { key, n, scenes: n, attr: def.attr ?? "" });
  await say(actor, "fa-masks-theater", t("BedlamSet", { name: esc(actor.name), th: t(`Bedlam.${key}`), n, text: t(`BedlamText.${key}`, { n }) }), "is-warn");
  if (key === "self") { await actor.setFlag(SYSTEM_ID, "wyrd", { scene: game.scenes?.viewed?.id ?? "", bedlam: true }); await gainNightmare(actor, 2, { reason: t("Bedlam.self") }); }
  if (key === "drowning") await actor.update({ "system.changeling.glamour.temporary": actor.system.changeling.glamour.permanent });
  return key;
}
export const endBedlam = actor => actor.unsetFlag(SYSTEM_ID, "bedlam");

/** Кнопки карточек подменыша (dice/roll.mjs → onChatCardClick). */
export async function clCardAction(message, action, btn) {
  if (action === "clBedlam") {
    if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
    const actor = await fromUuid(message.getFlag(SYSTEM_ID, "clBedlam")?.actor ?? "");
    if (actor) await setBedlam(actor, btn.dataset.key);
  }
  return null;
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
