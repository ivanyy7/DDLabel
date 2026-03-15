/**
 * Сборка TSPL-команд для этикетки на клиенте (офлайн, п. 8.6).
 * Раскладка совпадает с server/tsplDriver.js (калиброванные параметры).
 */

function escapeTsplString(s) {
  return String(s || '').replace(/"/g, ' ').trim() || ' '
}

/**
 * @param {{ productName: string, madeAt: Date, expiresAt: Date }} payload
 * @returns {string}
 */
export function buildTsplLabel(payload) {
  const { productName, madeAt, expiresAt } = payload
  const pad2 = (n) => String(n).padStart(2, '0')
  const madeDay = pad2(madeAt.getDate())
  const madeMonth = pad2(madeAt.getMonth() + 1)
  const madeHours = pad2(madeAt.getHours())
  const madeMinutes = pad2(madeAt.getMinutes())
  const expDay = pad2(expiresAt.getDate())
  const expMonth = pad2(expiresAt.getMonth() + 1)
  const expHours = pad2(expiresAt.getHours())
  const expMinutes = pad2(expiresAt.getMinutes())
  const name = escapeTsplString(productName)

  const lines = [
    'SIZE 30 mm,20 mm',
    'GAP 2 mm,0',
    'SPEED 4',
    'DIRECTION 1',
    'DENSITY 1',
    'CODEPAGE 866',
    'CLS',
    `TEXT 20,22,"3",0,1,2,"${name}"`,
    `TEXT 18,77,"3",0,1,2,"${madeDay}.${madeMonth}"`,
    `TEXT 145,77,"3",0,1,2,"${expDay}.${expMonth}"`,
    `TEXT 18,132,"1",0,2,2,"${madeHours}.${madeMinutes}"`,
    `TEXT 145,132,"1",0,2,2,"${expHours}.${expMinutes}"`,
    'PRINT 1',
  ]
  return `${lines.join('\r\n')}\r\n`
}

/**
 * @param {{ productName: string, madeAt: Date }} payload
 * @returns {string}
 */
export function buildTsplLabelSingle(payload) {
  const { productName, madeAt } = payload
  const pad2 = (n) => String(n).padStart(2, '0')
  const madeDay = pad2(madeAt.getDate())
  const madeMonth = pad2(madeAt.getMonth() + 1)
  const madeHours = pad2(madeAt.getHours())
  const madeMinutes = pad2(madeAt.getMinutes())
  const name = escapeTsplString(productName)
  const dateStr = `${madeDay}.${madeMonth}`
  const timeStr = `${madeHours}.${madeMinutes}`

  const lines = [
    'SIZE 30 mm,20 mm',
    'GAP 2 mm,0',
    'SPEED 4',
    'DIRECTION 1',
    'DENSITY 1',
    'CODEPAGE 866',
    'CLS',
    `TEXT 20,25,"3",0,1,2,"${name}"`,
    `TEXT 18,80,"3",0,1,2,"${dateStr}"`,
    `TEXT 120,101,"1",0,2,2,"${timeStr}"`,
    'PRINT 1',
  ]
  return `${lines.join('\r\n')}\r\n`
}
