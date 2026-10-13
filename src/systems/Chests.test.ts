import { describe, expect, it } from 'vitest';
import { cats, gear } from '../data';
import { chestState, rollChest } from './Chests';
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
