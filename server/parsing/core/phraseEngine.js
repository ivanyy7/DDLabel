const { defaultMode } = require('../../config/parserConfig');
const { parsePhraseTemplate } = require('../template/templateParser');

/**
 * Базовый движок разбора фразы.
 * Сейчас поддерживается режим 'template' (жёсткий шаблон).
 * В будущем сюда добавится режим 'ai'.
 *
 * @param {string} phrase
 * @param {{ mode?: 'template' | 'ai' | 'auto' }} [options]
 * @returns {{ productName: string, madeAt: Date } | { error: string }}
 */
function parsePhraseWithMode(phrase, options = {}) {
  const mode = options.mode || defaultMode || 'template';

  if (mode === 'template' || mode === 'auto') {
    // Пока 'auto' ведём как 'template' до появления ИИ.
    return parsePhraseTemplate(phrase);
  }

  // Заглушка под будущий ИИ-режим.
  if (mode === 'ai') {
    return {
      error: 'Режим парсера «ai» пока не реализован. Используется только жёсткий шаблон.',
    };
  }

  // На всякий случай fallback.
  return parsePhraseTemplate(phrase);
}

module.exports = {
  parsePhraseWithMode,
};

