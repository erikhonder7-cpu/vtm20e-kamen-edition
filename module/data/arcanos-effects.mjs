// module/data/arcanos-effects.mjs
// Арканои призраков как эффекты (Wraith 20; тексты — data/wraith.json → arcanoi[].levels): уровень с действием на самого
// призрака после удачного броска (или сразу — уровни без броска) ложится ActiveEffect той же машиной, что силы Дисциплин,
// Дары и Грани (data/effects.mjs): флаг power = «arc:Арканос|уровень|common/initiate», правки — во флаге arcFx.
// Поля — как у Даров (data/gift-effects.mjs): «n» — успехи, «r» — точки Арканоса; soakAll — кубы прочности против всего
// (включая губительный); dice — кубы к броскам со Способностью; diff.perception, diff.hit; weapon — оружие на время эффекта;
// note — правку применяет рассказчик. variants — выбор применения: { ключ: { label, attr?, diff?, …правки } }; attr и diff
// варианта меняют пул и сложность броска (Арсенал Лепки: оружие — Интеллект, броня — Выносливость).
// mode: scene — до конца сцены; toggle — пока призрак сам не снимет (Арсенал Лепки держится, пока не вернёт облик).

export const ARC_EFFECTS = {
  // Вселение 3 (Посв.), Упорство кузнеца: 1 Пафос — до конца сцены точки Вселения к прочности, и против губительного
  "arc:inhabit|3|initiate": { mode: "scene", icon: "fa-hammer", soakAll: "r" },
  // Неистовство 3, Крылья ярости: 2 Пафоса — до конца сцены Неистовство к пулам Атлетики (и к Ловкости для бега)
  "arc:outrage|3|common": { mode: "scene", icon: "fa-feather", dice: { athletics: "r" }, note: true },
  // Оссеум 1, Ищейка: 1 Пафос, Восприятие + Оссеум (сл. 8) — каждый успех −1 к сложности Восприятия и выслеживания
  "arc:osseum|1|common": { mode: "scene", icon: "fa-dog", diff: { perception: "-n" } },
  // Оссеум 2, Тень Кориолиса: Смекалка + Оссеум (сл. 7) — скрыться (+1 куб к Скрытности за успех до конца сцены)
  // или размыть (атаки по призраку +1 к сложности, метательные и старинные +2; ход за успех)
  "arc:osseum|2|common": { mode: "scene", icon: "fa-wind", variants: {
    hide: { label: "Wraith.Fx.Hide", dice: { stealth: "n" } },
    blur: { label: "Wraith.Fx.Blur", diff: { hit: 1 }, note: true } } },
  // Оссеум 2 (Посв.), Костяной саван: урон Мальстрёма на 1 куб меньше за успех — сцену
  "arc:osseum|2|initiate": { mode: "scene", icon: "fa-shield", note: true },
  // Оссеум 3, Костяной арсенал: оружие ближнего боя из праха — успехов = урон; сцена
  "arc:osseum|3|common": { mode: "scene", icon: "fa-bone",
    weapon: { name: "Костяное оружие", kind: "melee", damage: "n", strength: true, damageType: "lethal", difficulty: 6 } },
  // Оссеум 5, Король-нищий: губительный поглощается как летальный; успехи плаща — к сложности атак по призраку (до 9)
  "arc:osseum|5|common": { mode: "scene", icon: "fa-crown", diff: { hit: "n" }, note: true },
  // Аргос 3 (Посв.), Отвратить гнев Анемоев: сцен по успехам — Аргос к прочности против среды и Пандемониума
  "arc:argos|3|initiate": { mode: "scene", icon: "fa-wind", note: true },
  // Лепка 3, Арсенал: только на себя — оружие из части тела (Интеллект + Лепка, сл. Выносливость + 3: +1 куб в рукопашной
  // за успех) или броня (Выносливость + Лепка, сл. Сила + 3: +1 куб прочности за успех, за каждый сверх первого
  // +1 к сложности Ловкости); держится, пока призрак не вернёт облик
  "arc:moliate|3|common": { mode: "toggle", icon: "fa-shield-halved", variants: {
    weapon: { label: "Wraith.Fx.Weapon", attr: "intelligence", diffFrom: "stamina",
      weapon: { name: "Оружие из Корпуса", kind: "brawl", damage: "n", strength: true, damageType: "lethal", difficulty: 6 } },
    armor: { label: "Wraith.Fx.Armor", attr: "stamina", diffFrom: "strength", soakAll: "n", attrDiff: { dexterity: "n-1" } } } },
  // напоминания со сроком
  "arc:embody|3|initiate": { mode: "scene", icon: "fa-hand", note: true },
  "arc:embody|3|common": { mode: "scene", icon: "fa-person", note: true },
  "arc:puppetry|1|common": { mode: "scene", icon: "fa-person-walking", note: true },
  "arc:outrage|4|common": { mode: "scene", icon: "fa-hand-fist", note: true },
  "arc:inhabit|4|initiate": { mode: "scene", icon: "fa-screwdriver-wrench", note: true }
};

/** Правки эффекта Арканоса: «n» — успехи, «-n», «n-1», «r» — точки Арканоса; оружие — с числом урона. */
export function arcFx(def, { n = 0, r = 0 } = {}) {
  const val = v => v === "n" ? n : v === "-n" ? -n : v === "n-1" ? Math.max(0, n - 1) : v === "r" ? r : v;
  const out = {};
  for (const [k, v] of Object.entries(def)) {
    if (["mode", "icon", "variants", "label", "attr", "diffFrom"].includes(k)) continue;
    if (k === "soakAll") { const s = val(v); if (s) out.soakBonus = { bashing: s, lethal: s, aggravated: s }; continue; }
    out[k] = v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, val(b)])) : val(v);
  }
  return out;
}
