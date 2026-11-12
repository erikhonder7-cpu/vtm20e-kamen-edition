// module/apps/creator/rules.mjs
// Числа и таблицы мастера создания: очки по типу персонажа, возрасты, секты, подсказки шагов — без логики.

/** Числа создания по типу персонажа. */
export const RULES = {
  vampire: { attr: [7, 5, 3], abil: [13, 9, 5], disc: 3, bg: 5, virt: 7, free: 15,
    cost: { attr: 5, abil: 2, disc: 7, bg: 1, virt: 2, morality: 2, will: 1 } },
  ghoul: { attr: [6, 4, 3], abil: [11, 7, 4], disc: 1, bg: 5, virt: 7, free: 21,
    cost: { attr: 5, abil: 2, disc: 10, bg: 1, virt: 2, morality: 1, will: 1 } },
  mortal: { attr: [6, 4, 3], abil: [11, 7, 4], disc: 0, bg: 5, virt: 7, free: 21,
    cost: { attr: 5, abil: 2, disc: 0, bg: 1, virt: 2, morality: 1, will: 1 } },
  // Demon: The Fallen, гл. 6: Знания 3 (слот disc), Добродетели — по точке и ещё 3, Вера 3 (слот morality), 15 свободных
  demon: { attr: [7, 5, 3], abil: [13, 9, 5], disc: 3, bg: 5, virt: 3, free: 15,
    cost: { attr: 5, abil: 2, disc: 7, bg: 1, virt: 2, morality: 6, will: 1 } },
  // Привязанный к Земле (Earthbound, гл. 3): Знаний 10 пунктов, Потребности в слотах Добродетелей (по точке и ещё 3), Вера 4, 21 свободный
  earthbound: { attr: [8, 6, 4], abil: [17, 12, 7], disc: 10, bg: 10, virt: 3, free: 21,
    cost: { attr: 6, abil: 2, disc: 5, bg: 1, virt: 3, morality: 5, will: 1 } },
  // Охотник (Hunter: The Reckoning, гл. 4): Добродетели охоты с нуля, 3 очка (слоты: Милосердие, Прозрение, Рвение), Убеждённость
  // по кредо (слот morality, 1 за точку, не выше 8), Воля 3; Добродетели свободными пунктами не покупаются
  hunter: { attr: [6, 4, 3], abil: [11, 7, 4], disc: 0, bg: 5, virt: 3, free: 21,
    cost: { attr: 5, abil: 2, disc: 0, bg: 1, virt: 0, morality: 1, will: 1 } },
  // Слуга падшего (Damned and Deceived, гл. 4): Добродетели падших по точке и ещё 3, Вера слуги 1 (слот morality, 7 за точку), 15 свободных
  thrall: { attr: [6, 4, 3], abil: [11, 7, 4], disc: 0, bg: 5, virt: 3, free: 15,
    cost: { attr: 5, abil: 2, disc: 0, bg: 1, virt: 2, morality: 7, will: 1 } },
  // Гару и Фера (W20, гл. 3): Факты 5, три Дара 1-го уровня (свой шаг), Добродетелей и морали нет; Ярость по аугурии,
  // Гнозис по породе, Воля по племени; 15 бонусных: Атрибут 5, Способность 2, Факт 1, Дар 7, Ярость 1, Гнозис 2, Воля 1
  werewolf: { attr: [7, 5, 3], abil: [13, 9, 5], disc: 0, bg: 5, virt: 0, free: 15,
    cost: { attr: 5, abil: 2, disc: 0, bg: 1, virt: 0, morality: 0, will: 1, rage: 1, gnosis: 2, gift: 7 } },
  // Маг (M20, гл. 6): Факты 7, Сферы 6 (на месте Дисциплин: слот disc), Арете 1 (слот morality, до 3 при создании), Воля 5;
  // 15 свободных: Атрибут 5, Способность 2, Факт 1, Сфера 7, Арете 4, Воля 1. Добродетелей и Человечности нет.
  mage: { attr: [7, 5, 3], abil: [13, 9, 5], disc: 6, bg: 7, virt: 0, free: 15,
    cost: { attr: 5, abil: 2, disc: 7, bg: 1, virt: 0, morality: 4, will: 1, quint: 1 } },  // quint: 1 пункт — 4 Квинтэссенции
  // Призрак (Wraith 20, гл. 4): Арканои 5 (слот disc, не больше 3 в одном), Фоны 7, Страсти и Оковы — свой шаг, Воля 5, Пафос 5 + Мемориум;
  // 15 свободных: Атрибут 5, Арканос 5, Воля 2, Способность 2, Страсть 2 (pas), Фон 1, Оковы 1 (fet), Пафос — 1 за 2 точки
  // Подменыш (C20, гл. 3): Искусства 3 и Царства 5 — на слоте disc (8, раздельная проверка), Фоны 5, Гламур — слот morality (3 за точку),
  // Воля 1; Искусство 5 и Царство 2 за точку — creator/changeling.mjs (clDiscFreeCost)
  changeling: { attr: [7, 5, 3], abil: [13, 9, 5], disc: 8, bg: 5, virt: 0, free: 15,
    cost: { attr: 5, abil: 2, disc: 5, bg: 1, virt: 0, morality: 3, will: 1 } },
  wraith: { attr: [7, 5, 3], abil: [13, 9, 5], disc: 5, bg: 7, virt: 0, free: 15,
    cost: { attr: 5, abil: 2, disc: 5, bg: 1, virt: 0, morality: 0, will: 2, pathos: 1, pas: 2, fet: 1, trade: -1 } }
};
/** Шаги, где у мага свой текст подсказки (ключ + «Mage»). */
export const MAGE_HINTS = new Set(["disciplines", "advantages", "freebies"]);
/** Слава Гару: Слава, Честь, Мудрость. */
export const RENOWN = ["glory", "honor", "wisdom"];
/** Слуге нельзя: Высокое положение, Наследие, Договоры, Совершенство; знание ритуалов — удел падших. */
export const THRALL_BANNED = ["Eminence", "Legacy", "Pacts", "Paragon", "Ritual Knowledge"];
/** Начальная Вера падшего. */
export const DEMON_FAITH = 3;

