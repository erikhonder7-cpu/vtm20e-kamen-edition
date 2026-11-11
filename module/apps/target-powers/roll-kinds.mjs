// module/apps/target-powers/roll-kinds.mjs
// Силы по цели — подготовка броска по виду силы: сложность и пометки (ctx.roll), исход (opts.onRolled), вопросы до броска.
// Функция получает контекст ctx = { roll, actor, disc, d, p, tp, target, key, link, holder, prep, opts, subtitle, kind, magic, virt, rollFromSpec }; вернуть { stop } — не бросать.

import { allowAnyway } from "../rule-gate.mjs";
import { SYSTEM_ID } from "../../config.mjs";
import { Codex } from "../../data/codex.mjs";
import { t, esc, supernatural, notice, selfCheck, ask } from "./core.mjs";

// Приглашение: сложность по знакомству (5 / 7 / 4 / 8), до рассвета
async function onCall(ctx) {
  const { p, target } = ctx;
  const how = await ask(p.name, [["5", t("CallKnown")], ["7", t("CallSlight")], ["4", t("CallPres")], ["8", t("CallFailed")]]);
  if (!how) return { stop: null };
  ctx.roll = { ...ctx.roll, difficulty: Number(how), note: t("CallNote", { name: target?.name ?? "—", n: how }) };
  if (!target) return { stop: ui.notifications.warn(t("NeedTarget")) };
}

async function onVoice(ctx) {
  const { actor, p, link, opts } = ctx;
  const mode = await ask(p.name, [["frenzy", t("VoiceFrenzy")], ["rotschreck", t("VoiceTerror")]]);
  if (!mode) return { stop: null };
  const marked = [...(game.user.targets ?? [])].map(tk => tk.actor).filter(x => x && x !== actor);
  opts.more = { targetPower: { ...link, crowd: marked.map(x => x.uuid), mode } };
  ctx.roll.note = t("VoiceNote", { n: marked.length });
  // сам вампир — проверка против того же состояния: сл. −1; неудачная активация — +1; провал — сразу
  opts.onRolled = async res => {
    const botch = res?.outcome === "botch", fail = !botch && (res?.successes ?? 0) < 1;
    if (botch) { if (!actor.statuses?.has(`r-${mode}`)) await actor.toggleStatusEffect(`r-${mode}`, { active: true }); return notice(actor, p.name, t("VoiceSelfBotch")); }
    const diff = 6 - 1 + (fail ? 2 : 0);
    selfCheck(actor, mode, diff, t("VoiceSelf", { n: diff }));
  };
}

async function onNightmare(ctx) {
  const { actor, p, link, opts } = ctx;
  // урон объявляется заранее: тяжёлые, лёгкие или не больше N
  const how = await ask(p.name, [["lethal", t("NightLethal")], ["bashing", t("NightBashing")], ["cap1", t("NightCap", { n: 1 })], ["cap2", t("NightCap", { n: 2 })], ["cap3", t("NightCap", { n: 3 })]]);
  if (!how) return { stop: null };
  if (!(await actor.spendWillpower(2))) return { stop: null };
  opts.more = { targetPower: { ...link, night: how } };
  ctx.roll.note = [ctx.roll.note, t("NightNote")].filter(Boolean).join(" ");
}

async function onTele(ctx) {
  const { actor, p, target, opts } = ctx;
  const how = await ask(p.name, [["send", t("TeleSend")], ["read", t("TeleRead")]]);
  if (!how) return { stop: null };
  if (how === "read" && target && supernatural(target) && !(await actor.spendWillpower(1))) return { stop: null };
  opts.more = null;
  ctx.roll.note = [ctx.roll.note, t(how === "read" ? (target && supernatural(target) ? "TeleReadSuper" : "TeleReadNote") : "TeleSendNote")].filter(Boolean).join(" ");
}

