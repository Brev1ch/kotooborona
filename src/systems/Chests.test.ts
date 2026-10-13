import { describe, expect, it } from 'vitest';
import type { GearConfig, GearSlot } from '../data/types';
import { chestState, rollChest } from './Chests';

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
  const gear = {
    chests: { stars: thresholds, fish: 15, fishInstead: 60 },
    staff: [{ id: 'none' }, { id: 'fire' }, { id: 'water' }],
    mantle: [{ id: 'thrift' }, { id: 'sorc' }],
    amulet: [{ id: 'cry' }],
  } as unknown as GearConfig;
  const ownsOnly =
    (...keys: string[]) =>
    (slot: GearSlot, id: string): boolean =>
      keys.includes(`${slot}:${id}`);
  const starter = ownsOnly('staff:none', 'mantle:thrift', 'amulet:cry');

  it('даёт предмет, которого у игрока нет, и рыбки', () => {
    // Не хватает: staff:fire, staff:water, mantle:sorc — в порядке слотов.
    expect(rollChest(gear, starter, () => 0)).toEqual({ item: { slot: 'staff', id: 'fire' }, fish: 15 });
    expect(rollChest(gear, starter, () => 0.5)).toEqual({ item: { slot: 'staff', id: 'water' }, fish: 15 });
    expect(rollChest(gear, starter, () => 0.99)).toEqual({ item: { slot: 'mantle', id: 'sorc' }, fish: 15 });
  });

  it('уже собранные предметы не выпадают', () => {
    const owns = ownsOnly('staff:none', 'staff:fire', 'staff:water', 'mantle:thrift', 'amulet:cry');
    for (const roll of [0, 0.3, 0.7, 0.999]) {
      expect(rollChest(gear, owns, () => roll).item).toEqual({ slot: 'mantle', id: 'sorc' });
    }
  });

  it('когда собрано всё, в сундуке только рыбки, но больше', () => {
    expect(rollChest(gear, () => true, () => 0.4)).toEqual({ item: null, fish: 60 });
  });

  it('бросок на самой границе не выходит за список', () => {
    expect(rollChest(gear, starter, () => 1).item).toEqual({ slot: 'mantle', id: 'sorc' });
  });
});
