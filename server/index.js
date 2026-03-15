/**
 * Локальный сервис DDLabel.
 * Запускает Express-приложение на порту 3001.
 * Для Vercel используется api/index.js.
 */

const app = require('./app');
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`DDLabel сервер: http://localhost:${PORT}`);
});

function shutdown() {
  console.log('\nОстановка сервера...');
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);