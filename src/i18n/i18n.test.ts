import { describe, expect, it } from 'vitest';
import { cats, enemies, gear, levels, story } from '../data';
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

  it('у каждого врага есть имя, описание, особенность и подсказка', () => {
    for (const type of Object.keys(enemies.types)) {
      for (const key of [`enemy.${type}`, `enemy.${type}.desc`, `enemy.${type}.trait`, `enemy.${type}.tip`]) {
        expect(has(key), key).toBe(true);
      }
    }
  });

  it('у каждого слота, редкости, вида бонуса и легендарного предмета есть строка', () => {
    for (const slot of ['staff', 'mantle', 'amulet']) expect(has(`gear.slot.${slot}`), slot).toBe(true);
    for (const rarity of Object.keys(gear.items.rarities)) expect(has(`rarity.${rarity}`), rarity).toBe(true);
    for (const kind of Object.keys(gear.items.pool)) expect(has(`item.bonus.${kind}`), kind).toBe(true);
    for (const { id, unique } of gear.items.legendaries) {
      expect(has(`item.legendary.${id}`), id).toBe(true);
      expect(has(`item.unique.${unique}`), unique).toBe(true);
    }
  });

  it('у каждого бонуса из пула есть слово для названия предмета, и в нём есть место для слота', () => {
    for (const kind of Object.keys(gear.items.pool)) {
      const key = `item.name.${kind}`;
      expect(has(key), key).toBe(true);
      for (const dictionary of [ru, en] as Record<string, string>[]) expect(dictionary[key], key).toContain('{slot}');
    }
  });

  it('у бонуса стихии в названии есть место для стихии, у остальных его нет', () => {
    for (const [kind, rule] of Object.entries(gear.items.pool)) {
      for (const dictionary of [ru, en] as Record<string, string>[]) {
        expect(/\{(element|of)\}/.test(dictionary[`item.name.${kind}`]), kind).toBe(rule.element === true);
      }
    }
  });

  it('для названий есть слово каждого слота, каждой базовой стихии и приставка редкости для каждого слота', () => {
    const slots = ['staff', 'mantle', 'amulet'];
    for (const slot of slots) expect(has(`item.slotWord.${slot}`), slot).toBe(true);
    for (const [element, entry] of Object.entries(cats.elements)) {
      if (entry.from) continue;
      expect(has(`item.element.${element}`), element).toBe(true);
      expect(has(`item.elementOf.${element}`), element).toBe(true);
    }
    for (const rarity of ['epic', 'legendary']) {
      for (const slot of slots) expect(has(`item.prefix.${rarity}.${slot}`), `${rarity}.${slot}`).toBe(true);
    }
  });

  it('русские названия согласованы в роде: прилагательное стихии стоит только при посохе и амулете, приставка мантии — женского рода', () => {
    const words = ru as Record<string, string>;
    for (const [kind, rule] of Object.entries(gear.items.pool)) {
      if (words[`item.name.${kind}`].includes('{element}')) expect(rule.slots, kind).not.toContain('mantle');
    }
    for (const rarity of ['epic', 'legendary']) {
      expect(words[`item.prefix.${rarity}.mantle`], rarity).toMatch(/ая$/);
      expect(words[`item.prefix.${rarity}.staff`], rarity).toMatch(/[ыи]й$/);
      expect(words[`item.prefix.${rarity}.amulet`], rarity).toMatch(/[ыи]й$/);
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
