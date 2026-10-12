import type { CatsConfig, EnemiesConfig } from '../data/types';
import type { Cat } from '../entities/Cat';
import type { Enemy } from '../entities/Enemy';
import type { Path } from './Path';

export function catRange(config: CatsConfig, cat: Cat): number {
  return config.baseRange + config.rangePerLevel * cat.level;
}

export interface CombatSetup {
  enemies: EnemiesConfig;
  path: Path;
}

/** Что произошло за шаг боя; сцена по этим событиям меняет экономику и картинку. */
export type CombatEvent =
  /** Враг дошёл до ворот и снят с поля. */
  { kind: 'leaked'; enemy: Enemy; lifeDamage: number };

/** Движение врагов, выбор целей, урон и эффекты стихий. */
export class Combat {
  private alive: Enemy[] = [];

  constructor(private readonly setup: CombatSetup) {}

  /** Враги на поле в порядке появления. */
  get enemies(): readonly Enemy[] {
    return this.alive;
  }

  add(enemy: Enemy): void {
    this.alive.push(enemy);
  }

  /** Продвигает бой на `dt` секунд. */
  update(dt: number): CombatEvent[] {
    const events: CombatEvent[] = [];
    const { enemies, path } = this.setup;

    for (const enemy of this.alive) enemy.distance += enemy.speed * dt;

    this.alive = this.alive.filter((enemy) => {
      if (enemy.distance < path.length) return true;
      events.push({ kind: 'leaked', enemy, lifeDamage: enemies.types[enemy.type].lifeDamage });
      return false;
    });

    return events;
  }
}
