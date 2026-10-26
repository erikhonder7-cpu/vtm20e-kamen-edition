// module/apps/torment.mjs
// Мука падшего (Demon: The Fallen, гл. 6): временная копится до 10 и становится пунктом постоянной;
// грех — проверка Добродетели (сл. 8, без Воли, не проваливается), без успехов — +1 временной Муки;
// доброе дело — кости Муки против Добродетели, Добродетель выше — −1 временной; 10 опыта — −1 постоянной
// (не ниже 1). Призыв: демон с обычным эффектом может сам взять эффект высокой Муки ценой +1 временной.
// Апокалиптическая форма (гл. 7): принять — бросок Веры или пункт Веры; черта высокой Муки на эпизод — +1 временной Муки.

import { SYSTEM_ID } from "../config.mjs";
import { rollPool, evaluate, renderCard } from "../dice/roll.mjs";
import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Demon.${k}`, d) : game.i18n.localize(`VTM20.Demon.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const notice = (actor, icon, html, cls = "") => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-demon ${cls}"><i class="fa-solid ${icon}"></i> ${html}</div>` });
const virtueLabel = (actor, slot) => actor.traitLabel(`virtues.${slot}`);

/** +n временной Муки; каждые 10 — пункт постоянной (до 10). */
/** Настройка мира: как решается эффект высокой Муки призыва (dice/roll.mjs → tormentRule). */
export function registerTorment() {
  game.settings.register(SYSTEM_ID, "tormentRule", {
    name: "VTM20.Settings.TormentRule.Name", hint: "VTM20.Settings.TormentRule.Hint",
    scope: "world", config: true, type: String, default: "die",
    choices: { die: "VTM20.Settings.TormentRule.die", errata: "VTM20.Settings.TormentRule.errata" }
  });
}

export async function gainTorment(actor, n = 1, reason = "") {
  const tm = actor.system.torment;
  let temp = tm.temporary + n, perm = tm.permanent;
  const grew = Math.floor(temp / 10);
  if (grew) { perm = Math.min(10, perm + grew); temp %= 10; }
  const before = tm.permanent;
  await actor.update({ "system.torment.temporary": temp, "system.torment.permanent": perm });
  await notice(actor, "fa-fire", t(grew ? "TormentGrewPerm" : "TormentGrew", { name: esc(actor.name), n: temp, p: perm, reason: esc(reason) }), "is-warn");
  if (perm > before) await pickHighFeatures(actor);
}

/**
 * Новая точка постоянной Муки сверх шести — новая черта высокой Муки (гл. 7): игрок выбирает её сам.
 * Окно предлагает свободные черты Облика; выбор дописывается во флаг formHigh (порядок выбора).
 */
