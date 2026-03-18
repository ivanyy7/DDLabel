/**
 * Единый слой хранения справочника сроков.
 * Локально: JSON-файл (fs). На Vercel: Vercel Blob.
 *
 * Формат записи:
 *   { id, order, productName, value: number, unit: 'hours'|'days', labelText?: string, aliases?: string[] }
 *
 * Формат хранилища (shelf.json):
 *   { version: number, updatedAt: ISO-string, items: [...] }
 *
 * Старый формат (голый массив) мигрирует автоматически при первом чтении.
 */

const fs = require('fs');
const path = require('path');

const isVercel = !!process.env.VERCEL;
const DATA_DIR = path.join(__dirname, 'data');
const FILE_PATH = path.join(DATA_DIR, 'shelf.json');
const BLOB_PATH = 'shelf.json';

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** Генерация стабильного короткого id без внешних зависимостей */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    // В парсере дефис/тире заменяется на пробел, поэтому и здесь приводим к единому виду.
    .replace(/[\u2010-\u2015\u2212\uFE58-\uFE63\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeName(name) {
  const norm = normalizeName(name);
  if (!norm) return [];
  return norm.split(' ');
}

function normalizeAliases(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((a) => String(a).trim()).filter(Boolean);
}

/**
 * Мигрирует данные в новый формат-обёртку.
 * Если данные — уже обёртка ({ version, items }) — возвращает как есть (с дозаполнением полей).
 * Если данные — голый массив — оборачивает и назначает id/order элементам без них.
 */
function migrate(raw) {
  const now = new Date().toISOString();

  // Новый формат
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.items)) {
    const items = raw.items.map((item, idx) => ({
      id: item.id || generateId(),
      order: item.order != null ? item.order : idx * 10,
      ...item,
    }));
    return {
      version: raw.version || 1,
      updatedAt: raw.updatedAt || now,
      items,
    };
  }

  // Старый формат — голый массив
  const arr = Array.isArray(raw) ? raw : [];
  const items = arr.map((item, idx) => ({
    id: item.id || generateId(),
    order: item.order != null ? item.order : idx * 10,
    ...item,
  }));
  return { version: 1, updatedAt: now, items };
}

// ─── Локальное хранение ────────────────────────────────────────────────────

function readLocalFull() {
  ensureDir();
  if (!fs.existsSync(FILE_PATH)) return migrate([]);
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.error('[shelfStorage] Ошибка чтения:', e.message);
    return migrate([]);
  }
}

function writeLocalFull(wrapper) {
  ensureDir();
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(wrapper, null, 2), 'utf8');
  } catch (e) {
    console.error('[shelfStorage] Ошибка записи:', e.message);
    throw new Error(`Не удалось сохранить справочник: ${e.message}`);
  }
}

// ─── Публичные async-функции хранилища ────────────────────────────────────

/** Полное чтение: { version, updatedAt, items } */
function readFull() {
  if (!isVercel) return Promise.resolve(readLocalFull());
  return (async () => {
    try {
      const { get } = await import('@vercel/blob');
      const result = await get(BLOB_PATH, { access: 'public' });
      if (!result || result.statusCode !== 200 || !result.stream) return migrate([]);
      const reader = result.stream.getReader();
      const chunks = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      return migrate(JSON.parse(raw));
    } catch (e) {
      if (e.code === 'BLOB_NOT_FOUND' || e.message?.includes('not found') || e.message?.includes('404')) return migrate([]);
      console.error('[shelfStorage] Ошибка чтения Blob:', e.message);
      return migrate([]);
    }
  })();
}

/** Полная запись обёртки { version, updatedAt, items } */
function writeFull(wrapper) {
  if (!isVercel) {
    writeLocalFull(wrapper);
    return Promise.resolve();
  }
  return (async () => {
    try {
      const { put } = await import('@vercel/blob');
      await put(BLOB_PATH, JSON.stringify(wrapper, null, 2), {
        access: 'public',
        allowOverwrite: true,
        cacheControlMaxAge: 0,
      });
    } catch (e) {
      console.error('[shelfStorage] Ошибка записи Blob:', e.message);
      throw new Error(`Не удалось сохранить справочник: ${e.message}`);
    }
  })();
}

