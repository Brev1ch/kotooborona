import type { Point } from '../data/types';

interface Segment {
  from: Point;
  to: Point;
  length: number;
  /** Расстояние от начала дороги до начала отрезка. */
  start: number;
}

/** Дорога как ломаная с заранее посчитанными длинами. */
export interface Path {
  segments: Segment[];
  length: number;
}

export function buildPath(points: readonly Point[]): Path {
  if (points.length < 2) throw new Error('Path needs at least two points');

  const segments: Segment[] = [];
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const segmentLength = Math.hypot(to[0] - from[0], to[1] - from[1]);
    segments.push({ from, to, length: segmentLength, start: length });
    length += segmentLength;
  }
  return { segments, length };
}

/** Точка дороги на расстоянии `distance` от начала; за краями дороги — её концы. */
export function positionAt(path: Path, distance: number): Point {
  const d = Math.max(0, distance);
  for (const { from, to, length, start } of path.segments) {
    if (length === 0 || d > start + length) continue;
    const k = (d - start) / length;
    return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
  }
  const last = path.segments[path.segments.length - 1].to;
  return [last[0], last[1]];
}