export async function pickHighFeatures(actor) {
  const form = Codex.lore(actor.system.visage)?.form;
  if (!form || !actor.isOwner) return;
  const highN = Math.max(0, Math.min(4, actor.system.torment.permanent - 6));
  const picked = (actor.getFlag(SYSTEM_ID, "formHigh") ?? []).filter(i => i < form.high.length);
  for (let left = highN - picked.length; left > 0; left--) {
    const free = form.high.map((name, i) => ({ name, i })).filter(x => !picked.includes(x.i));
    if (!free.length) break;
    const i = await foundry.applications.api.DialogV2.wait({
      window: { title: t("FormHighNew", { name: actor.name }) }, classes: ["vtm20", "r-dialog"], position: { width: 420 },
      content: `<p class="r-choice-hint">${t("FormHighNewHint", { n: actor.system.torment.permanent })}</p>`,
      buttons: free.map((x, k) => ({ action: String(x.i), label: x.name, default: k === 0 }))
    }).catch(() => null);
    if (i == null || i === "") break;
    picked.push(Number(i));
    await actor.setFlag(SYSTEM_ID, "formHigh", picked);
  }
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

/**
 * Грех слуги падшего (Damned and Deceived, гл. 4): порог — постоянная Воля слуги; бросок нужной Добродетели, сл. 7,
 * без траты Воли. Успех — без последствий, неудача — −1 временная Воля, провал — −1 постоянная (на 3 и ниже — расстройство).
 */
export async function thrallSin(actor) {
  const slots = ["conscience", "selfControl", "courage"];
  const will = actor.system.willpower.permanent;
  const content = `<p class="r-choice-hint">${t("ThrallSinHint", { n: will, sin: t(`ThrallSinRow.${Math.max(1, Math.min(10, will))}`) })}</p><div class="r-choice-list">` + slots.map((s, i) =>
    `<label class="r-choice"><input type="radio" name="slot" value="${s}" ${i ? "" : "checked"}><span><b>${esc(virtueLabel(actor, s))}</b> ${actor.traitValue(`virtues.${s}`)}<em class="r-choice-when">${t(`ThrallSinWhen.${s}`)}</em></span></label>`).join("") + "</div>";
  const slot = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("ThrallSin") }, classes: ["vtm20", "r-dialog", "r-choice-dialog"], position: { width: 460 }, content,
    ok: { label: t("RollVirtue"), callback: (ev, btn) => btn.form.elements.slot.value }
  }).catch(() => null);
  if (!slot) return null;
  const pool = actor.traitValue(`virtues.${slot}`);
  const res = await rollPool({ actor, title: t("ThrallSin"), subtitle: virtueLabel(actor, slot), pool, difficulty: 7, kind: "thrallSin",
    breakdown: [{ label: virtueLabel(actor, slot), value: pool }] });
  const w = actor.system.willpower;
  if (res.outcome === "botch") {
    const perm = Math.max(0, w.permanent - 1);
    await actor.update({ "system.willpower.permanent": perm, "system.willpower.temporary": Math.min(w.temporary, perm) });
    await notice(actor, "fa-heart-crack", t(perm === 0 ? "ThrallSinBroken" : perm <= 3 ? "ThrallSinMad" : "ThrallSinPerm", { name: esc(actor.name), n: perm }), "is-sin");
  } else if (res.successes === 0) {
    await actor.update({ "system.willpower.temporary": Math.max(0, w.temporary - 1) });
    await notice(actor, "fa-heart-crack", t("ThrallSinTemp", { name: esc(actor.name) }), "is-sin");
  }
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
  if (s.apocalyptic) { await actor.unsetFlag(SYSTEM_ID, "formScene"); await actor.unsetFlag(SYSTEM_ID, "urgeSplit"); return actor.update({ "system.apocalyptic": false }); }
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
  if (s.earthbound) await splitUrges(actor);
  return notice(actor, "fa-dragon", t("FormTaken", { name: esc(actor.name), visage: esc(visage) }), "is-form");
}

/** Потребности Привязанного (Earthbound, гл. 3) в форме: игрок раскладывает каждую по её Характеристикам (флаг urgeSplit). */
const URGE_ATTRS = { flesh: ["strength", "dexterity", "stamina"], thought: ["perception", "intelligence", "wits"], emotion: ["charisma", "manipulation", "appearance"] };
export async function splitUrges(actor) {
  const u = actor.system.urges ?? {}, prev = actor.getFlag(SYSTEM_ID, "urgeSplit") ?? {};
  const rows = Object.entries(URGE_ATTRS).map(([k, attrs]) => {
    const n = u[k] ?? 0, base = attrs.map((a, i) => prev[a] ?? (i === 0 ? n : 0));
    return `<p class="r-choice-hint"><b>${t(`Urge.${k}`)} ${n}</b></p><div class="r-fields">` + attrs.map((a, i) =>
      `<label class="r-f"><span>${actor.traitLabel(`attributes.${a}`)}</span><input type="number" name="${a}" value="${base[i]}" min="0" max="${n}"></label>`).join("") + "</div>";
  }).join("");
  const v = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("UrgeSplit") }, classes: ["vtm20", "r-dialog"], position: { width: 460 },
    content: `<p class="r-choice-hint">${t("UrgeSplitHint")}</p>${rows}`,
    ok: { label: game.i18n.localize("VTM20.Common.Apply"), callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }
  }).catch(() => null);
  if (!v) return;
  // в каждой Потребности не больше её точек: лишнее срезаем с конца
  const split = {};
  for (const [k, attrs] of Object.entries(URGE_ATTRS)) {
    let left = u[k] ?? 0;
    for (const a of attrs) { const n = Math.min(left, Math.max(0, Number(v[a]) || 0)); if (n) split[a] = n; left -= n; }
  }
  return actor.setFlag(SYSTEM_ID, "urgeSplit", split);
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
  // список слуг на вкладке «Преимущества» важнее факта биографии «Договоры»
  const list = actor.system.thralls ?? [];
  const n = list.length ? list.reduce((s, x) => s + Math.min(x.share, thrallCap(x.faith)), 0)
    : actor.items.find(i => i.type === "background" && i.name === "Договоры")?.system.value ?? 0;
  if (!n) return ui.notifications.info(t("NoPacts"));
  const f = actor.system.faith.temporary, next = Math.min(10, f + n);
  await actor.update({ "system.faith.temporary": next });
  return notice(actor, "fa-file-signature", t("PactFaith", { name: esc(actor.name), n: next - f }));
}

