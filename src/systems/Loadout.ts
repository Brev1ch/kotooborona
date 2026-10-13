import type { CatsConfig, ElementId, GearConfig, GearItem } from '../data/types';
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

/** Один бонус предмета в виде, готовом для описания игроку; доли переведены в целые проценты. */
export type BonusLine =
  /** Шанс призвать кота стихии с этим предметом и без него. */
  | { kind: 'summonChance'; element: ElementId; chance: number; base: number }
  /** На сколько процентов дешевле призыв. */
  | { kind: 'summonCost'; percent: number }
  /** На сколько процентов короче перезарядка метеора. */
  | { kind: 'meteorCooldown'; percent: number }
  /** На сколько процентов короче ритуал. */
  | { kind: 'ritualTime'; percent: number }
  | { kind: 'crystals'; count: number }
  | { kind: 'gold'; count: number };

function percentOff(mult: number): number {
  return Math.round((1 - mult) * 100);
}

/** Бонусы предмета для экрана снаряжения; у предмета без бонусов список пуст. */
export function itemBonuses(item: GearItem, cats: CatsConfig): BonusLine[] {
  const lines: BonusLine[] = [];
  if (item.element && item.summonWeight !== undefined && item.summonWeight !== 1) {
    // Призываются только базовые стихии; у всех, кроме стихии предмета, вес 1.
    const others = Object.values(cats.elements).filter((element) => !element.from).length - 1;
    lines.push({
      kind: 'summonChance',
      element: item.element,
      chance: Math.round((item.summonWeight / (item.summonWeight + others)) * 100),
      base: Math.round(100 / (others + 1)),
    });
  }
  if (item.summonCostMult !== undefined) lines.push({ kind: 'summonCost', percent: percentOff(item.summonCostMult) });
  if (item.meteorCooldownMult !== undefined) {
    lines.push({ kind: 'meteorCooldown', percent: percentOff(item.meteorCooldownMult) });
  }
  if (item.ritualTimeMult !== undefined) lines.push({ kind: 'ritualTime', percent: percentOff(item.ritualTimeMult) });
  if (item.bonusCrystals) lines.push({ kind: 'crystals', count: item.bonusCrystals });
  if (item.bonusGold) lines.push({ kind: 'gold', count: item.bonusGold });
  return lines;
}
