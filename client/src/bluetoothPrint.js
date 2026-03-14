/**
 * Печать по Bluetooth с телефона (Web Serial API + Bluetooth SPP).
 * XP-365B использует Bluetooth Classic SPP.
 * Chrome 117+ (desktop), Chrome 138+ (Android).
 */

/**
 * Проверяет, доступен ли Web Serial API.
 */
export function isBluetoothPrintAvailable() {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

/**
 * Отправляет TSPL (base64) на принтер по Bluetooth.
 * @param {string} tsplBase64 — TSPL в кодировке CP866, закодированный в base64
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
export async function sendTsplViaBluetooth(tsplBase64) {
  // #region agent log
  const _dl = (msg, data) => fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d04e56'},body:JSON.stringify({sessionId:'d04e56',location:'bluetoothPrint.js',message:msg,data,timestamp:Date.now(),hypothesisId:'H1_H2_H3'})}).catch(()=>{});
  // #endregion
  // #region agent log
  _dl('sendTsplViaBluetooth called',{base64Len:tsplBase64?.length,available:isBluetoothPrintAvailable()});
  // #endregion

  if (!isBluetoothPrintAvailable()) {
    return {
      ok: false,
      error: 'Печать по Bluetooth недоступна. Используйте Chrome 117+ (ПК) или Chrome 138+ (Android).',
    }
  }

  let port = null
  try {
    // #region agent log
    _dl('before requestPort',{});
    // #endregion
    port = await navigator.serial.requestPort()
    // #region agent log
    _dl('requestPort ok',{portInfo:port?.getInfo?.()});
    // #endregion
  } catch (err) {
    // #region agent log
    _dl('requestPort error',{name:err.name,message:err.message});
    // #endregion
    if (err.name === 'NotFoundError') {
      return { ok: false, error: 'Принтер не выбран. Выберите Xprinter XP-365B в списке.' }
    }
    if (err.name === 'SecurityError') {
      return { ok: false, error: 'Bluetooth: SecurityError — нет активного жеста пользователя или доступ заблокирован. Попробуйте ещё раз.' }
    }
    return { ok: false, error: `Bluetooth [${err.name}]: ${err.message}` || 'Не удалось подключиться к принтеру.' }
  }

  try {
    await port.open({ baudRate: 9600 })
    // #region agent log
    _dl('port.open ok',{});
    // #endregion
  } catch (err) {
    // #region agent log
    _dl('port.open error',{name:err.name,message:err.message});
    // #endregion
    return { ok: false, error: `Bluetooth open [${err.name}]: ${err.message}` }
  }

  let writer = null
  try {
    const binary = Uint8Array.from(atob(tsplBase64), (c) => c.charCodeAt(0))
    // #region agent log
    _dl('binary ready',{byteLen:binary.length});
    // #endregion
    writer = port.writable.getWriter()
    await writer.write(binary)
    // #region agent log
    _dl('write ok',{});
    // #endregion
    return { ok: true }
  } catch (err) {
    // #region agent log
    _dl('write error',{name:err.name,message:err.message});
    // #endregion
    return { ok: false, error: `Bluetooth write [${err.name}]: ${err.message}` }
  } finally {
    if (writer) {
      try { writer.releaseLock() } catch { /* ignore */ }
    }
    try {
      await port.close()
      // #region agent log
      _dl('port.close ok',{});
      // #endregion
    } catch (closeErr) {
      // #region agent log
      _dl('port.close error',{message:closeErr?.message});
      // #endregion
    }
  }
}
