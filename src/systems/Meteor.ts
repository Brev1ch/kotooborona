import type { GearConfig, GearItem } from '../data/types';
import type { Blast } from './Combat';

/** Умение героя: перезарядка, прицеливание и сила удара. */
export class Meteor {
  /** Секунды до готовности; 0 — можно бить. */
  remaining = 0;
  /** Игрок выбирает точку удара. */
  aiming = false;

  constructor(
    private readonly config: GearConfig['meteor'],
    private readonly mantle?: GearItem,
  ) {}

  /** Полная перезарядка с учётом мантии. */
  get cooldown(): number {
    return this.config.cooldown * (this.mantle?.meteorCooldownMult ?? 1);
  }

  get ready(): boolean {
    return this.remaining <= 0;
  }

  /** Доля прошедшей перезарядки от 0 до 1; 1 — умение готово. */
  get progress(): number {
    return this.cooldown > 0 ? 1 - this.remaining / this.cooldown : 1;
  }

  update(dt: number): void {
    this.remaining = Math.max(0, this.remaining - dt);
  }

  /** Включает или отменяет прицеливание; пока идёт перезарядка, оно не включается. Возвращает новое состояние. */
  toggleAim(): boolean {
    this.aiming = !this.aiming && this.ready;
    return this.aiming;
  }

  cancelAim(): void {
    this.aiming = false;
  }

  /**
   * Удар: снимает прицел и запускает перезарядку. Возвращает силу взрыва или null, если умение не готово.
   * Урон растёт с номером волны и живучестью врагов уровня.
   */
  cast(wave: number, hpMult: number): Blast | null {
    if (!this.ready) return null;
    this.aiming = false;
    this.remaining = this.cooldown;

    const { damage, damageGrowthPerWave, radius, burnDps, burnTime } = this.config;
    const dealt = damage * Math.pow(damageGrowthPerWave, Math.max(0, wave - 1)) * hpMult;
    return { radius, damage: dealt, burnDps: dealt * burnDps, burnTime };
  }
}