async function onConflag(ctx) {
  const { actor, p, link, opts } = ctx;
  // сколько крови в пламя: столько губительных при попадании
  const max = Math.min(actor.system.blood?.value ?? 0, Math.max(1, (actor.system.blood?.perTurn ?? 1) - (actor.bloodSpentThisTurn ?? 0)));
  if (max < 1) return { stop: ui.notifications.warn(game.i18n.format("VTM20.Notify.NoBlood", { name: actor.name })) };
  const b = Number(await ask(p.name, Array.from({ length: max }, (_, i) => [String(i + 1), t("ConflagPick", { n: i + 1 })])));
  if (!b) return { stop: null };
  ctx.roll = { ...ctx.roll, blood: b, difficulty: 6, note: t("ConflagNote", { n: b }) };
  opts.more = { targetPower: { ...link, conflag: b } };
}

async function onFlow(ctx) {
  const { actor, p, opts } = ctx;
  const how = await ask(p.name, [["stone", t("FlowStone")], ["wall", t("FlowWall")]]);
  if (!how) return { stop: null };
  if (how === "stone") {
    if (!actor.system.fx?.stoneMeld && !(await allowAnyway(actor, t("FlowNeedMeld")))) return { stop: null };
    return { stop: actor.startPower("visceratika:5") };
  }
  ctx.roll = { ...ctx.roll, blood: 1, difficulty: 8, note: t("FlowWallNote") };
  opts.more = null;
  opts.onRolled = res => notice(actor, p.name, (res?.successes ?? 0) > 0 ? t("FlowWallDone", { cm: 30 * res.successes }) : t("FlowWallFail"));
}

async function onAnest(ctx) {
  const { actor, p, target, key, opts } = ctx;
  // добровольно — Воля, сл. 6; против воли или усыпить смертного — Воля против Воли, сл. 8
  const how = await ask(p.name, [["pain", t("AnestPain")], ["force", t("AnestForce")], ["sleep", t("AnestSleep")]]);
  if (!how) return { stop: null };
  if (how === "sleep" && target && supernatural(target) && !(await allowAnyway(actor, t("MortalsOnly", { name: target.name })))) return { stop: null };
  ctx.roll = { ...ctx.roll, difficulty: how === "pain" ? 6 : 8, note: t(`AnestNote.${how}`) };
  if (target) opts.more = { targetPower: { key, target: target.uuid, targetName: target.name, powerName: p.name, actorName: actor.name, anest: how } };
}

async function onCaine(ctx) {
  const { actor, p, opts } = ctx;
  opts.more = null;
  opts.onRolled = async res => {
    const n = res?.successes ?? 0;
    if (n < 1) return;
    const fk = "valeren:Броня гнева Каинова", old = actor.powerEffects.find(e => e.power === fk);
    if (old) await actor.endPower(old.effect, { quiet: true });
    const eff = await actor.startPower(fk, { blood: 0 });
    const armor = Math.min(5, n), rot = Math.floor(n / 2);
    if (eff) await eff.update({ name: `${p.name} · +${armor}`, [`flags.${SYSTEM_ID}.armorBonus`]: armor,
      description: `<p>${esc(t("CaineDesc", { a: armor, r: rot }))}</p>${eff.description ?? ""}` });
    return notice(actor, p.name, t("CaineDesc", { a: armor, r: rot }));
  };
}

async function onHumanitas(ctx) {
  const { actor, p, opts } = ctx;
  // вся кровь — до броска; успех — +1 Человечность
  const hum = actor.system.morality?.value ?? 0, blood = actor.system.blood?.value ?? 0;
  if (hum >= 10) return { stop: ui.notifications.info(t("HumMax")) };
  if (blood && !(await actor.spendBlood(blood, { reason: p.name, limit: false }))) return { stop: null };
  ctx.roll = { ...ctx.roll, trait1: "virtues.conscience", trait2: "", difficulty: Math.clamp(hum + 1, 2, 10), note: t("HumNote", { n: hum + 1, b: blood }) };
  opts.more = null;
  opts.onRolled = async res => {
    if ((res?.successes ?? 0) < 1) return;
    await actor.update({ "system.morality.value": Math.min(10, (actor.system.morality?.value ?? 0) + 1) });
    return notice(actor, p.name, t("HumDone", { n: (actor.system.morality?.value ?? 0) }));
  };
}

