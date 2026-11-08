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
  "obfuscate|Cloak the Gathering": { kind: "gather" },
  "thaumaturgy|A Taste for Blood": { kind: "taste", needTarget: true },
  "thaumaturgy|Blood Rage": { kind: "rage", needTarget: true },
  "thaumaturgy|Blood of Potency": { kind: "potency", self: true },
  "thaumaturgy|Theft of Vitae": { kind: "theft", needTarget: true },
  "dominate|Possession": { kind: "possess", needTarget: true, dominate: true, mortalTarget: true },
  "auspex|Aura Perception": { kind: "aura", needTarget: true },
  "auspex|Psychic Projection": { kind: "project", self: true },
  "vicissitude|Malleable Visage": { kind: "visage", self: true },
  "vicissitude|Fleshcraft": { kind: "flesh", needTarget: true },
  "animalism|Feral Whispers": { kind: "whisper", needTarget: true, animal: true, tiers: [[1, "Whis1"], [3, "Whis3"], [5, "Whis5"]] },
  "animalism|The Beckoning": { kind: "beckon", self: true },
  "animalism|Subsume the Spirit": { kind: "subsume", needTarget: true, animal: true }
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
  if (tp.mortalTarget && supernatural(target)) { ui.notifications.warn(t("MortalsOnly", { name: target.name })); return null; }
  if (tp.animal && !(target.type === "creature" && !target.system.spirit?.on)) { ui.notifications.warn(t("NotAnimal", { name: target.name })); return null; }
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
  if (!tp || ev.outcome !== "success" || extra.targetPower.done || !(tp.timed || tp.dread || tp.kind) || ["taste", "gather", "aura", "visage", "whisper"].includes(tp.kind)) return "";
  // Усмирение — только когда накоплены все успехи продолжительного броска
  if (tp.kind === "quell" && !((extra.extended?.prev ?? 0) + ev.successes >= (extra.extended?.need ?? Infinity))) return "";
  const lbl = { beast: "BeastApply", poison: "PoisonApply", shroud: "ShroudApply", arms: "ArmsApply", vanish: "VanishApply",
    rage: "RageApply", potency: "PotencyApply", theft: "TheftApply", possess: "PossessApply", project: "ProjectApply",
    flesh: "FleshApply", beckon: "BeckonApply", subsume: "SubsumeApply" }[tp.kind] ?? "Apply";
  return t(lbl, { name: extra.targetPower.targetName, n: ev.successes });
}

/** Кнопка на карточке: эффект силы на цели (владелец цели или рассказчик). */
export async function applyTargetPower(message, state, ev) {
  const x = state.extra?.targetPower, tp = x && TARGET_POWERS[x.key];
  if (!tp || x.done) return;
  const target = await foundry.utils.fromUuid(x.target);
  if (!target) return ui.notifications.warn(t("Gone"));
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
      description: `<p>${esc(t("EmptyBodyDesc"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "manual" } } }]);
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
      const k = Math.min(n, (target.system.attributes.strength?.value ?? 1) - 1);
      if (k < 1) return notice(target, x.powerName, t("FleshNoStrength"));
      await target.update({ "system.attributes.strength.value": target.system.attributes.strength.value - k });
      await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("FleshArmorName", { n: k }), img: Codex.disciplineIcon("vicissitude"),
        description: `<p>${esc(t("FleshArmorDesc", { n: k }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, soakDice: k, mode: "manual" } } }]);
      return notice(target, x.powerName, t("FleshArmorDesc", { n: k }));
    }
    const next = Math.clamp(ap + (mode === "raise" ? n : -n), 0, 5);
    await target.update({ "system.attributes.appearance.value": next });
    return notice(target, x.powerName, t("FleshLooks", { from: ap, to: next }));
  }
  if (tp.kind === "subsume") {
    // Поглощение духа: тело вампира пустует, в звере — его дух; Дисциплины — по успехам
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    if (!self?.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: self?.name ?? "" }));
    await done(message, state, x);
    const tier = Math.min(5, n), list = SUBSUME[tier].map(k => Codex.disciplineLabel(k)).join(", ") || t("SubsumeNone");
    await self.createEmbeddedDocuments("ActiveEffect", [{ name: t("SubsumeName", { name: target.name }), img: Codex.disciplineIcon("animalism"),
      description: `<p>${esc(t("SubsumeDesc", { list }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, subsume: tier, mode: "manual" } } }]);
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("PossessedName", { name: x.actorName }), img: Codex.disciplineIcon("animalism"),
      flags: { [SYSTEM_ID]: { ...flags, mode: "manual" } } }]);
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
export async function rollTargetPower(actor, disc, d, p, tp, { rollFromSpec, subtitle, kind = "check", magic = null }) {
  // Могущество крови — не чаще раза за ночь
  if (tp.kind === "potency") {
    const api = await clockApi();
    if ((actor.getFlag(SYSTEM_ID, "potencyNight") ?? 0) > api.getClock()) return ui.notifications.warn(t("PotencyOnce"));
  }
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
    more: link ? { targetPower: link } : null, kind, magic };
  // Вкус крови: сведения — только тауматургу и рассказчику
  if (tp.kind === "taste") opts.onRolled = res => {
    const n = res?.successes ?? 0;
    if (n < 1) return;
    const lines = tasteLines(target, n);
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id, ...game.users.filter(u => u.isGM).map(u => u.id)],
      content: `<div class="r-notice"><i class="fa-solid fa-droplet"></i> <b>${esc(p.name)}</b> → ${esc(target.name)}<ul>${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>` });
  };
  if (tp.kind === "possess") roll = { ...roll, willpower: true, note: t("PossessNote", { name: target.name }) };
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
    const mode = await foundry.applications.api.DialogV2.prompt({ window: { title: p.name, icon: "fa-solid fa-hand-sparkles" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
      content: `<div class="r-form"><label class="r-field"><span>${esc(t("FleshWhat"))}</span><select name="m">
        <option value="lower">${esc(t("FleshLower"))}</option><option value="raise">${esc(t("FleshRaise"))}</option><option value="armor">${esc(t("FleshArmor"))}</option></select></label></div>`,
      ok: { label: t("VisageGo"), callback: (e, b) => b.form.elements.m.value } });
    if (!mode) return null;
    roll = { ...roll, difficulty: { lower: 5, raise: 9, armor: 8 }[mode], note: t(`FleshNote.${mode}`) };
    opts.more = { targetPower: { ...link, flesh: mode } };
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

/** Сложность сопротивления ярости от Неистовства крови — для проверки бешенства. */
export function frenzyDiff(actor, kind) {
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
  // Сердце тьмы: без сердца кол не парализует (V20, Серпентис 5)
  Hooks.on("preCreateActiveEffect", (effect, data, options, userId) => {
    const actor = effect.parent;
    if (actor?.documentName !== "Actor" || !actor.system?.fx?.heartless || !(effect.statuses ?? new Set()).has?.("r-staked")) return;
    if (userId === game.user.id) ui.notifications.info(t("HeartlessStake", { name: actor.name }));
    return false;
  });
  // Могущество крови кончилось: излишек крови сверх прежнего запаса выплёскивается (V20, Путь Крови 3)
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
