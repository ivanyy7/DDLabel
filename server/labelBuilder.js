/**
 * Формирование этикетки по docs/label-format.md.
 * Название по центру; даты и время в две колонки (начало | ∞ | окончание).
 * Форматы: дата ДД.ММ, время ЧЧ.ММ.
 */

const WIDTH = 16; // ширина этикетки в символах (30 мм, ориентир)

/**
 * Форматирует дату в ДД.ММ
 * @param {Date} d
 * @returns {string}
 */
function formatDate(d) {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
}

/**
 * Форматирует время в ЧЧ.ММ (24 ч)
 * @param {Date} d
 * @returns {string}
 */
function formatTime(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}.${m}`;
}

/**
 * Собирает одну строку в две колонки: left | center | right (в пределах WIDTH)
 */
function twoColumnLine(left, center, right) {
  const half = Math.floor((WIDTH - center.length) / 2);
  const leftPart = left.slice(0, half).padEnd(half, ' ');
  const rightPart = right.slice(-half).padStart(half, ' ');
  const centerStart = leftPart.length;
  const afterCenter = centerStart + center.length;
  const spacesBeforeRight = WIDTH - afterCenter - rightPart.length;
  return leftPart + center + ' '.repeat(Math.max(0, spacesBeforeRight)) + rightPart;
}

/**
 * Печатает этикетку на переданном принтере (escpos.Printer).
 * productLabelText — надпись на этикетке (сокращение из справочника или productName).
 * @param {object} printer — экземпляр escpos.Printer
 * @param {{ productName: string, productLabelText?: string, madeAt: Date, expiresAt: Date }} data
 */
function printLabel(printer, data) {
  const { productLabelText, productName, madeAt, expiresAt } = data;
  const nameForLabel = (productLabelText != null && String(productLabelText).trim()) ? String(productLabelText).trim() : (productName || '');
  const dateMade = formatDate(madeAt);
  const dateExp = formatDate(expiresAt);
  const timeMade = formatTime(madeAt);
  const timeExp = formatTime(expiresAt);
  // Символ «от — до»: ∞ (если принтер не поддерживает — заменить на "~")
  const centerSymbol = '\u221E';

  const nameLine = nameForLabel.length > WIDTH ? nameForLabel.slice(0, WIDTH) : nameForLabel;

  // Название: по центру, жирный, подчёркивание
  printer.align('ct').style('bu').size(1, 1).text(nameLine).style('normal').size(1, 1);

  // Даты: две колонки, жирный, крупнее
  const dateLine = twoColumnLine(dateMade, centerSymbol, dateExp);
  printer.align('lt').style('b').size(2, 2).text(dateLine).style('normal').size(1, 1);

  // Время: две колонки, жирный, подчёркивание
  const timeLine = twoColumnLine(timeMade, ' ', timeExp);
  printer.align('lt').style('bu').size(1, 1).text(timeLine);

  printer.cut();
}

module.exports = { printLabel, formatDate, formatTime, twoColumnLine, WIDTH };
