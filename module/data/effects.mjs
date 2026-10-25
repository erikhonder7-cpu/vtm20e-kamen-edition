// module/data/effects.mjs
// Эффекты сил Дисциплин: силы, которые меняют персонажа, пока действуют.
//
// Включённая сила — ActiveEffect на актёре (флаги: power, variant, mode) с иконкой
// Дисциплины и статусом на жетоне. Числа берутся отсюда, а не из правок эффекта:
// так дисплей точек на листе не меняется, а правила считаются в коде —
//   attr      — прибавка к итогу характеристики (models.mjs);
//   set       — характеристика становится равной числу (Чудовищный облик, Шкура гадюки);
//   diff      — сложность проверок: { perception } автоматически, { social, climb, hit } — по обстоятельствам
//               (отмечаются в окне броска);
//   claws     — манёвр «Когти» в бою (Сила +1, губительные);
//   brawlDamage / biteDamage — кубы к урону в драке / укусом;
//   soakDiff  — к сложности прочности (6 → 5); staminaVsFangs — Выносливость против когтей и клыков;
//   weapon    — естественное оружие (предмет создаётся при включении и убирается при выключении);
//   charges   — сколько крови потрачено, столько зарядов (Ласка Ваала); venom — урон оружия губительный.
// mode: scene — гаснет в конце сцены; toggle — до выключения (обратное превращение);
//       hour — на час по часам хроники (hours: число часов или "successes" — спросить при включении);
//       night — до рассвета по часам хроники (apps/timers.mjs гасит и пишет в чат).
// Источник — V20, гл. 4 (Дисциплины), тексты сил в data/disciplines.json.

import { SYSTEM_ID } from "../config.mjs";

export const POWER_EFFECTS = {
  // Ясновидение 1: сложность заметить что-либо органами чувств −Ясновидение; без затрат, по желанию
  "auspex:1": { mode: "toggle", icon: "fa-eye", diff: { perception: "-auspex" } },
  // Метаморфозы 1: +1 к сложности социальных проверок со смертными, если глаза не скрыты
  "protean:1": { mode: "toggle", icon: "fa-eye-low-vision", diff: { social: 1 } },
  // Метаморфозы 2: 1 кровь, до конца сцены; когти Сила +1 губительные, −2 к сложности лазания
  "protean:2": { mode: "scene", icon: "fa-paw", cost: { blood: 1 }, claws: true, diff: { climb: -2 } },
  // Метаморфозы 3: 1 кровь; полная защита от солнца, +2 к сложности обнаружить
  "protean:3": { mode: "toggle", icon: "fa-mound", cost: { blood: 1 } },
  // Метаморфозы 4: 1–3 крови (3/2/1 хода), до рассвета или обратного превращения
  "protean:4": { mode: "night", icon: "fa-paw", cost: { blood: [1, 3] }, variants: {
    wolf: { claws: true, diff: { perception: -2 } },
    bat: { set: { strength: 1 }, diff: { hearing: -3, hit: 2 } }
  } },
  // Метаморфозы 5: 1–3 крови; неуязвим для физических атак, −1 куб урона от огня и солнца
  "protean:5": { mode: "toggle", icon: "fa-smog", cost: { blood: [1, 3] } },
  // Преображение 4: 2 крови; +3 к физическим, социальные 0, +1 куб урона в драке
  "vicissitude:4": { mode: "toggle", icon: "fa-dragon", cost: { blood: 2 },
    attr: { strength: 3, dexterity: 3, stamina: 3 }, set: { charisma: 0, manipulation: 0, appearance: 0 }, brawlDamage: 1 },
  // Серпентис 2: язык — оружие, сл. 6, Сила +0, губительные
  "serpentis:2": { mode: "toggle", icon: "fa-staff-snake",
    weapon: { name: "Язык аспида", kind: "brawl", damage: 0, strength: true, damageType: "lethal", difficulty: 6 } },
  // Серпентис 3: 1 кровь + 1 воля; прочность сл. 5, Выносливость против когтей и клыков, +1 куб укуса, Привлекательность 1
  "serpentis:3": { mode: "toggle", icon: "fa-staff-snake", cost: { blood: 1, willpower: 1 },
    soakDiff: -1, staminaVsFangs: true, biteDamage: 1, set: { appearance: 1 } },
  // Серпентис 4, Облик кобры: 1 кровь, превращение 3 хода, до рассвета (или по желанию)
  "serpentis:4": { mode: "night", icon: "fa-worm", cost: { blood: 1 } },
  // Упокоение 1, Безмолвие смерти: 1 кровь — на час сфера тишины вокруг вампира
  "quietus:1": { mode: "hour", hours: 1, icon: "fa-volume-xmark", cost: { blood: 1 } },
  // Упокоение 3, Зов Дагона: в течение часа после касания — 1 Воля и встречная Выносливость
  "quietus:3": { mode: "hour", hours: 1, icon: "fa-water" },
  // Упокоение 4, Ласка Ваала: 1 кровь = 1 пункт ихора; урон оружия и ногтей — губительный, попадание тратит пункт
  "quietus:4": { mode: "toggle", icon: "fa-skull-crossbones", cost: { blood: [1, 5] }, charges: true, venom: true },
  // Сокрытие 1–2: держится, пока не выдаст себя
  "obfuscate:1": { mode: "toggle", icon: "fa-user-secret" },
  "obfuscate:2": { mode: "toggle", icon: "fa-ghost" },
  // Сокрытие 3: Манипуляция + Исполнение (сл. 7) — маска держится, пока вампир её не снимет
  "obfuscate:3": { mode: "toggle", icon: "fa-masks-theater" },
  // Танатосис 1, Ведьмины морщины: длится столько часов, сколько успехов
  "thanatosis:1": { mode: "hour", hours: "successes", icon: "fa-face-grimace" },
  // Висцератика 2, Страж очага: 1 Воля; пока касается здания или внутри — до рассвета
  "visceratika:2": { mode: "night", icon: "fa-house-chimney", cost: { willpower: 1 } }
};

