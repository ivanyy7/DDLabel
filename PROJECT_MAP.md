# Карта проекта DDLabel

Краткий обзор структуры проекта: важные папки, ключевые файлы, точки входа.

---

## Текущая структура

- **Корень проекта** — PLAN.md (план, роль, этапы, стек), PROJECT_MAP.md, PROJECT_LOG.md, PROMPT_PLAN.md (промт и вопросы для плана), README.md, LICENSE, .gitignore (Node.js).
- **`.cursor/rules/`** — правила чата, форматы, лог/карта, запрет секретов и т.д.
- **`.github/workflows/`** — ci.yml (CI при push в main; зелёная галочка у коммитов).
- **`docs/`** — справочные материалы: printer-xp365b.md (принтер XP-365B), **label-format.md** (формат этикетки 30×20 мм — название, даты ДД.ММ, время ЧЧ.ММ, символ ∞, две колонки), **UI-размеры-таблица-продуктов.md** (текущий вариант ресайза колонок в rem и вариант с фиксированными ширинами в px для проработки).

**Этап 1 (в работе):**
- **`server/`** — Node.js (Express): `index.js` (API печати POST /api/print, POST /api/print-tspl — TSPL base64 для Bluetooth, POST /api/test-print для калибровки, POST /api/parse, CRUD справочника, GET /api/printers, GET /api/tspl-fonts), **`tsplDriver.js`** (TSPL: buildTsplLabel — полная этикетка; buildTsplLabelSingle — одиночный режим: название + дата и время в одну строку; buildTsplTestDates — калибровка; TSPL_FONTS; CP866), labelBuilder.js (устаревший ESC/POS), phraseParser.js, shelfLife.js, shelfStorage.js. Печать: сырые команды TSPL на принтер по USB. Запуск: `npm start`. Порт 3001.
- **`client/`** — React (Vite): `src/bluetoothPrint.js` (Web Serial API, печать по Bluetooth SPP); **верхнее меню** — заголовок «DDLabel» (без подписи), три вкладки (Главная, Справочник, Настройки), отступ 1.25rem под заголовком; **Главная** — подсказка, затем кнопки «Голос», «на Печать», «Двойной/Одиночн», «Сброс», затем поле ввода фразы (фиксированная высота 400px, текст 2rem, line-height 1.4); кнопка «Р» (Разобрать, 40×60 px) справа от поля — только при включённом режиме «Распознавание текста» (Настройки), иначе поле на всю ширину (.phrase-input-wrap--full); голос: «ок» — команда печати (задержка 450 мс), разбиение по «и» только при полном шаблоне слева, фильтр неполных шаблонов; **пакетная печать** — «N штук» (2–50); **очистка поля** после успешной или частичной печати; **Справочник** — раздел «Справочник сроков», окно «Список продуктов» (max-height 75vh); **Настройки** — тема, блок «Печать» (Онлайн/Офлайн), блок «Отладка» (жёлтая полоса внизу — Вкл/Выкл), блок «Распознавание текста» (кнопка «Р» и ширина поля — Вкл/Выкл), превью этикетки, панель TSPL. Шрифт превью — **Teko** (Google Fonts). Прокси `/api`. Запуск: `npm run dev`. http://localhost:3000.

---

## Стек и точки входа

- **План:** PLAN.md; промт для плана — PROMPT_PLAN.md.
- **Стек Этапа 1:** фронт — браузер **React**, Web Speech API, шрифт превью Teko (Google Fonts); бэкенд — Node.js (Express); печать — **TSPL** (server/tsplDriver.js), сырая отправка на Xprinter XP-365B по USB.
- **Точки входа:** сервер — `server/index.js`; фронт — `client/` (Vite), вход — `index.html` → `src/main.jsx` → `App.jsx`.

---

## Ресурсы: принтер Xprinter XP-365B

- **Справочник по руководству:** `docs/printer-xp365b.md` (драйверы pc-controllers.ru, артикул 45895; Android «Print Label»; подключение USB/Bluetooth, COM-порт; характеристики, кнопки, устранение неполадок; раздел «Печать из DDLabel по USB: Zadig и WinUSB» — пошаговая замена драйвера на WinUSB для доступа приложения к принтеру).
- Прямые ссылки на скачивание драйверов и приложений — добавить в этот файл при получении.

