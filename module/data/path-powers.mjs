// module/data/path-powers.mjs
// Пути Тауматургии (уровни 1–5) — таблица механики для apps/target-powers.mjs. Только данные.
// Бросок пути (V20, гл. 4): Воля, сложность — уровень + 3, 1 кровь (ownRoll — когда текст силы задаёт свой пул).
// Поля:
//   kind: "cond" — эффект на цели; "self" — эффект на себе; "summon" — существо на сцену; "info" — только строка в чат;
//   resist: сопротивление цели — { pool: [черты], diff: число | "casterWP" | { sum: [черты тауматурга] } | { base, plus: "succ" },
//     mode: "net" (успехи цели вычитаются) | "beat" (нужно больше успехов, иначе полностью) | "atrophy" (таблица Атрофии) };
//   fx: что делает эффект — diceAll, diceSocial (кубы), diffPhys, diffAll, diffSocial (сложность), attr ({ черта: ± }),
//     attrSet ({ черта: значение }), statuses, dot ({ type, soak }) — урон в конце хода цели, blood (крови теряет), note;
//   dur: срок — код ("scene", "hour", "night", …) или список по успехам; "manual" — снимается вручную;
//   ask: что спросить перед наложением (limb — какая конечность, attr — какой Атрибут, split — распределить точки).
// Где в тексте силы срока нет — «до конца сцены» (правило системы).

