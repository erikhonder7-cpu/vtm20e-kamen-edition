// module/apps/target-powers/roll.mjs
// Силы по цели — бросок: сложность по цели, подготовка (кто цель, чем сопротивляется), сам бросок и то, что решается сразу.

import { allowAnyway } from "../rule-gate.mjs";
import { SYSTEM_ID } from "../../config.mjs";
import { Codex } from "../../data/codex.mjs";
import { PATH_POWERS } from "../../data/path-powers.mjs";
import { bloodRoll } from "../bloodlines.mjs";
import { clockApi, t, esc, TARGET_POWERS, sameActor, supernatural, tierText, notice, selfCheck, ask } from "./core.mjs";
import { contradict, burningTouch, illusion, auraLines, tasteLines, cloakGathering } from "./effects.mjs";

/** Сложность Языка животных по виду (по имени и «виду» существа). */
function animalDiff(a) {
  const s = `${a.name} ${a.system.kind ?? ""}`.toLowerCase();
  if (/волк|кош|кот|рыс|лев|тигр|пантер|летуч|медвед|лис|пёс|пес|собак|wolf|cat|bat|bear|dog|fox/.test(s)) return 6;
  if (/голуб|ворон|воробь|птиц|змея|змей|ящер|черепах|pigeon|crow|raven|bird|snake|lizard|reptil/.test(s)) return 8;
  return 7;
}

// пути Тауматургии (data/path-powers.mjs) — тем же движком
Object.assign(TARGET_POWERS, PATH_POWERS);

/** Черта цели для сложности. */
function traitOf(a, k) {
  const s = a.system;
  switch (k) {
    case "willpower": return s.willpower?.temporary ?? null;
    case "morality": return s.morality?.value ?? null;
    case "courage": case "selfControl": return s.virtues?.[k]?.value ?? null;
    case "awareness": return s.abilities?.[k]?.value ?? 0;
    case "fortitude": return a.discipline?.("fortitude") ?? 0;
    default: return s.attributes?.[k]?.total ?? s.attributes?.[k]?.value ?? null;
  }
}

/** Отмеченная цель (T) — не сам персонаж. */
export function markedTarget(actor) {
  return [...(game.user.targets ?? [])].map(tk => tk.actor).find(x => x && x !== actor) ?? null;
}

/**
 * Подготовка броска: сложность от цели, запреты. null — бросок не нужен (сообщение уже показано).
 * Возвращает { difficulty, note, target } — target может быть null (сложность вручную).
 */
export function prepareTargetPower(actor, disc, p, tp, skip = new Set()) {
  // запрет правила — не отказ, а вопрос «Всё равно?» (apps/rule-gate.mjs); skip — уже обойдённые запреты
  const block = (code, text) => skip.has(code) ? null : { blocked: { code, text } };
  let b;
  // Превращение в туман: силы, требующие зрительного контакта, недоступны (V20, Метаморфозы 5)
  if (actor.system.fx?.mistForm && (tp.dominate || tp.kind === "eyes") && (b = block("mist", t("MistNoEyes")))) return b;
  const target = markedTarget(actor) ?? (tp.allowSelf ? actor : null);
  // без цели — по желанию простой бросок без автоматики
  if (!target && tp.needTarget) return skip.has("needTarget") ? { plain: true } : block("needTarget", t("NeedTargetGate"));
  // Усмирение Зверя: на Сородича не действует — кроме успокоения уже впавшего в бешенство (V20, Анимализм 3)
  if (tp.mortalOnly && target?.isVampire && !(tp.kind === "quell" && target.statuses?.has("r-frenzy")) && (b = block("mortalOnly", t("NotKindred", { name: target.name })))) return b;
  if (tp.kind === "quell" && target?.effects.some(e => !e.disabled && sameActor(e.flags?.[SYSTEM_ID]?.quellImmune, actor)) && (b = block("quellImmune", t("QuellImmune", { name: target.name })))) return b;
  // Величие: после неудачи или провала цель невосприимчива к этой силе (или ко всему Величию) этого вампира
  const key0 = `${disc}|${p?.en ?? ""}`;
  if (tp.presence && target?.effects.some(e => { const f = !e.disabled && e.flags?.[SYSTEM_ID]?.presImmune; return f && sameActor(f.by, actor) && (f.power === "all" || f.power === key0); })
    && (b = block("presImmune", t("PresImmune", { name: target.name })))) return b;
  if (tp.once && target?.effects.some(e => !e.disabled && e.flags?.[SYSTEM_ID]?.mind === key0 && sameActor(e.flags[SYSTEM_ID].by, actor))
    && (b = block("once", t("StillActive", { name: target.name })))) return b;
  if (tp.mortalTarget && supernatural(target) && (b = block("mortalTarget", t("MortalsOnly", { name: target.name })))) return b;
  if (tp.animal && !(target.type === "creature" && !target.system.spirit?.on) && (b = block("animal", t("NotAnimal", { name: target.name })))) return b;
  // Доминирование: после провала цель невосприимчива ко всему Доминированию этого вампира до конца истории
  if (tp.dominate && target?.effects.some(e => { const f = !e.disabled && e.flags?.[SYSTEM_ID]?.presImmune; return f && f.disc === "dominate" && sameActor(f.by, actor); })
    && (b = block("domImmune", t("DomImmune", { name: target.name })))) return b;
  // Вселение в гуля — только если он пил кровь этого вампира (V20, Доминирование 5)
  if (tp.ghoulOwn && target?.type === "ghoul" && ![actor.name, actor.id].includes(target.system.domitor) && (b = block("ghoulOwn", t("GhoulNotOwn", { name: target.name })))) return b;
  if (!tp.diff) return { difficulty: null, note: "", target };
  const label = tp.diff.map(k => t(`Diff.${k}`)).join(" + ");
  if (!target) {
    ui.notifications.info(t("MarkTarget"));
    return { difficulty: null, note: t("NoTarget", { what: label }), target: null };
  }
  // Доминирование: кровь сильнее (поколение ниже) — неподвластна (V20, гл. 4)
  if (tp.dominate && actor.isVampire && target.isVampire && Number(target.system.generation) < Number(actor.system.generation)
    && (b = block("domGeneration", t("DomGeneration", { name: target.name })))) return b;
  const parts = tp.diff.map(k => traitOf(target, k));
  if (parts.some(v => v == null)) return { difficulty: null, note: t("NoTrait", { name: target.name, what: label }), target };
  let raw = parts.reduce((s, v) => s + Number(v), 0) + (tp.diffPlus ?? 0);
  const notes = [t("DiffFrom", { name: target.name, what: label, n: raw })];
  const slave = tp.dominate && target.effects.find(e => !e.disabled && e.flags?.[SYSTEM_ID]?.conditioned && !sameActor(e.flags[SYSTEM_ID].conditioned, actor));
  if (slave) { raw += 2; notes.push(t("CondOther")); }
  const difficulty = Math.clamp(raw, 2, 10);
  if (raw > 10) notes.push(t("Over10"));
  if (tp.dominate) notes.push(t("Eyes"));
  if (tp.note) notes.push(t(`Note.${tp.note}`));
  return { difficulty, note: notes.join(" "), target };
}

