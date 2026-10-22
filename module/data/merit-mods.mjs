// module/data/merit-mods.mjs
// Достоинства и недостатки, которые меняют бросок (V20, Appendix: Merits and Flaws; тексты — data/merits.json).
// Окно проверки находит их у персонажа по названию:
//   auto — правило срабатывает само, когда совпали черты броска или вид проверки;
//   иначе — галочка «по обстоятельствам» (решает игрок с рассказчиком, как у сил Дисциплин).
// diff — к сложности, dice — к пулу. when — к каким броскам относится:
//   attrs / abilities — характеристики и способности пула; kinds — вид проверки (frenzy, rotschreck, virtue…);
//   group — группа характеристик (social, physical, mental); willOrVirtue — проверки Воли и Добродетелей.

export const MERIT_MODS = {
  // ── физические
  "Знакомое лицо":        { diff: -1, when: { group: "social" }, hint: "при первой встрече с незнакомцем; не для запугивания" },
  "Кошачья грация":       { diff: -2, when: { attrs: ["dexterity"], abilities: ["athletics"] }, hint: "равновесие" },
  "Мордоворот":           { diff: -1, when: { abilities: ["intimidation"] }, hint: "против того, кто ещё не показал силу" },
  "Чуткое восприятие":    { diff: -2, when: { attrs: ["perception"] }, hint: "выбранным чувством" },
  "Чарующий голос":       { diff: -2, when: { group: "social" }, hint: "убеждение, очарование, приказ голосом" },
  "Каскадёр":             { dice: 3, when: { group: "physical" }, hint: "очень рискованное небоевое действие (сл. 8+)" },
  "Могильный запах":      { diff: 1, when: { group: "social" }, hint: "со смертными" },
  "Тугоухость":           { diff: 2, when: { attrs: ["perception"] }, hint: "на слух" },
  "Плохое зрение":        { diff: 2, when: { attrs: ["perception"] }, hint: "зрением" },
  "Уродство":             { diff: 2, auto: true, when: { group: "social", notAbilities: ["intimidation"] } },
  "Одноглазый":           { diff: 2, when: { attrs: ["perception"] }, hint: "зрением (глазомер, стрельба — +1)" },
  "Кровоточащая рана":    { diff: 1, when: { group: "social" }, hint: "с теми, кто видит рану" },
  "Лень":                 { diff: 1, when: { group: "physical" }, hint: "внезапное, неподготовленное действие" },
  "Ребёнок":              { diff: 2, when: { abilities: ["leadership", "intimidation"] }, hint: "командуя взрослыми" },
  "Глухота":              { diff: 3, when: { attrs: ["perception"] }, hint: "на слух" },
  "Слепота":              { diff: 2, auto: true, when: { attrs: ["dexterity"] } },
  // ── ментальные
  "Рефлексия":            { dice: 2, when: { attrs: ["perception"] }, hint: "против той же Натуры или Маски" },
  "Холодная логика":      { diff: -1, when: { group: "mental" }, hint: "трезвая оценка фактов" },
  "Кодекс чести":         { dice: 2, when: { willOrVirtue: true }, hint: "ради соблюдения кодекса" },
  "Компьютерщик":         { diff: -2, auto: true, when: { abilities: ["computer"] } },
  "Полиглот":             { dice: 3, when: { group: "mental" }, hint: "чужой язык" },
  "Спокойный":            { dice: 2, auto: true, when: { kinds: ["frenzy"] } },
  "Дефект речи":          { diff: 2, when: { group: "social" }, hint: "устная речь" },
  "Кошмары":              { dice: -1, when: {}, hint: "провалил проверку Воли после пробуждения — до конца ночи" },
  "Робость":              { diff: 2, when: { group: "social" }, hint: "с незнакомцами (в центре внимания +3)" },
  "Вспыльчивость":        { diff: 2, auto: true, when: { kinds: ["frenzy"] } },
  "Ходячий стереотип":    { diff: 2, when: { group: "social" }, hint: "с вампирами, не разделяющими эпатаж" },
  // ── социальные
  "Бывший гуль":          { diff: -1, when: { group: "social" }, hint: "с неонатами, знание вампирских реалий" },
  "Знаток Шабаша":        { diff: -1, when: { attrs: ["perception"] }, hint: "деятельность Шабаша, засады" },
  "Прирождённый лидер":   { dice: 2, auto: true, when: { abilities: ["leadership"] } },
  "Протеже":              { diff: -1, when: { group: "social" }, hint: "со знакомыми сира" },
  "Знаток врагов":        { diff: -2, when: {}, hint: "небоевое действие против изученного врага" },
  "Восходящая звезда":    { diff: -1, when: { group: "social" }, hint: "со сторонниками во фракции" },
  "Знаток подземелий":    { diff: -1, when: {}, hint: "подземелья, катакомбы, канализация" },
  "Друг клана":           { diff: -2, when: { group: "social" }, hint: "с членами дружественного клана" },
  "Пащенок":              { diff: 1, when: { group: "social" }, hint: "с неонатами" },
  "Спесь":                { diff: 2, when: { group: "social" }, hint: "с оскорблёнными им" },
  "Ссора сиров":          { diff: 2, when: { kinds: ["frenzy"] }, hint: "рядом с соперником сира" },
  "Украденное дитя":      { diff: 2, when: { kinds: ["frenzy"] }, hint: "рядом с «украденным»" },
  "Доносчик":             { diff: 1, when: { group: "social" }, hint: "с противниками покровителя" },
  "Враг клана":           { diff: 2, when: { group: "social" }, hint: "с членами враждебного клана" },
  "Посмешище":            { diff: 2, when: { group: "social" }, hint: "в Элизиуме (вне его +1)" },
  // ── сверхъестественные
  "Холодный ветер":       { diff: 1, when: { group: "social" }, hint: "со смертными" },
  "Зерцало смерти":       { diff: 2, auto: true, when: { attrs: ["perception"] } },
  "Зловещее присутствие": { diff: 2, when: { group: "social" }, hint: "со смертными" },
  "Рок":                  { dice: -1, when: {}, hint: "ночь видения судьбы (снять — 1 Воля)" }
};

