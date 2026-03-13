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
 * Формирует TSPL-команды для рабочей этикетки 30×20 мм.
 * Координаты в точках (203 dpi): ширина ~240, высота ~160.
 * Использует те же калиброванные параметры, что и тестовая печать:
 *   - название: шрифт 3, sy=2, x=20, y=25
 *   - даты: шрифт 3, sy=2, x=18/145, y=80
 *   - время: шрифт 1, sx=2, sy=2, x=18/145, y=135
 * DENSITY=1, SPEED=4 — оптимальные значения для тонких, но читаемых линий.
 *
 * @param {{ productName: string, madeAt: Date, expiresAt: Date }} payload
 * @returns {string} Строка с командами TSPL, разделёнными переводами строк.
 */
function buildTsplLabel(payload) {
  const { productName, madeAt, expiresAt } = payload;

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
    'SPEED 4',
    'DIRECTION 1',
    'DENSITY 1',
    'CODEPAGE 866',
    'CLS',
    // Название продукта (верх)
    `TEXT 20,25,"3",0,1,2,"${name}"`,
    // Даты
    `TEXT 18,80,"3",0,1,2,"${madeDay}.${madeMonth}"`,
    `TEXT 145,80,"3",0,1,2,"${expDay}.${expMonth}"`,
    // Время
    `TEXT 18,135,"1",0,2,2,"${madeHours}.${madeMinutes}"`,
    `TEXT 145,135,"1",0,2,2,"${expHours}.${expMinutes}"`,
    'PRINT 1',
  ];

  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Одиночный режим: название + дата изготовления + время изготовления.
 * Строка 1: название. Строка 2: дата слева, время справа (в одну строку).
 * Без расчёта срока годности, без второй пары дата/время.
 *
 * @param {{ productName: string, madeAt: Date }} payload
 * @returns {string} Строка с командами TSPL.
 */
