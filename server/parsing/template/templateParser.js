// Парсер жёсткого шаблона фразы:
// "<продукт> срок с <ДД> <ММ> с <ЧЧ> <ММ>"
// Примеры:
// - "Сыр Россия срок с 7 3 с 14 05"
// - "Сыр Россия срок с шестого третьего с 15.10"

const NUMBER_WORDS = {
  // 1
  'один': 1, 'одна': 1, 'одно': 1, 'первый': 1, 'первая': 1, 'первое': 1, 'первого': 1,
  // 2
  'два': 2, 'две': 2, 'второй': 2, 'вторая': 2, 'второе': 2, 'второго': 2,
  // 3
  'три': 3, 'третий': 3, 'третья': 3, 'третье': 3, 'третьего': 3,
  // 4
  'четыре': 4, 'четвёртый': 4, 'четвертый': 4, 'четвёртая': 4, 'четвертая': 4, 'четвёртого': 4, 'четвертого': 4,
  // 5
  'пять': 5, 'пятый': 5, 'пятая': 5, 'пятое': 5, 'пятого': 5,
  // 6
  'шесть': 6, 'шестой': 6, 'шестая': 6, 'шестое': 6, 'шестого': 6,
  // 7
  'семь': 7, 'седьмой': 7, 'седьмая': 7, 'седьмое': 7, 'седьмого': 7,
  // 8
  'восемь': 8, 'восьмой': 8, 'восьмая': 8, 'восьмое': 8, 'восьмого': 8,
  // 9
  'девять': 9, 'девятый': 9, 'девятая': 9, 'девятое': 9, 'девятого': 9,
  // 10
  'десять': 10,
  'десятый': 10,
  'десятая': 10,
  'десятое': 10,
  'десятого': 10,
  'десяти': 10,
  'десятью': 10,
  // 11
  'одиннадцать': 11, 'одиннадцатый': 11, 'одиннадцатая': 11, 'одиннадцатое': 11, 'одиннадцатого': 11,
  // 12
  'двенадцать': 12, 'двенадцатый': 12, 'двенадцатая': 12, 'двенадцатое': 12, 'двенадцатого': 12,
  // 13
  'тринадцать': 13, 'тринадцатый': 13, 'тринадцатая': 13, 'тринадцатое': 13, 'тринадцатого': 13,
  // 14
  'четырнадцать': 14, 'четырнадцатый': 14, 'четырнадцатая': 14, 'четырнадцатое': 14, 'четырнадцатого': 14,
  // 15
  'пятнадцать': 15, 'пятнадцатый': 15, 'пятнадцатая': 15, 'пятнадцатое': 15, 'пятнадцатого': 15,
  // 16
  'шестнадцать': 16, 'шестнадцатый': 16, 'шестнадцатая': 16, 'шестнадцатое': 16, 'шестнадцатого': 16,
  // 17
  'семнадцать': 17, 'семнадцатый': 17, 'семнадцатая': 17, 'семнадцатое': 17, 'семнадцатого': 17,
  // 18
  'восемнадцать': 18, 'восемнадцатый': 18, 'восемнадцатая': 18, 'восемнадцатое': 18, 'восемнадцатого': 18,
  // 19
  'девятнадцать': 19, 'девятнадцатый': 19, 'девятнадцатая': 19, 'девятнадцатое': 19, 'девятнадцатого': 19,
  // 20
  'двадцать': 20, 'двадцатый': 20, 'двадцатая': 20, 'двадцатое': 20, 'двадцатого': 20,
  // 21
  'двадцать один': 21, 'двадцать первого': 21, 'двадцать первый': 21,
  // 22
  'двадцать два': 22, 'двадцать второго': 22, 'двадцать второй': 22,
  // 23
  'двадцать три': 23, 'двадцать третьего': 23, 'двадцать третий': 23,
  // 24
  'двадцать четыре': 24, 'двадцать четвертого': 24, 'двадцать четвёртого': 24, 'двадцать четвертый': 24, 'двадцать четвёртый': 24,
  // 25
  'двадцать пять': 25, 'двадцать пятого': 25, 'двадцать пятый': 25,
  // 26
  'двадцать шесть': 26, 'двадцать шестого': 26, 'двадцать шестой': 26,
  // 27
  'двадцать семь': 27, 'двадцать седьмого': 27, 'двадцать седьмой': 27,
  // 28
  'двадцать восемь': 28, 'двадцать восьмого': 28, 'двадцать восьмой': 28,
  // 29
  'двадцать девять': 29, 'двадцать девятого': 29, 'двадцать девятый': 29,
  // 30
  'тридцать': 30, 'тридцатый': 30, 'тридцатая': 30, 'тридцатое': 30, 'тридцатого': 30,
  // 31
  'тридцать один': 31, 'тридцать первого': 31, 'тридцать первый': 31,
};

