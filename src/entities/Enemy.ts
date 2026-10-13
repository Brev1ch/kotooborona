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
  /** Подмога, которую призывает этот враг; `timer` — секунды до следующего призыва. */
  summon?: EnemySummon;
}

export interface EnemySummon {
  timer: number;
  interval: number;
  count: number;
  /** Расстояние между призванными вдоль дороги. */
  spread: number;
  /** Призванный враг в момент появления; для каждого делается копия. */
  minion: Enemy;
}
