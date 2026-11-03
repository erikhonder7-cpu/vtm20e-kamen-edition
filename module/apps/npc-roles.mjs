// module/apps/npc-roles.mjs
// Роли генератора НПС: во что персонаж вкладывает точки. Роль задаёт порядок групп характеристик (attr: первая получает
// больше), любимые характеристики и способности (вес), Дисциплины, факты биографии (по английскому названию), Добродетели,
// слова для подбора Даров/Граней/сил и сторону Добродетели охотника; специализация (subs) сдвигает способности и даёт концепцию.
// Веса — строкой «ключ:вес»; чего у типа или эпохи нет (Религия, Загадки), просто не выпадет.

const W = s => Object.fromEntries(String(s ?? "").split(/\s+/).filter(Boolean).map(x => { const [k, v] = x.split(":"); return [k, Number(v ?? 1)]; }));

/**
 * Подвиды роли для эпохи: в 1789-м не выпадают явно современные занятия и те, чьи способности все современные
 * (Вождение, Информатика, Технологии) — правило системы, как и подмена способностей эпохой.
 */
const MODERN_SUBS = new Set(["hacker", "biker", "forensic", "commando"]);
const MODERN_ABIL = ["drive", "computer", "technology"];
export const subsForEra = (role, era) => (role?.subs ?? []).filter(s => era !== "revolution"
  || !(MODERN_SUBS.has(s.key) || Object.keys(s.abil).every(k => MODERN_ABIL.includes(k))));

export const ROLE_GROUPS = [
  { key: "combat", label: "Бой", icon: "fa-hand-fist" },
  { key: "society", label: "Общество", icon: "fa-champagne-glasses" },
  { key: "knowledge", label: "Знание", icon: "fa-book-open" },
  { key: "shadow", label: "Тень", icon: "fa-mask" },
  { key: "mystic", label: "Мистика", icon: "fa-eye" },
  { key: "common", label: "Простые люди", icon: "fa-people-group" }
];

const R = (key, group, label, icon, o) => ({
  key, group, label, icon, attr: o.attr, fav: W(o.fav), abil: W(o.abil), disc: W(o.disc), bg: W(o.bg), virt: W(o.virt),
  words: o.words ?? null, hunt: o.hunt ?? "zeal",
  subs: (o.subs ?? []).map(([k, l, abil, concept]) => ({ key: k, label: l, abil: W(abil), concept: concept ?? l }))
});