async function onPillar(ctx) {
  const { actor, p, opts } = ctx;
  // место: 5 — уединённое, не знавшее насилия … 9 — пропитанное убийствами; 1 Воля — сразу
  const d = await ask(p.name, [["5", t("PillarD5")], ["6", "6"], ["7", t("PillarD7")], ["8", "8"], ["9", t("PillarD9")]]);
  if (!d) return { stop: null };
  if (!(await actor.spendWillpower(1))) return { stop: null };
  ctx.roll = { ...ctx.roll, trait1: "willpower.permanent", trait2: "", difficulty: parseInt(d), note: t("PillarNote") };
  opts.more = null;
  opts.onRolled = async res => {
    if ((res?.successes ?? 0) < 1) return;
    if (!actor.powerEffects.some(e => e.power === "bardo:4")) await actor.startPower("bardo:4", { blood: 0 });
  };
}

async function onParadox(ctx) {
  const { actor, p, key, opts } = ctx;
  // все отмеченные — слушатели; сложность — самая сильная текущая Воля среди них
  const crowd = [...(game.user.targets ?? [])].map(tk => tk.actor).filter(x => x && x !== actor);
  if (crowd.length) {
    const top = Math.max(...crowd.map(x => x.system.willpower?.temporary ?? 0));
    ctx.roll = { ...ctx.roll, difficulty: Math.clamp(top, 2, 10), note: t("ParadoxNote", { n: top, k: crowd.length }) };
    opts.more = { targetPower: { key, target: crowd[0].uuid, targetName: crowd.map(x => x.name).join(", "), powerName: p.name, actorName: actor.name, crowd: crowd.map(x => x.uuid) } };
  } else ctx.roll.note = [ctx.roll.note, t("MarkTarget")].filter(Boolean).join(" ");
}

async function onAbsorb(ctx) {
  const { p, opts } = ctx;
  const d = await ask(p.name, [["4", t("PsychoD4")], ["5", "5"], ["6", t("PsychoD6")], ["7", "7"], ["8", "8"], ["9", t("AbsorbD9")]]);
  if (!d) return { stop: null };
  ctx.roll = { ...ctx.roll, difficulty: parseInt(d), note: t("AbsorbNote") };
  opts.more = null;
}

async function onWard(ctx) {
  const { target, opts } = ctx;
  if (target) {
    const tw = target.system.willpower?.temporary ?? 0;
    ctx.roll = { ...ctx.roll, difficulty: Math.clamp(2 + tw, 2, 10), note: t("WardNote", { name: target.name, n: 2 + tw }) };
  } else { ctx.roll = { ...ctx.roll, difficulty: 7, note: t("WardObject") }; opts.more = null; }
}

async function onPsycho(ctx) {
  const { p, opts } = ctx;
  const d = await ask(p.name, [["4", t("PsychoD4")], ["5", "5"], ["6", t("PsychoD6")], ["7", "7"], ["8", "8"], ["9", t("PsychoD9")]]);
  if (!d) return { stop: null };
  ctx.roll = { ...ctx.roll, difficulty: parseInt(d), note: t("PsychoNote") };
  opts.more = null;
}

