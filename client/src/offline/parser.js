/**
 * Парсер фразы на клиенте (офлайн, п. 8.6).
 * Логика совпадает с server/parsing/template/templateParser.js.
 */

const NUMBER_WORDS = {
  'один': 1, 'одна': 1, 'одно': 1, 'первый': 1, 'первая': 1, 'первое': 1, 'первого': 1,
  'два': 2, 'две': 2, 'второй': 2, 'вторая': 2, 'второе': 2, 'второго': 2,
  'три': 3, 'третий': 3, 'третья': 3, 'третье': 3, 'третьего': 3,
  'четыре': 4, 'четвёртый': 4, 'четвертый': 4, 'четвёртая': 4, 'четвертая': 4, 'четвёртого': 4, 'четвертого': 4,
  'пять': 5, 'пятый': 5, 'пятая': 5, 'пятое': 5, 'пятого': 5,
  'шесть': 6, 'шестой': 6, 'шестая': 6, 'шестое': 6, 'шестого': 6,
  'семь': 7, 'седьмой': 7, 'седьмая': 7, 'седьмое': 7, 'седьмого': 7,
  'восемь': 8, 'восьмой': 8, 'восьмая': 8, 'восьмое': 8, 'восьмого': 8,
  'девять': 9, 'девятый': 9, 'девятая': 9, 'девятое': 9, 'девятого': 9,
  'десять': 10, 'десятый': 10, 'десятая': 10, 'десятое': 10, 'десятого': 10, 'десяти': 10, 'десятью': 10,
  'одиннадцать': 11, 'одиннадцатый': 11, 'одиннадцатая': 11, 'одиннадцатое': 11, 'одиннадцатого': 11,
  'двенадцать': 12, 'двенадцатый': 12, 'двенадцатая': 12, 'двенадцатое': 12, 'двенадцатого': 12,
  'тринадцать': 13, 'тринадцатый': 13, 'тринадцатая': 13, 'тринадцатое': 13, 'тринадцатого': 13,
  'четырнадцать': 14, 'четырнадцатый': 14, 'четырнадцатая': 14, 'четырнадцатое': 14, 'четырнадцатого': 14,
  'пятнадцать': 15, 'пятнадцатый': 15, 'пятнадцатая': 15, 'пятнадцатое': 15, 'пятнадцатого': 15,
  'шестнадцать': 16, 'шестнадцатый': 16, 'шестнадцатая': 16, 'шестнадцатое': 16, 'шестнадцатого': 16,
  'семнадцать': 17, 'семнадцатый': 17, 'семнадцатая': 17, 'семнадцатое': 17, 'семнадцатого': 17,
  'восемнадцать': 18, 'восемнадцатый': 18, 'восемнадцатая': 18, 'восемнадцатое': 18, 'восемнадцатого': 18,
  'девятнадцать': 19, 'девятнадцатый': 19, 'девятнадцатая': 19, 'девятнадцатое': 19, 'девятнадцатого': 19,
  'двадцать': 20, 'двадцатый': 20, 'двадцатая': 20, 'двадцатое': 20, 'двадцатого': 20,
  'двадцать один': 21, 'двадцать первого': 21, 'двадцать первый': 21,
  'двадцать два': 22, 'двадцать второго': 22, 'двадцать второй': 22,
  'двадцать три': 23, 'двадцать третьего': 23, 'двадцать третий': 23,
  'двадцать четыре': 24, 'двадцать четвертого': 24, 'двадцать четвёртого': 24, 'двадцать четвертый': 24, 'двадцать четвёртый': 24,
  'двадцать пять': 25, 'двадцать пятого': 25, 'двадцать пятый': 25,
  'двадцать шесть': 26, 'двадцать шестого': 26, 'двадцать шестой': 26,
  'двадцать семь': 27, 'двадцать седьмого': 27, 'двадцать седьмой': 27,
  'двадцать восемь': 28, 'двадцать восьмого': 28, 'двадцать восьмой': 28,
  'двадцать девять': 29, 'двадцать девятого': 29, 'двадцать девятый': 29,
  'тридцать': 30, 'тридцатый': 30, 'тридцатая': 30, 'тридцатое': 30, 'тридцатого': 30,
  'тридцать один': 31, 'тридцать первого': 31, 'тридцать первый': 31,
}

