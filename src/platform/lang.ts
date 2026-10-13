import type { Lang } from './Platform';

/** Языки, носителям которых русский текст понятнее английского. */
const RUSSIAN_SPEAKING = ['ru', 'be', 'kk', 'uk', 'uz'];

/**
 * Язык игры по коду языка площадки или браузера («ru», «en-US», «tr»).
 * Русский — для русскоязычных стран, всем остальным — английский. Без кода — русский: основная аудитория.
 */
export function pickLang(code: string | null | undefined): Lang {
  if (!code) return 'ru';
  const base = code.toLowerCase().split(/[-_]/)[0];
  return RUSSIAN_SPEAKING.includes(base) ? 'ru' : 'en';
}
