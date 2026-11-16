// module/data/gift-effects.mjs
// Дары Гару как эффекты (W20, гл. 4; тексты — data/werewolf.json): Дар включается с листа (кнопка Дара), списывает цену,
// при необходимости бросает пул и ложится ActiveEffect на сцену — той же машиной, что силы Дисциплин (data/effects.mjs):
// флаг power = «gift:ключ», числа считает effectMods, срок гасит apps/timers.mjs, на листе — вкладка «Эффекты».
//
// Поля (сверх общих полей effects.mjs: attr, diff, dice, woundEase, runMultiplier, biteDamage, brawlDamage, darkvision,
// detectDifficulty, soakBonus):
//   cost      — { rage, gnosis, willpower } списывается при включении;
//   roll      — true: бросок пула Дара (data/werewolf.json → roll) или свой { trait1, trait2, difficulty };
//               эффект ложится при 1+ успехе, «n» в числах — число успехов;
//   byForm    — поправки по форме Гару в момент включения (Обострённые чувства);
//   clawDamage / clawDiff — кубы урона и сложность атак когтями (естественное оружие формы, combat.mjs «f:N»);
//   soakAll   — кубы прочности против любого урона; silverSoak — ими (и только ими) поглощается серебро;
//   attrDice  — кубы к броскам с Атрибутом группы { mental: 1 } (окно броска); rageDiff — к сложности бросков Ярости;
//   note      — правка не считается кодом (касается чужих бросков или решает рассказчик): эффект — напоминание со сроком.
// Постоянные Дары (GIFT_PASSIVE) действуют, пока Дар есть у персонажа: initiative — прибавка к инициативе, diff — сложности.

