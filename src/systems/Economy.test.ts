import { describe, expect, it } from 'vitest';
import { economy as economyJson, levels } from '../data';
import type { EconomyConfig, LevelConfig } from '../data';
import { Economy, starsFor } from './Economy';
import { noBonuses } from './Loadout';

// Числа зафиксированы здесь, чтобы тесты не зависели от правок баланса в JSON.
const level: LevelConfig = { ...levels.levels[0], startGold: 25, startCrystals: 2, startLives: 10 };
const config: EconomyConfig = {
  ...economyJson,
  summon: { cost: 10, perWave: 2, beforeFirstWave: 3, overLimitMult: [2, 3, 4], overLimitGrowth: 1 },
  sell: { refund: 0.5 },
};

describe('Economy', () => {
  it('берёт стартовые монеты, кристаллы и жизни из уровня', () => {
    const economy = new Economy(level, config);

    expect(economy.gold).toBe(25);
    expect(economy.crystals).toBe(2);
    expect(economy.lives).toBe(10);
  });

  it('кот стоит одинаково, пока лимит волны не исчерпан', () => {
    const economy = new Economy({ ...level, startGold: 1000 }, config);
    const costs: number[] = [];
    for (let i = 0; i < 3; i++) {
      costs.push(economy.summonCost);
      economy.paySummon();
    }

    expect(costs).toEqual([10, 10, 10]);
  });

  it('до первой волны лимит свой, остаток убывает с каждым призывом', () => {
    const economy = new Economy({ ...level, startGold: 1000 }, config);
    expect(economy.summonLimit).toBe(3);
    expect(economy.summonsLeft).toBe(3);

    economy.paySummon();

    expect(economy.summonsLeft).toBe(2);
    expect(economy.overLimitMult).toBe(1);
  });

  it('сверх лимита каждый призыв дороже предыдущего, и после списка множителей тоже', () => {
    const economy = new Economy({ ...level, startGold: 1000 }, config);
    for (let i = 0; i < 3; i++) economy.paySummon();
    expect(economy.summonsLeft).toBe(0);

    const costs: number[] = [];
    for (let i = 0; i < 5; i++) {
      costs.push(economy.summonCost);
      economy.paySummon();
    }

    expect(costs).toEqual([20, 30, 40, 50, 60]);
    expect(economy.gold).toBe(1000 - 30 - 200);
  });

  it('новая волна обновляет лимит и снимает штраф', () => {
    const economy = new Economy({ ...level, startGold: 1000 }, config);
    for (let i = 0; i < 5; i++) economy.paySummon();
    expect(economy.summonCost).toBe(40);
    expect(economy.overLimitMult).toBe(4);

    economy.startWave();

    expect(economy.summonLimit).toBe(2);
    expect(economy.summonsLeft).toBe(2);
    expect(economy.summonCost).toBe(10);
  });

  it('неистраченные призывы на следующую волну не переходят', () => {
    const economy = new Economy({ ...level, startGold: 1000 }, config);
    economy.startWave();
    economy.startWave();

    expect(economy.summonsLeft).toBe(2);
  });

  it('оплата списывает текущую цену', () => {
    const economy = new Economy(level, config);

    expect(economy.paySummon()).toBe(true);
    expect(economy.gold).toBe(15);
  });

  it('хватает монет ровно на цену — призыв доступен', () => {
    const economy = new Economy({ ...level, startGold: 10 }, config);

    expect(economy.canAffordSummon()).toBe(true);
    expect(economy.paySummon()).toBe(true);
    expect(economy.gold).toBe(0);
  });

  it('без монет оплата не проходит и ничего не меняет', () => {
    const economy = new Economy(level, config);
    economy.paySummon();
    economy.paySummon();
    expect(economy.gold).toBe(5);

    expect(economy.canAffordSummon()).toBe(false);
    expect(economy.paySummon()).toBe(false);
    expect(economy.gold).toBe(5);
    expect(economy.summonsLeft).toBe(1);
  });

  it('призыв снова доступен, когда монеты появились', () => {
    const economy = new Economy({ ...level, startGold: 0 }, config);
    expect(economy.canAffordSummon()).toBe(false);

    economy.gold += 10;

    expect(economy.canAffordSummon()).toBe(true);
  });

  it('оплата призыва не трогает кристаллы и жизни', () => {
    const economy = new Economy(level, config);
    economy.paySummon();

    expect(economy.crystals).toBe(2);
    expect(economy.lives).toBe(10);
  });

  it('награда за врага прибавляет монеты и кристаллы', () => {
    const economy = new Economy(level, config);
    economy.reward(7, 2);

    expect(economy.gold).toBe(32);
    expect(economy.crystals).toBe(4);
  });

  it('прошедший враг отнимает жизни', () => {
    const economy = new Economy(level, config);
    economy.loseLives(2);

    expect(economy.lives).toBe(8);
  });

  it('жизни не уходят ниже нуля', () => {
    const economy = new Economy(level, config);
    economy.loseLives(7);
    economy.loseLives(5);

    expect(economy.lives).toBe(0);
  });
});

