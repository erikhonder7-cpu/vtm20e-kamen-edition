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
//       hour — на час по часам хроники (hours: число часов; "successes" или "ask" — спросить при включении);
//       night — до рассвета по часам хроники (apps/timers.mjs гасит и пишет в чат).
// Ключ: «Дисциплина:уровень» — для сил основной книги 1–5; «Дисциплина:название» — для старших уровней (на одном уровне
// несколько сил) и сил из дополнений (fxKey).
// Источник — V20, гл. 4 (Дисциплины), тексты сил в data/disciplines.json.

import { SYSTEM_ID } from "../config.mjs";

export const POWER_EFFECTS = {
  // Ясновидение 1: сложность заметить что-либо органами чувств −Ясновидение; без затрат, по желанию
  "auspex:1": { mode: "toggle", icon: "fa-eye", diff: { perception: "-auspex" } },
  // Метаморфозы 1 — Глаза Зверя: тёмное зрение; включение занимает ход.
  "protean:1": { mode: "toggle", icon: "fa-eye-low-vision", transformTurns: 1, darkvision: true, diff: { social: 1 } },
  // Метаморфозы 2 — Когти Зверя: 1 кровь, превращение за ход; естественное оружие Сила +1, губительный урон, поглощается только Стойкостью.
  "protean:2": { mode: "scene", icon: "fa-paw", cost: { blood: 1 }, transformTurns: 1, claws: true, clawsFortitudeOnly: true,
    diff: { climb: -2 }, weapon: { name: "Когти Зверя", kind: "brawl", damage: 1, strength: true,
      damageType: "aggravated", difficulty: 6, supernatural: true, naturalFormWeapon: true, fortitudeOnly: true } },
  // Метаморфозы 3 — Слияние с землёй: 1 кровь, 1 ход; требуется натуральная почва, солнце не причиняет вреда.
  "protean:3": { mode: "toggle", icon: "fa-mound", cost: { blood: 1 }, transformTurns: 1, requiresSoil: true, earthMeld: true, detectDifficulty: 2 },
  // Метаморфозы 4 — Облик Зверя: 1–3 крови (3/2/1 хода), до рассвета или обратного превращения.
  "protean:4": { mode: "night", icon: "fa-paw", cost: { blood: [1, 3] }, transformTurns: "blood", variants: {
    wolf: { beastForm: "wolf", claws: true, clawsFortitudeOnly: true, runMultiplier: 2, diff: { perception: -2 } },
    bat: { beastForm: "bat", set: { strength: 1 }, flightKmh: 30, diff: { hearing: -3, hit: 2 } }
  } },
  // Метаморфозы 5 — Туманная форма: 1–3 крови (3/2/1 хода), до рассвета; физические атаки не действуют.
  "protean:5": { mode: "night", icon: "fa-smog", cost: { blood: [1, 3] }, transformTurns: "blood", mistForm: true },
  // Альтернатива Метаморфоз 4 — Модифицированный Облик Зверя (Clanbook: Gangrel Revised).
  // Постоянные две формы хранятся на актёре; при активации выбирается боевая или отступательная.
  "protean:Модифицированный Облик Зверя": { mode: "night", icon: "fa-paw", cost: { blood: [1, 3] }, transformTurns: "blood", modifiedShape: true },
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
  "quietus:3": { mode: "hour", hours: 1, icon: "fa-water", cost: { willpower: 1 } },
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
  "visceratika:2": { mode: "night", icon: "fa-house-chimney", cost: { willpower: 1 } },

  // Сроки без поправок к броскам — чтобы видеть, что действует и когда погаснет (тексты V20 в data/disciplines.json)
  // Величие 1, Благоговение: 1 кровь, до конца сцены или пока вампир не прекратит
  "presence:1": { mode: "scene", icon: "fa-star", cost: { blood: 1 } },
  // Величие 4, Приглашение: 1 кровь, действует до рассвета
  "presence:4": { mode: "night", icon: "fa-envelope-open-text", cost: { blood: 1 } },
  // Величие 5, Преклонение: 1 Воля, до конца сцены
  "presence:5": { mode: "scene", icon: "fa-crown", cost: { willpower: 1 }, noRoll: true },   // по тексту бросок не нужен
  // Затмение 1, Театр теней: 1 кровь, до конца сцены, концентрации не требует
  // Затмение 1, Театр теней: 1 кровь, до конца сцены — укрыться (+1 куб к Скрытности, стрелкам +1 к сложности)
  // или пугать (+1 куб к Запугиванию); опутать цель — по описанию силы
  "obtenebration:1": { mode: "scene", icon: "fa-cloud-moon", cost: { blood: 1 }, variants: {
    shroud: { dice: { stealth: 1 }, diff: { rangedHit: 1 } },
    intimidate: { dice: { intimidation: 1 } },
    smother: { smother: true }
  } },
  // Затмение 4, Чёрный метаморфоз: 2 крови (бросок Манипуляция + Смелость, сл. 7 — отдельно), до конца сцены:
  // 4 щупальца (Сила + 1, тяжёлые), видит во тьме, +3 куба к Запугиванию
  "obtenebration:4": { mode: "scene", icon: "fa-hand-back-fist", cost: { blood: 2 }, rollStart: true, botchDamage: 2, darkvision: true, dice: { intimidation: 3 },
    weapon: { name: "Щупальца тьмы", kind: "brawl", damage: 1, strength: true, damageType: "lethal", difficulty: 6 } },
  // Затмение 5, Сумеречный облик: 3 крови; неуязвим для физических атак и сам не атакует физически, видит в любой тьме;
  // огонь и солнце — как обычно (в отличие от тумана)
  "obtenebration:5": { mode: "toggle", icon: "fa-ghost", cost: { blood: 3 }, shadowForm: true, darkvision: true },
  // Серпентис 5, Сердце тьмы: сердце вынуто — кол не парализует, −2 к сложности сопротивления ярости
  "serpentis:5": { mode: "toggle", icon: "fa-heart-crack", heartless: true },
  // Преображение 5, Облик крови (целиком): неуязвим для физического урона, огонь и солнце — как обычно; течёт сквозь щели
  "vicissitude:5": { mode: "toggle", icon: "fa-droplet", shadowForm: true, bloodForm: true },
  // Фантасмагория 5, Кошмар наяву: 2 Воли, до конца сцены
  "chimerstry:5": { mode: "scene", icon: "fa-skull", cost: { willpower: 2 } },
  // Висцератика 1, Шкура хамелеона: 1 кровь, до конца сцены +5 кубов к маскировке, пока движется не быстрее шага
  "visceratika:1": { mode: "scene", icon: "fa-mountain", cost: { blood: 1 } },
  // Висцератика 5, Перемещение сквозь камень: после Слияния с камнем 2 крови, до конца сцены
  "visceratika:5": { mode: "scene", icon: "fa-dungeon", cost: { blood: 2 } },
  // Огам 1, Освящение рощи: 1–3 крови (ход ритуала за каждую) — кровь тратится вручную; до конца сцены
  "ogham:1": { mode: "scene", icon: "fa-tree" },
  // Огам 2, Алые узоры: 1 кровь, узоры держатся всю сцену
  "ogham:2": { mode: "scene", icon: "fa-paintbrush", cost: { blood: 1 } },
  // Сангвинус 3, Гештальт: каждый в круге тратит 1 кровь; коллективный разум до конца сцены
  "sanguinus:3": { mode: "scene", icon: "fa-people-arrows", cost: { blood: 1 } },
  // Сангвинус 5, Кровное единство: 3 крови с каждого, до конца сцены
  "sanguinus:5": { mode: "scene", icon: "fa-circle-nodes", cost: { blood: 3 } },
  // Бардо 4, Обелиск Осириса: ритуал на всю ночь, 1 Воля
  "bardo:4": { mode: "night", icon: "fa-monument", cost: { willpower: 1 } },
  // Спиритус 5, Дикий зверь: 2 крови; в облике — не больше Воли часов за ночь
  "spiritus:5": { mode: "hour", hours: "ask", icon: "fa-paw", cost: { blood: 2 } },

  // Старшие уровни и силы дополнений — по названию (сроки и цена из текстов data/disciplines.json)
  "protean:Мраморная плоть": { mode: "scene", icon: "fa-gem", cost: { blood: 3 } },
  "protean:Посмертная маска": { mode: "scene", icon: "fa-masks-theater" },
  "protean:Облик яростного Зверя": { mode: "night", icon: "fa-dragon" },
  "protean:Блаженное лето": { mode: "night", icon: "fa-smog", cost: { blood: 5 } },
  "protean:Власть над обликом": { mode: "scene", icon: "fa-lock", cost: { blood: 1 } },
  "protean:Власть над формой": { mode: "scene", icon: "fa-lock", cost: { blood: 1 } },
  "protean:Форма Ярости Зверя": { mode: "night", icon: "fa-dragon", cost: { blood: 3 } },
  "protean:Звериный рой": { mode: "night", icon: "fa-crow" },
  "protean:Форма роя": { mode: "night", icon: "fa-crow" },
  "protean:Мифический облик": { mode: "night", icon: "fa-dragon", cost: { blood: 3 } },
  "potence:Отпечаток": { mode: "scene", icon: "fa-hand-back-fist", cost: { blood: 1 } },
  "potence:Мощь героев": { mode: "scene", icon: "fa-hand-fist" },
  "fortitude:Доспех": { mode: "scene", icon: "fa-shield-halved", cost: { blood: 2 } },
  "celerity:Цветок смерти": { mode: "scene", icon: "fa-bolt", cost: { blood: 4 } },
  "presence:Искушение": { mode: "scene", icon: "fa-heart" },
  "presence:Фобия": { mode: "scene", icon: "fa-face-flushed" },
  "dementation:Голос безумия": { mode: "scene", icon: "fa-bullhorn", cost: { blood: 1 } },
  "dementation:Извержение безумия": { mode: "night", icon: "fa-city", cost: { willpower: 4 } },
  "vicissitude:Экстатическая агония": { mode: "scene", icon: "fa-heart-crack", cost: { willpower: 2 } },
  "vicissitude:Восторг боли": { mode: "scene", icon: "fa-heart-crack", cost: { willpower: 2 } },
  "vicissitude:Убежище в лоне Земли": { mode: "night", icon: "fa-mound" },
  "serpentis:Божественный облик": { mode: "scene", icon: "fa-ankh", cost: { blood: 3 } },
  "serpentis:Тень Апепа": { mode: "scene", icon: "fa-worm", cost: { willpower: 1 } },
  "serpentis:Тень Апофиса": { mode: "scene", icon: "fa-worm", cost: { willpower: 1 } },
  "obfuscate:Подпитка": { mode: "night", icon: "fa-user-shield" },
  "obfuscate:Мысленный лабиринт": { mode: "scene", icon: "fa-brain" },
  "chimerstry:Ложный отклик": { mode: "night", icon: "fa-shoe-prints" },
  "chimerstry:Майяпарисатья": { mode: "scene", icon: "fa-wand-magic-sparkles" },
  "bardo:Парадокс": { mode: "scene", icon: "fa-infinity", cost: { willpower: 1 } },
  "bardo:Зов рассвета": { mode: "hour", hours: "ask", icon: "fa-bed" },
  "valeren:Броня гнева Каинова": { mode: "scene", icon: "fa-shield", cost: { blood: 1 } },
  "valeren:Блаженная агония": { mode: "scene", icon: "fa-hand-holding-medical", cost: { blood: 1 } },
  "daimoinon:Низменный страх": { mode: "scene", icon: "fa-ghost" },
  "melpominee:Незримый собеседник": { mode: "scene", icon: "fa-comment-dots", cost: { blood: 1 } },
  "ogham:Иссушение Земли": { mode: "scene", icon: "fa-seedling", cost: { blood: 1 } },
  "ogham:Начертание забытых имён": { mode: "scene", icon: "fa-scroll" },
  "mortis:Маска смерти": { mode: "hour", hours: 24, icon: "fa-skull", cost: { blood: 1 } },
  "mortis:Восстание трупа": { mode: "night", icon: "fa-person-falling-burst", cost: { blood: 1 } },
  "mortis:Буря Энлиля": { mode: "night", icon: "fa-cloud-showers-heavy", cost: { willpower: 2 } }
};

