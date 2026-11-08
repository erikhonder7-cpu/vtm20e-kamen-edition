// module/apps/target-powers.mjs
// Силы против цели (V20, Дисциплины, уровни 1–5): сложность — черта отмеченной цели (T), итог — на цели.
//   · сложность: текущая Воля, Смекалка + Смелость, Человечность/Путь, Восприятие + Самоконтроль — по тексту силы;
//   · Доминирование: нельзя против вампира более низкого поколения (V20, гл. 4), нужен зрительный контакт;
//   · Внушение и Забвение: что даёт число успехов — строкой в чат (таблица из текста силы);
//   · Очарование, Страсть, Наваждение, Помрачение рассудка: эффект на цели со сроком по успехам
//     (гаснет по часам хроники — apps/timers.mjs; «1 ход» — до конца сцены);
//   · Устрашающий взор: −1 куб к пулам цели за успех до конца её следующего хода, 3+ — бежит.
//   · Глаза змеи: смертный замирает сразу; вампир и иной сверхъестественный — если змей пройдёт Волю (сл. 9);
//   · Касание скорпиона: яд — выбранная кровь (до Выносливости), сопротивление Выносливость + Стойкость (сл. 6),
//     оставшиеся успехи — срок; Выносливость цели снижается на число пунктов яда;
//   · Усмирение Зверя: продолжительный бросок до постоянной Воли цели; на Сородичей не действует;
//   · Отчуждение Зверя: успех — бешенство переходит на цель, неудача — вампир сам впадает в бешенство;
//   · Покрывало ночи: облако тьмы на сцене у вампира, 3 м в диаметре, каждый лишний успех — вдвое шире;
//   · Руки Бездны: щупальце за успех — статист со Силой = Затмение + Мощь, Ловкостью = Затмение + Стремительность,
//     Драка и прочность (Выносливость + Стойкость) — создателя (правило системы), 4 уровня здоровья — потом рассеивается;
//   · Исчезновение из виду: сложность — Смекалка + Шестое чувство наблюдателя; 4+ — Незримое присутствие, 1–3 — силуэт;
//   · Тайное собрание: действующее Сокрытие — на отмеченных спутников, по одному за точку Скрытности.
// Наложить эффект может владелец цели или рассказчик — кнопкой на карточке броска (как «принять урон»).

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
// календарь и сроки — лениво (apps/calendar.mjs тянет ApplicationV2, а roll.mjs проверяется и вне Foundry)
const clockApi = async () => ({ ...(await import("./calendar.mjs")), ...(await import("./timers.mjs")) });

