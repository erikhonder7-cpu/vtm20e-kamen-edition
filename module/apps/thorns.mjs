// module/apps/thorns.mjs
// Шипы Тени в игре (Wraith 20, гл. 6, таблица Шипов): применяет проводник-Тень или рассказчик — тратит временный Ангст, бросает,
// что положено, и сообщает тем, кому положено (рассказчику и проводнику; Психее — если она это чувствует или может ответить).
// Ответ Психеи — кнопками в чате: сопротивление Волей (Кошмары, Оговорка по Фрейду), отмена за Волю (Медовый язык),
// согласие на лишнее действие (Теневая игра). Вызов дьявола закрывает рассказчик в конце сессии.
// Пассивные Шипы (Аура порчи, Лицо Тени, Черты Тени, Жизнь Тени…) кнопки не имеют — их текст на листе.

import { SYSTEM_ID } from "../config.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { t, esc, thornOf, gainAngst, spendPathos, guideOf } from "./wraith.mjs";
import { psycheUsers, isGuide, relay } from "./shadowguide.mjs";

/**
 * Что делает Шип: angst — цена в Ангсте (число или "ask" — сколько вложить); roll — бросок Тени (pool: "temp"/"perm"/число,
 * diff или diffAsk); note — пояснение проводника; who — кому сообщить (gm — рассказчику и проводнику, psyche — и Психее,
 * all — всем); resist / cancel / offer / dare — ответ в чате.
 */
export const THORNS = {
  badluck: { angst: "ask", max: 5, who: "psyche" },
  nightmares: { angst: 1, who: "psyche", resist: { diff: 6, need: 1 } },
  trickofthelight: { angst: 1, who: "gm", note: true },
  honeyedtongue: { angst: 1, roll: { pool: "temp", diffAsk: true }, who: "psyche", cancel: 1, note: true },
  freudianslip: { angst: 1, who: "psyche", note: true, resist: { diff: 7, need: 2 } },
  manifestation: { angst: 4, who: "all" },
  shadowcall: { angst: 1, roll: { pool: "perm", diff: 7 }, who: "psyche" },
  taintedtouch: { angst: 0, roll: { pool: 3, diff: 6 }, who: "gm", note: true },
  mirrormirror: { angst: 0, who: "all", note: true },
  shadowplay: { angst: 0, who: "psyche", offer: true },
  devilsdare: { angst: "ask", max: 10, who: "psyche", note: true, dare: true }
};
export const thornActive = key => !!THORNS[key];
const canUse = actor => game.user.isGM || isGuide(actor);

/** Кому сообщение: рассказчикам, проводнику и тому, кто применил; Психее — если положено; всем — без шёпота. */
function audience(actor, who) {
  if (who === "all") return {};
  const ids = new Set([...game.users.filter(u => u.isGM).map(u => u.id), game.user.id, ...(guideOf(actor) ? [guideOf(actor).id] : [])]);
  if (who === "psyche") for (const u of psycheUsers(actor)) ids.add(u.id);
  return { whisper: [...ids] };
}

/** Один бросок Тени: кубики, сложность; успехи минус единицы. */
async function shadowRoll(n, diff) {
  if (n < 1) return { hits: 0, vals: [], roll: null };
  const roll = await new Roll(`${n}d10`).evaluate(), vals = roll.dice[0].results.map(x => x.result);
  return { hits: Math.max(0, vals.filter(v => v >= diff).length - vals.filter(v => v === 1).length), vals, roll };
}

