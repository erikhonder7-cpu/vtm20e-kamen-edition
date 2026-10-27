// module/config.mjs
// Константы V20: характеристики, способности, Добродетели, здоровье, поколения,
// цены опыта. Справочные данные (Дисциплины, кланы, ритуалы, Пути) лежат в
// data/*.json и подгружаются Codex'ом (module/data/codex.mjs).
//
// Номера в комментариях — файлы справочника books/Мир Тьмы/Вампиры/_справочник/V20_Основные_правила/.

export const SYSTEM_ID = "vtm20e-kamen-edition";
export const SYSTEM_PATH = `systems/${SYSTEM_ID}`;

const L = k => `VTM20.${k}`;

export const VTM20 = {};

/* ── Характеристики (01) ───────────────────────────────────────────────── */

VTM20.attributeGroups = {
  physical: { label: L("AttrGroup.physical"), attributes: ["strength", "dexterity", "stamina"] },
  social:   { label: L("AttrGroup.social"),   attributes: ["charisma", "manipulation", "appearance"] },
  mental:   { label: L("AttrGroup.mental"),   attributes: ["perception", "intelligence", "wits"] }
};
VTM20.attributes = Object.fromEntries(
  Object.values(VTM20.attributeGroups).flatMap(g => g.attributes).map(k => [k, { label: L(`Attr.${k}`) }])
);
/** Физические характеристики, которые можно поднять кровью (05). */
VTM20.bloodBoostable = ["strength", "dexterity", "stamina"];

/* ── Способности (01) ─────────────────────────────────────────────────── */
// В схеме данных есть все ключи; эпоха (настройка мира) решает, какие показывать.
// Эпоха «1789»: Вождение → Верховая езда, Информатика → Богословие,
// Электроника → Военное дело — правило системы, не книги.

VTM20.abilityGroups = {
  talents:    { label: L("AbilGroup.talents") },
  skills:     { label: L("AbilGroup.skills") },
  knowledges: { label: L("AbilGroup.knowledges") }
};

VTM20.abilities = {
  alertness:    { group: "talents" }, athletics:   { group: "talents" }, awareness:  { group: "talents" },
  brawl:        { group: "talents" }, empathy:     { group: "talents" }, expression: { group: "talents" },
  intimidation: { group: "talents" }, leadership:  { group: "talents" }, streetwise: { group: "talents" },
  subterfuge:   { group: "talents" },
  intuition:    { group: "talents", only: "demon" },     // Demon: The Fallen — только у демонов
  animalKen:    { group: "skills" }, crafts:   { group: "skills" }, drive:       { group: "skills", era: "modern" },
  ride:         { group: "skills", era: "revolution" },
  etiquette:    { group: "skills" }, firearms: { group: "skills" }, larceny:     { group: "skills" },
  melee:        { group: "skills" }, performance: { group: "skills" }, stealth:  { group: "skills" },
  survival:     { group: "skills" },
  academics:    { group: "knowledges" }, computer: { group: "knowledges", era: "modern" },
  theology:     { group: "knowledges", era: "revolution" },
  finance:      { group: "knowledges" }, investigation: { group: "knowledges" }, law: { group: "knowledges" },
  medicine:     { group: "knowledges" }, occult: { group: "knowledges" }, politics: { group: "knowledges" },
  science:      { group: "knowledges" }, technology: { group: "knowledges", era: "modern" },
  warfare:      { group: "knowledges", era: "revolution" },
  religion:     { group: "knowledges", only: "demon" }
};
for (const [k, a] of Object.entries(VTM20.abilities)) a.label = L(`Abil.${k}`);

VTM20.eras = {
  modern:     { label: L("Era.modern") },
  revolution: { label: L("Era.revolution") }
};

/** Способности текущей эпохи, по группам, в алфавитном порядке подписи. */
VTM20.abilitiesForEra = (era, type = "") => {
  const out = { talents: [], skills: [], knowledges: [] };
  for (const [k, a] of Object.entries(VTM20.abilities)) {
    if (a.era && a.era !== era) continue;
    if (a.only && a.only !== type) continue;          // Интуиция и Религия — только у демонов
    out[a.group].push(k);
  }
  for (const g of Object.keys(out)) {
    out[g].sort((a, b) => game.i18n.localize(VTM20.abilities[a].label).localeCompare(game.i18n.localize(VTM20.abilities[b].label), "ru"));
  }
  return out;
};

/* ── Добродетели и мораль (01, 06) ────────────────────────────────────── */

VTM20.virtues = {
  conscience:  { label: L("Virtue.conscience"),  alt: "conviction" },
  conviction:  { label: L("Virtue.conviction"),  alt: "conscience" },
  selfControl: { label: L("Virtue.selfControl"), alt: "instinct" },
  instinct:    { label: L("Virtue.instinct"),    alt: "selfControl" },
  courage:     { label: L("Virtue.courage") }
};

/** Столп (bearing): модификатор сложности по значению морали (06). */
VTM20.bearingMod = v => v >= 10 ? -2 : v >= 8 ? -1 : v >= 4 ? 0 : v >= 2 ? 1 : 2;