const t = (k, d) => d ? game.i18n.format(`VTM20.TP.${k}`, d) : game.i18n.localize(`VTM20.TP.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Силы по Дисциплине и английскому имени (имя на русском у сил разных книг может совпадать). */
export const TARGET_POWERS = {
  "dominate|Command": { diff: ["willpower"], dominate: true, note: "Dom1" },
  "dominate|Mesmerize": { diff: ["willpower"], dominate: true, tiers: [[1, "Mes1"], [3, "Mes3"], [5, "Mes5"]] },
  "dominate|The Forgetful Mind": { diff: ["willpower"], dominate: true, tiers: [[1, "Forg1"], [2, "Forg2"], [3, "Forg3"], [4, "Forg4"], [5, "Forg5"]] },
  "dominate|Conditioning": { diff: ["willpower"], dominate: true, note: "Cond" },
  "presence|Dread Gaze": { diff: ["wits", "courage"], dread: true },
  "presence|Entrancement": { diff: ["willpower"], timed: ["hour", "day", "week", "month", "year"] },
  "dementation|Passion": { diff: ["morality"], timed: ["scene", "hour", "night", "week", "month", "3months"] },
  "dementation|The Haunting": { diff: ["perception", "selfControl"], timed: ["night", "2nights", "week", "month", "3months", "year"] },
  "dementation|Total Insanity": { diff: ["willpower"], timed: ["scene", "night", "week", "month", "year"], note: "Insane" },
  "auspex|Telepathy": { diff: ["willpower"], note: "Tele" },
  "serpentis|Eyes of the Serpent": { kind: "eyes", needTarget: true },
  "quietus|Scorpion's Touch": { kind: "poison", needTarget: true, timed: ["scene", "hour", "day", "month", "forever"] },
  "animalism|Quell the Beast": { kind: "quell", needTarget: true, mortalOnly: true },
  "animalism|Drawing Out the Beast": { kind: "beast", needTarget: true },
  "obtenebration|Shroud of Night": { kind: "shroud", self: true },
  "obtenebration|Arms of the Abyss": { kind: "arms", self: true },
  "obfuscate|Vanish from the Mind's Eye": { kind: "vanish", self: true, diff: ["wits", "awareness"] },
  "obfuscate|Cloak the Gathering": { kind: "gather" }
};

/** Сверхъестественное существо (Глаза змеи): вампир, Гару, падший, сверхъестественная тварь; гуль и охотник — смертные. */
const supernatural = a => ["vampire", "werewolf", "demon"].includes(a.type) || (a.type === "creature" && !!a.system.supernatural);

export const targetPowerOf = (disc, p) => TARGET_POWERS[`${disc}|${p?.en ?? ""}`] ?? null;

/** Черта цели для сложности. */
function traitOf(a, k) {
  const s = a.system;
  switch (k) {
    case "willpower": return s.willpower?.temporary ?? null;
    case "morality": return s.morality?.value ?? null;
    case "courage": case "selfControl": return s.virtues?.[k]?.value ?? null;
    case "awareness": return s.abilities?.[k]?.value ?? 0;
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
export function prepareTargetPower(actor, disc, p, tp) {
  const target = markedTarget(actor);
  if (!target && tp.needTarget) { ui.notifications.warn(t("NeedTarget")); return null; }
  if (tp.mortalOnly && target?.isVampire) { ui.notifications.warn(t("NotKindred", { name: target.name })); return null; }
  if (!tp.diff) return { difficulty: null, note: "", target };
  const label = tp.diff.map(k => t(`Diff.${k}`)).join(" + ");
  if (!target) {
    ui.notifications.info(t("MarkTarget"));
    return { difficulty: null, note: t("NoTarget", { what: label }), target: null };
  }
  // Доминирование: кровь сильнее (поколение ниже) — неподвластна (V20, гл. 4)
  if (tp.dominate && actor.isVampire && target.isVampire && Number(target.system.generation) < Number(actor.system.generation)) {
    ui.notifications.warn(t("DomGeneration", { name: target.name }));
    return null;
  }
  const parts = tp.diff.map(k => traitOf(target, k));
  if (parts.some(v => v == null)) return { difficulty: null, note: t("NoTrait", { name: target.name, what: label }), target };
  const raw = parts.reduce((s, v) => s + Number(v), 0);
  const difficulty = Math.clamp(raw, 2, 10);
  const notes = [t("DiffFrom", { name: target.name, what: label, n: raw })];
  if (raw > 10) notes.push(t("Over10"));
  if (tp.dominate) notes.push(t("Eyes"));
  if (tp.note) notes.push(t(`Note.${tp.note}`));
  return { difficulty, note: notes.join(" "), target };
}

/** Срок по числу успехов. */
function untilOf(code, now, { MS_HOUR, MS_DAY, nextSunrise }) {
  switch (code) {
    case "scene": return null;
    case "hour": return now + MS_HOUR;
    case "night": return nextSunrise(now);
    case "2nights": return nextSunrise(nextSunrise(now) + MS_HOUR);
    case "day": return now + MS_DAY;
    case "week": return now + 7 * MS_DAY;
    case "month": return now + 30 * MS_DAY;
    case "3months": return now + 90 * MS_DAY;
    case "year": return now + 365 * MS_DAY;
  }
  return null;
}

/** Строка итога по числу успехов (Внушение, Забвение) — после броска. */
export function tierText(tp, successes) {
  const row = [...(tp.tiers ?? [])].reverse().find(([n]) => successes >= n);
  return row ? t(`Tier.${row[1]}`) : "";
}

/** Подпись кнопки «наложить» на карточке (только у сил с эффектом на цели). */
export function targetPowerLabel(extra, ev) {
  const tp = extra?.targetPower && TARGET_POWERS[extra.targetPower.key];
  if (!tp || ev.outcome !== "success" || extra.targetPower.done || !(tp.timed || tp.dread || tp.kind)) return "";
  // Усмирение — только когда накоплены все успехи продолжительного броска
  if (tp.kind === "quell" && !((extra.extended?.prev ?? 0) + ev.successes >= (extra.extended?.need ?? Infinity))) return "";
  const lbl = { beast: "BeastApply", poison: "PoisonApply", shroud: "ShroudApply", arms: "ArmsApply", vanish: "VanishApply" }[tp.kind] ?? "Apply";
  return t(lbl, { name: extra.targetPower.targetName, n: ev.successes });
}

/** Кнопка на карточке: эффект силы на цели (владелец цели или рассказчик). */
export async function applyTargetPower(message, state, ev) {
  const x = state.extra?.targetPower, tp = x && TARGET_POWERS[x.key];
  if (!tp || x.done) return;
  const target = await foundry.utils.fromUuid(x.target);
  if (!target) return ui.notifications.warn(t("Gone"));
  if (["shroud", "arms"].includes(tp.kind)) {
    if (!game.user.isGM) return ui.notifications.warn(t("GMOnly"));
    await done(message, state, x);
    return tp.kind === "shroud" ? placeShroud(target, ev.successes) : summonArms(target, ev.successes);
  }
  if (!target.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: target.name }));
  const api = await clockApi(), n = ev.successes, now = api.getClock();
  const [disc] = x.key.split("|");
  const flags = { mind: x.key, by: state.actorUuid ?? "", start: now };
  let name = `${x.powerName} · ${x.actorName}`, desc = "";
  if (tp.kind === "beast") {
    // Отчуждение Зверя: бешенство вампира переходит на цель (V20, Анимализм 5)
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    if (self && !self.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: self.name }));
    if (self?.statuses?.has("r-frenzy")) await self.toggleStatusEffect("r-frenzy", { active: false });
    if (!target.statuses?.has("r-frenzy")) await target.toggleStatusEffect("r-frenzy", { active: true });
    desc = t(n >= 3 ? "Beast3" : n === 2 ? "Beast2" : "Beast1");
    await done(message, state, x);
    return notice(target, x.powerName, desc);
  }
  if (tp.kind === "vanish") {
    // 4+ успеха — исчезает полностью (Незримое присутствие); 1–3 — полупрозрачный силуэт (V20, Сокрытие 4)
    await done(message, state, x);
    if (n >= 4) { if (!target.powerEffects.some(e => e.power === "obfuscate:2")) await target.startPower("obfuscate:2"); return notice(target, x.powerName, t("Vanish4")); }
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("VanishName"), img: Codex.disciplineIcon("obfuscate"), description: `<p>${esc(t("Vanish1"))}</p>`,
      flags: { [SYSTEM_ID]: { ...flags, mode: "scene" } } }]);
    return notice(target, x.powerName, t("Vanish1"));
  }
  if (tp.kind === "poison") {
    // Касание скорпиона: сопротивление Выносливость + Стойкость (сл. 6), каждый успех снимает успех ассамита
    const { rollPool } = await import("../dice/roll.mjs");
    const pool = (target.system.attributes?.stamina?.total ?? 0) + (target.discipline?.("fortitude") ?? 0);
    const res = pool > 0 ? await rollPool({ actor: target, title: t("PoisonResist"), pool, difficulty: 6, kind: "check", noBotch: true }) : { successes: 0 };
    const left = n - (res?.successes ?? 0);
    await done(message, state, x);
    if (left <= 0) return notice(target, x.powerName, t("PoisonResisted"));
    const code = tp.timed[Math.min(left, tp.timed.length) - 1];
    const until = untilOf(code, now, api);
    Object.assign(flags, { attrMod: { stamina: -(x.poison ?? 1) }, mode: code === "forever" ? "manual" : until ? "timed" : "scene", ...(until ? { until } : {}) });
    name = t("PoisonName", { n: x.poison ?? 1 });
    desc = t("PoisonDesc", { n: x.poison ?? 1, dur: t(`Dur.${code}`) });
  } else if (tp.kind === "eyes") {
    Object.assign(flags, { mode: "scene" });
    name = t("EyesName", { name: x.actorName });
    desc = t(supernatural(target) ? "EyesSuper" : "EyesMortal");
  } else if (tp.kind === "quell") {
    Object.assign(flags, { mode: "manual" });
    name = t("QuellName", { name: x.actorName });
    desc = t("QuellDesc");
  } else if (tp.dread) {
    // −1 куб за успех на следующий ход цели; 3+ — бежит в ужасе (V20, Величие 2)
    Object.assign(flags, { dread: n, mode: "scene" });
    name = t("DreadName", { n });
    desc = t(n >= 3 ? "DreadFlee" : "DreadDice", { n });
  } else {
    const code = tp.timed[Math.min(n, tp.timed.length) - 1];
    const until = untilOf(code, now, api);
    Object.assign(flags, { mode: until ? "timed" : "scene", ...(until ? { until } : {}) });
    desc = t(`Dur.${code}`);
  }
  await target.createEmbeddedDocuments("ActiveEffect", [{ name, img: Codex.disciplineIcon(disc), description: `<p>${esc(desc)}</p>`,
    ...(tp.kind === "eyes" ? { statuses: ["r-held"] } : {}), flags: { [SYSTEM_ID]: flags } }]);
  if (tp.kind !== "poison") await done(message, state, x);
  return notice(target, x.powerName, desc);
}

/** Кнопка отработала: на карточке броска — пометка, на карточке «наложить» — убрать кнопку. */
async function done(message, state, x) {
  if (!message?.isOwner) return;
  if (message.getFlag?.(SYSTEM_ID, "targetApply")) {
    await message.setFlag(SYSTEM_ID, "targetApply", { ...x, done: true });
    return message.update({ content: String(message.content).replace(/<div class="r-card-buttons">[\s\S]*?<\/div>/, "") });
  }
  const { renderCard } = await import("../dice/roll.mjs");
  const next = { ...state, extra: { ...state.extra, targetPower: { ...x, done: true } } };
  await message.setFlag(SYSTEM_ID, "roll", next);
  await message.update({ content: await renderCard(next) });
}

const notice = (target, power, what) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }),
  content: `<div class="r-notice"><i class="fa-solid fa-brain"></i> ${t("Applied", { name: esc(target.name), power: esc(power), what: esc(what) })}</div>` });

/**
 * Бросок силы против цели (лист и HUD — sheets/actor-sheet.mjs → rollPowerRef).
 * @param {Function} rollFromSpec  окно броска силы из листа
 */
export async function rollTargetPower(actor, disc, d, p, tp, { rollFromSpec, subtitle }) {
  const prep = prepareTargetPower(actor, disc, p, tp);
  if (!prep) return null;
  const target = prep.target;
  const key = `${disc}|${p.en}`;
  // силы на себя (Покрывало ночи, Руки Бездны, Исчезновение) — «цель» карточки сам вампир, отмеченный — наблюдатель
  const holder = tp.self ? actor : target;
  const link = holder ? { key, target: holder.uuid, targetName: holder.name, powerName: p.name, actorName: actor.name } : null;
  // Тайное собрание: без броска — действующее Сокрытие ложится на отмеченных спутников
  if (tp.kind === "gather") return cloakGathering(actor, p);
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
    more: link ? { targetPower: link } : null };
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
  // Усмирение Зверя: продолжительный бросок до постоянной Воли цели (сл. 7)
  if (tp.kind === "quell") {
    const need = Math.max(1, target.system.willpower?.permanent ?? 1);
    Object.assign(opts, { contest: "extended", need });
    roll.note = t("QuellNote", { n: need, name: target.name });
  }
  // Отчуждение Зверя: неудача — бешенство самому (вдвое дольше), провал — неуправляемое
  if (tp.kind === "beast") opts.onRolled = async res => {
    if ((res?.successes ?? 0) > 0) return;
    if (!actor.statuses?.has("r-frenzy")) await actor.toggleStatusEffect("r-frenzy", { active: true });
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice is-warn"><i class="fa-solid fa-face-angry"></i> ${esc(t(res?.outcome === "botch" ? "BeastBotch" : "BeastFail", { name: actor.name }))}</div>` });
  };
  if (tp.tiers) opts.onRolled = res => { const line = tierText(tp, res?.successes ?? 0); if (line && (res?.successes ?? 0) > 0) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice"><i class="fa-solid fa-brain"></i> <b>${esc(p.name)}</b>: ${esc(line)}</div>` }); };
  return rollFromSpec(actor, roll, opts);
}

