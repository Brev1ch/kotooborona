import { describe, expect, it } from 'vitest';
import { levels } from '../data';
import type { LevelConfig } from '../data';
import { Economy } from './Economy';

// Числа зафиксированы здесь, чтобы тесты не зависели от правок баланса в JSON.
const level: LevelConfig = { ...levels.levels[0], startGold: 25, startCrystals: 2, startLives: 10 };
const summon = { baseCost: 10, costGrowth: 1.5 };

describe('Economy', () => {
  it('берёт стартовые монеты, кристаллы и жизни из уровня', () => {
    const economy = new Economy(level, summon);

    expect(economy.gold).toBe(25);
    expect(economy.crystals).toBe(2);
    expect(economy.lives).toBe(10);
  });

  it('первый призыв стоит базовую цену', () => {
    expect(new Economy(level, summon).summonCost).toBe(10);
  });

  it('цена растёт с каждым призывом и округляется до целого', () => {
    const economy = new Economy({ ...level, startGold: 1000 }, summon);
    const costs: number[] = [];
    for (let i = 0; i < 4; i++) {
      costs.push(economy.summonCost);
      economy.paySummon();
    }

    // 10, 15, 22.5 → 23, 33.75 → 34
    expect(costs).toEqual([10, 15, 23, 34]);
  });

  it('оплата списывает текущую цену', () => {
    const economy = new Economy(level, summon);

    expect(economy.paySummon()).toBe(true);
    expect(economy.gold).toBe(15);
  });

  it('хватает монет ровно на цену — призыв доступен', () => {
    const economy = new Economy({ ...level, startGold: 10 }, summon);

    expect(economy.canAffordSummon()).toBe(true);
    expect(economy.paySummon()).toBe(true);
    expect(economy.gold).toBe(0);
  });

  it('без монет оплата не проходит и ничего не меняет', () => {
    const economy = new Economy(level, summon);
    economy.paySummon();
    economy.paySummon();
    expect(economy.gold).toBe(0);

    expect(economy.canAffordSummon()).toBe(false);
    expect(economy.paySummon()).toBe(false);
    expect(economy.gold).toBe(0);
    expect(economy.summonCost).toBe(23);
  });

  it('призыв снова доступен, когда монеты появились', () => {
    const economy = new Economy({ ...level, startGold: 0 }, summon);
    expect(economy.canAffordSummon()).toBe(false);

    economy.gold += 10;

    expect(economy.canAffordSummon()).toBe(true);
  });

  it('оплата призыва не трогает кристаллы и жизни', () => {
    const economy = new Economy(level, summon);
    economy.paySummon();

    expect(economy.crystals).toBe(2);
    expect(economy.lives).toBe(10);
  });

  it('прошедший враг отнимает жизни', () => {
    const economy = new Economy(level, summon);
    economy.loseLives(2);

    expect(economy.lives).toBe(8);
  });

  it('жизни не уходят ниже нуля', () => {
    const economy = new Economy(level, summon);
    economy.loseLives(7);
    economy.loseLives(5);

    expect(economy.lives).toBe(0);
  });
});
