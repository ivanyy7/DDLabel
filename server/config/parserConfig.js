// Конфигурация режимов парсера фраз
// mode: 'template' | 'ai' | 'auto' | 'legacy'

const DEFAULT_MODE = process.env.PARSER_MODE || 'template';

module.exports = {
  defaultMode: DEFAULT_MODE,
};

