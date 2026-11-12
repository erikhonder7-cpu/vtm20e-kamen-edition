// module/apps/underworld.mjs
// Подземный мир (Wraith 20, гл. 8 «Системы» и приложение «Orpheus») — инструменты рассказчика и броски призрака:
//   · Мальстрём: сила в Колоколах 1–5 (6 — Великий: как 5, но страшнее); урон за ход — 4/6/8/12/16 кубиков, сл. 6, поглощение
//     Выносливостью (сл. 6); Обиталище снижает Колокола на свой рейтинг (0 и меньше — полная защита). Вид урона книга не называет —
//     летальный (правило системы). Опасности: Завывающие ветра, Ледяной дождь, Изолирующий туман, Испепеляющая молния.
//   · Туман: реакция смертного по его Воле (1 — каталепсия … 10 — никакой); детей, животных и одарённых не берёт.
//   · Сон в Оковах (8 часов): весь ударный урон уходит, Выносливость (сл. 6) — по летальному уровню за успех; рейтинг Оков (сл. 4) —
//     Воля за успех.
//   · «Орфей»: Спаривание в Круге — 1 Пафос, польза по Оттенку донора; Пафос делят касанием; Пигмент — курение, таблетки, укол,
//     (8 − Выносливость) часов.
//   · Оттенки цвета (призраки пигмента): Тихая Тень, 3 Пятна, все проявить — 1 Пафос, Пафос не выше 7.

import { RollDialog } from "../dice/dialog.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { W, t, esc, say, corpusDamage, spendPathos, backgroundRating, pick } from "./wraith.mjs";

const BELLS = [0, 4, 6, 8, 12, 16];
const HAZARDS = ["winds", "rain", "fog", "lightning"];
const FOG = ["", "catatonia", "panic", "disbelief", "berserk", "terror", "appeasement", "fear", "curiosity", "rage", "none"];
const d10 = async n => n > 0 ? (await new Roll(`${n}d10`).evaluate()).dice[0].results.map(r => r.result) : [];
const hits = (vals, diff) => Math.max(0, vals.filter(v => v >= diff).length - vals.filter(v => v === 1).length);

/** Призраки на сцене: выбранные жетоны, иначе все жетоны призраков сцены. */
function sceneWraiths() {
  const picked = canvas?.tokens?.controlled?.map(t => t.actor).filter(a => a?.type === "wraith") ?? [];
  if (picked.length) return picked;
  return [...new Set((canvas?.scene?.tokens ?? []).map(t => t.actor).filter(a => a?.type === "wraith"))];
}

/* ── Мальстрём ──────────────────────────────────────────────────────── */

export async function maelstrom() {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  const bells = Number(await pick(t("Storm.Title"), [1, 2, 3, 4, 5, 6].map(n => ({ key: String(n), icon: "fa-bell",
    title: t(n === 6 ? "Storm.Great" : "Storm.Bells", { n }), sub: t("Storm.Dice", { n: BELLS[Math.min(5, n)] }) })), { lead: t("Storm.Lead") }));
  if (!bells) return null;
  const list = sceneWraiths();
  if (!list.length) return ui.notifications.warn(t("Storm.NoWraiths"));
  const rows = [];
  for (const a of list) {
    const haunt = a.getFlag(SYSTEM_ID, "inHaunt") ? backgroundRating(a, "Haunt") : 0, eff = Math.min(5, bells) - haunt;
    if (eff <= 0) { rows.push(`<li><b>${esc(a.name)}</b>: ${esc(t("Storm.Sheltered", { n: haunt }))}</li>`); continue; }
    const dmg = hits(await d10(BELLS[eff]), 6), soakVals = await d10(a.soakPool("lethal") + haunt), soaked = Math.min(dmg, hits(soakVals, 6));
    const net = dmg - soaked;
    if (net > 0) await corpusDamage(a, net, "lethal");
    rows.push(`<li><b>${esc(a.name)}</b>: ${esc(t("Storm.Hit", { dmg, soaked, net, bells: eff }))}</li>`);
  }
  return ChatMessage.create({ flags: { [SYSTEM_ID]: { storm: { bells } } },
    content: `<div class="r-notice r-type-wraith r-wr-storm"><p><i class="fa-solid fa-hurricane"></i> <b>${esc(t(bells === 6 ? "Storm.Great" : "Storm.Bells", { n: bells }))}</b></p>
      <ul>${rows.join("")}</ul><p><small>${esc(t("Storm.Note"))}</small></p>
      <div class="r-card-buttons">${HAZARDS.map(h => `<button type="button" data-r-storm="${h}"><i class="fa-solid ${{ winds: "fa-wind", rain: "fa-cloud-showers-heavy", fog: "fa-smog", lightning: "fa-bolt" }[h]}"></i> ${esc(t(`Storm.Hz.${h}`))}</button>`).join("")}</div></div>` });
}

