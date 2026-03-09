/**
 * Драйвер печати этикеток для Xprinter XP-365B на языке TSPL/TSPL2.
 * Вариант для распечатки: раскладка по эталону 30×20 мм
 * (название сверху, даты по центру, времена снизу).
 */

/** Экранируем кавычки в строке для TSPL */
function escapeTsplString(s) {
  return String(s || '').replace(/"/g, ' ').trim() || ' ';
}

/**
 * Формирует TSPL-команды для печати одной этикетки 30×20 мм.
 * Координаты в точках (203 dpi): ширина ~240, высота ~160.
 * @param {{ productName: string, madeAt: Date, expiresAt: Date, darkness?: number }} payload
 * @returns {string} Строка с командами TSPL, разделёнными переводами строк.
 */
function buildTsplLabel(payload) {
  const { productName, madeAt, expiresAt, darkness = 10 } = payload;

  const pad2 = (n) => String(n).padStart(2, '0');
  const madeDay = pad2(madeAt.getDate());
  const madeMonth = pad2(madeAt.getMonth() + 1);
  const madeHours = pad2(madeAt.getHours());
  const madeMinutes = pad2(madeAt.getMinutes());
  const expDay = pad2(expiresAt.getDate());
  const expMonth = pad2(expiresAt.getMonth() + 1);
  const expHours = pad2(expiresAt.getHours());
  const expMinutes = pad2(expiresAt.getMinutes());

  const name = escapeTsplString(productName);

  const lines = [
    'SIZE 30 mm,20 mm',
    'GAP 2 mm,0',
    'DIRECTION 1',
    `DENSITY ${darkness}`,
    'CODEPAGE 866',
    'CLS',
    // --- Верх: название продукта, по центру, жирный + подчёркнутый ---
    'SETBOLD 1',
    'UNDERLINE ON',
    // Чуть ниже и поменьше, чтобы точно влезло
    `TEXT 20,15,"0",0,1,1,"${name}"`,
    'SETBOLD 0',
    'UNDERLINE OFF',
    // --- Середина: даты слева и справа, между ними ∞ ---
    // Опускаем немного ниже, делаем крупными
    `TEXT 20,70,"0",0,2,2,"${madeDay}.${madeMonth}"`,
    'TEXT 120,75,"0",0,1,1,"oo"',
    `TEXT 165,70,"0",0,2,2,"${expDay}.${expMonth}"`,
    // --- Низ: время слева и справа, подчёркнутые ---
    'SETBOLD 1',
    'UNDERLINE ON',
    // Делаем время крупнее и ближе к нижней кромке
    `TEXT 25,120,"0",0,2,2,"${madeHours}.${madeMinutes}"`,
    `TEXT 165,120,"0",0,2,2,"${expHours}.${expMinutes}"`,
    'SETBOLD 0',
    'UNDERLINE OFF',
    'PRINT 1',
  ];

  return `${lines.join('\r\n')}\r\n`;
}

module.exports = {
  buildTsplLabel,
};

