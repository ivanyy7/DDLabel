/**
 * Express-приложение DDLabel.
 * Используется локально (server/index.js) и на Vercel (api/index.js).
 * USB-печать доступна только при локальном запуске.
 */

const express = require('express');
const cors = require('cors');
const iconv = require('iconv-lite');
const { buildTsplLabel, buildTsplLabelSingle, buildTsplTestDates, TSPL_FONTS } = require('./tsplDriver.js');
const { resolveExpiry } = require('./shelfLife.js');
const shelfStorage = require('./shelfStorage.js');
const { parsePhraseWithMode } = require('./parsing/core/phraseEngine');

const isVercel = !!process.env.VERCEL;
let escpos = null;
let usb = null;

if (!isVercel) {
  try {
    escpos = require('escpos');
    usb = require('escpos-usb');
  } catch (e) {
    console.warn('[DDLabel] USB-модули не загружены:', e.message);
  }
}

const usbAvailable = !!(escpos && usb);
const PRINT_UNAVAILABLE_MSG = 'Печать по USB доступна только при локальном запуске на ПК с принтером.';

const app = express();

app.use(cors());
app.use(express.json());

const defaultLabel = {
  productName: 'Бекон слайс',
  madeAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
};

function parseDate(val) {
  if (val instanceof Date) return val;
  if (typeof val === 'number') return new Date(val);
  return new Date(val);
}

function doPrint(data, res, tsplBuilder = buildTsplLabel) {
  function fail(msg, details) {
    if (details) console.error('[DDLabel]', msg, details);
    res.status(503).json({
      ok: false,
      error: msg,
      message: details || (isVercel ? PRINT_UNAVAILABLE_MSG : 'Подключите Xprinter XP-365B по USB. На Windows может потребоваться Zadig (WinUSB).')
    });
  }

  if (!usbAvailable) {
    fail('Печать недоступна', PRINT_UNAVAILABLE_MSG);
    return;
  }

  try {
    escpos.USB = usb;
    const devices = usb.findPrinter();
    if (!devices || devices.length === 0 || !devices[0]) {
      fail('Принтер не найден');
      return;
    }
    const device = devices[0];

    const cmd = tsplBuilder({
      ...data,
      productName: data.productLabelText || data.productName,
    });

    try {
      device.open();
    } catch (e) {
      fail('Не удалось открыть USB-устройство принтера', e.message);
      return;
    }

    const iface = device.interfaces && device.interfaces[0];
    if (!iface) {
      fail('USB-интерфейс принтера не найден');
      try { device.close(); } catch (_) {}
      return;
    }

    try {
      if (iface.isKernelDriverActive && iface.detachKernelDriver) {
        try { iface.detachKernelDriver(); } catch (_) {}
      }
      iface.claim();
    } catch (e) {
      fail('Не удалось захватить интерфейс принтера', e.message);
      try { device.close(); } catch (_) {}
      return;
    }

    const outEndpoint = (iface.endpoints || []).find((ep) => ep.direction === 'out');
    if (!outEndpoint) {
      fail('Выходной USB-эндпоинт принтера не найден');
      try {
        iface.release(true, () => { try { device.close(); } catch (_) {} });
      } catch (_) {
        try { device.close(); } catch (__) {}
      }
      return;
    }

    const buffer = iconv.encode(cmd, 'cp866');

    outEndpoint.transfer(buffer, (err) => {
      if (err) {
        console.error('[DDLabel] Ошибка при передаче TSPL-команд:', err.message);
        res.status(503).json({ ok: false, error: 'Ошибка при печати', message: err.message });
      } else {
        res.status(200).json({ ok: true, message: 'Этикетка отправлена на печать.' });
      }
      try {
        iface.release(true, () => { try { device.close(); } catch (_) {} });
      } catch (_) {}
    });
  } catch (e) {
    fail('Принтер не найден', e.message);
  }
}

