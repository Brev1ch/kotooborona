import { describe, expect, it } from 'vitest';
import type { GearConfig } from '../data/types';
import { gearBonuses, noBonuses } from './Loadout';

// Числа зафиксированы здесь, чтобы тесты не зависели от правок баланса в JSON.
const config = {
  staff: [{ id: 'none' }, { id: 'fire', element: 'fire', summonWeight: 1.5 }, { id: 'dull', element: 'water' }],
  mantle: [
    { id: 'thrift', overLimitCostMult: 0.9 },
    { id: 'sorc', meteorCooldownMult: 0.8 },
    { id: 'ember', element: 'fire', summonWeight: 2, overLimitCostMult: 0.5 },
  ],
  amulet: [
    { id: 'alch', ritualTimeMult: 0.7 },
    { id: 'cry', bonusCrystals: 1 },
    { id: 'purse', bonusGold: 20 },
    { id: 'hoard', bonusGold: 5, bonusCrystals: 2, overLimitCostMult: 0.8 },
  ],
} as unknown as GearConfig;

describe('gearBonuses', () => {
  it('предметы без бонусов ничего не меняют', () => {
    const noMantle = { ...config, mantle: [{ id: 'plain' }] } as GearConfig;

    expect(gearBonuses(noMantle, { staff: 'none', mantle: 'plain', amulet: 'none' })).toEqual(noBonuses());
  });

  it('посох даёт вес своей стихии', () => {
    const bonuses = gearBonuses(config, { staff: 'fire', mantle: 'x', amulet: 'x' });

    expect(bonuses.summonWeights).toEqual({ fire: 1.5 });
  });

  it('посох со стихией, но без веса, шансы не меняет', () => {
    expect(gearBonuses(config, { staff: 'dull', mantle: 'x', amulet: 'x' }).summonWeights).toEqual({});
  });

  it('мантия бережливости удешевляет призыв', () => {
    const bonuses = gearBonuses(config, { staff: 'none', mantle: 'thrift', amulet: 'x' });

    expect(bonuses).toEqual({ ...noBonuses(), overLimitCostMult: 0.9 });
  });

  it('мантия чародея ускоряет перезарядку метеора', () => {
    const bonuses = gearBonuses(config, { staff: 'none', mantle: 'sorc', amulet: 'x' });

    expect(bonuses).toEqual({ ...noBonuses(), meteorCooldownMult: 0.8 });
  });

  it('амулет алхимика ускоряет ритуал', () => {
    const bonuses = gearBonuses(config, { staff: 'none', mantle: 'x', amulet: 'alch' });

    expect(bonuses).toEqual({ ...noBonuses(), ritualTimeMult: 0.7 });
  });

  it('амулет кристаллов и кошель дают стартовые запасы', () => {
    expect(gearBonuses(config, { staff: 'none', mantle: 'x', amulet: 'cry' }).bonusCrystals).toBe(1);
    expect(gearBonuses(config, { staff: 'none', mantle: 'x', amulet: 'purse' }).bonusGold).toBe(20);
  });

  it('бонусы трёх слотов действуют вместе', () => {
    expect(gearBonuses(config, { staff: 'fire', mantle: 'sorc', amulet: 'purse' })).toEqual({
      ...noBonuses(),
      summonWeights: { fire: 1.5 },
      meteorCooldownMult: 0.8,
      bonusGold: 20,
    });
  });

  it('одинаковые бонусы разных предметов: множители перемножаются, прибавки складываются', () => {
    const bonuses = gearBonuses(config, { staff: 'fire', mantle: 'ember', amulet: 'hoard' });

    expect(bonuses.summonWeights).toEqual({ fire: 3 });
    expect(bonuses.overLimitCostMult).toBeCloseTo(0.4);
    expect(bonuses.bonusGold).toBe(5);
    expect(bonuses.bonusCrystals).toBe(2);
  });

  it('незнакомый предмет ничего не даёт', () => {
    expect(gearBonuses(config, { staff: 'laser', mantle: 'cloak', amulet: 'ring' })).toEqual(noBonuses());
  });

  it('предмет из чужого слота не работает', () => {
    expect(gearBonuses(config, { staff: 'sorc', mantle: 'purse', amulet: 'fire' })).toEqual(noBonuses());
  });
});
