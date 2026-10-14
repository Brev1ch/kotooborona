import type { Point } from '../data/types';

// Узор поля, пока нет картинки фона: пятна травы и цветочки по всему полю, пятна и камешки на тропинке.
// Раскладка своя у каждого уровня и одна и та же при каждом входе: случайность — из зерна по id уровня,
// а не из `random` боя, чтобы узор не сдвигал призывы и волны.

/** Пятно или камешек: центр, размер и номер цвета из палитры. */
export interface DecorSpot {
  x: number;
  y: number;
  size: number;
  color: number;
}

export interface DecorRules {
  /** Пятна травы и цветочки на всё поле. */
  patches: number;
  patchSize: [number, number];
  patchColors: number;
  flowers: number;
  flowerSize: [number, number];
  flowerColors: number;
  /** На каждые 100 точек тропинки. */
  spotsPer100: number;
  spotSize: [number, number];
  pebblesPer100: number;
  pebbleSize: [number, number];
  pebbleColors: number;
  /** Ширина тропинки: пятна и камешки ложатся в её середину, не ближе `margin` к краю. */
  roadWidth: number;
  margin: number;
}

export interface FieldDecor {
  patches: DecorSpot[];
  flowers: DecorSpot[];
  spots: DecorSpot[];
  pebbles: DecorSpot[];
}

/** Числа от 0 до 1 из зерна-строки: одно зерно — одна последовательность (mulberry32). */
export function decorRandom(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Точка на расстоянии `distance` от начала ломаной и направление участка в ней. */
function along(path: Point[], distance: number): { x: number; y: number; nx: number; ny: number } {
  let left = distance;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const length = Math.hypot(bx - ax, by - ay);
    if (left <= length || i === path.length - 2) {
      const k = length > 0 ? Math.min(1, left / length) : 0;
      const ux = length > 0 ? (bx - ax) / length : 1;
      const uy = length > 0 ? (by - ay) / length : 0;
      return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k, nx: -uy, ny: ux };
    }
    left -= length;
  }
  const [x, y] = path[0];
  return { x, y, nx: 0, ny: 1 };
}

function pathLength(path: Point[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  return total;
}

/** Расстояние от точки до ломаной. */
export function distanceToPath(path: Point[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const k = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * k), y - (ay + dy * k)));
  }
  return best;
}

/** Раскладка узора поля `width`×`height` с тропинкой `path`; `seed` — id уровня. */
export function fieldDecor(seed: string, width: number, height: number, path: Point[], rules: DecorRules): FieldDecor {
  const next = decorRandom(seed);
  const between = ([from, to]: [number, number]): number => from + (to - from) * next();
  const pick = (count: number): number => Math.min(count - 1, Math.floor(next() * count));
  const offRoad = rules.roadWidth / 2;

  // Трава и цветы — мимо тропинки: под ней их всё равно не видно.
  const scatter = (count: number, size: [number, number], colors: number): DecorSpot[] => {
    const spots: DecorSpot[] = [];
    for (let i = 0; i < count; i++) {
      const spot = { x: next() * width, y: next() * height, size: between(size), color: pick(colors) };
      if (distanceToPath(path, spot.x, spot.y) > offRoad + spot.size / 2) spots.push(spot);
    }
    return spots;
  };
  const patches = scatter(rules.patches, rules.patchSize, rules.patchColors);
  const flowers = scatter(rules.flowers, rules.flowerSize, rules.flowerColors);

  // Пятна и камешки — по тропинке, со сдвигом поперёк неё, но не к самому краю.
  const length = pathLength(path);
  const onRoad = (per100: number, size: [number, number], colors: number): DecorSpot[] => {
    const spots: DecorSpot[] = [];
    const count = Math.round((length / 100) * per100);
    for (let i = 0; i < count; i++) {
      const at = along(path, next() * length);
      const s = between(size);
      const reach = Math.max(0, offRoad - rules.margin - s / 2);
      const shift = (next() * 2 - 1) * reach;
      const spot = { x: at.x + at.nx * shift, y: at.y + at.ny * shift, size: s, color: pick(colors) };
      if (spot.x >= 0 && spot.x <= width && spot.y >= 0 && spot.y <= height) spots.push(spot);
    }
    return spots;
  };
  const spots = onRoad(rules.spotsPer100, rules.spotSize, 1);
  const pebbles = onRoad(rules.pebblesPer100, rules.pebbleSize, rules.pebbleColors);
  return { patches, flowers, spots, pebbles };
}
