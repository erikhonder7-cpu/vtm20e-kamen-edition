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
//   · Тайное собрание: действующее Сокрытие — на отмеченных спутников, по одному за точку Скрытности;
//   · Путь Крови (Тауматургия): Вкус крови — сведения о цели по успехам (только себе и рассказчику, правило системы);
//     Неистовство крови — цель тратит кровь за каждый успех, +1 к сложности сопротивления ярости за кровь;
//     Могущество крови — раз за ночь: поколение ниже на 1 на час, лишние успехи — часы или ступени;
//     Хищение крови — кровь от цели тауматургу. Котёл крови — data/combat-powers.mjs (урон и выкипание крови);
//   · Вселение: встречная — цель бросает текущую Волю (сл. 7), разница успехов снимает её Волю; на нуле — тело занято;
//   · Чтение ауры: сведения по успехам шёпотом (природа, бешенство, следы диаблери — правило системы);
//   · Психическая проекция: тело в оцепенении до конца сцены;
//   · Изменчивый облик: Привлекательность выше (сл. 9, +1 кровь за точку), провал — навсегда −1;
//   · Искусство тканей: Привлекательность цели ± за успех, Укрепление тела — +1 куб к поглощению за успех ценой Силы;
//   · Язык животных: сложность по виду зверя (6 хищники, 7 прочие звери и хищные птицы, 8 птицы и рептилии);
//   · Зов: звери из справочника приходят жетонами — доля услышавших по успехам;
//   · Поглощение духа: вампир в теле зверя, доступные Дисциплины — по успехам.
// Наложить эффект может владелец цели или рассказчик — кнопкой на карточке броска (как «принять урон»).

import { allowAnyway } from "./rule-gate.mjs";
import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { PATH_POWERS } from "../data/path-powers.mjs";
import { bloodRoll, bloodApply, BLOOD_APPLY, BLOOD_SELF } from "./bloodlines.mjs";
// календарь и сроки — лениво (apps/calendar.mjs тянет ApplicationV2, а roll.mjs проверяется и вне Foundry)
const clockApi = async () => ({ ...(await import("./calendar.mjs")), ...(await import("./timers.mjs")) });