/** Возраст в Крови и опыт сверх создания (01: неонат 0–35, анцилла 75–220, старейшина 250–600). */
export const TIERS = {
  fledgling: { xp: 0 }, neonate: { xp: 35 }, ancilla: { xp: 120 }, elder: { xp: 300 }
};

export const SECTS = [
  { key: "camarilla", label: "Sect.camarilla" }, { key: "sabbat", label: "Sect.sabbat" },
  { key: "anarchs", label: "Sect.anarchs" }, { key: "independent", label: "Sect.independent" },
  { key: "autarkis", label: "Sect.autarkis" }
];

/**
 * Поправки создания по секте (только вампиры). Шабаш — Guide to the Sabbat (1999), гл. 3: 4 точки клановых
 * Дисциплин (пандеры — любых), фактов биографии нет — только за свободные пункты, 5 точек Добродетелей.
 * Анархи — V20 Anarchs Unbound: числа V20, свои факты биографии, архетипы и черты (в данных с пометкой секты).
 * Камарилья — Guide to the Camarilla, гл. 3: числа V20, но внеклановые Дисциплины независимых и Шабаша недоступны.
 */
export const SECT_RULES = { sabbat: { disc: 4, bg: 0, virt: 5 } };
export const CAMARILLA_BANNED = ["chimerstry", "melpominee", "mytherceria", "necromancy", "obeah", "obtenebration", "quietus",
  "serpentis", "thanatosis", "visceratika", "vicissitude"];

export const STEP_HINTS = {
  concept: "ConceptHint", clan: "ClanHint", house: "HouseHint", garou: "GarouHint", mage: "MageHint", gifts: "GiftsHint", attributes: "AttrHintShort", abilities: "AbilHintShort",
  wraith: "WraithHint", passions: "PassionsHint", shadow: "ShadowHint", changeling: "ChangelingHint",
  disciplines: "DiscHint", advantages: "AdvHint", edges: "EdgesHint", bloodrights: "BloodrightsHint", merits: "MeritHint", freebies: "FreeHint", xp: "XpHint", pact: "PactHint", summary: "FinishHint"
};
/** Сколько Даров у рода Фера на старте, если не три (W20 Changing Breeds: Мокол — аспект и общий, Рокеа — общий и аугурии). */
export const FERA_START_GIFTS = { mokole: 2, rokea: 2 };
/** Шаги, где у гуля свой текст подсказки (ключ + «Ghoul»). */
export const GHOUL_HINTS = new Set(["concept", "disciplines", "summary"]);
/** Шаги, где у демона свой текст подсказки (ключ + «Demon»). */
export const DEMON_HINTS = new Set(["concept", "disciplines", "advantages", "freebies", "summary"]);
// у Привязанного свои подсказки: Знания с Тёмными, Потребности вместо Добродетелей, 21 пункт, Мука 10
export const EB_HINTS = new Set(["disciplines", "advantages", "freebies", "summary"]);
export const THRALL_HINTS = new Set(["concept", "advantages", "freebies", "summary"]);
export const HUNTER_HINTS = new Set(["concept", "advantages", "freebies", "summary"]);
/** Шаги, где у призрака свой текст подсказки (ключ + «Wraith»). */
export const WRAITH_HINTS = new Set(["concept", "disciplines", "advantages", "freebies", "summary"]);
/** Шаги, где у подменыша свой текст подсказки (ключ + «Changeling»). */
export const CHANGELING_HINTS = new Set(["concept", "disciplines", "advantages", "freebies", "summary"]);
export const GAROU_HINTS = new Set(["concept", "abilities", "advantages", "freebies", "xp", "summary"]);
/** Слоты Добродетелей мастера → Добродетели охоты. */
export const HUNTER_SLOTS = { conscience: "mercy", selfControl: "vision", courage: "zeal" };
/** Свидетель (Players Guide, гл. 1): свои Добродетели в тех же слотах — Рассудок, Самоконтроль, Смелость. */
export const LOST_SLOTS = { conscience: "reason", selfControl: "selfControl", courage: "courage" };
/** Достоинство, делающее одну Дисциплину клановой (V20, Appendix: Merits and Flaws), — по английскому имени. */
export const EXTRA_DISC_MERIT = "Additional Discipline";

/** Текст без тегов: теги — пробелом (абзацы не слипаются), перед знаком препинания пробел не нужен. */
export const plain = html => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/ ([,.;:!?»)])/g, "$1").trim();
/** Начало текста не длиннее n знаков, с многоточием. */
export const preview = (html, n) => { const s = plain(html); return s.length > n ? s.slice(0, n).replace(/[\s.,;:—-]+$/, "") + "…" : s; };
/** Примесь: геттеры и методы класса-части — в прототип мастера (линейки лежат по своим файлам). */
export const mix = (Target, Part) => { for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(Part.prototype))) if (k !== "constructor") Object.defineProperty(Target.prototype, k, d); };
