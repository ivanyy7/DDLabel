/**
 * Расчёт «срок годности до» по разобранной фразе.
 * Срок берётся из единого слоя хранилища (shelfStorage); логика расчёта — здесь.
 */

const { getByProductName, getShelfLifeHours } = require('./shelfStorage.js');

const MINUS_MINUTES = 5; // «срок годности до» = расчётное окончание минус 5 минут

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
 * или ошибку, если продукт не найден. Ищет по названию и по вариантам (aliases).
 * Возвращает каноническое productName из справочника (для этикетки и labelText).
 * @param {{ productName: string, madeAt: Date }} parsed
 * @returns {{ productName: string, madeAt: Date, expiresAt: Date } | { error: string }}
 */
function resolveExpiry(parsed) {
  if (parsed.error) return parsed;
  const entry = getByProductName(parsed.productName);
  if (!entry) {
    return { error: `Продукт «${parsed.productName}» не найден в справочнике сроков` };
  }
  const hours = entry.unit === 'days' ? (entry.value || 0) * 24 : (entry.value != null ? entry.value : null);
  if (hours == null) return { error: `Некорректный срок для «${entry.productName}»` };
  const expiresAt = computeExpiresAt(parsed.madeAt, hours);
  return {
    productName: entry.productName,
    madeAt: parsed.madeAt,
    expiresAt
  };
}

module.exports = {
  computeExpiresAt,
  resolveExpiry,
  MINUS_MINUTES
};
