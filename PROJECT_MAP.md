# Карта проекта DDLabel

Краткий обзор структуры проекта: важные папки, ключевые файлы, точки входа.

---

## Текущая структура

- **Корень проекта** — PLAN.md (план, роль, этапы, стек), PROJECT_MAP.md, PROJECT_LOG.md, PROMPT_PLAN.md (промт и вопросы для плана), README.md, LICENSE, .gitignore (Node.js).
- **`.cursor/rules/`** — правила чата, форматы, лог/карта, запрет секретов и т.д.
- **`.github/workflows/`** — ci.yml (CI при push в main; зелёная галочка у коммитов).
- **`docs/`** — справочные материалы: printer-xp365b.md (принтер XP-365B), **label-format.md** (формат этикетки 30×20 мм — название, даты ДД.ММ, время ЧЧ.ММ, символ ∞, две колонки).

**Этап 1 (в работе):**
- **`server/`** — Node.js (Express): `index.js` (API печати), `labelBuilder.js` (шаблон этикетки по docs/label-format.md), ESC/POS через пакеты escpos и escpos-usb. Запуск: `npm start`. Порт 3001.
- **`client/`** — React (Vite): одна страница с кнопкой «Печать тестовой этикетки», прокси `/api` на сервер. Запуск: `npm run dev`. Интерфейс: http://localhost:3000 (vite.config.js: port 3000, host: true). Читаемость карточки без расширений темы — явные цвета в App.css.

---

## Стек и точки входа

- **План:** PLAN.md; промт для плана — PROMPT_PLAN.md.
- **Стек Этапа 1:** фронт — браузер **React**, Web Speech API; бэкенд — Node.js (Express); печать — ESC/POS (Xprinter XP-365B по USB).
- **Точки входа:** сервер — `server/index.js`; фронт — `client/` (Vite), вход — `index.html` → `src/main.jsx` → `App.jsx`.

---

## Ресурсы: принтер Xprinter XP-365B

- **Справочник по руководству:** `docs/printer-xp365b.md` (драйверы pc-controllers.ru, артикул 45895; Android «Print Label»; подключение USB/Bluetooth, COM-порт; характеристики, кнопки, устранение неполадок).
- Прямые ссылки на скачивание драйверов и приложений — добавить в этот файл при получении.

---

## Внешние сервисы

- Локальный принтер Xprinter XP-365B (USB, затем Bluetooth на этапе 3). Внешних облачных сервисов пока нет. На этапе 2 — Telegram Bot API.
