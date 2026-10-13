import type { EnemiesConfig, EnemyTypeId, LevelConfig, StoryConfig, StoryScene } from '../data/types';

/**
 * Сценка, которую нужно показать перед уровнем, или null.
 * Сценка идёт перед уровнем, пока он не пройден, и не чаще раза за запуск игры:
 * проигравший и зашедший снова её уже не увидит.
 */
export function storyBefore(
  config: StoryConfig,
  levelId: string,
  passed: boolean,
  seen: ReadonlySet<string>,
): StoryScene | null {
  if (passed) return null;
  return config.scenes.find((scene) => scene.before === levelId && !seen.has(scene.id)) ?? null;
}

/**
 * Враг, чью карточку «Новый враг» нужно показать перед уровнем, или null.
 * Правило то же, что у сценок: пока уровень не пройден и не чаще раза за запуск игры (`seen` — id уровней).
 */
export function introBefore(level: LevelConfig, passed: boolean, seen: ReadonlySet<string>): EnemyTypeId | null {
  if (passed || seen.has(level.id)) return null;
  return level.intro ?? null;
}

/** Выходит ли враг на уровне: в обычных волнах (с учётом волны, с которой он появляется), командиром или королём. */
export function appearsOn(level: LevelConfig, enemies: EnemiesConfig, type: EnemyTypeId): boolean {
  if (type === 'king') return level.kingWave !== undefined;
  if (type === 'boss') return level.bossWaves.length > 0;
  // Мыши занимают остаток долей и заменяют тех, чья волна ещё не пришла.
  if (type === 'mouse') return true;
  return (level.enemies[type] ?? 0) > 0 && (enemies.types[type].fromWave ?? 1) <= level.waves;
}

/** id первого уровня, на котором выходит враг; null — в этих уровнях его нет. */
export function firstAppearance(levels: readonly LevelConfig[], enemies: EnemiesConfig, type: EnemyTypeId): string | null {
  return levels.find((level) => appearsOn(level, enemies, type))?.id ?? null;
}