/** Ключ эффекта силы: основная книга 1–5 — «Дисциплина:уровень», прочие — «Дисциплина:название». */
export const fxKey = (disc, p) => !p.source && p.level <= 5 ? `${disc}:${p.level}` : `${disc}:${p.name}`;

/** Сила справочника по ключу эффекта (уровень или название). */
export function powerOfKey(Codex, power) {
  const i = power.indexOf(":"), disc = power.slice(0, i), rest = power.slice(i + 1);
  const list = Codex.discipline(disc)?.powers ?? [];
  const p = /^\d+$/.test(rest) ? list.find(x => x.level === Number(rest) && !x.source) ?? list.find(x => x.level === Number(rest)) : list.find(x => x.name === rest);
  return { disc, power: p ?? null, level: p?.level ?? (Number(rest) || 0) };
}

/** Подпись вида длительности: сцена, до выключения, час, до рассвета. */
export const MODE_LABEL = { scene: "Fx.Scene", toggle: "Fx.Toggleable", hour: "Fx.Hour", night: "Fx.Night" };

/** Определение эффекта силы с учётом варианта и сохранённых форм персонажа. */
export function effectDef(power, variant = "", shapeConfig = null) {
  const base = POWER_EFFECTS[power];
  if (!base) return null;
  if (power === "protean:Модифицированный Облик Зверя" && shapeConfig) {
    const role = variant === "escape" ? "escape" : "battle";
    const form = shapeConfig[role] ?? {};
    const sense = ["vision", "hearing", "smell"].includes(form.sense) ? form.sense : "vision";
    const diff = { [sense]: -2 };
    if (role === "battle") {
      const attr = {};
      for (const key of ["strength", "dexterity", "stamina"]) attr[key] = Math.max(0, Math.min(5, Number(form.attr?.[key]) || 0));
      return { ...base, beastForm: "modified", attr, diff, runMultiplier: 2,
        modifiedShape: { role, animal: String(form.animal || "зверь"), sense },
        weapons: [
          { name: `Когти (${String(form.animal || "зверь")})`, kind: "brawl", damage: 1, strength: true, damageType: "aggravated", difficulty: 6, naturalFormWeapon: true, supernatural: true },
          { name: `Укус (${String(form.animal || "зверь")})`, kind: "brawl", damage: 0, strength: true, damageType: "aggravated", difficulty: 6, naturalFormWeapon: true, supernatural: true }
        ] };
    }
    const attr = {};
    if (!form.large) attr.strength = -1;
    if (!form.flying) attr.dexterity = 2;
    if (!form.large) diff.hit = 2;
    return { ...base, beastForm: "modified", attr, diff,
      moveEqualRun: !!form.flying,
      modifiedShape: { role, animal: String(form.animal || "зверь"), sense, flying: !!form.flying, large: !!form.large } };
  }
  return variant && base.variants?.[variant] ? { ...base, ...base.variants[variant] } : base;
}

