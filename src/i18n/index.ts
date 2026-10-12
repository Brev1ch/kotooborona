import type { Lang } from '../platform';
import { en } from './en';
import { ru, type StringKey } from './ru';

const dictionaries: Record<Lang, Record<StringKey, string>> = { ru, en };

let current: Lang = 'ru';

export function setLang(lang: Lang): void {
  current = lang;
}

/** Строка для игрока; `{name}` в тексте заменяется значением из params. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  const text = dictionaries[current][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export type { StringKey };