const t = (k, d) => d ? game.i18n.format(`VTM20.TP.${k}`, d) : game.i18n.localize(`VTM20.TP.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Силы по Дисциплине и английскому имени (имя на русском у сил разных книг может совпадать). */
export const TARGET_POWERS = {
  "dominate|Command": { diff: ["willpower"], dominate: true, note: "Dom1" },
  "dominate|Mesmerize": { kind: "mesmerize", diff: ["willpower"], dominate: true, needTarget: true, tiers: [[1, "Mes1"], [3, "Mes3"], [5, "Mes5"]] },
  "dominate|The Forgetful Mind": { kind: "forget", diff: ["willpower"], dominate: true, needTarget: true, tiers: [[1, "Forg1"], [2, "Forg2"], [3, "Forg3"], [4, "Forg4"], [5, "Forg5"]] },
  "dominate|Conditioning": { kind: "condition", diff: ["willpower"], dominate: true, needTarget: true, note: "Cond" },
  "presence|Awe": { kind: "awe", self: true },
  "presence|Dread Gaze": { diff: ["wits", "courage"], dread: true, presence: true },
  "presence|Entrancement": { diff: ["willpower"], timed: ["hour", "day", "week", "month", "year"], presence: true, once: true },
  "presence|Summon": { kind: "call", presence: true, needTarget: true },
  "dementation|Passion": { diff: ["morality"], timed: ["scene", "hour", "night", "week", "month", "3months"] },
  "dementation|The Haunting": { diff: ["perception", "selfControl"], timed: ["night", "2nights", "week", "month", "3months", "year"] },
  "dementation|Total Insanity": { diff: ["willpower"], timed: ["scene", "night", "week", "month", "year"], note: "Insane" },
  // Телепатия: передать мысль или читать мысли; чтение Сородича и иного сверхъестественного — 1 Воля до броска
  "auspex|Telepathy": { diff: ["willpower"], note: "Tele", kind: "tele" },
  // Психометрия: сложность по давности и силе следа (4 … 9)
  "auspex|The Spirit's Touch": { kind: "psycho" },
  // Мистификация 3–5 (киасиды): Поглощение ауры — сложность по следу; Печать фей — 2 + Воля цели (предмет — 7), срок по успехам,
  // −2 к Интеллекту; Волшебная загадка — сложность Воля жертвы, жертва замирает и решает (Смекалка + Оккультизм, сл. 8)
  "mytherceria|Aura Absorption": { kind: "absorb" },
  // Бардо: Возрождение Человечности (вся кровь, Совесть против возвращаемой Человечности), Обелиск Осириса (место — сложность,
  // успех — сень Обелиска), Парадокс (сложность — самая сильная Воля среди слушателей; оцепенение на сцену, потом +1 вредить)
  "bardo|Restore Humanitas": { kind: "humanitas" },
  // Валерен: Биение жизни (сведения по успехам), Обезболивающее касание (боль — на ходы; сопротивление и сон — Воля против Воли, сл. 8),
  // Обжигающее касание (без броска: −2 куба к пулам за кровь), Броня гнева Каинова (+броня по успехам), Месть Самиэля (следующая атака)
  "valeren|Sense Vitality": { kind: "vitality", allowSelf: true },
  // Висцератика 5: после Слияния — 2 крови до конца сцены; сквозь стену — Сила + Мощь (сл. 8), 1 кровь, 30 см за успех
  "visceratika|Flow Within the Mountain": { kind: "flow" },
  // Демонион: Запах греха (4 + Самоконтроль; тайны по успехам), Низменный страх (4 + Смелость; страх, паника, обморок;
  // Сородич — Смелость против Воли баали), Всесожжение (кровь — губительные огнём), Психомахия (бросок жертвы: низшая
  // Добродетель, сл. 6), Проклятие (Воля цели; успехи — тяжесть и срок)
  "daimoinon|Sense the Sin": { kind: "sin", needTarget: true, diff: ["selfControl"], diffPlus: 4 },
  "daimoinon|Fear of the Void Below": { kind: "void", needTarget: true, diff: ["courage"], diffPlus: 4 },
  "daimoinon|Conflagration": { kind: "conflag", needTarget: true },
  "daimoinon|Psychomachia": { kind: "psychomachia", needTarget: true },
  "daimoinon|Condemnation": { kind: "condemn", needTarget: true, diff: ["willpower"] },
  "valeren|Anesthetic Touch": { kind: "anest", allowSelf: true },
  "valeren|Burning Touch": { kind: "burn", needTarget: true },
  "valeren|Armor of Caine's Fury": { kind: "caine" },
  "valeren|Vengeance of Samiel": { kind: "samiel" },
  "bardo|Pillar of Osiris": { kind: "pillar" },
  "bardo|Paradox": { kind: "paradox" },
  "mytherceria|Chanjelin Ward": { kind: "ward", timed: ["hour", "night", "week", "month", "year"] },
  "mytherceria|Riddle Phantastique": { kind: "riddle", needTarget: true, diff: ["willpower"] },
  // Фантасмагория 1–4: без броска — иллюзии эффектами на листе (их может быть несколько); 3–4 — к выбранной иллюзии
  "chimerstry|Ignis Fatuus": { kind: "illusion", will: 1 },
  "chimerstry|Fata Morgana": { kind: "illusion", will: 1, blood: 1, all: true },
  "chimerstry|Apparition": { kind: "illusion", step: "animate" },
  "chimerstry|Permanency": { kind: "illusion", step: "permanent" },
  // Кошмар наяву: 2 Воли; сложность — Восприятие + Самоконтроль жертвы; успех — неотвратимое тяжёлое, но не убивает
  "chimerstry|Horrid Reality": { kind: "nightmare", needTarget: true, diff: ["perception", "selfControl"] },
  "dementation|Eyes of Chaos": { kind: "chaos" },
  "dementation|Voice of Madness": { kind: "voice", self: true },
  "serpentis|Eyes of the Serpent": { kind: "eyes", needTarget: true },
  "quietus|Scorpion's Touch": { kind: "poison", needTarget: true, timed: ["scene", "hour", "day", "month", "forever"] },
  // Зов Дагона: после касания, в течение часа — 1 Воля за ход, Выносливость против Выносливости (сложность — Воля противника)
  "quietus|Dagon's Call": { kind: "dagon", needTarget: true },
  "animalism|Quell the Beast": { kind: "quell", needTarget: true, mortalOnly: true },
  "animalism|Drawing Out the Beast": { kind: "beast", needTarget: true },
  "obtenebration|Shroud of Night": { kind: "shroud", self: true },
  "obtenebration|Arms of the Abyss": { kind: "arms", self: true },
  "obfuscate|Vanish from the Mind's Eye": { kind: "vanish", self: true, diff: ["wits", "awareness"] },
  "obfuscate|Cloak the Gathering": { kind: "gather" },
  "thaumaturgy|A Taste for Blood": { kind: "taste", needTarget: true },
  "thaumaturgy|Blood Rage": { kind: "rage", needTarget: true },
  "thaumaturgy|Blood of Potency": { kind: "potency", self: true },
  "thaumaturgy|Theft of Vitae": { kind: "theft", needTarget: true },
  "dominate|Possession": { kind: "possess", needTarget: true, dominate: true, mortalTarget: true, ghoulOwn: true },
  "auspex|Aura Perception": { kind: "aura", needTarget: true },
  "auspex|Psychic Projection": { kind: "project", self: true },
  "vicissitude|Malleable Visage": { kind: "visage", self: true },
  "vicissitude|Fleshcraft": { kind: "flesh", needTarget: true },
  // Искусство костей: лепка (сл. 5–9), оружие (сл. 7, урон по успехам), когти и шипы — себе или отмеченной цели
  "vicissitude|Bonecraft": { kind: "bone" },
  "animalism|Feral Whispers": { kind: "whisper", needTarget: true, animal: true, tiers: [[1, "Whis1"], [3, "Whis3"], [5, "Whis5"]] },
  "animalism|The Beckoning": { kind: "beckon", self: true },
  "animalism|Subsume the Spirit": { kind: "subsume", needTarget: true, animal: true },
  // Кровные линии 1–5 (apps/bloodlines.mjs). Обеа 1–2 — те же силы, что у Валерена.
  "obeah|Sense Vitality": { kind: "vitality", allowSelf: true },
  "obeah|Anesthetic Touch": { kind: "anest", allowSelf: true },
  "obeah|Corpore Sano": { kind: "sano", allowSelf: true },
  "obeah|Shepherd's Watch": { kind: "shepherd" },
  "obeah|Ending the Watch": { kind: "endwatch" },
  "obeah|Mens Sana": { kind: "menssana", needTarget: true },
  "melpominee|Phantom Speaker": { kind: "phantom" },
  "melpominee|Madrigal": { kind: "madrigal" },
  "melpominee|Siren's Beckoning": { kind: "siren", needTarget: true, diff: ["willpower"] },
  "melpominee|Virtuosa": { kind: "virtuosa" },
  "sanguinus|Octopod": { kind: "octopod", needTarget: true },
  "sanguinus|Coagulated Entity": { kind: "entity" },
  "ogham|Consecrate the Grove": { kind: "grove" },
  "ogham|Crimson Woad": { kind: "woad" },
  "ogham|Inscribe the Curse": { kind: "curse", needTarget: true },
  "ogham|Moon and Sun": { kind: "moonsun", allowSelf: true },
  "ogham|Drain the Earth": { kind: "drain" },
  "sanguinus|Brother's Blood": { kind: "brother", needTarget: true },
  "sanguinus|Walk of Caine": { kind: "walkcaine", needTarget: true },
  "spiritus|Aid from Spirits": { kind: "aidspirit" },
  "spiritus|Summon Spirit Beasts": { kind: "spiritbeast", self: true },
  "spiritus|Aspect of the Beast": { kind: "aspect" },
  "spiritus|Engling Fury": { kind: "engling" },
  "thanatosis|Putrefaction": { kind: "putrefy", needTarget: true, diff: ["stamina", "fortitude"] },
  "thanatosis|Withering": { kind: "wither", needTarget: true, diff: ["stamina", "fortitude"] },
  "thanatosis|Necrosis": { kind: "necrosis", needTarget: true, diff: ["stamina", "fortitude"] },
  "temporis|Recurring Contemplation": { kind: "recur", needTarget: true, diff: ["willpower"] },
  "temporis|Leaden Moment": { kind: "leaden" },
  "temporis|Patience of the Norns": { kind: "norns" },
  "temporis|Clotho's Gift": { kind: "clotho" }
};

/** Поглощение духа: какие Дисциплины доступны в теле зверя по числу успехов (V20, Анимализм 4). */
const SUBSUME = [[], [], ["auspex"], ["auspex", "presence"], ["auspex", "presence", "dementation", "dominate"],
  ["auspex", "presence", "dementation", "dominate", "chimerstry", "necromancy", "thaumaturgy"]];
export function subsumeBlocks(actor, disc) {
  const e = [...(actor?.effects ?? [])].find(x => !x.disabled && x.flags?.[SYSTEM_ID]?.subsume);
  if (!e) return false;
  return !SUBSUME[Math.min(5, Number(e.flags[SYSTEM_ID].subsume))].includes(disc);
}

/** Сложность Языка животных по виду (по имени и «виду» существа). */
function animalDiff(a) {
  const s = `${a.name} ${a.system.kind ?? ""}`.toLowerCase();
  if (/волк|кош|кот|рыс|лев|тигр|пантер|летуч|медвед|лис|пёс|пес|собак|wolf|cat|bat|bear|dog|fox/.test(s)) return 6;
  if (/голуб|ворон|воробь|птиц|змея|змей|ящер|черепах|pigeon|crow|raven|bird|snake|lizard|reptil/.test(s)) return 8;
  return 7;
}

// пути Тауматургии (data/path-powers.mjs) — тем же движком
Object.assign(TARGET_POWERS, PATH_POWERS);

/** Тот же персонаж: лист (Actor.id) и жетон без связи (Scene.….Token.….Actor.id) — один и тот же вампир. */
const sameActor = (uuid, actor) => !!uuid && !!actor && (uuid === actor.uuid || String(uuid).endsWith(`Actor.${actor.id}`));

/** Сверхъестественное существо (Глаза змеи): вампир, Гару, падший, сверхъестественная тварь; гуль и охотник — смертные. */
export const supernatural = a => ["vampire", "werewolf", "demon"].includes(a.type) || (a.type === "creature" && !!a.system.supernatural);

export const targetPowerOf = (disc, p) => TARGET_POWERS[`${disc}|${p?.en ?? ""}`] ?? null;

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

/** Срок по числу успехов. */
export function untilOf(code, now, { MS_HOUR, MS_DAY, nextSunrise }) {
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
    case "10years": return now + 3650 * MS_DAY;
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
  if (!tp || ev.outcome !== "success" || extra.targetPower.done || !(tp.timed || tp.dread || tp.kind) || [...BLOOD_SELF, "taste", "gather", "aura", "visage", "whisper", "info", "tiers", "counter", "chaos", "tele", "psycho", "illusion", "absorb", "humanitas", "pillar", "vitality", "caine", "flow", "sin"].includes(tp.kind)) return "";
  // Усмирение — только когда накоплены все успехи продолжительного броска
  if (tp.kind === "quell" && !((extra.extended?.prev ?? 0) + ev.successes >= (extra.extended?.need ?? Infinity))) return "";
  const lbl = { beast: "BeastApply", poison: "PoisonApply", shroud: "ShroudApply", arms: "ArmsApply", vanish: "VanishApply",
    rage: "RageApply", potency: "PotencyApply", theft: "TheftApply", possess: "PossessApply", project: "ProjectApply", awe: "AweApply", call: "CallApply",
    mesmerize: "MesApply", forget: "ForgApply", condition: "CondApply", voice: "VoiceApply",
    flesh: "FleshApply", bone: "BoneApply", dagon: "DagonApply", nightmare: "NightApply", ward: "WardApply", riddle: "RiddleApply", paradox: "ParadoxApply", anest: "AnestApply", void: "VoidApply", conflag: "ConflagApply", condemn: "CondemnApply", beckon: "BeckonApply", spiritbeast: "SpiritBeastApply", subsume: "SubsumeApply", self: "SelfApply", summon: "SummonApply", comrades: "ComradesApply", conjure: "ConjureApply" }[tp.kind] ?? "Apply";
  return t(lbl, { name: extra.targetPower.targetName, n: ev.successes });
}

/** Кнопка на карточке: эффект силы на цели (владелец цели или рассказчик). */
export async function applyTargetPower(message, state, ev) {
  const x = state.extra?.targetPower, tp = x && TARGET_POWERS[x.key];
  if (!tp || x.done) return;
  const target = await foundry.utils.fromUuid(x.target);
  if (!target) return ui.notifications.warn(t("Gone"));
  if (tp.kind === "summon") {
    if (!game.user.isGM) return ui.notifications.warn(t("GMOnly"));
    await done(message, state, x);
    return summonPathCreature(target, tp.summon, ev.successes);
  }
  if (["shroud", "arms", "beckon"].includes(tp.kind) && tp.kind === "beckon") {
    if (!game.user.isGM) return ui.notifications.warn(t("GMOnly"));
    return beckon(message, state, x, target, ev.successes);
  }
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
  if (BLOOD_APPLY.has(tp.kind)) return bloodApply({ message, state, x, tp, target, n, flags, now, api });
  if (tp.kind === "beast") {
    // Отчуждение Зверя: бешенство вампира переходит на цель (V20, Анимализм 5)
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    if (self && !self.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: self.name }));
    if (self?.statuses?.has("r-frenzy")) await self.toggleStatusEffect("r-frenzy", { active: false });
    if (!target.statuses?.has("r-frenzy")) await target.toggleStatusEffect("r-frenzy", { active: true });
    if (self) await self.createEmbeddedDocuments("ActiveEffect", [{ name: t("BeastOutName", { name: target.name }), img: Codex.disciplineIcon("animalism"),
      description: `<p>${esc(t("BeastOutDesc"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, beastOut: target.uuid, mode: "scene" } } }]);
    desc = t(n >= 3 ? "Beast3" : n === 2 ? "Beast2" : "Beast1");
    await done(message, state, x);
    return notice(target, x.powerName, desc);
  }
  if (tp.kind === "conjure") return conjure(message, state, x, tp, target);
  if (["cond", "self", "dehydrate", "dust", "comrades"].includes(tp.kind)) return applyPath(message, state, x, tp, target, n, flags, api);
  if (tp.kind === "voice") {
    // Голос безумия: по слушателю за успех; смертные поддаются сразу (и не помнят), вампиры — проверка, сложность +2
    const crowd = (await Promise.all((x.crowd ?? []).map(u => foundry.utils.fromUuid(u)))).filter(Boolean).slice(0, n);
    await done(message, state, x);
    const hit = [];
    for (const who of crowd) {
      if (who.isVampire) { selfCheck(who, x.mode, 8, t("VoiceKindred", { name: who.name })); hit.push(`${who.name} (${t("VoiceResist")})`); continue; }
      if (!who.isOwner) { ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: who.name })); continue; }
      if (!who.statuses?.has(`r-${x.mode}`)) await who.toggleStatusEffect(`r-${x.mode}`, { active: true });
      hit.push(who.name);
    }
    return notice(target, x.powerName, hit.length ? t("VoiceDone", { names: hit.join(", ") }) : t("AweNobody", { n }));
  }
  if (tp.kind === "mesmerize" || tp.kind === "forget") {
    // Внушение: одна программа в разуме — новая заменяет старую при большем или равном числе успехов
    const text = await foundry.applications.api.DialogV2.prompt({ window: { title: x.powerName }, classes: ["vtm20", "r-dialog"], rejectClose: false,
      content: `<div class="r-form"><label class="r-field"><span>${esc(t(tp.kind === "mesmerize" ? "MesWhat" : "ForgWhat"))}</span><textarea name="t" rows="3"></textarea></label></div>`,
      ok: { label: t("SelfApply"), callback: (e, b) => b.form.elements.t.value.trim() } });
    if (text == null) return;
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    if (tp.kind === "mesmerize") {
      const old = target.effects.find(e => e.flags?.[SYSTEM_ID]?.program);
      if (old && Number(old.flags[SYSTEM_ID].program) > n) { await done(message, state, x); return notice(target, x.powerName, t("MesKept", { n: old.flags[SYSTEM_ID].program })); }
      if (old) await old.delete();
    }
    await done(message, state, x);
    const desc = tp.kind === "mesmerize" ? `${tierText(tp, n)} ${text}`.trim()
      : `${tierText(tp, n)} ${text} ${t("ForgRestore", { d: self?.discipline?.("dominate") ?? "?", w: self?.system.willpower?.permanent ?? "?", n })}`.trim();
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t(tp.kind === "mesmerize" ? "MesName" : "ForgName", { name: x.actorName, n }), img: Codex.disciplineIcon("dominate"),
      description: `<p>${esc(desc)}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "manual", ...(tp.kind === "mesmerize" ? { program: n } : { memory: n }) } } }]);
    return notice(target, x.powerName, desc);
  }
  if (tp.kind === "condition") {
    // Порабощение: успехи копятся по сцене; сколько нужно — тайно решает рассказчик (5–10 × Самоконтроль цели)
    if (!game.user.isGM) return ui.notifications.warn(t("GMOnly"));
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    const prog = target.getFlag(SYSTEM_ID, "conditioning");
    const mine = prog && sameActor(prog.by, self);
    let need = mine ? prog.need : null;
    if (!need) {
      const sc = target.system.virtues?.selfControl?.value ?? 3;
      const k = await ask(x.powerName, [5, 6, 7, 8, 9, 10].map(m => [String(m), t("CondNeed", { m, n: m * sc })]));
      if (!k) return;
      need = Number(k) * sc;
    }
    const total = (mine ? prog.total : 0) + n;
    await done(message, state, x);
    if (total < need) {
      await target.setFlag(SYSTEM_ID, "conditioning", { by: self?.uuid ?? state.actorUuid, total, need });
      return ChatMessage.create({ whisper: game.users.filter(u => u.isGM).map(u => u.id), content: `<div class="r-notice"><i class="fa-solid fa-link"></i> ${esc(t("CondProgress", { name: target.name, total, need }))}</div>` });
    }
    await target.unsetFlag(SYSTEM_ID, "conditioning");
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("CondName", { name: x.actorName }), img: Codex.disciplineIcon("dominate"),
      description: `<p>${esc(t("CondDesc", { w: target.system.willpower?.permanent ?? 0 }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, conditioned: self?.uuid ?? state.actorUuid, mode: "manual" } } }]);
    return notice(target, x.powerName, t("CondDone"));
  }
  if (tp.kind === "awe") {
    // Благоговение: охват — 1 / 2 / 6 / 20 / все; поддаются те, у кого Воля ниже
    const reach = n >= 5 ? Infinity : [0, 1, 2, 6, 20][n];
    const crowd = (await Promise.all((x.crowd ?? []).map(u => foundry.utils.fromUuid(u)))).filter(Boolean)
      .sort((p1, p2) => (p1.system.willpower?.permanent ?? 0) - (p2.system.willpower?.permanent ?? 0)).slice(0, reach);
    await done(message, state, x);
    const hit = [];
    for (const who of crowd) {
      if (!who.isOwner) { ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: who.name })); continue; }
      await who.createEmbeddedDocuments("ActiveEffect", [{ name: t("AweName", { name: x.actorName }), img: Codex.disciplineIcon("presence"),
        description: `<p>${esc(t("AweDesc", { n }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, awe: n, mode: "scene" } } }]);
      hit.push(who.name);
    }
    return notice(target, x.powerName, hit.length ? t("AweDone", { names: hit.join(", "), n: reach === Infinity ? "∞" : reach }) : t("AweNobody", { n: reach === Infinity ? "∞" : reach }));
  }
  if (tp.kind === "call") {
    // Приглашение: тянется к вампиру до рассвета; как — по успехам
    await done(message, state, x);
    const how = t(`Call${Math.min(5, n)}`);
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("CallName", { name: x.actorName }), img: Codex.disciplineIcon("presence"),
      description: `<p>${esc(how)}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "timed", until: api.nextSunrise(now) } } }]);
    return notice(target, x.powerName, how);
  }
  if (tp.kind === "possess") {
    // Вселение: цель бросает текущую Волю (сл. 7); успехи вампира сверх её — минус временная Воля цели
    const { rollPool } = await import("../dice/roll.mjs");
    const wp = target.system.willpower?.temporary ?? 0;
    const res = wp > 0 ? await rollPool({ actor: target, title: t("PossessResist"), pool: wp, difficulty: 7, kind: "check" }) : { successes: 0 };
    const net = Math.max(0, n - (res?.successes ?? 0)), left = Math.max(0, wp - net);
    await done(message, state, x);
    if (net) await target.update({ "system.willpower.temporary": left });
    if (left > 0) return notice(target, x.powerName, t("PossessStruggle", { n: net, left }));
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("PossessedName", { name: x.actorName }), img: Codex.disciplineIcon("dominate"),
      description: `<p>${esc(t("PossessedDesc"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "manual" } } }]);
    if (self?.isOwner) await self.createEmbeddedDocuments("ActiveEffect", [{ name: t("EmptyBody"), img: Codex.disciplineIcon("dominate"),
      description: `<p>${esc(t("EmptyBodyDesc"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "manual", host: target.uuid } } }]);
    // доступ к Дисциплинам через тело — Манипуляция + Запугивание (сл. 7), по успехам (та же таблица, что у Поглощения духа)
    if (self) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: self }), flags: { [SYSTEM_ID]: { possessRoll: { actorUuid: self.uuid, host: target.uuid, hostName: target.name } } },
      content: `<div class="r-notice"><i class="fa-solid fa-user-astronaut"></i> ${esc(t("PossessAccess", { name: target.name }))}
        <div class="r-card-buttons"><button type="button" data-r-action="possessRoll"><i class="fa-solid fa-dice-d10"></i> ${esc(t("PossessAccessRoll"))}</button></div></div>` });
    return notice(target, x.powerName, t("PossessDone"));
  }
  if (tp.kind === "project") {
    await done(message, state, x);
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("ProjectName"), img: Codex.disciplineIcon("auspex"),
      description: `<p>${esc(t("ProjectDesc"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "scene" } } }]);
    return notice(target, x.powerName, t("ProjectDesc"));
  }
  if (tp.kind === "flesh") {
    // Искусство тканей: Привлекательность ±1 за успех; Укрепление — +1 куб к поглощению за успех ценой 1 точки Силы
    await done(message, state, x);
    const ap = target.system.attributes.appearance?.value ?? 0, mode = x.flesh ?? "lower";
    if (mode === "armor") {
      // по книге каждый куб стоит точку Силы; без цены — решение рассказчика (галочка в окне силы)
      const k = x.fleshFree ? n : Math.min(n, (target.system.attributes.strength?.value ?? 1) - 1);
      if (k < 1) return notice(target, x.powerName, t("FleshNoStrength"));
      if (!x.fleshFree) await target.update({ "system.attributes.strength.value": target.system.attributes.strength.value - k });
      await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("FleshArmorName", { n: k }), img: Codex.disciplineIcon("vicissitude"),
        description: `<p>${esc(t("FleshArmorDesc", { n: k }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, soakDice: k, mode: "manual" } } }]);
      return notice(target, x.powerName, t("FleshArmorDesc", { n: k }));
    }
    const next = Math.clamp(ap + (mode === "raise" ? n : -n), 0, 5);
    await target.update({ "system.attributes.appearance.value": next });
    return notice(target, x.powerName, t("FleshLooks", { from: ap, to: next }));
  }
  if (tp.kind === "bone" && x.bone === "botch") {
    // провал шипов (по кнопке): смертный умирает, вампир уходит в торпор
    await done(message, state, x);
    if (target.isVampire) { if (!target.statuses?.has("r-torpor")) await target.toggleStatusEffect("r-torpor", { active: true }); }
    else await target.applyDamage(8, "lethal");
    return notice(target, x.powerName, t("BoneSpikesBotch"));
  }
  if (tp.kind === "bone" && x.bone === "custom") {
    // своя работа — отдельный эффект (работ сколько угодно): цена ранами, правки характеристик, прочность, шипы; оружие — предмет при эффекте
    await done(message, state, x);
    const { normBone, boneSummary } = await import("./bone-work.mjs");
    const c = normBone(x.custom), wounds = Math.max(0, c.cost.wounds - (c.cost.minus ? n : 0));
    if (wounds) await target.applyDamage(wounds, c.cost.type);
    // прочность ценой Силы (как Укрепление в Искусстве тканей): точка Силы за куб, не ниже 1
    let soak = c.soak;
    if (soak && c.soakStr) {
      const str = target.system.attributes.strength?.value ?? 1;
      soak = Math.min(soak, str - 1);
      if (soak > 0) await target.update({ "system.attributes.strength.value": str - soak });
    }
    const lines = [c.note, ...boneSummary({ ...c, cost: { ...c.cost, wounds }, soak, diff: c.diff }).slice(1)].filter(Boolean);
    const [eff] = await target.createEmbeddedDocuments("ActiveEffect", [{ name: `${x.powerName} · ${c.name}`, img: Codex.disciplineIcon("vicissitude"),
      description: lines.map(l => `<p>${esc(l)}</p>`).join(""),
      flags: { [SYSTEM_ID]: { ...flags, mode: "manual", boneWork: c.name, ...(Object.keys(c.attr).length ? { attrMod: c.attr } : {}),
        ...(soak > 0 ? { soakDice: soak } : {}), ...(c.spikes ? { spikes: true } : {}), ...(c.grapple ? { grappleDice: c.grapple } : {}) } } }]);
    if (c.weapon && eff) await target.createEmbeddedDocuments("Item", [{ name: c.name, type: "weapon", img: `systems/${SYSTEM_ID}/assets/icons/weapon.svg`,
      system: { ...c.weapon, equipped: true }, flags: { [SYSTEM_ID]: { boneWork: eff.id } } }]);
    return notice(target, x.powerName, `${c.name}: ${lines.join(" · ")}`);
  }
  if (tp.kind === "bone") {
    // Когти — цена 1 тяжёлое; шипы — 5 тяжёлых минус 1 за каждый успех. Прежние когти или шипы уходят.
    await done(message, state, x);
    const old = target.powerEffects.find(e => e.power === "vicissitude:3");
    if (old) await target.endPower(old.effect, { quiet: true });
    const cost = x.bone === "claws" ? 1 : Math.max(0, 5 - n);
    if (cost) await target.applyDamage(cost, "lethal");
    await target.startPower("vicissitude:3", { variant: x.bone, blood: 0 });
    return notice(target, x.powerName, t(x.bone === "claws" ? "BoneClawsDone" : "BoneSpikesDone", { n: cost }));
  }
  if (tp.kind === "anest") {
    // боль: столько ходов без штрафов за раны, сколько успехов; против воли и сон — цель сопротивляется Волей (сл. 8)
    await done(message, state, x);
    let net = n;
    if (x.anest !== "pain") {
      const { rollPool } = await import("../dice/roll.mjs");
      const res = await rollPool({ actor: target, title: t("AnestResist"), pool: target.system.willpower?.permanent ?? 0, difficulty: 8, kind: "check", noBotch: true });
      net = n - (res?.successes ?? 0);
      if (net <= 0) return notice(target, x.powerName, t("AnestResisted"));
    }
    if (x.anest === "sleep") {
      await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("SleepName"), img: Codex.disciplineIcon(disc), statuses: ["r-held"],
        description: `<p>${esc(t("SleepDesc"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "timed", until: now + 8 * api.MS_HOUR } } }]);
      return notice(target, x.powerName, t("SleepDesc"));
    }
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("PainName", { n: net }), img: Codex.disciplineIcon(disc),
      description: `<p>${esc(t("PainDesc"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "scene", painless: net } } }]);
    return notice(target, x.powerName, t("PainName", { n: net }));
  }
  if (tp.kind === "void") {
    // Сородич сопротивляется Смелостью (сл. — Воля баали): больше успехов — не действует
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    await done(message, state, x);
    if (target.isVampire) {
      const { rollPool } = await import("../dice/roll.mjs");
      const res = await rollPool({ actor: target, title: t("VoidResist"), pool: target.system.virtues?.courage?.value ?? 0,
        difficulty: Math.clamp(self?.system.willpower?.temporary ?? 6, 2, 10), kind: "check", noBotch: true });
      if ((res?.successes ?? 0) > n) return notice(target, x.powerName, t("VoidResisted"));
    }
    const tier = Math.min(3, n);
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t(`VoidName.${tier}`), img: Codex.disciplineIcon("daimoinon"),
      ...(tier >= 2 ? { statuses: [tier === 2 ? "r-rotschreck" : "r-held"] } : {}), description: `<p>${esc(t(`VoidDesc.${tier}`))}</p>`,
      flags: { [SYSTEM_ID]: { ...flags, mode: "scene" } } }]);
    return notice(target, x.powerName, t(`VoidDesc.${tier}`));
  }
  if (tp.kind === "conflag") {
    // чёрное пламя: губительные по крови, как огонь (Ротшрек — как от огня того же размера); цель может уклониться
    await done(message, state, x);
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    const { postFixedDamage } = await import("../data/combat-powers.mjs");
    return postFixedDamage(self, target, { amount: x.conflag ?? 1, type: "aggravated", soakDiff: 6, fire: true, title: x.powerName });
  }
  if (tp.kind === "psychomachia") {
    // жертва: низшая Добродетель, сл. 6; неудача — кошмарный противник, провал — поддаётся страху
    const v = target.system.virtues ?? {};
    const low = Object.entries(v).filter(([, x]) => Number.isFinite(x?.value)).sort((a, b) => a[1].value - b[1].value)[0];
    const { rollPool } = await import("../dice/roll.mjs");
    const res = await rollPool({ actor: target, title: t("PsychoVirtue", { v: low ? game.i18n.localize(`VTM20.Virtue.${low[0]}`) : "—" }), pool: low?.[1].value ?? 1, difficulty: 6, kind: "check" });
    await done(message, state, x);
    const out = res?.outcome === "botch" ? "botch" : (res?.successes ?? 0) > 0 ? "ok" : "fail";
    if (out === "ok") return notice(target, x.powerName, t("PsychoOk"));
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("PsychoFoe"), img: Codex.disciplineIcon("daimoinon"),
      description: `<p>${esc(t(out === "botch" ? "PsychoBotch" : "PsychoFail"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "scene" } } }]);
    return notice(target, x.powerName, t(out === "botch" ? "PsychoBotch" : "PsychoFail"));
  }
  if (tp.kind === "condemn") {
    // успехи — тяжесть (1–5) и срок (0 — ночь … 5 — навсегда)
    const sev = Number(await ask(x.powerName, Array.from({ length: Math.min(5, n) }, (_, i) => [String(i + 1),
      t("CondemnSplit", { s: t(`CondemnSev.${i + 1}`), d: t(`CondemnDur.${Math.min(5, n - i - 1)}`) })])));
    if (!sev) return;
    const dur = Math.min(5, n - sev), code = ["night", "week", "month", "year", "10years", "forever"][dur];
    const until = code === "forever" ? null : untilOf(code, now, api);
    await done(message, state, x);
    const extra = sev === 1 ? { diffTraits: [["abilities.subterfuge", 3]] } : sev === 2 ? { diffTraits: [["attributes.strength", 2]] } : sev === 5 ? { curseBotch: true } : {};
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("CondemnName", { s: t(`CondemnSev.${sev}`) }), img: Codex.disciplineIcon("daimoinon"),
      description: `<p>${esc(t(`CondemnDesc.${sev}`))} ${esc(t(`CondemnDur.${dur}`))}</p>`,
      flags: { [SYSTEM_ID]: { ...flags, ...extra, mode: until ? "timed" : "manual", ...(until ? { until } : {}) } } }]);
    return notice(target, x.powerName, `${t(`CondemnDesc.${sev}`)} ${t(`CondemnDur.${dur}`)}`);
  }
  if (tp.kind === "paradox") {
    // Парадокс: слушатели оцепеневают до конца сцены (атака — снимает); навсегда +1 к сложности вредить этому вампиру
    await done(message, state, x);
    for (const uuid of x.crowd ?? [x.target]) {
      const who = await foundry.utils.fromUuid(uuid);
      if (!who?.isOwner) continue;
      await who.createEmbeddedDocuments("ActiveEffect", [
        { name: t("ParadoxName", { name: x.actorName }), img: Codex.disciplineIcon("bardo"), statuses: ["r-held"], description: `<p>${esc(t("ParadoxDesc"))}</p>`,
          flags: { [SYSTEM_ID]: { ...flags, mode: "scene" } } },
        { name: t("ParadoxMark", { name: x.actorName }), img: Codex.disciplineIcon("bardo"), description: `<p>${esc(t("ParadoxMarkDesc", { name: x.actorName }))}</p>`,
          flags: { [SYSTEM_ID]: { mode: "manual", harmDiff: { by: state.actorUuid ?? "", n: 1 } } } }]);
    }
    return notice(target, x.powerName, t("ParadoxDone", { names: x.targetName }));
  }
  if (tp.kind === "riddle") {
    // Волшебная загадка: жертва замирает; нужно втрое больше успехов, чем у киасида; решает кнопкой на карточке
    await done(message, state, x);
    const need = 3 * n;
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("RiddleName", { name: x.actorName }), img: Codex.disciplineIcon("mytherceria"),
      description: `<p>${esc(t("RiddleDesc", { need }))}</p>`, statuses: ["r-held"], flags: { [SYSTEM_ID]: { ...flags, mode: "manual", riddle: { need, got: 0 } } } }]);
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }), flags: { [SYSTEM_ID]: { riddleRoll: { target: target.uuid } } },
      content: `<div class="r-notice"><i class="fa-solid fa-puzzle-piece"></i> <b>${esc(x.powerName)}</b> → ${esc(target.name)}: ${esc(t("RiddleDesc", { need }))}
        <div class="r-card-buttons"><button type="button" data-r-action="riddleRoll"><i class="fa-solid fa-dice-d10"></i> ${esc(t("RiddleRoll"))}</button></div></div>` });
  }
  if (tp.kind === "nightmare") {
    // Кошмар наяву: урон по разуму — без поглощения; не убивает (смертный теряет сознание, вампир — торпор)
    await done(message, state, x);
    const cap = x.night?.startsWith("cap") ? Number(x.night.slice(3)) : Infinity;
    const type = x.night === "bashing" ? "bashing" : "lethal";
    const h = target._source.system.health ?? {}, room = Math.max(0, 7 - (h.bashing ?? 0) - (h.lethal ?? 0) - (h.aggravated ?? 0));
    const amount = Math.min(n, cap, room);
    if (amount) await target.applyDamage(amount, type);
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("NightName", { n: amount }), img: Codex.disciplineIcon("chimerstry"),
      description: `<p>${esc(t("NightDesc", { n: amount }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "timed", until: now + api.MS_DAY, nightmare: amount, nightType: type } } }]);
    if (room <= amount && target.isVampire && !target.statuses?.has("r-torpor")) await target.toggleStatusEffect("r-torpor", { active: true });
    return notice(target, x.powerName, t(room <= amount ? (target.isVampire ? "NightTorpor" : "NightFaint") : "NightDone", { n: amount }));
  }
  if (tp.kind === "dagon") {
    // сопротивление цели: Выносливость, сложность — текущая Воля ассамита; лишние успехи — тяжёлые изнутри (броня не помогает)
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    const sw = self?.system.willpower?.temporary ?? self?.system.willpower?.permanent ?? 6;
    const { rollPool } = await import("../dice/roll.mjs");
    const pool = target.system.attributes?.stamina?.total ?? 0;
    const res = pool > 0 ? await rollPool({ actor: target, title: t("DagonResist"), pool, difficulty: Math.clamp(sw, 2, 10), kind: "check", noBotch: true }) : { successes: 0 };
    const net = n - (res?.successes ?? 0);
    await done(message, state, x);
    if (net <= 0) return notice(target, x.powerName, t("DagonResisted"));
    const { postFixedDamage } = await import("../data/combat-powers.mjs");
    return postFixedDamage(self, target, { amount: net, type: "lethal", soakDiff: 6, title: x.powerName, internal: true });
  }
  if (tp.kind === "subsume") {
    // Поглощение духа: тело вампира пустует, в звере — его дух; Дисциплины — по успехам
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    if (!self?.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: self?.name ?? "" }));
    await done(message, state, x);
    const tier = Math.min(5, n), list = SUBSUME[tier].map(k => Codex.disciplineLabel(k)).join(", ") || t("SubsumeNone");
    await self.createEmbeddedDocuments("ActiveEffect", [{ name: t("SubsumeName", { name: target.name }), img: Codex.disciplineIcon("animalism"),
      description: `<p>${esc(t("SubsumeDesc", { list }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, subsume: tier, host: target.uuid, mode: "manual" } } }]);
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("PossessedName", { name: x.actorName }), img: Codex.disciplineIcon("animalism"),
      flags: { [SYSTEM_ID]: { ...flags, subsumedBy: self.uuid, mode: "manual" } } }]);
    return notice(target, x.powerName, t("SubsumeDesc", { list }));
  }
  if (tp.kind === "rage") {
    // Неистовство крови: каждый успех — жертва тратит 1 кровь (лимит за ход не действует), +1 к сложности ярости за каждую
    const k = Math.min(n, target.system.blood?.value ?? 0);
    await done(message, state, x);
    if (!k) return notice(target, x.powerName, t("RageEmpty"));
    await target.update({ "system.blood.value": target.system.blood.value - k });
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("RageName", { n: k }), img: Codex.disciplineIcon("thaumaturgy"),
      description: `<p>${esc(t("RageDesc", { n: k }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, frenzyDiff: k, mode: "scene" } } }]);
    return notice(target, x.powerName, t("RageDesc", { n: k }));
  }
  if (tp.kind === "theft") {
    // Хищение крови: каждый успех — 1 кровь от цели тауматургу; узы так не возникают
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    if (!self?.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: self?.name ?? "" }));
    const room = Math.max(0, (self.system.blood?.max ?? 0) - (self.system.blood?.value ?? 0));
    const k = Math.min(n, target.system.blood?.value ?? 0, room);
    await done(message, state, x);
    if (k) {
      await target.update({ "system.blood.value": target.system.blood.value - k });
      await self.update({ "system.blood.value": self.system.blood.value + k });
    }
    return notice(target, x.powerName, t("TheftDone", { n: k, name: self.name }));
  }
  if (tp.kind === "potency") {
    // Могущество крови: успех — поколение ниже на 1 на час; каждый лишний — +1 час или ещё ступень (распределить сразу)
    const steps = n === 1 ? 1 : await foundry.applications.api.DialogV2.prompt({ window: { title: x.powerName, icon: "fa-solid fa-droplet" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
      content: `<div class="r-form"><p>${esc(t("PotencyAsk", { n }))}</p><label class="r-field"><span>${esc(t("PotencySteps"))}</span><select name="s">${Array.from({ length: n }, (_, i) =>
        `<option value="${i + 1}">${esc(t("PotencyOpt", { s: i + 1, h: n - i }))}</option>`).join("")}</select></label></div>`,
      ok: { label: t("PotencyApply"), callback: (e, b) => Number(b.form.elements.s.value) || 1 } });
    if (!steps) return;
    const hours = 1 + n - steps;
    await done(message, state, x);
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("PotencyName", { s: steps }), img: Codex.disciplineIcon("thaumaturgy"),
      description: `<p>${esc(t("PotencyDesc", { s: steps, h: hours }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, genDrop: steps, mode: "timed", until: now + hours * api.MS_HOUR } } }]);
    await target.setFlag(SYSTEM_ID, "potencyNight", api.nextSunrise(now));
    return notice(target, x.powerName, t("PotencyDesc", { s: steps, h: hours }));
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
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    Object.assign(flags, { mode: "manual" });
    name = t("QuellName", { name: x.actorName });
    desc = t("QuellDesc", { n: self?.system.willpower?.permanent ?? "?" });
  } else if (tp.kind === "ward") {
    // Печать фей: −2 куба к проверкам Интеллекта, срок по успехам
    const code = tp.timed[Math.min(n, tp.timed.length) - 1];
    const until = untilOf(code, now, api);
    Object.assign(flags, { attrMod: { intelligence: -2 }, mode: until ? "timed" : "scene", ...(until ? { until } : {}) });
    name = t("WardName", { name: x.actorName });
    desc = t("WardDesc", { dur: t(`Dur.${code}`) });
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
  if (tp.kind === "poison" && (target.system.attributes?.stamina?.total ?? 1) <= 0) {
    if (target.isVampire) { if (!target.statuses?.has("r-torpor")) await target.toggleStatusEffect("r-torpor", { active: true }); }
    await notice(target, x.powerName, t(target.isVampire ? "PoisonZeroVampire" : "PoisonZeroMortal"));
  }
  return notice(target, x.powerName, desc);
}

/** Кнопка отработала: на карточке броска — пометка, на карточке «наложить» — убрать кнопку. */
export async function done(message, state, x) {
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

export const notice = (target, power, what) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }),
  content: `<div class="r-notice"><i class="fa-solid fa-brain"></i> ${t("Applied", { name: esc(target.name), power: esc(power), what: esc(what) })}</div>` });

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
      const c = await (await import("./bone-work.mjs")).boneWorkDialog(p.name, who, { preset });
      if (!c) return null;
      if (c.deleteTemplate) {
        await actor.setFlag(SYSTEM_ID, "boneTemplates", tpls.filter(x => x.name !== c.deleteTemplate));
        ui.notifications.info(t("BoneTplDeleted", { name: c.deleteTemplate }));
        return null;
      }
      if (c.save) {
        const { save, ...keep } = c;
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
async function presImmune(target, vampire, power, botch, powerName, disc = "presence") {
  const what = t(botch ? "PresImmuneStory" : "PresImmuneNight", { name: target.name, power: power === "all" ? t(disc === "dominate" ? "AllDominate" : "AllPresence") : powerName });
  if (!target.isOwner) return notice(target, powerName, what);
  const api = await clockApi();
  await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("PresImmuneName", { name: vampire.name }), img: Codex.disciplineIcon("presence"),
    description: `<p>${esc(what)}</p>`, flags: { [SYSTEM_ID]: { mind: `${disc}|immune`, presImmune: { by: vampire.uuid, power, disc }, mode: botch ? "manual" : "timed",
      ...(botch ? {} : { until: api.nextSunrise(api.getClock()) }) } } }]);
  return notice(target, powerName, what);
}

/** Преклонение (Величие 5): кто нападает на вампира — сперва Смелость, сл. Обаяние + Запугивание вампира (макс. 10). false — атака отменена. */
export async function majestyCheck(attacker, foe) {
  if (!foe || attacker === foe || !foe.powerEffects?.some(e => e.power === "presence:5")) return true;
  if (attacker.effects.some(e => !e.disabled && sameActor(e.flags?.[SYSTEM_ID]?.majestyPassed, foe))) return true;
  const diff = Math.min(10, (foe.system.attributes.charisma?.total ?? 0) + (foe.system.abilities?.intimidation?.value ?? 0));
  const courage = attacker.system.virtues?.courage?.value;
  const pool = courage ?? attacker.system.willpower?.permanent ?? 1;
  const { rollPool } = await import("../dice/roll.mjs");
  const res = await rollPool({ actor: attacker, title: t("MajestyRoll", { name: foe.name }), pool, difficulty: Math.max(2, diff), kind: "check" });
  if ((res?.successes ?? 0) > 0) {
    if (attacker.isOwner) await attacker.createEmbeddedDocuments("ActiveEffect", [{ name: t("MajestyPassed", { name: foe.name }), img: Codex.disciplineIcon("presence"),
      flags: { [SYSTEM_ID]: { mind: "presence|majesty", majestyPassed: foe.uuid, mode: "scene" } } }]);
    notice(attacker, game.i18n.localize("VTM20.TP.MajestyTitle"), t("MajestyOk"));
    return true;
  }
  notice(attacker, game.i18n.localize("VTM20.TP.MajestyTitle"), t("MajestyFail", { name: foe.name }));
  return false;
}

/** Карточка «проверить ярость/Ротшрек» со своей сложностью (Голос безумия) — кнопкой броска для владельца. */
export function selfCheck(actor, kind, difficulty, text) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    whisper: game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id),
    flags: { [SYSTEM_ID]: { checkPrompt: { kind, difficulty, actorUuid: actor.uuid } } },
    content: `<div class="r-notice r-check-prompt is-${kind}"><i class="fa-solid ${kind === "frenzy" ? "fa-face-angry" : "fa-fire"}"></i> <span>${esc(text)}</span>
      <div class="r-card-buttons"><button type="button" data-r-action="virtueCheck"><i class="fa-solid fa-dice-d10"></i> ${esc(game.i18n.localize("VTM20.CheckPrompt.Roll"))}</button></div></div>` });
}

/** Сумма черт персонажа: Атрибуты, Способности, Добродетели, Воля, Дисциплины. */
function poolOf(a, keys) {
  const s = a.system;
  return keys.reduce((sum, k) => sum + Number(
    k === "willpower" ? s.willpower?.permanent ?? 0
    : ["conscience", "selfControl", "courage"].includes(k) ? s.virtues?.[k]?.value ?? 0
    : s.attributes?.[k] ? s.attributes[k].total ?? s.attributes[k].value ?? 0
    : s.abilities?.[k] ? s.abilities[k].value ?? 0
    : a.discipline?.(k) ?? 0) || 0, 0);
}

/** Сопротивление цели (путь Тауматургии): бросок за цель, итог — сколько успехов тауматурга осталось. */
async function resistOf(spec, target, caster, n) {
  if (!spec) return { net: n, res: 0 };
  if (spec.needFortitude && !target.discipline?.("fortitude")) return { net: n, res: 0, note: t("NoFortitude") };
  const diff = typeof spec.diff === "number" ? spec.diff : spec.diff === "casterWP" ? (caster?.system.willpower?.temporary ?? 6)
    : spec.diff?.sum ? poolOf(caster, spec.diff.sum) : (spec.diff?.base ?? 6) + (spec.diff?.plus === "succ" ? n : 0);
  const pool = poolOf(target, spec.pool);
  const { rollPool } = await import("../dice/roll.mjs");
  const r = pool > 0 ? await rollPool({ actor: target, title: t("Resist"), pool, difficulty: Math.clamp(diff, 2, 10), kind: "check" }) : { successes: 0 };
  const res = Math.max(0, r?.successes ?? 0);
  if (spec.mode === "net") return { net: n - res, res };
  if (spec.mode === "beat") return { net: res > n ? 0 : n, res };
  return { net: n, res };                                 // shorten, atrophy, contradict — итог по таблице
}

/** Искушение: цель бросает Восприятие + Хитрость (сл. 2 + успехи) — что она поняла. */
async function contradict(caster, target, power, n) {
  const { res } = await resistOf(TARGET_POWERS["thaumaturgy|Contradict"].resist, target, caster, n);
  const line = t(res >= 5 ? "Contra5" : res >= 4 ? "Contra4" : res >= 3 ? "Contra3" : res >= 2 ? "Contra2" : "Contra0");
  return notice(target, power, line);
}

/** Путь Тауматургии: эффект на цели или на себе по таблице data/path-powers.mjs. */
async function applyPath(message, state, x, tp, target, n, flags, api) {
  const caster = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
  const [disc] = x.key.split("|");
  // Боевой товарищ: младшую силу Пути Марса — на союзника
  if (tp.kind === "comrades") {
    const mars = (caster?.effects ?? []).filter(e => e.flags?.[SYSTEM_ID]?.mars);
    if (!mars.length) return ui.notifications.warn(t("ComradesNone"));
    const pick = mars.length === 1 ? mars[0].id : await foundry.applications.api.DialogV2.prompt({ window: { title: x.powerName }, classes: ["vtm20", "r-dialog"], rejectClose: false,
      content: `<div class="r-form"><select name="e">${mars.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></div>`,
      ok: { label: t("SelfApply"), callback: (e, b) => b.form.elements.e.value } });
    const src = caster.effects.get(pick);
    if (!src) return;
    await done(message, state, x);
    await target.createEmbeddedDocuments("ActiveEffect", [{ ...src.toObject(), _id: undefined, name: `${src.name} (${caster.name})` }]);
    return notice(target, x.powerName, src.name);
  }
  const r = await resistOf(tp.resist, target, caster, n);
  await done(message, state, x);
  // Превращение в прах: сопротивление — нужно больше успехов, чем у тауматурга
  if (tp.kind === "dust") {
    if (r.net <= 0) return notice(target, x.powerName, t("Resisted"));
    if (!target.isVampire) return notice(target, x.powerName, t("DustMortal", { y: 10 * n }));
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("DustName"), img: Codex.disciplineIcon(disc), description: `<p>${esc(t("DustVamp"))}</p>`,
      flags: { [SYSTEM_ID]: { ...flags, attrMod: { appearance: -1 }, mode: "timed", until: api.nextSunrise(api.nextSunrise(api.getClock()) + MS_H) } } }]);
    return notice(target, x.powerName, t("DustVamp"));
  }
  // Обезвоживание: каждый лишний успех — вампир теряет кровь, потом тяжёлые; смертный — тяжёлые без поглощения
  if (tp.kind === "dehydrate") {
    if (r.net <= 0) return notice(target, x.powerName, t("Resisted"));
    let left = r.net;
    if (target.hasBlood) {
      const b = Math.min(left, target.system.blood?.value ?? 0);
      if (b) await target.update({ "system.blood.value": target.system.blood.value - b });
      left -= b;
    }
    if (left) await target.applyDamage(left, "lethal");
    return notice(target, x.powerName, t("DehydrateDone", { n: r.net }));
  }
  if (r.net <= 0) return notice(target, x.powerName, t("Resisted"));
  const fx = { ...(tp.fx ?? {}) }, f = { ...flags, mind: x.key, ...(tp.mars ? { mars: true } : {}) };
  let name = x.powerName, desc = tp.fx?.note ? t(`PathNote.${tp.fx.note}`) : "";
  // Атрофия: таблица успехов сопротивления
  if (tp.resist?.mode === "atrophy") {
    if (r.res >= 3) return notice(target, x.powerName, t("Resisted"));
    desc = t(r.res === 2 ? "Atrophy2" : r.res === 1 ? "Atrophy1" : "Atrophy0");
  }
  if (tp.resist?.mode === "shorten" && r.res) desc = `${desc} ${t("Shorten", { n: r.res })}`.trim();
  if (r.note) desc = `${desc} ${r.note}`.trim();
  // что спросить: конечность (Судорога), Атрибут (Порча тела), распределение (Сила стихий)
  if (tp.ask === "limb") {
    const limb = await ask(x.powerName, [["leg", t("LimbLeg")], ["arm", t("LimbArm")], ["head", t("LimbHead")]]);
    if (!limb) return;
    if (limb === "leg") fx.diffDex = 2;
    if (limb === "head") fx.diffSocial = 2;
    desc = t(`Limb.${limb}`);
  }
  if (tp.ask === "attr") {
    const k = await ask(x.powerName, ["strength", "dexterity", "stamina", "appearance"].map(k => [k, game.i18n.localize(`VTM20.Attr.${k}`)]));
    if (!k) return;
    fx.attrSet = { [k]: 1 };
    desc = t("CorruptDesc", { what: game.i18n.localize(`VTM20.Attr.${k}`) });
  }
  if (tp.ask === "split") {
    const pts = await splitPoints(x.powerName, 3);
    if (!pts) return;
    fx.attr = pts;
    desc = t("SplitDesc", { s: pts.strength, d: pts.dexterity, st: pts.stamina, n: n });
  }
  if (fx.maladySucc) { const k = Math.min(3, n); fx.attr = { strength: -k, dexterity: -k, stamina: -k }; }
  if (fx.bloodToWater) {
    const k = Math.min(n, target.system.blood?.value ?? 0);
    if (k) await target.update({ "system.blood.value": target.system.blood.value - k });
    if (!target.hasBlood || !target.isVampire) return notice(target, x.powerName, t("WaterMortal"));
    fx.diceAll = Number(VTM20.healthLevels?.[k - 1]?.penalty ?? -Math.min(k, 5));
    desc = t("WaterVamp", { n: k });
  }
  if (fx.sleep) {
    if (n < 3) { Object.assign(f, { dread: n, mode: "scene" }); name = t("SleepyName", { n }); desc = t("SleepyDesc", { n }); }
    else { desc = t("SleepDesc"); }
  }
  // флаги эффекта
  for (const k of ["diceAll", "diceSocial", "diffPhys", "diffAll", "diffSocial", "diffDex", "centered", "windDance", "brawlAgg", "strikeTrue", "clarity"]) if (fx[k] != null) f[k] = fx[k];
  if (fx.attr) f.attrMod = fx.attr;
  if (fx.attrSet) f.attrSet = fx.attrSet;
  if (fx.dot) f.dot = fx.dot;
  // срок
  const code = Array.isArray(tp.dur) ? tp.dur[Math.min(r.net, tp.dur.length) - 1] : tp.dur;
  const now = api.getClock(), nights = k => { let u = now; for (let i = 0; i < k; i++) u = api.nextSunrise(u + MS_H); return u; };
  const until = code === "succNights" ? nights(r.net) : code === "casterWPNights" ? nights(caster?.system.willpower?.permanent ?? 1)
    : code === "succHours" ? now + r.net * api.MS_HOUR : code === "3nights" ? nights(3) : code === "season" ? now + 90 * api.MS_DAY
    : ["scene", "manual"].includes(code) ? null : untilOf(code, now, api);
  if (!f.mode) f.mode = until ? "timed" : code === "manual" ? "manual" : "scene";
  if (until) f.until = until;
  const durText = until ? t("DurUntil", { at: new Date(until).toLocaleDateString(game.i18n.lang, { day: "numeric", month: "long" }) }) : t(`Dur.${code === "manual" ? "forever" : "scene"}`);
  await target.createEmbeddedDocuments("ActiveEffect", [{ name, img: Codex.disciplineIcon(disc), description: `<p>${esc(desc)}</p>`,
    ...(fx.statuses ? { statuses: fx.statuses } : {}), flags: { [SYSTEM_ID]: f } }]);
  // Марионетка: и самому тауматургу +2 к сложности своих действий
  if (tp.casterFx && caster?.isOwner) await caster.createEmbeddedDocuments("ActiveEffect", [{ name: t("CasterBusy", { power: x.powerName }), img: Codex.disciplineIcon(disc),
    flags: { [SYSTEM_ID]: { mind: x.key, mode: "scene", ...tp.casterFx } } }]);
  return notice(target, x.powerName, `${desc ? `${desc} — ` : ""}${durText}`);
}
const MS_H = 3600000;

/** Путь Воплощения: предмет в инвентаре тауматурга; Постоянство — закрепить уже созданный. */
async function conjure(message, state, x, tp, caster) {
  if (tp.conjure === "fix") {
    const list = caster.items.filter(i => i.getFlag(SYSTEM_ID, "conjured") === "scene");
    if (!list.length) return ui.notifications.warn(t("ConjureNone"));
    const id = list.length === 1 ? list[0].id : await ask(x.powerName, list.map(i => [i.id, i.name]));
    const item = caster.items.get(id);
    if (!item) return;
    await done(message, state, x);
    await item.setFlag(SYSTEM_ID, "conjured", "forever");
    return notice(caster, x.powerName, t("ConjureFixed", { name: item.name }));
  }
  const name = await foundry.applications.api.DialogV2.prompt({ window: { title: x.powerName, icon: "fa-solid fa-wand-magic-sparkles" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("ConjureWhat"))}</span><input type="text" name="n" autofocus placeholder="${esc(t("ConjureHint"))}"></label></div>`,
    ok: { label: t("ConjureApply"), callback: (e, b) => b.form.elements.n.value.trim() } });
  if (!name) return;
  await done(message, state, x);
  await caster.createEmbeddedDocuments("Item", [{ name, type: "gear", flags: { [SYSTEM_ID]: { conjured: tp.conjure } } }]);
  return notice(caster, x.powerName, t(tp.conjure === "scene" ? "ConjureScene" : "ConjureForever", { name }));
}