/**
 * Бросок силы против цели (лист и HUD — sheets/actor-sheet.mjs → rollPowerRef).
 * @param {Function} rollFromSpec  окно броска силы из листа
 */
export async function rollTargetPower(actor, disc, d, p, tp, { rollFromSpec, subtitle, kind = "check", magic = null, virt = null }) {
  // Могущество крови — не чаще раза за ночь
  if (tp.kind === "potency") {
    const api = await clockApi();
    if ((actor.getFlag(SYSTEM_ID, "potencyNight") ?? 0) > api.getClock() && !(await allowAnyway(actor, t("PotencyOnce")))) return null;
  }
  // запреты правил: каждый — вопрос «Всё равно?»; без цели — простой бросок без автоматики
  const skip = new Set();
  let prep = prepareTargetPower(actor, disc, p, tp, skip);
  while (prep?.blocked) {
    if (!(await allowAnyway(actor, prep.blocked.text, prep.blocked.code === "needTarget" ? { yes: t("NoTargetRoll"), soft: true } : {}))) return null;
    skip.add(prep.blocked.code);
    prep = prepareTargetPower(actor, disc, p, tp, skip);
  }
  if (!prep) return null;
  if (prep.plain) return rollFromSpec(actor, p.roll ?? {}, { title: p.name, subtitle, effect: p.html, kind, magic, power: { disc, level: p.level, name: p.name } });
  const target = prep.target;
  const key = `${disc}|${p.en}`;
  // силы на себя (Покрывало ночи, Руки Бездны, Исчезновение) — «цель» карточки сам вампир, отмеченный — наблюдатель
  const holder = tp.self ? actor : target;
  const link = holder ? { key, target: holder.uuid, targetName: holder.name, powerName: p.name, actorName: actor.name } : null;
  // Тайное собрание: без броска — действующее Сокрытие ложится на отмеченных спутников
  if (tp.kind === "gather") return cloakGathering(actor, p);
  if (tp.kind === "burn") return burningTouch(actor, p, target);
  if (tp.kind === "psychomachia") {
    // броска баали нет: жертва проверяет низшую Добродетель (сл. 6) — кнопка на карточке
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { targetApply: { ...link, actorUuid: actor.uuid } } },
      content: `<div class="r-notice"><i class="fa-solid fa-masks-theater"></i> <b>${esc(p.name)}</b> → ${esc(target.name)}: ${esc(t("PsychoNoteV"))}
        <div class="r-card-buttons"><button type="button" data-r-action="targetApply"><i class="fa-solid fa-dice-d10"></i> ${esc(t("PsychoRoll", { name: target.name }))}</button></div></div>` });
  }
  if (tp.kind === "samiel") {
    // 3 крови — следующая атака ближнего боя: все кубы — успехи, уклониться нельзя
    if (!(await actor.spendBlood(3, { reason: p.name }))) return null;
    await actor.createEmbeddedDocuments("ActiveEffect", [{ name: p.name, img: Codex.disciplineIcon("valeren"), description: `<p>${esc(t("SamielDesc"))}</p>`,
      flags: { [SYSTEM_ID]: { samiel: true, mode: "scene" } } }]);
    return notice(actor, p.name, t("SamielDesc"));
  }
  if (tp.kind === "illusion") return illusion(actor, p, tp);
  // Глаза змеи: смертный замирает без броска — карточка «наложить»; сверхъестественный — Воля змея (сл. 9)
  if (tp.kind === "eyes") {
    if (!supernatural(target)) return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { targetApply: { ...link, actorUuid: actor.uuid } } },
      content: `<div class="r-notice"><i class="fa-solid fa-eye"></i> <b>${esc(p.name)}</b> → ${esc(target.name)}: ${esc(t("EyesMortal"))}
        <div class="r-card-buttons"><button type="button" data-r-action="targetApply"><i class="fa-solid fa-hand"></i> ${esc(t("Apply", { name: target.name }))}</button></div></div>` });
    return rollFromSpec(actor, { trait1: "willpower.permanent", difficulty: 9, note: t("EyesRoll", { name: target.name }) },
      { title: p.name, subtitle: `→ ${target.name} · ${subtitle}`, effect: p.html, power: { disc, level: p.level, name: p.name }, more: { targetPower: link } });
  }
  let roll = { ...(p.roll ?? {}), ...(prep.difficulty ? { difficulty: prep.difficulty } : {}), ...(prep.note ? { note: prep.note } : {}) };
  const opts = { title: p.name, subtitle: `${target ? `→ ${target.name} · ` : ""}${subtitle}`, effect: p.html, power: { disc, level: p.level, name: p.name },
    more: link ? { targetPower: link } : null, kind, magic };
  // кровные линии (apps/bloodlines.mjs): вопросы и цена до броска, итог на себе — сразу
  const bl = await bloodRoll({ actor, p, tp, target, key, link, roll, opts, virt,
    again: (p2, tp2, v) => p2 && tp2 ? rollTargetPower(actor, disc, d, p2, tp2, { rollFromSpec, subtitle, kind, magic, virt: v }) : null });
  if (bl && "stop" in bl) return bl.stop;
  if (bl?.roll) roll = bl.roll;
  // Вкус крови: сведения — только тауматургу и рассказчику
  if (tp.kind === "taste") opts.onRolled = res => {
    const n = res?.successes ?? 0;
    if (n < 1) return;
    const lines = tasteLines(target, n);
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id, ...game.users.filter(u => u.isGM).map(u => u.id)],
      content: `<div class="r-notice"><i class="fa-solid fa-droplet"></i> <b>${esc(p.name)}</b> → ${esc(target.name)}<ul>${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>` });
  };
  if (PATH_POWERS[key]) {
    if (tp.ownRoll) {
      const tw = target?.system.willpower?.permanent ?? 0;
      roll = { ...tp.ownRoll, blood: p.roll?.blood ?? 1, difficulty: target ? Math.min(10, tw + (tp.targetDiff?.plus ?? 0)) : 6,
        ...(target?.isVampire ? { willpower: true } : {}), note: t("PathOwnNote", { name: target?.name ?? "—", n: tw + (tp.targetDiff?.plus ?? 0) }) };
    } else roll = { trait1: "willpower.permanent", difficulty: Math.min(10, (Number(p.level) || 1) + 3), blood: p.roll?.blood ?? 1, note: t("PathRoll", { n: (Number(p.level) || 1) + 3 }) };
    if (tp.kind === "info") opts.onRolled = async res => { if ((res?.successes ?? 0) > 0) await contradict(actor, target, p.name, res.successes); };
    if (tp.kind === "counter") roll = { dice: 2 * (Number(p.level) || 1), difficulty: 6, note: t("CounterNote", { n: 2 * (Number(p.level) || 1) }) };
  }
  // Доминирование: провал — цель невосприимчива ко всему Доминированию этого вампира до конца истории
  if (tp.dominate && target) {
    const prev = opts.onRolled;
    opts.onRolled = async res => { await prev?.(res); if (res?.outcome === "botch") await presImmune(target, actor, "all", true, p.name, "dominate"); };
  }
  // Величие: неудача и провал — невосприимчивость (Взор: провал — ко всему Величию до конца истории; Очарование,
  // Приглашение: неудача — до рассвета, провал — до конца истории)
  if (tp.presence && target) {
    const prev = opts.onRolled;
    opts.onRolled = async res => {
      await prev?.(res);
      const botch = res?.outcome === "botch", fail = !botch && (res?.successes ?? 0) < 1;
      if (!botch && !fail) return;
      if (tp.dread && !botch) return;                   // Взор: только провал — ко всему Величию до конца истории
      const scope = tp.dread ? "all" : key;
      await presImmune(target, actor, scope, botch, p.name, "presence");
    };
  }
  // Благоговение: охват по успехам, первыми поддаются те, у кого меньше Воли
  if (tp.kind === "awe") {
    const marked = [...(game.user.targets ?? [])].map(tk => tk.actor).filter(x => x && x !== actor);
    opts.more = { targetPower: { ...link, crowd: marked.map(x => x.uuid) } };
    roll.note = t("AweNote", { n: marked.length });
  }
  // Приглашение: сложность по знакомству (5 / 7 / 4 / 8), до рассвета
  if (tp.kind === "call") {
    const how = await ask(p.name, [["5", t("CallKnown")], ["7", t("CallSlight")], ["4", t("CallPres")], ["8", t("CallFailed")]]);
    if (!how) return null;
    roll = { ...roll, difficulty: Number(how), note: t("CallNote", { name: target?.name ?? "—", n: how }) };
    if (!target) return ui.notifications.warn(t("NeedTarget"));
  }
  if (tp.kind === "chaos") {
    const d = await ask(p.name, [["9", t("ChaosStranger")], ["8", t("ChaosKnown")], ["6", t("ChaosFriend")], ["7", t("ChaosCode")], ["6p", t("ChaosPattern")]]);
    if (!d) return null;
    roll = { ...roll, difficulty: parseInt(d), note: t("ChaosNote") };
  }
  if (tp.kind === "voice") {
    const mode = await ask(p.name, [["frenzy", t("VoiceFrenzy")], ["rotschreck", t("VoiceTerror")]]);
    if (!mode) return null;
    const marked = [...(game.user.targets ?? [])].map(tk => tk.actor).filter(x => x && x !== actor);
    opts.more = { targetPower: { ...link, crowd: marked.map(x => x.uuid), mode } };
    roll.note = t("VoiceNote", { n: marked.length });
    // сам вампир — проверка против того же состояния: сл. −1; неудачная активация — +1; провал — сразу
    opts.onRolled = async res => {
      const botch = res?.outcome === "botch", fail = !botch && (res?.successes ?? 0) < 1;
      if (botch) { if (!actor.statuses?.has(`r-${mode}`)) await actor.toggleStatusEffect(`r-${mode}`, { active: true }); return notice(actor, p.name, t("VoiceSelfBotch")); }
      const diff = 6 - 1 + (fail ? 2 : 0);
      selfCheck(actor, mode, diff, t("VoiceSelf", { n: diff }));
    };
  }
  if (tp.kind === "possess") roll = { ...roll, willpower: true, note: t("PossessNote", { name: target.name }) };
  if (tp.kind === "nightmare") {
    // урон объявляется заранее: тяжёлые, лёгкие или не больше N
    const how = await ask(p.name, [["lethal", t("NightLethal")], ["bashing", t("NightBashing")], ["cap1", t("NightCap", { n: 1 })], ["cap2", t("NightCap", { n: 2 })], ["cap3", t("NightCap", { n: 3 })]]);
    if (!how) return null;
    if (!(await actor.spendWillpower(2))) return null;
    opts.more = { targetPower: { ...link, night: how } };
    roll.note = [roll.note, t("NightNote")].filter(Boolean).join(" ");
  }
  if (tp.kind === "tele") {
    const how = await ask(p.name, [["send", t("TeleSend")], ["read", t("TeleRead")]]);
    if (!how) return null;
    if (how === "read" && target && supernatural(target) && !(await actor.spendWillpower(1))) return null;
    opts.more = null;
    roll.note = [roll.note, t(how === "read" ? (target && supernatural(target) ? "TeleReadSuper" : "TeleReadNote") : "TeleSendNote")].filter(Boolean).join(" ");
  }
  if (tp.kind === "sin") opts.onRolled = res => {
    const n = res?.successes ?? 0;
    if (n < 1) return;
    const lines = [t("SinT1"), n >= 2 && t("SinT2"), n >= 3 && t("SinT3")].filter(Boolean);
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id, ...game.users.filter(u => u.isGM).map(u => u.id)],
      content: `<div class="r-notice"><i class="fa-solid fa-eye"></i> <b>${esc(p.name)}</b> → ${esc(target.name)}<ul>${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>` });
  };
  if (tp.kind === "void") roll.note = [roll.note, t("VoidNote")].filter(Boolean).join(" ");
  if (tp.kind === "conflag") {
    // сколько крови в пламя: столько губительных при попадании
    const max = Math.min(actor.system.blood?.value ?? 0, Math.max(1, (actor.system.blood?.perTurn ?? 1) - (actor.bloodSpentThisTurn ?? 0)));
    if (max < 1) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoBlood", { name: actor.name }));
    const b = Number(await ask(p.name, Array.from({ length: max }, (_, i) => [String(i + 1), t("ConflagPick", { n: i + 1 })])));
    if (!b) return null;
    roll = { ...roll, blood: b, difficulty: 6, note: t("ConflagNote", { n: b }) };
    opts.more = { targetPower: { ...link, conflag: b } };
  }
  if (tp.kind === "flow") {
    const how = await ask(p.name, [["stone", t("FlowStone")], ["wall", t("FlowWall")]]);
    if (!how) return null;
    if (how === "stone") {
      if (!actor.system.fx?.stoneMeld && !(await allowAnyway(actor, t("FlowNeedMeld")))) return null;
      return actor.startPower("visceratika:5");
    }
    roll = { ...roll, blood: 1, difficulty: 8, note: t("FlowWallNote") };
    opts.more = null;
    opts.onRolled = res => notice(actor, p.name, (res?.successes ?? 0) > 0 ? t("FlowWallDone", { cm: 30 * res.successes }) : t("FlowWallFail"));
  }
  if (tp.kind === "vitality") opts.onRolled = res => {
    const n = res?.successes ?? 0;
    if (n < 1 || !target) return;
    const h = target.system.health ?? {};
    const lines = [t("VitType", { v: game.i18n.localize(`TYPES.Actor.${target.type}`) }),
      n >= 2 && t("VitHurt", { b: h.bashing ?? 0, l: h.lethal ?? 0, a: h.aggravated ?? 0 }),
      n >= 3 && t("VitBlood", { v: target.system.blood?.value ?? "—" }), n >= 4 && t("VitTaint")].filter(Boolean);
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id, ...game.users.filter(u => u.isGM).map(u => u.id)],
      content: `<div class="r-notice"><i class="fa-solid fa-heart-pulse"></i> <b>${esc(p.name)}</b> → ${esc(target.name)}<ul>${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>` });
  };
  if (tp.kind === "anest") {
    // добровольно — Воля, сл. 6; против воли или усыпить смертного — Воля против Воли, сл. 8
    const how = await ask(p.name, [["pain", t("AnestPain")], ["force", t("AnestForce")], ["sleep", t("AnestSleep")]]);
    if (!how) return null;
    if (how === "sleep" && target && supernatural(target) && !(await allowAnyway(actor, t("MortalsOnly", { name: target.name })))) return null;
    roll = { ...roll, difficulty: how === "pain" ? 6 : 8, note: t(`AnestNote.${how}`) };
    if (target) opts.more = { targetPower: { key, target: target.uuid, targetName: target.name, powerName: p.name, actorName: actor.name, anest: how } };
  }
  if (tp.kind === "caine") {
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
  if (tp.kind === "humanitas") {
    // вся кровь — до броска; успех — +1 Человечность
    const hum = actor.system.morality?.value ?? 0, blood = actor.system.blood?.value ?? 0;
    if (hum >= 10) return ui.notifications.info(t("HumMax"));
    if (blood && !(await actor.spendBlood(blood, { reason: p.name, limit: false }))) return null;
    roll = { ...roll, trait1: "virtues.conscience", trait2: "", difficulty: Math.clamp(hum + 1, 2, 10), note: t("HumNote", { n: hum + 1, b: blood }) };
    opts.more = null;
    opts.onRolled = async res => {
      if ((res?.successes ?? 0) < 1) return;
      await actor.update({ "system.morality.value": Math.min(10, (actor.system.morality?.value ?? 0) + 1) });
      return notice(actor, p.name, t("HumDone", { n: (actor.system.morality?.value ?? 0) }));
    };
  }
  if (tp.kind === "pillar") {
    // место: 5 — уединённое, не знавшее насилия … 9 — пропитанное убийствами; 1 Воля — сразу
    const d = await ask(p.name, [["5", t("PillarD5")], ["6", "6"], ["7", t("PillarD7")], ["8", "8"], ["9", t("PillarD9")]]);
    if (!d) return null;
    if (!(await actor.spendWillpower(1))) return null;
    roll = { ...roll, trait1: "willpower.permanent", trait2: "", difficulty: parseInt(d), note: t("PillarNote") };
    opts.more = null;
    opts.onRolled = async res => {
      if ((res?.successes ?? 0) < 1) return;
      if (!actor.powerEffects.some(e => e.power === "bardo:4")) await actor.startPower("bardo:4", { blood: 0 });
    };
  }
  if (tp.kind === "paradox") {
    // все отмеченные — слушатели; сложность — самая сильная текущая Воля среди них
    const crowd = [...(game.user.targets ?? [])].map(tk => tk.actor).filter(x => x && x !== actor);
    if (crowd.length) {
      const top = Math.max(...crowd.map(x => x.system.willpower?.temporary ?? 0));
      roll = { ...roll, difficulty: Math.clamp(top, 2, 10), note: t("ParadoxNote", { n: top, k: crowd.length }) };
      opts.more = { targetPower: { key, target: crowd[0].uuid, targetName: crowd.map(x => x.name).join(", "), powerName: p.name, actorName: actor.name, crowd: crowd.map(x => x.uuid) } };
    } else roll.note = [roll.note, t("MarkTarget")].filter(Boolean).join(" ");
  }
  if (tp.kind === "absorb") {
    const d = await ask(p.name, [["4", t("PsychoD4")], ["5", "5"], ["6", t("PsychoD6")], ["7", "7"], ["8", "8"], ["9", t("AbsorbD9")]]);
    if (!d) return null;
    roll = { ...roll, difficulty: parseInt(d), note: t("AbsorbNote") };
    opts.more = null;
  }
  if (tp.kind === "ward") {
    if (target) {
      const tw = target.system.willpower?.temporary ?? 0;
      roll = { ...roll, difficulty: Math.clamp(2 + tw, 2, 10), note: t("WardNote", { name: target.name, n: 2 + tw }) };
    } else { roll = { ...roll, difficulty: 7, note: t("WardObject") }; opts.more = null; }
  }
  if (tp.kind === "riddle") roll.note = [roll.note, t("RiddleNote")].filter(Boolean).join(" ");
  if (tp.kind === "psycho") {
    const d = await ask(p.name, [["4", t("PsychoD4")], ["5", "5"], ["6", t("PsychoD6")], ["7", "7"], ["8", "8"], ["9", t("PsychoD9")]]);
    if (!d) return null;
    roll = { ...roll, difficulty: parseInt(d), note: t("PsychoNote") };
    opts.more = null;
  }
  if (tp.kind === "project") {
    const d = await ask(p.name, [["5", t("ProjD5")], ["7", t("ProjD7")], ["9", t("ProjD9")]]);
    if (!d) return null;
    roll = { ...roll, difficulty: parseInt(d) };
  }
  if (tp.kind === "dagon") {
    const tw = target.system.willpower?.temporary ?? target.system.willpower?.permanent ?? 6;
    roll = { ...roll, trait1: "attributes.stamina", trait2: "", difficulty: Math.clamp(tw, 2, 10), willpower: true, note: t("DagonNote", { name: target.name, n: tw }) };
  }
  if (tp.kind === "whisper") roll = { ...roll, difficulty: animalDiff(target), note: t("WhisperNote", { n: animalDiff(target), name: target.name }) };
  if (tp.kind === "aura") opts.onRolled = res => {
    const n = res?.successes ?? 0;
    if (n < 1) return;
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id, ...game.users.filter(u => u.isGM).map(u => u.id)],
      content: `<div class="r-notice"><i class="fa-solid fa-eye"></i> <b>${esc(p.name)}</b> → ${esc(target.name)}<ul>${auraLines(target, n).map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>` });
  };
  // Изменчивый облик: что меняем — облик (сл. 6, кровь за часть), копия (Восприятие + Медицина, сл. 8), красота (сл. 9)
  if (tp.kind === "visage") {
    const ap = actor.system.attributes.appearance?.value ?? 0;
    const choice = await foundry.applications.api.DialogV2.prompt({ window: { title: p.name, icon: "fa-solid fa-face-smile" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
      content: `<div class="r-form"><label class="r-field"><span>${esc(t("VisageWhat"))}</span><select name="m">
        <option value="change">${esc(t("VisageChange"))}</option><option value="copy">${esc(t("VisageCopy"))}</option>
        ${Array.from({ length: Math.max(0, 5 - ap) }, (_, i) => `<option value="b${ap + i + 1}">${esc(t("VisageBeauty", { v: ap + i + 1, b: 1 + i + 1 }))}</option>`).join("")}</select></label>
        <label class="r-field"><span>${esc(t("VisageParts"))}</span><input type="number" name="parts" value="1" min="1" max="5"></label></div>`,
      ok: { label: t("VisageGo"), callback: (e, b) => ({ m: b.form.elements.m.value, parts: Number(b.form.elements.parts.value) || 1 }) } });
    if (!choice) return null;
    if (choice.m === "copy") roll = { ...roll, trait1: "attributes.perception", trait2: "abilities.medicine", difficulty: 8, blood: choice.parts, note: t("VisageCopyNote") };
    else if (choice.m.startsWith("b")) {
      const v = Number(choice.m.slice(1));
      roll = { ...roll, difficulty: 9, blood: 1 + (v - ap), note: t("VisageBeautyNote", { v }) };
      opts.onRolled = async res => {
        if (res?.outcome === "botch") { await actor.update({ "system.attributes.appearance.value": Math.max(0, ap - 1) }); return notice(actor, p.name, t("VisageBotch")); }
        if ((res?.successes ?? 0) > 0) { await actor.update({ "system.attributes.appearance.value": v }); return notice(actor, p.name, t("FleshLooks", { from: ap, to: v })); }
      };
    } else roll = { ...roll, blood: choice.parts, note: t("VisageChangeNote", { n: choice.parts }) };
  }
  // Искусство тканей: понизить (сл. 5), повысить (сл. 9) Привлекательность или укрепить тело (сл. 8)
  if (tp.kind === "flesh") {
    // сложность — от 5 (грубо) до 9 (тонко); по умолчанию — обычная для выбранной работы
    const DEF = { lower: 5, raise: 9, armor: 8 };
    const pickF = await foundry.applications.api.DialogV2.prompt({ window: { title: p.name, icon: "fa-solid fa-hand-sparkles" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
      content: `<div class="r-form"><label class="r-field"><span>${esc(t("FleshWhat"))}</span><select name="m">
        <option value="lower">${esc(t("FleshLower"))}</option><option value="raise">${esc(t("FleshRaise"))}</option><option value="armor">${esc(t("FleshArmor"))}</option></select></label>
        <label class="r-field"><span>${esc(t("FleshDiff"))}</span><select name="d"><option value="">${esc(t("FleshDiffAuto"))}</option>${[5, 6, 7, 8, 9].map(n => `<option value="${n}">${n}</option>`).join("")}</select></label>
        <label class="r-check"><input type="checkbox" name="str" checked><span>${esc(t("FleshArmorStr"))}</span></label></div>`,
      ok: { label: t("VisageGo"), callback: (e, b) => ({ m: b.form.elements.m.value, d: Number(b.form.elements.d.value) || null, str: !!b.form.elements.str.checked }) } });
    if (!pickF) return null;
    const mode = pickF.m;
    roll = { ...roll, difficulty: pickF.d ?? DEF[mode], note: t(`FleshNote.${mode}`) };
    opts.more = { targetPower: { ...link, flesh: mode, fleshFree: mode === "armor" && !pickF.str } };
  }
  // Искусство костей: что делаем; сложность работы — как у Искусства тканей (5 грубо … 9 тонко), удар костями — 7
  if (tp.kind === "bone") {
    // шаблоны своей работы — у персонажа (флаг boneTemplates), в том же списке
    const tpls = actor.getFlag(SYSTEM_ID, "boneTemplates") ?? [];
    const pick = await ask(p.name, [["shape", t("BoneShape")], ["weapon", t("BoneWeapon")], ["claws", t("BoneClaws")], ["spikes", t("BoneSpikes")],
      ...tpls.map((c, i) => [`tpl:${i}`, t("BoneTpl", { name: c.name })]), ["custom", t("BoneCustom")]]);
    if (!pick) return null;
    const preset = pick.startsWith("tpl:") ? tpls[Number(pick.slice(4))] ?? null : null;
    const mode = preset ? "custom" : pick;
    if (mode === "custom") {
      // своя работа: что вылепить, сложность, цена ранами, оружие, прочность — по решению рассказчика
      const who = target ?? actor;
      const c = await (await import("../bone-work.mjs")).boneWorkDialog(p.name, who, { preset });
      if (!c) return null;
      if (c.deleteTemplate) {
        await actor.setFlag(SYSTEM_ID, "boneTemplates", tpls.filter(x => x.name !== c.deleteTemplate));
        ui.notifications.info(t("BoneTplDeleted", { name: c.deleteTemplate }));
        return null;
      }
      if (c.save) {
        const { save: _save, ...keep } = c;
        await actor.setFlag(SYSTEM_ID, "boneTemplates", [...tpls.filter(x => x.name !== c.name && x.name !== preset?.name), keep]);
        ui.notifications.info(t("BoneTplSaved", { name: c.name }));
      }
      // цена Волей — сразу, кровью — вместе с кровью силы в окне броска
      if (c.cost.will && !(await actor.spendWillpower(c.cost.will))) return null;
      roll = { ...roll, difficulty: c.diff, blood: (roll.blood ?? 1) + c.cost.blood, note: t("BoneC.RollNote", { name: who.name, what: c.name }) };
      opts.power = { ...opts.power, noHit: true };
      opts.subtitle = `→ ${who.name} · ${subtitle}`;
      opts.more = { targetPower: { key, target: who.uuid, targetName: who.name, powerName: p.name, actorName: actor.name, bone: "custom", custom: c } };
    } else if (mode === "weapon") {
      if (!target) { ui.notifications.warn(t("NeedTarget")); return null; }
      roll = { ...roll, difficulty: 7, note: t("BoneWeaponNote") };
      opts.more = null;
    } else {
      const d = await ask(t("BoneFine"), [5, 6, 7, 8, 9].map(n => [String(n), t(`BoneDiff.${n}`)]));
      if (!d) return null;
      const who = target ?? actor;
      roll = { ...roll, difficulty: parseInt(d), note: t(`BoneNote.${mode}`, { name: who.name }) };
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
  if (tp.kind === "poison") {
    const max = Math.min(actor.system.attributes.stamina.total, actor.system.blood?.value ?? 0);
    if (max < 1) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoBlood", { name: actor.name }));
    const n = await foundry.applications.api.DialogV2.prompt({ window: { title: p.name, icon: "fa-solid fa-skull-crossbones" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
      content: `<div class="r-form"><label class="r-field"><span>${esc(t("PoisonBlood"))}</span><select name="n">${Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}</select></label></div>`,
      ok: { label: t("PoisonGo"), callback: (e, b) => Number(b.form.elements.n.value) || 1 } });
    if (!n) return null;
    roll = { ...roll, blood: n, note: t("PoisonNote", { n }) };
    opts.more = { targetPower: { ...link, poison: n } };
  }
  // Усмирение Зверя: вселить страх (Манипуляция + Запугивание) или успокоить (Манипуляция + Эмпатия), сл. 7;
  // продолжительный бросок до постоянной Воли цели; Сородича в бешенстве — только успокоить, 3+ успеха — переброс ярости
  if (tp.kind === "quell") {
    const kindred = target.isVampire;
    const way = kindred ? "calm" : await foundry.applications.api.DialogV2.prompt({ window: { title: p.name, icon: "fa-solid fa-paw" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
      content: `<div class="r-form"><label class="r-field"><span>${esc(t("QuellHow"))}</span><select name="w"><option value="fear">${esc(t("QuellFear"))}</option><option value="calm">${esc(t("QuellCalm"))}</option></select></label></div>`,
      ok: { label: t("VisageGo"), callback: (e, b) => b.form.elements.w.value } });
    if (!way) return null;
    roll = { ...roll, trait2: way === "calm" ? "abilities.empathy" : "abilities.intimidation", difficulty: 7 };
    if (kindred) {
      roll.note = t("QuellKindredNote", { name: target.name });
      opts.more = null;
      opts.onRolled = res => (res?.successes ?? 0) >= 3 ? ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }),
        whisper: game.users.filter(u => u.isGM || target.testUserPermission(u, "OWNER")).map(u => u.id),
        flags: { [SYSTEM_ID]: { checkPrompt: { kind: "frenzy", difficulty: 6, actorUuid: target.uuid } } },
        content: `<div class="r-notice r-check-prompt is-frenzy"><i class="fa-solid fa-face-angry"></i> <span>${esc(t("QuellKindredOk", { name: target.name, by: actor.name }))}</span>
          <div class="r-card-buttons"><button type="button" data-r-action="virtueCheck"><i class="fa-solid fa-dice-d10"></i> ${esc(game.i18n.localize("VTM20.CheckPrompt.Roll"))}</button></div></div>` }) : null;
    } else {
      const need = Math.max(1, target.system.willpower?.permanent ?? 1);
      Object.assign(opts, { contest: "extended", need });
      roll.note = t("QuellNote", { n: need, name: target.name });
      // провал — цель невосприимчива к этому вампиру до конца сцены
      opts.onRolled = async res => {
        if (res?.outcome !== "botch") return;
        if (target.isOwner) await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("QuellImmuneName", { name: actor.name }), img: Codex.disciplineIcon("animalism"),
          flags: { [SYSTEM_ID]: { mind: key, quellImmune: actor.uuid, mode: "scene" } } }]);
        notice(target, p.name, t("QuellImmune", { name: target.name }));
      };
    }
  }
  // Отчуждение Зверя: неудача — бешенство самому (вдвое дольше), провал — неуправляемое
  if (tp.kind === "beast") opts.onRolled = async res => {
    if ((res?.successes ?? 0) > 0) return;
    if (!actor.statuses?.has("r-frenzy")) await actor.toggleStatusEffect("r-frenzy", { active: true });
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice is-warn"><i class="fa-solid fa-face-angry"></i> ${esc(t(res?.outcome === "botch" ? "BeastBotch" : "BeastFail", { name: actor.name }))}</div>` });
  };
  // строка итога по успехам — вместе с прежней обработкой (провал Доминирования и т. п.), а не вместо неё
  if (tp.tiers) { const prevT = opts.onRolled; opts.onRolled = async res => { await prevT?.(res); const line = tierText(tp, res?.successes ?? 0); if (line && (res?.successes ?? 0) > 0) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice"><i class="fa-solid fa-brain"></i> <b>${esc(p.name)}</b>: ${esc(line)}</div>` }); }; }
  return rollFromSpec(actor, roll, opts);
}

/** Невосприимчивость к Величию этого вампира: неудача — до рассвета, провал — до конца истории (снимается вручную). */
export async function presImmune(target, vampire, power, botch, powerName, disc = "presence") {
  const what = t(botch ? "PresImmuneStory" : "PresImmuneNight", { name: target.name, power: power === "all" ? t(disc === "dominate" ? "AllDominate" : "AllPresence") : powerName });
  if (!target.isOwner) return notice(target, powerName, what);
  const api = await clockApi();
  await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("PresImmuneName", { name: vampire.name }), img: Codex.disciplineIcon("presence"),
    description: `<p>${esc(what)}</p>`, flags: { [SYSTEM_ID]: { mind: `${disc}|immune`, presImmune: { by: vampire.uuid, power, disc }, mode: botch ? "manual" : "timed",
      ...(botch ? {} : { until: api.nextSunrise(api.getClock()) }) } } }]);
  return notice(target, powerName, what);
}
