/**
 * Парсер русской фразы: продукт + относительные дата/время изготовления.
 * Опорная дата («сегодня», «вчера») — по московскому времени.
 */

const MOSCOW_TZ = 'Europe/Moscow';

/** Текущие дата и время в Москве (год, месяц 1–12, день, часы, минуты) */
function getMoscowNow(instant = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = f.formatToParts(instant);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hours: parseInt(get('hour'), 10),
    minutes: parseInt(get('minute'), 10),
    seconds: parseInt(get('second'), 10)
  };
}

/** Дата/время в Москве: (moscowNow + dayOffset дней) в часах hours:minutes. Возвращает Date. */
function makeMoscowDate(moscowNow, dayOffset, hours, minutes) {
  const pad = (n) => String(n).padStart(2, '0');
  const midnightMoscow = new Date(
    `${moscowNow.year}-${pad(moscowNow.month)}-${pad(moscowNow.day)}T00:00:00+03:00`
  );
  const targetDate = new Date(midnightMoscow.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  const targetMoscow = getMoscowNow(targetDate);
  const iso = `${targetMoscow.year}-${pad(targetMoscow.month)}-${pad(targetMoscow.day)}T${pad(hours)}:${pad(minutes)}:00+03:00`;
  return new Date(iso);
}

/**
 * Извлекает из фразы относительные дату/время и название продукта.
 * Опорная дата — текущее время по Москве.
 * @param {string} phrase — фраза пользователя
 * @param {Date} refDate — опорный момент (обычно «сейчас»); по нему берётся «сегодня» в Москве
 * @returns {{ productName: string, madeAt: Date } | { error: string }}
 */
function parsePhrase(phrase, refDate = new Date()) {
  if (!phrase || typeof phrase !== 'string') {
    return { error: 'Фраза не задана' };
  }
  const text = phrase.trim();
  if (!text) return { error: 'Фраза пустая' };

  const lower = text.toLowerCase();

  // Относительная дата: вчера, сегодня, позавчера, или «N день/дня/дней назад» (цифрой или словом)
  let dayOffset = 0;
  const daysAgoDigit = text.match(/\b(\d+)\s*(день|дня|дней)\s+назад\b/i);
  const daysAgoWord = lower.match(/\b(один|одна|одно|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)\s+(день|дня|дней)\s+назад\b/);
  const numWords = { один: 1, одна: 1, одно: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10 };
  if (daysAgoDigit) {
    const n = parseInt(daysAgoDigit[1], 10);
    if (n >= 0 && n <= 365) dayOffset = -n;
  } else if (daysAgoWord && numWords[daysAgoWord[1]]) {
    dayOffset = -numWords[daysAgoWord[1]];
  } else if (lower.includes('позавчера')) dayOffset = -2;
  else if (lower.includes('вчера')) dayOffset = -1;
  else if (lower.includes('сегодня')) dayOffset = 0;
  else dayOffset = 0;

  const moscowNow = getMoscowNow(refDate);

  // Время: ЧЧ:ММ или ЧЧ.ММ или ЧЧ ММ
  const timeMatch = text.match(/\b(\d{1,2})[.:\s]+(\d{2})\b/);
  let hours = moscowNow.hours;
  let minutes = moscowNow.minutes;
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = parseInt(timeMatch[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return { error: 'Некорректное время' };
    }
  }

  // Дата/время изготовления — по московскому времени
  const madeAt = makeMoscowDate(moscowNow, dayOffset, hours, minutes);

  // Название продукта: убираем ключевые слова и время, оставшийся текст
  let productPart = text
    .replace(/\b\d+\s*(день|дня|дней)\s+назад\b/gi, '')
    .replace(/\b(один|одна|одно|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)\s+(день|дня|дней)\s+назад\b/gi, '')
    .replace(/\b(вчера|сегодня|позавчера)\b/gi, '')
    .replace(/\b(\d{1,2})[.:\s]+(\d{2})\b/g, '')
    .replace(/\b(изготовление|изготовлен[оа]?)\b/gi, '')
    .replace(/\bв\b/gi, '')
    .replace(/[,–—\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!productPart) return { error: 'Не удалось определить продукт' };
  const productName = productPart;

  return { productName, madeAt };
}

module.exports = { parsePhrase };
