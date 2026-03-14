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

let _cachedDevice = null

/**
 * Проверяет, доступен ли Web Bluetooth API.
 */
export function isBluetoothPrintAvailable() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

const BLE_CHUNK_SIZE = 200

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
          _dl('found write char', { svcUuid, charUuid })
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
          _dl('found write char (scan)', { svcUuid, charUuid: ch.uuid })
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
 * Получает BLE-устройство: из кеша, через getDevices(), или через requestDevice().
 * requestDevice() требует user gesture; getDevices() и reconnect — нет.
 */
async function getOrRequestDevice() {
  if (_cachedDevice) {
    try {
      if (_cachedDevice.gatt.connected) {
        // #region agent log
        _dl('using cached device (connected)', { name: _cachedDevice.name })
        // #endregion
        return _cachedDevice
      }
      await _cachedDevice.gatt.connect()
      // #region agent log
      _dl('reconnected cached device', { name: _cachedDevice.name })
      // #endregion
      return _cachedDevice
    } catch {
      _cachedDevice = null
    }
  }

  // #region agent log
  const gdType = typeof (navigator.bluetooth.getDevices)
  window._btLog = 'gd:' + gdType
  _dl('getDevices type check', { type: gdType })
  // #endregion

  if (gdType === 'function') {
    try {
      const devices = await navigator.bluetooth.getDevices()
      // #region agent log
      window._btLog = 'gd:' + devices.length + '[' + devices.map(d => d.name).join(',') + ']'
      _dl('getDevices result', { count: devices.length, names: devices.map(d => d.name) })
      // #endregion
      for (const d of devices) {
        if (d.name && d.name.startsWith('XP-')) {
          try {
            await d.gatt.connect()
            _cachedDevice = d
            // #region agent log
            window._btLog += '→ok'
            _dl('reconnected via direct connect', { name: d.name })
            // #endregion
            return d
          } catch (e1) {
            // #region agent log
            window._btLog += '→err(' + e1.message.slice(0, 40) + ')'
            _dl('direct connect failed', { name: d.name, err: e1.message })
            // #endregion
          }
          if (d.watchAdvertisements) {
            try {
              const ac = new AbortController()
              await d.watchAdvertisements({ signal: ac.signal })
              await new Promise((resolve, reject) => {
                const t = setTimeout(() => { ac.abort(); reject(new Error('ad-timeout')) }, 4000)
                d.addEventListener('advertisementreceived', () => { clearTimeout(t); ac.abort(); resolve() }, { once: true })
              })
              await d.gatt.connect()
              _cachedDevice = d
              // #region agent log
              window._btLog += '→wAd ok'
              // #endregion
              return d
            } catch (e2) {
              // #region agent log
              window._btLog += '→wAd err(' + e2.message.slice(0, 30) + ')'
              // #endregion
              continue
            }
          }
        }
      }
    } catch (e) {
      // #region agent log
      window._btLog = 'gd ERR:' + e.name + ':' + e.message
      _dl('getDevices error', { err: e.message })
      // #endregion
    }
  }

  const device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: 'XP-' }],
    optionalServices: [PRINTER_SERVICE, ...ALT_SERVICES],
  })
  _cachedDevice = device
  // #region agent log
  _dl('device selected via picker', { name: device.name })
  // #endregion
  return device
}

/**
 * Отправляет TSPL (base64) на принтер по BLE.
 */
export async function sendTsplViaBluetooth(tsplBase64) {
  // #region agent log
  _dl('sendTsplViaBluetooth called', { base64Len: tsplBase64?.length, hasCached: !!_cachedDevice })
  // #endregion

  if (!isBluetoothPrintAvailable()) {
    return {
      ok: false,
      error: 'Web Bluetooth недоступен. Используйте Chrome на Android или ПК.',
    }
  }

  let device
  try {
    device = await getOrRequestDevice()
  } catch (err) {
    // #region agent log
    _dl('getOrRequestDevice error', { name: err.name, message: err.message })
    // #endregion
    if (err.name === 'SecurityError') {
      return { ok: false, error: 'Первое подключение к принтеру — нажмите «на Печать» вручную (нужен клик).' }
    }
    return { ok: false, error: `Bluetooth [${err.name}]: ${err.message}` }
  }

  let server
  try {
    server = device.gatt.connected ? device.gatt : await device.gatt.connect()
    // #region agent log
    _dl('GATT connected', { connected: server.connected })
    // #endregion
  } catch (err) {
    // #region agent log
    _dl('GATT connect error', { name: err.name, message: err.message })
    // #endregion
    _cachedDevice = null
    return { ok: false, error: `Bluetooth connect [${err.name}]: ${err.message}` }
  }

  try {
    const writeChar = await findWriteCharacteristic(server)
    if (!writeChar) {
      // #region agent log
      _dl('no write characteristic found', {})
      // #endregion
      return { ok: false, error: 'Не найдена характеристика записи на принтере.' }
    }

    const binary = Uint8Array.from(atob(tsplBase64), (c) => c.charCodeAt(0))
    // #region agent log
    _dl('binary ready', { byteLen: binary.length })
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
  }
}
