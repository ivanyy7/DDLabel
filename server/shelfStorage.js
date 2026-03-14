/**
 * Единый слой хранения справочника сроков.
 * Локально: JSON-файл (fs). На Vercel: Vercel Blob.
 * Формат записи: { productName, value: number, unit: 'hours'|'days', labelText?: string, aliases?: string[] }
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

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenizeName(name) {
  const norm = normalizeName(name);
  if (!norm) return [];
  return norm.split(' ');
}

/** Локальное чтение (sync) */
function readLocal() {
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

/** Локальная запись (sync) */
function writeLocal(items) {
  ensureDir();
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(items, null, 2), 'utf8');
  } catch (e) {
    console.error('[shelfStorage] Ошибка записи:', e.message);
    throw new Error(`Не удалось сохранить справочник: ${e.message}`);
  }
}

/** Чтение: локально sync, на Vercel — Blob (async) */
function read() {
  if (!isVercel) return Promise.resolve(readLocal());
  return (async () => {
    try {
      const { get } = await import('@vercel/blob');
      const result = await get(BLOB_PATH, { access: 'public' });
      if (!result) return [];
      const raw = await result.text();
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      if (e.code === 'BLOB_NOT_FOUND' || e.message?.includes('not found') || e.message?.includes('404')) return [];
      console.error('[shelfStorage] Ошибка чтения Blob:', e.message);
      return [];
    }
  })();
}

/** Запись: локально sync, на Vercel — Blob (async) */
function write(items) {
  if (!isVercel) {
    writeLocal(items);
    return Promise.resolve();
  }
  return (async () => {
    try {
      const { put } = await import('@vercel/blob');
      await put(BLOB_PATH, JSON.stringify(items, null, 2), { access: 'public', allowOverwrite: true, cacheControlMaxAge: 60 });
    } catch (e) {
      console.error('[shelfStorage] Ошибка записи Blob:', e.message);
      throw new Error(`Не удалось сохранить справочник: ${e.message}`);
    }
  })();
}

async function getAll() {
  return read();
}

async function getByProductName(productName) {
  const key = normalizeName(productName);
  const items = await read();
  const exact = items.find((r) => normalizeName(r.productName) === key);
  if (exact) return exact;
  const byAlias = items.find((r) => {
    const aliases = r.aliases || [];
    return aliases.some((a) => normalizeName(a) === key);
  });
  if (byAlias) return byAlias;

  const keyTokens = tokenizeName(productName);
  if (keyTokens.length) {
    for (const r of items) {
      const nameTokens = tokenizeName(r.productName);
      if (!nameTokens.length) continue;
      const allKeyInName = keyTokens.every((t) => nameTokens.includes(t));
      const allNameInKey = nameTokens.every((t) => keyTokens.includes(t));
      if (allKeyInName || allNameInKey) return r;
      const aliasTokensMatch = (r.aliases || []).some((alias) => {
        const aTokens = tokenizeName(alias);
        if (!aTokens.length) return false;
        return keyTokens.every((t) => aTokens.includes(t)) || aTokens.every((t) => keyTokens.includes(t));
      });
      if (aliasTokensMatch) return r;
    }
  }

  for (const r of items) {
    const n = normalizeName(r.productName);
    if (key.startsWith(n) || key.includes(n)) return r;
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

function normalizeAliases(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((a) => String(a).trim()).filter(Boolean);
}

async function add(entry) {
  const name = (entry.productName || '').trim();
  if (!name) return { ok: false, error: 'Название продукта обязательно' };
  const value = Number(entry.value);
  if (Number.isNaN(value) || value < 0) return { ok: false, error: 'Срок должен быть неотрицательным числом' };
  const unit = entry.unit === 'days' ? 'days' : 'hours';
  const labelText = entry.labelText != null ? String(entry.labelText).trim() : undefined;
  const aliases = normalizeAliases(entry.aliases);
  const items = await read();
  const key = normalizeName(name);
  if (items.some((r) => normalizeName(r.productName) === key)) {
    return { ok: false, error: `Продукт «${name}» уже есть в справочнике` };
  }
  const item = { productName: name, value, unit };
  if (labelText !== undefined && labelText !== '') item.labelText = labelText;
  if (aliases.length) item.aliases = aliases;
  items.push(item);
  await write(items);
  return { ok: true };
}

async function update(oldProductName, entry) {
  const items = await read();
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
  await write(items);
  return { ok: true };
}

async function remove(productName) {
  const items = await read();
  const key = normalizeName(productName);
  const idx = items.findIndex((r) => normalizeName(r.productName) === key);
  if (idx === -1) return { ok: false, error: `Продукт «${productName}» не найден` };
  items.splice(idx, 1);
  await write(items);
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