/** Обжигающее касание: без броска — кровь (не меньше 1), каждая — −2 куба ко всем пулам цели, пока держится касание. */
async function burningTouch(actor, p, target) {
  const max = Math.min(actor.system.blood?.value ?? 0, Math.max(1, (actor.system.blood?.perTurn ?? 1) - (actor.bloodSpentThisTurn ?? 0)));
  if (max < 1) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoBlood", { name: actor.name }));
  const n = Number(await ask(p.name, Array.from({ length: max }, (_, i) => [String(i + 1), t("BurnPick", { n: i + 1, d: 2 * (i + 1) })])));
  if (!n || !(await actor.spendBlood(n, { reason: p.name }))) return null;
  if (!target.isOwner) return notice(target, p.name, t("BurnDesc", { d: 2 * n }));
  await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("BurnName", { d: 2 * n }), img: Codex.disciplineIcon("valeren"),
    description: `<p>${esc(t("BurnDesc", { d: 2 * n }))}</p>`, flags: { [SYSTEM_ID]: { mind: "valeren|Burning Touch", by: actor.uuid, mode: "manual", diceAll: -2 * n } } }]);
  return notice(target, p.name, t("BurnDesc", { d: 2 * n }));
}

/** Обезболивающее касание: боль не мешает (штрафы ран не считаются). */
export const painless = actor => [...(actor?.effects ?? [])].some(e => !e.disabled && e.flags?.[SYSTEM_ID]?.painless);

