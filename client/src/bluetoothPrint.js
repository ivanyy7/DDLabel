/**
 * Печать по Bluetooth с телефона (Web Bluetooth API, BLE).
 * XP-365B использует BLE GATT:
 *   сервис 0xFF00, характеристика записи 0xFF02.
 * Chrome 56+ (Android), Chrome 70+ (desktop).
 */

const PRINTER_SERVICE = '0000ff00-0000-1000-8000-00805f9b34fb'
const PRINTER_WRITE_CHAR = '0000ff02-0000-1000-8000-00805f9b34fb'

const ALT_SERVICES = [
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ae30-0000-1000-8000-00805f9b34fb',
]
const ALT_WRITE_CHARS = [
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  '0000ae01-0000-1000-8000-00805f9b34fb',
]

// #region agent log
const _dl = (msg, data) => fetch('http://127.0.0.1:7902/ingest/125efaa0-8f20-4b5f-a685-041b1c8d9b4d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d04e56'},body:JSON.stringify({sessionId:'d04e56',location:'bluetoothPrint.js',message:msg,data,timestamp:Date.now(),hypothesisId:'H7'})}).catch(()=>{});
// #endregion

/**
 * Проверяет, доступен ли Web Bluetooth API.
 */
export function isBluetoothPrintAvailable() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

/**
 * BLE: максимум ~512 байт за один write (зависит от MTU).
 * Разбиваем на чанки по 200 байт для надёжности.
 */
const BLE_CHUNK_SIZE = 200

/**
 * Ищет характеристику с записью (writeWithoutResponse или write).
 */
async function findWriteCharacteristic(server) {
  const allServices = [PRINTER_SERVICE, ...ALT_SERVICES]

  for (const svcUuid of allServices) {
    let service
    try {
      service = await server.getPrimaryService(svcUuid)
    } catch {
      continue
    }
    // #region agent log
    _dl('found service', { svcUuid })
    // #endregion

    const charsToTry = svcUuid === PRINTER_SERVICE
      ? [PRINTER_WRITE_CHAR]
      : ALT_WRITE_CHARS

    for (const charUuid of charsToTry) {
      try {
        const ch = await service.getCharacteristic(charUuid)
        if (ch.properties.writeWithoutResponse || ch.properties.write) {
          // #region agent log
          _dl('found write char', { svcUuid, charUuid, woResp: ch.properties.writeWithoutResponse, w: ch.properties.write })
          // #endregion
          return ch
        }
      } catch {
        continue
      }
    }

    try {
      const chars = await service.getCharacteristics()
      for (const ch of chars) {
        if (ch.properties.writeWithoutResponse || ch.properties.write) {
          // #region agent log
          _dl('found write char (scan)', { svcUuid, charUuid: ch.uuid, woResp: ch.properties.writeWithoutResponse, w: ch.properties.write })
          // #endregion
          return ch
        }
      }
    } catch {
      continue
    }
  }

  return null
}

/**
 * Отправляет TSPL (base64) на принтер по BLE.
 * @param {string} tsplBase64 — TSPL в кодировке CP866, закодированный в base64
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
export async function sendTsplViaBluetooth(tsplBase64) {
  // #region agent log
  _dl('sendTsplViaBluetooth called', { base64Len: tsplBase64?.length, available: isBluetoothPrintAvailable() })
  // #endregion

  if (!isBluetoothPrintAvailable()) {
    return {
      ok: false,
      error: 'Web Bluetooth недоступен. Используйте Chrome на Android или ПК.',
    }
  }

  let device
  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'XP-365B' }],
      optionalServices: [PRINTER_SERVICE, ...ALT_SERVICES],
    })
    // #region agent log
    _dl('device selected', { name: device.name, id: device.id })
    // #endregion
  } catch (err) {
    if (err.name === 'NotFoundError') {
      // Попробуем acceptAllDevices
      try {
        device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [PRINTER_SERVICE, ...ALT_SERVICES],
        })
        // #region agent log
        _dl('device selected (all)', { name: device.name, id: device.id })
        // #endregion
      } catch (err2) {
        // #region agent log
        _dl('requestDevice error (all)', { name: err2.name, message: err2.message })
        // #endregion
        return { ok: false, error: 'Принтер не выбран.' }
      }
    } else {
      // #region agent log
      _dl('requestDevice error', { name: err.name, message: err.message })
      // #endregion
      return { ok: false, error: `Bluetooth [${err.name}]: ${err.message}` }
    }
  }

  let server
  try {
    server = await device.gatt.connect()
    // #region agent log
    _dl('GATT connected', { connected: server.connected })
    // #endregion
  } catch (err) {
    // #region agent log
    _dl('GATT connect error', { name: err.name, message: err.message })
    // #endregion
    return { ok: false, error: `Bluetooth connect [${err.name}]: ${err.message}` }
  }

  try {
    const writeChar = await findWriteCharacteristic(server)
    if (!writeChar) {
      // #region agent log
      _dl('no write characteristic found', {})
      // #endregion
      server.disconnect()
      return { ok: false, error: 'Не удалось найти характеристику записи на принтере. Возможно, принтер не поддерживает BLE-печать.' }
    }

    const binary = Uint8Array.from(atob(tsplBase64), (c) => c.charCodeAt(0))
    // #region agent log
    _dl('binary ready', { byteLen: binary.length, chunks: Math.ceil(binary.length / BLE_CHUNK_SIZE) })
    // #endregion

    for (let offset = 0; offset < binary.length; offset += BLE_CHUNK_SIZE) {
      const chunk = binary.slice(offset, offset + BLE_CHUNK_SIZE)
      if (writeChar.properties.writeWithoutResponse) {
        await writeChar.writeValueWithoutResponse(chunk)
      } else {
        await writeChar.writeValueWithResponse(chunk)
      }
    }

    // #region agent log
    _dl('write complete', { totalBytes: binary.length })
    // #endregion
    return { ok: true }
  } catch (err) {
    // #region agent log
    _dl('write error', { name: err.name, message: err.message })
    // #endregion
    return { ok: false, error: `Bluetooth write [${err.name}]: ${err.message}` }
  } finally {
    try { server.disconnect() } catch { /* ignore */ }
  }
}
