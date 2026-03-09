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
    // --- Середина: даты слева и справа (шрифт "2" — легче, не расплывается) ---
    'SETBOLD 0',
    `TEXT 20,70,"2",0,2,2,"${madeDay}.${madeMonth}"`,
    'TEXT 120,75,"0",0,1,1,"oo"',
    `TEXT 165,70,"2",0,2,2,"${expDay}.${expMonth}"`,
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

/**
 * Тестовый TSPL-шаблон для КАЛИБРОВКИ только СРЕДНЕГО РЯДА:
 * печатаем ТОЛЬКО две даты. Никакого названия продукта и времени.
 *
 * ВАЖНО: здесь нет «магии» — каждый параметр идёт 1:1 из ползунков:
 * - sizeLeft/sizeRight (пиксели в UI) → syLeft/syRight (масштаб по высоте);
 * - stretchLeft/right (ползунок -6…6) → sxLeft/sxRight (масштаб по X), тонкая настройка;
 * - offsetX/offsetY (ползунки) → линейный сдвиг координат.
 *
 * Одну и ту же формулу используем и в превью (через CSS), и в TSPL.
 */
function buildTsplTestDates(payload) {
  const {
    madeAt,
    expiresAt,
    darkness = 10,
    sizeLeft,
    sizeRight,
    offsetXLeft,
    offsetYLeft,
    offsetXRight,
    offsetYRight,
    stretchLeft,
    stretchRight,
  } = payload;

  const pad2 = (n) => String(n).padStart(2, '0');
  const madeDay = pad2(madeAt.getDate());
  const madeMonth = pad2(madeAt.getMonth() + 1);
  const expDay = pad2(expiresAt.getDate());
  const expMonth = pad2(expiresAt.getMonth() + 1);

  // 1) Размер/высота: из «пикселей» (10–60) считаем масштаб TSPL.
  // Используем floor, чтобы 37 и 38 (и соседние значения) не давали скачок 2→3 — иначе этикетка «прыгает» вверх/вниз.
  const toSy = (uiSize) => {
    const v = Number(uiSize) || 32;
    return Math.max(1, Math.min(6, Math.floor(v / 15))); // 15–29→1, 30–44→2, 45–59→3, …
  };
  const syLeft = toSy(sizeLeft);
  const syRight = toSy(sizeRight);

  // 2) Сжатие/растяжение: слайдер -6…6 → тонкая настройка ширины (уже ↔ шире).
  const sL = Math.max(-6, Math.min(6, Number(stretchLeft) || 0));
  const sR = Math.max(-6, Math.min(6, Number(stretchRight) || 0));
  const sxLeft = Math.max(1, Math.min(8, syLeft + sL));
  const sxRight = Math.max(1, Math.min(8, syRight + sR));

  // 3) Координаты: базовые точки + линейный сдвиг из ползунков.
  const baseXLeft = 20;
  const baseXRight = 155;
  const baseY = 80;

  // Превью 300×200 px ↔ реальная область ~240×160 точек → коэффициент 0.8
  const kx = 0.8;
  const ky = 0.8;

  const dxLeft = Number(offsetXLeft) || 0;
  const dyLeft = Number(offsetYLeft) || 0;
  const dxRight = Number(offsetXRight) || 0;
  const dyRight = Number(offsetYRight) || 0;

  let xLeft = Math.round(baseXLeft + dxLeft * kx);
  const yLeft = Math.round(baseY + dyLeft * ky);
  let xRight = Math.round(baseXRight + dxRight * kx);
  const yRight = Math.round(baseY + dyRight * ky);

  // Запрет наложения: правая дата не ближе чем minGap точек к левой.
  const minGap = 70;
  if (xRight < xLeft + minGap) {
    xRight = xLeft + minGap;
  }
  // Правая дата не уезжает левее середины этикетки (~120), иначе налезает.
  if (xRight < 100) {
    xRight = 100;
  }

  // Шрифт дат: "2" обычно легче "0"/"1" — меньше «расплывания» при быстром просмотре.
  const dateFont = '2';

  const lines = [
    'SIZE 30 mm,20 mm',
    'GAP 2 mm,0',
    'DIRECTION 1',
    `DENSITY ${darkness}`,
    'CODEPAGE 866',
    'CLS',
    'SETBOLD 0',
    'UNDERLINE OFF',
    `TEXT ${xLeft},${yLeft},"${dateFont}",0,${sxLeft},${syLeft},"${madeDay}.${madeMonth}"`,
    `TEXT ${xRight},${yRight},"${dateFont}",0,${sxRight},${syRight},"${expDay}.${expMonth}"`,
    'PRINT 1',
  ];

  return `${lines.join('\r\n')}\r\n`;
}

module.exports = {
  buildTsplLabel,
  buildTsplTestDates,
};

