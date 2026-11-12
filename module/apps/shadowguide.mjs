// module/apps/shadowguide.mjs
// Проводник-Тень (Wraith 20, гл. 6, «Shadowguiding»): Тень призрака ведёт другой игрок. Рассказчик назначает его сам или тянет
// жребий — имена призраков в шляпу, каждый игрок вытягивает чужого. Проводник видит лист Психеи (только чтение), шепчет ей от лица
// Тени (другие призраки Круга голоса не слышат), бросает Тёмные Страсти и предлагает Теневые кубики — предложение идёт Психее
// напрямую, принять или отказаться решает её игрок. Всё, что проводник меняет в чужом листе (Ангст), проходит через ведущего (сокет).

import { SYSTEM_ID } from "../config.mjs";
import { t, esc, pick, gainAngst, rollShadowDice, guidePath } from "./wraith.mjs";

const CHANNEL = `system.${SYSTEM_ID}`;
const OBSERVER = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;

/** Игроки (не ведущие), которым принадлежит призрак, — его Психея. */
export const psycheUsers = actor => game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
/** Текущий пользователь — проводник этой Тени. */
export const isGuide = (actor, user = game.user) => !!user && !!actor && foundry.utils.getProperty(actor, guidePath(actor)) === user.id;
/** Спектр: проводник ведёт Психею (гл. 10). */
const isSpectre = actor => !!actor?.system?.wraith?.spectre?.on;
/** Предлагать кубики может проводник или рассказчик (если у призрака есть игрок — иначе он бросает сам). */
export const canOffer = actor => isGuide(actor) || (game.user.isGM && psycheUsers(actor).length > 0);

/** Послать ведущему: действие в чужом листе. Без ведущего в игре — нельзя. */
export function relay(op, data) {
  if (!game.users.activeGM) { ui.notifications.warn(t("Guide.NoGM")); return null; }
  game.socket.emit(CHANNEL, { op, user: game.user.id, ...data });
  return true;
}

/** Ведущий: назначить проводника (id пользователя или "" — Тень ведёт рассказчик). Проводнику — право чтения листа. */
export async function setGuide(actor, id = "") {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  const path = guidePath(actor), old = foundry.utils.getProperty(actor, path);
  if (old === id) return actor;
  const prev = { ...(actor.getFlag(SYSTEM_ID, "guidePrev") ?? {}) }, upd = { [path]: id };
  if (old && game.users.get(old)) {
    upd[`ownership.${old}`] = prev[old] ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT;
    delete prev[old];
  }
  if (id) {
    const cur = actor.ownership[id];
    prev[id] = cur ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT;
    if ((cur ?? -1) < OBSERVER()) upd[`ownership.${id}`] = OBSERVER();
  }
  upd[`flags.${SYSTEM_ID}.guidePrev`] = prev;
  await actor.update(upd);
  const user = game.users.get(id);
  if (user) await ChatMessage.create({ whisper: [user.id], speaker: { alias: t("Guide.Title") },
    content: `<div class="r-notice r-type-wraith is-shadow"><i class="fa-solid fa-mask"></i> ${t(isSpectre(actor) ? "Guide.YouArePsyche" : "Guide.YouAre", { name: esc(actor.name) })}</div>` });
  return actor;
}

/** Ведущий: кто ведёт Тень — карточками (игроки, кроме самой Психеи; рассказчик; жребий для всех). */
export async function assignGuide(actor) {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  const own = new Set(psycheUsers(actor).map(u => u.id)), cur = foundry.utils.getProperty(actor, guidePath(actor));
  const cards = [
    { key: "-", icon: "fa-book-skull", title: t("Guide.Storyteller"), sub: t("Guide.StorytellerSub"), disabled: !cur },
    ...game.users.filter(u => !u.isGM && !own.has(u.id)).map(u => ({ key: u.id, icon: "fa-user-secret", title: u.name,
      sub: u.character ? u.character.name : t("Guide.Player"), disabled: u.id === cur })),
    { key: "*", icon: "fa-hat-wizard", title: t("Guide.Draw"), sub: t("Guide.DrawSub") }
  ];
  const key = await pick(t(isSpectre(actor) ? "Guide.TitlePsyche" : "Guide.Title"), cards, { lead: t(isSpectre(actor) ? "Guide.PickLeadPsyche" : "Guide.PickLead", { name: actor.name }) });
  if (!key) return null;
  if (key === "*") return drawGuides();
  return setGuide(actor, key === "-" ? "" : key);
}

/** Главный игрок призрака: тот, чей это персонаж, иначе первый владелец. */
const psycheOf = a => psycheUsers(a).find(u => u.character?.id === a.id) ?? psycheUsers(a)[0];