// Изменчивый облик: что меняем — облик (сл. 6, кровь за часть), копия (Восприятие + Медицина, сл. 8), красота (сл. 9)
async function onVisage(ctx) {
  const { actor, p, opts } = ctx;
  const ap = actor.system.attributes.appearance?.value ?? 0;
  const choice = await foundry.applications.api.DialogV2.prompt({ window: { title: p.name, icon: "fa-solid fa-face-smile" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("VisageWhat"))}</span><select name="m">
      <option value="change">${esc(t("VisageChange"))}</option><option value="copy">${esc(t("VisageCopy"))}</option>
      ${Array.from({ length: Math.max(0, 5 - ap) }, (_, i) => `<option value="b${ap + i + 1}">${esc(t("VisageBeauty", { v: ap + i + 1, b: 1 + i + 1 }))}</option>`).join("")}</select></label>
      <label class="r-field"><span>${esc(t("VisageParts"))}</span><input type="number" name="parts" value="1" min="1" max="5"></label></div>`,
    ok: { label: t("VisageGo"), callback: (e, b) => ({ m: b.form.elements.m.value, parts: Number(b.form.elements.parts.value) || 1 }) } });
  if (!choice) return { stop: null };
  if (choice.m === "copy") ctx.roll = { ...ctx.roll, trait1: "attributes.perception", trait2: "abilities.medicine", difficulty: 8, blood: choice.parts, note: t("VisageCopyNote") };
  else if (choice.m.startsWith("b")) {
    const v = Number(choice.m.slice(1));
    ctx.roll = { ...ctx.roll, difficulty: 9, blood: 1 + (v - ap), note: t("VisageBeautyNote", { v }) };
    opts.onRolled = async res => {
      if (res?.outcome === "botch") { await actor.update({ "system.attributes.appearance.value": Math.max(0, ap - 1) }); return notice(actor, p.name, t("VisageBotch")); }
      if ((res?.successes ?? 0) > 0) { await actor.update({ "system.attributes.appearance.value": v }); return notice(actor, p.name, t("FleshLooks", { from: ap, to: v })); }
    };
  } else ctx.roll = { ...ctx.roll, blood: choice.parts, note: t("VisageChangeNote", { n: choice.parts }) };
}

// Искусство тканей: понизить (сл. 5), повысить (сл. 9) Привлекательность или укрепить тело (сл. 8)
async function onFlesh(ctx) {
  const { p, link, opts } = ctx;
  // сложность — от 5 (грубо) до 9 (тонко); по умолчанию — обычная для выбранной работы
  const DEF = { lower: 5, raise: 9, armor: 8 };
  const pickF = await foundry.applications.api.DialogV2.prompt({ window: { title: p.name, icon: "fa-solid fa-hand-sparkles" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("FleshWhat"))}</span><select name="m">
      <option value="lower">${esc(t("FleshLower"))}</option><option value="raise">${esc(t("FleshRaise"))}</option><option value="armor">${esc(t("FleshArmor"))}</option></select></label>
      <label class="r-field"><span>${esc(t("FleshDiff"))}</span><select name="d"><option value="">${esc(t("FleshDiffAuto"))}</option>${[5, 6, 7, 8, 9].map(n => `<option value="${n}">${n}</option>`).join("")}</select></label>
      <label class="r-check"><input type="checkbox" name="str" checked><span>${esc(t("FleshArmorStr"))}</span></label></div>`,
    ok: { label: t("VisageGo"), callback: (e, b) => ({ m: b.form.elements.m.value, d: Number(b.form.elements.d.value) || null, str: !!b.form.elements.str.checked }) } });
  if (!pickF) return { stop: null };
  const mode = pickF.m;
  ctx.roll = { ...ctx.roll, difficulty: pickF.d ?? DEF[mode], note: t(`FleshNote.${mode}`) };
  opts.more = { targetPower: { ...link, flesh: mode, fleshFree: mode === "armor" && !pickF.str } };
}