export const ROLES = [
  // ── Бой
  R("brute", "combat", "Громила", "fa-hand-fist", { attr: ["physical", "social", "mental"], fav: "strength:3 stamina:2 dexterity:1",
    abil: "brawl:4 intimidation:3 athletics:2 melee:2 alertness:1 streetwise:1", disc: "potence:4 fortitude:3 celerity:2 protean:2 vicissitude:1 serpentis:1",
    bg: "Allies:2 Herd:1 Retainers:1 Kinfolk:1", virt: "courage:3", words: /(когт|ярост|сил[аы]|удар|бой|кулак|клык|рык|мощ)/i,
    subs: [["bouncer", "Вышибала", "brawl:2 intimidation:2"], ["biker", "Байкер", "drive:3 melee:2"], ["pitfighter", "Подпольный боец", "athletics:2 brawl:3"],
      ["thug", "Бандит", "firearms:2 streetwise:2"]] }),
  R("soldier", "combat", "Солдат", "fa-shield-halved", { attr: ["physical", "mental", "social"], fav: "dexterity:2 stamina:2 perception:1",
    abil: "firearms:4 alertness:3 athletics:2 melee:2 survival:2 warfare:2 leadership:1 drive:1 technology:1", disc: "celerity:3 fortitude:3 potence:2 auspex:1",
    bg: "Allies:2 Resources:1 Contacts:1", virt: "courage:2 selfControl:1", words: /(бой|оруж|стрел|защит|битв|воин)/i,
    subs: [["veteran", "Ветеран войны", "warfare:2 survival:2"], ["commando", "Спецназовец", "stealth:2 firearms:2"], ["merc", "Наёмник", "streetwise:2 firearms:2"],
      ["guard", "Охранник", "alertness:3 brawl:1"]] }),
  R("duelist", "combat", "Дуэлянт", "fa-khanda", { attr: ["physical", "social", "mental"], fav: "dexterity:3 wits:1",
    abil: "melee:5 athletics:2 alertness:2 etiquette:2 intimidation:1 brawl:1", disc: "celerity:4 potence:2 auspex:1 fortitude:1",
    bg: "Status:1 Mentor:1 Resources:1", virt: "courage:2 selfControl:1", words: /(клин|когт|удар|скорост|ловк|танц)/i,
    subs: [["fencer", "Фехтовальщик", "melee:2 etiquette:1"], ["knife", "Мастер ножа", "melee:2 stealth:1"], ["bretteur", "Бретёр", "intimidation:2 melee:1"]] }),
  R("tracker", "combat", "Следопыт", "fa-paw", { attr: ["physical", "mental", "social"], fav: "perception:2 dexterity:2 stamina:1",
    abil: "survival:4 animalKen:3 stealth:2 firearms:2 alertness:2 athletics:2 primalUrge:2", disc: "animalism:4 protean:3 auspex:2 obfuscate:1",
    bg: "Allies:1 Kinfolk:2 Totem:1 Contacts:1", virt: "selfControl:2", words: /(зверь|след|чуть|чутьё|охот|запах|зрени|лес)/i,
    subs: [["ranger", "Егерь", "survival:2 firearms:1"], ["poacher", "Браконьер", "stealth:2 larceny:1"], ["handler", "Кинолог", "animalKen:3"]] }),
  R("bodyguard", "combat", "Телохранитель", "fa-user-shield", { attr: ["physical", "mental", "social"], fav: "stamina:2 perception:2",
    abil: "alertness:4 brawl:2 firearms:2 melee:2 drive:2 etiquette:1 empathy:1", disc: "fortitude:4 celerity:2 auspex:2 potence:1",
    bg: "Allies:1 Contacts:1 Resources:1", virt: "selfControl:2 courage:1", words: /(защит|щит|стойк|бдит|чуть)/i,
    subs: [["escort", "Личная охрана", "alertness:2 firearms:1"], ["chauffeur", "Водитель-охранник", "drive:3"], ["elysium", "Страж Элизиума", "etiquette:2 intimidation:1"]] }),

  // ── Общество
  R("socialite", "society", "Светский лев", "fa-champagne-glasses", { attr: ["social", "mental", "physical"], fav: "appearance:2 charisma:2 manipulation:1",
    abil: "etiquette:4 empathy:2 expression:2 performance:2 subterfuge:2 politics:1 finance:1", disc: "presence:5 dominate:1 auspex:1 obfuscate:1 chimerstry:1",
    bg: "Status:2 Contacts:2 Resources:2 Influence:1 Fame:2", virt: "conscience:1", words: /(очаров|облик|красот|голос|убежд|прелест)/i, hunt: "mercy",
    subs: [["aristocrat", "Аристократ", "etiquette:2 politics:1"], ["bohemian", "Звезда богемы", "performance:3 expression:2"],
      ["harpy", "Гарпия", "subterfuge:2 politics:2"], ["courtesan", "Куртизанка", "empathy:2 subterfuge:2"]] }),
  R("schemer", "society", "Интриган", "fa-masks-theater", { attr: ["social", "mental", "physical"], fav: "manipulation:3 wits:1",
    abil: "subterfuge:4 politics:3 empathy:2 etiquette:2 investigation:1 law:1", disc: "dominate:4 presence:3 obfuscate:1 auspex:1 dementation:1",
    bg: "Influence:2 Contacts:2 Status:1", virt: "selfControl:2", words: /(обман|лож|убежд|тай|разум|приказ|воля)/i, hunt: "vision",
    subs: [["politico", "Политик", "politics:3 leadership:1"], ["blackmailer", "Шантажист", "investigation:2 subterfuge:1"], ["courtspy", "Придворный соглядатай", "stealth:2 subterfuge:1"]] }),
  R("leader", "society", "Вожак", "fa-crown", { attr: ["social", "mental", "physical"], fav: "charisma:3 manipulation:1 wits:1",
    abil: "leadership:4 intimidation:2 politics:2 alertness:1 empathy:1 subterfuge:1 brawl:1 melee:1", disc: "dominate:4 presence:4 fortitude:1 potence:1",
    bg: "Retainers:2 Allies:2 Status:2 Influence:1", virt: "courage:2", words: /(вожак|стая|приказ|голос|величи|власт|подчин)/i,
    subs: [["boss", "Босс", "politics:2 finance:1"], ["gangleader", "Атаман банды", "streetwise:2 brawl:1"], ["officer", "Командир", "warfare:2 firearms:1"],
      ["preacher", "Проповедник", "expression:2 theology:2 religion:2"]] }),
  R("broker", "society", "Делец", "fa-coins", { attr: ["social", "mental", "physical"], fav: "manipulation:2 intelligence:1",
    abil: "finance:4 subterfuge:2 etiquette:2 law:2 computer:1 politics:1 streetwise:1", disc: "dominate:2 presence:3 auspex:2 obfuscate:1",
    bg: "Resources:3 Influence:2 Contacts:2 Retainers:1", virt: "selfControl:1", words: /(торг|богат|убежд|удач|сделк)/i, hunt: "vision",
    subs: [["banker", "Банкир", "finance:2 law:1"], ["smuggler", "Контрабандист", "streetwise:2 drive:1 larceny:1"], ["antiquarian", "Антиквар", "academics:2 occult:1"],
      ["fence", "Скупщик краденого", "streetwise:3"]] }),
  R("artist", "society", "Художник", "fa-palette", { attr: ["social", "mental", "physical"], fav: "charisma:1 appearance:1 perception:1",
    abil: "expression:4 performance:3 crafts:3 empathy:2 academics:1 streetwise:1", disc: "presence:4 auspex:3 chimerstry:1 obfuscate:1",
    bg: "Fame:2 Herd:2 Contacts:1", virt: "conscience:2", words: /(песн|голос|красот|видени|образ|сон)/i, hunt: "mercy",
    subs: [["musician", "Музыкант", "performance:3"], ["writer", "Писатель", "expression:3"], ["sculptor", "Ремесленник", "crafts:3"], ["actor", "Актёр", "performance:2 subterfuge:2"]] }),
  R("cleric", "society", "Священник", "fa-cross", { attr: ["social", "mental", "physical"], fav: "charisma:1 perception:1 wits:1",
    abil: "empathy:3 expression:2 theology:3 religion:3 academics:2 leadership:2 occult:1 medicine:1", disc: "presence:2 auspex:3 dominate:1",
    bg: "Herd:2 Allies:1 Status:1", virt: "conscience:3", words: /(вер[аы]|свят|молит|исцел|благ|душ)/i, hunt: "mercy",
    subs: [["priest", "Приходской священник", "empathy:2"], ["inquisitor", "Инквизитор", "investigation:2 intimidation:1"], ["cultist", "Сектант", "subterfuge:2 occult:2"],
      ["monk", "Монах", "crafts:1 academics:2"]] }),

  // ── Знание
  R("scholar", "knowledge", "Учёный", "fa-book-open", { attr: ["mental", "social", "physical"], fav: "intelligence:3 perception:1",
    abil: "academics:4 science:3 investigation:2 occult:1 computer:1 medicine:1 law:1 enigmas:2", disc: "auspex:4 thaumaturgy:2 dominate:1 dementation:1",
    bg: "Mentor:2 Resources:1 Contacts:1 Ancestors:1", virt: "conscience:1 selfControl:1", words: /(знани|памят|разум|загад|предк|язык|мудр)/i, hunt: "vision",
    subs: [["historian", "Историк", "academics:3"], ["naturalist", "Естествоиспытатель", "science:3 technology:1"], ["archivist", "Архивариус", "investigation:2 academics:1"],
      ["professor", "Профессор", "expression:2 leadership:1"]] }),
  R("doctor", "knowledge", "Врач", "fa-staff-snake", { attr: ["mental", "social", "physical"], fav: "intelligence:2 dexterity:1 perception:1",
    abil: "medicine:5 science:2 empathy:2 academics:1 alertness:1", disc: "auspex:3 fortitude:1 thaumaturgy:1 vicissitude:2",
    bg: "Resources:1 Contacts:2 Allies:1", virt: "conscience:2", words: /(исцел|лечен|кров|плот|тел[оа])/i, hunt: "mercy",
    subs: [["surgeon", "Хирург", "medicine:2"], ["medic", "Фельдшер", "drive:1 alertness:2"], ["coroner", "Патологоанатом", "investigation:2 science:1"], ["psychiatrist", "Психиатр", "empathy:3"]] }),
  R("detective", "knowledge", "Сыщик", "fa-magnifying-glass", { attr: ["mental", "physical", "social"], fav: "perception:3 wits:1",
    abil: "investigation:5 alertness:3 streetwise:2 law:2 firearms:2 subterfuge:1 computer:1", disc: "auspex:5 dominate:2 obfuscate:1",
    bg: "Contacts:3 Allies:1 Influence:1", virt: "selfControl:1 courage:1", words: /(чуть|чутьё|зрени|след|правд|видет|истин)/i, hunt: "vision",
    subs: [["cop", "Полицейский", "firearms:2 law:1 drive:1"], ["private", "Частный детектив", "streetwise:2"], ["journalist", "Журналист", "expression:2 computer:1"],
      ["forensic", "Криминалист", "science:2 medicine:1"]] }),
  R("techie", "knowledge", "Технарь", "fa-microchip", { attr: ["mental", "physical", "social"], fav: "intelligence:2 wits:2 dexterity:1",
    abil: "technology:4 computer:4 crafts:3 science:2 drive:1 larceny:1", disc: "auspex:3 obfuscate:2 dominate:1 thaumaturgy:1",
    bg: "Resources:2 Contacts:1", virt: "selfControl:1", words: /(маш|техн|ток|электр|механ|город)/i, hunt: "vision",
    subs: [["hacker", "Хакер", "computer:3"], ["mechanic", "Механик", "crafts:3 drive:2"], ["engineer", "Инженер", "science:2 technology:2"], ["gunsmith", "Оружейник", "crafts:2 firearms:2"]] }),
  R("lawyer", "knowledge", "Законник", "fa-scale-balanced", { attr: ["mental", "social", "physical"], fav: "intelligence:2 manipulation:1 wits:1",
    abil: "law:5 politics:3 subterfuge:2 etiquette:2 finance:1 investigation:1 expression:1", disc: "dominate:3 presence:3 auspex:1",
    bg: "Influence:3 Contacts:2 Resources:1 Status:1", virt: "selfControl:2", words: /(закон|правд|суд|приказ|убежд)/i, hunt: "vision",
    subs: [["attorney", "Адвокат", "law:2 expression:1"], ["official", "Чиновник", "politics:3"], ["judge", "Судья", "leadership:1 law:2"], ["notary", "Нотариус", "finance:2"]] }),

  // ── Тень
  R("thief", "shadow", "Вор", "fa-mask", { attr: ["physical", "mental", "social"], fav: "dexterity:3 wits:1",
    abil: "larceny:5 stealth:4 streetwise:2 athletics:2 alertness:2 subterfuge:1 technology:1", disc: "obfuscate:5 celerity:3 auspex:1 animalism:1",
    bg: "Contacts:2 Resources:1", virt: "selfControl:1", words: /(тен[ьи]|скрыт|тих|незамет|ловк|прыж)/i, hunt: "vision",
    subs: [["pickpocket", "Карманник", "subterfuge:2 larceny:1"], ["burglar", "Взломщик", "technology:2"], ["cat", "Форточник", "athletics:3"], ["cartheif", "Угонщик", "drive:3"]] }),
  R("assassin", "shadow", "Убийца", "fa-skull", { attr: ["physical", "mental", "social"], fav: "dexterity:3 perception:1 wits:1",
    abil: "stealth:4 melee:3 firearms:3 alertness:2 athletics:2 medicine:1 investigation:1", disc: "obfuscate:4 celerity:4 quietus:4 potence:1",
    bg: "Contacts:1 Resources:2", virt: "selfControl:2 courage:1", words: /(смерт|яд|тен[ьи]|клин|убий|скрыт)/i,
    subs: [["hitman", "Киллер", "firearms:2"], ["poisoner", "Отравитель", "medicine:2 science:1"], ["blade", "Клинок во тьме", "melee:2 stealth:1"]] }),
  R("spy", "shadow", "Шпион", "fa-user-secret", { attr: ["mental", "social", "physical"], fav: "perception:2 manipulation:1 wits:2",
    abil: "subterfuge:3 stealth:3 investigation:2 computer:2 alertness:2 etiquette:1 firearms:1 larceny:1", disc: "obfuscate:4 auspex:3 dominate:2 chimerstry:1",
    bg: "Contacts:3 Allies:1", virt: "selfControl:2", words: /(тай|скрыт|обман|облик|подслуш|чуж)/i, hunt: "vision",
    subs: [["informant", "Осведомитель", "streetwise:2"], ["agent", "Агент спецслужб", "firearms:2 law:1"], ["corporate", "Промышленный шпион", "computer:2 finance:1"]] }),
  R("streetrat", "shadow", "Уличный", "fa-road", { attr: ["physical", "social", "mental"], fav: "dexterity:1 wits:2 stamina:1",
    abil: "streetwise:5 brawl:2 larceny:2 stealth:2 survival:2 subterfuge:1 drive:1", disc: "animalism:3 obfuscate:3 celerity:1 potence:1",
    bg: "Contacts:2 Allies:2 Herd:1", virt: "courage:1", words: /(город|улиц|крыс|скрыт|выжив|запах)/i,
    subs: [["homeless", "Бездомный", "survival:3"], ["dealer", "Наркоторговец", "subterfuge:2 finance:1"], ["urchin", "Беспризорник", "athletics:2 larceny:1"], ["punk", "Панк", "performance:1 brawl:2"]] }),

  // ── Мистика
  R("occultist", "mystic", "Оккультист", "fa-book-skull", { attr: ["mental", "social", "physical"], fav: "intelligence:2 perception:2",
    abil: "occult:5 academics:2 awareness:3 investigation:1 rituals:2 enigmas:2 expression:1 theology:1", disc: "thaumaturgy:5 necromancy:4 auspex:3 dementation:2 obtenebration:1",
    bg: "Mentor:2 Herd:1 Rites:2 Fetish:2 Totem:1", virt: "selfControl:1", words: /(дух|видени|ритуал|тай|маги|пророч|умбр|проклят)/i, hunt: "vision",
    subs: [["warlock", "Чернокнижник", "occult:2 intimidation:1"], ["medium", "Медиум", "awareness:3 empathy:1"], ["alchemist", "Алхимик", "science:2 crafts:1"],
      ["kabbalist", "Каббалист", "academics:2 enigmas:1"]] }),
  R("seer", "mystic", "Провидец", "fa-eye", { attr: ["mental", "social", "physical"], fav: "perception:3 wits:1",
    abil: "awareness:4 empathy:3 occult:3 alertness:2 enigmas:2 expression:1", disc: "auspex:5 dementation:2 thaumaturgy:1",
    bg: "Mentor:1 Contacts:1 Ancestors:2", virt: "conscience:1", words: /(видени|пророч|сон|предк|чуть|зрени)/i, hunt: "vision",
    subs: [["fortune", "Гадалка", "subterfuge:2 performance:1"], ["prophet", "Безумный пророк", "expression:2"], ["shaman", "Шаман", "animalKen:2 survival:2"]] }),
  R("beastmaster", "mystic", "Зверовод", "fa-crow", { attr: ["social", "physical", "mental"], fav: "charisma:1 manipulation:1 stamina:1",
    abil: "animalKen:5 survival:3 empathy:2 occult:1 stealth:1 primalUrge:2", disc: "animalism:5 protean:3 auspex:1",
    bg: "Retainers:2 Herd:1 Totem:2 Kinfolk:1", virt: "conscience:1", words: /(зверь|звер|стая|крыс|птиц|речь)/i, hunt: "mercy",
    subs: [["trainer", "Дрессировщик", "animalKen:2 performance:1"], ["vet", "Ветеринар", "medicine:2"], ["ratking", "Повелитель крыс", "streetwise:2 stealth:1"]] }),
  R("madman", "mystic", "Безумец", "fa-face-dizzy", { attr: ["mental", "social", "physical"], fav: "perception:2 wits:1",
    abil: "awareness:3 occult:2 subterfuge:2 empathy:2 stealth:1 performance:1", disc: "dementation:5 obfuscate:2 auspex:3 chimerstry:2",
    bg: "Contacts:1 Herd:1", virt: "courage:1", words: /(безум|видени|страх|сон|бред|хаос)/i, hunt: "vision",
    subs: [["holyfool", "Юродивый", "expression:2 empathy:1"], ["maniac", "Маньяк", "melee:2 stealth:2"], ["fanatic", "Фанатик", "expression:2 religion:2 theology:2"]] }),

  // ── Простые люди
  R("worker", "common", "Работяга", "fa-hammer", { attr: ["physical", "social", "mental"], fav: "strength:1 stamina:2",
    abil: "crafts:4 drive:3 athletics:2 brawl:2 streetwise:1 technology:1", disc: "potence:2 fortitude:3 animalism:1",
    bg: "Allies:2 Contacts:1", virt: "conscience:1 courage:1", words: /(сил|выносл|рук|труд|земл)/i, hunt: "mercy",
    subs: [["docker", "Докер", "athletics:2 brawl:1"], ["cabbie", "Таксист", "drive:3 streetwise:1"], ["builder", "Строитель", "crafts:3"], ["farmer", "Фермер", "survival:2 animalKen:2"]] }),
  R("servant", "common", "Прислуга", "fa-bell-concierge", { attr: ["social", "mental", "physical"], fav: "manipulation:1 perception:1 wits:1",
    abil: "etiquette:3 alertness:2 empathy:2 subterfuge:2 drive:1 crafts:1 medicine:1", disc: "obfuscate:2 auspex:2 fortitude:1 presence:1",
    bg: "Contacts:1 Allies:1 Resources:1", virt: "selfControl:2", words: /(служ|тих|незамет|внимат|памят)/i, hunt: "mercy",
    subs: [["butler", "Дворецкий", "etiquette:2 leadership:1"], ["maid", "Лакей", "stealth:2"], ["secretary", "Секретарь", "computer:2 finance:1"], ["driver", "Шофёр", "drive:3"]] }),
  R("drifter", "common", "Бродяга", "fa-person-hiking", { attr: ["physical", "mental", "social"], fav: "stamina:2 wits:1",
    abil: "survival:3 streetwise:3 alertness:2 drive:2 brawl:1 animalKen:1 subterfuge:1", disc: "animalism:2 protean:2 fortitude:2 obfuscate:1",
    bg: "Contacts:1 Allies:1", virt: "courage:1", words: /(путь|дорог|выжив|ветер|бег)/i,
    subs: [["hitchhiker", "Автостопщик", "drive:1 subterfuge:2"], ["trucker", "Дальнобойщик", "drive:3"], ["vagabond", "Странник", "survival:2 empathy:1"]] })
];