/**
 * Врождённые способности (гл. 7, с. 169–170): мороки — Восприятие + Бдительность, сл. 7 (морок демона — его Вера или
 * Мука, что выше); отклик на имя — бросок Веры, сл. 7 за Небесное имя и 6 за Истинное; изгнание из тела без Веры — бросок Воли.
 */
export function innateRoll(actor, kind) {
  if (kind === "illusion") return RollDialog.prompt(actor, { title: t("InnateIllusion"), trait1: "attributes.perception", trait2: "abilities.alertness",
    difficulty: 7, diffNote: t("InnateIllusionNote"), kind: "check" });
  if (kind === "exorcism") return rollPool({ actor, title: t("InnateExorcism"), pool: actor.system.willpower.permanent, difficulty: 6, kind: "exorcism",
    breakdown: [{ label: game.i18n.localize("VTM20.Willpower"), value: actor.system.willpower.permanent }] });
  return foundry.applications.api.DialogV2.wait({
    window: { title: t("InnateName") }, classes: ["vtm20", "r-dialog"], position: { width: 420 }, content: `<p>${t("InnateNameHow")}</p>`,
    buttons: [{ action: "7", label: t("Celestial"), default: true }, { action: "6", label: t("TrueName") }]
  }).then(d => d && rollPool({ actor, title: t("InnateName"), pool: actor.system.faith.temporary, difficulty: Number(d), kind: "names",
    breakdown: [{ label: t("Faith"), value: actor.system.faith.temporary }] })).catch(() => null);
}

/**
 * Подсказка греха (гл. 6: «Рассказчик предупреждает, что поступок может прибавить Муки»): шёпотом владельцам и ведущему —
 * карточка с кнопкой проверки Добродетели. Как подсказки ярости у вампиров (dice/virtue-checks.mjs).
 */
export function suggestSin(actor, reason = "") {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id),
    content: `<div class="r-notice r-type-demon r-check-prompt is-sin"><i class="fa-solid fa-skull"></i>
      <span>${t("SinPrompt", { name: esc(actor.name) })}${reason ? ` <em>${esc(reason)}</em>` : ""}</span>
      <div class="r-card-buttons"><button type="button" data-r-action="sinPrompt"><i class="fa-solid fa-dice-d10"></i> ${t("SinTitle")}</button></div></div>`,
    flags: { [SYSTEM_ID]: { sinPrompt: { actorUuid: actor.uuid } } }
  });
}

/** Кнопка подсказки греха: проверку бросает тот, кто владеет падшим. */
export async function sinFromPrompt(message) {
  const p = message.getFlag(SYSTEM_ID, "sinPrompt");
  const actor = p && await foundry.utils.fromUuid(p.actorUuid);
  if (!actor?.isOwner) return ui.notifications.warn(game.i18n.localize("VTM20.CheckPrompt.NotOwner"));
  return virtuePrompt(actor, "sin");
}

/**
 * Проявление (гл. 9, с. 255): смертные замечают падшего Восприятием + Шестым чувством, сл. 10 − Вера за сцену (флаг sceneFaith;
 * при 0 и в апокалиптической форме — все и сразу). Каждый свидетель бросает Волю против постоянной Веры демона: провал — теряет
 * себя, неудача — застывает или бежит и потом забудет, 1 / 2 / 3+ успеха — помнит сверхъестественное / детали / всё.
 * Облик для свидетеля: Мука меньше половины его Воли — прекрасный ангел, больше Воли — кошмар, иначе — по восприятию.
 */