/** Фантасмагория 1–4: иллюзия на листе вампира (Морок, Фата‑моргана) или шаг к выбранной иллюзии (Анимация, Постоянство). */
async function illusion(actor, p, tp) {
  const mine = actor.effects.filter(e => e.flags?.[SYSTEM_ID]?.illusion);
  if (tp.step) {
    const can = mine.filter(e => !e.flags[SYSTEM_ID][tp.step]);
    if (!can.length) return ui.notifications.warn(t("IllNone"));
    const id = await ask(p.name, can.map(e => [e.id, e.name]));
    if (!id) return null;
    if (!(await actor.spendBlood(1, { reason: p.name }))) return null;
    const e = actor.effects.get(id);
    await e.update({ name: `${e.name} · ${t(tp.step === "animate" ? "IllAnimated" : "IllPermanent")}`, [`flags.${SYSTEM_ID}.${tp.step}`]: true,
      description: `${e.description ?? ""}<p>${esc(t(tp.step === "animate" ? "IllAnimateDesc" : "IllPermDesc"))}</p>` });
    return notice(actor, p.name, t(tp.step === "animate" ? "IllAnimateDesc" : "IllPermDesc"));
  }
  const what = await foundry.applications.api.DialogV2.prompt({ window: { title: p.name, icon: "fa-solid fa-wand-magic-sparkles" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("IllWhat"))}</span><input type="text" name="w" autofocus placeholder="${esc(t(tp.all ? "IllHintAll" : "IllHintOne"))}"></label></div>`,
    ok: { label: t("IllGo"), callback: (e, b) => b.form.elements.w.value.trim() } });
  if (!what) return null;
  // цена: Воля и кровь — сначала проверить, что хватит того и другого
  if ((actor.system.willpower?.temporary ?? 0) < (tp.will ?? 0)) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoWillpower", { name: actor.name }));
  if (tp.blood && (actor.system.blood?.value ?? 0) < tp.blood) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoBlood", { name: actor.name }));
  if (tp.will && !(await actor.spendWillpower(tp.will))) return null;
  if (tp.blood && !(await actor.spendBlood(tp.blood, { reason: p.name }))) return null;
  const vol = 0.5 * (actor.discipline?.("chimerstry") ?? 1);
  const desc = t(tp.all ? "IllAllDesc" : "IllOneDesc", { v: vol });
  await actor.createEmbeddedDocuments("ActiveEffect", [{ name: t("IllName", { what }), img: Codex.disciplineIcon("chimerstry"),
    description: `<p>${esc(desc)}</p>`, flags: { [SYSTEM_ID]: { illusion: true, mode: "manual", by: actor.uuid } } }]);
  return notice(actor, p.name, `${what}: ${desc}`);
}

/** Выбор из списка перед наложением. */
// Варианты — кнопками в столбик: один клик — выбор (раньше: раскрыть список, выбрать, нажать «Применить»)
export function ask(title, options) {
  let picked = null;
  return foundry.applications.api.DialogV2.wait({
    window: { title, icon: "fa-solid fa-list-check" }, classes: ["vtm20", "r-dialog", "r-ask"], position: { width: 400 },
    content: `<div class="r-ask-list">${options.map(([v, l]) => {
      // «Название (пояснение)» — пояснение второй строкой
      const m = String(l).match(/^(.*?)\s*\(([^)]*)\)\s*$/), main = m ? m[1] : l, sub = m ? m[2] : "";
      return `<button type="button" class="r-ask-opt" data-v="${esc(v)}"><i class="r-ask-mark"></i><span class="r-ask-txt"><b>${esc(main)}</b>${sub ? `<em>${esc(sub)}</em>` : ""}</span><i class="fa-solid fa-chevron-right r-ask-go"></i></button>`;
    }).join("")}</div>`,
    buttons: [{ action: "cancel", icon: "fa-solid fa-xmark", label: game.i18n.localize("VTM20.Gate.Cancel") }],
    render: (ev, dlg) => {
      for (const b of dlg.element.querySelectorAll(".r-ask-opt")) b.addEventListener("click", () => { picked = b.dataset.v; dlg.close(); });
      dlg.element.querySelector(".r-ask-opt")?.focus();
    },
    rejectClose: false
  }).then(() => picked);
}

/** Распределить точки по Физическим Атрибутам (Сила стихий: 3 временные точки). */
async function splitPoints(title, total) {
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<div class="r-form"><p>${esc(t("SplitAsk", { n: total }))}</p>${["strength", "dexterity", "stamina"].map((k, i) =>
      `<label class="r-field"><span>${esc(game.i18n.localize(`VTM20.Attr.${k}`))}</span><input type="number" name="${k}" value="${i === 0 ? total : 0}" min="0" max="${total}"></label>`).join("")}</div>`,
    ok: { label: t("SelfApply"), callback: (e, b) => Object.fromEntries(["strength", "dexterity", "stamina"].map(k => [k, Math.max(0, Number(b.form.elements[k].value) || 0)])) } });
  if (!res) return null;
  if (Object.values(res).reduce((s, v) => s + v, 0) !== total) { ui.notifications.warn(t("SplitBad", { n: total })); return null; }
  return res;
}

