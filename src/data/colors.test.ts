import { describe, expect, it } from 'vitest';
import catsJson from './cats.json';
import enemiesJson from './enemies.json';
import { elementColor, enemyColor, parseColor, type ElementId, type EnemyTypeId } from './index';

/** Шесть цифр цвета так, как они записаны в данных. */
function digits(color: string): string {
  return color.replace('#', '').toLowerCase();
}

describe('parseColor', () => {
  it('принимает цвет с решёткой и без неё', () => {
    expect(parseColor('#b8b2a4')).toBe(0xb8b2a4);
    expect(parseColor('b8b2a4')).toBe(0xb8b2a4);
    expect(parseColor('#FF4D1F')).toBe(0xff4d1f);
  });

  it('ведущие нули не теряются', () => {
    expect(parseColor('#000a0b')).toBe(0x000a0b);
    expect(parseColor('000a0b')).toBe(0x000a0b);
  });

  it.each(['', '#', 'b8b2a', '#b8b2a4f', 'b8b2ag', '##b8b2a4', 'red'])('не принимает «%s»', (value) => {
    expect(() => parseColor(value)).toThrow();
  });
});

describe('цвета в данных', () => {
  it.each(Object.entries(enemiesJson.types).map(([type, { color }]) => [type, color] as const))(
    'враг %s: %s разбирается в то, что записано',
    (type, color) => {
      expect(enemyColor(type as EnemyTypeId).toString(16).padStart(6, '0')).toBe(digits(color));
    },
  );

  it.each(Object.entries(catsJson.elements).map(([element, { color }]) => [element, color] as const))(
    'кот %s: %s разбирается в то, что записано',
    (element, color) => {
      expect(elementColor(element as ElementId).toString(16).padStart(6, '0')).toBe(digits(color));
    },
  );
});
