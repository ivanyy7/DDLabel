/**
 * Парсер русской фразы: продукт + относительные дата/время изготовления.
 * Примеры: «Бекон слайс, изготовление вчера в 18:10», «Вчера 18:10 сыр».
 */

/**
 * Извлекает из фразы относительные дату/время и название продукта.
 * @param {string} phrase — фраза пользователя
 * @param {Date} refDate — опорная дата/время (обычно «сейчас»)
 * @returns {{ productName: string, madeAt: Date } | { error: string }}
 */
function parsePhrase(phrase, refDate = new Date()) {
  if (!phrase || typeof phrase !== 'string') {
    return { error: 'Фраза не задана' };
  }
  const text = phrase.trim();
  if (!text) return { error: 'Фраза пустая' };

  const lower = text.toLowerCase();

  // Относительная дата: вчера, сегодня, позавчера
  let dayOffset = 0;
  if (lower.includes('позавчера')) dayOffset = -2;
  else if (lower.includes('вчера')) dayOffset = -1;
  else if (lower.includes('сегодня')) dayOffset = 0;
  // Если не указано — считаем «сегодня»
  else dayOffset = 0;

  // Время: ЧЧ:ММ или ЧЧ.ММ или ЧЧ ММ (1–2 цифры часы, 2 цифры минуты)
  const timeMatch = text.match(/\b(\d{1,2})[.:\s]+(\d{2})\b/);
  let hours = refDate.getHours();
  let minutes = refDate.getMinutes();
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = parseInt(timeMatch[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return { error: 'Некорректное время' };
    }
  }

  // Дата/время изготовления
  const madeAt = new Date(refDate);
  madeAt.setDate(madeAt.getDate() + dayOffset);
  madeAt.setHours(hours, minutes, 0, 0);

  // Название продукта: убираем ключевые слова и время, оставшийся текст
  let productPart = text
    .replace(/\b(вчера|сегодня|позавчера)\b/gi, '')
    .replace(/\b(\d{1,2})[.:\s]+(\d{2})\b/g, '')
    .replace(/\bизготовление\b/gi, '')
    .replace(/\bв\b/gi, '')
    .replace(/[,–—\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!productPart) return { error: 'Не удалось определить продукт' };
  const productName = productPart;

  return { productName, madeAt };
}

module.exports = { parsePhrase };