/** Подпись вида длительности: сцена, до выключения, час, до рассвета. */
export const MODE_LABEL = { scene: "Fx.Scene", toggle: "Fx.Toggleable", hour: "Fx.Hour", night: "Fx.Night" };

/** Определение эффекта силы с учётом варианта (волк / летучая мышь). */
export function effectDef(power, variant = "") {
  const base = POWER_EFFECTS[power];
  if (!base) return null;
  return variant && base.variants?.[variant] ? { ...base, ...base.variants[variant] } : base;
}

/** Действующие эффекты сил на актёре. */
export function activePowerEffects(actor) {
  const out = [];
  for (const e of actor?.effects ?? []) {
    const f = e.flags?.[SYSTEM_ID];
    if (!f?.power || e.disabled) continue;
    const def = effectDef(f.power, f.variant);
    if (def) out.push({ effect: e, power: f.power, variant: f.variant ?? "", def });
  }
  return out;
}

/** Число из правила: «-auspex» — минус точки Дисциплины. */
function num(v, actor) {
  if (typeof v === "number") return v;
  const m = String(v).match(/^(-?)(\w+)$/);
  const n = m ? (actor.discipline?.(m[2]) ?? 0) : 0;
  return m?.[1] ? -n : n;
}

/**
 * Сводка правок от включённых сил:
 * { attr, set, diff: { perception, social, climb, hearing, hit }, claws, brawlDamage, biteDamage, soakDiff, staminaVsFangs, list }
 */
export function effectMods(actor) {
  const m = { attr: {}, set: {}, diff: {}, claws: false, brawlDamage: 0, biteDamage: 0, soakDiff: 0, staminaVsFangs: false, venom: 0, list: [] };
  for (const { effect, def } of activePowerEffects(actor)) {
    for (const [k, v] of Object.entries(def.attr ?? {})) m.attr[k] = (m.attr[k] ?? 0) + v;
    Object.assign(m.set, def.set ?? {});
    for (const [k, v] of Object.entries(def.diff ?? {})) {
      m.diff[k] ??= [];
      m.diff[k].push({ label: effect.name, value: num(v, actor) });
    }
    m.claws ||= !!def.claws;
    m.brawlDamage += def.brawlDamage ?? 0;
    m.biteDamage += def.biteDamage ?? 0;
    m.soakDiff += def.soakDiff ?? 0;
    m.staminaVsFangs ||= !!def.staminaVsFangs;
    if (def.venom) m.venom += effect.flags?.[SYSTEM_ID]?.charges ?? 1;
    m.list.push(effect);
  }
  return m;
}