app.post('/api/parse', async (req, res) => {
  const phrase = (req.body && req.body.phrase) != null ? String(req.body.phrase) : '';
  const singleMode = req.body && req.body.singleMode === true;
  const parsed = parsePhraseWithMode(phrase);
  if (parsed.error) {
    const errMsg = phrase.trim() ? `${parsed.error} Вы сказали: «${phrase.trim()}».` : parsed.error;
    res.status(400).json({ ok: false, error: errMsg });
    return;
  }
  if (singleMode) {
    res.json({
      ok: true,
      productName: parsed.productName,
      madeAt: parsed.madeAt.toISOString(),
      expiresAt: parsed.madeAt.toISOString()
    });
    return;
  }
  const result = await resolveExpiry(parsed);
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

app.post('/api/print', async (req, res) => {
  const body = req.body || {};
  const singleMode = body.singleMode === true;
  let productName, madeAt, expiresAt;

  if (body.phrase != null && String(body.phrase).trim()) {
    const phrase = String(body.phrase).trim();
    const parsed = parsePhraseWithMode(phrase);
    if (parsed.error) {
      res.status(400).json({ ok: false, error: `${parsed.error} Вы сказали: «${phrase}».` });
      return;
    }
    productName = parsed.productName;
    madeAt = parsed.madeAt;
    if (singleMode) {
      expiresAt = madeAt;
    } else {
      const resolved = await resolveExpiry(parsed);
      if (resolved.error) {
        res.status(400).json({ ok: false, error: `${resolved.error} Вы сказали: «${phrase}».` });
        return;
      }
      productName = resolved.productName;
      expiresAt = resolved.expiresAt;
    }
  } else {
    productName = body.productName != null ? String(body.productName) : defaultLabel.productName;
    madeAt = parseDate(body.madeAt != null ? body.madeAt : defaultLabel.madeAt);
    expiresAt = parseDate(body.expiresAt != null ? body.expiresAt : defaultLabel.expiresAt);
  }

  const productLabelText = await shelfStorage.getLabelText(productName);
  const tsplBuilder = singleMode ? buildTsplLabelSingle : buildTsplLabel;
  doPrint({ productName, madeAt, expiresAt, productLabelText }, res, tsplBuilder);
});

/** Возвращает TSPL в base64 (CP866) для печати по Bluetooth с телефона. */
app.post('/api/print-tspl', async (req, res) => {
  const _dlS = () => {}
  const body = req.body || {};
  const singleMode = body.singleMode === true;
  let productName, madeAt, expiresAt;
  // #region agent log
  _dlS('entry',{phrase:body.phrase,singleMode,hasPhrase:body.phrase!=null});
  // #endregion

  if (body.phrase != null && String(body.phrase).trim()) {
    const phrase = String(body.phrase).trim();
    const parsed = parsePhraseWithMode(phrase);
    if (parsed.error) {
      // #region agent log
        _dlS('parse error',{error:parsed.error,phrase});
      // #endregion
      res.status(400).json({ ok: false, error: `${parsed.error} Вы сказали: «${phrase}».` });
      return;
    }
    productName = parsed.productName;
    madeAt = parsed.madeAt;
    // #region agent log
      _dlS('parsed ok',{productName,madeAt:String(madeAt),isMadeAtDate:madeAt instanceof Date});
    // #endregion
    if (singleMode) {
      expiresAt = madeAt;
    } else {
      const resolved = await resolveExpiry(parsed);
      if (resolved.error) {
        // #region agent log
          _dlS('resolveExpiry error',{error:resolved.error});
        // #endregion
        res.status(400).json({ ok: false, error: `${resolved.error} Вы сказали: «${phrase}».` });
        return;
      }
      productName = resolved.productName;
      expiresAt = resolved.expiresAt;
    }
  } else {
    productName = body.productName != null ? String(body.productName) : defaultLabel.productName;
    madeAt = parseDate(body.madeAt != null ? body.madeAt : defaultLabel.madeAt);
    expiresAt = parseDate(body.expiresAt != null ? body.expiresAt : defaultLabel.expiresAt);
  }

  const productLabelText = await shelfStorage.getLabelText(productName);
  const tsplBuilder = singleMode ? buildTsplLabelSingle : buildTsplLabel;
  try {
    const cmd = tsplBuilder({
      productName: productLabelText || productName,
      madeAt,
      expiresAt,
    });
    const buf = iconv.encode(cmd, 'cp866');
    const tsplBase64 = buf.toString('base64');
    // #region agent log
    _dlS('response ok',{base64Len:tsplBase64.length,cmdLen:cmd.length,productName});
    // #endregion
    res.json({ ok: true, tsplBase64 });
  } catch (buildErr) {
    // #region agent log
    _dlS('build error',{name:buildErr.name,message:buildErr.message,stack:buildErr.stack?.slice(0,300)});
    // #endregion
    res.status(500).json({ ok: false, error: 'Ошибка формирования этикетки: ' + buildErr.message });
  }
});

app.get('/api/tspl-fonts', (_req, res) => {
  const list = Object.entries(TSPL_FONTS).map(([id, info]) => ({ id, ...info }));
  res.json({ ok: true, fonts: list });
});

app.post('/api/test-print', (req, res) => {
  const body = req.body || {};
  const madeAt = parseDate(body.madeAt != null ? body.madeAt : defaultLabel.madeAt);
  const expiresAt = parseDate(body.expiresAt != null ? body.expiresAt : defaultLabel.expiresAt);
  doPrint({
    madeAt,
    expiresAt,
    density: body.density,
    speed: body.speed,
    titleText: body.titleText,
    fontTitle: body.fontTitle,
    sxTitle: body.sxTitle,
    syTitle: body.syTitle,
    xTitle: body.xTitle,
    yTitle: body.yTitle,
    fontLeft: body.fontLeft,
    sxLeft: body.sxLeft,
    syLeft: body.syLeft,
    xLeft: body.xLeft,
    yLeft: body.yLeft,
    fontRight: body.fontRight,
    sxRight: body.sxRight,
    syRight: body.syRight,
    xRight: body.xRight,
    yRight: body.yRight,
    fontTimeLeft: body.fontTimeLeft,
    sxTimeLeft: body.sxTimeLeft,
    syTimeLeft: body.syTimeLeft,
    xTimeLeft: body.xTimeLeft,
    yTimeLeft: body.yTimeLeft,
    fontTimeRight: body.fontTimeRight,
    sxTimeRight: body.sxTimeRight,
    syTimeRight: body.syTimeRight,
    xTimeRight: body.xTimeRight,
    yTimeRight: body.yTimeRight,
  }, res, buildTsplTestDates);
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ddlabel-server' });
});


app.get('/api/shelf', async (req, res) => {
  try {
    // Не кэшируем справочник: порядок может меняться (DnD reorder)
    res.setHeader('Cache-Control', 'no-store');
    const [items, meta] = await Promise.all([shelfStorage.getAll(), shelfStorage.getVersion()]);
    res.json({ ok: true, items, version: meta.version, updatedAt: meta.updatedAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/shelf', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await shelfStorage.add({
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

app.post('/api/shelf-import', async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ ok: false, error: 'Ожидается непустой массив записей.' });
      return;
    }

    // Генерируем id и order для каждого элемента при импорте
    function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
    const normalized = items.map((item, idx) => {
      const entry = {
        id: item.id || genId(),
        order: item.order != null ? item.order : idx * 10,
        productName: String(item.productName || '').trim(),
        value: Number(item.value),
        unit: item.unit === 'days' ? 'days' : 'hours',
      };
      if (item.labelText != null && String(item.labelText).trim()) entry.labelText = String(item.labelText).trim();
      if (Array.isArray(item.aliases) && item.aliases.length) entry.aliases = item.aliases.map((a) => String(a).trim()).filter(Boolean);
      return entry;
    }).filter((e) => e.productName && !Number.isNaN(e.value));

    if (process.env.VERCEL) {
      const { list, del } = await import('@vercel/blob');
      const { blobs } = await list({ limit: 500 });
      const shelfBlobs = blobs.filter((b) => b.pathname && (b.pathname === 'shelf.json' || b.pathname.startsWith('shelf-') || b.pathname.startsWith('shelf.')));
      if (shelfBlobs.length > 0) {
        await del(shelfBlobs.map((b) => b.url));
      }
    }

    await shelfStorage.writeFull({ version: 1, updatedAt: new Date().toISOString(), items: normalized });
    res.status(200).json({ ok: true, message: `Импортировано ${normalized.length} записей.`, count: normalized.length });
  } catch (e) {
    console.error('[DDLabel] POST /api/shelf-import:', e.message);
    res.status(500).json({ ok: false, error: `Ошибка сервера: ${e.message}` });
  }
});

app.post('/api/shelf-reorder', async (req, res) => {
  try {
    const body = req.body || {};
    const orderedIds = body.orderedIds;
    const clientVersion = body.version != null ? Number(body.version) : null;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      res.status(400).json({ ok: false, error: 'Ожидается непустой массив orderedIds.' });
      return;
    }
    const result = await shelfStorage.reorder(orderedIds, clientVersion);
    if (!result.ok) {
      const status = result.conflict ? 409 : 400;
      res.status(status).json({ ok: false, error: result.error, conflict: !!result.conflict });
      return;
    }
    const meta = await shelfStorage.getVersion();
    const items = await shelfStorage.getAll();
    res.json({ ok: true, version: meta.version, updatedAt: meta.updatedAt });
  } catch (e) {
    console.error('[DDLabel] POST /api/shelf-reorder:', e.message);
    res.status(500).json({ ok: false, error: `Ошибка сервера: ${e.message}` });
  }
});

app.put('/api/shelf/:productName', async (req, res) => {
  const oldName = decodeURIComponent(req.params.productName || '');
  const body = req.body || {};
  const result = await shelfStorage.update(oldName, {
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

app.delete('/api/shelf/:productName', async (req, res) => {
  const productName = decodeURIComponent(req.params.productName || '');
  const result = await shelfStorage.remove(productName);
  if (!result.ok) {
    res.status(404).json({ ok: false, error: result.error });
    return;
  }
  res.json({ ok: true, message: 'Запись удалена.' });
});

app.get('/api/printers', (req, res) => {
  if (!usbAvailable) {
    res.json({ count: 0, error: PRINT_UNAVAILABLE_MSG });
    return;
  }
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

module.exports = app;