/** Применить Шип строки i. */
export async function useThorn(actor, i) {
  const row = actor.system.wraith.shadow.thorns[Number(i)], spec = row && THORNS[row.key], d = row && thornOf(row.key);
  if (!spec) return null;
  if (!canUse(actor)) return ui.notifications.warn(t("Thorn.ShadowOnly"));
  const temp = actor.system.wraith.shadow.angst.temporary;
  let cost = typeof spec.angst === "number" ? spec.angst : 0, note = "", diff = spec.roll?.diff ?? 6;
  if (spec.angst === "ask" || spec.note || spec.roll?.diffAsk) {
    const f = await foundry.applications.api.DialogV2.prompt({ window: { title: d.name }, classes: ["vtm20", "r-dialog"],
      content: `<p class="r-note">${t(`Thorn.Ask.${row.key}`, { temp })}</p>
        ${spec.angst === "ask" ? `<label class="r-f"><span>${t(row.key === "badluck" ? "Thorn.Dice" : "Thorn.Invest")}</span><input type="number" name="n" value="1" min="1" max="${Math.min(spec.max, temp)}"></label>` : ""}
        ${spec.roll?.diffAsk ? `<label class="r-f"><span>${t("Thorn.TargetDiff")}</span><input type="number" name="d" value="6" min="2" max="10"></label>` : ""}
        ${spec.note ? `<label class="r-f"><span>${t("Thorn.Note")}</span><input type="text" name="note" placeholder="${esc(t(`Thorn.NotePh.${row.key}`))}"></label>` : ""}`,
      ok: { label: t("Thorn.Use"), callback: (ev, btn) => { const e = btn.form.elements; return { n: Number(e.n?.value), d: Number(e.d?.value), note: e.note?.value.trim() ?? "" }; } },
      rejectClose: false });
    if (!f) return null;
    if (spec.angst === "ask") cost = Math.clamp(Math.round(f.n || 0), 1, spec.max);
    if (spec.roll?.diffAsk) diff = Math.clamp(Math.round(f.d || 6), 2, 10);
    note = f.note;
  }
  if (cost > temp) return ui.notifications.warn(t("Thorn.NoAngst", { n: cost, temp }));
  if (cost) await gainAngst(actor, -cost, { reason: d.name });
  // бросок — после траты: Медовый язык бросает уже оставшийся временный Ангст
  let r = null;
  if (spec.roll) {
    const pool = spec.roll.pool === "temp" ? temp - cost : spec.roll.pool === "perm" ? actor.system.wraith.shadow.angst.permanent : spec.roll.pool;
    r = await shadowRoll(pool, diff);
  }
  const flag = { actor: actor.uuid, key: row.key, state: "open", n: cost,
    ...(spec.resist ? { resist: spec.resist } : {}), ...(spec.cancel ? { cancel: spec.cancel } : {}), ...(spec.offer ? { offer: true } : {}),
    ...(spec.dare ? { dare: cost } : {}) };
  const ask = spec.resist || spec.cancel || spec.offer || spec.dare;
  return ChatMessage.create({ ...audience(actor, spec.who), speaker: { alias: t("Guide.From", { name: actor.name }) }, ...(r?.roll ? { rolls: [r.roll] } : {}),
    flags: { [SYSTEM_ID]: { thorn: flag } },
    content: `<div class="r-notice r-type-wraith is-shadow r-wr-thorn-card"><p><i class="fa-solid fa-spa"></i> <b>${esc(d.name)}</b>${cost ? ` <small>(${t("Thorn.Spent", { n: cost })})</small>` : ""}</p>
      <p>${t(`Thorn.Msg.${row.key}`, { name: esc(actor.name), n: cost, h: Math.floor(cost / 2), d: diff, hits: r?.hits ?? 0 })}</p>
      ${r ? `<p><small>${t("Thorn.Rolled", { vals: r.vals.join(", ") || "—", d: diff, hits: r.hits })}</small></p>` : ""}
      ${note ? `<p><i>«${esc(note)}»</i></p>` : ""}${ask ? `<div class="r-wr-thorn-tools"></div>` : ""}</div>` });
}

/** Закрыть карточку: автор и рассказчик правят сами, игрок Психеи — через ведущего (apps/shadowguide.mjs). */
async function closeCard(msg, state, hits = 0) {
  const patch = { [`flags.${SYSTEM_ID}.thorn.state`]: state, [`flags.${SYSTEM_ID}.thorn.hits`]: Number(hits) || 0 };
  if (msg.canUserModify(game.user, "update")) return msg.update(patch);
  return relay("thorn", { message: msg.id, state, hits: Number(hits) || 0 });
}