/** Опасность Мальстрёма для призрака (жетон выбран или свой персонаж). */
async function hazard(h, bells) {
  const a = canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character;
  if (a?.type !== "wraith") return ui.notifications.warn(t("Storm.PickWraith"));
  const diff = Math.min(10, 5 + Math.min(5, bells));
  if (h === "winds") return RollDialog.prompt(a, { title: t("Storm.Hz.winds"), trait1: "attributes.perception", trait2: "abilities.empathy", difficulty: diff, lockTraits: true,
    diffNote: t("Storm.HzNote.winds"), extra: { wraith: { kind: "storm", hz: "winds" } },
    onRolled: async r => { if (!((r?.successes ?? 0) > 0)) { await a.spendWillpower(1); return say(a, "fa-wind", t("Storm.WindsLost", { name: esc(a.name) })); } } });
  if (h === "lightning") {
    const top = Math.max(0, ...a.system.wraith.fetters.map(f => f.value));
    return RollDialog.prompt(a, { title: t("Storm.Hz.lightning"), pool: top, difficulty: diff, lockTraits: true, diffNote: t("Storm.HzNote.lightning", { n: bells }),
      extra: { wraith: { kind: "storm", hz: "lightning" } } });
  }
  if (h === "rain") {
    const dmg = hits(await d10(Math.ceil(BELLS[Math.min(5, bells)] / 2)), 6), soaked = Math.min(dmg, hits(await d10(a.soakPool("lethal")), 6));
    let left = dmg - soaked;
    const p = a.system.wraith.pathos.value, fromP = Math.min(p, left);
    if (fromP) await a.update({ "system.wraith.pathos.value": p - fromP });
    left -= fromP;
    if (left) await a.update({ "system.willpower.temporary": Math.max(0, a.system.willpower.temporary - left) });
    return say(a, "fa-cloud-showers-heavy", t("Storm.Rain", { name: esc(a.name), dmg, soaked, p: fromP, w: left }));
  }
  return say(a, "fa-smog", t("Storm.Fog", { name: esc(a.name), n: Math.min(10, bells) }));
}

/* ── Туман ──────────────────────────────────────────────────────────── */