/** Срок торпора от ран по Человечности/Пути (04). */
VTM20.torporDuration = {
  10: "1 сутки", 9: "3 суток", 8: "1 неделя", 7: "2 недели", 6: "1 месяц", 5: "1 год",
  4: "10 лет", 3: "50 лет", 2: "100 лет", 1: "500 лет", 0: "1000+ лет"
};

/* ── Поколение (05) ───────────────────────────────────────────────────── */
// предел параметра, запас крови, трата за ход
VTM20.generations = {
  3:  { trait: 10, pool: 100, perTurn: 20 },  // «???» в книге — значения системы
  4:  { trait: 9, pool: 50, perTurn: 10 },
  5:  { trait: 8, pool: 40, perTurn: 8 },
  6:  { trait: 7, pool: 30, perTurn: 6 },
  7:  { trait: 6, pool: 20, perTurn: 4 },
  8:  { trait: 5, pool: 15, perTurn: 3 },
  9:  { trait: 5, pool: 14, perTurn: 2 },
  10: { trait: 5, pool: 13, perTurn: 1 },
  11: { trait: 5, pool: 12, perTurn: 1 },
  12: { trait: 5, pool: 11, perTurn: 1 },
  13: { trait: 5, pool: 10, perTurn: 1 },
  14: { trait: 5, pool: 10, perTurn: 1 },
  15: { trait: 5, pool: 10, perTurn: 1 }
};
VTM20.generationOf = g => VTM20.generations[Math.clamp(Number(g) || 13, 3, 15)];

/* ── Здоровье (04) ────────────────────────────────────────────────────── */

VTM20.healthLevels = [
  { key: "bruised",       penalty: 0 },
  { key: "hurt",          penalty: -1 },
  { key: "injured",       penalty: -1 },
  { key: "wounded",       penalty: -2 },
  { key: "mauled",        penalty: -2 },
  { key: "crippled",      penalty: -5 },
  { key: "incapacitated", penalty: null }
];
for (const h of VTM20.healthLevels) h.label = L(`Health.${h.key}`);

VTM20.damageTypes = {
  bashing:    { label: L("Damage.bashing"),    short: L("Damage.bashingShort"),    mark: "/" },
  lethal:     { label: L("Damage.lethal"),     short: L("Damage.lethalShort"),     mark: "X" },
  aggravated: { label: L("Damage.aggravated"), short: L("Damage.aggravatedShort"), mark: "✱" }
};

/** Ступени успеха (03). */
VTM20.successDegrees = { 1: "marginal", 2: "moderate", 3: "complete", 4: "exceptional", 5: "phenomenal" };

/* ── Опыт и свободные пункты (01) ─────────────────────────────────────── */

VTM20.xp = {
  newAbility: 3, newDiscipline: 10, newPath: 7,
  attribute: c => c * 4,
  ability: c => c * 2,
  clanDiscipline: c => c * 5,
  otherDiscipline: c => c * 7,
  caitiffDiscipline: c => c * 6,
  secondaryPath: c => c * 4,
  virtue: c => c * 2,
  morality: c => c * 2,
  willpower: c => c * 1
};
VTM20.freebies = { attribute: 5, ability: 2, discipline: 7, background: 1, virtue: 2, morality: 2, willpower: 1 };
VTM20.creation = {
  attributes: [7, 5, 3], abilities: [13, 9, 5], abilityCap: 3,
  disciplines: 3, backgrounds: 5, virtues: 7, freebies: 15, flawCap: 7
};

/* ── Предметы ─────────────────────────────────────────────────────────── */

VTM20.meritCategories = {
  physical:     { label: L("MeritCat.physical") },
  mental:       { label: L("MeritCat.mental") },
  social:       { label: L("MeritCat.social") },
  supernatural: { label: L("MeritCat.supernatural") },
  // Demon Players Guide: инфернальные, юридические, экономические
  infernal:     { label: L("MeritCat.infernal") },
  legal:        { label: L("MeritCat.legal") },
  economic:     { label: L("MeritCat.economic") }
};

/** Линия черт и Дополнений типа персонажа: вампиры, гули и смертные — общая (""), у демонов своя (data/demon-*.json). */
VTM20.traitLine = type => ["demon", "hunter"].includes(type) ? type : "";

/** Знак типа персонажа (корешок листа, ворота создания, мастер), когда нет герба клана или секты. */
VTM20.typeSigil = type => `systems/vtm20e-kamen-edition/assets/ui/${({ demon: "fallen-sigil", ghoul: "ghoul-sigil", mortal: "mortal-sigil", hunter: "hunter-sigil" })[type] ?? "vampire-sigil"}.svg`;

/** Чем атакуют: пул «Ловкость + …» и подпись. */
VTM20.weaponKinds = {
  brawl:    { label: L("WeaponKind.brawl"),    attribute: "dexterity", ability: "brawl" },
  melee:    { label: L("WeaponKind.melee"),    attribute: "dexterity", ability: "melee" },
  firearms: { label: L("WeaponKind.firearms"), attribute: "dexterity", ability: "firearms" },
  thrown:   { label: L("WeaponKind.thrown"),   attribute: "dexterity", ability: "athletics" }
};

