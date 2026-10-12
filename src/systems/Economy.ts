import type { GearConfig, LevelConfig } from '../data/types';

/** Монеты, кристаллы, жизни и цена призыва. */
export class Economy {
  gold: number;
  crystals: number;
  lives: number;
  private summons = 0;

  constructor(
    level: LevelConfig,
    private readonly summonConfig: GearConfig['summon'],
  ) {
    this.gold = level.startGold;
    this.crystals = level.startCrystals;
    this.lives = level.startLives;
  }

  get summonCost(): number {
    const { baseCost, costGrowth } = this.summonConfig;
    return Math.round(baseCost * Math.pow(costGrowth, this.summons));
  }

  canAffordSummon(): boolean {
    return this.gold >= this.summonCost;
  }

  /** Списывает цену призыва и поднимает следующую. Возвращает false, если монет не хватило. */
  paySummon(): boolean {
    if (!this.canAffordSummon()) return false;
    this.gold -= this.summonCost;
    this.summons++;
    return true;
  }

  /** Враг прошёл в ворота; жизни не уходят ниже нуля. */
  loseLives(amount: number): void {
    this.lives = Math.max(0, this.lives - amount);
  }
}
