import { describe, expect, it } from 'vitest';
import { cats, gear, levels, story } from '../data';
import { en } from './en';
import { setLang, t } from './index';
import { ru, type StringKey } from './ru';

const keys = Object.keys(ru) as StringKey[];

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe('строки игры', () => {
  it('в английском словаре те же ключи, что в русском', () => {
    expect(Object.keys(en).sort()).toEqual([...keys].sort());
  });

  it('пустых строк нет', () => {
    for (const key of keys) {
      expect(ru[key].trim(), `ru: ${key}`).not.toBe('');
      expect(en[key].trim(), `en: ${key}`).not.toBe('');
    }
  });

  it('в английских строках нет кириллицы — ничего не осталось без перевода', () => {
    const untranslated = keys.filter((key) => /[А-Яа-яЁё]/.test(en[key]));

    expect(untranslated).toEqual([]);
  });

  it('английская строка не повторяет русскую, кроме строк без слов', () => {
    // Строки из одних подстановок и знаков («+{gold}», «{current}/{total}») на всех языках одинаковы.
    const same = keys.filter((key) => en[key] === ru[key] && /\p{L}/u.test(ru[key].replace(/\{\w+\}/g, '')));

    expect(same).toEqual([]);
  });

  it('подстановки в переводе те же, что в оригинале', () => {
    for (const key of keys) expect(placeholders(en[key]), key).toEqual(placeholders(ru[key]));
  });

  it('t подставляет значения и переключает язык', () => {
    setLang('en');
    expect(t('wave.start', { wave: 3 })).toBe('Wave 3');
    setLang('ru');
    expect(t('wave.start', { wave: 3 })).toBe('Волна 3');
  });
});

describe('строки, которые собираются из данных', () => {
  const has = (key: string): boolean => key in ru;

  it('у каждого уровня есть название', () => {
    for (const level of levels.levels) expect(has(`level.${level.id}`), level.id).toBe(true);
  });

  it('у каждого кота есть имя и описание', () => {
    for (const element of Object.keys(cats.elements)) {
      expect(has(`cat.${element}`), element).toBe(true);
      expect(has(`cat.${element}.desc`), element).toBe(true);
    }
  });

  it('у каждого предмета снаряжения и слота есть название', () => {
    for (const slot of ['staff', 'mantle', 'amulet'] as const) {
      expect(has(`gear.slot.${slot}`), slot).toBe(true);
      for (const item of gear[slot]) expect(has(`gear.${slot}.${item.id}`), `${slot}.${item.id}`).toBe(true);
    }
  });

  it('у каждой реплики сценки и у каждого говорящего есть строка', () => {
    for (const scene of story.scenes) {
      for (const line of scene.lines) {
        expect(has(line.text), line.text).toBe(true);
        expect(has(`story.speaker.${line.speaker}`), line.speaker).toBe(true);
      }
    }
  });

  it('у каждого шага обучения есть подсказка', () => {
    for (const step of ['summon', 'merge', 'hybrid', 'meteor', 'meteorAim']) {
      expect(has(`tutorial.${step}`), step).toBe(true);
    }
  });
});