/** Ответ Психеи (или рассказчика за неё). */
export async function answerThorn(msg, what) {
  const f = msg.flags?.[SYSTEM_ID]?.thorn, actor = f && fromUuidSync(f.actor);
  if (!actor || f.state !== "open") return null;
  if (what === "done" || what === "failed") {   // Вызов дьявола — рассказчик в конце сессии
    if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
    if (what === "done") await gainAngst(actor, Math.floor(f.dare / 2), { reason: thornOf(f.key)?.name ?? "" });
    else {
      const wp = actor.system.willpower.temporary;
      await actor.update({ "system.willpower.temporary": Math.max(0, wp - f.dare) });
    }
    return closeCard(msg, what === "done" ? "done" : "dfailed");
  }
  if (!actor.isOwner) return ui.notifications.warn(t("Guide.PsycheOnly"));
  if (what === "resist") {
    const { diff, need } = f.resist;
    return RollDialog.prompt(actor, { title: t("Thorn.ResistTitle", { thorn: thornOf(f.key)?.name ?? "" }), trait1: "willpower.permanent", difficulty: diff, lockTraits: true,
      diffNote: t("Thorn.Need", { n: need }), extra: { wraith: { kind: "thornResist", need } },
      onRolled: async res => closeCard(msg, (res?.successes ?? 0) >= need && res?.outcome !== "botch" ? "resisted" : "failed", res?.successes ?? 0) });
  }
  if (what === "cancel") {
    const wp = actor.system.willpower.temporary;
    if (wp < f.cancel) return ui.notifications.warn(t("Thorn.NoWill"));
    await actor.update({ "system.willpower.temporary": wp - f.cancel });
    return closeCard(msg, "cancelled");
  }
  if (what === "accept") {
    if (!(await spendPathos(actor, 1))) return null;
    await gainAngst(actor, 1, { reason: thornOf(f.key)?.name ?? "" });
    return closeCard(msg, "accepted");
  }
  if (what === "decline") return closeCard(msg, "declined");
  return null;
}

/** Кнопки карточки Шипа. */
Hooks.on("renderChatMessageHTML", (msg, html) => {
  const f = msg.flags?.[SYSTEM_ID]?.thorn, box = f && html.querySelector(".r-wr-thorn-tools");
  if (!box) return;
  if (f.state !== "open") {
    box.innerHTML = `<p class="r-wr-offer-state is-${f.state}"><i class="fa-solid fa-flag-checkered"></i> ${t(`Thorn.State.${f.state}`, { hits: Number(f.hits) || 0, n: f.dare ?? 0, h: Math.floor((f.dare ?? 0) / 2) })}</p>`;
    return;
  }
  const actor = fromUuidSync(f.actor), btn = (k, icon, label) => `<button type="button" class="r-btn" data-r-thorn="${k}"><i class="fa-solid ${icon}"></i> ${label}</button>`;
  let out = "";
  if (f.dare) out = game.user.isGM ? btn("done", "fa-check", t("Thorn.DareDone")) + btn("failed", "fa-xmark", t("Thorn.DareFailed")) : "";
  else if (actor?.isOwner) {
    if (f.resist) out = btn("resist", "fa-shield-halved", t("Thorn.Resist", { d: f.resist.diff, n: f.resist.need }));
    else if (f.cancel) out = btn("cancel", "fa-hand", t("Thorn.Cancel", { n: f.cancel }));
    else if (f.offer) out = btn("accept", "fa-check", t("Thorn.Accept")) + btn("decline", "fa-xmark", t("Guide.Decline"));
  }
  box.innerHTML = out || `<p class="r-wr-offer-state"><i class="fa-solid fa-hourglass-half"></i> ${t(f.dare ? "Thorn.DareWait" : "Guide.Waiting")}</p>`;
  box.addEventListener("click", ev => {
    const b = ev.target.closest("[data-r-thorn]");
    if (!b) return;
    box.querySelectorAll("button").forEach(x => { x.disabled = true; });
    answerThorn(msg, b.dataset.rThorn);
  });
});
