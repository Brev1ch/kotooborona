import type { GearConfig } from '../data/types';
import type { Blast } from './Combat';

/**
 * Умение героя — редкий сильный удар: заряд копится со временем боя от 0 до 1 и тратится целиком.
 * Бить можно только при полном заряде. В начале уровня заряд пуст, между волнами копится дальше.
 */
export class Meteor {
  /** Заряд от 0 до 1; 1 — можно бить. */
  charge = 0;
  /** Игрок выбирает точку удара. */
  aiming = false;
  private readonly fullTime: number;

  /**
   * `chargeTime` — секунды боя до полного заряда (у уровня может быть своё); `chargeMult` — множитель от снаряжения,
   * не меньше `minChargeMult` из конфига: даже лучшее снаряжение не делает метеор частым. `ground` — горящая зона
   * после удара от легендарного посоха.
   */
  constructor(
    private readonly config: GearConfig['meteor'],
    chargeTime: number = config.chargeTime,
    chargeMult = 1,
    private readonly ground: { burnDps: number; time: number } | null = null,
  ) {
    this.fullTime = chargeTime * Math.max(config.minChargeMult, chargeMult);
  }

  /** Секунды боя от пустого заряда до полного, с учётом снаряжения. */
  get chargeTime(): number {
    return this.fullTime;
  }

  get ready(): boolean {
    return this.charge >= 1;
  }

  /** Доля заряда от 0 до 1. */
  get progress(): number {
    return this.charge;
  }

  /** Секунды боя до полного заряда. */
  get remaining(): number {
    return (1 - this.charge) * this.fullTime;
  }

  /** Бой прошёл `dt` секунд: на паузе бой не идёт, и заряд стоит. */
  update(dt: number): void {
    this.charge = this.fullTime > 0 ? Math.min(1, this.charge + dt / this.fullTime) : 1;
  }

  /** Включает или отменяет прицеливание; пока заряд не полон, оно не включается. Возвращает новое состояние. */
  toggleAim(): boolean {
    this.aiming = !this.aiming && this.ready;
    return this.aiming;
  }

  cancelAim(): void {
    this.aiming = false;
  }

  /** Заряд сразу полон: подарок «Второго шанса». */
  recharge(): void {
    this.charge = 1;
  }

  /**
   * Удар: снимает прицел и опустошает заряд. Возвращает силу взрыва или null, если заряд не полон.
   * Урон растёт с номером волны и живучестью врагов уровня.
   */
  cast(wave: number, hpMult: number): Blast | null {
    if (!this.ready) return null;
    this.aiming = false;
    this.charge = 0;

    const { damage, damageGrowthPerWave, radius, burnDps, burnTime } = this.config;
    const dealt = damage * Math.pow(damageGrowthPerWave, Math.max(0, wave - 1)) * hpMult;
    const blast: Blast = { radius, damage: dealt, burnDps: dealt * burnDps, burnTime };
    if (this.ground) blast.ground = { burnDps: dealt * this.ground.burnDps, time: this.ground.time };
    return blast;
  }
}
