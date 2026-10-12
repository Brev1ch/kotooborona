import type { CatsConfig } from '../data/types';
import type { Cat } from '../entities/Cat';

export function catRange(config: CatsConfig, cat: Cat): number {
  return config.baseRange + config.rangePerLevel * cat.level;
}

/** Выбор целей, урон и эффекты стихий. */
export class Combat {}
