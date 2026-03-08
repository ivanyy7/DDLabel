/**
 * Справочник сроков хранения (тестовый для мини-этапа 2).
 * Продукт → срок в часах. Позже будет CRUD и импорт из файла.
 */

const MINUS_MINUTES = 5; // «срок годности до» = расчётное окончание минус 5 минут

/** Тестовый справочник: название (нормализованное) → срок в часах */
const defaultShelfHours = {
  'бекон слайс': 48,
  'бекон': 48,
  'сыр': 120,
  'сыр российский': 120,
  'молоко': 72,
  'колбаса': 72,
  'салат': 24,
  'тесто': 24
};

/**
 * Нормализует название продукта для поиска (нижний регистр, лишние пробелы).
 */
function normalizeName(name) {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Возвращает срок хранения в часах по названию продукта.
 * @param {string} productName
 * @returns {number | null} часы или null, если не найден
 */
function getShelfLifeHours(productName) {
  const key = normalizeName(productName);
  if (defaultShelfHours[key] != null) return defaultShelfHours[key];
  // Поиск по началу (например «бекон слайс копчёный» → бекон слайс)
  for (const [k, hours] of Object.entries(defaultShelfHours)) {
    if (key.startsWith(k) || key.includes(k)) return hours;
  }
  return null;
}

/**
 * Вычисляет «срок годности до»: дата/время изготовления + срок хранения (часы) − 5 минут.
 * @param {Date} madeAt — дата/время изготовления
 * @param {number} shelfLifeHours — срок хранения в часах
 * @returns {Date}
 */
function computeExpiresAt(madeAt, shelfLifeHours) {
  const expires = new Date(madeAt.getTime() + shelfLifeHours * 60 * 60 * 1000);
  expires.setMinutes(expires.getMinutes() - MINUS_MINUTES);
  return expires;
}

/**
 * По фразе (уже разобранной на productName и madeAt) возвращает данные для этикетки
 * или ошибку, если продукт не найден в справочнике.
 * @param {{ productName: string, madeAt: Date }} parsed
 * @returns {{ productName: string, madeAt: Date, expiresAt: Date } | { error: string }}
 */
function resolveExpiry(parsed) {
  if (parsed.error) return parsed;
  const hours = getShelfLifeHours(parsed.productName);
  if (hours == null) {
    return { error: `Продукт «${parsed.productName}» не найден в справочнике сроков` };
  }
  const expiresAt = computeExpiresAt(parsed.madeAt, hours);
  return {
    productName: parsed.productName,
    madeAt: parsed.madeAt,
    expiresAt
  };
}

module.exports = {
  getShelfLifeHours,
  computeExpiresAt,
  resolveExpiry,
  MINUS_MINUTES,
  defaultShelfHours
};
