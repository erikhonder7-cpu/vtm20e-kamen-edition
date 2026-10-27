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
const DAC = "V20 Dark Ages Companion, гл. 8", DA_M = "Тёмные века — холодное", DA_R = "Тёмные века — стрелковое и метательное";
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

  // ── Тёмные века (era: "darkAges" — только с настройкой «Контент из Dark Ages») ──
  // DA Companion, гл. 8 (мечи, древковое, дистанционное — таблицы целые); топоры, булавы и молоты — V20 Dark Ages,
  // гл. 12 (в Companion эта таблица повреждена). «ББ» книги — пробитие брони; недобор Силы — +1 к сложности за точку.
  ...[
    { name: "Нож", damage: 0, conceal: "в кармане", min: 1, src: DAC },
    { name: "Кинжал / короткий меч", damage: 1, conceal: "под плащом", min: 1, pierce: 2, src: DAC, note: "Мизерикорд, сакс, гладиус. Парирование: сложность 5." },
    { name: "Эсток", damage: 2, conceal: "нельзя", min: 2, pierce: 3, src: DAC, note: "Колющий меч XIV в. При Мощи может пригвоздить жертву к стене, но не обездвиживает, как кол." },
    { name: "Фальшион / мессер", damage: 2, conceal: "под широкой одеждой", min: 2, src: DAC },
    { name: "Рыцарский меч", damage: 2, conceal: "нельзя", min: 2, src: DAC, note: "Обычно со щитом. Парирование: сложность 6, +1 к сложности атаки (только в рукопашной)." },
    { name: "Длинный меч", damage: 3, conceal: "нельзя", min: 3, src: DAC, note: "«Боевой» меч: в одной или двух руках." },
    { name: "Сайф / шамшир", damage: 2, conceal: "нельзя", min: 2, src: DAC, note: "Короче других мечей." },
    { name: "Ручной топор", damage: 2, conceal: "под плащом", min: 3, src: DA },
    { name: "Боевой топор", damage: 4, conceal: "нельзя", min: 4, src: DA, note: "Двуручный." },
    { name: "Кирка", damage: 2, conceal: "нельзя", min: 4, pierce: 3, src: DA },
    { name: "Дубина", damage: 2, type: "bashing", conceal: "под широкой одеждой", min: 2, src: DA },
    { name: "Булава", damage: 2, conceal: "под плащом", min: 3, pierce: 2, src: `${DA}; ${DAC}`, note: "Против доспеха класса 4+ урон дробящий." },
    { name: "Моргенштерн", damage: 3, conceal: "под плащом", min: 3, src: DA },
    { name: "Цеп", damage: 1, type: "bashing", conceal: "под широкой одеждой", min: 2, src: DAC, note: "+1 к сложности защиты противника." },
    { name: "Клевец", damage: 1, conceal: "нельзя", min: 2, pierce: 2, src: DAC, note: "Одноручный боевой молот с клювом." },
    { name: "Боевой молот", damage: 4, type: "bashing", conceal: "нельзя", min: 4, src: DA, note: "Двуручный." },
    { name: "Глефа", damage: 3, conceal: "нельзя", min: 2, src: DAC, pole: true },
    { name: "Алебарда", damage: 3, conceal: "нельзя", min: 3, pierce: 1, src: DAC, pole: true, note: "XIV в. −1 к сложности обезоруживания." },
    { name: "Секира на древке", damage: 4, conceal: "нельзя", min: 3, src: DAC, pole: true, note: "−1 к сложности обезоруживания." },
    { name: "Копьё", damage: 2, conceal: "нельзя", min: 2, src: DAC, pole: true, note: "Можно метать (кроме очень длинных)." },
    { name: "Копьё всадника", damage: 4, conceal: "нельзя", min: 3, pierce: 3, src: DAC, pole: true, note: "Верхом; пешим — как копьё." },
    { name: "Двуручный молот", damage: 5, type: "bashing", conceal: "нельзя", min: 4, pierce: 2, src: DAC, pole: true,
      note: "Каждый ход — рефлекторный бросок Сила + Атлетика или 1 действие, чтобы удержать замах." },
    { name: "Крестьянский цеп", damage: 3, type: "bashing", conceal: "нельзя", min: 3, pierce: 1, src: DAC, pole: true, note: "+1 к сложности парирования противника." },
    { name: "Посох", damage: 2, type: "bashing", conceal: "нельзя", min: 2, src: DAC, pole: true, note: "+2 куба к подсечке вместо +1." },
    { name: "Баклер", damage: 1, type: "bashing", conceal: "под широкой одеждой", min: 1, src: DAC, note: "Малый щит. Парирование: сложность 4, без штрафа к атаке." },
    { name: "Щит", damage: 2, type: "bashing", conceal: "нельзя", min: 2, src: DAC, diff: 7, note: "Парирование: сложность 6, +1 к сложности атаки; как оружие — +1 к сложности." },
    { name: "Павеза", damage: 2, type: "bashing", conceal: "нельзя", min: 3, src: DAC, diff: 8,
      note: "Ростовой щит. Парирование: сложность 7, +1 к сложности атаки; как оружие — +2 к сложности. Установленная в землю — хорошее укрытие для одного." }
  ].map(w => ({ group: DA_M, era: "darkAges", name: w.name, kind: "melee", damage: w.damage, strength: true, damageType: w.type ?? "lethal",
    difficulty: w.diff ?? 6, pierce: w.pierce ?? 0, concealment: w.conceal, source: w.src,
    description: p([`Минимальная Сила ${w.min}.`, w.pole && "Древковое: двуручное (одной рукой — Мин. Сила +2), +1 куб к подсечке.", w.note].filter(Boolean).join(" ")) })),
  ...[
    { name: "Лук", damage: 2, range: "54", rate: "1", min: 2, pierce: 2, src: DAC, note: "Составной — верхом без штрафа; простой — верхом +2 к сложности." },
    { name: "Длинный лук", damage: 4, range: "108", rate: "1", min: 4, pierce: 4, src: DA },
    { name: "Арбалет", damage: 3, range: "81", rate: "1 за 2 хода", min: 2, pierce: 2, src: DAC, note: "Перезарядка 1 ход, только пешим. Болт годится как кол в сердце." },
    { name: "Тяжёлый арбалет", damage: 4, range: "81", rate: "1 за 6 ходов", min: 3, pierce: 3, src: DAC, note: "Перезарядка 5 ходов минус точки Стрельбы из лука." },
    { name: "Праща", damage: 3, type: "bashing", range: "36", rate: "1", min: 2, src: DA, conceal: "в кармане" },
    { name: "Праща на древке", damage: 4, type: "bashing", range: "45", rate: "1", min: 3, src: DAC }
  ].map(w => ({ group: DA_R, era: "darkAges", name: w.name, kind: "firearms", damage: w.damage, strength: false, damageType: w.type ?? "lethal",
    difficulty: 6, pierce: w.pierce ?? 0, range: w.range, rate: w.rate, clip: "1", concealment: w.conceal ?? "нельзя", source: w.src,
    description: p([`Минимальная Сила ${w.min}. Удвоенная дальность — +1 к сложности, утроенная — +2.`, w.note].filter(Boolean).join(" ")) })),
  ...[
    { name: "Метательный кинжал", damage: 1, range: "18", conceal: "под плащом", min: 1 },
    { name: "Метательный нож", damage: 0, range: "14", conceal: "в кармане", min: 1 },
    { name: "Дарт", damage: 1, range: "27", conceal: "под широкой одеждой", min: 1, note: "Тяжёлая метательная стрела." },
    { name: "Метательная дубинка", damage: 2, type: "bashing", range: "27", conceal: "под широкой одеждой", min: 2 },
    { name: "Метательный топор", damage: 1, range: "18", conceal: "под плащом", min: 2 },
    { name: "Дротик", damage: 2, range: "45", conceal: "нельзя", min: 2 },
    { name: "Метательное копьё", damage: 2, range: "36", conceal: "нельзя", min: 3 },
    { name: "Камень", damage: 0, type: "bashing", range: "36", conceal: "в кармане", min: 1 }
  ].map(w => ({ group: DA_R, era: "darkAges", name: w.name, kind: "thrown", damage: w.damage, strength: true, damageType: w.type ?? "lethal",
    difficulty: 6, range: w.range, concealment: w.conceal, source: DAC, description: p([`Минимальная Сила ${w.min}.`, w.note].filter(Boolean).join(" ")) })),

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

