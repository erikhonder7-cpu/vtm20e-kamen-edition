// module/apps/possession.mjs
// Завладение телом поклонника у Привязанного (Earthbound, гл. 3 «Врождённые способности», «Завладение и битва»).
//   · Только верующий — поклонник или слуга, согласный умереть за господина: он касается реликвария; бросок Веры.
//     Неудача — снова на следующем ходу; провал — этим человеком больше никогда (system.possession.banned).
//   · В теле: Характеристики и Способности тела (плюс Потребности), свои Способности и Вера; облик — броском Веры.
//   · Тело живёт 48 часов хроники с завладения; каждый потраченный в теле пункт Веры — минус час; каждый лишний час —
//     бросок Веры. Срок вышел — тело гибнет (по первичному Знанию: огонь, камень, яд, прах), Привязанный — в реликварии.
//     Покинул тело раньше — человек всё равно умрёт в свой срок.
//   · Срок вышел в бою — рассказчик тайно бросает Выносливость тела, сл. 8: успехи — сколько ходов оно ещё держится;
//     провал — рассыпается сразу, Привязанный теряет пункт временной Воли; трата Веры в эти ходы — тело гибнет тут же.

import { SYSTEM_ID } from "../config.mjs";
import { rollPool } from "../dice/roll.mjs";
import { getClock } from "./calendar.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Possess.${k}`, d) : game.i18n.localize(`VTM20.Possess.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const HOUR = 3600000, LIFE = 48;
const notice = (actor, icon, html, cls = "is-form") => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-demon ${cls}"><i class="fa-solid ${icon}"></i> ${html}</div>` });

/** Сколько часов ещё живёт тело: 48 + продлённые − потраченная Вера − прошедшие часы хроники. */
export function hoursLeft(actor) {
  const p = actor.system.possession;
  if (!p?.name) return null;
  return Math.floor(LIFE + (p.extended ?? 0) - (p.spent ?? 0) - (getClock() - (p.start ?? 0)) / HOUR);
}

/** Сводка для листа. */
export function possessionView(actor) {
  const p = actor.system.possession;
  if (!actor.system.earthbound) return null;
  return { on: !!p?.name, name: p?.name ?? "", uuid: p?.uuid ?? "", left: hoursLeft(actor), spent: p?.spent ?? 0, extended: p?.extended ?? 0 };
}

/** Завладеть поклонником: выбор (слуги из договоров, смертные-актёры или имя словами) и бросок Веры. */
export async function possess(actor) {
  const s = actor.system;
  if (!s.earthbound) return null;
  if (s.possession?.name) return ui.notifications.warn(t("Already", { name: s.possession.name }));
  const banned = s.possession?.banned ?? [];
  const pool = [...(s.thralls ?? []).filter(x => x.name).map(x => ({ name: x.name, uuid: x.uuid })),
    ...game.actors.filter(a => a.type === "mortal" && a.system.thrall?.master === actor.uuid).map(a => ({ name: a.name, uuid: a.uuid }))]
    .filter((x, i, arr) => arr.findIndex(y => y.name === x.name) === i);
  const content = `<p class="r-choice-hint">${t("Hint")}</p><div class="r-fields">
    ${pool.length ? `<label class="r-f is-span2"><span>${t("Who")}</span><select name="who"><option value="">—</option>${pool.map((x, i) =>
      `<option value="${i}" ${banned.includes(x.name) ? "disabled" : ""}>${esc(x.name)}${banned.includes(x.name) ? ` · ${t("Banned")}` : ""}</option>`).join("")}</select></label>` : ""}
    <label class="r-f is-span2"><span>${t("WhoText")}</span><input type="text" name="text" placeholder="${esc(t("WhoPh"))}"></label></div>`;
  const v = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Title") }, classes: ["vtm20", "r-dialog"], position: { width: 460 }, content,
    ok: { label: t("Try"), callback: (ev, btn) => { const f = btn.form.elements; const x = f.who?.value ? pool[Number(f.who.value)] : null;
      return x ? x : f.text.value.trim() ? { name: f.text.value.trim(), uuid: "" } : null; } }
  }).catch(() => null);
  if (!v) return null;
  if (banned.includes(v.name)) return ui.notifications.warn(t("BannedWarn", { name: v.name }));
  const res = await rollPool({ actor, title: t("Title"), subtitle: v.name, pool: s.faith.permanent, difficulty: 6, kind: "possess",
    breakdown: [{ label: game.i18n.localize("VTM20.Demon.Faith"), value: s.faith.permanent }] });
  if (res.outcome === "botch") {
    await actor.update({ "system.possession.banned": [...banned, v.name] });
    return notice(actor, "fa-ban", t("Botch", { name: esc(actor.name), who: esc(v.name) }), "is-sin");
  }
  if (res.successes === 0) { await notice(actor, "fa-rotate", t("Fail", { name: esc(actor.name), who: esc(v.name) })); return res; }
  // в теле: дух не сгущает тело из Веры — форма Привязанного без носителя снимается
  await actor.update({ "system.possession.name": v.name, "system.possession.uuid": v.uuid, "system.possession.start": getClock(),
    "system.possession.spent": 0, "system.possession.extended": 0, "system.apocalyptic": false });
  await notice(actor, "fa-person-rays", t("Done", { name: esc(actor.name), who: esc(v.name), h: LIFE }));
  return res;
}

