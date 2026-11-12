// module/apps/spectre.mjs
// Спектр (Wraith 20, гл. 10): призрак, которого поглотило Забвение, — режим листа призрака (system.wraith.spectre.on).
//   · Ангст — запас вместо Пафоса (питает Арканои, лечит Корпус, возвращается Тёмными Страстями); старт 5, до 10.
//   · Тёмные Арканои: сложность 6, если не сказано иное; у всех Спектров Сговор не ниже 1. Касты (гл. 10): какие Арканои,
//     бесплатный Тёмный Арканос, точки на выбор, Оковы.
//   · Психея вместо Тени: архетип, Пафос рейтингом (10 — Искупление) и запасом; где Тень призрака получила бы Ангст,
//     Психея получает Пафос; Катарсис Психеи — запас выше Воли Спектра, 1 Пафос, запас против Воли (сл. 6).
//   · Краткая жизнь: каждый ботч Спектра — минус 1 постоянного Корпуса (в Катарсисе Психеи — Психея теряет 1 Пафос).
//   · Жадность: при встрече с чужой Страстью, похожей на сильнейшую Тёмную Страсть, — Воля, сл. 7; провал — нападение.

import { RollDialog } from "../dice/dialog.mjs";
import { VTM20, SYSTEM_ID } from "../config.mjs";
import { W, t, esc, say, artDifficulty, pick } from "./wraith.mjs";

export const isSpectre = actor => !!actor?.system?.wraith?.spectre?.on;
export const darkOf = key => (W().darkArcanoi ?? []).find(a => a.key === key) ?? null;
const casteOf = key => (W().castes ?? []).find(c => c.key === key) ?? null;
const frondOf = key => (W().psyche?.fronds ?? []).find(f => f.key === key) ?? null;
const shadeOf = key => (W().shadecraft ?? []).find(s => s.key === key) ?? null;
const attrLabel = k => game.i18n.localize(VTM20.attributes[k]?.label ?? k);

/* ── Вид для листа ──────────────────────────────────────────────────── */

export function spectreView(actor, dots) {
  const w = actor.system.wraith, sp = w.spectre, D = W(), caste = casteOf(sp.caste), ps = sp.psyche;
  const dark = (D.darkArcanoi ?? []).filter(a => (sp.dark[a.key] ?? 0) > 0).map(a => {
    const value = sp.dark[a.key];
    return { key: a.key, name: a.name, en: a.en, icon: a.icon, value, html: a.html,
      dots: dots(value, 5, { path: `system.wraith.spectre.dark.${a.key}` }), xp: actor.xpCost("arcanos", value),
      levels: a.levels.map(l => {
        const dc = artDifficulty(l, actor);
        return { ...l, known: l.level <= value, attrLabel: l.attr ? attrLabel(l.attr) : "", diff: dc.diff, diffNote: dc.note, viaShroud: !!dc.shroud,
          pool: l.attr ? (actor.system.attributes[l.attr]?.total ?? 0) + value : null,
          cost: [l.angst ? t("Spectre.CostAngst", { n: l.angst }) : "", l.willpower ? `${l.willpower} ${t("Cost.Will")}` : "",
            l.psyche ? t("Spectre.CostPsyche", { n: l.psyche }) : ""].filter(Boolean).join(" · ") };
      }) };
  });
  return {
    caste, castes: (D.castes ?? []).map(c => ({ key: c.key, name: c.name, selected: c.key === sp.caste })),
    angst: sp.angst, angstBoxes: dots(sp.angst, 10, { path: "system.wraith.spectre.angst" }),
    dark, darkAvail: (D.darkArcanoi ?? []).filter(a => !(sp.dark[a.key] > 0)).map(a => ({ key: a.key, label: a.name })),
    shade: sp.shadecraft.map((k, i) => ({ i, ...(shadeOf(k) ?? { name: k, html: "" }) })),
    shadeAvail: (D.shadecraft ?? []).filter(s => !sp.shadecraft.includes(s.key)).map(s => ({ key: s.key, label: s.name })),
    psyche: { archetype: ps.archetype, archetypes: (D.psyche?.archetypes ?? []).map(a => ({ value: a.name, label: a.name, selected: a.name === ps.archetype })),
      rating: ps.rating, pool: ps.pool, ratingDots: dots(ps.rating, 10, { path: "system.wraith.spectre.psyche.rating" }),
      poolBoxes: dots(ps.pool, 10, { path: "system.wraith.spectre.psyche.pool" }), catharsis: ps.catharsis, canCatharsis: ps.canCatharsis,
      redeemed: sp.redeemed,
      passions: ps.passions.map((p, i) => ({ ...p, i, dots: dots(p.value, 5, { path: `system.wraith.spectre.psyche.passions.${i}.value` }) })),
      fronds: ps.fronds.map((f, i) => ({ i, ...f, ...(frondOf(f.key) ?? { name: f.key, html: "" }) })),
      frondAvail: (D.psyche?.fronds ?? []).filter(f => !ps.fronds.some(x => x.key === f.key)).map(f => ({ key: f.key, label: `${f.name} (${f.costText})` })) },
    darkSym: { src: foundry.utils.getRoute("systems/vtm20e-kamen-edition/assets/wraith/arcanos-dark.png") },
    isGM: game.user.isGM
  };
}