/** Подходит ли правило к броску. */
function fits(when, { attrs, abilities, kind, groups, willOrVirtue }) {
  if (when.kinds && !when.kinds.includes(kind)) return false;
  if (when.attrs && !when.attrs.some(a => attrs.includes(a))) return false;
  if (when.abilities && !when.abilities.some(a => abilities.includes(a))) return false;
  if (when.notAbilities && when.notAbilities.some(a => abilities.includes(a))) return false;
  if (when.group && !groups.includes(when.group)) return false;
  if (when.willOrVirtue && !willOrVirtue) return false;
  return true;
}

/**
 * Черты персонажа, относящиеся к броску: { auto: [{label, diff, dice}], situ: [{label, diff, dice, hint}] }.
 * @param {Actor} actor
 * @param {object} roll { traits: ["attributes.x", "abilities.y"], kind, attributeGroups }
 */
export function meritModsFor(actor, { traits = [], kind = "check", attributeGroups = {} } = {}) {
  const names = new Set(actor.items.filter(i => i.type === "merit" || i.type === "flaw").map(i => i.name));
  const attrs = traits.filter(p => p?.startsWith("attributes.")).map(p => p.split(".")[1]);
  const abilities = traits.filter(p => p?.startsWith("abilities.")).map(p => p.split(".")[1]);
  const groups = Object.entries(attributeGroups).filter(([, g]) => attrs.some(a => g.attributes?.includes(a))).map(([k]) => k);
  const willOrVirtue = traits.some(p => p?.startsWith("willpower") || p?.startsWith("virtues"));
  const ctx = { attrs, abilities, kind, groups, willOrVirtue };
  const out = { auto: [], situ: [] };
  for (const [name, m] of Object.entries(MERIT_MODS)) {
    if (!names.has(name) || !fits(m.when, ctx)) continue;
    // общие (без условий) — только по обстоятельствам и только если в броске есть черты
    if (!Object.keys(m.when).length && !traits.some(Boolean)) continue;
    (m.auto ? out.auto : out.situ).push({ label: name, diff: m.diff ?? 0, dice: m.dice ?? 0, hint: m.hint ?? "" });
  }
  return out;
}
