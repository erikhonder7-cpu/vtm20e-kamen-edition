// module/data/zulo.mjs
// Хоумрул «Образ ужаса / форма зуло» (Lucky Dicepool, С. Тимошкин, 2020) — настройка мира horridForm = "zulo".
// Чудовищный облик (Преображение 4) у каждого Изверга свой: вместо «+3 ко всем физическим» — три черты из списка
// (больше — с Достоинством «Проявление Зверя»). Цена — 2 крови, превращение за ход, социальные Атрибуты 0,
// Запугивание — Силой. Набор хранится на персонаже (флаг zuloForm), смена черты — 1 опыт за черту.
// Числа здесь — то, что считает система; остальное — описание во вкладке «Эффекты» (Zulo.T.<key>.text).

import { SYSTEM_ID } from "../config.mjs";

export const ZULO_FLAG = "zuloForm";
export const ZULO_POWER = "vicissitude:4";
export const ZULO_SOURCE = "Хоумрул Lucky Dicepool: Образ ужаса / форма зуло (2020)";

/** Черты формы: key — ключ в переводе (VTM20.Zulo.T.<key>: name, tag, text), group — раздел окна выбора,
 *  auto — система считает сама (иначе описание для рассказчика), fx — что именно считает; excl — несовместимая черта. */
export const ZULO_GROUPS = ["body", "arms", "senses", "heart", "move"];
export const ZULO_TRAITS = [
  { key: "strigoi", group: "arms", auto: true, icon: "fa-hand-back-fist",
    fx: { weapon: { name: "Когти стрыги", kind: "brawl", damage: 1, strength: true, damageType: "lethal", difficulty: 6 } } },
  { key: "bogatyr", group: "body", auto: true, icon: "fa-dumbbell", fx: { attr: { strength: 3 } } },
  { key: "vurdalak", group: "body", auto: true, icon: "fa-shield-halved", fx: { attr: { stamina: 3 } } },
  { key: "karga", group: "body", auto: true, icon: "fa-person-running", fx: { attr: { dexterity: 3 } } },
  { key: "boyar", group: "senses", auto: true, icon: "fa-face-meh", fx: { keepSocial: true, diff: { social: 2 } } },
  { key: "mizgir", group: "senses", auto: true, icon: "fa-eye", fx: { noFlank: true } },
  { key: "likho", group: "body", auto: true, icon: "fa-up-long", fx: { extraBruised: 2 } },
  { key: "heart", group: "heart", auto: true, icon: "fa-heart", fx: { heart: "hidden" }, excl: "koshchei" },
  { key: "koshchei", group: "heart", auto: true, icon: "fa-heart-circle-bolt", fx: { heart: "caged" }, excl: "heart" },
  { key: "chort", group: "arms", auto: true, icon: "fa-burst", fx: { backSpikes: 2 } },
  { key: "kikimora", group: "move", auto: true, icon: "fa-droplet", fx: { grappledDiff: 2, fireSoak: 1 } },
  { key: "rusalka", group: "move", icon: "fa-water", fx: {} },
  { key: "viy", group: "senses", auto: true, icon: "fa-satellite-dish", fx: { noFlank: true } },
  { key: "navi", group: "arms", icon: "fa-hands", fx: {} },
  { key: "tail", group: "move", icon: "fa-hook", fx: {} },
  { key: "veles", group: "arms", auto: true, icon: "fa-tooth", fx: { biteDamage: 1, biteDiff: -2 } },
  { key: "vodyanoy", group: "arms", auto: true, icon: "fa-gopuram",
    fx: { weapon: { name: "Рога водяного", kind: "brawl", damage: -1, strength: true, damageType: "lethal", difficulty: 6 } } },
  { key: "chud", group: "move", auto: true, icon: "fa-user-secret", fx: { stealthDiff: true } },
  { key: "netopyr", group: "move", icon: "fa-feather-pointed", fx: {} }
];
export const ZULO_KEYS = new Set(ZULO_TRAITS.map(x => x.key));

/** Названия Достоинств и Недостатков хоумрула (data/merits.json, tools/merits_clan_manual.json). */
export const ZULO_MERITS = {
  ossified: "Закостенелый образ",       // Недостаток 2: черты не менять; Путь Метаморфоз +2 опыта за точку
  beastWithout: "Зверь снаружи",        // Недостаток 2: в форме — сдержать Безумие или оседлать волну +1 к сложности
  experiments: "Внутренние эксперименты", // Достоинство 3: при смене — Смекалка + Эмпатия (сл. 6), успех — замена без опыта
  manifest: "Проявление Зверя",         // Достоинство 2–6: +1 черта за каждые 2 очка (до +3)
  adaptation: "Стремительная адаптация"  // Достоинство 4: при превращении — 1 Воля, Смекалка + Выживание (сл. 7), успех — замена
};

