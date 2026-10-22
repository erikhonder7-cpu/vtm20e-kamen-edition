// module/data/equipment.mjs
// Готовое оружие и броня: заготовки на листе (вкладка «Снаряжение») и компендиум
// «Оружие и броня» (tools/build_packs.mjs собирает его отсюда).
//
// Эпоха 1789 — числа из книг двадцатилетней линейки, а не придуманные:
//   · M20 Victorian Age, гл. 8 — кремнёвые пистолеты, мушкет, штуцер, мушкетон, шпага,
//     кавалерийская сабля, штык, трость-шпага, вилы, коса (пробитие брони оттуда же);
//   · V20 Dark Ages, гл. 12 — кинжал, копьё и пика, алебарда, метательное, классы брони;
//   · V20, гл. 4 — нож, меч, топор, дубинка, кол, арбалет.
// Дальность переведена из ярдов в метры (×0,9). «1 за 3 хода» — выстрел раз в три хода:
// до патронных боеприпасов заряжание занимает ходы (Victorian Age).
// Пули и болты по вампиру наносят лёгкие повреждения, кроме выстрела в голову (V20, гл. 4) —
// это учитывает бой, когда у атаки есть цель.

const ERA_M = "1789 — холодное оружие", ERA_R = "1789 — стрелковое и метательное";
const V20M = "Наше время — холодное (V20)", V20R = "Наше время — стрелковое (V20)";
const VA = "M20 Victorian Age, гл. 8", DA = "V20 Dark Ages, гл. 12", CORE = "V20, гл. 4";
const p = text => `<p>${text}</p>`;

