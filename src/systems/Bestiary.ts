import type { EnemiesConfig, EnemyTypeId } from '../data/types';

/** Страница бестиария. */
export interface BestiaryEntry {
  type: EnemyTypeId;
  /** Враг известен после первой победы над ним; до этого на странице только силуэт. */
  known: boolean;
}

/** Все враги игры в порядке конфига. */
export function bestiaryEntries(enemies: EnemiesConfig, met: (type: EnemyTypeId) => boolean): BestiaryEntry[] {
  return (Object.keys(enemies.types) as EnemyTypeId[]).map((type) => ({ type, known: met(type) }));
}

/** Числа из данных врага, которые подставляются в текст его особенности. */
export function traitParams(enemies: EnemiesConfig, type: EnemyTypeId): Record<string, number> {
  const config = enemies.types[type];
  return { n: config.dodgeEvery ?? 0, shield: config.shield };
}