export async function revelation(actor) {
  const s = actor.system, spent = actor.getFlag(SYSTEM_ID, "sceneFaith") ?? 0, notice = Math.max(0, 10 - spent);
  const v = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Reveal") }, classes: ["vtm20", "r-dialog"], position: { width: 460 },
    content: `<p class="r-choice-hint">${t("RevealHint", { n: s.faith.permanent })}</p>
      <p class="r-choice-hint">${s.apocalyptic || notice === 0 ? t("RevealAuto") : t("RevealNotice", { spent, d: notice })}</p>
      <div class="r-fields"><label class="r-f is-span2"><span>${t("RevealWitnesses")}</span><input type="text" name="wills" value="3, 3, 2" placeholder="3, 5, 2"></label>
      <label class="r-f r-f-check"><input type="checkbox" name="reset"> <span>${t("RevealReset")}</span></label></div>`,
    ok: { label: t("RevealRoll"), callback: (ev, btn) => ({ wills: String(btn.form.elements.wills.value), reset: btn.form.elements.reset.checked }) }
  }).catch(() => null);
  if (!v) return;
  if (v.reset) await actor.unsetFlag(SYSTEM_ID, "sceneFaith");
  const wills = v.wills.split(/[,;\s]+/).map(Number).filter(n => n > 0).slice(0, 20);
  if (!wills.length) return;
  const rolls = [], rows = [];
  for (const [i, w] of wills.entries()) {
    const r = await new Roll(`${w}d10`).evaluate(); rolls.push(r);
    const ev = evaluate(r.dice[0].results.map(x => x.result), { difficulty: Math.clamp(s.faith.permanent, 2, 10) });
    const key = ev.outcome === "botch" ? "Botch" : ev.successes >= 3 ? "3" : `${ev.successes}`;
    const look = s.torment.permanent < w / 2 ? "Angel" : s.torment.permanent > w ? "Nightmare" : "Either";
    rows.push(`<tr><td>${i + 1}</td><td>${w}</td><td><b>${ev.outcome === "botch" ? "✕" : ev.successes}</b></td><td>${t(`RevealOut.${key}`)}</td><td><em>${t(`RevealLook.${look}`)}</em></td></tr>`);
  }
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls,
    content: `<div class="r-notice r-type-demon r-reveal"><i class="fa-solid fa-eye"></i> <b>${t("RevealTitle", { name: esc(actor.name), d: s.faith.permanent })}</b>
      <table><thead><tr><th>#</th><th>${game.i18n.localize("VTM20.Willpower")}</th><th>${t("SuccShort")}</th><th>${t("RevealMemory")}</th><th>${t("RevealSees")}</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>` });
}

/**
 * Реликварий Привязанного (Earthbound, гл. 3): держит 10 Веры, «Запасы» — ещё по 5 за точку (импровизированный — не выше •••).
 * Ритуал поклонения даёт по Вере за участника в центре — по «Поклонению» 2 / 4 / 6 / 8 / 10; Вера идёт в реликварий.
 */
export function reliquaryInfo(actor) {
  const bg = name => actor.items.find(i => i.type === "background" && i.name === name)?.system.value ?? 0;
  const r = actor.system.reliquary ?? { kind: "ideal", faith: 0 };
  const hoard = r.kind === "improvised" ? Math.min(3, bg("Запасы")) : bg("Запасы");
  return { kind: r.kind, faith: r.faith, max: 10 + 5 * hoard, worship: 2 * Math.min(5, bg("Поклонение")), cult: bg("Культ") };
}
export async function worshipRitual(actor) {
  const R = reliquaryInfo(actor);
  if (!R.worship) return ui.notifications.warn(t("NoWorship"));
  const next = Math.min(R.max, R.faith + R.worship);
  await actor.update({ "system.reliquary.faith": next });
  return notice(actor, "fa-place-of-worship", t("WorshipDone", { name: esc(actor.name), n: next - R.faith, f: next, max: R.max }));
}
/** Взять пункт Веры из реликвария в запас Веры (тратится первой — книга; здесь — переложить перед тратой). */
export async function reliquaryDraw(actor) {
  const R = reliquaryInfo(actor), f = actor.system.faith.temporary;
  if (!R.faith) return ui.notifications.info(t("ReliquaryEmpty"));
  if (f >= 10) return ui.notifications.info(t("FaithFull"));
  return actor.update({ "system.reliquary.faith": R.faith - 1, "system.faith.temporary": f + 1 });
}

/** Сколько Веры слуга может отдавать демону: не больше половины его Веры, с округлением вверх (гл. 9, с. 251). */
export const thrallCap = faith => Math.ceil((faith ?? 0) / 2);