export const PATH_POWERS = {
  // ── Власть над смертной оболочкой ──
  "thaumaturgy|Vertigo": { kind: "cond", needTarget: true, fx: { diffPhys: 1 }, dur: "scene" },
  "thaumaturgy|Contortion": { kind: "cond", needTarget: true, ask: "limb", dur: "scene" },
  "thaumaturgy|Seizure": { kind: "cond", needTarget: true, fx: { diffPhys: 2, dot: { type: "bashing", soak: true } }, dur: "scene" },
  "thaumaturgy|Body Failure": { kind: "cond", needTarget: true, fx: { diffAll: 2, dot: { type: "lethal", soak: "kindred" } }, dur: "scene",
    resist: { pool: ["stamina", "fortitude"], diff: "casterWP", mode: "shorten" } },
  "thaumaturgy|Marionette": { kind: "cond", needTarget: true, fx: { note: "Marionette" }, dur: "scene", casterFx: { diffAll: 2 },
    resist: { pool: ["stamina", "fortitude"], diff: "casterWP", mode: "shorten", needFortitude: true } },
  // ── Путь Совращения ──
  "thaumaturgy|Contradict": { kind: "info", needTarget: true, resist: { pool: ["perception", "subterfuge"], diff: { base: 2, plus: "succ" }, mode: "contradict" } },
  "thaumaturgy|Subvert": { kind: "cond", needTarget: true, fx: { note: "Subvert" }, dur: ["scene", "hour", "night", "3nights", "week"],
    resist: { pool: ["perception", "subterfuge"], diff: { sum: ["manipulation", "subterfuge"] }, mode: "net" } },
  "thaumaturgy|Dissociate": { kind: "cond", needTarget: true, fx: { diceSocial: -3, note: "Dissociate" }, dur: ["scene", "hour", "night", "3nights", "week"],
    resist: { pool: ["willpower"], diff: { sum: ["manipulation", "empathy"] }, mode: "net" } },
  "thaumaturgy|Addiction": { kind: "cond", needTarget: true, fx: { note: "Addiction" }, dur: "manual",
    resist: { pool: ["perception", "subterfuge"], diff: { base: 3, plus: "succ" }, mode: "beat" } },
  "thaumaturgy|Dependence": { kind: "cond", needTarget: true, fx: { note: "Dependence" }, dur: "succNights",
    resist: { pool: ["selfControl"], diff: { base: 3, plus: "succ" }, mode: "beat" } },
  // ── Путь проклятий ──
  "thaumaturgy|Stigma": { kind: "cond", needTarget: true, fx: { attr: { manipulation: 1, charisma: 1, appearance: 1 }, note: "Stigma" }, dur: "manual" },
  "thaumaturgy|Malady": { kind: "cond", needTarget: true, fx: { maladySucc: true, note: "Malady" }, dur: "casterWPNights" },
  "thaumaturgy|Pariah": { kind: "cond", needTarget: true, fx: { note: "Pariah" }, dur: "succNights" },
  "thaumaturgy|Corrupt Body": { kind: "cond", needTarget: true, ask: "attr", fx: { diceAll: -1, note: "Corrupt" }, dur: ["night", "week", "month", "season", "year"] },
  "thaumaturgy|Fall from Grace": { kind: "cond", needTarget: true, fx: { note: "Grace" }, dur: ["night", "week", "month", "season", "year"],
    resist: { pool: ["willpower"], diff: 8, mode: "net" } },
  // ── Могущество Нептуна ──
  "thaumaturgy|Prison of Water": { kind: "cond", needTarget: true, fx: { statuses: ["r-held"], note: "Prison" }, dur: "scene" },
  "thaumaturgy|Blood to Water": { kind: "cond", needTarget: true, fx: { bloodToWater: true }, dur: "succHours" },
  "thaumaturgy|Dehydrate": { kind: "dehydrate", needTarget: true, resist: { pool: ["stamina", "fortitude"], diff: 9, mode: "net" } },
  // ── Длань Разрушения ──
  "thaumaturgy|Acidic Touch": { kind: "self", fx: { brawlAgg: true, note: "Acid" }, dur: "scene" },
  "thaumaturgy|Atrophy": { kind: "cond", needTarget: true, fx: { note: "Atrophy" }, dur: "manual", resist: { pool: ["stamina", "athletics"], diff: 8, mode: "atrophy" } },
  "thaumaturgy|Turn to Dust": { kind: "dust", needTarget: true, resist: { pool: ["stamina", "courage"], diff: 8, mode: "beat" } },
  // ── Власть над Стихиями ──
  "thaumaturgy|Elemental Strength": { kind: "self", ask: "split", dur: "scene" },
  "thaumaturgy|Summon Elemental": { kind: "summon", self: true, summon: "elemental" },
  // ── Путь Марса ──
  "thaumaturgy|War Cry": { kind: "self", fx: { note: "WarCry" }, dur: "scene", mars: true },
  "thaumaturgy|Strike True": { kind: "self", fx: { strikeTrue: true, note: "StrikeTrue" }, dur: "scene", mars: true },
  "thaumaturgy|Wind Dance": { kind: "self", fx: { windDance: true, note: "WindDance" }, dur: "scene", mars: true },
  "thaumaturgy|Fearless Heart": { kind: "self", fx: { attr: { strength: 1, dexterity: 1, stamina: 1 }, note: "Fearless" }, dur: "scene", mars: true },
  "thaumaturgy|Comrades at Arms": { kind: "comrades", needTarget: true },
  // ── Путь Сосредоточенного разума ──
  "thaumaturgy|Readiness": { kind: "self", fx: { note: "Readiness" }, dur: "scene" },
  "thaumaturgy|Centering": { kind: "cond", needTarget: true, allowSelf: true, fx: { centered: true, note: "Centering" }, dur: "scene" },
  "thaumaturgy|One-Tracked Mind": { kind: "cond", needTarget: true, allowSelf: true, fx: { note: "OneTrack" }, dur: "scene" },
  "thaumaturgy|Dual Thought": { kind: "self", fx: { note: "Dual" }, dur: "scene" },
  "thaumaturgy|Perfect Clarity": { kind: "self", fx: { diffAll: -2, clarity: true, note: "Clarity" }, dur: "scene" },
  // ── Путь Флоры ──
  "thaumaturgy|Dance of Vines": { kind: "summon", self: true, summon: "vines" },
  "thaumaturgy|Awaken the Forest Giants": { kind: "summon", self: true, summon: "giant" },
  // ── Путь Дара Морфея ──
  "thaumaturgy|Cause Sleep": { kind: "cond", needTarget: true, ownRoll: { trait1: "attributes.manipulation", trait2: "abilities.empathy" }, targetDiff: { plus: 3 },
    fx: { sleep: true }, dur: "scene" },
  "thaumaturgy|Enchanted Slumber": { kind: "cond", needTarget: true, ownRoll: { trait1: "attributes.intelligence", trait2: "abilities.subterfuge" }, targetDiff: { plus: 0 },
    fx: { statuses: ["r-held"], note: "Slumber" }, dur: ["scene", "night", "week", "month", "year"] },
  // ── Путь Воплощения: предмет в инвентарь; простой — до конца сцены (1 Воля за ход), Постоянство и Искусное — навсегда ──
  "thaumaturgy|Summon the Simple Form": { kind: "conjure", self: true, conjure: "scene" },
  "thaumaturgy|Permanency": { kind: "conjure", self: true, conjure: "fix" },
  "thaumaturgy|Magic of the Smith": { kind: "conjure", self: true, conjure: "forever" },
  // ── Тауматургическая защита: готовый пул 2 × уровень (сл. 6), каждый успех снимает успех чужой магии ──
  "thaumaturgy|Thaumaturgical Countermagic": { kind: "counter" },
  // ── Техномантия ──
  "thaumaturgy|Burnout": { kind: "tiers", tiers: [[1, "Burn1"], [2, "Burn2"], [3, "Burn3"], [4, "Burn4"], [5, "Burn5"]] }
};

/** Удар молнии и прочий урон путей — data/combat-powers.mjs. */
