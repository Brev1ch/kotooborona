import type { EnemyTypeId } from '../data/types';

export interface Enemy {
  type: EnemyTypeId;
  /** Пройденное расстояние вдоль дороги. */
  distance: number;
  hp: number;
  maxHp: number;
  speed: number;
  gold: number;
  shield: number;
}
