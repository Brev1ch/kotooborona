import type { ElementId, GearConfig } from '../data/types';
import { GEAR_SLOTS, type GearSelection } from './Progress';

/** Суммарный эффект надетого снаряжения на бой. */
export interface GearBonuses {
  /** Вес стихии при призыве; у стихий, которых здесь нет, вес 1. */
  summonWeights: Partial<Record<ElementId, number>>;
  summonCostMult: number;
  meteorCooldownMult: number;
  ritualTimeMult: number;
  /** Кристаллы и монеты сверх стартовых запасов уровня. */
  bonusCrystals: number;
  bonusGold: number;
}

/** Бой без снаряжения. */
export function noBonuses(): GearBonuses {
  return {
    summonWeights: {},
    summonCostMult: 1,
    meteorCooldownMult: 1,
    ritualTimeMult: 1,
    bonusCrystals: 0,
    bonusGold: 0,
  };
}

/**
 * Складывает бонусы надетых предметов. Бонус не привязан к слоту: что написано у предмета в gear.json,
 * то и работает. Множители перемножаются, прибавки складываются; незнакомый id ничего не даёт.
 */
export function gearBonuses(config: GearConfig, worn: GearSelection): GearBonuses {
  const bonuses = noBonuses();
  for (const slot of GEAR_SLOTS) {
    const item = config[slot].find((candidate) => candidate.id === worn[slot]);
    if (!item) continue;

    if (item.element && item.summonWeight !== undefined) {
      bonuses.summonWeights[item.element] = (bonuses.summonWeights[item.element] ?? 1) * item.summonWeight;
    }
    bonuses.summonCostMult *= item.summonCostMult ?? 1;
    bonuses.meteorCooldownMult *= item.meteorCooldownMult ?? 1;
    bonuses.ritualTimeMult *= item.ritualTimeMult ?? 1;
    bonuses.bonusCrystals += item.bonusCrystals ?? 0;
    bonuses.bonusGold += item.bonusGold ?? 0;
  }
  return bonuses;
}
