// Чистые расчёты физических Дисциплин V20. Вынесены отдельно, чтобы их можно
// было проверять без среды Foundry и повторно использовать в боевых бросках.

const n = value => Math.max(0, Math.floor(Number(value) || 0));

/** Могущество: без активации — кости; за кровь — автоматические успехи. */
export function potenceModifiers(dots, activated = false) {
  const value = n(dots);
  return activated ? { dice: 0, automatic: value } : { dice: value, automatic: 0 };
}

/** Стремительность: точки, обменянные на доп. действия, снимаются с бонуса Ловкости. */
export function celerityDexterityDice(dots, actions = 0) {
  return Math.max(0, n(dots) - n(actions));
}

/**
 * Стремительность V20: один пункт крови открывает до рейтинга Дисциплины
 * дополнительных физических действий на этот ход. Если действия уже куплены,
 * увеличение их числа в пределах рейтинга не требует второй оплаты.
 * Слабая кровь удваивает единовременную стоимость активации.
 */
export function celerityBloodCost(from, to, doubled = false) {
  const before = Math.min(n(from), n(to));
  const after = n(to);
  if (after <= before || before > 0) return 0;
  return doubled ? 2 : 1;
}

/** Максимум действий: после оплаты активации доступны все точки Стремительности. */
export function celerityMaxBuyable(dots, alreadyBought, blood, doubled = false) {
  const max = n(dots);
  const bought = Math.min(max, n(alreadyBought));
  if (bought > 0) return max;
  const activationCost = doubled ? 2 : 1;
  return n(blood) >= activationCost ? max : 0;
}

/**
 * Компоненты поглощения по V20. Стойкость добавляет кости к поглощению
 * лёгкого и летального урона и является единственной базовой характеристикой
 * для поглощения губительного урона вампиром. Она не повышает значение Выносливости.
 */
export function soakComponents({ damageType, stamina = 0, fortitude = 0, armor = 0, form = 0,
  tough = true, fangs = false, staminaVsFangs = false } = {}) {
  const out = { stamina: 0, fortitude: n(fortitude), armor: 0, form: n(form) };
  if (damageType === "bashing") {
    out.stamina = n(stamina);
    out.armor = n(armor);
  } else if (damageType === "lethal") {
    out.stamina = tough ? n(stamina) : 0;
    out.armor = n(armor);
  } else {
    out.stamina = fangs && staminaVsFangs ? n(stamina) : 0;
    out.armor = fangs ? n(armor) : 0;
  }
  return out;
}

export const sumSoakComponents = parts => Object.values(parts).reduce((sum, value) => sum + n(value), 0);