function wordToNumber(token) {
  if (!token) return NaN;
  const trimmed = String(token).toLowerCase().trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);

  // Для конструкций типа "ноль восьмого" → игнорируем ведущий "ноль"
  if (trimmed.startsWith('ноль ')) {
    const rest = trimmed.slice('ноль '.length);
    if (/^\d+$/.test(rest)) return parseInt(rest, 10);
    if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, rest)) {
      return NUMBER_WORDS[rest];
    }
  }

  // Для составных конструкций типа "двадцать один" склеиваем два слова
  if (!Object.prototype.hasOwnProperty.call(NUMBER_WORDS, trimmed)) {
    const parts = trimmed.split(/\s+/);
    if (parts.length === 2) {
      if (parts[0] === 'ноль' && Object.prototype.hasOwnProperty.call(NUMBER_WORDS, parts[1])) {
        return NUMBER_WORDS[parts[1]];
      }
      const joined = `${parts[0]} ${parts[1]}`;
      if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, joined)) {
        return NUMBER_WORDS[joined];
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, trimmed)) {
    return NUMBER_WORDS[trimmed];
  }
  return NaN;
}

/**
 * @param {string} phrase
 * @param {Date} [refDate] - опорная дата для года (по умолчанию сейчас)
 * @returns {{ productName: string, madeAt: Date } | { error: string }}
 */
function parsePhraseTemplate(phrase, refDate = new Date()) {
  if (!phrase || typeof phrase !== 'string') {
    return { error: 'Фраза не задана' };
  }

  const raw = phrase.trim();
  if (!raw) return { error: 'Фраза пустая' };

  const normalized = raw.replace(/\s+/g, ' ');
  const lower = normalized.toLowerCase();

  const keyword = 'срок';
  const idx = lower.indexOf(keyword);
  if (idx === -1) {
    return { error: 'Не найдено слово «срок» в фразе.' };
  }

  // Продукт — всё до слова "срок"
  const productPart = normalized
    .slice(0, idx)
    .replace(/[,–—\-]+$/g, '')
    .trim();

  if (!productPart) {
    return { error: 'Не удалось определить название продукта до слова «срок».' };
  }

  // После "срок" ожидаем "с <ДД> <ММ> с <ЧЧ> <ММ>" — числа или слова
  const afterRaw = normalized
    .slice(idx + keyword.length)
    .replace(/[,–—\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = afterRaw.split(/\s+/);
  if (tokens[0] !== 'с' || tokens.length < 4) {
    return {
      error:
        'Не получилось разобрать дату и время после слова «срок». ' +
        'Говорите, например: «Сыр Россия срок с 7 3 с 14 05».',
    };
  }

  // Ищем второе "с" — перед временем. Между ним и днём может быть один или несколько токенов месяца:
  // "3 5" / "ноль третьего" / "три мая" и т.п.
  const secondSIndex = tokens.indexOf('с', 2);
  if (secondSIndex === -1 || secondSIndex >= tokens.length - 1) {
    return {
      error:
        'Ожидалось слово «с» перед временем. Пример: «Сыр Россия срок с 7 3 с 14 05».',
    };
  }

  // День: либо одно слово/число, либо "ноль восьмого" (два слова)
  let dayPhrase = tokens[1];
  let monthStartIndex = 2;
  if (tokens[1] === 'ноль' && tokens.length > 2 && tokens[2] !== 'с') {
    dayPhrase = `${tokens[1]} ${tokens[2]}`;
    monthStartIndex = 3;
  }

  const monthPhrase = tokens.slice(monthStartIndex, secondSIndex).join(' ');
  const timeToken1 = tokens[secondSIndex + 1];
  const timeToken2 = tokens[secondSIndex + 2];

  const day = wordToNumber(dayPhrase);
  const month = wordToNumber(monthPhrase);

  let hours;
  let minutes;

  // Время можно говорить как "14 05" или "15.10"
  if (timeToken1 && timeToken1.includes('.') && !timeToken2) {
    const parts = timeToken1.split('.');
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10);
  } else {
    hours = wordToNumber(timeToken1);
    minutes = wordToNumber(timeToken2);
  }

  if (Number.isNaN(day) || day < 1 || day > 31) {
    return { error: 'Некорректный день изготовления.' };
  }
  if (Number.isNaN(month) || month < 1 || month > 12) {
    return { error: 'Некорректный месяц изготовления.' };
  }
  if (Number.isNaN(hours) || hours < 0 || hours > 23) {
    return { error: 'Некорректный час изготовления.' };
  }
  if (Number.isNaN(minutes) || minutes < 0 || minutes > 59) {
    return { error: 'Некорректные минуты изготовления.' };
  }

  const year = refDate.getFullYear();
  const madeAt = new Date(year, month - 1, day, hours, minutes, 0, 0);

  return {
    productName: productPart,
    madeAt,
  };
}

module.exports = {
  parsePhraseTemplate,
};

