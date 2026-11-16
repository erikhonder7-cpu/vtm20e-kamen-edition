// module/data/edge-effects.mjs
// Грани охотников как эффекты (Hunter: The Reckoning; тексты — data/hunter.json → edges): после удачного броска Грани
// (или сразу — у Граней без броска) на охотнике ложится ActiveEffect той же машиной, что силы Дисциплин и Дары Гару
// (data/effects.mjs): флаг power = «edge:ключ», числа считает effectMods, конец сцены снимает (apps/hunter.mjs → hunterSceneEnd).
// Поля — как у Даров (data/gift-effects.mjs): «n» — успехи броска; diff.hit — к сложности атак по охотнику; brawlDamage —
// кубы урона голыми руками; darkvision; weapon — оружие на время Грани; note — правку применяет рассказчик.
// Свои поля: meleeDamage — кубы урона оружием ближнего боя, meleeLethal — его урон летальный (не ушибы);
// surge — к Силе, Ловкости и Выносливости столько, сколько точек Добродетели (не выше 6), — считается при включении.

export const EDGE_EFFECTS = {
  // Невинность 1, Укрытие: чудовища не замечают охотника до конца сцены (каждое — свой бросок Восприятия против его успехов)
  "edge:innocence|1": { mode: "scene", icon: "fa-user-secret", note: true },
  // Невинность 2, Освещение: второе зрение себе и охотникам рядом — 10 минут за успех
  "edge:innocence|2": { mode: "scene", icon: "fa-lightbulb", note: true },
  // Невинность 3, Излучение: каждый успех — +1 к сложности атак чудовищ по охотнику (ходов — по успехам)
  "edge:innocence|3": { mode: "scene", icon: "fa-sun", diff: { hit: "n" }, note: true },
  // Мученичество 2, Освидетельствование: истинное лицо существа — 10 минут за успех
  "edge:martyrdom|2": { mode: "scene", icon: "fa-eye", note: true },
  // Спасение 5, Отстранение: до конца сцены пространство запечатано от иных миров
  "edge:redemption|5": { mode: "scene", icon: "fa-door-closed", note: true },
  // Провидчество 4 (Провидцы), Единство: знак единства до конца сцены — второе зрение и защита разума в круге
  "edge:visionary|4|vb": { mode: "scene", icon: "fa-circle-nodes", note: true },
  // Защита 1, Ограждение: до конца сцены чудовища не подойдут ближе Рвения в ярдах
  "edge:defense|1": { mode: "scene", icon: "fa-shield", note: true },
  // Защита 2, Обновление: раны заживают быстро; возложение рук — за Убеждённость
  "edge:defense|2": { mode: "scene", icon: "fa-hand-holding-medical", note: true },
  // Защита 5, Ожог: ходов по успехам касание к охотнику — летальный урон кубиками по успехам; голой рукой — к урону
  "edge:defense|5": { mode: "scene", icon: "fa-fire", brawlDamage: "n", note: true },
  // Суд 1, Распознание: приметы рода чудовищ и зрение в темноте — 10 минут за успех
  "edge:judgment|1": { mode: "scene", icon: "fa-eye-low-vision", darkvision: true },
  // Суд 4, Пронзание: всю сцену ложь рядом с охотником выдаёт себя (бросает рассказчик)
  "edge:judgment|4": { mode: "scene", icon: "fa-scale-balanced", note: true },
  // Мщение 1, Рассечение: оружие ближнего боя бьёт летально, +2 к урону, ранит бесплотных; клинок из ничего — Сила + 2
  "edge:vengeance|1": { mode: "scene", icon: "fa-khanda", meleeDamage: 2, meleeLethal: true,
    weapon: { name: "Клинок из ничего", kind: "melee", damage: 0, strength: true, damageType: "lethal", difficulty: 6, supernatural: true } },
  // Мщение 3, Чад: облако чёрного дыма — атаки внутри и в облако +3 к сложности (ходов по успехам)
  "edge:vengeance|3": { mode: "scene", icon: "fa-smog", note: true },
  // Мщение 4, Всплеск: до конца сцены +Рвение к Силе, Ловкости и Выносливости (не выше 6)
  "edge:vengeance|4": { mode: "scene", icon: "fa-bolt", surge: "zeal" }
};
