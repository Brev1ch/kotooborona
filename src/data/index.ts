import catsJson from './cats.json';
import enemiesJson from './enemies.json';
import gearJson from './gear.json';
import levelsJson from './levels.json';
import type { CatsConfig, ElementId, EnemiesConfig, GearConfig, LevelConfig, LevelsConfig } from './types';

// Через unknown: пары стихий в JSON выводятся как string[], а не как кортеж.
export const cats = catsJson as unknown as CatsConfig;
export const enemies = enemiesJson as EnemiesConfig;
export const gear = gearJson as GearConfig;
export const levels = levelsJson as LevelsConfig;

export function getLevel(id: string): LevelConfig {
  const level = levels.levels.find((l) => l.id === id);
  if (!level) throw new Error(`Unknown level: ${id}`);
  return level;
}

/** Цвет стихии числом, как его ждёт Phaser. */
export function elementColor(element: ElementId): number {
  return parseInt(cats.elements[element].color.slice(1), 16);
}

export * from './types';