export const GIFT_EFFECTS = {
  // Бритвенные когти: 1 Ярость, полный ход — до конца сцены когти +2 куба урона и −1 к сложности
  "gift:razor-claws": { mode: "scene", icon: "fa-paw", cost: { rage: 1 }, clawDamage: 2, clawDiff: -1 },
  // Терпеть боль: 1 Воля — до конца сцены без штрафов за раны
  "gift:resist-pain": { mode: "scene", icon: "fa-heart-pulse", cost: { willpower: 1 }, woundEase: 10 },
  // Скорость мысли: 1 Гнозис — бег ×2 до конца сцены
  "gift:speed-of-thought": { mode: "scene", icon: "fa-person-running", cost: { gnosis: 1 }, runMultiplier: 2 },
  // Грызть: 1 Воля — укус до конца сцены +2 куба урона (перегрызание — отдельный бросок Выносливость + 4)
  "gift:gnaw": { mode: "scene", icon: "fa-teeth", cost: { willpower: 1 }, biteDamage: 2 },
  // Ореол солнца: 1 Гнозис, сцена — +2 куба урона в рукопашной; смотрящим прямо +3 к атакам, вампиры горят (рассказчик)
  "gift:halo-of-the-sun": { mode: "scene", icon: "fa-sun", cost: { gnosis: 1 }, brawlDamage: 2, note: true },
  // Обострённые чувства: 1 Гнозис, сцена — в Хомиде и Глабро Восприятие −2 и ночное зрение; в Криносе, Хиспо, Лупусе −3
  // и +1 куб к Первобытному инстинкту
  "gift:heightened-senses": { mode: "scene", icon: "fa-ear-listen", cost: { gnosis: 1 }, byForm: {
    homid: { diff: { perception: -2 }, darkvision: true }, glabro: { diff: { perception: -2 }, darkvision: true },
    crinos: { diff: { perception: -3 }, dice: { primalUrge: 1 } }, hispo: { diff: { perception: -3 }, dice: { primalUrge: 1 } },
    lupus: { diff: { perception: -3 }, dice: { primalUrge: 1 } } } },
  // Повелитель огня: 1 Гнозис — до конца сцены огонь наносит ударный урон вместо губительного
  "gift:master-of-fire": { mode: "scene", icon: "fa-fire", cost: { gnosis: 1 }, note: true },
  // Ловить шёпот: 1 Воля — до конца сцены шёпот в ~60 м слышен ясно
  "gift:whisper-catching": { mode: "scene", icon: "fa-ear-listen", cost: { willpower: 1 }, note: true },
  // Глаза Ткачихи: 1 Гнозис — до конца сцены заявляет действие последним
  "gift:weaver-s-eyes": { mode: "scene", icon: "fa-eye", cost: { gnosis: 1 }, note: true },
  // Клыки правосудия: 1 Воля — на сутки естественное оружие +2 куба урона против отпавших к Червю
  "gift:fangs-of-judgment": { mode: "hour", hours: 24, icon: "fa-gavel", cost: { willpower: 1 }, note: true },
  // Хватка сокола: 1 Ярость — до конца сцены Сила +3 для захватов (не для урона)
  "gift:falcon-s-grasp": { mode: "scene", icon: "fa-hand-back-fist", cost: { rage: 1 }, note: true },

  // ── по броску: n — успехи ──
  // Доспех Луны: 1 Гнозис, Выносливость + Выживание (сл. 6) — +1 куб прочности за успех; только ими — против серебра
  "gift:luna-s-armor": { mode: "scene", icon: "fa-moon", cost: { gnosis: 1 }, roll: true, soakAll: "n", silverSoak: "n" },
  // Шкура тролля: 1 Гнозис, Выносливость + Первобытный инстинкт (сл. 7) — +1 куб прочности за успех (серебро — нет);
  // социальные броски, кроме Запугивания, +1 к сложности
  "gift:troll-skin": { mode: "scene", icon: "fa-shield", cost: { gnosis: 1 }, roll: true, soakAll: "n", diff: { social: 1 } },
  // Пелена мутного глаза: Манипуляция + Скрытность (сл. 8) — +1 к сложности заметить его за успех
  "gift:blur-of-the-milky-eye": { mode: "scene", icon: "fa-eye-slash", roll: true, detectDifficulty: "n" },
  // Дыхание Дикости: бросок Гнозиса (сл. 5) — +1 куб к ментальным броскам, сложность Ярости +1
  "gift:breath-of-the-wyld": { mode: "scene", icon: "fa-wind", roll: { trait1: "werewolf.gnosis", difficulty: 5 }, attrDice: { mental: 1 }, rageDiff: 1 },
  // Серебряные когти: бросок Гнозиса (сл. 7) — когти серебряные; каждый ход +1 Ярость, небоевые действия +1 (рассказчик)
  "gift:silver-claws": { mode: "scene", icon: "fa-moon", roll: { trait1: "werewolf.gnosis", difficulty: 7 }, note: true },
  // Лик Фенриса: Обаяние + Запугивание — союзники −1 к социальным, враги −1 к инициативе (у них)
  "gift:visage-of-fenris": { mode: "scene", icon: "fa-crown", roll: true, note: true },
  // Оберег от духов: 1 Гнозис, Манипуляция + Ритуалы (сл. 7) — духи в 30 м теряют куб за успех
  "gift:spirit-ward": { mode: "scene", icon: "fa-ban", cost: { gnosis: 1 }, roll: true, note: true },
  // Заячий прыжок: Сила + Атлетика (сл. 7) — прыжки ×2 на сцену
  "gift:hare-s-leap": { mode: "scene", icon: "fa-person-falling", roll: true, note: true }
};

/** Постоянные Дары: действуют, пока Дар у персонажа. */
export const GIFT_PASSIVE = {
  // Дух схватки: постоянно +10 к инициативе
  "spirit-of-the-fray": { initiative: 10 },
  // Равновесие: сложность лазания −3
  "balance": { diff: { climb: -3 } }
};

/** Правки эффекта Дара с учётом формы и успехов (кладутся во флаг эффекта giftFx при включении). */
export function giftFx(def, { form = "", n = 0 } = {}) {
  const out = {};
  const val = v => v === "n" ? n : v;
  const pick = def.byForm?.[form] ?? {};
  for (const [k, v] of Object.entries({ ...def, ...pick })) {
    if (["mode", "icon", "cost", "roll", "byForm", "hours"].includes(k)) continue;
    if (k === "soakAll") { const s = val(v); if (s) out.soakBonus = { bashing: s, lethal: s, aggravated: s }; continue; }
    out[k] = typeof v === "object" && v !== null ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, val(b)])) : val(v);
  }
  return out;
}
