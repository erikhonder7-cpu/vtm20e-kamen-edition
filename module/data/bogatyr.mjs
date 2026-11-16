// module/data/bogatyr.mjs
// Хоумрул «Богатыри» (Fingers of the Eldest: The Bogatyri — S. d'Ovidio, J. Heath; Storytellers Vault, 2019; фанатское
// дополнение к V20, не канон) — настройка мира bogatyri. Богатырь — гуль особого типа (ghoulType "bogatyr"): живой носитель
// и «мешок плоти», частица Старейшего, вросший в его сердце. Стадии: личинка (носитель ещё помнит себя; Вырождение
// растёт, пока не сравняется с Волей) и взрослый («палец Старейшего»).
//   кровь — 1 пункт в день, запас 5 за месяц существования, не больше 40 (8-й месяц);
//   потолок черт — 5 + 1 за десятилетие, не больше 8 (старше тысячи лет — 9); Дисциплины — до 5;
//   взрослый: «без боли» (штрафов за раны нет до «Без сознания»), регенерация 1 уровня за ход (и губительного),
//   неуязвимость к рукотворному оружию (combat.mjs), Плащ Старейшего — эффект BOGATYR_MANTLE.

import { SYSTEM_ID } from "../config.mjs";

export const BOGATYR_MANTLE = "bogatyr:mantle";

/** Хоумрул включён в мире. */
export function bogatyrOn() {
  try { return !!game.settings.get(SYSTEM_ID, "bogatyri"); } catch { return false; }
}

/** Актёр — Богатырь (любая стадия); взрослый — только mature. */
export const isBogatyr = a => a?.type === "ghoul" && a.system?.ghoulType === "bogatyr";
export const isMatureBogatyr = a => isBogatyr(a) && a.system.bogatyr?.stage === "mature";

/** Запас крови: 5 за месяц существования (не меньше 5), не больше 40. */
export const bogatyrBlood = months => Math.min(40, Math.max(5, 5 * (Number(months) || 0)));

/** Потолок черт: 5 + 1 за десятилетие, не больше 8; старше тысячи лет — 9. */
export const bogatyrTraitMax = years => Math.min(years > 1000 ? 9 : 8, 5 + Math.floor((Number(years) || 0) / 10));

/** Дисциплины Богатыря (книга: стартовые — Мощь, Стремительность, Стойкость, Изменчивость; доступны — Анимализм, Ясновидение, Затемнение). */
export const BOGATYR_DISCIPLINES = ["potence", "celerity", "fortitude", "vicissitude"];
export const BOGATYR_EXTRA = ["animalism", "auspex", "obfuscate"];

/**
 * Плащ Старейшего (Eldest's Blessing): мешок плоти выходит наружу капюшоном — руки становятся клинками (Сила + 3, летальные),
 * язык — парой шипов (Сила, губительные); Выносливость поглощает и губительный урон, сложность прочности 5. Только ночью:
 * солнечный свет загоняет симбионта обратно (до рассвета). Сердце в этот момент уязвимо — удар в спину (рассказчик).
 */
export const BOGATYR_EFFECTS = {
  [BOGATYR_MANTLE]: { mode: "night", icon: "fa-skull", staminaVsAgg: true, soakDiff: -1, note: true,
    weapons: [
      { name: "Руки-клинки", kind: "brawl", damage: 3, strength: true, damageType: "lethal", difficulty: 6, naturalFormWeapon: true, supernatural: true },
      { name: "Язык-шипы", kind: "brawl", damage: 0, strength: true, damageType: "aggravated", difficulty: 6, naturalFormWeapon: true, supernatural: true }
    ] }
};

/**
 * Неуязвимость к рукотворному оружию (Resilience against Human Weapons): металл, который режет или колет, бьёт только
 * ударным уроном без кубов оружия; дробящее оружие не ранит вовсе. Огонь и сверхъестественное — как обычно (губительный).
 * Возвращает { dmg, type, note } или null — если правило не касается этой атаки.
 */
export function bogatyrWeaponRule(target, c, dmg) {
  if (!isMatureBogatyr(target) || !c?.isWeapon || c.supernatural || c.type === "aggravated" || dmg == null) return null;
  if (c.type === "bashing") return { dmg: 0, type: "bashing", note: "Bogatyr.NoBruise" };
  return { dmg: Math.max(0, dmg - (c.weaponDmg ?? 0)), type: "bashing", note: "Bogatyr.NoCut" };
}
