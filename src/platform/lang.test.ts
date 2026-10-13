import { describe, expect, it } from 'vitest';
import { pickLang } from './lang';

describe('pickLang', () => {
  it('русский — для русского и языков стран СНГ', () => {
    for (const code of ['ru', 'ru-RU', 'RU', 'be', 'kk', 'uk', 'uz', 'kk_KZ']) expect(pickLang(code)).toBe('ru');
  });

  it('английский — для всех остальных', () => {
    for (const code of ['en', 'en-US', 'tr', 'de', 'es', 'pt-BR', 'ja']) expect(pickLang(code)).toBe('en');
  });

  it('без кода языка — русский', () => {
    expect(pickLang(undefined)).toBe('ru');
    expect(pickLang(null)).toBe('ru');
    expect(pickLang('')).toBe('ru');
  });
});
