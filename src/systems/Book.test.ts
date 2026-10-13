import { describe, expect, it } from 'vitest';
import type { CatsConfig, ElementId } from '../data/types';
import { bookEntries } from './Book';

const cats = {
  elements: {
    fire: {},
    water: {},
    air: {},
    steam: { from: ['fire', 'water'] },
    ice: { from: ['water', 'air'] },
  },
} as unknown as CatsConfig;

function discovered(...elements: ElementId[]): (element: ElementId) => boolean {
  return (element) => elements.includes(element);
}

describe('bookEntries', () => {
  it('перечисляет всех котов в порядке конфига', () => {
    const entries = bookEntries(cats, discovered());

    expect(entries.map((entry) => entry.element)).toEqual(['fire', 'water', 'air', 'steam', 'ice']);
  });

  it('в новой игре известны только базовые коты', () => {
    const entries = bookEntries(cats, discovered());

    expect(entries.map((entry) => entry.known)).toEqual([true, true, true, false, false]);
  });

  it('полученный гибрид становится известным, остальные — нет', () => {
    const entries = bookEntries(cats, discovered('ice'));

    expect(entries.map((entry) => entry.known)).toEqual([true, true, true, false, true]);
  });

  it('у гибрида есть рецепт, у базового кота — нет', () => {
    const entries = bookEntries(cats, discovered('steam'));

    expect(entries.map((entry) => entry.recipe)).toEqual([null, null, null, ['fire', 'water'], ['water', 'air']]);
  });
});