export const WEAPON_PRESETS = [
  // ── 1789: холодное ──────────────────────────────────────────────────────
  { group: ERA_M, name: "Шпага", kind: "melee", damage: 2, strength: true, damageType: "lethal", difficulty: 6, pierce: 2, concealment: "под плащом", source: VA,
    description: p("Смолл-сворд, оружие дворянина и дуэлянта. Колющий удар пробивает 2 точки брони; рубящий наносит только лёгкие повреждения.") },
  { group: ERA_M, name: "Кавалерийская сабля", kind: "melee", damage: 4, strength: true, damageType: "lethal", difficulty: 6, concealment: "нельзя", source: VA,
    description: p("Тяжёлый рубящий клинок гусар и драгун.") },
  { group: ERA_M, name: "Палаш", kind: "melee", damage: 2, strength: true, damageType: "lethal", difficulty: 6, concealment: "под плащом", source: CORE,
    description: p("Прямой меч кирасира или пехотного офицера — «меч» таблиц V20.") },
  { group: ERA_M, name: "Кинжал", kind: "melee", damage: 1, strength: true, damageType: "lethal", difficulty: 6, pierce: 2, concealment: "под камзолом", source: DA,
    description: p("Можно метать (до 18 м). Годится как парирующее оружие: сложность парирования 5.") },
  { group: ERA_M, name: "Нож", kind: "melee", damage: 1, strength: true, damageType: "lethal", difficulty: 6, concealment: "в кармане", source: CORE },
  { group: ERA_M, name: "Штык (примкнутый)", kind: "melee", damage: 2, strength: true, damageType: "lethal", difficulty: 6, pierce: 3, concealment: "нельзя", source: `${VA}; урон как у копья — ${DA}`,
    description: p("Надевается на мушкет. Колющий удар пробивает 3 точки брони. Длинное оружие: у противника с более коротким −1 куб к атаке (V20, гл. 4).") },
  { group: ERA_M, name: "Пика", kind: "melee", damage: 2, strength: true, damageType: "lethal", difficulty: 6, pierce: 2, concealment: "нельзя", source: DA,
    description: p("Оружие санкюлотов и национальных гвардейцев. Двумя руками при Силе 3+ — урон Сила +3. Длинное оружие: у противника с более коротким −1 куб к атаке.") },
  { group: ERA_M, name: "Алебарда", kind: "melee", damage: 4, strength: true, damageType: "lethal", difficulty: 7, concealment: "нельзя", source: DA,
    description: p("Двуручная, сложность атаки 7. Оружие швейцарской гвардии.") },
  { group: ERA_M, name: "Топор", kind: "melee", damage: 3, strength: true, damageType: "lethal", difficulty: 6, concealment: "нельзя", source: CORE },
  { group: ERA_M, name: "Вилы", kind: "melee", damage: 2, strength: true, damageType: "lethal", difficulty: 6, pierce: 3, concealment: "нельзя", source: VA,
    description: p("Пробивают 3 точки брони. При провале ломаются.") },
  { group: ERA_M, name: "Коса", kind: "melee", damage: 2, strength: true, damageType: "lethal", difficulty: 6, concealment: "нельзя", source: VA,
    description: p("Нужно место для замаха. При провале ломается или ранит союзника.") },
  { group: ERA_M, name: "Трость-шпага", kind: "melee", damage: 2, strength: true, damageType: "lethal", difficulty: 6, pierce: 1, concealment: "трость", source: VA,
    description: p("Клинок в трости. Колющий удар пробивает 1 точку брони.") },
  { group: ERA_M, name: "Трость", kind: "melee", damage: 1, strength: true, damageType: "bashing", difficulty: 6, concealment: "трость", source: VA },
  { group: ERA_M, name: "Дубинка", kind: "melee", damage: 1, strength: true, damageType: "bashing", difficulty: 6, concealment: "в кармане", source: CORE,
    description: p("Дробящее: лёгкие повреждения, в голову (прицельно) — тяжёлые.") },
  { group: ERA_M, name: "Кол", kind: "melee", damage: 1, strength: true, damageType: "lethal", difficulty: 6, concealment: "под плащом", source: CORE,
    description: p("Кол в сердце: сложность 9, нужно ≥ 3 повреждений — вампир парализован, пока кол не вынут.") },
  { group: ERA_M, name: "Кастет", kind: "brawl", damage: 1, strength: true, damageType: "bashing", difficulty: 6, concealment: "в кармане", source: "Players Guide 2nd (пересчёт: +1 куб к удару)" },

  // ── 1789: стрелковое и метательное ─────────────────────────────────────
  { group: ERA_R, name: "Кремнёвый пистолет", kind: "firearms", damage: 5, strength: false, damageType: "lethal", difficulty: 6, range: "7", rate: "1 за 3 хода", clip: "1", concealment: "под камзолом", source: VA,
    description: p("Дуэльный пистолет. Заряжание занимает ходы. При провале ствол разрывает в руках: 5 кубов тяжёлых повреждений стрелку.") },
  { group: ERA_R, name: "Карманный пистолет", kind: "firearms", damage: 4, strength: false, damageType: "lethal", difficulty: 6, range: "2", rate: "1", clip: "1", concealment: "в кармане", source: VA,
    description: p("Крошечный кремнёвый пистоль, легко спрятать. Один выстрел.") },
  { group: ERA_R, name: "Мушкет «Шарлевиль»", kind: "firearms", damage: 6, strength: false, damageType: "lethal", difficulty: 6, range: "110", rate: "1 за 4 хода", clip: "1", concealment: "нельзя", source: `${VA} (как «Браун Бесс»)`,
    description: p("Пехотное ружьё французской армии. Со штыком. При провале — осечка: ружьё не стреляет до чистки.") },
  { group: ERA_R, name: "Штуцер", kind: "firearms", damage: 7, strength: false, damageType: "lethal", difficulty: 6, range: "145", rate: "1 за 3 хода", clip: "1", concealment: "нельзя", source: `${VA} (кремнёвая винтовка)`,
    description: p("Нарезное ружьё егерей. При провале — осечка до чистки.") },
  { group: ERA_R, name: "Мушкетон", kind: "firearms", damage: 7, strength: false, damageType: "lethal", difficulty: 6, range: "9", rate: "1 за 4 хода", clip: "1", concealment: "под плащом", source: `${VA} (бландербасс)`,
    description: p("Короткое ружьё с раструбом, бьёт картечью. При провале разрывается в руках: 5 кубов тяжёлых повреждений.") },
  { group: ERA_R, name: "Арбалет", kind: "firearms", damage: 5, strength: false, damageType: "lethal", difficulty: 6, range: "20", rate: "1 за 5 ходов", clip: "1", concealment: "под плащом", pierce: 2, source: `${CORE}; пробитие — ${DA}`,
    description: p("Перезарядка 5 ходов. Болт годится как кол в сердце (сложность 9, ≥ 3 повреждений). По вампиру не в голову и не в сердце — лёгкие.") },
  { group: ERA_R, name: "Метательный нож", kind: "thrown", damage: 1, strength: true, damageType: "lethal", difficulty: 6, range: "18", concealment: "под камзолом", source: DA },
  { group: ERA_R, name: "Топорик", kind: "thrown", damage: 1, strength: true, damageType: "lethal", difficulty: 6, range: "18", concealment: "под плащом", source: DA,
    description: p("Можно и рубить в ближнем бою.") },
  { group: ERA_R, name: "Камень", kind: "thrown", damage: 0, strength: true, damageType: "bashing", difficulty: 6, range: "36", concealment: "в кармане", source: DA },

  // ── Наше время (V20, гл. 4) ────────────────────────────────────────────
  { group: V20M, name: "Бита", kind: "melee", damage: 2, strength: true, damageType: "bashing", difficulty: 6, concealment: "под плащом", source: CORE,
    description: p("Дробящее: лёгкие повреждения, в голову (прицельно) — тяжёлые.") },
  { group: V20M, name: "Меч", kind: "melee", damage: 2, strength: true, damageType: "lethal", difficulty: 6, concealment: "под плащом", source: CORE },
  { group: V20R, name: "Лёгкий револьвер", kind: "firearms", damage: 4, strength: false, damageType: "lethal", difficulty: 6, range: "12", rate: "3", clip: "6", concealment: "в кармане", source: CORE },
  { group: V20R, name: "Тяжёлый револьвер", kind: "firearms", damage: 6, strength: false, damageType: "lethal", difficulty: 6, range: "35", rate: "2", clip: "6", concealment: "под курткой", source: CORE },
  { group: V20R, name: "Лёгкий пистолет", kind: "firearms", damage: 4, strength: false, damageType: "lethal", difficulty: 6, range: "20", rate: "4", clip: "15+1", concealment: "в кармане", source: CORE },
  { group: V20R, name: "Тяжёлый пистолет", kind: "firearms", damage: 5, strength: false, damageType: "lethal", difficulty: 6, range: "25", rate: "3", clip: "13+1", concealment: "под курткой", source: CORE },
  { group: V20R, name: "Винтовка", kind: "firearms", damage: 8, strength: false, damageType: "lethal", difficulty: 6, range: "200", rate: "1", clip: "3+1", concealment: "нельзя", source: CORE },
  { group: V20R, name: "Дробовик", kind: "firearms", damage: 8, strength: false, damageType: "lethal", difficulty: 6, range: "20", rate: "1", clip: "5+1", concealment: "под плащом", source: CORE }
];