/** Слуга по договору: лист персонажа (если привязан) и его Воля сейчас. */
export function thrallState(x) {
  const doc = x.uuid ? foundry.utils.fromUuidSync(x.uuid) : null;
  const a = doc?.documentName === "Actor" ? doc : null;
  return { actor: a, will: a ? a.system.willpower?.temporary ?? 0 : x.will, name: x.name || a?.name || "" };
}

/**
 * Перебор (гл. 9, с. 252–253): к призыву добавлено n кубиков (не больше постоянной Веры). Каждый кубик — пункт Воли
 * слуг, как решит игрок; сверх их Воли — тяжёлое повреждение без поглощения за каждый. Воля до нуля — постоянное
 * расстройство. Провал броска — минус пункт временной Веры. По «Проклятым и обманутым» (дополнительное правило):
 * за каждые 2 отнятые Воли слуга теряет пункт Веры. Мука за злоупотребление — на усмотрение рассказчика.
 */
export async function overdrawPay(actor, n, res) {
  const list = foundry.utils.deepClone(actor.system.thralls ?? []);
  const lines = [];
  if (list.length) {
    // раскладка: поровну, с тех, у кого Воли больше; при нескольких слугах — окно с правкой
    const base = list.map((x, i) => ({ i, will: thrallState(x).will })).sort((a, b) => b.will - a.will);
    const split = Object.fromEntries(list.map((_, i) => [i, 0]));
    for (let k = 0; k < n; k++) split[base[k % base.length].i]++;
    let take = split;
    if (list.length > 1) {
      const rows = list.map((x, i) => `<label class="r-f"><span>${esc(thrallState(x).name || t("ThrallUnnamed"))} · ${t("ThrallWill")} ${thrallState(x).will}</span>
        <input type="number" name="t${i}" value="${split[i]}" min="0" max="${n}"></label>`).join("");
      take = await foundry.applications.api.DialogV2.prompt({
        window: { title: t("OverdrawSplit", { n }) }, classes: ["vtm20", "r-dialog"], position: { width: 420 },
        content: `<p class="r-choice-hint">${t("OverdrawSplitHint", { n })}</p><div class="r-fields">${rows}</div>`,
        ok: { label: t("OverdrawPay"), callback: (ev, btn) => Object.fromEntries(list.map((_, i) => [i, Math.max(0, Number(btn.form.elements[`t${i}`].value) || 0)])) }
      }).catch(() => null) ?? split;
      // сумма должна сойтись с числом кубиков: недостачу — первому в раскладке, излишек срезаем с конца
      let sum = Object.values(take).reduce((s, v) => s + v, 0);
      for (const b of [...base].reverse()) { if (sum <= n) break; const d = Math.min(take[b.i], sum - n); take[b.i] -= d; sum -= d; }
      if (sum < n) take[base[0].i] += n - sum;
    }
    for (const [i, k] of Object.entries(take)) {
      if (!k) continue;
      const x = list[i], st = thrallState(x), spent = Math.min(k, st.will), hurt = k - spent, left = st.will - spent;
      x.lost += k;
      let faithLoss = 0;
      while (x.lost >= 2 && x.faith > 0) { x.lost -= 2; x.faith--; faithLoss++; }
      x.share = Math.min(x.share, thrallCap(x.faith));
      if (st.actor?.isOwner) {
        const h = st.actor.system.health;
        await st.actor.update({ "system.willpower.temporary": left, ...(hurt ? { "system.health.lethal": Math.min(7, (h?.lethal ?? 0) + hurt) } : {}) });
      } else { x.will = left; x.wounds = Math.min(7, x.wounds + hurt); }
      lines.push(t("OverdrawLine", { name: esc(st.name || t("ThrallUnnamed")), w: spent, left })
        + (hurt ? ` ${t("OverdrawHurt", { n: hurt })}` : "") + (left === 0 ? ` ${t("OverdrawMad")}` : "")
        + (faithLoss ? ` ${t("OverdrawFaith", { f: x.faith })}` : ""));
    }
    await actor.update({ "system.thralls": list });
  } else lines.push(t("OverdrawNoList", { n }));
  const botch = res?.outcome === "botch";
  if (botch) await actor.update({ "system.faith.temporary": Math.max(0, actor.system.faith.temporary - 1) });
  return notice(actor, "fa-hand-holding-droplet", `<b>${t("OverdrawTitle", { name: esc(actor.name), n })}</b><br>${lines.join("<br>")}`
    + (botch ? `<br>${t("OverdrawBotch")}` : "") + `<br><em>${t("OverdrawTorment")}</em>`, "is-warn");
}

