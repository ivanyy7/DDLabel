/**
 * Локальный сервис DDLabel.
 * Запускает Express-приложение на порту 3001.
 * Для Vercel используется api/index.js.
 */

const app = require('./app');
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`DDLabel сервер: http://localhost:${PORT}`);
});