function buildTsplLabelSingle(payload) {
  const { productName, madeAt } = payload;

  const pad2 = (n) => String(n).padStart(2, '0');
  const madeDay = pad2(madeAt.getDate());
  const madeMonth = pad2(madeAt.getMonth() + 1);
  const madeHours = pad2(madeAt.getHours());
  const madeMinutes = pad2(madeAt.getMinutes());

  const name = escapeTsplString(productName);
  const dateStr = `${madeDay}.${madeMonth}`;
  const timeStr = `${madeHours}.${madeMinutes}`;

  const lines = [
    'SIZE 30 mm,20 mm',
    'GAP 2 mm,0',
    'SPEED 4',
    'DIRECTION 1',
    'DENSITY 1',
    'CODEPAGE 866',
    'CLS',
    // Название продукта (верх)
    `TEXT 20,25,"3",0,1,2,"${name}"`,
    // Дата и время в одну строку: дата слева (x=18), время справа (x=120)
    `TEXT 18,80,"3",0,1,2,"${dateStr}"`,
    `TEXT 120,80,"1",0,2,2,"${timeStr}"`,
    'PRINT 1',
  ];

  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Встроенные шрифты TSPL (XP-365B, 203 dpi).
 * Ключ = номер шрифта для команды TEXT.
 */
const TSPL_FONTS = {
  '1': { w: 8,  h: 12, name: '1 — 8×12 (мелкий)' },
  '2': { w: 12, h: 20, name: '2 — 12×20 (стандартный)' },
  '3': { w: 16, h: 24, name: '3 — 16×24 (средний)' },
  '4': { w: 24, h: 32, name: '4 — 24×32 (крупный)' },
  '5': { w: 32, h: 48, name: '5 — 32×48 (очень крупный)' },
  '8': { w: 14, h: 25, name: '8 — 14×25 (жирный)' },
};

/**
 * Тестовый TSPL-шаблон для КАЛИБРОВКИ.
 * Все параметры — прямые значения TSPL без конвертаций из CSS:
 *   font — номер встроенного шрифта ("1"–"5", "8")
 *   sx, sy — целочисленный масштаб (1–10)
 *   x, y — координаты в точках (203 dpi, этикетка ≈240×160)
 *   density — плотность печати (1–15)
 */
function buildTsplTestDates(payload) {
  const {
    madeAt,
    expiresAt,
    density = 8,
    speed = 4,
    titleText = '',
    fontTitle = '2',
    sxTitle = 1,
    syTitle = 1,
    xTitle = 10,
    yTitle = 5,
    fontLeft = '2',
    sxLeft = 1,
    syLeft = 1,
    xLeft = 10,
    yLeft = 60,
    fontRight = '2',
    sxRight = 1,
    syRight = 1,
    xRight = 140,
    yRight = 60,
    fontTimeLeft = '3',
    sxTimeLeft = 1,
    syTimeLeft = 1,
    xTimeLeft = 20,
    yTimeLeft = 125,
    fontTimeRight = '3',
    sxTimeRight = 1,
    syTimeRight = 1,
    xTimeRight = 150,
    yTimeRight = 125,
  } = payload;

  const pad2 = (n) => String(n).padStart(2, '0');
  const madeDay = pad2(madeAt.getDate());
  const madeMonth = pad2(madeAt.getMonth() + 1);
  const madeHours = pad2(madeAt.getHours());
  const madeMinutes = pad2(madeAt.getMinutes());
  const expDay = pad2(expiresAt.getDate());
  const expMonth = pad2(expiresAt.getMonth() + 1);
  const expHours = pad2(expiresAt.getHours());
  const expMinutes = pad2(expiresAt.getMinutes());

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || lo));
  const fT = TSPL_FONTS[String(fontTitle)] ? String(fontTitle) : '2';
  const fL = TSPL_FONTS[String(fontLeft)] ? String(fontLeft) : '2';
  const fR = TSPL_FONTS[String(fontRight)] ? String(fontRight) : '2';
  const fTL = TSPL_FONTS[String(fontTimeLeft)] ? String(fontTimeLeft) : '3';
  const fTR = TSPL_FONTS[String(fontTimeRight)] ? String(fontTimeRight) : '3';
  const _sxT = clamp(sxTitle, 1, 10);
  const _syT = clamp(syTitle, 1, 10);
  const _sxL = clamp(sxLeft, 1, 10);
  const _syL = clamp(syLeft, 1, 10);
  const _sxR = clamp(sxRight, 1, 10);
  const _syR = clamp(syRight, 1, 10);
  const _sxTL = clamp(sxTimeLeft, 1, 10);
  const _syTL = clamp(syTimeLeft, 1, 10);
  const _sxTR = clamp(sxTimeRight, 1, 10);
  const _syTR = clamp(syTimeRight, 1, 10);
  const _xT = clamp(xTitle, 0, 240);
  const _yT = clamp(yTitle, 0, 160);
  const _xL = clamp(xLeft, 0, 240);
  const _yL = clamp(yLeft, 0, 160);
  const _xR = clamp(xRight, 0, 240);
  const _yR = clamp(yRight, 0, 160);
  const _xTL = clamp(xTimeLeft, 0, 240);
  const _yTL = clamp(yTimeLeft, 0, 160);
  const _xTR = clamp(xTimeRight, 0, 240);
  const _yTR = clamp(yTimeRight, 0, 160);
  const _density = clamp(density, 0, 15);
  const _speed = clamp(speed, 1, 5);

  const title = escapeTsplString(titleText);

  const lines = [
    'SIZE 30 mm,20 mm',
    'GAP 2 mm,0',
    `SPEED ${_speed}`,
    'DIRECTION 1',
    `DENSITY ${_density}`,
    'CODEPAGE 866',
    'CLS',
  ];

  if (titleText && titleText.trim()) {
    lines.push(`TEXT ${_xT},${_yT},"${fT}",0,${_sxT},${_syT},"${title}"`);
  }

  lines.push(
    `TEXT ${_xL},${_yL},"${fL}",0,${_sxL},${_syL},"${madeDay}.${madeMonth}"`,
    `TEXT ${_xR},${_yR},"${fR}",0,${_sxR},${_syR},"${expDay}.${expMonth}"`,
    `TEXT ${_xTL},${_yTL},"${fTL}",0,${_sxTL},${_syTL},"${madeHours}.${madeMinutes}"`,
    `TEXT ${_xTR},${_yTR},"${fTR}",0,${_sxTR},${_syTR},"${expHours}.${expMinutes}"`,
    'PRINT 1',
  );

  return `${lines.join('\r\n')}\r\n`;
}

module.exports = {
  buildTsplLabel,
  buildTsplLabelSingle,
  buildTsplTestDates,
  TSPL_FONTS,
};