// Искусство костей: что делаем; сложность работы — как у Искусства тканей (5 грубо … 9 тонко), удар костями — 7
async function onBone(ctx) {
  const { actor, p, subtitle, target, key, opts } = ctx;
  // шаблоны своей работы — у персонажа (флаг boneTemplates), в том же списке
  const tpls = actor.getFlag(SYSTEM_ID, "boneTemplates") ?? [];
  const pick = await ask(p.name, [["shape", t("BoneShape")], ["weapon", t("BoneWeapon")], ["claws", t("BoneClaws")], ["spikes", t("BoneSpikes")],
    ...tpls.map((c, i) => [`tpl:${i}`, t("BoneTpl", { name: c.name })]), ["custom", t("BoneCustom")]]);
  if (!pick) return { stop: null };
  const preset = pick.startsWith("tpl:") ? tpls[Number(pick.slice(4))] ?? null : null;
  const mode = preset ? "custom" : pick;
  if (mode === "custom") {
    // своя работа: что вылепить, сложность, цена ранами, оружие, прочность — по решению рассказчика
    const who = target ?? actor;
    const c = await (await import("../bone-work.mjs")).boneWorkDialog(p.name, who, { preset });
    if (!c) return { stop: null };
    if (c.deleteTemplate) {
      await actor.setFlag(SYSTEM_ID, "boneTemplates", tpls.filter(x => x.name !== c.deleteTemplate));
      ui.notifications.info(t("BoneTplDeleted", { name: c.deleteTemplate }));
      return { stop: null };
    }
    if (c.save) {
      const { save: _save, ...keep } = c;
      await actor.setFlag(SYSTEM_ID, "boneTemplates", [...tpls.filter(x => x.name !== c.name && x.name !== preset?.name), keep]);
      ui.notifications.info(t("BoneTplSaved", { name: c.name }));
    }
    // цена Волей — сразу, кровью — вместе с кровью силы в окне броска
    if (c.cost.will && !(await actor.spendWillpower(c.cost.will))) return { stop: null };
    ctx.roll = { ...ctx.roll, difficulty: c.diff, blood: (ctx.roll.blood ?? 1) + c.cost.blood, note: t("BoneC.RollNote", { name: who.name, what: c.name }) };
    opts.power = { ...opts.power, noHit: true };
    opts.subtitle = `→ ${who.name} · ${subtitle}`;
    opts.more = { targetPower: { key, target: who.uuid, targetName: who.name, powerName: p.name, actorName: actor.name, bone: "custom", custom: c } };
  } else if (mode === "weapon") {
    if (!target) { ui.notifications.warn(t("NeedTarget")); return { stop: null }; }
    ctx.roll = { ...ctx.roll, difficulty: 7, note: t("BoneWeaponNote") };
    opts.more = null;
  } else {
    const d = await ask(t("BoneFine"), [5, 6, 7, 8, 9].map(n => [String(n), t(`BoneDiff.${n}`)]));
    if (!d) return { stop: null };
    const who = target ?? actor;
    ctx.roll = { ...ctx.roll, difficulty: parseInt(d), note: t(`BoneNote.${mode}`, { name: who.name }) };
    opts.power = { ...opts.power, noHit: true };
    opts.subtitle = `→ ${who.name} · ${subtitle}`;
    opts.more = mode === "shape" ? null : { targetPower: { key, target: who.uuid, targetName: who.name, powerName: p.name, actorName: actor.name, bone: mode } };
    // шипы, провал: смертный умирает, вампир уходит в торпор
    if (mode === "spikes") opts.onRolled = async res => {
      if (res?.outcome !== "botch") return;
      return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        flags: { [SYSTEM_ID]: { targetApply: { key, target: who.uuid, targetName: who.name, powerName: p.name, actorName: actor.name, bone: "botch", actorUuid: actor.uuid } } },
        content: `<div class="r-notice"><i class="fa-solid fa-bone"></i> <b>${esc(p.name)}</b> → ${esc(who.name)}: ${esc(t("BoneSpikesBotch"))}
          <div class="r-card-buttons"><button type="button" data-r-action="targetApply"><i class="fa-solid fa-skull"></i> ${esc(t("BoneBotchApply", { name: who.name }))}</button></div></div>` });
    };
  }
}

