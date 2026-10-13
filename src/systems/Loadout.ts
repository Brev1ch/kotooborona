import type { ElementId, GearConfig, GearSlot } from '../data/types';
import { gearAtLevel, GEAR_SLOTS } from './Gear';

/** Выбор старого снаряжения (до инвентаря): id предмета из списка в каждом слоте. */
export type GearSelection = Record<GearSlot, string>;

/** Суммарный эффект надетого снаряжения на бой. */
export interface GearBonuses {
  /** Вес стихии при призыве; у стихий, которых здесь нет, вес 1. */
  summonWeights: Partial<Record<ElementId, number>>;
  /** Множитель цены призыва сверх лимита волны. */
  overLimitCostMult: number;
  meteorCooldownMult: number;
  ritualTimeMult: number;
  /** Кристаллы и монеты сверх стартовых запасов уровня. */
  bonusCrystals: number;
  bonusGold: number;
  /** Прибавка к лимиту призывов каждой волны. */
  summonLimitBonus: number;
  /** Каждый N-й призыв за бой бесплатный; 0 — такого правила нет. */
  freeSummonEvery: number;
  /** Шанс от 0 до 1, что призванный кот сразу 2-го уровня. */
  level2Chance: number;
  /** Прибавка к урону котов стихии и гибридов с ней: 0.1 — на десять процентов больше. */
  elementDamage: Partial<Record<ElementId, number>>;
  /** Множитель монет, которые приносят строения. */
  buildingIncomeMult: number;
  /** Метеор оставляет горящую зону: `burnDps` — доля урона взрыва в секунду, `time` — сколько секунд она горит. */
  meteorGround: { burnDps: number; time: number } | null;
}

/** Бой без снаряжения. */
export function noBonuses(): GearBonuses {
  return {
    summonWeights: {},
    overLimitCostMult: 1,
    meteorCooldownMult: 1,
    ritualTimeMult: 1,
    bonusCrystals: 0,
    bonusGold: 0,
    summonLimitBonus: 0,
    freeSummonEvery: 0,
    level2Chance: 0,
    elementDamage: {},
    buildingIncomeMult: 1,
    meteorGround: null,
  };
}

/**
 * Бонусы старого снаряжения (до инвентаря): по ним проверяется, что перенесённые в инвентарь предметы дают то же самое.
 * Складывает бонусы надетых предметов с учётом их прокачки. Бонус не привязан к слоту: что написано у предмета в gear.json,
 * то и работает. Множители перемножаются, прибавки складываются; незнакомый id ничего не даёт.
 */
export function gearBonuses(
  config: GearConfig,
  worn: GearSelection,
  /** Уровень прокачки предмета; без него все предметы первого уровня. */
  levelOf: (slot: GearSlot, id: string) => number = () => 1,
): GearBonuses {
  const bonuses = noBonuses();
  for (const slot of GEAR_SLOTS) {
    const base = config[slot].find((candidate) => candidate.id === worn[slot]);
    if (!base) continue;
    const item = gearAtLevel(base, levelOf(slot, base.id));

    if (item.element && item.summonWeight !== undefined) {
      bonuses.summonWeights[item.element] = (bonuses.summonWeights[item.element] ?? 1) * item.summonWeight;
    }
    bonuses.overLimitCostMult *= item.overLimitCostMult ?? 1;
    bonuses.meteorCooldownMult *= item.meteorCooldownMult ?? 1;
    bonuses.ritualTimeMult *= item.ritualTimeMult ?? 1;
    bonuses.bonusCrystals += item.bonusCrystals ?? 0;
    bonuses.bonusGold += item.bonusGold ?? 0;
  }
  return bonuses;
}
