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
  /** Множитель скорости от замедления; 1 — идёт как обычно. */
  slowFactor: number;
  slowTime: number;
  /** Урон от огня в секунду, пока не вышло burnTime. */
  burnDps: number;
  burnTime: number;
  poisonDps: number;
  poisonTime: number;
}
