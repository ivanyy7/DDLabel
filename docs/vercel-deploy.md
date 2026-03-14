# Деплой DDLabel на Vercel (п. 8.1)

## Подготовка

1. Убедитесь, что проект собирается локально:
   - `cd client && npm run build`
   - `cd server && npm start` (для проверки API)

2. Создайте Blob Store в Vercel:
   - Откройте [Vercel Dashboard](https://vercel.com) → ваш проект
   - Вкладка **Storage** → **Create Database** → **Blob**
   - Выберите **Create a new Blob store**
   - Access: **Public** (для shelf.json)
   - После создания переменная `BLOB_READ_WRITE_TOKEN` добавится в проект автоматически

3. Подключите репозиторий:
   - **Add New** → **Project** → импорт из GitHub
   - Root Directory: оставьте пустым (корень репозитория)
   - Framework Preset: **Other** (Vercel определит по vercel.json)

4. Переменные окружения:
   - `BLOB_READ_WRITE_TOKEN` — создаётся при создании Blob Store
   - `VERCEL` — задаётся Vercel автоматически при деплое

5. Деплой:
   - Push в `main` или нажмите **Deploy** в Dashboard
   - Либо: `npx vercel` в корне проекта (для preview)

## Результат

- Приложение доступно по URL вида `https://ddlabel-xxx.vercel.app`
- Парсинг фраз и CRUD справочника работают в облаке
- Печать по USB — только при локальном запуске (`cd server && npm start`)

## Локальная разработка

- Клиент: `cd client && npm run dev`
- Сервер: `cd server && npm start`
- Для проверки Blob локально: `vercel env pull` (подтянет переменные из Vercel)