/**
 * Читает только массив записей (backward-compat для внешних вызовов).
 * Записи отсортированы по order (ASC).
 */
async function read() {
  const full = await readFull();
  return [...full.items].sort((a, b) => a.order - b.order);
}

/**
 * Записывает массив записей; обновляет version и updatedAt.
 * Backward-compat: используется в shelf-import и старых вызовах.
 * При вызове через shelf-import передавайте items с уже сгенерированными id/order.
 */
async function write(items) {
  const full = await readFull();
  const now = new Date().toISOString();
  await writeFull({ version: (full.version || 0) + 1, updatedAt: now, items });
}

// ─── Экспортируемые функции ────────────────────────────────────────────────

/** Все записи, отсортированные по order */
async function getAll() {
  return read();
}

/** version и updatedAt справочника */
async function getVersion() {
  const full = await readFull();
  return { version: full.version, updatedAt: full.updatedAt };
}

async function getByProductName(productName) {
  const key = normalizeName(productName);
  const items = await read();
  const exact = items.find((r) => normalizeName(r.productName) === key);
  if (exact) {
    return exact;
  }
  const byAlias = items.find((r) => {
    const aliases = r.aliases || [];
    return aliases.some((a) => normalizeName(a) === key);
  });
  if (byAlias) {
    return byAlias;
  }

  const keyTokens = tokenizeName(productName);
  if (keyTokens.length) {
    for (const r of items) {
      const nameTokens = tokenizeName(r.productName);
      if (!nameTokens.length) continue;
      // Для "Соус Чили" vs "Соус Чили-Манго" нельзя принимать совпадение по принципу:
      // "имя кандидата - подмножество входа". Нужна строгая проверка: все токены ввода должны
      // быть в кандидате.
      const allKeyInName = keyTokens.every((t) => nameTokens.includes(t));
      if (allKeyInName) {
        return r;
      }
      const aliasTokensMatch = (r.aliases || []).some((alias) => {
        const aTokens = tokenizeName(alias);
        if (!aTokens.length) return false;
        return keyTokens.every((t) => aTokens.includes(t)) || aTokens.every((t) => keyTokens.includes(t));
      });
      if (aliasTokensMatch) {
        return r;
      }
    }
  }

  for (const r of items) {
    const n = normalizeName(r.productName);
    if (key.startsWith(n) || key.includes(n)) {
      // substring fallback слишком широкий: например "соус чили" внутри "соус чили манго".
      // Разрешаем его только если количество токенов совпадает и все токены кандидата есть во входе.
      const nameTokens = tokenizeName(r.productName);
      const allNameTokensInKey = nameTokens.every((t) => keyTokens.includes(t));
      if (!allNameTokensInKey || nameTokens.length !== keyTokens.length) continue;
      return r;
    }
  }
  return null;
}

async function getShelfLifeHours(productName) {
  const entry = await getByProductName(productName);
  if (!entry) return null;
  if (entry.unit === 'days') return (entry.value || 0) * 24;
  return entry.value != null ? entry.value : null;
}

async function getLabelText(productName) {
  const entry = await getByProductName(productName);
  const short = entry && entry.labelText != null ? String(entry.labelText).trim() : '';
  return short || (entry ? entry.productName : productName) || '';
}

