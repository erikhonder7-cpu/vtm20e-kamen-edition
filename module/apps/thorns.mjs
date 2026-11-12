// module/apps/thorns.mjs
// Шипы Тени в игре (Wraith 20, гл. 6, таблица Шипов): применяет проводник-Тень или рассказчик — тратит временный Ангст, бросает,
// что положено, и сообщает тем, кому положено (рассказчику и проводнику; Психее — если она это чувствует или может ответить).
// Ответ Психеи — кнопками в чате: сопротивление Волей (Кошмары, Оговорка по Фрейду), отмена за Волю (Медовый язык),
// согласие на лишнее действие (Теневая игра). Вызов дьявола закрывает рассказчик в конце сессии.
// Пассивные Шипы (Аура порчи, Лицо Тени, Черты Тени, Жизнь Тени…) кнопки не имеют — их текст на листе.

import { SYSTEM_ID, VTM20 } from "../config.mjs";
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
  devilsdare: { angst: "ask", max: 10, who: "psyche", note: true, dare: true },
  // свои окна (ниже): сделка, поглощение Ангста, шёпот чужой Тени, напоминание о Сне
  pactofdoom: { custom: "pact" }, vampiricnature: { custom: "vampire" }, whispers: { custom: "whisper" }, shadowlife: { custom: "life" }
};
const CUSTOM = { pact: thornPact, vampire: thornVampire, whisper: thornWhisper, life: thornLife };
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
  if (spec.custom) return CUSTOM[spec.custom](actor, row, d);
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
  if (what === "pact") {   // Договор с Роком: Арканос +n, Тени постоянный Ангст +n
    const { key, n } = f.pact ?? {}, cur = actor.system.wraith.arcanoi?.[key]?.value ?? 0, ap = actor.system.wraith.shadow.angst.permanent;
    const up = Math.min(n, 5 - cur);
    if (up < 1) return ui.notifications.warn(t("Thorn.PactMax"));
    await actor.update({ [`system.wraith.arcanoi.${key}.value`]: cur + up, "system.wraith.shadow.angst.permanent": Math.min(10, ap + up) });
    return closeCard(msg, "pactDone", up);
  }
  return null;
}

/* ── Шипы со своими окнами ─────────────────────────────────────────── */

const ask = (title, content, read) => foundry.applications.api.DialogV2.prompt({ window: { title }, classes: ["vtm20", "r-dialog"], position: { width: 440 },
  content, ok: { label: t("Thorn.Use"), callback: (ev, btn) => read(btn.form.elements) }, rejectClose: false });
const card = (actor, who, d, html, flag = null, tools = false, rolls = null) => ChatMessage.create({ ...audience(actor, who), speaker: { alias: t("Guide.From", { name: actor.name }) },
  ...(rolls ? { rolls } : {}), ...(flag ? { flags: { [SYSTEM_ID]: { thorn: flag } } } : {}),
  content: `<div class="r-notice r-type-wraith is-shadow r-wr-thorn-card"><p><i class="fa-solid fa-spa"></i> <b>${esc(d.name)}</b></p>${html}${tools ? `<div class="r-wr-thorn-tools"></div>` : ""}</div>` });