describe('Economy: строения', () => {
  it('списывает монеты за строение, если их хватает', () => {
    const economy = new Economy(level, config);

    expect(economy.spend(25)).toBe(true);
    expect(economy.gold).toBe(0);
  });

  it('без монет ничего не списывает', () => {
    const economy = new Economy(level, config);

    expect(economy.spend(26)).toBe(false);
    expect(economy.gold).toBe(25);
  });

  it('алтарь поднимает лимит призывов сразу и на следующих волнах', () => {
    const economy = new Economy({ ...level, startGold: 1000 }, config);
    for (let i = 0; i < 3; i++) economy.paySummon();
    expect(economy.summonCost).toBe(20);

    economy.limitBonus = 1;

    expect(economy.summonLimit).toBe(4);
    expect(economy.summonsLeft).toBe(1);
    expect(economy.summonCost).toBe(10);

    economy.startWave();
    expect(economy.summonLimit).toBe(3);
    expect(economy.summonsLeft).toBe(3);
  });

  it('без алтаря лимит возвращается, а лишние призывы становятся штрафными', () => {
    const economy = new Economy({ ...level, startGold: 1000 }, config);
    economy.limitBonus = 1;
    for (let i = 0; i < 4; i++) economy.paySummon();

    economy.limitBonus = 0;

    // Четыре призыва при лимите три: следующий — уже второй сверх лимита.
    expect(economy.summonsLeft).toBe(0);
    expect(economy.summonCost).toBe(30);
  });
});

describe('Economy: продажа', () => {
  it('возвращает долю вложенного', () => {
    const economy = new Economy(level, config);

    expect(economy.sell(40)).toBe(20);
    expect(economy.gold).toBe(45);
  });

  it('округляет вниз: за кота со скидкой лишнего не вернут', () => {
    const economy = new Economy(level, config);

    expect(economy.sellValue(15)).toBe(7);
    expect(economy.sellValue(0)).toBe(0);
  });

  it('цена продажи известна заранее и ничего не меняет', () => {
    const economy = new Economy(level, config);

    expect(economy.sellValue(30)).toBe(15);
    expect(economy.gold).toBe(25);
  });

  it('продажа не возвращает призыв волны', () => {
    const economy = new Economy(level, config);
    economy.paySummon();
    economy.sell(10);

    expect(economy.summonsLeft).toBe(2);
  });
});