async function add(entry) {
  const name = (entry.productName || '').trim();
  if (!name) return { ok: false, error: 'Название продукта обязательно' };
  const value = Number(entry.value);
  if (Number.isNaN(value) || value < 0) return { ok: false, error: 'Срок должен быть неотрицательным числом' };
  const unit = entry.unit === 'days' ? 'days' : 'hours';
  const labelText = entry.labelText != null ? String(entry.labelText).trim() : undefined;
  const aliases = normalizeAliases(entry.aliases);

  const full = await readFull();
  const items = full.items;
  const key = normalizeName(name);
  if (items.some((r) => normalizeName(r.productName) === key)) {
    return { ok: false, error: `Продукт «${name}» уже есть в справочнике` };
  }

  const maxOrder = items.length ? Math.max(...items.map((r) => r.order || 0)) : -10;
  const newItem = { id: generateId(), order: maxOrder + 10, productName: name, value, unit };
  if (labelText !== undefined && labelText !== '') newItem.labelText = labelText;
  if (aliases.length) newItem.aliases = aliases;
  items.push(newItem);

  const now = new Date().toISOString();
  await writeFull({ version: (full.version || 0) + 1, updatedAt: now, items });
  return { ok: true };
}

async function update(oldProductName, entry) {
  const full = await readFull();
  const items = full.items;
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
  if (Object.prototype.hasOwnProperty.call(entry, 'labelText')) labelText = String(entry.labelText).trim() || undefined;
  const aliases = Object.prototype.hasOwnProperty.call(entry, 'aliases') ? normalizeAliases(entry.aliases) : (items[idx].aliases || []);

  // Сохраняем id и order без изменений
  const updatedItem = {
    id: items[idx].id || generateId(),
    order: items[idx].order != null ? items[idx].order : idx * 10,
    productName: newName || items[idx].productName,
    value,
    unit,
  };
  if (labelText) updatedItem.labelText = labelText;
  if (aliases.length) updatedItem.aliases = aliases;
  items[idx] = updatedItem;

  const now = new Date().toISOString();
  await writeFull({ version: (full.version || 0) + 1, updatedAt: now, items });
  return { ok: true };
}

async function remove(productName) {
  const full = await readFull();
  const items = full.items;
  const key = normalizeName(productName);
  const idx = items.findIndex((r) => normalizeName(r.productName) === key);
  if (idx === -1) return { ok: false, error: `Продукт «${productName}» не найден` };
  items.splice(idx, 1);
  const now = new Date().toISOString();
  await writeFull({ version: (full.version || 0) + 1, updatedAt: now, items });
  return { ok: true };
}

/**
 * Изменяет порядок записей по массиву id.
 * Проверяет version для защиты от перезаписи чужих изменений.
 * @param {string[]} orderedIds - массив id в новом порядке
 * @param {number} clientVersion - версия, которую видел клиент
 * @returns {{ ok: boolean, error?: string, conflict?: boolean }}
 */
async function reorder(orderedIds, clientVersion) {
  const full = await readFull();
  if (clientVersion != null && full.version !== clientVersion) {
    return { ok: false, conflict: true, error: 'Справочник изменился на сервере. Обновите список и повторите.' };
  }

  const itemsById = new Map(full.items.map((item) => [item.id, item]));
  const reordered = [];

  // Сначала расставляем элементы из orderedIds
  orderedIds.forEach((id, idx) => {
    const item = itemsById.get(id);
    if (item) {
      reordered.push({ ...item, order: idx * 10 });
      itemsById.delete(id);
    }
  });

  // Элементы, которых нет в orderedIds (добавлены с другого устройства) — в конец
  const remaining = [...itemsById.values()];
  const maxOrder = reordered.length ? (reordered.length - 1) * 10 : -10;
  remaining.forEach((item, idx) => {
    reordered.push({ ...item, order: maxOrder + (idx + 1) * 10 });
  });

  const now = new Date().toISOString();
  await writeFull({ version: full.version + 1, updatedAt: now, items: reordered });
  return { ok: true };
}

module.exports = {
  getAll,
  getVersion,
  getByProductName,
  getShelfLifeHours,
  getLabelText,
  add,
  update,
  remove,
  reorder,
  read,
  write,
  readFull,
  writeFull,
};
