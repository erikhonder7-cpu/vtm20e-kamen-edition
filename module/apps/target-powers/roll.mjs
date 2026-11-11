// module/apps/target-powers/roll.mjs
// Силы по цели — бросок: сложность по цели, подготовка (кто цель, чем сопротивляется), сам бросок и то, что решается сразу.

import { allowAnyway } from "../rule-gate.mjs";
import { SYSTEM_ID } from "../../config.mjs";
import { Codex } from "../../data/codex.mjs";
import { PATH_POWERS } from "../../data/path-powers.mjs";
import { bloodRoll } from "../bloodlines.mjs";
import { clockApi, t, esc, TARGET_POWERS, sameActor, supernatural, tierText, notice, ask } from "./core.mjs";
import { contradict, burningTouch, illusion, auraLines, tasteLines, cloakGathering } from "./effects.mjs";
import { ROLL } from "./roll-kinds.mjs";

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
  // подготовка броска по виду силы (roll-kinds.mjs): меняет ctx.roll и opts; { stop } — бросать не нужно
  const prepKind = ROLL[tp.kind];
  if (prepKind) {
    const ctx = { roll, actor, disc, d, p, tp, target, key, link, holder, prep, opts, subtitle, kind, magic, virt, rollFromSpec }, r = await prepKind(ctx);
    if (r && "stop" in r) return r.stop;
    roll = ctx.roll;
  }
  if (tp.kind === "chaos") {
    const d = await ask(p.name, [["9", t("ChaosStranger")], ["8", t("ChaosKnown")], ["6", t("ChaosFriend")], ["7", t("ChaosCode")], ["6p", t("ChaosPattern")]]);
    if (!d) return null;
    roll = { ...roll, difficulty: parseInt(d), note: t("ChaosNote") };
  }
  if (tp.kind === "possess") roll = { ...roll, willpower: true, note: t("PossessNote", { name: target.name }) };
  if (tp.kind === "sin") opts.onRolled = res => {
    const n = res?.successes ?? 0;
    if (n < 1) return;
    const lines = [t("SinT1"), n >= 2 && t("SinT2"), n >= 3 && t("SinT3")].filter(Boolean);
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id, ...game.users.filter(u => u.isGM).map(u => u.id)],
      content: `<div class="r-notice"><i class="fa-solid fa-eye"></i> <b>${esc(p.name)}</b> → ${esc(target.name)}<ul>${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>` });
  };
  if (tp.kind === "void") roll.note = [roll.note, t("VoidNote")].filter(Boolean).join(" ");
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
  if (tp.kind === "riddle") roll.note = [roll.note, t("RiddleNote")].filter(Boolean).join(" ");
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
