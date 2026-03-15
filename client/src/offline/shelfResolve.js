/**
 * Поиск продукта в справочнике и расчёт срока годности на клиенте (офлайн, п. 8.6).
 * Логика совпадает с server/shelfStorage (getByProductName) и server/shelfLife (resolveExpiry).
 */

const MINUS_MINUTES = 5

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim()
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

  const exact = shelfItems.find((r) => normalizeName(r.productName) === key)
  if (exact) return exact

  const byAlias = shelfItems.find((r) => {
    const aliases = r.aliases || []
    return aliases.some((a) => normalizeName(a) === key)
  })
  if (byAlias) return byAlias

  const keyTokens = tokenizeName(productName)
  if (keyTokens.length) {
    for (const r of shelfItems) {
      const nameTokens = tokenizeName(r.productName)
      if (!nameTokens.length) continue
      const allKeyInName = keyTokens.every((t) => nameTokens.includes(t))
      const allNameInKey = nameTokens.every((t) => keyTokens.includes(t))
      if (allKeyInName || allNameInKey) return r
      const aliasTokensMatch = (r.aliases || []).some((alias) => {
        const aTokens = tokenizeName(alias)
        if (!aTokens.length) return false
        return keyTokens.every((t) => aTokens.includes(t)) || aTokens.every((t) => keyTokens.includes(t))
      })
      if (aliasTokensMatch) return r
    }
  }

  for (const r of shelfItems) {
    const n = normalizeName(r.productName)
    if (key.startsWith(n) || key.includes(n)) return r
  }
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