/** Жребий (гл. 6, «Getting Started»): каждому призраку игроков — проводник из других игроков, никто не тянет своего. */
export async function drawGuides() {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  // жребий — и для Спектров игроков: их проводник ведёт Психею
  const ghosts = game.actors.filter(a => a.type === "wraith" && psycheOf(a));
  const owners = ghosts.map(a => psycheOf(a).id);
  let hat = null;
  for (let i = 0; i < 300 && !hat; i++) {
    const h = [...owners].sort(() => Math.random() - 0.5);
    if (h.every((u, k) => u !== owners[k])) hat = h;
  }
  if (!hat) return ui.notifications.warn(t("Guide.DrawFail"));
  for (const [k, a] of ghosts.entries()) await setGuide(a, hat[k]);
  await ChatMessage.create({ content: `<div class="r-notice r-type-wraith is-shadow"><i class="fa-solid fa-hat-wizard"></i> ${t("Guide.DrawDone", { n: ghosts.length })}</div>` });
  return hat;
}

/** Шёпот Тени: только Психее (и проводнику с ведущим) — от лица Тени. */
export async function shadowWhisper(actor) {
  if (!isGuide(actor) && !game.user.isGM) return ui.notifications.warn(t("Guide.NotYours"));
  const text = await foundry.applications.api.DialogV2.prompt({ window: { title: t("Guide.Whisper") }, classes: ["vtm20", "r-dialog"],
    content: `<label class="r-f"><span>${t("Guide.WhisperLead", { name: esc(actor.name) })}</span><textarea name="w" rows="3" placeholder="${esc(t("Guide.WhisperPh"))}"></textarea></label>`,
    ok: { label: t("Guide.Send"), callback: (ev, btn) => btn.form.elements.w.value.trim() }, rejectClose: false });
  if (!text) return null;
  const to = [...new Set([...psycheUsers(actor).map(u => u.id), game.user.id])];
  return ChatMessage.create({ whisper: to, speaker: { alias: t(isSpectre(actor) ? "Guide.FromPsyche" : "Guide.From", { name: actor.name }) },
    content: `<div class="r-notice r-type-wraith is-shadow r-wr-whisper"><i class="fa-solid fa-mask"></i> <i>${esc(text).replace(/\n/g, "<br>")}</i></div>` });
}

/** Тень предлагает Теневые кубики (гл. 6): до 5, с условием; Психея решает кнопками в чате. */
export async function offerShadowDice(actor) {
  // Психея Спектра предлагает кубики не больше своего рейтинга Пафоса (гл. 10); Тень — до 5
  const psy = isSpectre(actor), max = psy ? Math.max(1, actor.system.wraith.spectre.psyche.rating) : 5;
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: t(psy ? "Guide.OfferPsyche" : "Guide.Offer") }, classes: ["vtm20", "r-dialog"],
    content: `<p class="r-note">${t(psy ? "Guide.OfferLeadPsyche" : "Guide.OfferLead", { n: max })}</p>
      <label class="r-f"><span>${t("Guide.OfferN")}</span><input type="number" name="n" value="${Math.min(2, max)}" min="1" max="${max}"></label>
      <label class="r-f"><span>${t("Guide.OfferTerms")}</span><input type="text" name="terms" placeholder="${esc(t("Guide.OfferTermsPh"))}"></label>`,
    ok: { label: t("Guide.OfferSend"), callback: (ev, btn) => ({ n: Number(btn.form.elements.n.value), terms: btn.form.elements.terms.value.trim() }) },
    rejectClose: false });
  const n = Math.clamp(Math.round(res?.n || 0), 0, max);
  if (!n) return null;
  const to = [...new Set([...psycheUsers(actor).map(u => u.id), ...game.users.filter(u => u.isGM).map(u => u.id), game.user.id])];
  return ChatMessage.create({ whisper: to, speaker: { alias: t(psy ? "Guide.FromPsyche" : "Guide.From", { name: actor.name }) },
    flags: { [SYSTEM_ID]: { shadowOffer: { actor: actor.uuid, n, state: "open", by: game.user.id } } },
    content: `<div class="r-notice r-type-wraith ${psy ? "is-psyche" : "is-shadow"} r-wr-offer"><p><i class="fa-solid fa-dice"></i> ${t(psy ? "Guide.OfferMsgPsyche" : "Guide.OfferMsg", { name: esc(actor.name), n })}</p>
      ${res.terms ? `<p><i>«${esc(res.terms)}»</i></p>` : ""}<p><small>${t(psy ? "Guide.OfferNotePsyche" : "Guide.OfferNote")}</small></p>
      <div class="r-wr-offer-tools"></div></div>` });
}

