import { describe, expect, it } from 'vitest';
import { cats, gear } from '../data';
import { adChestWait, chestChances, chestKind, chestState, chestsWaiting, nextChest, rollChest, smallChestDrops } from './Chests';
import { RARITIES } from './Items';
import { seededRandom } from './Random';

const thresholds = [2, 5, 9];

describe('chestState', () => {
  it('пока звёзд мало, сундук закрыт и показывает свой порог', () => {
    expect(chestState(0, 0, thresholds)).toEqual({ ready: false, need: 2 });
    expect(chestState(1, 0, thresholds)).toEqual({ ready: false, need: 2 });
  });

  it('набрал порог — сундук можно открыть', () => {
    expect(chestState(2, 0, thresholds)).toEqual({ ready: true, need: 2 });
    expect(chestState(3, 0, thresholds)).toEqual({ ready: true, need: 2 });
  });

  it('после открытия считается порог следующего сундука', () => {
    expect(chestState(3, 1, thresholds)).toEqual({ ready: false, need: 5 });
    expect(chestState(9, 1, thresholds)).toEqual({ ready: true, need: 5 });
    expect(chestState(9, 2, thresholds)).toEqual({ ready: true, need: 9 });
  });

  it('все сундуки открыты — следующего нет', () => {
    expect(chestState(30, 3, thresholds)).toEqual({ ready: false, need: null });
  });
});

describe('rollChest', () => {
  it('в сундуке — предмет с заданным id и рыбки из конфига', () => {
    const loot = rollChest(gear, cats, 'i7', seededRandom(1));

    expect(loot.fish).toBe(gear.chests.fish);
    expect(loot.item).toMatchObject({ id: 'i7', level: 1 });
  });

  it('одно зерно — один и тот же сундук', () => {
    expect(rollChest(gear, cats, 'i1', seededRandom(42))).toEqual(rollChest(gear, cats, 'i1', seededRandom(42)));
  });

  it('предмет собран по правилам своей редкости', () => {
    const rng = seededRandom(3);
    for (let i = 0; i < 200; i++) {
      const { item } = rollChest(gear, cats, `i${i}`, rng);
      expect(item).not.toBeNull();
      if (item) expect(item.bonuses).toHaveLength(gear.items.rarities[item.rarity].bonuses);
    }
  });

  it('редкости выпадают с шансами из конфига', () => {
    const rng = seededRandom(8);
    const total = 5000;
    const counts: Record<string, number> = {};
    for (let i = 0; i < total; i++) {
      const rarity = rollChest(gear, cats, 'i', rng).item?.rarity ?? 'none';
      counts[rarity] = (counts[rarity] ?? 0) + 1;
    }

    for (const rarity of RARITIES) {
      const share = (counts[rarity] ?? 0) / total;
      expect(Math.abs(share - gear.items.rarities[rarity].chance), rarity).toBeLessThan(0.02);
    }
  });
});

describe('малый сундук', () => {
  it('в малом сундуке свои рыбки и предмет по правилам редкости', () => {
    const rng = seededRandom(5);
    for (let i = 0; i < 200; i++) {
      const { item, fish } = rollChest(gear, cats, `i${i}`, rng, 'small');
      expect(fish).toBe(gear.chests.small.fish);
      expect(item?.bonuses).toHaveLength(gear.items.rarities[item?.rarity ?? 'common'].bonuses);
    }
  });

  it('редкости малого сундука выпадают со своими шансами', () => {
    const rng = seededRandom(11);
    const total = 5000;
    const counts: Record<string, number> = {};
    for (let i = 0; i < total; i++) {
      const rarity = rollChest(gear, cats, 'i', rng, 'small').item?.rarity ?? 'none';
      counts[rarity] = (counts[rarity] ?? 0) + 1;
    }

    for (const rarity of RARITIES) {
      expect(Math.abs((counts[rarity] ?? 0) / total - gear.chests.small.rarities[rarity]), rarity).toBeLessThan(0.02);
    }
  });

  it('одно зерно — один и тот же малый сундук', () => {
    expect(rollChest(gear, cats, 'i1', seededRandom(42), 'small')).toEqual(rollChest(gear, cats, 'i1', seededRandom(42), 'small'));
  });

  it.each(['big', 'small'] as const)('шансы редкостей сундука «%s» в сумме дают единицу', (kind) => {
    const chances = chestChances(gear, kind);

    expect(RARITIES.reduce((sum, rarity) => sum + chances[rarity], 0)).toBeCloseTo(1);
  });

  it('малый сундук скромнее обычного: редкое и выше выпадает реже', () => {
    const big = chestChances(gear, 'big');
    const small = chestChances(gear, 'small');

    expect(small.common).toBeGreaterThan(big.common);
    for (const rarity of ['rare', 'epic', 'legendary'] as const) expect(small[rarity], rarity).toBeLessThan(big[rarity]);
    expect(gear.chests.small.fish).toBeLessThan(gear.chests.fish);
  });

  it('выпадает после победы с шансом из конфига', () => {
    const { chance } = gear.chests.small;

    expect(smallChestDrops(gear, () => chance - 0.001)).toBe(true);
    expect(smallChestDrops(gear, () => chance)).toBe(false);
    expect(chance).toBeGreaterThan(0);
    expect(chance).toBeLessThan(1);
  });

  it('малым открывается только сундук, найденный после победы', () => {
    expect(chestKind('small')).toBe('small');
    for (const source of ['stars', 'big', 'ad'] as const) expect(chestKind(source), source).toBe('big');
  });
});

describe('nextChest: очередь сундуков', () => {
  it('открывать нечего', () => {
    expect(nextChest({ big: 0, small: 0 }, false)).toBeNull();
    expect(chestsWaiting({ big: 0, small: 0 }, false)).toBe(0);
  });

  it('сначала сундуки за три звезды, потом за сумму звёзд, потом малые', () => {
    expect(nextChest({ big: 1, small: 2 }, true)).toBe('big');
    expect(nextChest({ big: 0, small: 2 }, true)).toBe('stars');
    expect(nextChest({ big: 0, small: 2 }, false)).toBe('small');
  });

  it('считает все ждущие сундуки', () => {
    expect(chestsWaiting({ big: 2, small: 3 }, true)).toBe(6);
    expect(chestsWaiting({ big: 2, small: 3 }, false)).toBe(5);
  });
});

describe('adChestWait: сундук за рекламу', () => {
  const COOLDOWN = 900;
  const T = 1_700_000_000_000;

  it('первый сундук доступен сразу', () => {
    expect(adChestWait(0, T, COOLDOWN)).toBe(0);
  });

  it('после сундука ждать всю паузу, секунды убывают', () => {
    expect(adChestWait(T, T, COOLDOWN)).toBe(900);
    expect(adChestWait(T, T + 60_000, COOLDOWN)).toBe(840);
    expect(adChestWait(T, T + 899_500, COOLDOWN)).toBe(1);
  });

  it('пауза прошла — сундук доступен', () => {
    expect(adChestWait(T, T + 900_000, COOLDOWN)).toBe(0);
    expect(adChestWait(T, T + 5_000_000, COOLDOWN)).toBe(0);
  });

  it('часы перевели назад — ждать не дольше одной паузы', () => {
    expect(adChestWait(T, T - 86_400_000, COOLDOWN)).toBe(900);
  });

  it('пауза в конфиге — 15 минут', async () => {
    const { ads } = await import('../data');

    expect(ads.chest.cooldown).toBe(900);
  });
});
