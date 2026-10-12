import { describe, expect, it } from 'vitest';
import type { Point } from '../data';
import { buildPath, positionAt } from './Path';

// Буква «Г»: 100 вниз, затем 50 вправо.
const points: Point[] = [
  [10, 0],
  [10, 100],
  [60, 100],
];
const path = buildPath(points);

describe('buildPath', () => {
  it('складывает длины отрезков', () => {
    expect(path.length).toBe(150);
    expect(path.segments.map((s) => s.start)).toEqual([0, 100]);
  });

  it('не строит дорогу из одной точки', () => {
    expect(() => buildPath([[0, 0]])).toThrow();
  });
});

describe('positionAt', () => {
  it('начало дороги — первая точка', () => {
    expect(positionAt(path, 0)).toEqual([10, 0]);
  });

  it('идёт вдоль первого отрезка', () => {
    expect(positionAt(path, 40)).toEqual([10, 40]);
  });

  it('на стыке отрезков стоит в углу', () => {
    expect(positionAt(path, 100)).toEqual([10, 100]);
  });

  it('после поворота идёт вдоль второго отрезка', () => {
    expect(positionAt(path, 125)).toEqual([35, 100]);
  });

  it('за концом дороги остаётся в последней точке', () => {
    expect(positionAt(path, 150)).toEqual([60, 100]);
    expect(positionAt(path, 999)).toEqual([60, 100]);
  });

  it('до начала дороги остаётся в первой точке', () => {
    expect(positionAt(path, -5)).toEqual([10, 0]);
  });

  it('пропускает отрезок нулевой длины', () => {
    const doubled = buildPath([
      [0, 0],
      [0, 0],
      [10, 0],
    ]);

    expect(positionAt(doubled, 0)).toEqual([0, 0]);
    expect(positionAt(doubled, 4)).toEqual([4, 0]);
  });
});