/** Продлить жизнь тела на час: бросок Веры. */
export async function extend(actor) {
  const s = actor.system;
  if (!s.possession?.name) return null;
  const res = await rollPool({ actor, title: t("Extend"), subtitle: s.possession.name, pool: s.faith.permanent, difficulty: 6, kind: "possessExtend",
    breakdown: [{ label: game.i18n.localize("VTM20.Demon.Faith"), value: s.faith.permanent }] });
  if (res.successes > 0) {
    await actor.update({ "system.possession.extended": (s.possession.extended ?? 0) + 1 });
    await notice(actor, "fa-hourglass-half", t("Extended", { who: esc(s.possession.name), h: hoursLeft(actor) }));
  }
  return res;
}

/** Покинуть тело раньше срока (человек всё равно обречён) или тело погибло — Привязанный в реликварии. */
export async function leave(actor, died = false) {
  const p = actor.system.possession;
  if (!p?.name) return null;
  await actor.update({ "system.possession.name": "", "system.possession.uuid": "", "system.apocalyptic": false });
  return notice(actor, died ? "fa-skull" : "fa-gem", t(died ? "Died" : "LeftEarly", { name: esc(actor.name), who: esc(p.name) }), died ? "is-sin" : "is-form");
}

/** Срок вышел посреди боя: тайный бросок Выносливости тела, сл. 8 — сколько ходов оно ещё держится. */
export async function battleExpiry(actor) {
  const p = actor.system.possession;
  if (!p?.name) return null;
  const host = p.uuid ? await fromUuid(p.uuid) : null;
  const stamina = host?.system?.attributes?.stamina?.value ?? 2;
  const res = await rollPool({ actor, title: t("Battle"), subtitle: p.name, pool: stamina, difficulty: 8, kind: "possessBattle",
    breakdown: [{ label: actor.traitLabel("attributes.stamina"), value: stamina }], messageMode: "gm" });
  if (res.outcome === "botch" || res.successes === 0) {
    const w = actor.system.willpower;
    if (res.outcome === "botch") await actor.update({ "system.willpower.temporary": Math.max(0, w.temporary - 1) });
    await leave(actor, true);
    if (res.outcome === "botch") await notice(actor, "fa-heart-crack", t("BattleBotch", { name: esc(actor.name) }), "is-sin");
  } else await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<div class="r-notice r-type-demon is-form"><i class="fa-solid fa-hourglass-end"></i> ${t("BattleTurns", { who: esc(p.name), n: res.successes })}</div>` });
  return res;
}

/** Вера, потраченная в теле, сокращает его жизнь: хук изменения листа (до — после), часы хроники — по срокам. */
export function registerPossession() {
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    if (actor.type === "demon" && actor.system.possession?.name && (foundry.utils.hasProperty(changes, "system.faith") || foundry.utils.hasProperty(changes, "system.reliquary")))
      options.faithBefore = actor.system.faith.temporary + (actor.system.reliquary?.faith ?? 0);
  });
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (options.faithBefore == null || userId !== game.user.id || options.possessIgnore) return;
    const spent = options.faithBefore - (actor.system.faith.temporary + (actor.system.reliquary?.faith ?? 0));
    if (spent > 0 && actor.system.possession?.name)
      actor.update({ "system.possession.spent": (actor.system.possession.spent ?? 0) + spent }, { possessIgnore: true });
  });
  // часы хроники: срок вышел — тело гибнет (пишет активный рассказчик)
  Hooks.on("updateSetting", s => {
    if (s.key !== `${SYSTEM_ID}.clock` || game.user !== game.users.activeGM) return;
    for (const a of game.actors.filter(x => x.type === "demon" && x.system.possession?.name))
      if (hoursLeft(a) <= 0) leave(a, true);
  });
}
