// module/apps/torment.mjs
// Мука падшего (Demon: The Fallen, гл. 6): временная копится до 10 и становится пунктом постоянной;
// грех — проверка Добродетели (сл. 8, без Воли, не проваливается), без успехов — +1 временной Муки;
// доброе дело — кости Муки против Добродетели, Добродетель выше — −1 временной; 10 опыта — −1 постоянной
// (не ниже 1). Призыв: демон с обычным эффектом может сам взять эффект высокой Муки ценой +1 временной.
// Апокалиптическая форма (гл. 7): принять — бросок Веры или пункт Веры; черта высокой Муки на эпизод — +1 временной Муки.

import { SYSTEM_ID } from "../config.mjs";
import { rollPool, evaluate, renderCard } from "../dice/roll.mjs";
import { Codex } from "../data/codex.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Demon.${k}`, d) : game.i18n.localize(`VTM20.Demon.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const notice = (actor, icon, html, cls = "") => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-demon ${cls}"><i class="fa-solid ${icon}"></i> ${html}</div>` });
const virtueLabel = (actor, slot) => actor.traitLabel(`virtues.${slot}`);

/** +n временной Муки; каждые 10 — пункт постоянной (до 10). */
export async function gainTorment(actor, n = 1, reason = "") {
  const tm = actor.system.torment;
  let temp = tm.temporary + n, perm = tm.permanent;
  const grew = Math.floor(temp / 10);
  if (grew) { perm = Math.min(10, perm + grew); temp %= 10; }
  await actor.update({ "system.torment.temporary": temp, "system.torment.permanent": perm });
  await notice(actor, "fa-fire", t(grew ? "TormentGrewPerm" : "TormentGrew", { name: esc(actor.name), n: temp, p: perm, reason: esc(reason) }), "is-warn");
}

/** Грех против Добродетели: бросок Добродетели, сл. 8. */
export async function sinCheck(actor, slot) {
  const pool = actor.traitValue(`virtues.${slot}`);
  const res = await rollPool({ actor, title: t("SinTitle"), subtitle: virtueLabel(actor, slot), pool, difficulty: 8, noBotch: true, kind: "sin",
    breakdown: [{ label: virtueLabel(actor, slot), value: pool }] });
  if (res.successes === 0) await gainTorment(actor, 1, t("SinReason"));
  return res;
}

/** Доброе дело: кости Муки против кубиков Добродетели, у кого больше успехов (сл. 6). */
export async function kindnessCheck(actor, slot) {
  const n = actor.system.torment.permanent;
  const r = n > 0 ? await new Roll(`${n}d10`).evaluate() : null;
  const values = r ? r.dice[0].results.map(x => x.result) : [];
  const opposed = { label: t("Torment"), values, successes: evaluate(values, { difficulty: 6, noBotch: true }).successes };
  const pool = actor.traitValue(`virtues.${slot}`);
  const res = await rollPool({ actor, title: t("KindTitle"), subtitle: virtueLabel(actor, slot), pool, difficulty: 6, noBotch: true, kind: "kindness",
    breakdown: [{ label: virtueLabel(actor, slot), value: pool }], extra: { opposed } });
  if (res.successes > opposed.successes && actor.system.torment.temporary > 0)
    await actor.update({ "system.torment.temporary": actor.system.torment.temporary - 1 });
  return res;
}

/** Окно выбора Добродетели для греха или доброго дела; подсказки — когда какую бросать (гл. 6). */
export async function virtuePrompt(actor, kind) {
  const slots = ["conscience", "selfControl", "courage"];
  const content = `<p class="r-choice-hint">${t(kind === "sin" ? "SinHint" : "KindHint")}</p><div class="r-choice-list">` + slots.map((s, i) =>
    `<label class="r-choice"><input type="radio" name="slot" value="${s}" ${i ? "" : "checked"}><span><b>${esc(virtueLabel(actor, s))}</b> ${actor.traitValue(`virtues.${s}`)}<em class="r-choice-when">${t(`VirtueWhen.${s}`)}</em></span></label>`).join("") + "</div>";
  const slot = await foundry.applications.api.DialogV2.prompt({
    window: { title: t(kind === "sin" ? "SinTitle" : "KindTitle") }, classes: ["vtm20", "r-dialog", "r-choice-dialog"], position: { width: 440 }, content,
    ok: { label: t("RollVirtue"), callback: (ev, btn) => btn.form.elements.slot.value }
  }).catch(() => null);
  if (!slot) return null;
  return kind === "sin" ? sinCheck(actor, slot) : kindnessCheck(actor, slot);
}

/** Искупление опытом: 10 опыта — −1 постоянной Муки (не ниже 1). */
export async function atoneWithXp(actor) {
  const tm = actor.system.torment, xp = actor.system.experience;
  if (tm.permanent <= 1) return ui.notifications.warn(t("AtoneMin"));
  if (xp.available < 10) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoXp", { cost: 10, have: xp.available }));
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Atone") }, content: `<p>${t("AtoneConfirm", { from: tm.permanent, to: tm.permanent - 1 })}</p>` });
  if (!ok) return;
  const log = foundry.utils.deepClone(actor._source.system.experience.log);
  log.unshift({ amount: -10, reason: `${t("Torment")}: ${tm.permanent} → ${tm.permanent - 1}`, date: new Date().toLocaleDateString("ru-RU") });
  await actor.update({ "system.torment.permanent": tm.permanent - 1, "system.experience.spent": actor._source.system.experience.spent + 10, "system.experience.log": log });
}

/**
 * Принять апокалиптическую форму (гл. 7): бросок Веры (кубиков — сколько временной Веры, сл. 6) или пункт Веры
 * за верный успех; неудача — без последствий, провал — минус пункт Веры. Сбросить форму — даром.
 */
export async function assumeForm(actor) {
  const s = actor.system, visage = Codex.house(s.house)?.visages?.[s.visage] ?? "";
  if (s.apocalyptic) { await actor.unsetFlag(SYSTEM_ID, "formScene"); return actor.update({ "system.apocalyptic": false }); }
  if (s.faith.temporary < 1) return ui.notifications.warn(t("NoFaith"));
  const how = await foundry.applications.api.DialogV2.wait({
    window: { title: t("FormTake") }, classes: ["vtm20", "r-dialog"], position: { width: 420 },
    content: `<p>${t("FormHow", { n: s.faith.temporary })}</p>`,
    buttons: [{ action: "roll", label: t("FormRoll"), icon: "fa-solid fa-dice-d10", default: true }, { action: "spend", label: t("FormSpend"), icon: "fa-solid fa-fire-flame-curved" }]
  }).catch(() => null);
  if (!how) return;
  let ok = how === "spend";
  if (how === "spend") await actor.update({ "system.faith.temporary": s.faith.temporary - 1 });
  else {
    const res = await rollPool({ actor, title: t("FormTake"), subtitle: visage, pool: s.faith.temporary, difficulty: 6, kind: "form",
      breakdown: [{ label: t("Faith"), value: s.faith.temporary }] });
    ok = res.successes > 0;
    if (res.outcome === "botch") await actor.update({ "system.faith.temporary": Math.max(0, actor.system.faith.temporary - 1) });
  }
  if (!ok) return;
  await actor.update({ "system.apocalyptic": true });
  return notice(actor, "fa-dragon", t("FormTaken", { name: esc(actor.name), visage: esc(visage) }), "is-form");
}

/** Черта высокой Муки на эпизод (гл. 7): в минуту опасности — до конца эпизода, ценой пункта временной Муки. */
export async function sceneHighFeature(actor, index) {
  const list = actor.getFlag(SYSTEM_ID, "formScene") ?? [];
  if (list.includes(index)) return;
  const name = Codex.lore(actor.system.visage)?.form?.high?.[index] ?? "";
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("SceneHigh") }, content: `<p>${t("SceneHighConfirm", { name: esc(name) })}</p>` });
  if (!ok) return;
  await actor.setFlag(SYSTEM_ID, "formScene", [...list, index]);
  await gainTorment(actor, 1, t("SceneHighReason", { name }));
}

/**
 * Жатва Веры (гл. 9): Воля демона против Воли смертного; больше успехов у демона — +1 Вера (Рассказчик может дать 2).
 * Сложности по умолчанию 6 и 7 — их можно поменять в окне (русское издание пишет их по-разному, с. 251).
 */
export async function harvestFaith(actor) {
  const v = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Harvest") }, classes: ["vtm20", "r-dialog"], position: { width: 420 },
    content: `<p class="r-choice-hint">${t("HarvestHint")}</p>
      <div class="r-fields"><label class="r-f"><span>${t("HarvestMortalWill")}</span><input type="number" name="will" value="3" min="1" max="10"></label>
      <label class="r-f"><span>${t("HarvestDiffDemon")}</span><input type="number" name="dd" value="6" min="2" max="10"></label>
      <label class="r-f"><span>${t("HarvestDiffMortal")}</span><input type="number" name="dm" value="7" min="2" max="10"></label></div>`,
    ok: { label: t("Harvest"), callback: (ev, btn) => ({ will: Number(btn.form.elements.will.value) || 1, dd: Number(btn.form.elements.dd.value) || 6, dm: Number(btn.form.elements.dm.value) || 7 }) }
  }).catch(() => null);
  if (!v) return;
  const r = await new Roll(`${v.will}d10`).evaluate(), values = r.dice[0].results.map(x => x.result);
  const opposed = { label: t("HarvestMortal"), values, successes: evaluate(values, { difficulty: v.dm }).successes };
  const pool = actor.system.willpower.permanent;
  const res = await rollPool({ actor, title: t("Harvest"), pool, difficulty: v.dd, kind: "harvest", noBotch: false,
    breakdown: [{ label: game.i18n.localize("VTM20.Willpower"), value: pool }], extra: { opposed } });
  if (res.successes > opposed.successes) await actor.update({ "system.faith.temporary": Math.min(10, actor.system.faith.temporary + 1) });
  return res;
}

/** Вера по договорам (гл. 6, 9): раз в день — столько Веры, сколько точек в Дополнении «Договоры». */
export async function pactFaith(actor) {
  const n = actor.items.find(i => i.type === "background" && i.name === "Договоры")?.system.value ?? 0;
  if (!n) return ui.notifications.info(t("NoPacts"));
  const f = actor.system.faith.temporary, next = Math.min(10, f + n);
  await actor.update({ "system.faith.temporary": next });
  return notice(actor, "fa-file-signature", t("PactFaith", { name: esc(actor.name), n: next - f }));
}

/** Кнопка карточки призыва: взять эффект высокой Муки ценой пункта временной Муки. */
export async function chooseHighTorment(message, state) {
  const actor = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
  if (!actor?.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: actor?.name ?? "" }));
  const next = { ...state, extra: { ...state.extra, tormentHigh: true, tormentChosen: true } };
  await message.setFlag(SYSTEM_ID, "roll", next);
  await message.update({ content: await renderCard(next, actor) });
  await gainTorment(actor, 1, t("ChoseHigh"));
}