---

## Печать этикеток: текущий и целевой драйвер

- **Текущий вариант:** печать через **TSPL** — модуль `server/tsplDriver.js` (buildTsplLabel — полная этикетка, buildTsplTestDates — калибровка: название + даты + время с прямыми TSPL-параметрами), формирование команд TSPL для этикетки 30×20 мм; из `server/index.js` вызывается tsplDriver, сырые команды отправляются на принтер по USB (CP866). Калибровка: POST /api/test-print с прямыми TSPL-параметрами (font, sx, sy, x, y, density, speed) для каждого элемента. Рабочие настройки: DENSITY=1, SPEED=4, шрифт 3 (16×24) для названия и дат, шрифт 1 sx=2 (16×24) для времени.
- **Устаревший вариант:** ESC/POS (labelBuilder.js) не используется при работе в режиме этикеток принтера.

---

## Внешние сервисы

- Локальный принтер Xprinter XP-365B (USB, затем Bluetooth на этапе 3). Внешних облачных сервисов пока нет.
- **Этап 2.1 (выполнено):** `vercel.json` — конфиг деплоя; `api/index.js` — serverless-точка входа (экспорт Express); `server/app.js` — Express без listen, условная загрузка USB, `POST /api/shelf-import` (bulk-импорт с очисткой дубликатов); `server/shelfStorage.js` — fs (локально) / Vercel Blob 2.3.1 (облако, `get()` + `allowOverwrite`); `scripts/migrate-shelf-to-vercel.js` — перенос справочника одним запросом; `docs/vercel-deploy.md` — инструкция по деплою и миграции.
- **Этап 2.2 (выполнено):** PWA — `client/public/manifest.json`, `client/public/sw.js`, `client/public/icons/` (192/512 px), мета-теги в index.html, регистрация SW в main.jsx. «Добавить на главный экран» — standalone, без адресной строки.
- **Этап 2.5 (выполнено):** Печать по Bluetooth — `server/app.js` POST `/api/print-tspl` (TSPL в base64, CP866); `client/src/bluetoothPrint.js` (Web Serial API, Bluetooth SPP); ветвление в `sendPhraseToPrint`: при 503 → TSPL → выбор принтера → отправка. Chrome 117+ (ПК), Chrome 138+ (Android). Документация в docs/printer-xp365b.md.
- **Этап 2, п. 8.3 (выполнено):** В Настройках добавлен блок «Печать» — описание режимов работы с телефона: Онлайн (справочник с сервера, голос и текст) и Офлайн (локальная копия справочника, только текст); примечание про переключение на локальный режим при нестабильной сети. Стили: `.settings-print-modes`, `.print-mode-block` в App.css.
- **Этап 2, п. 8.4 (выполнено):** Синхронизация справочника. Клиент: `SHELF_LOCAL_KEY` ('ddlabel_shelf_local'), getLocalShelf()/setLocalShelf(); при монтировании и при событии `online` — загрузка GET /api/shelf и запись в localStorage; при ошибке сети — отображение локальной копии; кнопка «Обновить с сервера» в разделе Справочник (loadShelf(true)). После успешного CRUD по справочнику вызывается loadShelf() — локальная копия обновляется.
- **Этап 2, п. 8.6 (выполнено):** Офлайн-режим. Клиент: `client/src/offline/` — parser.js (parsePhraseTemplate), shelfResolve.js (getByProductName, resolveExpiryWithShelf), tsplBuilder.js (buildTsplLabel, buildTsplLabelSingle), cp866.js (encodeToCp866, tsplToBase64), index.js (buildOfflineTsplBase64). Состояние workOffline (WORK_OFFLINE_KEY в localStorage), переключатель Онлайн/Офлайн в Настройках → Печать. При workOffline и при fallback (сбой сети) — разбор и печать по локальному справочнику и TSPL на клиенте; сообщение при fallback по тексту из плана. handleParseOnly при workOffline и в catch использует клиентский парсер.