/** Вера, потраченная падшим за сцену (для сложности Проявления): считается при каждом уменьшении временной Веры. */
export function registerDemonHooks() {
  Hooks.on("preUpdateActor", (actor, change) => {
    if (actor.type !== "demon") return;
    const next = foundry.utils.getProperty(change, "system.faith.temporary");
    if (next == null || next >= actor.system.faith.temporary) return;
    foundry.utils.setProperty(change, `flags.${SYSTEM_ID}.sceneFaith`, (actor.getFlag(SYSTEM_ID, "sceneFaith") ?? 0) + (actor.system.faith.temporary - next));
  });
}

/** Сколько успехов нужно ритуалу: сумма точек его Знаний (Players Guide, гл. 6). */
export const ritualNeed = s => (s.primary?.key ? s.primary.level : 0) + (s.secondary ?? []).reduce((n, x) => n + (x.key ? x.level : 0), 0);

/**
 * Ход ритуала (Players Guide, гл. 6): по истечении минимального времени — длительный бросок Веры Анкиды, сл. 6 и +1 за
 * каждый следующий ход, всего пять ходов; нужно успехов по сумме точек Знаний. Вера Хауики — модификатором в окне.
 * Провал или пять ходов без цели — ритуал сорван. Ход хранится флагом ritualRun на персонаже.
 */
export async function ritualTurn(actor, item) {
  const f = actor.system.faith.temporary;
  if (f < 1) return ui.notifications.warn(t("NoFaith"));
  const prev = actor.getFlag(SYSTEM_ID, "ritualRun");
  const run = prev?.id === item.id ? prev : { id: item.id, turn: 0, total: 0 };
  const turn = run.turn + 1, need = ritualNeed(item.system);
  return RollDialog.prompt(actor, {
    title: t("RitualTurnTitle", { name: item.name, turn }), subtitle: t("RitualProgress", { total: run.total, need, turn: run.turn }),
    pool: f, difficulty: Math.min(10, 5 + turn), lockTraits: true, kind: "ritualRun", diffNote: t("RitualTurnNote", { need }),
    breakdown: [{ label: t("Faith"), value: f }],
    onRolled: async res => {
      const total = run.total + (res?.successes ?? 0), done = total >= need, botch = res?.outcome === "botch";
      if (botch || done || turn >= 5) await actor.unsetFlag(SYSTEM_ID, "ritualRun");
      else await actor.setFlag(SYSTEM_ID, "ritualRun", { id: item.id, turn, total });
      const key = botch ? "RitualBotch" : done ? "RitualDone" : turn >= 5 ? "RitualFailed" : "RitualOnward";
      await notice(actor, done ? "fa-circle-check" : botch || turn >= 5 ? "fa-burst" : "fa-hourglass-half",
        t(key, { name: esc(item.name), total, need, turn }), botch || (!done && turn >= 5) ? "is-warn" : "");
    }
  });
}

/** Эффект удавшегося ритуала: бросок из описания с костью Муки Анкиды (как у призыва). */
export function ritualEffect(actor, item) {
  const s = item.system, r = s.roll ?? {};
  if (!r.trait1) return ui.notifications.info(t("RitualNoRoll", { roll: s.rollText || "—" }));
  // ритуал Привязанных (Earthbound, гл. 4): варианта низкой Муки нет, падший-участник получает 1 временную Муку
  const dark = s.house === "earthbound";
  return RollDialog.prompt(actor, { title: item.name, subtitle: t("RitualEffect"), trait1: r.trait1, trait2: r.trait2, difficulty: r.difficulty || 6,
    effect: s.description + (s.high ? `<p><b>${game.i18n.localize("VTM20.DRitual.High")}:</b> ${esc(s.high)}</p>` : ""),
    extra: { torment: dark ? 10 : actor.system.torment.permanent },
    ...(dark && !actor.system.earthbound ? { onRolled: () => gainTorment(actor, 1, t("DarkRitualReason")) } : {}) });
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
