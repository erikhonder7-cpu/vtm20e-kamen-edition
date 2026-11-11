// module/apps/target-powers/core.mjs
// Силы по цели — общее: таблица сил (TARGET_POWERS), подписи, сообщения в чат, выбор из списка, сроки действия, отметка «применено».
// Ничего не знает о броске и о применении — на это опираются остальные части.

import { SYSTEM_ID } from "../../config.mjs";

// календарь и сроки — лениво (apps/calendar.mjs тянет ApplicationV2, а roll.mjs проверяется и вне Foundry)
export const clockApi = async () => ({ ...(await import("../calendar.mjs")), ...(await import("../timers.mjs")) });

export const t = (k, d) => d ? game.i18n.format(`VTM20.TP.${k}`, d) : game.i18n.localize(`VTM20.TP.${k}`);

export const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

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
export const SUBSUME = [[], [], ["auspex"], ["auspex", "presence"], ["auspex", "presence", "dementation", "dominate"],
  ["auspex", "presence", "dementation", "dominate", "chimerstry", "necromancy", "thaumaturgy"]];

export function subsumeBlocks(actor, disc) {
  const e = [...(actor?.effects ?? [])].find(x => !x.disabled && x.flags?.[SYSTEM_ID]?.subsume);
  if (!e) return false;
  return !SUBSUME[Math.min(5, Number(e.flags[SYSTEM_ID].subsume))].includes(disc);
}

/** Тот же персонаж: лист (Actor.id) и жетон без связи (Scene.….Token.….Actor.id) — один и тот же вампир. */
export const sameActor = (uuid, actor) => !!uuid && !!actor && (uuid === actor.uuid || String(uuid).endsWith(`Actor.${actor.id}`));

/** Сверхъестественное существо (Глаза змеи): вампир, Гару, падший, сверхъестественная тварь; гуль и охотник — смертные. */
export const supernatural = a => ["vampire", "werewolf", "demon"].includes(a.type) || (a.type === "creature" && !!a.system.supernatural);

export const targetPowerOf = (disc, p) => TARGET_POWERS[`${disc}|${p?.en ?? ""}`] ?? null;

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

/** Кнопка отработала: на карточке броска — пометка, на карточке «наложить» — убрать кнопку. */
export async function done(message, state, x) {
  if (!message?.isOwner) return;
  if (message.getFlag?.(SYSTEM_ID, "targetApply")) {
    await message.setFlag(SYSTEM_ID, "targetApply", { ...x, done: true });
    return message.update({ content: String(message.content).replace(/<div class="r-card-buttons">[\s\S]*?<\/div>/, "") });
  }
  const { renderCard } = await import("../../dice/roll.mjs");
  const next = { ...state, extra: { ...state.extra, targetPower: { ...x, done: true } } };
  await message.setFlag(SYSTEM_ID, "roll", next);
  await message.update({ content: await renderCard(next) });
}

export const notice = (target, power, what) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }),
  content: `<div class="r-notice"><i class="fa-solid fa-brain"></i> ${t("Applied", { name: esc(target.name), power: esc(power), what: esc(what) })}</div>` });

/** Карточка «проверить ярость/Ротшрек» со своей сложностью (Голос безумия) — кнопкой броска для владельца. */
export function selfCheck(actor, kind, difficulty, text) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    whisper: game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id),
    flags: { [SYSTEM_ID]: { checkPrompt: { kind, difficulty, actorUuid: actor.uuid } } },
    content: `<div class="r-notice r-check-prompt is-${kind}"><i class="fa-solid ${kind === "frenzy" ? "fa-face-angry" : "fa-fire"}"></i> <span>${esc(text)}</span>
      <div class="r-card-buttons"><button type="button" data-r-action="virtueCheck"><i class="fa-solid fa-dice-d10"></i> ${esc(game.i18n.localize("VTM20.CheckPrompt.Roll"))}</button></div></div>` });
}

export const MS_H = 3600000;

/** Обезболивающее касание: боль не мешает (штрафы ран не считаются). */
export const painless = actor => [...(actor?.effects ?? [])].some(e => !e.disabled && e.flags?.[SYSTEM_ID]?.painless);

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

/** Сосредоточение (Путь Сосредоточенного разума 2): пулы не уменьшаются. */
export const centered = actor => [...(actor?.effects ?? [])].some(e => !e.disabled && e.flags?.[SYSTEM_ID]?.centered);

/** Флаг эффекта путей у персонажа (Танец ветра, Разъедающее касание, Верный удар). */
export const pathFlag = (actor, k) => [...(actor?.effects ?? [])].some(e => !e.disabled && e.flags?.[SYSTEM_ID]?.[k]);
