// module/data/merit-mods.mjs
// Достоинства и недостатки, которые меняют бросок (V20, Appendix: Merits and Flaws; тексты — data/merits.json).
// Окно проверки находит их у персонажа по названию:
//   auto — правило срабатывает само, когда совпали черты броска или вид проверки;
//   иначе — галочка «по обстоятельствам» (решает игрок с рассказчиком, как у сил Дисциплин).
// diff — к сложности, dice — к пулу. when — к каким броскам относится:
//   attrs / abilities — характеристики и способности пула; kinds — вид проверки (frenzy, rotschreck, virtue…);
//   group — группа характеристик (social, physical, mental); willOrVirtue — проверки Воли и Добродетелей.

import { VTM20 } from "../config.mjs";

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
  "Рок":                  { dice: -1, when: {}, hint: "ночь видения судьбы (снять — 1 Воля)" },
  // ── дополнение (обход 4.1.7): черты из «Системы» текстов — сами (auto) или галочкой по обстоятельствам
  "Перевозбуждённый":     { diff: 2, auto: true, when: { attrs: ["perception"] } },
  "Вне фазы":             { diff: 2, auto: true, when: { attrs: ["perception"] } },
  "Нашествие демонов":    { diff: 1, auto: true, when: { attrs: ["perception"] } },
  "Нарушенное чувство":   { diff: 3, when: { attrs: ["perception"] }, hint: "этим чувством" },
  "Хрупкое тело":         { diff: 2, auto: true, when: { group: "physical" } },
  "Хрупкие кости":        { diff: 1, when: { attrs: ["stamina"] }, hint: "поглощение урона" },
  "Чуждое совершенство":  { diff: -3, auto: true, when: { attrs: ["appearance"] } },
  "Близкородственность":  { diff: 1, auto: true, when: { attrs: ["appearance"] }, hint: "за 3 очка — +2 к уместным проверкам" },
  "Тёмная аура":          { diff: 2, auto: true, when: { group: "social", notAbilities: ["intimidation"] } },
  "Жуткое присутствие":   { diff: 2, when: { group: "social", notAbilities: ["intimidation"] }, hint: "со смертными" },
  "Мастер Маскарада":     { diff: -1, when: { group: "social" }, hint: "со смертными" },
  "Окутан тенью":         { diff: 1, when: { group: "social" }, hint: "с другими вампирами (особенно Ласомбра)" },
  "Каменный язык":        { diff: 2, when: { group: "social" }, hint: "где важна речь" },
  "Огромная пасть":       { diff: 2, when: { group: "social" }, hint: "где важна речь: выступления, тонкие ритуалы" },
  "Деревенский идиот":    { diff: 2, auto: true, when: { abilities: ["expression", "leadership"] } },
  "Измученный художник":  { diff: 1, when: { group: "social" }, hint: "когда его хвалят или уважают" },
  "Затворник":            { dice: -2, when: { group: "social" }, hint: "с не-Тремер" },
  "Недоказавший":         { dice: -3, when: { group: "social" }, hint: "с другими Ласомбра" },
  "Живая тень":           { dice: -2, when: { group: "social" }, hint: "с Ласомбра, знающими о проблеме" },
  "Незаконное Становление": { diff: 2, when: { group: "social" }, hint: "дела линии Вестников Черепов" },
  "Диаблерист, известный": { diff: 3, when: { group: "social" }, hint: "со старейшинами, знающими о диаблерии" },
  "Диаблерист, тайный":   { diff: 3, when: { group: "social" }, hint: "если диаблерия раскрыта — со старейшинами" },
  "Судимость (версия Vampire Players Guide 2003)": { diff: 2, when: { group: "social" }, hint: "с теми, кто знает о прошлом" },
  "Стигматы":             { diff: 1, when: { group: "social" }, hint: "с теми, кто знает о стигматах (вариант за 2 очка)" },
  "Нет тени/отражения":   { diff: 1, when: { group: "social" }, hint: "рядом с персонажем; +2 — если заметили, в чём дело" },
  "Неуместный":           { diff: 1, when: { group: "social" }, hint: "когда ведёт себя неуместно" },
  "Клеймо":               { diff: 2, when: { group: "social" }, hint: "по цене: 3 — +1/+2, 4 — +2/+3, 5 — +3" },
  "Конструкт":            { dice: -2, when: { group: "social" }, hint: "кто видит искусственное происхождение" },
  "Долг Обязанности":     { diff: 1, when: {}, hint: "задачи, связанные с долгом" },
  "Гарпия":               { diff: -1, when: { group: "social" }, hint: "в официальном качестве (Элизиум)" },
  "Общество святых и героев": { diff: -1, when: { group: "social" }, hint: "упомянув знаменитость" },
  "Преданность клана Трофея": { diff: -2, when: { group: "social" }, hint: "с кланом Трофея, знающим о подвиге" },
  "Экстатик":             { dice: 1, when: { group: "social" }, hint: "с Обществом Леопольда" },
  "Внедрённый агент":     { dice: 1, when: { abilities: ["empathy", "leadership", "investigation"] }, hint: "с сотрудниками своего ведомства" },
  "Корпоративный волк":   { dice: 2, when: {}, hint: "манипулирование корпорацией или её сотрудником" },
  "Мастер прессы":        { dice: 2, when: { group: "social" }, hint: "с журналистами" },
  "Мастер слова":         { dice: 2, when: { abilities: ["expression"] }, hint: "где важны формулировки" },
  "Сердцеед":             { dice: 2, when: { group: "social" }, hint: "намеренный флирт" },
  "Великий лжец":         { dice: 2, when: { group: "social" }, hint: "ради обмана" },
  "Тёмная триада":        { dice: 3, auto: true, when: { attrs: ["manipulation", "charisma"] } },
  "Внушительный вид":     { dice: 2, auto: true, when: { abilities: ["intimidation"] } },
  "Природный лидер":      { dice: 2, when: { abilities: ["leadership"] }, hint: "когда действительно руководит людьми" },
  "Прирождённый политик": { dice: 2, when: { attrs: ["manipulation"] }, hint: "политическая игра" },
  "Наблюдательный в обществе": { dice: 2, when: { attrs: ["perception"] }, hint: "наблюдение за людьми" },
  "Неприметный":          { dice: 2, when: { group: "social" }, hint: "основанные на неприметности" },
  "Престиж":              { dice: 3, when: { group: "social" }, hint: "влияние на выбранную группу" },
  "Ученик Лазаря / Иафета": { dice: 2, when: { group: "social" }, hint: "ссылаясь на Лазаря или Иафета" },
  "Культурный хамелеон":  { dice: 2, when: { attrs: ["perception"] }, hint: "заметить чужака в своей среде" },
  "Любитель новинок":     { dice: 2, when: { abilities: ["technology"] }, hint: "незнакомое устройство" },
  "Сорвиголова":          { dice: 3, when: { group: "physical" }, hint: "рискованный небоевой трюк" },
  "Сопротивление ядам":   { dice: 2, when: { attrs: ["stamina"] }, hint: "против яда" },
  "Гибкие суставы":       { diff: -2, when: { attrs: ["dexterity"] }, hint: "гибкость" },
  "Однорукий":            { dice: -2, when: { group: "physical" }, hint: "двуручное действие" },
  "Гуль":                 { dice: 1, auto: true, when: { abilities: ["brawl"] } },
  "Тяжёлые руки":         { diff: -1, when: {}, hint: "урон в безоружном бою" },
  "Прикосновение мороза": { diff: 1, auto: true, when: { abilities: ["stealth"] } },
  "Железная воля":        { dice: 3, when: { willOrVirtue: true }, hint: "защищая убеждения; против магии Разума, пыток" },
  "Невозмутимый":         { dice: 2, when: { willOrVirtue: true }, hint: "сохранить спокойствие" },
  "Верность":             { dice: 2, when: { willOrVirtue: true }, hint: "против переманивания" },
  "Упорный":              { dice: 2, when: {}, hint: "когда его переубеждают" },
  "Непоколебимый":        { dice: 2, when: {}, hint: "когда его переубеждают" },
  "Фаталист":             { diff: -2, when: { willOrVirtue: true }, hint: "проверка деградации" },
  "Посвящённый Дороги":   { diff: 1, auto: true, when: { kinds: ["frenzy", "rotschreck"] } },
  "Редкое предпочтение витэ": { diff: 2, when: {}, hint: "охота" },
  "Высокая цена":         { dice: 2, when: {}, hint: "проверки, связанные с Дисциплинами" },
  "Долгосрочное планирование": { diff: -2, when: {}, hint: "раз за встречу — действие «часть плана»" },
  "Паранормальная связь": { diff: -3, when: {}, hint: "расшифровка тайных обрядов и кодов сообщества" },
  "Оккультная библиотека": { diff: -1, when: { group: "mental" }, hint: "при доступе к библиотеке" },
  "Передовая техника":    { diff: -1, when: {}, hint: "применение устройств" },
  "Мастер протокола":     { diff: -1, when: { abilities: ["etiquette"] }, hint: "по своим специализациям" },
  "Духовный наставник":   { dice: 1, when: {}, hint: "сопротивление проклятиям" },
  "Природный лингвист":   { dice: 3, when: {}, hint: "речь и письмо на известных языках" },
  "Связь с убежищем":     { dice: 1, when: {}, hint: "в основном убежище" },
  "Высшая цель":          { dice: 2, when: {}, hint: "ради Высшей цели" },
  "Низкая самооценка":    { dice: -2, when: {}, hint: "не верит в успех (отметил сам — −1)" },
  "Приговорён к смерти":  { dice: -1, when: { group: "mental" }, hint: "отвлечённость — по решению рассказчика" },
  "Тёмная судьба":        { dice: -1, when: {}, hint: "не потратил Волю на предвестие — до конца дня" },
  "Не терпит боли":       { dice: -1, when: {}, hint: "ранен (сверх штрафов за раны)" },
  "Низкий болевой порог": { dice: -1, when: {}, hint: "ранен (сверх штрафов за раны)" },
  "Аллергия":             { dice: -5, when: {}, hint: "аллерген в крови — 10 минут" },
  "Душа Тьмы":            { diff: 1, when: {}, hint: "проверки Дороги (за 3 очка — +2)" },
  "Хоровая выучка":       { dice: 2, when: {}, hint: "совместно с другой обладательницей" },
  "Чутьё Фуги":           { dice: 2, when: {}, hint: "следующее действие после вслушивания в Фугу" },
  "Сердце воина":         { dice: 2, when: {}, hint: "силы Валерена 1–2" },
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

