import { describe, expect, it } from 'vitest';
import { BOARD_H, BOARD_W, ROAD, TRASH } from '../layout';
import { levels } from './index';
import type { Point } from './types';

/** Расстояние от точки до отрезка. */
function distanceToSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const k = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - k * dx, py - ay - k * dy);
}

describe.each(levels.levels.map((level) => [level.id, level] as const))('корзина на уровне %s', (_id, level) => {
  const [x, y] = level.trash;
  const half = TRASH.size / 2;

  it('целиком на поле', () => {
    expect(x - half).toBeGreaterThanOrEqual(0);
    expect(y - half).toBeGreaterThanOrEqual(0);
    expect(x + half).toBeLessThanOrEqual(BOARD_W);
    expect(y + half).toBeLessThanOrEqual(BOARD_H);
  });

  it('не стоит на дороге', () => {
    const toRoad = Math.min(...level.path.slice(1).map((to, i) => distanceToSegment(level.trash, level.path[i], to)));

    expect(toRoad).toBeGreaterThanOrEqual(ROAD.outerWidth / 2 + half);
  });

  it('не закрывает клетки: отпустить кота над корзиной и над клеткой сразу нельзя', () => {
    const size = levels.slotSize;
    const overlaps = level.slots.filter(([sx, sy]) => x + half > sx && x - half < sx + size && y + half > sy && y - half < sy + size);

    expect(overlaps).toEqual([]);
  });

  it('не стоит на герое', () => {
    expect(Math.hypot(x - level.hero[0], y - level.hero[1])).toBeGreaterThan(TRASH.size);
  });
});
