import type { EconomyConfig, LevelConfig, LevelsConfig } from '../data/types';
import { noBonuses, type GearBonuses } from './Loadout';

/** Звёзды за пройденный уровень по числу потерянных жизней. */
export function starsFor(livesLost: number, rules: LevelsConfig['stars']): 1 | 2 | 3 {
  if (livesLost <= rules.threeStarsMaxLost) return 3;
  if (livesLost <= rules.twoStarsMaxLost) return 2;
  return 1;
}

/**
 * Монеты, кристаллы, жизни и призыв. Кот всегда стоит одинаково, но каждая волна даёт лишь несколько призывов
 * по этой цене; сверх лимита призыв дороже. Снаряжение меняет стартовые запасы и штраф.
 */
export class Economy {
  gold: number;
  crystals: number;
  lives: number;
  /** Сколько жизней потеряно за бой; «Второй шанс» жизни возвращает, а этот счёт — нет. */
  livesLost = 0;
  /** Призывы с начала текущей волны (или с начала боя, пока первая не началась). */
  private summonsThisWave = 0;
  private limit: number;

  constructor(
    level: LevelConfig,
    private readonly config: EconomyConfig,
    private readonly bonuses: GearBonuses = noBonuses(),
  ) {
    this.gold = level.startGold + bonuses.bonusGold;
    this.crystals = level.startCrystals + bonuses.bonusCrystals;
    this.lives = level.startLives;
    this.limit = config.summon.beforeFirstWave;
  }

  /** Сколько призывов по обычной цене даёт текущая волна. */
  get summonLimit(): number {
    return this.limit;
  }

  /** Сколько из них ещё не потрачено. */
  get summonsLeft(): number {
    return Math.max(0, this.limit - this.summonsThisWave);
  }

  /** Во сколько раз дороже следующий призыв; 1 — лимит ещё не исчерпан. */
  get overLimitMult(): number {
    const over = this.summonsThisWave - this.limit;
    if (over < 0) return 1;
    const steps = this.config.summon.overLimitMult;
    return steps[Math.min(over, steps.length - 1)] ?? 1;
  }

  get summonCost(): number {
    const mult = this.overLimitMult;
    const discount = mult > 1 ? this.bonuses.overLimitCostMult : 1;
    return Math.round(this.config.summon.cost * mult * discount);
  }

  canAffordSummon(): boolean {
    return this.gold >= this.summonCost;
  }

  /** Списывает цену призыва и тратит один призыв волны. Возвращает false, если монет не хватило. */
  paySummon(): boolean {
    if (!this.canAffordSummon()) return false;
    this.gold -= this.summonCost;
    this.summonsThisWave++;
    return true;
  }

  /** Началась волна: лимит призывов обновляется, неистраченные призывы прошлой волны сгорают. */
  startWave(): void {
    this.limit = this.config.summon.perWave;
    this.summonsThisWave = 0;
  }

  /** Сколько монет вернёт продажа того, во что вложено `invested`. */
  sellValue(invested: number): number {
    return Math.floor(invested * this.config.sell.refund);
  }

  /** Продажа через корзину: возвращает часть вложенного. Возвращает, сколько монет пришло. */
  sell(invested: number): number {
    const gold = this.sellValue(invested);
    this.gold += gold;
    return gold;
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