/** Действующие эффекты сил на актёре. */
export function activePowerEffects(actor) {
  const out = [];
  for (const e of actor?.effects ?? []) {
    const f = e.flags?.[SYSTEM_ID];
    if (!f?.power || e.disabled) continue;
    const def = effectDef(f.power, f.variant, f.shapeConfig ?? null);
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
  const m = { attr: {}, set: {}, diff: {}, claws: false, clawsFortitudeOnly: false, earthMeld: false, mistForm: false, darkvision: false,
    detectDifficulty: 0, runMultiplier: 1, flightKmh: 0, moveEqualRun: false, beastForm: null, modifiedShape: null,
    brawlDamage: 0, biteDamage: 0, soakDiff: 0, staminaVsFangs: false, venom: 0, shadowForm: false, dice: {}, list: [] };
  // тотем стаи (apps/coterie.mjs → acceptTotem): прибавки к Атрибутам каждому члену стаи
  for (const e of actor?.effects ?? []) {
    // тотем стаи и яд Касания скорпиона (apps/target-powers.mjs, attrMod) — прибавки и вычеты к Атрибутам
    const ta = !e.disabled && (e.flags?.[SYSTEM_ID]?.totemAttr ?? e.flags?.[SYSTEM_ID]?.attrMod);
    const as = !e.disabled && e.flags?.[SYSTEM_ID]?.attrSet;
    if (as) { Object.assign(m.set, as); m.list.push(e); }
    if (!ta) continue;
    for (const [k, v] of Object.entries(ta)) m.attr[k] = (m.attr[k] ?? 0) + v;
    m.list.push(e);
  }
  for (const { effect, def } of activePowerEffects(actor)) {
    // Превращения, которые ещё идут в бою, видны на листе, но пока не дают механических бонусов.
    if (effect.flags?.[SYSTEM_ID]?.ready === false) { m.list.push(effect); continue; }
    for (const [k, v] of Object.entries(def.attr ?? {})) m.attr[k] = (m.attr[k] ?? 0) + v;
    Object.assign(m.set, def.set ?? {});
    for (const [k, v] of Object.entries(def.diff ?? {})) {
      m.diff[k] ??= [];
      m.diff[k].push({ label: effect.name, value: num(v, actor) });
    }
    m.claws ||= !!def.claws;
    m.clawsFortitudeOnly ||= !!def.clawsFortitudeOnly;
    m.earthMeld ||= !!def.earthMeld;
    m.mistForm ||= !!def.mistForm;
    m.shadowForm ||= !!def.shadowForm;
    m.bloodForm ||= !!def.bloodForm;
    m.heartless ||= !!def.heartless;
    // кубы к броскам со Способностью (Театр теней, Чёрный метаморфоз): { stealth: 1 } → fx.dice.stealth
    for (const [k, v] of Object.entries(def.dice ?? {})) (m.dice[k] ??= []).push({ label: effect.name, value: v });
    m.darkvision ||= !!def.darkvision;
    m.detectDifficulty = Math.max(m.detectDifficulty ?? 0, def.detectDifficulty ?? 0);
    m.runMultiplier = Math.max(m.runMultiplier ?? 1, def.runMultiplier ?? 1);
    m.flightKmh = Math.max(m.flightKmh ?? 0, def.flightKmh ?? 0);
    m.moveEqualRun ||= !!def.moveEqualRun;
    m.beastForm = def.beastForm ?? m.beastForm ?? null;
    m.modifiedShape = def.modifiedShape ?? m.modifiedShape ?? null;
    m.brawlDamage += def.brawlDamage ?? 0;
    m.biteDamage += def.biteDamage ?? 0;
    m.soakDiff += def.soakDiff ?? 0;
    m.staminaVsFangs ||= !!def.staminaVsFangs;
    if (def.venom) m.venom += effect.flags?.[SYSTEM_ID]?.charges ?? 1;
    m.list.push(effect);
  }
  return m;
}
