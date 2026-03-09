/**
 * Локальный сервис DDLabel.
 * API: POST /api/print — печать этикетки (тело: productName, madeAt, expiresAt или phrase).
 * API: POST /api/parse — разбор фразы, возврат структуры для этикетки.
 */

const express = require('express');
const cors = require('cors');
const escpos = require('escpos');
const usb = require('escpos-usb');
const { printLabel } = require('./labelBuilder.js');
const { resolveExpiry } = require('./shelfLife.js');
const shelfStorage = require('./shelfStorage.js');
const { parsePhraseWithMode } = require('./parsing/core/phraseEngine');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Тестовые данные по умолчанию (мини-этап 1)
const defaultLabel = {
  productName: 'Бекон слайс',
  madeAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // вчера
  expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
};

/**
 * Парсит дату из ISO-строки или timestamp.
 * @returns {Date}
 */
function parseDate(val) {
  if (val instanceof Date) return val;
  if (typeof val === 'number') return new Date(val);
  return new Date(val);
}

/**
 * Печать этикетки на USB-принтер (ESC/POS).
 * Если принтер не найден — отвечаем 503.
 */
function doPrint(data, res) {
  function fail(msg, details) {
    if (details) console.error('[DDLabel]', msg, details);
    res.status(503).json({
      ok: false,
      error: msg,
      message: details || 'Подключите Xprinter XP-365B по USB. На Windows может потребоваться Zadig (WinUSB).'
    });
  }
  try {
    escpos.USB = usb;
    const devices = usb.findPrinter();
    if (!devices || devices.length === 0 || !devices[0]) {
      fail('Принтер не найден');
      return;
    }
    let device;
    try {
      device = new escpos.USB(devices[0]);
    } catch (e) {
      fail('Принтер не найден', e.message);
      return;
    }
    device.open(function (err) {
    if (err) {
      console.error('[DDLabel] Не удалось открыть принтер:', err.message);
      res.status(503).json({
        ok: false,
        error: 'Не удалось открыть принтер',
        message: err.message
      });
      return;
    }
    const printer = new escpos.Printer(device, { encoding: 'cp866', width: 24 });
    printLabel(printer, data);
    printer.close(function (closeErr) {
      if (closeErr) {
        console.error('[DDLabel] Ошибка при печати:', closeErr.message);
        res.status(503).json({ ok: false, error: 'Ошибка при печати', message: closeErr.message });
        return;
      }
      res.status(200).json({ ok: true, message: 'Этикетка отправлена на печать.' });
    });
  });
  } catch (e) {
    fail('Принтер не найден', e.message);
  }
}

/** Разбирает фразу и возвращает данные для этикетки или ошибку */
function parseAndResolve(phrase) {
  const parsed = parsePhraseWithMode(phrase);
  if (parsed.error) return parsed;
  return resolveExpiry(parsed);
}

app.post('/api/parse', (req, res) => {
  const phrase = (req.body && req.body.phrase) != null ? String(req.body.phrase) : '';
  const result = parseAndResolve(phrase);
  if (result.error) {
    const errMsg = phrase.trim() ? `${result.error} Вы сказали: «${phrase.trim()}».` : result.error;
    res.status(400).json({ ok: false, error: errMsg });
    return;
  }
  res.json({
    ok: true,
    productName: result.productName,
    madeAt: result.madeAt.toISOString(),
    expiresAt: result.expiresAt.toISOString()
  });
});

app.post('/api/print', (req, res) => {
  const body = req.body || {};
  let productName, madeAt, expiresAt;

  if (body.phrase != null && String(body.phrase).trim()) {
    const phrase = String(body.phrase).trim();
    const result = parseAndResolve(phrase);
    if (result.error) {
      const errMsg = `${result.error} Вы сказали: «${phrase}».`;
      res.status(400).json({ ok: false, error: errMsg });
      return;
    }
    productName = result.productName;
    madeAt = result.madeAt;
    expiresAt = result.expiresAt;
  } else {
    productName = body.productName != null ? String(body.productName) : defaultLabel.productName;
    madeAt = parseDate(body.madeAt != null ? body.madeAt : defaultLabel.madeAt);
    expiresAt = parseDate(body.expiresAt != null ? body.expiresAt : defaultLabel.expiresAt);
  }

  const productLabelText = shelfStorage.getLabelText(productName);
  doPrint({ productName, madeAt, expiresAt, productLabelText }, res);
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'ddlabel-server' });
});

// Справочник сроков (CRUD)
app.get('/api/shelf', (req, res) => {
  try {
    const items = shelfStorage.getAll();
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/shelf', (req, res) => {
  try {
    const body = req.body || {};
    const result = shelfStorage.add({
      productName: body.productName,
      value: body.value,
      unit: body.unit,
      labelText: body.labelText,
      aliases: body.aliases
    });
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error });
      return;
    }
    res.status(201).json({ ok: true, message: 'Запись добавлена.' });
  } catch (e) {
    console.error('[DDLabel] POST /api/shelf:', e.message);
    res.status(500).json({ ok: false, error: `Ошибка сервера: ${e.message}` });
  }
});

app.put('/api/shelf/:productName', (req, res) => {
  const oldName = decodeURIComponent(req.params.productName || '');
  const body = req.body || {};
    const result = shelfStorage.update(oldName, {
      productName: body.productName,
      value: body.value,
      unit: body.unit,
      labelText: body.labelText,
      aliases: body.aliases
    });
  if (!result.ok) {
    res.status(400).json({ ok: false, error: result.error });
    return;
  }
  res.json({ ok: true, message: 'Запись обновлена.' });
});

app.delete('/api/shelf/:productName', (req, res) => {
  const productName = decodeURIComponent(req.params.productName || '');
  const result = shelfStorage.remove(productName);
  if (!result.ok) {
    res.status(404).json({ ok: false, error: result.error });
    return;
  }
  res.json({ ok: true, message: 'Запись удалена.' });
});

// Отладка: какие USB-принтеры видит система (для проверки после Zadig)
app.get('/api/printers', (req, res) => {
  try {
    escpos.USB = usb;
    const devices = usb.findPrinter();
    const list = (devices || []).map((d, i) => ({
      index: i,
      vendorId: d.deviceDescriptor.idVendor,
      productId: d.deviceDescriptor.idProduct
    }));
    res.json({ count: list.length, devices: list });
  } catch (e) {
    res.json({ count: 0, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`DDLabel сервер: http://localhost:${PORT}`);
});