const ERA_A = "1789 — броня", V20A = "Наше время — броня (V20)", DA_A = "Тёмные века — доспехи";
export const ARMOR_PRESETS = [
  { group: ERA_A, name: "Плотная одежда (класс I)", rating: 1, penalty: 0, source: `${CORE}; ${DA}`, description: p("Сюртук из толстого сукна, кожаный жилет.") },
  { group: ERA_A, name: "Колет буйволовой кожи (класс II)", rating: 2, penalty: 1, source: `${CORE}; ${DA}`, description: p("Кожаный колет или стёганый поддоспешник.") },
  { group: ERA_A, name: "Нагрудник (класс III)", rating: 3, penalty: 1, source: `${CORE}; ${DA}`, description: p("Кираса без наспинника, как у офицеров и жандармов.") },
  { group: ERA_A, name: "Кираса кирасира (класс IV)", rating: 4, penalty: 2, source: `${CORE}; ${DA}`, description: p("Нагрудник с наспинником и шлем тяжёлой кавалерии.") },
  { group: ERA_A, name: "Старинные латы (класс V)", rating: 5, penalty: 3, source: `${CORE}; ${DA}`, description: p("Рыцарский доспех из чьей-то фамильной коллекции.") },
  // Тёмные века: доспех торса по классам (DA Companion, гл. 8); шлем и конечности — в описании, штрафы не складываются
  ...[
    [1, 1, 0, "Стёганка (класс 1)", "Гамбезон."],
    [2, 2, 1, "Кюир-бульи (класс 2)", "Варёная кожа или сюрко с пластинами."],
    [3, 3, 1, "Стёганка и кюир-бульи (класс 3)", "Стёганка под варёной кожей или сюрко с пластинами."],
    [4, 4, 2, "Кольчуга (класс 4)", "Стёганка и кольчуга."],
    [5, 5, 3, "Кольчуга с пластинами (класс 5)", "Стёганка, кольчуга и сюрко с пластинами; или стёганка и бригантина, «пластинчатый плащ», ламеляр."],
    [6, 6, 3, "Латы (класс 6)", "Стёганка, кольчуга и бригантина/пластины/ламеляр; или стёганка и кираса. На Западе — не раньше XIV в.; полные латы снижают штраф до 2."]
  ].map(([, rating, penalty, name, text]) => ({ group: DA_A, era: "darkAges", name, rating, penalty, source: "V20 Dark Ages Companion, гл. 8; V20 Dark Ages, гл. 12",
    description: p(`${text} Класс доспеха — защита торса; удар в незащищённую конечность — прицельная атака. Штрафы к инициативе и Ловкости дают только доспех торса и шлем, и не складываются: берётся худший. Шлемы и защита конечностей — тех же классов 1–6.`) })),
  { group: V20A, name: "Защитная одежда (класс I)", rating: 1, penalty: 0, source: CORE },
  { group: V20A, name: "Бронированная одежда (класс II)", rating: 2, penalty: 1, source: CORE },
  { group: V20A, name: "Лёгкий бронежилет (класс III)", rating: 3, penalty: 1, source: CORE },
  { group: V20A, name: "Армейский бронежилет (класс IV)", rating: 4, penalty: 2, source: CORE },
  { group: V20A, name: "Тяжёлая полицейская броня (класс V)", rating: 5, penalty: 3, source: CORE }
];