/**
 * Механика черты словами: что меняет, к каким броскам, пояснение, сама ли срабатывает.
 * @returns {{what:string, where:string, hint:string, auto:boolean}|null}
 */
export function describeMeritMod(name) {
  const m = MERIT_MODS[name];
  if (!m) return null;
  const L = (k, d) => d ? game.i18n.format(`VTM20.FxTab.${k}`, d) : game.i18n.localize(`VTM20.FxTab.${k}`);
  const loc = k => game.i18n.localize(k);
  const signed = n => n > 0 ? `+${n}` : `${n}`;
  const w = m.when ?? {};
  const where = [...(w.attrs ?? []).map(k => loc(VTM20.attributes[k]?.label ?? k)), ...(w.abilities ?? []).map(k => loc(VTM20.abilities[k]?.label ?? k)),
    w.group && L(`Group.${w.group}`), ...(w.kinds ?? []).map(k => L(`Kind.${k}`)), w.willOrVirtue && L("WillOrVirtue")].filter(Boolean).join(", ");
  const what = [m.dice && L("Dice", { n: signed(m.dice) }), m.diff && L("DiffShort", { n: signed(m.diff) })].filter(Boolean).join(", ");
  return { what, where: where || L("AnyRoll"), hint: m.hint ?? "", auto: !!m.auto };
}