/* ── Ангст и Пафос Психеи ───────────────────────────────────────────── */

export async function spendSpectreAngst(actor, n = 1) {
  const a = actor.system.wraith.spectre.angst;
  if (a < n) { ui.notifications.warn(t("Spectre.NoAngst", { n })); return false; }
  await actor.update({ "system.wraith.spectre.angst": a - n });
  return true;
}
export async function gainSpectreAngst(actor, n) {
  const a = actor.system.wraith.spectre.angst, now = Math.clamp(a + n, 0, 10);
  if (now !== a) await actor.update({ "system.wraith.spectre.angst": now });
  return now - a;
}
/** Пафос Психеи (запас, до 10); в Катарсисе Психеи — наоборот, вычитается (гл. 10, «Потеря Пафоса»). */
export async function gainPsyche(actor, n, { reason = "" } = {}) {
  if (!n) return 0;
  const ps = actor._source.system.wraith.spectre.psyche, d = ps.catharsis && n > 0 ? -n : n;
  const now = Math.clamp(ps.pool + d, 0, 10);
  if (now === ps.pool) return 0;
  await actor.update({ "system.wraith.spectre.psyche.pool": now });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<div class="r-notice r-type-wraith is-psyche"><i class="fa-solid fa-dove"></i> ${t(d > 0 ? "Spectre.PsycheGain" : "Spectre.PsycheLoss", { name: esc(actor.name), n: Math.abs(now - ps.pool), pool: now })}${reason ? ` <small>(${esc(reason)})</small>` : ""}</div>` });
  return now - ps.pool;
}

/* ── Стать Спектром и обратно ───────────────────────────────────────── */

/** Рассказчик: призрак пал в Забвение — каста, Ангст 5, Сговор 1 и бесплатный Тёмный Арканос касты, Психея с рейтингом 1. */
export async function becomeSpectre(actor) {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  const sp = actor.system.wraith.spectre;
  if (sp.on) {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Spectre.LeaveTitle") }, content: `<p>${esc(t("Spectre.LeaveText"))}</p>` });
    return ok ? actor.update({ "system.wraith.spectre.on": false, "system.wraith.spectre.psyche.catharsis": false }) : null;
  }
  const caste = await pick(t("Spectre.BecomeTitle", { name: actor.name }), (W().castes ?? []).map(c => ({ key: c.key, icon: "fa-skull",
    title: c.name, sub: String(c.creation ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 150) })), { lead: t("Spectre.BecomeLead") });
  if (!caste) return null;
  const c = casteOf(caste), dark = { ...actor._source.system.wraith.spectre.dark };
  dark.collogue = Math.max(1, dark.collogue ?? 0);
  for (const [k, v] of Object.entries(c?.free ?? {})) dark[k] = Math.max(v, dark[k] ?? 0);
  await actor.update({ "system.wraith.spectre": { on: true, caste, angst: 5, dark, shadecraft: actor._source.system.wraith.spectre.shadecraft,
    psyche: { ...actor._source.system.wraith.spectre.psyche, rating: Math.max(1, sp.psyche.rating), catharsis: false } },
    "system.wraith.shadow.catharsis": false });
  return say(actor, "fa-skull", t("Spectre.Became", { name: esc(actor.name), caste: esc(c?.name ?? caste) }), "is-shadow");
}

/* ── Броски ─────────────────────────────────────────────────────────── */

/** Уровень Тёмного Арканоса (гл. 10): Ангст и Воля — цена; сложность 6, если не сказано иное (сквозь Покров — его рейтинг). */
export async function rollDark(actor, key, level) {
  const a = darkOf(key), lv = a?.levels.find(l => l.level === Number(level));
  if (!lv) return null;
  const value = actor.system.wraith.spectre.dark[key] ?? 0;
  if (value < lv.level) return ui.notifications.warn(t("ArtTooHigh", { n: lv.level }));
  if (lv.angst && !(await spendSpectreAngst(actor, lv.angst))) return null;
  if (lv.psyche) await gainPsyche(actor, lv.psyche, { reason: lv.name });
  const dc = artDifficulty(lv, actor);
  const extra = { wraith: { kind: "darkArt", key, level: lv.level, name: lv.name, cost: lv.angst ? t("Spectre.CostAngst", { n: lv.angst }) : "",
    ...(dc.shroud ? { shroud: dc.shroud.value } : {}) } };
  if (!lv.attr) {
    await say(actor, a.icon, `<b>${esc(a.name)} ${"•".repeat(lv.level)} — ${esc(lv.name)}</b>${lv.html}`, "is-shadow");
    return true;
  }
  return RollDialog.prompt(actor, { title: `${a.name}: ${lv.name}`, trait1: `attributes.${lv.attr}`, trait2: `spectre.${key}`,
    difficulty: dc.diff, diffNote: dc.note, effect: lv.html, willpowerCost: lv.willpower ?? 0, extra });
}

/** Страсть Психеи: при достижении её цели — рейтинг, сл. 6; спровоцировать чужую эмоцию — сл. 9; успех — Пафос Психеи. */
export async function rollPsychePassion(actor, i) {
  const p = actor.system.wraith.spectre.psyche.passions[Number(i)];
  if (!p) return null;
  const how = await pick(t("PassionTitle", { text: p.text || "—" }), [
    { key: "6", icon: "fa-dove", title: t("Spectre.PassionGoal"), sub: t("DiffN", { n: 6 }) },
    { key: "9", icon: "fa-people-arrows", title: t("Spectre.PassionOther"), sub: t("DiffN", { n: 9 }) }]);
  if (!how) return null;
  return RollDialog.prompt(actor, { title: t("PassionTitle", { text: p.text || "—" }), pool: p.value, difficulty: Number(how), lockTraits: true,
    extra: { wraith: { kind: "psyche", text: p.text, emotion: p.emotion } },
    onRolled: async r => gainPsyche(actor, r?.successes ?? 0, { reason: p.text }) });
}

/** Катарсис Психеи (гл. 10): запас Пафоса выше Воли — 1 Пафос; запас против Воли Спектра, сл. 6; больше у Психеи — её сцена. */
export async function psycheCatharsis(actor) {
  const ps = actor.system.wraith.spectre.psyche, will = actor.system.willpower.permanent;
  if (ps.catharsis) { await actor.update({ "system.wraith.spectre.psyche.catharsis": false }); return say(actor, "fa-dove", t("Spectre.CatharsisEnd", { name: esc(actor.name) })); }
  if (ps.pool <= will) return ui.notifications.warn(t("Spectre.CatharsisCant", { pool: ps.pool, will }));
  const pool = ps.pool - 1;
  await actor.update({ "system.wraith.spectre.psyche.pool": pool });
  const r = await new Roll(`${pool}d10`).evaluate(), vals = r.dice[0]?.results.map(x => x.result) ?? [];
  const psyche = Math.max(0, vals.filter(v => v >= 6).length - vals.filter(v => v === 1).length);
  return RollDialog.prompt(actor, { title: t("Spectre.Catharsis"), trait1: "willpower.permanent", difficulty: 6, lockTraits: true,
    extra: { wraith: { kind: "catharsis", shadow: psyche, shadowVals: vals.join(", "), psyche: true } },
    onRolled: async res => {
      if ((res?.successes ?? 0) >= psyche && psyche > 0 || !psyche) return;
      await actor.update({ "system.wraith.spectre.psyche.catharsis": true });
      await say(actor, "fa-dove", t("Spectre.CatharsisWon", { name: esc(actor.name) }), "is-psyche");
    } });
}

/** Жадность (гл. 10): Воля, сл. 7; провал — Спектр нападает на носителя Страсти. */
export function rapacity(actor) {
  return RollDialog.prompt(actor, { title: t("Spectre.Rapacity"), trait1: "willpower.permanent", difficulty: 7, lockTraits: true,
    diffNote: t("Spectre.RapacityNote"), extra: { wraith: { kind: "rapacity" } } });
}

/* ── Строки Психеи и Спектра ────────────────────────────────────────── */

export async function spectreRow(actor, kind, op, data = {}) {
  const sp = foundry.utils.deepClone(actor._source.system.wraith.spectre);
  if (kind === "psychePassion") { if (op === "add") sp.psyche.passions.push({ text: "", emotion: "", value: 1 }); else sp.psyche.passions.splice(data.i, 1); }
  else if (kind === "frond") { if (op === "add") { if (data.key) sp.psyche.fronds.push({ key: data.key, n: 1, note: "" }); } else sp.psyche.fronds.splice(data.i, 1); }
  else if (kind === "shade") { if (op === "add") { if (data.key && !sp.shadecraft.includes(data.key)) sp.shadecraft.push(data.key); } else sp.shadecraft.splice(data.i, 1); }
  else if (kind === "dark") { if (op === "add") { if (data.key) sp.dark[data.key] = Math.max(1, sp.dark[data.key] ?? 0); } else sp.dark[data.key] = data.key === "collogue" ? 1 : 0; }
  return actor.update({ "system.wraith.spectre": sp });
}

/* ── Хуки: Краткая жизнь, Искупление ────────────────────────────────── */

/** Ботч Спектра — минус 1 постоянного Корпуса (пишет автор броска); в Катарсисе Психеи — Психея теряет 1 Пафос. */
Hooks.on("createChatMessage", async (msg, opts, userId) => {
  if (userId !== game.user.id) return;
  const st = msg.getFlag(SYSTEM_ID, "roll");
  if (!st?.actorUuid) return;
  const actor = await foundry.utils.fromUuid(st.actorUuid);
  if (!isSpectre(actor)) return;
  const { evaluate } = await import("../dice/roll.mjs");
  if (evaluate(st.values, st).outcome !== "botch") return;
  const w = actor._source.system.wraith;
  if (w.spectre.psyche.catharsis) {
    await actor.update({ "system.wraith.spectre.psyche.pool": Math.max(0, w.spectre.psyche.pool - 1) });
    return say(actor, "fa-dove", t("Spectre.BotchPsyche", { name: esc(actor.name) }), "is-psyche");
  }
  await actor.update({ "system.wraith.corpus": Math.max(0, w.corpus - 1) });
  return say(actor, "fa-skull", t("Spectre.BriefLife", { name: esc(actor.name), n: Math.max(0, w.corpus - 1) }), "is-shadow");
});

/** Рейтинг Пафоса Психеи дошёл до 10 — Искупление: дальше решает рассказчик (ему шёпотом). */
Hooks.on("updateActor", (actor, diff, opts, userId) => {
  if (userId !== game.user.id || !isSpectre(actor)) return;
  const r = foundry.utils.getProperty(diff, "system.wraith.spectre.psyche.rating");
  if (r >= 10) ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<div class="r-notice r-type-wraith is-psyche"><i class="fa-solid fa-sun"></i> ${t("Spectre.Redemption", { name: esc(actor.name) })}</div>` });
});