/** Договор с Роком: Тень учит Арканосу (n уровней) — только с согласия Психеи; Тени — постоянный Ангст = n. */
async function thornPact(actor, row, d) {
  const W = (await import("./wraith.mjs")).W();
  const f = await ask(d.name, `<p class="r-note">${t("Thorn.PactLead")}</p>
    <label class="r-f"><span>${t("Thorn.PactArcanos")}</span><select name="key">${W.arcanoi.map(a => `<option value="${a.key}">${esc(a.name)} (${actor.system.wraith.arcanoi?.[a.key]?.value ?? 0})</option>`).join("")}</select></label>
    <label class="r-f"><span>${t("Thorn.PactLevels")}</span><input type="number" name="n" value="1" min="1" max="5"></label>
    <label class="r-f"><span>${t("Thorn.Note")}</span><input type="text" name="note" placeholder="${esc(t("Thorn.PactPh"))}"></label>`,
  e => ({ key: e.key.value, n: Math.clamp(Number(e.n.value) || 1, 1, 5), note: e.note.value.trim() }));
  if (!f) return null;
  const a = W.arcanoi.find(x => x.key === f.key);
  return card(actor, "psyche", d, `<p>${t("Thorn.PactMsg", { name: esc(actor.name), arc: esc(a?.name ?? f.key), n: f.n })}</p>${f.note ? `<p><i>«${esc(f.note)}»</i></p>` : ""}`,
    { actor: actor.uuid, key: "pactofdoom", state: "open", n: 0, pact: { key: f.key, n: f.n } }, true);
}

/** Вампирья натура: касание — Воля против Воли цели; чистые успехи — Ангст, который Тень вбирает (до 5 за раз, раз на цель за сессию). */
async function thornVampire(actor, row, d) {
  const target = [...(game.user.targets ?? [])][0]?.actor ?? null;
  const f = await ask(d.name, `<p class="r-note">${t("Thorn.VampLead")}</p>
    <label class="r-f"><span>${t("Thorn.VampTarget")}</span><input type="text" name="who" value="${esc(target?.name ?? "")}"></label>
    <label class="r-f"><span>${t("Thorn.VampWill")}</span><input type="number" name="will" value="${target?.system?.willpower?.permanent ?? 5}" min="1" max="10"></label>`,
  e => ({ who: e.who.value.trim(), will: Math.clamp(Number(e.will.value) || 1, 1, 10) }));
  if (!f) return null;
  const roll = async n => { const r = await new Roll(`${n}d10`).evaluate(), v = r.dice[0].results.map(x => x.result);
    return { r, v, hits: Math.max(0, v.filter(x => x >= 6).length - v.filter(x => x === 1).length) }; };
  const mine = await roll(Math.max(1, actor.system.willpower.permanent)), theirs = await roll(f.will);
  const net = Math.min(5, Math.max(0, mine.hits - theirs.hits));
  if (net) {
    await gainAngst(actor, net, { reason: d.name });
    // тронутый призрак или Спектр на сцене (цель выбрана) — его Ангст уходит к нашей Тени
    if (target?.type === "wraith" && target.canUserModify(game.user, "update") && !target.system.wraith.spectre?.on)
      await target.update({ "system.wraith.shadow.angst.temporary": Math.max(0, target.system.wraith.shadow.angst.temporary - net) });
  }
  return card(actor, "gm", d, `<p>${t("Thorn.VampMsg", { name: esc(actor.name), who: esc(f.who || "—"), a: mine.v.join(", "), b: theirs.v.join(", "), n: net })}</p>`, null, false, [mine.r, theirs.r]);
}

/** Шёпоты: Тень говорит с Тенью другого призрака — без ведома их Психей; доходит до проводника той Тени (или рассказчика). */
async function thornWhisper(actor, row, d) {
  const others = game.actors.filter(a => a.type === "wraith" && a.id !== actor.id);
  if (!others.length) return ui.notifications.warn(t("Thorn.WhisperNone"));
  const f = await ask(d.name, `<p class="r-note">${t("Thorn.WhisperLead")}</p>
    <label class="r-f"><span>${t("Thorn.WhisperTo")}</span><select name="to">${others.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></label>
    <label class="r-f"><span>${t("Thorn.Note")}</span><textarea name="text" rows="3"></textarea></label>`,
  e => ({ to: e.to.value, text: e.text.value.trim() }));
  if (!f?.text) return null;
  // у призрака — проводнику его Тени; у Спектра Тень и есть хозяин — его игроку
  const other = game.actors.get(f.to), spectre = !!other?.system.wraith.spectre?.on;
  const to = spectre ? psycheUsers(other) : [(await import("./wraith.mjs")).guideOf(other)].filter(Boolean);
  const ids = [...new Set([...game.users.filter(u => u.isGM).map(u => u.id), game.user.id, ...to.map(u => u.id)])];
  return ChatMessage.create({ whisper: ids, speaker: { alias: t("Thorn.WhisperFrom", { a: actor.name, b: other.name }) },
    content: `<div class="r-notice r-type-wraith is-shadow r-wr-whisper"><i class="fa-solid fa-mask"></i> <i>${esc(f.text).replace(/\n/g, "<br>")}</i></div>` });
}

