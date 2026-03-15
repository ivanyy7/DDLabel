/**
 * Кодирование строки в CP866 для TSPL-принтера (офлайн, п. 8.6).
 * ASCII 0–127 без изменений; кириллица по таблице CP866.
 */

/**
 * @param {string} str — строка в UTF-8 (Unicode)
 * @returns {Uint8Array} — байты в кодировке CP866
 */
export function encodeToCp866(str) {
  const out = []
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    if (c < 128) {
      out.push(c)
      continue
    }
    // Кириллица: А–Я (U+0410–U+042F) → 0x80–0x9F
    if (c >= 0x0410 && c <= 0x042F) {
      out.push(0x80 + (c - 0x0410))
      continue
    }
    // а–п (U+0430–U+043F) → 0xA0–0xBF
    if (c >= 0x0430 && c <= 0x043F) {
      out.push(0xA0 + (c - 0x0430))
      continue
    }
    // р–я (U+0440–U+044F) → 0xE0–0xEF
    if (c >= 0x0440 && c <= 0x044F) {
      out.push(0xE0 + (c - 0x0440))
      continue
    }
    if (c === 0x0451) { out.push(0xF0); continue } // ё
    if (c === 0x0401) { out.push(0xF1); continue } // Ё
    // Остальные символы — заменяем на ?
    out.push(0x3F)
  }
  return new Uint8Array(out)
}

/**
 * @param {string} tsplString — TSPL-команды (UTF-8)
 * @returns {string} — base64 строки в CP866 для отправки на принтер
 */
export function tsplToBase64(tsplString) {
  const bytes = encodeToCp866(tsplString)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}