/** Включён ли хоумрул (настройка мира «Чудовищный облик»). */
export function zuloOn() {
  try { return game.settings.get(SYSTEM_ID, "horridForm") === "zulo"; } catch { return false; }
}

/** Сколько черт в форме: 3 и по одной за каждые 2 очка «Проявления Зверя» (не больше трёх). */
export function zuloSlots(actor) {
  const m = actor?.items?.find(i => i.type === "merit" && i.name === ZULO_MERITS.manifest);
  return 3 + Math.min(3, Math.floor((Number(m?.system?.cost) || 0) / 2));
}

/** Сохранённый набор черт персонажа (только известные ключи). */
export function zuloTraits(actor) {
  const f = actor?.getFlag?.(SYSTEM_ID, ZULO_FLAG);
  return Array.isArray(f?.traits) ? f.traits.filter(k => ZULO_KEYS.has(k)) : null;
}

/** Случайный набор из n совместимых черт (генератор NPC): несовместимые (Сердце нелюди / Смерть кощея) не вместе. */
export function randomZulo(n = 3, rnd = Math.random) {
  const pool = [...ZULO_TRAITS], out = [];
  while (out.length < n && pool.length) {
    const x = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    if (x.excl && out.includes(x.excl)) continue;
    out.push(x.key);
  }
  return out;
}

/** Встроенные силы формы: Искусство костей (claws, spikes) и свободный список перенесённого — каждая +1 кровь. */
export function zuloBuilt(actor) {
  const f = actor?.getFlag?.(SYSTEM_ID, ZULO_FLAG) ?? {};
  return { bone: (f.bone ?? []).filter(k => ["claws", "spikes"].includes(k)), carried: (f.carried ?? []).map(String).slice(0, 6) };
}

/** Определение эффекта Чудовищного облика из выбранных черт и встроенных сил (data/effects.mjs → effectDef). */
export function zuloDef(base, traits = [], { bone = [], carried = [] } = {}) {
  const list = ZULO_TRAITS.filter(x => traits.includes(x.key));
  const attr = {}, diff = {}, weapons = [];
  let keepSocial = false, biteDamage = 0, biteDiff = 0, extraBruised = 0, stealthDiff = false;
  let noFlank = false, backSpikes = 0, grappledDiff = 0, fireSoak = 0, heart = null;
  for (const { fx } of list) {
    for (const [k, v] of Object.entries(fx.attr ?? {})) attr[k] = (attr[k] ?? 0) + v;
    for (const [k, v] of Object.entries(fx.diff ?? {})) diff[k] = (diff[k] ?? 0) + v;
    if (fx.weapon) weapons.push(fx.weapon);
    keepSocial ||= !!fx.keepSocial;
    stealthDiff ||= !!fx.stealthDiff;
    biteDamage += fx.biteDamage ?? 0;
    biteDiff += fx.biteDiff ?? 0;
    extraBruised += fx.extraBruised ?? 0;
    noFlank ||= !!fx.noFlank;
    backSpikes += fx.backSpikes ?? 0;
    grappledDiff += fx.grappledDiff ?? 0;
    fireSoak += fx.fireSoak ?? 0;
    heart = fx.heart ?? heart;
  }
  // встроенное Искусство костей — как у самой силы (vicissitude:3 в data/effects.mjs)
  if (bone.includes("claws")) weapons.push({ name: "Костяные когти", kind: "brawl", damage: 1, strength: true, damageType: "lethal", difficulty: 6 });
  const spikes = bone.includes("spikes");
  const { attr: _a, brawlDamage: _b, set: _s, ...rest } = base;
  return { ...rest, transformTurns: 1, attr, diff, cost: { blood: 2 + bone.length + carried.length },
    ...(spikes ? { spikes: true, grappleDice: 2 } : {}), zuloBuilt: { bone, carried },
    ...(keepSocial ? {} : { set: { charisma: 0, manipulation: 0, appearance: 0 } }),
    intimStrength: true, weapons, biteDamage, biteDiff, extraBruised, stealthDiff,
    noFlank, backSpikes, grappledDiff, fireSoak, zuloHeart: heart, zulo: list.map(x => x.key) };
}
