import type { Lang } from '../platform';
import { en } from './en';
import { ru, type StringKey } from './ru';

const dictionaries: Record<Lang, Record<StringKey, string>> = { ru, en };

let current: Lang = 'ru';

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

/** Название языка на нём самом: на кнопке выбора оно не переводится. */
export const LANG_NAMES: Record<Lang, string> = { ru: 'Русский', en: 'English' };

/** Строка для игрока; `{name}` в тексте заменяется значением из params. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  const text = dictionaries[current][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export type { StringKey };