// Готовое снаряжение (вкладка «Снаряжение»): что даёт в бросках — ориентир для рассказчика по общему правилу
// инструментов: подходящий инструмент — обычная сложность, подручный — +1–2, без него задача может стать невозможной
// («Охотник: Расплата», прил. 2, импровизация; V20, гл. 4 — темнота и свет). Свет, огонь и святыни — по правилам типов.
const G89 = "1789 — снаряжение", GNOW = "Наше время — снаряжение", GHUNT = "Охотник — снаряжение";
const TOOLS = "общее правило инструментов", HTR = "Охотник: Расплата, прил. 2";
export const GEAR_PRESETS = [
  // ── 1789 ──
  { group: G89, name: "Масляный фонарь", quantity: 1, source: TOOLS, description: p("Свет на несколько шагов: снимает штрафы за темноту рядом. Открытый огонь — Сородичам страшно (проверка Ротшрека), разбитый фонарь поджигает.") },
  { group: G89, name: "Свечи и огниво", quantity: 6, source: TOOLS, description: p("Тусклый свет одной комнаты; огниво высекает огонь за ход, на ветру и в сырости — бросок Смекалки.") },
  { group: G89, name: "Верёвка (15 м)", quantity: 1, source: TOOLS, description: p("Лазание, связывание, спуск. Связать сопротивляющегося — Ловкость + Драка против Силы + Атлетики.") },
  { group: G89, name: "Набор отмычек", quantity: 1, source: TOOLS, description: p("Замки — Ловкость + Воровство. Без отмычек (шпилька, гвоздь) — сложность +2.") },
  { group: G89, name: "Подзорная труба", quantity: 1, source: TOOLS, description: p("Восприятие на дальнее расстояние без штрафа за дальность; в темноте бесполезна.") },
  { group: G89, name: "Лекарский саквояж", quantity: 1, source: TOOLS, description: p("Ланцеты, корпия, бинты, лауданум: Интеллект + Медицина без штрафа. Без инструментов — сложность +2.") },
  { group: G89, name: "Письменный прибор", quantity: 1, source: TOOLS, description: p("Перо, чернила, бумага, сургуч — записки, подделки (Интеллект + Подделка/Экспрессия), донесения.") },
  { group: G89, name: "Плащ с капюшоном", quantity: 1, source: TOOLS, description: p("Скрывает оружие «под плащом» и лицо: узнать в толпе — сложность +1.") },
  { group: G89, name: "Карнавальная маска", quantity: 1, source: TOOLS, description: p("Скрывает лицо на балу и в толпе: узнать — сложность +2, но маска сама привлекает взгляды на улице.") },
  { group: G89, name: "Карманные часы", quantity: 1, source: TOOLS, description: p("Точное время — не опоздать к рассвету.") },
  // ── Наше время ──
  { group: GNOW, name: "Фонарик", quantity: 1, source: TOOLS, description: p("Узкий луч: снимает штрафы за темноту там, куда светит.") },
  { group: GNOW, name: "Мощный фонарь", quantity: 1, source: TOOLS, description: p("Слепит на ход того, кому светят в глаза (Восприятие с +2 к сложности). Для Грани «Вспышка» — 5 кубов урона.") },
  { group: GNOW, name: "Аптечка", quantity: 1, source: TOOLS, description: p("Первая помощь — Интеллект + Медицина без штрафа; без неё — сложность +2.") },
  { group: GNOW, name: "Набор отмычек", quantity: 1, source: TOOLS, description: p("Замки — Ловкость + Воровство (Безопасность). Самодельные из заколок — сложность +1–2.") },
  { group: GNOW, name: "Бинокль", quantity: 1, source: TOOLS, description: p("Восприятие на дальнее расстояние без штрафа за дальность.") },
  { group: GNOW, name: "Прибор ночного видения", quantity: 1, source: TOOLS, description: p("Видно в темноте; яркая вспышка ослепляет на ход.") },
  { group: GNOW, name: "Мобильный телефон", quantity: 1, source: TOOLS, description: p("Связь, камера, карта. Оставляет след — его можно отследить.") },
  { group: GNOW, name: "Фотоаппарат", quantity: 1, source: TOOLS, description: p("Доказательства. Сородичи на снимках — смазанные пятна (Маскарад).") },
  { group: GNOW, name: "Полицейский сканер", quantity: 1, source: TOOLS, description: p("Слушать переговоры полиции — узнать, кто едет и куда.") },
  { group: GNOW, name: "Рации (пара)", quantity: 2, source: TOOLS, description: p("Связь на несколько кварталов без сотовой сети.") },
  { group: GNOW, name: "Наручники", quantity: 1, source: TOOLS, description: p("Вырваться — Сила, сложность 8, нужно 3 успеха (сверхъестественная сила — проще).") },
  { group: GNOW, name: "Монтировка", quantity: 1, source: TOOLS, description: p("Вскрыть дверь — Сила + Атлетика без штрафа; в бою — как дубинка.") },
  // ── Охотник ──
  { group: GHUNT, name: "Сумка «на выход»", quantity: 1, source: HTR, description: p("То, что советуют брать в спешке: пара ножей и топорик, фонарь и фонарик с запасными батарейками, аптечка, молоток, плоскогубцы, шоколад и сладкая вода, наличные.") },
  { group: GHUNT, name: "Паяльная горелка", quantity: 1, source: HTR, description: p("Управляемый огонь вблизи: огонь пугает почти любую тварь и ранит её; держать пламя — Ловкость + Фехтование. Аэрозоль с зажигалкой — короче и опаснее для самого охотника.") },
  { group: GHUNT, name: "Сигнальный факел", quantity: 3, source: HTR, description: p("Яркий свет на несколько минут; для Грани «Вспышка» — 3 куба урона.") },
  { group: GHUNT, name: "Запасные батарейки", quantity: 4, source: HTR, description: p("Фонарь не гаснет в самый неподходящий миг.") },
  { group: GHUNT, name: "Наличные", quantity: 1, source: HTR, description: p("Автобус, мотель, машина напрокат — без следа по карте.") },
  { group: GHUNT, name: "Святыня веры", quantity: 1, source: "Охотник: Расплата, прил. 2; Demon: The Fallen, гл. 9", description: p("Крест, звезда Давида, чётки. Наделённому сила не от неё; у смертного с Истинной верой — благословлённый предмет (см. «Вера против падших»).") }
];
