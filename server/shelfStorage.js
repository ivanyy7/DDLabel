/**
 * Единый слой хранения справочника сроков.
 * Сейчас: JSON-файл. Позже можно заменить на SQLite, не меняя интерфейс.
 * Формат записи: { productName, value: number, unit: 'hours'|'days', labelText?: string, aliases?: string[] }
 * - unit 'days' = сутки (24 часа), не календарные дни.
 * - labelText = надпись на этикетке; если пусто — на этикетке печатается productName (правило по умолчанию).
 * - aliases = варианты названия продукта (соус красный, Красный для пиццы → один продукт «Красный соус»); поиск по ним даёт запись с productName.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FILE_PATH = path.join(DATA_DIR, 'shelf.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Читает массив записей из файла. При отсутствии файла возвращает [].
 */
function read() {
  ensureDir();
  if (!fs.existsSync(FILE_PATH)) return [];
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('[shelfStorage] Ошибка чтения:', e.message);
    return [];
  }
}

/**
 * Записывает массив в файл.
 * @throws {Error} при ошибке записи (права, диск и т.д.)
 */
function write(items) {
  ensureDir();
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(items, null, 2), 'utf8');
  } catch (e) {
    console.error('[shelfStorage] Ошибка записи:', e.message);
    throw new Error(`Не удалось сохранить справочник: ${e.message}`);
  }
}

/**
 * Возвращает все записи справочника.
 * @returns {{ productName: string, value: number, unit: 'hours'|'days' }[]}
 */
function getAll() {
  return read();
}

/**
 * Ищет запись по названию продукта или по одному из вариантов (aliases).
 * Возвращает запись с каноническим productName (для этикетки и срока).
 * @returns {{ productName: string, value: number, unit: 'hours'|'days', labelText?: string, aliases?: string[] } | null}
 */
function getByProductName(productName) {
  const key = normalizeName(productName);
  const items = read();
  const exact = items.find((r) => normalizeName(r.productName) === key);
  if (exact) return exact;
  const byAlias = items.find((r) => {
    const aliases = r.aliases || [];
    return aliases.some((a) => normalizeName(a) === key);
  });
  if (byAlias) return byAlias;
  for (const r of items) {
    const n = normalizeName(r.productName);
    if (key.startsWith(n) || key.includes(n)) return r;
  }
  return null;
}

/**
 * Возвращает срок хранения в часах по названию продукта (для расчёта этикетки).
 * @returns {number | null} часы или null, если не найден
 */
function getShelfLifeHours(productName) {
  const entry = getByProductName(productName);
  if (!entry) return null;
  if (entry.unit === 'days') return (entry.value || 0) * 24;
  return entry.value != null ? entry.value : null;
}

/**
 * Возвращает надпись для этикетки: labelText из справочника, если задан; иначе — productName (каноническое название).
 * Правило: если в столбце «На этикетке» пусто, на этикетке печатается название продукта.
 * @param {string} productName — каноническое название (из записи справочника)
 * @returns {string}
 */
function getLabelText(productName) {
  const entry = getByProductName(productName);
  const short = entry && entry.labelText != null ? String(entry.labelText).trim() : '';
  return short || (entry ? entry.productName : productName) || '';
}

/**
 * Добавляет запись. productName должен быть уникальным (по нормализованному имени).
 * @param {{ productName: string, value: number, unit: 'hours'|'days', labelText?: string, aliases?: string[] }} entry
 * @returns {{ ok: boolean, error?: string }}
 */
function add(entry) {
  const name = (entry.productName || '').trim();
  if (!name) return { ok: false, error: 'Название продукта обязательно' };
  const value = Number(entry.value);
  if (Number.isNaN(value) || value < 0) return { ok: false, error: 'Срок должен быть неотрицательным числом' };
  const unit = entry.unit === 'days' ? 'days' : 'hours';
  const labelText = entry.labelText != null ? String(entry.labelText).trim() : undefined;
  const aliases = normalizeAliases(entry.aliases);
  const items = read();
  const key = normalizeName(name);
  if (items.some((r) => normalizeName(r.productName) === key)) {
    return { ok: false, error: `Продукт «${name}» уже есть в справочнике` };
  }
  const item = { productName: name, value, unit };
  if (labelText !== undefined && labelText !== '') item.labelText = labelText;
  if (aliases.length) item.aliases = aliases;
  items.push(item);
  write(items);
  return { ok: true };
}

function normalizeAliases(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((a) => String(a).trim()).filter(Boolean);
}

/**
 * Обновляет запись по старому названию продукта.
 * @param {string} oldProductName — текущее название в справочнике
 * @param {{ productName?: string, value: number, unit: 'hours'|'days', labelText?: string, aliases?: string[] }} entry
 * @returns {{ ok: boolean, error?: string }}
 */
function update(oldProductName, entry) {
  const items = read();
  const keyOld = normalizeName(oldProductName);
  const idx = items.findIndex((r) => normalizeName(r.productName) === keyOld);
  if (idx === -1) return { ok: false, error: `Продукт «${oldProductName}» не найден` };
  const value = Number(entry.value);
  if (Number.isNaN(value) || value < 0) return { ok: false, error: 'Срок должен быть неотрицательным числом' };
  const unit = entry.unit === 'days' ? 'days' : 'hours';
  const newName = (entry.productName != null && entry.productName !== '') ? String(entry.productName).trim() : items[idx].productName;
  if (newName && normalizeName(newName) !== keyOld && items.some((r, i) => i !== idx && normalizeName(r.productName) === normalizeName(newName))) {
    return { ok: false, error: `Продукт «${newName}» уже есть в справочнике` };
  }
  let labelText = items[idx].labelText;
  if (entry.hasOwnProperty('labelText')) labelText = String(entry.labelText).trim() || undefined;
  const aliases = entry.hasOwnProperty('aliases') ? normalizeAliases(entry.aliases) : (items[idx].aliases || []);
  const item = { productName: newName || items[idx].productName, value, unit };
  if (labelText) item.labelText = labelText;
  if (aliases.length) item.aliases = aliases;
  items[idx] = item;
  write(items);
  return { ok: true };
}

/**
 * Удаляет запись по названию продукта.
 * @param {string} productName
 * @returns {{ ok: boolean, error?: string }}
 */
function remove(productName) {
  const items = read();
  const key = normalizeName(productName);
  const idx = items.findIndex((r) => normalizeName(r.productName) === key);
  if (idx === -1) return { ok: false, error: `Продукт «${productName}» не найден` };
  items.splice(idx, 1);
  write(items);
  return { ok: true };
}

module.exports = {
  getAll,
  getByProductName,
  getShelfLifeHours,
  getLabelText,
  add,
  update,
  remove,
  read,
  write
};
