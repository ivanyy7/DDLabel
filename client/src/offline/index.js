/**
 * Офлайн-режим (п. 8.6): парсер + справочник + TSPL на клиенте.
 */

import { parsePhraseTemplate } from './parser.js'
import { resolveExpiryWithShelf } from './shelfResolve.js'
import { buildTsplLabel, buildTsplLabelSingle } from './tsplBuilder.js'
import { tsplToBase64 } from './cp866.js'

/**
 * Разбирает фразу по локальному справочнику и возвращает TSPL в base64 (CP866) для печати по Bluetooth.
 * @param {string} phrase — нормализованная фраза
 * @param {Array} shelfItems — массив продуктов из getLocalShelf()
 * @param {boolean} singleMode
 * @returns {{ ok: true, tsplBase64: string } | { ok: false, error: string }}
 */
export function buildOfflineTsplBase64(phrase, shelfItems, singleMode) {
  const parsed = parsePhraseTemplate(phrase)
  if (parsed.error) return { ok: false, error: parsed.error }

  const resolved = resolveExpiryWithShelf(shelfItems, parsed, singleMode)
  if (resolved.error) return { ok: false, error: resolved.error }

  const payload = {
    productName: resolved.productLabelText || resolved.productName,
    madeAt: resolved.madeAt,
    expiresAt: resolved.expiresAt,
  }
  const tsplString = singleMode ? buildTsplLabelSingle(payload) : buildTsplLabel(payload)
  const tsplBase64 = tsplToBase64(tsplString)
  return { ok: true, tsplBase64 }
}

export { parsePhraseTemplate } from './parser.js'
export { resolveExpiryWithShelf, getByProductName } from './shelfResolve.js'
export { buildTsplLabel, buildTsplLabelSingle } from './tsplBuilder.js'
export { tsplToBase64, encodeToCp866 } from './cp866.js'