// Касание скорпиона: сколько крови в яд (1 … Выносливость, сколько есть)
async function onPoison(ctx) {
  const { actor, p, link, opts } = ctx;
  const max = Math.min(actor.system.attributes.stamina.total, actor.system.blood?.value ?? 0);
  if (max < 1) return { stop: ui.notifications.warn(game.i18n.format("VTM20.Notify.NoBlood", { name: actor.name })) };
  const n = await foundry.applications.api.DialogV2.prompt({ window: { title: p.name, icon: "fa-solid fa-skull-crossbones" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("PoisonBlood"))}</span><select name="n">${Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}</select></label></div>`,
    ok: { label: t("PoisonGo"), callback: (e, b) => Number(b.form.elements.n.value) || 1 } });
  if (!n) return { stop: null };
  ctx.roll = { ...ctx.roll, blood: n, note: t("PoisonNote", { n }) };
  opts.more = { targetPower: { ...link, poison: n } };
}

// Усмирение Зверя: вселить страх (Манипуляция + Запугивание) или успокоить (Манипуляция + Эмпатия), сл. 7;
// продолжительный бросок до постоянной Воли цели; Сородича в бешенстве — только успокоить, 3+ успеха — переброс ярости
async function onQuell(ctx) {
  const { actor, p, target, key, opts } = ctx;
  const kindred = target.isVampire;
  const way = kindred ? "calm" : await foundry.applications.api.DialogV2.prompt({ window: { title: p.name, icon: "fa-solid fa-paw" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("QuellHow"))}</span><select name="w"><option value="fear">${esc(t("QuellFear"))}</option><option value="calm">${esc(t("QuellCalm"))}</option></select></label></div>`,
    ok: { label: t("VisageGo"), callback: (e, b) => b.form.elements.w.value } });
  if (!way) return { stop: null };
  ctx.roll = { ...ctx.roll, trait2: way === "calm" ? "abilities.empathy" : "abilities.intimidation", difficulty: 7 };
  if (kindred) {
    ctx.roll.note = t("QuellKindredNote", { name: target.name });
    opts.more = null;
    opts.onRolled = res => (res?.successes ?? 0) >= 3 ? ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }),
      whisper: game.users.filter(u => u.isGM || target.testUserPermission(u, "OWNER")).map(u => u.id),
      flags: { [SYSTEM_ID]: { checkPrompt: { kind: "frenzy", difficulty: 6, actorUuid: target.uuid } } },
      content: `<div class="r-notice r-check-prompt is-frenzy"><i class="fa-solid fa-face-angry"></i> <span>${esc(t("QuellKindredOk", { name: target.name, by: actor.name }))}</span>
        <div class="r-card-buttons"><button type="button" data-r-action="virtueCheck"><i class="fa-solid fa-dice-d10"></i> ${esc(game.i18n.localize("VTM20.CheckPrompt.Roll"))}</button></div></div>` }) : null;
  } else {
    const need = Math.max(1, target.system.willpower?.permanent ?? 1);
    Object.assign(opts, { contest: "extended", need });
    ctx.roll.note = t("QuellNote", { n: need, name: target.name });
    // провал — цель невосприимчива к этому вампиру до конца сцены
    opts.onRolled = async res => {
      if (res?.outcome !== "botch") return;
      if (target.isOwner) await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("QuellImmuneName", { name: actor.name }), img: Codex.disciplineIcon("animalism"),
        flags: { [SYSTEM_ID]: { mind: key, quellImmune: actor.uuid, mode: "scene" } } }]);
      notice(target, p.name, t("QuellImmune", { name: target.name }));
    };
  }
}

/** Вид силы → подготовка броска. */
export const ROLL = { call: onCall, voice: onVoice, nightmare: onNightmare, tele: onTele, conflag: onConflag, flow: onFlow, anest: onAnest, caine: onCaine, humanitas: onHumanitas, pillar: onPillar, paradox: onParadox, absorb: onAbsorb, ward: onWard, psycho: onPsycho, visage: onVisage, flesh: onFlesh, bone: onBone, poison: onPoison, quell: onQuell };
