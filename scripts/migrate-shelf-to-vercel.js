/**
 * Перенос справочника из локального shelf.json на Vercel API.
 * Запуск: node scripts/migrate-shelf-to-vercel.js
 * URL API задаётся через переменную VERCEL_API_URL (например https://dd-label.vercel.app)
 */

const fs = require('fs');
const path = require('path');

const API_URL = process.env.VERCEL_API_URL || 'https://dd-label.vercel.app';
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

  console.log(`Перенос ${items.length} записей на ${API_URL}/api/shelf`);
  console.log('---');

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const body = {
      productName: item.productName,
      value: item.value,
      unit: item.unit || 'days',
    };
    if (item.labelText != null) body.labelText = item.labelText;
    if (item.aliases && item.aliases.length) body.aliases = item.aliases;

    try {
      const res = await fetch(`${API_URL}/api/shelf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        console.log(`[OK] ${i + 1}/${items.length}: ${item.productName}`);
        ok++;
      } else {
        console.error(`[ОШИБКА] ${i + 1}/${items.length}: ${item.productName} — ${data.error || res.status}`);
        fail++;
      }
    } catch (e) {
      console.error(`[ОШИБКА] ${i + 1}/${items.length}: ${item.productName} — ${e.message}`);
      fail++;
    }
  }

  console.log('---');
  console.log(`Готово: ${ok} успешно, ${fail} ошибок`);
  process.exit(fail > 0 ? 1 : 0);
}

migrate();