describe('Economy: снаряжение', () => {
  it('кошель и амулет кристаллов добавляют стартовые запасы', () => {
    const economy = new Economy(level, config, { ...noBonuses(), bonusGold: 20, bonusCrystals: 1 });

    expect(economy.gold).toBe(45);
    expect(economy.crystals).toBe(3);
    expect(economy.lives).toBe(10);
  });

  it('скидка мантии действует только на призыв сверх лимита', () => {
    const economy = new Economy({ ...level, startGold: 1000 }, config, { ...noBonuses(), overLimitCostMult: 0.75 });
    const costs: number[] = [];
    for (let i = 0; i < 6; i++) {
      costs.push(economy.summonCost);
      economy.paySummon();
    }

    // Три призыва по обычной цене, затем 20, 30 и 40 со скидкой 25%.
    expect(costs).toEqual([10, 10, 10, 15, 23, 30]);
  });
});

describe('Economy: жизни', () => {
  it('считает потерянные жизни и не уходит ниже нуля', () => {
    const economy = new Economy(level, config);
    economy.loseLives(3);
    expect(economy.lives).toBe(7);
    expect(economy.livesLost).toBe(3);

    economy.loseLives(50);
    expect(economy.lives).toBe(0);
    expect(economy.livesLost).toBe(10);
  });

  it('второй шанс возвращает жизни, но счёт потерь для звёзд не сбрасывает', () => {
    const economy = new Economy(level, config);
    economy.loseLives(10);
    economy.revive(6);
    expect(economy.lives).toBe(6);
    expect(economy.livesLost).toBe(10);

    economy.loseLives(2);
    expect(economy.lives).toBe(4);
    expect(economy.livesLost).toBe(12);
  });
});

describe('starsFor', () => {
  const rules = { threeStarsMaxLost: 0, twoStarsMaxLost: 5 };

  it('без потерь — три звезды', () => {
    expect(starsFor(0, rules)).toBe(3);
  });

  it('небольшие потери — две звезды', () => {
    expect(starsFor(1, rules)).toBe(2);
    expect(starsFor(5, rules)).toBe(2);
  });

  it('большие потери — одна звезда', () => {
    expect(starsFor(6, rules)).toBe(1);
    expect(starsFor(19, rules)).toBe(1);
  });
});

describe('Economy: бонусы снаряжения к призыву', () => {
  const rich = { ...level, startGold: 1000 };

  it('прибавка к лимиту действует и до первой волны, и в каждой волне', () => {
    const economy = new Economy(rich, config, { ...noBonuses(), summonLimitBonus: 1 });
    expect(economy.summonLimit).toBe(4);

    economy.startWave();
    expect(economy.summonLimit).toBe(3);
    economy.limitBonus = 2;
    expect(economy.summonLimit).toBe(5);
  });

  it('каждый пятый призыв за бой бесплатный', () => {
    const economy = new Economy(rich, config, { ...noBonuses(), freeSummonEvery: 5 });
    const costs: number[] = [];
    for (let i = 0; i < 10; i++) {
      costs.push(economy.summonCost);
      economy.paySummon();
      // Новая волна счёт до бесплатного призыва не сбрасывает.
      if (i === 2) economy.startWave();
    }

    expect(costs).toEqual([10, 10, 10, 10, 0, 20, 30, 40, 50, 0]);
    expect(economy.gold).toBe(1000 - 180);
  });

  it('бесплатный призыв доступен и без монет, но тратит призыв волны', () => {
    const economy = new Economy({ ...level, startGold: 10 }, config, { ...noBonuses(), freeSummonEvery: 2 });
    economy.paySummon();
    expect(economy.gold).toBe(0);
    expect(economy.nextSummonFree).toBe(true);
    expect(economy.canAffordSummon()).toBe(true);

    expect(economy.paySummon()).toBe(true);
    expect(economy.summonsLeft).toBe(1);
    expect(economy.nextSummonFree).toBe(false);
  });

  it('без снаряжения бесплатных призывов нет', () => {
    const economy = new Economy(rich, config);
    for (let i = 0; i < 12; i++) {
      expect(economy.nextSummonFree).toBe(false);
      expect(economy.summonCost).toBeGreaterThan(0);
      economy.paySummon();
    }
  });
});