/** Туман: реакция выбранных смертных на призрака — по их постоянной Воле. */
export async function fog() {
  const living = (canvas?.tokens?.controlled ?? []).map(x => x.actor).filter(a => a && a.type !== "wraith" && a.type !== "spirit");
  if (!living.length) return ui.notifications.warn(t("Fog.PickLiving"));
  const rows = living.map(a => {
    const sup = ["vampire", "werewolf", "mage", "demon"].includes(a.type), wp = Math.clamp(a.system.willpower?.permanent ?? 3, 1, 10);
    return `<li><b>${esc(a.name)}</b> (${t("Fog.Will", { n: wp })}): ${esc(sup ? t("Fog.Supernatural") : t(`Fog.R.${FOG[wp]}`))}</li>`;
  });
  return ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<div class="r-notice r-type-wraith"><p><i class="fa-solid fa-smog"></i> <b>${esc(t("Fog.Title"))}</b></p><ul>${rows.join("")}</ul><p><small>${esc(t("Fog.Note"))}</small></p></div>` });
}

/* ── Сон в Оковах ───────────────────────────────────────────────────── */

export async function slumber(actor) {
  const fetters = actor.system.wraith.fetters.map((f, i) => ({ ...f, i })).filter(f => f.value > 0);
  if (!fetters.length) return ui.notifications.warn(t("Slumber.NoFetters"));
  const pickI = fetters.length === 1 ? String(fetters[0].i) : await pick(t("Slumber.Title"), fetters.map(f => ({ key: String(f.i), icon: "fa-link", title: f.text || "—", sub: "•".repeat(f.value) })));
  if (pickI == null) return null;
  const f = actor.system.wraith.fetters[Number(pickI)], h = foundry.utils.deepClone(actor._source.system.health);
  // Шип «Жизнь Тени»: Психея уснула — Тень берёт тело (рассказчику и проводнику)
  const TH = await import("./thorns.mjs");
  if (TH.hasThorn(actor, "shadowlife")) await TH.lifeReminder(actor);
  const bashing = h.bashing; h.bashing = 0;
  const heal = hits(await d10(actor.system.attributes.stamina.total), 6), lethal = Math.min(h.lethal, heal); h.lethal -= lethal;
  const will = hits(await d10(f.value), 4), w = actor.system.willpower, wNow = Math.min(w.permanent, w.temporary + will);
  await actor.update({ "system.health": h, "system.willpower.temporary": wNow });
  return say(actor, "fa-bed", t("Slumber.Done", { name: esc(actor.name), fetter: esc(f.text || "—"), b: bashing, l: lethal, w: wNow - w.temporary }));
}

/* ── «Орфей»: Круг, Спаривание, Пигмент ──────────────────────────────── */

const projectors = except => game.actors.filter(a => a.type === "wraith" && a.system.wraith.projector?.on && a.id !== except.id && a.isOwner);

/** Спаривание (Yoking): 1 Пафос донора — польза бенефициару по Оттенку донора. */
export async function yoke(actor) {
  const shade = actor.system.wraith.projector?.shade;
  if (!shade) return ui.notifications.warn(t("Orph.NeedShade"));
  const list = projectors(actor);
  const to = list.length ? await pick(t("Orph.Yoke"), list.map(a => ({ key: a.id, icon: "fa-user", title: a.name }))) : null;
  if (list.length && !to) return null;
  if (!(await spendPathos(actor, 1))) return null;
  return say(actor, "fa-link", t("Orph.Yoked", { name: esc(actor.name), to: esc(game.actors.get(to)?.name ?? t("Orph.Someone")), what: t(`Orph.YokeFx.${shade}`) }));
}

/** Пафос — касанием члену Круга. */
export async function sharePathos(actor) {
  const list = projectors(actor).concat(game.actors.filter(a => a.type === "wraith" && !a.system.wraith.projector?.on && a.isOwner && a.id !== actor.id));
  const to = await pick(t("Orph.Share"), list.map(a => ({ key: a.id, icon: "fa-hand-holding-heart", title: a.name, sub: t("Orph.PathosOf", { n: a.system.wraith.pathos.value }) })));
  if (!to) return null;
  const b = game.actors.get(to), room = Math.max(0, (b.system.wraith.pathos.max ?? 10) - b.system.wraith.pathos.value);
  const n = Math.min(actor.system.wraith.pathos.value, room, 3);
  if (!n) return ui.notifications.warn(t("Orph.NoRoom"));
  await actor.update({ "system.wraith.pathos.value": actor.system.wraith.pathos.value - n });
  await b.update({ "system.wraith.pathos.value": b.system.wraith.pathos.value + n });
  return say(actor, "fa-hand-holding-heart", t("Orph.Shared", { name: esc(actor.name), to: esc(b.name), n }));
}

/** Пигмент: способ приёма — штраф, Воля, проекция; длится 8 − Выносливость часов. */
export async function pigment(actor) {
  const how = await pick(t("Orph.Pigment"), ["smoke", "pill", "shot"].map(k => ({ key: k, icon: { smoke: "fa-smoking", pill: "fa-capsules", shot: "fa-syringe" }[k],
    title: t(`Orph.Pig.${k}`), sub: t(`Orph.PigSub.${k}`) })), { lead: t("Orph.PigmentLead") });
  if (!how) return null;
  const hours = Math.max(1, 8 - (actor.system.attributes.stamina?.total ?? 1));
  return say(actor, "fa-droplet", t("Orph.PigmentTaken", { name: esc(actor.name), how: t(`Orph.Pig.${how}`), fx: t(`Orph.PigSub.${how}`), h: hours }), "is-shadow");
}

/** Оттенок цвета: проявить все Пятна на сцену за 1 Пафос. */
export async function hueStains(actor) {
  if (!(await spendPathos(actor, 1))) return null;
  await actor.update({ "system.wraith.projector.stains": actor._source.system.wraith.projector.stains.map(s => ({ ...s, shown: true })) });
  return say(actor, "fa-droplet", t("Hue.AllShown", { name: esc(actor.name) }), "is-shadow");
}

/* ── Кнопки карточек ────────────────────────────────────────────────── */

Hooks.on("renderChatMessageHTML", (msg, html) => {
  const st = msg.flags?.[SYSTEM_ID]?.storm;
  if (!st) return;
  html.addEventListener("click", ev => {
    const b = ev.target.closest("[data-r-storm]");
    if (b) hazard(b.dataset.rStorm, st.bells);
  });
});

export { W };