/** Подпись из языка (VTM20.NpcGen.<path>) или русская по умолчанию. */
export const lab = (path, fallback) => { const k = `VTM20.NpcGen.${path}`; return game.i18n.has(k) ? game.i18n.localize(k) : fallback; };

export const roleOf = key => ROLES.find(r => r.key === key) ?? null;

/** Уровни силы: прибавки сверх правил создания (бывалый — словно потратил свободные пункты и опыт). */
export const POWERS = [
  { key: "mook", label: "Статист", icon: "fa-user", attr: [4, 3, 2], abil: [6, 4, 2], abilCap: 3, add: { attr: 0, abil: 0, power: -1, will: -1, bg: -2, virt: -2 }, rank: 1, gen: 13, tier: 0 },
  { key: "normal", label: "Обычный", icon: "fa-user-tie", add: { attr: 0, abil: 0, power: 0, will: 0, bg: 0, virt: 0 }, abilCap: 3, rank: 1, gen: 12, tier: 1 },
  { key: "seasoned", label: "Опытный", icon: "fa-user-graduate", add: { attr: 2, abil: 6, power: 2, will: 1, bg: 2, virt: 1 }, abilCap: 4, rank: 2, gen: 11, tier: 2 },
  { key: "veteran", label: "Ветеран", icon: "fa-user-ninja", add: { attr: 4, abil: 12, power: 4, will: 2, bg: 3, virt: 2 }, abilCap: 4, rank: 3, gen: 10, tier: 3 },
  { key: "legend", label: "Легенда", icon: "fa-dragon", add: { attr: 7, abil: 20, power: 8, will: 3, bg: 5, virt: 3 }, abilCap: 5, rank: 4, gen: 8, tier: 4 }
];
export const powerOf = key => POWERS.find(p => p.key === key) ?? POWERS[1];