/** Покрывало ночи: облако тьмы (источник тьмы Foundry) у жетона вампира. */
async function placeShroud(actor, n) {
  const tok = actor.getActiveTokens?.()[0];
  if (!tok || !canvas?.scene) return ui.notifications.warn(t("NoToken", { name: actor.name }));
  const meters = 1.5 * 2 ** Math.max(0, n - 1);                         // радиус: 3 м в диаметре, ×2 за лишний успех
  const feet = /ft|фут/i.test(canvas.scene.grid.units ?? "");
  const radius = Math.round((feet ? meters * 3.28 : meters) * 10) / 10;
  await canvas.scene.createEmbeddedDocuments("AmbientLight", [{ x: tok.center.x, y: tok.center.y,
    config: { negative: true, bright: radius, dim: radius }, flags: { [SYSTEM_ID]: { abyss: actor.uuid } } }]);
  return notice(actor, t("ShroudTitle"), t("ShroudDone", { d: meters * 2 }));
}

/** Руки Бездны: щупальце за успех — статист рядом с вампиром. */
async function summonArms(actor, n) {
  const tok = actor.getActiveTokens?.()[0];
  const ob = actor.discipline("obtenebration"), pot = actor.discipline("potence"), cel = actor.discipline("celerity");
  const s = actor.system, sta = (s.attributes.stamina.total ?? 1) + actor.discipline("fortitude");
  const made = [];
  for (let i = 0; i < n; i++) {
    const a = await Actor.create({ name: t("ArmName", { i: i + 1, name: actor.name }), type: "creature", img: `systems/${SYSTEM_ID}/assets/icons/creature.svg`,
      flags: { [SYSTEM_ID]: { abyssArm: actor.uuid } },
      system: { kind: t("ArmKind"), supernatural: true, blood: { max: 0, value: 0 },
        attributes: { strength: { value: Math.min(10, ob + pot) }, dexterity: { value: Math.min(10, ob + cel) }, stamina: { value: Math.min(10, sta) } },
        abilities: { brawl: { value: s.abilities?.brawl?.value ?? 0 } } } });
    await a.createEmbeddedDocuments("Item", [{ name: t("ArmGrip"), type: "weapon", system: { kind: "brawl", damage: 1, strength: true, damageType: "lethal", difficulty: 6, equipped: true } }]);
    made.push(a);
  }
  if (tok && canvas?.scene) await canvas.scene.createEmbeddedDocuments("Token", await Promise.all(made.map((a, i) =>
    a.getTokenDocument({ x: tok.document.x + (i + 1) * canvas.grid.size, y: tok.document.y + canvas.grid.size }))));
  return notice(actor, t("ArmsTitle"), t("ArmsDone", { n, s: Math.min(10, ob + pot), d: Math.min(10, ob + cel) }));
}