/** Существа путей: Танец лозы, Лесные великаны, Элементаль — статистами у жетона тауматурга. */
async function summonPathCreature(caster, what, n) {
  const s = caster.system, wp = s.willpower?.permanent ?? 1, th = caster.discipline("thaumaturgy"), brawl = s.abilities?.brawl?.value ?? 0;
  const spec = {
    vines: { name: t("VinesName"), attrs: { strength: Math.floor(wp / 2), dexterity: Math.floor(wp / 2), stamina: Math.floor(wp / 2) }, brawl: Math.max(0, brawl - 1), note: t("VinesDone", { n }) },
    giant: { name: t("GiantName"), attrs: { strength: th, dexterity: 2, stamina: th }, brawl, note: t("GiantDone", { n }) },
    elemental: { name: t("ElementalName"), attrs: Object.fromEntries(["strength", "dexterity", "stamina", "perception", "intelligence", "wits"].map(k => [k, 3])), brawl: 3, note: t("ElementalDone", { n: Math.max(0, n - 1) }) }
  }[what];
  const a = await Actor.create({ name: `${spec.name} (${caster.name})`, type: "creature", img: `systems/${SYSTEM_ID}/assets/icons/creature.svg`,
    flags: { [SYSTEM_ID]: { summoned: caster.uuid } },
    system: { kind: spec.name, supernatural: true, blood: { max: 0, value: 0 },
      attributes: Object.fromEntries(Object.entries(spec.attrs).map(([k, v]) => [k, { value: Math.clamp(v, 0, 10) }])), abilities: { brawl: { value: spec.brawl } } } });
  const tok = caster.getActiveTokens?.()[0];
  if (tok && canvas?.scene) await canvas.scene.createEmbeddedDocuments("Token", [await a.getTokenDocument({ x: tok.document.x + canvas.grid.size, y: tok.document.y - canvas.grid.size })]);
  return notice(caster, spec.name, spec.note);
}