/** Закрыть предложение: автор или ведущий правят сообщение сами, игрок Психеи — через ведущего. */
async function closeOffer(msg, state, r = null) {
  const hits = Number(r?.hits) || 0, ones = Number(r?.ones) || 0;
  const patch = { [`flags.${SYSTEM_ID}.shadowOffer`]: { state, hits, ones } };
  if (msg.canUserModify(game.user, "update")) return msg.update(patch);
  return relay("offer", { message: msg.id, state, hits, ones });
}

/** Психея отвечает на предложение. */
export async function answerOffer(msg, accept) {
  const o = msg.flags?.[SYSTEM_ID]?.shadowOffer, actor = o && fromUuidSync(o.actor);
  if (!actor || o.state !== "open") return null;
  if (!actor.isOwner) return ui.notifications.warn(t("Guide.PsycheOnly"));
  if (!accept) return closeOffer(msg, "declined");
  const r = await rollShadowDice(actor, o.n);
  if (!r) return null;
  return closeOffer(msg, "accepted", r);
}

/** Карточка предложения: кнопки — только владельцу призрака и пока предложение открыто. */
Hooks.on("renderChatMessageHTML", (msg, html) => {
  const o = msg.flags?.[SYSTEM_ID]?.shadowOffer;
  const box = o && html.querySelector(".r-wr-offer-tools");
  if (!box) return;
  const actor = fromUuidSync(o.actor);
  if (o.state !== "open") {
    box.innerHTML = `<p class="r-wr-offer-state is-${o.state}"><i class="fa-solid ${o.state === "accepted" ? "fa-check" : "fa-xmark"}"></i> ${o.state === "accepted" ? `${t("Guide.Accepted")} — ${t("ShadowDiceOut", { hits: Number(o.hits) || 0, ones: Number(o.ones) || 0 })}` : t("Guide.Declined")}</p>`;
    return;
  }
  if (!actor?.isOwner) { box.innerHTML = `<p class="r-wr-offer-state"><i class="fa-solid fa-hourglass-half"></i> ${t("Guide.Waiting")}</p>`; return; }
  box.innerHTML = `<button type="button" class="r-btn" data-r-offer="yes"><i class="fa-solid fa-check"></i> ${t("Guide.Accept")}</button>
    <button type="button" class="r-btn" data-r-offer="no"><i class="fa-solid fa-xmark"></i> ${t("Guide.Decline")}</button>`;
  box.addEventListener("click", ev => {
    const b = ev.target.closest("[data-r-offer]");
    if (!b) return;
    box.querySelectorAll("button").forEach(x => { x.disabled = true; });
    answerOffer(msg, b.dataset.rOffer === "yes");
  });
});

/** Ведущий исполняет просьбы проводника и Психеи — проверив, что просит тот, кому можно. */
Hooks.once("ready", () => game.socket.on(CHANNEL, async d => {
  if (!d?.op || !game.users.activeGM?.isSelf) return;
  const user = game.users.get(d.user);
  if (!user) return;
  if (d.op === "angst") {
    const actor = fromUuidSync(d.actor);
    if (actor?.type !== "wraith" || !isGuide(actor, user)) return;
    const n = Math.clamp(Math.round(Number(d.n) || 0), -10, 10), reason = String(d.reason ?? "");
    // у Спектра проводник ведёт Психею: её Пафос (apps/spectre.mjs)
    if (isSpectre(actor)) await (await import("./spectre.mjs")).gainPsyche(actor, n, { reason });
    else await gainAngst(actor, n, { reason });
  } else if (d.op === "thorn") {   // ответ Психеи на Шип (apps/thorns.mjs)
    const msg = game.messages.get(d.message), f = msg?.flags?.[SYSTEM_ID]?.thorn, actor = f && fromUuidSync(f.actor);
    if (!actor || f.state !== "open" || !actor.testUserPermission(user, "OWNER") || !["resisted", "failed", "cancelled", "accepted", "declined", "pactDone"].includes(d.state)) return;
    if (f.dare) return;   // Вызов дьявола закрывает только рассказчик
    await msg.update({ [`flags.${SYSTEM_ID}.thorn.state`]: d.state, [`flags.${SYSTEM_ID}.thorn.hits`]: Math.max(0, Number(d.hits) || 0) });
  } else if (d.op === "offer") {
    const msg = game.messages.get(d.message), o = msg?.flags?.[SYSTEM_ID]?.shadowOffer, actor = o && fromUuidSync(o.actor);
    if (!actor || o.state !== "open" || !actor.testUserPermission(user, "OWNER") || !["accepted", "declined"].includes(d.state)) return;
    await msg.update({ [`flags.${SYSTEM_ID}.shadowOffer`]: { state: d.state, hits: Math.max(0, Number(d.hits) || 0), ones: Math.max(0, Number(d.ones) || 0) } });
  }
}));
