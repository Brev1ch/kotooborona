import adsJson from './ads.json';
import artJson from './art.json';
import catsJson from './cats.json';
import economyJson from './economy.json';
import enemiesJson from './enemies.json';
import gearJson from './gear.json';
import levelsJson from './levels.json';
import storyJson from './story.json';
import type { AdsConfig, ArtConfig, CatsConfig, EconomyConfig, ElementId, EnemiesConfig, EnemyTypeId, GearConfig, LevelConfig, LevelsConfig, StoryConfig } from './types';

// Через unknown: пары стихий в JSON выводятся как string[], а не как кортеж.
export const cats = catsJson as unknown as CatsConfig;
export const enemies = enemiesJson as EnemiesConfig;
export const gear = gearJson as GearConfig;
export const levels = levelsJson as LevelsConfig;
export const ads = adsJson as AdsConfig;
export const economy = economyJson as EconomyConfig;
export const story = storyJson as StoryConfig;
export const art = artJson as ArtConfig;

export function getLevel(id: string): LevelConfig {
  const level = levels.levels.find((l) => l.id === id);
  if (!level) throw new Error(`Unknown level: ${id}`);
  return level;
}

/** Цвет из данных числом, как его ждёт Phaser: шесть шестнадцатеричных цифр, с `#` в начале или без. */
export function parseColor(value: string): number {
  const hex = value.startsWith('#') ? value.slice(1) : value;
  if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error(`Bad color: ${value}`);
  return parseInt(hex, 16);
}

export function elementColor(element: ElementId): number {
  return parseColor(cats.elements[element].color);
}

export function enemyColor(type: EnemyTypeId): number {
  return parseColor(enemies.types[type].color);
}

export * from './types';
