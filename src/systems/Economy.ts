import type { GearConfig, LevelConfig, LevelsConfig } from '../data/types';
import { noBonuses, type GearBonuses } from './Loadout';

/** Звёзды за пройденный уровень по числу потерянных жизней. */
export function starsFor(livesLost: number, rules: LevelsConfig['stars']): 1 | 2 | 3 {
  if (livesLost <= rules.threeStarsMaxLost) return 3;
  if (livesLost <= rules.twoStarsMaxLost) return 2;
  return 1;
}

/** Монеты, кристаллы, жизни и цена призыва; снаряжение меняет стартовые запасы и цену. */
export class Economy {
  gold: number;
  crystals: number;
  lives: number;
  /** Сколько жизней потеряно за бой; «Второй шанс» жизни возвращает, а этот счёт — нет. */
  livesLost = 0;
  private summons = 0;

  constructor(
    level: LevelConfig,
    private readonly summonConfig: GearConfig['summon'],
    private readonly bonuses: GearBonuses = noBonuses(),
  ) {
    this.gold = level.startGold + bonuses.bonusGold;
    this.crystals = level.startCrystals + bonuses.bonusCrystals;
    this.lives = level.startLives;
  }

  get summonCost(): number {
    const { baseCost, costGrowth } = this.summonConfig;
    return Math.round(baseCost * Math.pow(costGrowth, this.summons) * this.bonuses.summonCostMult);
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

  /** Награда за убитого врага. */
  reward(gold: number, crystals: number): void {
    this.gold += gold;
    this.crystals += crystals;
  }

  /** Враг прошёл в ворота; жизни не уходят ниже нуля. */
  loseLives(amount: number): void {
    const lost = Math.min(this.lives, amount);
    this.lives -= lost;
    this.livesLost += lost;
  }

  /** «Второй шанс»: жизни после поражения. Потерянные раньше остаются в счёте для звёзд. */
  revive(lives: number): void {
    this.lives = lives;
  }
}