/** Чтение ауры: по успехам — яркость, цвет, узоры (природа существа), смена эмоций, следы (правило системы). */
function auraLines(target, n) {
  const out = [t("Aura1")];
  if (n >= 2) out.push(t(target.statuses?.has("r-frenzy") ? "Aura2Frenzy" : "Aura2"));
  if (n >= 3) {
    const k = target.isVampire ? "vampire" : target.type === "ghoul" ? "ghoul" : target.type === "werewolf" ? "werewolf" : target.type === "demon" ? "demon"
      : target.type === "creature" ? (target.system.spirit?.on ? "spirit" : target.system.supernatural ? "creature" : "animal") : "mortal";
    out.push(t(`AuraKind.${k}`));
  }
  if (n >= 4) out.push(t("Aura4"));
  if (n >= 5) {
    const list = target.getFlag(SYSTEM_ID, "diablerie") ?? [];
    out.push(t(list.length ? "AuraDiab" : "AuraClean"));
  }
  return out;
}

/** Зов: рассказчик выбирает зверя из справочника и сколько их услышало; приходит доля по успехам. */
async function beckon(message, state, x, vampire, n) {
  const { animalTemplates, spawnFromTemplate } = await import("./npc-gen.mjs");
  const list = await animalTemplates();
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: x.powerName, icon: "fa-solid fa-paw" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("BeckonWho"))}</span><select name="k">${list.map(a => `<option value="${esc(a.key)}">${esc(a.name)}</option>`).join("")}</select></label>
      <label class="r-field"><span>${esc(t("BeckonHeard"))}</span><input type="number" name="heard" value="8" min="1" max="40"></label></div>`,
    ok: { label: t("BeckonGo"), callback: (e, b) => ({ k: b.form.elements.k.value, heard: Number(b.form.elements.heard.value) || 1 }) } });
  if (!res) return;
  const tpl = list.find(a => a.key === res.k);
  const count = n <= 1 ? 1 : n >= 5 ? res.heard : Math.max(1, Math.ceil(res.heard * [0, 0, 0.25, 0.5, 0.75][n]));
  await done(message, state, x);
  const tok = vampire.getActiveTokens?.()[0];
  const made = [];
  for (let i = 0; i < count; i++) made.push(await spawnFromTemplate(tpl, { name: `${tpl.name} ${i + 1}` }));
  if (tok && canvas?.scene) await canvas.scene.createEmbeddedDocuments("Token", await Promise.all(made.filter(Boolean).map((a, i) =>
    a.getTokenDocument({ x: tok.document.x + ((i % 5) - 2) * canvas.grid.size, y: tok.document.y + (2 + Math.floor(i / 5)) * canvas.grid.size }))));
  return notice(vampire, x.powerName, t("BeckonDone", { n: count, name: tpl.name }));
}

/** Вкус крови: чем больше успехов, тем больше сведений (правило системы: кровь → природа → поколение → диаблери). */
function tasteLines(target, n) {
  const s = target.system, out = [t("TasteBlood", { v: s.blood?.value ?? 0, max: s.blood?.max ?? 0 })];
  const kindKey = target.isVampire ? "vampire" : target.type === "ghoul" ? (target.isDhampir ? "dhampir" : "ghoul") : target.type === "werewolf" ? "werewolf"
    : target.type === "demon" ? "demon" : "mortal";
  if (n >= 2) out.push(t(`TasteKind.${kindKey}`));
  if (n >= 3 && target.isVampire) out.push(t("TasteGen", { g: s.generation }));
  if (n >= 4 && target.isVampire) out.push(t((target.getFlag(SYSTEM_ID, "diablerie") ?? []).length ? "TasteDiab" : "TasteNoDiab"));
  return out;
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
  await dismissArms(game.actors.filter(a => a.getFlag(SYSTEM_ID, "abyssArm") || a.getFlag(SYSTEM_ID, "summoned")));
}
async function dismissArms(arms) {
  for (const a of arms) {
    for (const s of game.scenes) { const ids = s.tokens.filter(tk => tk.actorId === a.id).map(tk => tk.id); if (ids.length) await s.deleteEmbeddedDocuments("Token", ids); }
    await a.delete();
  }
}

/** Вселение: проверка доступа к Дисциплинам через тело носителя. */
export async function possessAccess(message) {
  const p = message.getFlag(SYSTEM_ID, "possessRoll");
  const self = p && await foundry.utils.fromUuid(p.actorUuid);
  if (!self?.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: self?.name ?? "" }));
  const { RollDialog } = await import("../dice/dialog.mjs");
  return RollDialog.prompt(self, { title: t("PossessAccessRoll"), subtitle: p.hostName, trait1: "attributes.manipulation", trait2: "abilities.intimidation", difficulty: 7,
    onRolled: async res => {
      const tier = Math.min(5, res?.successes ?? 0);
      const fx = self.effects.find(e => e.flags?.[SYSTEM_ID]?.mind === "dominate|Possession" && e.flags[SYSTEM_ID].host);
      if (fx) await fx.update({ [`flags.${SYSTEM_ID}.subsume`]: tier, description: `<p>${esc(t("SubsumeDesc", { list: SUBSUME[tier].map(k => Codex.disciplineLabel(k)).join(", ") || t("SubsumeNone") }))}</p>` });
      notice(self, t("PossessAccessRoll"), SUBSUME[tier].map(k => Codex.disciplineLabel(k)).join(", ") || t("SubsumeNone"));
    } });
}

/** Волшебная загадка: ежечасная проверка решения — Смекалка + Оккультизм (сл. 8, ± расстройства — в окне броска). */
export async function riddleRoll(message) {
  const x = message.getFlag(SYSTEM_ID, "riddleRoll");
  const victim = x && await foundry.utils.fromUuid(x.target);
  if (!victim) return ui.notifications.warn(t("Gone"));
  if (!victim.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: victim.name }));
  const fx = victim.effects.find(e => e.flags?.[SYSTEM_ID]?.riddle);
  if (!fx) return ui.notifications.info(t("RiddleGone"));
  const { RollDialog } = await import("../dice/dialog.mjs");
  return RollDialog.prompt(victim, { title: t("RiddleRoll"), subtitle: fx.name, trait1: "attributes.wits", trait2: "abilities.occult", difficulty: 8,
    diffNote: t("RiddleRollNote"),
    onRolled: async res => {
      const cur = victim.effects.get(fx.id); if (!cur) return;
      const r = cur.flags[SYSTEM_ID].riddle;
      if (res?.outcome === "botch") {
        await victim.applyDamage(1, "lethal");
        await cur.update({ [`flags.${SYSTEM_ID}.riddle.got`]: 0 });
        return notice(victim, t("RiddleRoll"), t("RiddleBotch"));
      }
      const got = r.got + (res?.successes ?? 0);
      if (got >= r.need) { await cur.delete(); return notice(victim, t("RiddleRoll"), t("RiddleSolved")); }
      await cur.update({ [`flags.${SYSTEM_ID}.riddle.got`]: got });
      return notice(victim, t("RiddleRoll"), t("RiddleProgress", { got, need: r.need }));
    } });
}

/** Кнопка карточки «наложить» без броска (Глаза змеи против смертного). */
export async function applyFromCard(message) {
  const x = message.getFlag(SYSTEM_ID, "targetApply");
  if (!x || x.done) return;
  return applyTargetPower(message, { actorUuid: x.actorUuid, extra: { targetPower: x } }, { successes: 1, outcome: "success" });
}

/** Сложность сопротивления ярости от Неистовства крови — для проверки бешенства. */
export function frenzyDiff(actor, kind) {
  // Алые узоры (Огам 2): легче устоять перед Ротшреком — флаг rotDiff
  if (kind === "rotschreck") return [...(actor?.effects ?? [])].filter(e => !e.disabled && e.flags?.[SYSTEM_ID]?.rotDiff)
    .map(e => ({ label: e.name, value: Number(e.flags[SYSTEM_ID].rotDiff) }));
  if (kind !== "frenzy") return [];
  const out = [...(actor?.effects ?? [])].filter(e => !e.disabled && e.flags?.[SYSTEM_ID]?.frenzyDiff)
    .map(e => ({ label: e.name, value: Number(e.flags[SYSTEM_ID].frenzyDiff) }));
  // Сердце тьмы (Серпентис 5): без сердца — −2 к сложности сопротивления ярости
  if (actor?.system?.fx?.heartless) out.push({ label: t("Heartless"), value: -2 });
  return out;
}

/** Укрепление тела (Искусство тканей): кубы к поглощению — для documents/actor.mjs. */
export function soakDice(actor) {
  return [...(actor?.effects ?? [])].reduce((s, e) => s + (!e.disabled && Number(e.flags?.[SYSTEM_ID]?.soakDice) || 0), 0);
}

/** Штраф к пулам от Устрашающего взора и проклятий путей (diceAll) — для окон бросков. Сосредоточение отменяет. */
export function dreadDice(actor, { social = false, physical = false } = {}) {
  // Кровное единство (Сангвинус 5): +1 куб к физическим броскам за каждого участника сверх первого
  const bonus = physical ? [...(actor?.effects ?? [])].filter(e => !e.disabled && e.flags?.[SYSTEM_ID]?.dicePhys)
    .map(e => ({ label: e.name, value: Number(e.flags[SYSTEM_ID].dicePhys) })) : [];
  if (centered(actor)) return bonus;
  const out = [...bonus];
  for (const e of actor?.effects ?? []) {
    const f = !e.disabled && e.flags?.[SYSTEM_ID];
    if (!f) continue;
    if (f.dread) out.push({ label: e.name, value: -Number(f.dread) });
    if (f.diceAll) out.push({ label: e.name, value: Number(f.diceAll) });
    if (social && f.diceSocial) out.push({ label: e.name, value: Number(f.diceSocial) });
  }
  return out;
}

/** Сосредоточение (Путь Сосредоточенного разума 2): пулы не уменьшаются. */
export const centered = actor => [...(actor?.effects ?? [])].some(e => !e.disabled && e.flags?.[SYSTEM_ID]?.centered);
/** Флаг эффекта путей у персонажа (Танец ветра, Разъедающее касание, Верный удар). */
export const pathFlag = (actor, k) => [...(actor?.effects ?? [])].some(e => !e.disabled && e.flags?.[SYSTEM_ID]?.[k]);

/** Сложность от эффектов путей: к физическим, ко всем, к социальным, к Ловкости. */
export function mindDiff(actor, { physical = false, social = false, dex = false, traits = [] } = {}) {
  const out = [];
  for (const e of actor?.effects ?? []) {
    const f = !e.disabled && e.flags?.[SYSTEM_ID];
    if (!f) continue;
    // diffTraits: [["abilities.subterfuge", 3]] — к броскам с этой чертой (Проклятие Демониона); списком — ключи с точкой флаги разворачивают
    const byTrait = (Array.isArray(f.diffTraits) ? f.diffTraits : []).reduce((s, [k, n]) => s + (traits.includes(k) ? Number(n) || 0 : 0), 0);
    const v = byTrait + Number(f.diffAll || 0) + (physical ? Number(f.diffPhys || 0) : 0) + (social ? Number(f.diffSocial || 0) : 0) + (dex ? Number(f.diffDex || 0) : 0);
    if (v) out.push({ label: e.name, value: v });
  }
  return out;
}

/** Снять с цели эффекты «до конца сцены» (Конец сцены). */
export async function endSceneMind(actor) {
  // Простое воплощение без Постоянства исчезает с концом сцены
  const conj = actor.items.filter(i => i.getFlag(SYSTEM_ID, "conjured") === "scene").map(i => i.id);
  if (conj.length) await actor.deleteEmbeddedDocuments("Item", conj);
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
    // Обезболивающее касание: ход прошёл — на один меньше
    for (const e of actor.effects.filter(e => e.flags?.[SYSTEM_ID]?.painless)) {
      const left = Number(e.flags[SYSTEM_ID].painless) - 1;
      if (left <= 0) await e.delete(); else await e.update({ name: t("PainName", { n: left }), [`flags.${SYSTEM_ID}.painless`]: left });
    }
    // Припадок, Отказ тела: уровень урона в конце каждого хода цели (броня не помогает)
    const { soakAndApply } = await import("../dice/roll.mjs");
    for (const e of actor.effects.filter(e => !e.disabled && e.flags?.[SYSTEM_ID]?.dot)) {
      const d = e.flags[SYSTEM_ID].dot;
      await soakAndApply(actor, 1, d.type, { soak: d.soak === true || (d.soak === "kindred" && actor.isVampire), armor: false });
    }
  });
  // Сердце тьмы: без сердца кол не парализует (V20, Серпентис 5)
  Hooks.on("preCreateActiveEffect", (effect, data, options, userId) => {
    const actor = effect.parent;
    if (actor?.documentName !== "Actor" || !actor.system?.fx?.heartless || !(effect.statuses ?? new Set()).has?.("r-staked")) return;
    if (userId === game.user.id) ui.notifications.info(t("HeartlessStake", { name: actor.name }));
    return false;
  });
  // Поглощение духа: вампир вышел (эффект снят) — зверь свободен
  Hooks.on("deleteActiveEffect", async effect => {
    const host = effect.flags?.[SYSTEM_ID]?.host;
    if (!host || !effect.flags[SYSTEM_ID].subsume || !game.users.activeGM?.isSelf) return;
    const animal = await foundry.utils.fromUuid(host);
    const ids = animal?.effects.filter(e => e.flags?.[SYSTEM_ID]?.subsumedBy).map(e => e.id) ?? [];
    if (ids.length) await animal.deleteEmbeddedDocuments("ActiveEffect", ids);
  });
  // Поглощение духа: зверь погиб с вампиром внутри — сознание возвращается в тело, вампир в торпоре (V20, Анимализм 4)
  Hooks.on("updateActor", async actor => {
    if (!game.users.activeGM?.isSelf || !actor.system.health?.incapacitated) return;
    const fx = actor.effects.find(e => e.flags?.[SYSTEM_ID]?.subsumedBy);
    if (!fx) return;
    const vamp = await foundry.utils.fromUuid(fx.flags[SYSTEM_ID].subsumedBy);
    await fx.delete();
    if (!vamp) return;
    const ids = vamp.effects.filter(e => e.flags?.[SYSTEM_ID]?.subsume).map(e => e.id);
    if (ids.length) await vamp.deleteEmbeddedDocuments("ActiveEffect", ids);
    if (!vamp.statuses?.has("r-torpor")) await vamp.toggleStatusEffect("r-torpor", { active: true });
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: vamp }), content: `<div class="r-notice is-warn"><i class="fa-solid fa-skull"></i> ${esc(t("SubsumeDeath", { name: vamp.name, beast: actor.name }))}</div>` });
  });
  // Могущество крови кончилось: излишек крови сверх прежнего запаса выплёскивается (V20, Путь Крови 3)
  // Искусство костей, своя работа: эффект снят — его оружие уходит
  Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
    const actor = effect.parent;
    if (!effect.flags?.[SYSTEM_ID]?.boneWork || actor?.documentName !== "Actor" || userId !== game.user.id) return;
    const ids = actor.items.filter(i => i.getFlag(SYSTEM_ID, "boneWork") === effect.id).map(i => i.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
  });
  Hooks.on("deleteActiveEffect", async effect => {
    const actor = effect.parent;
    if (!effect.flags?.[SYSTEM_ID]?.genDrop || actor?.documentName !== "Actor" || !game.users.activeGM?.isSelf) return;
    const max = actor.system.blood?.max ?? 0, stored = actor._source.system?.blood?.value ?? 0;
    if (stored > max) await actor.update({ "system.blood.value": max });
  });
  // Руки Бездны: у щупальца 4 уровня здоровья — после четвёртого оно рассеивается (рассказчик)
  Hooks.on("updateActor", async actor => {
    if (!game.users.activeGM?.isSelf || !actor.getFlag(SYSTEM_ID, "abyssArm") || (actor.system.health?.damage ?? 0) < 4) return;
    await ChatMessage.create({ content: `<div class="r-notice"><i class="fa-solid fa-wind"></i> ${esc(t("ArmGone", { name: actor.name }))}</div>` });
    await dismissArms([game.actors.get(actor.id) ?? actor]);
  });
}