/** Тайное собрание: действующее Сокрытие — на отмеченных спутников (по одному за точку Скрытности). */
async function cloakGathering(actor, p) {
  const own = actor.powerEffects.find(e => /^obfuscate:[123]$/.test(e.power));
  if (!own) return ui.notifications.warn(t("GatherNoCloak"));
  const max = actor.system.abilities?.stealth?.value ?? 0;
  const allies = [...(game.user.targets ?? [])].map(tk => tk.actor).filter(x => x && x !== actor);
  if (!allies.length) return ui.notifications.warn(t("GatherMark"));
  const taken = allies.slice(0, max), skipped = allies.length - taken.length;
  for (const ally of taken) {
    if (!ally.isOwner) { ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: ally.name })); continue; }
    await ally.createEmbeddedDocuments("ActiveEffect", [{ name: t("GatherName", { power: own.effect.name, name: actor.name }), img: Codex.disciplineIcon("obfuscate"),
      description: `<p>${esc(t("GatherDesc"))}</p>`, flags: { [SYSTEM_ID]: { mind: "obfuscate|Cloak the Gathering", by: actor.uuid, mode: "scene" } } }]);
  }
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice"><i class="fa-solid fa-user-secret"></i> <b>${esc(p.name)}</b>: ${esc(t("GatherDone",
    { names: taken.map(a => a.name).join(", "), power: own.effect.name }))}${skipped ? ` ${esc(t("GatherSkipped", { n: skipped, max }))}` : ""}</div>` });
}

/** Конец сцены (рассказчик): тьма Покрывала ночи и щупальца Рук Бездны исчезают. */
export async function endSceneAbyss() {
  if (!game.user.isGM) return;
  for (const s of game.scenes) {
    const lights = s.lights.filter(l => l.getFlag(SYSTEM_ID, "abyss")).map(l => l.id);
    if (lights.length) await s.deleteEmbeddedDocuments("AmbientLight", lights);
  }
  await dismissArms(game.actors.filter(a => a.getFlag(SYSTEM_ID, "abyssArm")));
}
async function dismissArms(arms) {
  for (const a of arms) {
    for (const s of game.scenes) { const ids = s.tokens.filter(tk => tk.actorId === a.id).map(tk => tk.id); if (ids.length) await s.deleteEmbeddedDocuments("Token", ids); }
    await a.delete();
  }
}

/** Кнопка карточки «наложить» без броска (Глаза змеи против смертного). */
export async function applyFromCard(message) {
  const x = message.getFlag(SYSTEM_ID, "targetApply");
  if (!x || x.done) return;
  return applyTargetPower(message, { actorUuid: x.actorUuid, extra: { targetPower: x } }, { successes: 1, outcome: "success" });
}

/** Штраф к пулам от Устрашающего взора — для окон бросков. */
export function dreadDice(actor) {
  return [...(actor?.effects ?? [])].filter(e => !e.disabled && e.flags?.[SYSTEM_ID]?.dread)
    .map(e => ({ label: e.name, value: -Number(e.flags[SYSTEM_ID].dread) }));
}

/** Снять с цели эффекты «до конца сцены» (Конец сцены). */
export async function endSceneMind(actor) {
  // «manual» (Усмирение, яд навсегда) снимаются вручную
  const ids = actor.effects.filter(e => e.flags?.[SYSTEM_ID]?.mind && e.flags[SYSTEM_ID].mode === "scene").map(e => e.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

let hooked = false;
/** Устрашающий взор гаснет в конце следующего хода цели (рассказчик). */
export function registerTargetPowers() {
  if (hooked) return;
  hooked = true;
  const ending = new Map();
  Hooks.on("preUpdateCombat", (combat, changes) => {
    if (!game.user.isGM || !combat.started || !("turn" in changes || "round" in changes)) return;
    ending.set(combat.id, combat.combatant?.actor ?? null);
  });
  Hooks.on("updateCombat", async combat => {
    if (!game.user.isGM) return;
    const actor = ending.get(combat.id);
    ending.delete(combat.id);
    if (!actor) return;
    const ids = actor.effects.filter(e => e.flags?.[SYSTEM_ID]?.dread).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  });
  // Руки Бездны: у щупальца 4 уровня здоровья — после четвёртого оно рассеивается (рассказчик)
  Hooks.on("updateActor", async actor => {
    if (!game.users.activeGM?.isSelf || !actor.getFlag(SYSTEM_ID, "abyssArm") || (actor.system.health?.damage ?? 0) < 4) return;
    await ChatMessage.create({ content: `<div class="r-notice"><i class="fa-solid fa-wind"></i> ${esc(t("ArmGone", { name: actor.name }))}</div>` });
    await dismissArms([game.actors.get(actor.id) ?? actor]);
  });
}