const ERA_A = "1789 — броня", V20A = "Наше время — броня (V20)";
export const ARMOR_PRESETS = [
  { group: ERA_A, name: "Плотная одежда (класс I)", rating: 1, penalty: 0, source: `${CORE}; ${DA}`, description: p("Сюртук из толстого сукна, кожаный жилет.") },
  { group: ERA_A, name: "Колет буйволовой кожи (класс II)", rating: 2, penalty: 1, source: `${CORE}; ${DA}`, description: p("Кожаный колет или стёганый поддоспешник.") },
  { group: ERA_A, name: "Нагрудник (класс III)", rating: 3, penalty: 1, source: `${CORE}; ${DA}`, description: p("Кираса без наспинника, как у офицеров и жандармов.") },
  { group: ERA_A, name: "Кираса кирасира (класс IV)", rating: 4, penalty: 2, source: `${CORE}; ${DA}`, description: p("Нагрудник с наспинником и шлем тяжёлой кавалерии.") },
  { group: ERA_A, name: "Старинные латы (класс V)", rating: 5, penalty: 3, source: `${CORE}; ${DA}`, description: p("Рыцарский доспех из чьей-то фамильной коллекции.") },
  { group: V20A, name: "Защитная одежда (класс I)", rating: 1, penalty: 0, source: CORE },
  { group: V20A, name: "Бронированная одежда (класс II)", rating: 2, penalty: 1, source: CORE },
  { group: V20A, name: "Лёгкий бронежилет (класс III)", rating: 3, penalty: 1, source: CORE },
  { group: V20A, name: "Армейский бронежилет (класс IV)", rating: 4, penalty: 2, source: CORE },
  { group: V20A, name: "Тяжёлая полицейская броня (класс V)", rating: 5, penalty: 3, source: CORE }
];
