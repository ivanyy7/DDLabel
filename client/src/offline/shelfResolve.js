/**
 * Поиск продукта в справочнике и расчёт срока годности на клиенте (офлайн, п. 8.6).
 * Логика совпадает с server/shelfStorage (getByProductName) и server/shelfLife (resolveExpiry).
 */

const MINUS_MINUTES = 5

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    // В парсере дефис/тире заменяется на пробел, поэтому и здесь делаем то же самое,
    // чтобы "чили-манго" и "чили манго" матчились как одно.
    .replace(/[\u2010-\u2015\u2212\uFE58-\uFE63\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeName(name) {
  const norm = normalizeName(name)
  if (!norm) return []
  return norm.split(' ')
}

/**
 * @param {Array<{ productName: string, value: number, unit: string, aliases?: string[], labelText?: string }>} shelfItems
 * @param {string} productName
 * @returns {{ productName: string, value: number, unit: string, labelText?: string } | null}
 */
export function getByProductName(shelfItems, productName) {
  if (!Array.isArray(shelfItems) || !productName) return null
  const key = normalizeName(productName)

  const keyTokens = tokenizeName(productName)
  const exact = shelfItems.find((r) => normalizeName(r.productName) === key)
  const byAlias = shelfItems.find((r) => {
    const aliases = r.aliases || []
    return aliases.some((a) => normalizeName(a) === key)
  })

  // #region agent log pre-fix product matching
  fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fece24' },
    body: JSON.stringify({
      sessionId: 'fece24',
      runId: 'pre-fix',
      hypothesisId: 'H2_getByProductNameSelection',
      location: 'client/src/offline/shelfResolve.js:getByProductName/start',
      message: 'Start matching product in local shelf',
      data: {
        productName,
        key,
        keyTokens,
        exact: exact?.productName ?? null,
        byAlias: byAlias?.productName ?? null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion

  if (exact) {
    // #region agent log pre-fix exact choice
    fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fece24' },
      body: JSON.stringify({
        sessionId: 'fece24',
        runId: 'pre-fix',
        hypothesisId: 'H2_getByProductNameSelection',
        location: 'client/src/offline/shelfResolve.js:getByProductName/return:exact',
        message: 'Matched by exact name after normalization',
        data: { productName: exact.productName, key, keyTokens },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    return exact
  }
  if (byAlias) {
    // #region agent log pre-fix alias choice
    fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fece24' },
      body: JSON.stringify({
        sessionId: 'fece24',
        runId: 'pre-fix',
        hypothesisId: 'H2_getByProductNameSelection',
        location: 'client/src/offline/shelfResolve.js:getByProductName/return:alias',
        message: 'Matched by alias after normalization',
        data: { productName: byAlias.productName, key, keyTokens },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    return byAlias
  }

  if (keyTokens.length) {
    for (const r of shelfItems) {
      const nameTokens = tokenizeName(r.productName)
      if (!nameTokens.length) continue
      // Для "Соус Чили" vs "Соус Чили-Манго" нельзя принимать совпадение по принципу:
      // "имя кандидата - подмножество входа". Нужна строгая проверка: все токены ввода должны
      // быть в кандидате.
      const allKeyInName = keyTokens.every((t) => nameTokens.includes(t))
      if (allKeyInName) {
        // #region agent log pre-fix token overlap choice
        fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fece24' },
          body: JSON.stringify({
            sessionId: 'fece24',
            runId: 'pre-fix',
            hypothesisId: 'H2_getByProductNameSelection',
            location: 'client/src/offline/shelfResolve.js:getByProductName/return:tokenOverlap',
            message: 'Matched by token overlap (contains all tokens from key/name)',
            data: { chosen: r.productName, key, keyTokens },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        return r
      }
      const aliasTokensMatch = (r.aliases || []).some((alias) => {
        const aTokens = tokenizeName(alias)
        if (!aTokens.length) return false
        return keyTokens.every((t) => aTokens.includes(t)) || aTokens.every((t) => keyTokens.includes(t))
      })
      if (aliasTokensMatch) {
        // #region agent log pre-fix aliasTokensMatch choice
        fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fece24' },
          body: JSON.stringify({
            sessionId: 'fece24',
            runId: 'pre-fix',
            hypothesisId: 'H2_getByProductNameSelection',
            location: 'client/src/offline/shelfResolve.js:getByProductName/return:aliasTokensMatch',
            message: 'Matched by alias token overlap',
            data: { chosen: r.productName, key, keyTokens },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        return r
      }
    }
  }

  for (const r of shelfItems) {
    const n = normalizeName(r.productName)
    if (key.startsWith(n) || key.includes(n)) {
      // substring fallback слишком широкий: например "соус чили" внутри "соус чили манго".
      // Поэтому разрешаем его только если количество токенов совпадает и все токены кандидата есть во входе.
      const nameTokens = tokenizeName(r.productName)
      const allNameTokensInKey = nameTokens.every((t) => keyTokens.includes(t))
      if (!allNameTokensInKey || nameTokens.length !== keyTokens.length) continue

      // #region agent log pre-fix substring fallback choice
      fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fece24' },
        body: JSON.stringify({
          sessionId: 'fece24',
          runId: 'pre-fix',
          hypothesisId: 'H2_getByProductNameSelection',
          location: 'client/src/offline/shelfResolve.js:getByProductName/return:substring',
          message: 'Matched by substring fallback',
          data: { chosen: r.productName, key, normalizedEntry: n },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      return r
    }
  }

  // #region agent log pre-fix no match
  fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fece24' },
    body: JSON.stringify({
      sessionId: 'fece24',
      runId: 'pre-fix',
      hypothesisId: 'H2_getByProductNameSelection',
      location: 'client/src/offline/shelfResolve.js:getByProductName/return:none',
      message: 'No product matched in local shelf',
      data: { productName, key, keyTokens },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion

  return null
}

export function computeExpiresAt(madeAt, shelfLifeHours) {
  const expires = new Date(madeAt.getTime() + shelfLifeHours * 60 * 60 * 1000)
  expires.setMinutes(expires.getMinutes() - MINUS_MINUTES)
  return expires
}

function getLabelText(entry, productName) {
  if (!entry) return productName || ''
  const short = entry.labelText != null ? String(entry.labelText).trim() : ''
  return short || entry.productName || productName || ''
}

/**
 * По разобранной фразе и локальному справочнику возвращает данные для этикетки или ошибку.
 * @param {Array} shelfItems — массив из getLocalShelf()
 * @param {{ productName: string, madeAt: Date } | { error: string }} parsed
 * @param {boolean} singleMode
 * @returns {{ productName: string, madeAt: Date, expiresAt: Date, productLabelText?: string } | { error: string }}
 */
export function resolveExpiryWithShelf(shelfItems, parsed, singleMode) {
  if (parsed.error) return parsed
  const entry = getByProductName(shelfItems, parsed.productName)
  if (!entry) {
    return { error: `Продукт «${parsed.productName}» не найден в справочнике сроков` }
  }
  const hours = entry.unit === 'days' ? (entry.value || 0) * 24 : (entry.value != null ? entry.value : null)
  if (hours == null) return { error: `Некорректный срок для «${entry.productName}»` }
  const expiresAt = singleMode ? parsed.madeAt : computeExpiresAt(parsed.madeAt, hours)
  const productLabelText = getLabelText(entry, parsed.productName)
  return {
    productName: entry.productName,
    madeAt: parsed.madeAt,
    expiresAt,
    productLabelText: productLabelText || entry.productName,
  }
}
