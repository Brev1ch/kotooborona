import { describe, expect, it } from 'vitest';
import { enemies as enemiesJson } from '../data';
import type { EnemiesConfig, EnemyTypeId } from '../data/types';
import { bestiaryEntries, traitParams } from './Bestiary';

const enemies = {
  types: { mouse: { shield: 0 }, shield: { shield: 3 }, ninja: { shield: 0, dodgeEvery: 3 }, king: { shield: 0 } },
} as unknown as EnemiesConfig;

function met(...types: EnemyTypeId[]): (type: EnemyTypeId) => boolean {
  return (type) => types.includes(type);
}

describe('bestiaryEntries', () => {
  it('перечисляет всех врагов в порядке конфига', () => {
    expect(bestiaryEntries(enemies, met()).map((entry) => entry.type)).toEqual(['mouse', 'shield', 'ninja', 'king']);
  });

  it('в новой игре не известен никто', () => {
    expect(bestiaryEntries(enemies, met()).every((entry) => !entry.known)).toBe(true);
  });

  it('побеждённый враг становится известным, остальные — нет', () => {
    expect(bestiaryEntries(enemies, met('ninja', 'mouse')).map((entry) => entry.known)).toEqual([true, false, true, false]);
  });

  it('в бестиарии игры есть все типы из данных', () => {
    expect(bestiaryEntries(enemiesJson, met()).map((entry) => entry.type)).toEqual(Object.keys(enemiesJson.types));
  });
});

describe('traitParams', () => {
  it('берёт числа особенности из данных врага', () => {
    expect(traitParams(enemies, 'ninja')).toEqual({ n: 3, shield: 0 });
    expect(traitParams(enemies, 'shield')).toEqual({ n: 0, shield: 3 });
  });
});