/** Жизнь Тени: Психея уснула — Тень берёт тело (рассказчику и проводнику; игрок Психеи знает, что Тень ходит, если не взят «не знает»). */
async function thornLife(actor, row, d) {
  return card(actor, "gm", d, `<p>${t("Thorn.LifeMsg", { name: esc(actor.name) })}</p>`);
}

/** Напоминание «Жизни Тени» при Сне — от кого угодно (apps/underworld.mjs, slumber). */
export const lifeReminder = actor => thornLife(actor, null, thornOf("shadowlife") ?? { name: "Shadow Life" });

/** Есть ли у призрака Шип. */
export const hasThorn = (actor, key) => (actor.system.wraith?.shadow?.thorns ?? []).some(x => x.key === key);

/* ── Черты Тени: +1 к Атрибуту или Способности, пока идёт Катарсис ──── */

/** Черта по заметке строки Шипа: ключ или название Атрибута/Способности. */
function traitOf(note) {
  const s = String(note ?? "").trim().toLowerCase();
  if (!s) return null;
  const find = map => Object.entries(map).find(([k, v]) => k.toLowerCase() === s || game.i18n.localize(v.label ?? "").toLowerCase() === s)?.[0];
  const attr = find(VTM20.attributes);
  if (attr) return { attr };
  const abil = find(VTM20.abilities);
  return abil ? { abil } : null;
}

/** Эффект «Черты Тени» на время Катарсиса; заметка строки — какая черта (+1 к Атрибуту или кубик к Способности). */
export async function syncShadowTraits(actor) {
  const old = actor.effects.filter(e => e.getFlag(SYSTEM_ID, "shadowTraits"));
  const on = actor.system.wraith?.shadow?.catharsis && !actor.system.wraith.spectre?.on;
  const rows = on ? actor.system.wraith.shadow.thorns.filter(x => x.key === "shadowtraits").map(x => traitOf(x.note)).filter(Boolean) : [];
  if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old.map(e => e.id));
  if (!rows.length) return null;
  const attrMod = {}, abilDice = {};
  for (const r of rows) { if (r.attr) attrMod[r.attr] = (attrMod[r.attr] ?? 0) + 1; else abilDice[r.abil] = (abilDice[r.abil] ?? 0) + 1; }
  return actor.createEmbeddedDocuments("ActiveEffect", [{ name: thornOf("shadowtraits")?.name ?? "Shadow Traits", img: "icons/svg/terror.svg",
    flags: { [SYSTEM_ID]: { shadowTraits: true, attrMod, abilDice } } }]);
}
Hooks.on("updateActor", (actor, diff, opts, userId) => {
  if (actor.type !== "wraith" || userId !== game.user.id) return;
  if (foundry.utils.hasProperty(diff, "system.wraith.shadow.catharsis") || foundry.utils.hasProperty(diff, "system.wraith.shadow.thorns")) syncShadowTraits(actor);
});

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
    if (f.pact) out = btn("pact", "fa-file-signature", t("Thorn.PactAccept")) + btn("decline", "fa-xmark", t("Guide.Decline"));
    else if (f.resist) out = btn("resist", "fa-shield-halved", t("Thorn.Resist", { d: f.resist.diff, n: f.resist.need }));
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
