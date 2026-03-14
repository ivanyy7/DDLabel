/**
 * Перенос справочника из локального shelf.json на Vercel API.
 * Запуск: node scripts/migrate-shelf-to-vercel.js
 * URL API задаётся через переменную VERCEL_API_URL (например https://dd-label.vercel.app)
 *
 * Использует /api/shelf-import — один запрос со всем массивом,
 * чтобы избежать гонки при последовательной записи в Vercel Blob.
 */

const fs = require('fs');
const path = require('path');

const API_URL = (process.env.VERCEL_API_URL || 'https://dd-label.vercel.app').replace(/\/$/, '');
const SHELF_PATH = path.join(__dirname, '..', 'server', 'data', 'shelf.json');

async function migrate() {
  if (!fs.existsSync(SHELF_PATH)) {
    console.error('Файл не найден:', SHELF_PATH);
    process.exit(1);
  }

  const raw = fs.readFileSync(SHELF_PATH, 'utf8');
  let items;
  try {
    items = JSON.parse(raw);
  } catch (e) {
    console.error('Ошибка парсинга JSON:', e.message);
    process.exit(1);
  }

  if (!Array.isArray(items)) {
    console.error('shelf.json должен содержать массив записей');
    process.exit(1);
  }

  console.log(`Отправка ${items.length} записей одним запросом на ${API_URL}/api/shelf-import`);
  console.log('---');

  try {
    const res = await fetch(`${API_URL}/api/shelf-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      console.log(`[OK] Импортировано: ${data.count ?? items.length} записей`);
      console.log('---');
      console.log('Готово: успешно, 0 ошибок');
      process.exit(0);
    } else {
      console.error(`[ОШИБКА] ${data.error || res.status}`);
      console.log('---');
      console.log('Готово: 0 успешно, 1 ошибка');
      process.exit(1);
    }
  } catch (e) {
    console.error(`[ОШИБКА] ${e.message}`);
    process.exit(1);
  }
}

migrate();
