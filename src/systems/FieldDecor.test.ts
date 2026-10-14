import { describe, expect, it } from 'vitest';
import type { Point } from '../data/types';
import { decorRandom, distanceToPath, fieldDecor, type DecorRules } from './FieldDecor';

const rules: DecorRules = {
  patches: 40,
  patchSize: [10, 30],
  patchColors: 2,
  flowers: 50,
  flowerSize: [2, 4],
  flowerColors: 3,
  spotsPer100: 3,
  spotSize: [3, 7],
  pebblesPer100: 4,
  pebbleSize: [1, 3],
  pebbleColors: 2,
  roadWidth: 34,
  margin: 4,
};
const path: Point[] = [[30, -20], [30, 500], [330, 500], [330, -20]];

describe('узор поля', () => {
  it('одно зерно — один узор, другое зерно — другой', () => {
    expect(fieldDecor('opushka', 360, 540, path, rules)).toEqual(fieldDecor('opushka', 360, 540, path, rules));
    expect(fieldDecor('opushka', 360, 540, path, rules)).not.toEqual(fieldDecor('lager', 360, 540, path, rules));
  });

  it('трава и цветы не лезут на тропинку', () => {
    const { patches, flowers } = fieldDecor('opushka', 360, 540, path, rules);
    expect(patches.length).toBeGreaterThan(0);
    expect(flowers.length).toBeGreaterThan(0);
    for (const spot of [...patches, ...flowers]) {
      expect(distanceToPath(path, spot.x, spot.y)).toBeGreaterThan(rules.roadWidth / 2);
    }
  });

  it('пятна и камешки — внутри тропинки и на поле, их число растёт с её длиной', () => {
    const { spots, pebbles } = fieldDecor('opushka', 360, 540, path, rules);
    for (const spot of [...spots, ...pebbles]) {
      expect(distanceToPath(path, spot.x, spot.y)).toBeLessThanOrEqual(rules.roadWidth / 2 - rules.margin + 1e-6);
      expect(spot.x >= 0 && spot.x <= 360 && spot.y >= 0 && spot.y <= 540).toBe(true);
    }
    const short = fieldDecor('opushka', 360, 540, [[30, 0], [30, 200]], rules);
    expect(short.pebbles.length).toBeLessThan(pebbles.length);
  });

  it('номер цвета — из палитры', () => {
    const decor = fieldDecor('ruchey', 360, 540, path, rules);
    for (const spot of decor.flowers) expect(spot.color).toBeLessThan(rules.flowerColors);
    for (const spot of decor.pebbles) expect(spot.color).toBeLessThan(rules.pebbleColors);
  });

  it('случайность узора — от 0 до 1 и своя на каждое зерно', () => {
    const a = decorRandom('a');
    const values = Array.from({ length: 100 }, () => a());
    for (const value of values) expect(value >= 0 && value < 1).toBe(true);
    expect(decorRandom('a')()).toBe(values[0]);
    expect(decorRandom('b')()).not.toBe(values[0]);
  });
});