/** Сложность по умолчанию для прочих проверок. */
VTM20.defaultDifficulty = 6;

/* ── Типы акторов ─────────────────────────────────────────────────────── */

VTM20.actorKinds = {
  vampire: { blood: true, disciplines: true, morality: true },
  ghoul:   { blood: true, disciplines: true, morality: true },
  mortal:  { blood: false, disciplines: false, morality: true }
};

/** Иконки Дисциплин (Font Awesome) — по ключу. Остальные получают общую. */
VTM20.disciplineIcons = {
  animalism: "fa-paw", auspex: "fa-eye", celerity: "fa-bolt", chimerstry: "fa-wand-magic-sparkles",
  dementation: "fa-brain", dominate: "fa-hand", fortitude: "fa-shield-halved", necromancy: "fa-skull",
  obfuscate: "fa-mask", obtenebration: "fa-moon", potence: "fa-hand-fist", presence: "fa-crown",
  protean: "fa-dog", quietus: "fa-flask-vial", serpentis: "fa-staff-snake",
  thaumaturgy: "fa-book-skull", vicissitude: "fa-person-rays", bardo: "fa-ankh", valeren: "fa-hand-holding-medical",
  visceratika: "fa-mountain", daimoinon: "fa-fire", koldunism: "fa-wind", melpominee: "fa-music",
  mytherceria: "fa-clover", obeah: "fa-hand-holding-heart", ogham: "fa-tree", flight: "fa-feather",
  sanguinus: "fa-people-group", spiritus: "fa-spa", thanatosis: "fa-bone", temporis: "fa-hourglass-half",
  assamiteSorcery: "fa-khanda", setiteSorcery: "fa-eye-low-vision", darkThaumaturgy: "fa-fire-flame-curved"
};
/** Дисциплины с путями: силы берутся из путей, а не из самой Дисциплины. */
VTM20.pathDisciplines = ["thaumaturgy", "necromancy", "koldunism", "assamiteSorcery", "setiteSorcery", "darkThaumaturgy"];
/** Дисциплины, у которых нет списка сил 1–5: точки — бонус к характеристике (04, Дисциплины/06, 13, 14). */
VTM20.physicalDisciplines = { potence: "strength", celerity: "dexterity", fortitude: "stamina" };

/** Кланы с Привлекательностью 0 (02). */
VTM20.uglyClans = ["nosferatu", "nosferatuAntitribu", "samedi", "gorguli", "predvestnikiCherepov"];
/** Кланы, чей изъян проверяется Самоконтролем/Инстинктами, сл. 6 (02): Восторг, Порок, Жестокость. */
VTM20.weaknessChecks = {
  toreador: "rapture", ravnos: "vice", ravnosAntitribu: "vice", brahmany: "vice", toreadorAntitribu: "cruelty"
};
/** Кланы под ярким светом: −1 кубик, солнце +2 повреждения (02). */
VTM20.lightBane = ["setite", "tlatsik", "zmeiSveta", "voinySeta", "daytya"];
/** Кланы с атавизмами после ярости (02). */
VTM20.atavismClans = ["gangrel", "anda", "moreplavateli", "gorodskieGangrely", "dikieGangrely"];
/** Кланы без родной земли — пулы вдвое (02). */
VTM20.soilClans = ["tzimisce", "kolduny", "staryyKlanTsimishov"];

/* ── Деньги (module/data/money.mjs) ───────────────────────────────────── */
// Ливр: 1 ливр = 20 су = 240 денье (счётная система старого режима), плюс ассигнаты.
VTM20.currencies = {
  livre:  { label: L("Money.Cur.livre"),  symbol: "л.", lsd: true },
  dollar: { label: L("Money.Cur.dollar"), symbol: "$" },
  euro:   { label: L("Money.Cur.euro"),   symbol: "€" },
  pound:  { label: L("Money.Cur.pound"),  symbol: "£" },
  rouble: { label: L("Money.Cur.rouble"), symbol: "₽" }
};

/** Факты биографии только для Сородичей (по англ. названию): гулям и смертным недоступны (V20, гл. 7). */
VTM20.kindredOnlyBackgrounds = ["Domain", "Rituals", "Generation", "Herd", "Status", "Black Hand Membership", "Anarch Status",
  "Memento de Morte", "Clan Prestige", "Age", "Elder Status", "Elder Generation", "Pack Recognition", "Rank", "Anunnaki Status"];
/** Доступен ли факт биографии персонажу этого типа. */
// охотник — и общие факты смертных (линия ""), и свои (линия «hunter»), но не сектантские
VTM20.backgroundAllowed = (b, type) => ((b?.line ?? "") === VTM20.traitLine(type) || (type === "hunter" && !b?.line && !b?.sect && !b?.sabbat))
  && (type === "vampire" || !!b?.line || !VTM20.kindredOnlyBackgrounds.includes(b?.en));