function wordToNumber(token) {
  if (!token) return NaN
  const trimmed = String(token).toLowerCase().trim()
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)
  if (trimmed.startsWith('ноль ')) {
    const rest = trimmed.slice('ноль '.length)
    if (/^\d+$/.test(rest)) return parseInt(rest, 10)
    if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, rest)) return NUMBER_WORDS[rest]
  }
  if (!Object.prototype.hasOwnProperty.call(NUMBER_WORDS, trimmed)) {
    const parts = trimmed.split(/\s+/)
    if (parts.length === 2) {
      if (parts[0] === 'ноль' && Object.prototype.hasOwnProperty.call(NUMBER_WORDS, parts[1])) return NUMBER_WORDS[parts[1]]
      const joined = `${parts[0]} ${parts[1]}`
      if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, joined)) return NUMBER_WORDS[joined]
    }
  }
  if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, trimmed)) return NUMBER_WORDS[trimmed]
  return NaN
}

/**
 * @param {string} phrase
 * @param {Date} [refDate]
 * @returns {{ productName: string, madeAt: Date } | { error: string }}
 */
export function parsePhraseTemplate(phrase, refDate = new Date()) {
  if (!phrase || typeof phrase !== 'string') return { error: 'Фраза не задана' }
  const raw = phrase.trim()
  if (!raw) return { error: 'Фраза пустая' }

  const normalized = raw
    .replace(/(\d{1,2})\.(\d{1,2})/g, '$1 $2')
    .replace(/\bс\b/gi, ' ')
    .replace(/[,–—\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return { error: 'Фраза пустая' }

  const tokens = normalized.split(/\s+/)
  if (tokens.length < 4) {
    return { error: 'Не удалось найти в фразе дату и время изготовления. Пример: «бекон слайс 6 03 18 10».' }
  }

  function tryParseTail(count) {
    if (tokens.length < count) return null
    const tail = tokens.slice(-count)
    const [dayToken, monthToken, t1, t2] = tail

    const day = wordToNumber(dayToken)
    const month = wordToNumber(monthToken)

    let hours, minutes
    if (t1 && (t1.includes('.') || t1.includes(':')) && (!t2 || count === 3)) {
      const parts = t1.split(/[.:]/)
      if (parts.length !== 2) return null
      hours = parseInt(parts[0], 10)
      minutes = parseInt(parts[1], 10)
    } else {
      hours = wordToNumber(t1)
      minutes = wordToNumber(t2)
    }

    if (Number.isNaN(day) || day < 1 || day > 31) return null
    if (Number.isNaN(month) || month < 1 || month > 12) return null
    if (Number.isNaN(hours) || hours < 0 || hours > 23) return null
    if (Number.isNaN(minutes) || minutes < 0 || minutes > 59) return null

    const productTokens = tokens.slice(0, tokens.length - count)
    if (productTokens[productTokens.length - 1]?.toLowerCase() === 'срок') productTokens.pop()

    const productPart = productTokens.join(' ').replace(/[,–—\-]+$/g, '').trim()
    if (!productPart) return { error: 'Не удалось определить название продукта в начале фразы.' }

    const year = refDate.getFullYear()
    const madeAt = new Date(year, month - 1, day, hours, minutes, 0, 0)

    // #region agent log pre-fix hyphen parsing -> productName mismatch
    fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fece24' },
      body: JSON.stringify({
        sessionId: 'fece24',
        runId: 'pre-fix',
        hypothesisId: 'H1_hyphenNormalization',
        location: 'client/src/offline/parser.js:parsePhraseTemplate:tryParseTail/success',
        message: 'Parsed productPart after normalization (hyphen may be replaced)',
        data: { normalized, productPart, tail: tail.join(' ') },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion

    return { productName: productPart, madeAt }
  }

  let result = tryParseTail(4)
  if (result && !result.error) return result
  result = tryParseTail(3)
  if (result && !result.error) return result
  if (result && result.error) return result
  return { error: 'Не удалось разобрать дату и время изготовления. Говорите, например: «бекон слайс 6 03 18 10».' }
}
