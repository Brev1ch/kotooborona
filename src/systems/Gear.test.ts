import { describe, expect, it } from 'vitest';
import type { GearConfig, GearItem } from '../data/types';
import { findGear, gearAtLevel, gearKey, maxGearLevel } from './Gear';

const purse: GearItem = { id: 'purse', bonusGold: 20, upgrades: [{ bonusGold: 30 }, { bonusGold: 40 }] };
const plain: GearItem = { id: 'none' };
const staff: GearItem = { id: 'fire', element: 'fire', summonWeight: 1.5, upgrades: [{ summonWeight: 2 }] };
const config = { staff: [plain, staff], mantle: [], amulet: [purse] } as unknown as GearConfig;

describe('gearKey и findGear', () => {
  it('ключ предмета — слот и id', () => {
    expect(gearKey('staff', 'fire')).toBe('staff:fire');
  });

  it('предмет ищется только в своём слоте', () => {
    expect(findGear(config, 'amulet', 'purse')).toBe(purse);
    expect(findGear(config, 'staff', 'purse')).toBeUndefined();
  });
});

describe('maxGearLevel', () => {
  it('на единицу больше числа улучшений', () => {
    expect(maxGearLevel(purse)).toBe(3);
    expect(maxGearLevel(staff)).toBe(2);
  });

  it('предмет без улучшений остаётся на первом уровне', () => {
    expect(maxGearLevel(plain)).toBe(1);
  });
});

describe('gearAtLevel', () => {
  it('на первом уровне — бонусы самого предмета', () => {
    expect(gearAtLevel(purse, 1)).toBe(purse);
  });

  it('на следующих уровнях бонусы берутся из улучшений, остальное не меняется', () => {
    expect(gearAtLevel(purse, 2).bonusGold).toBe(30);
    expect(gearAtLevel(purse, 3).bonusGold).toBe(40);
    expect(gearAtLevel(staff, 2)).toMatchObject({ id: 'fire', element: 'fire', summonWeight: 2 });
  });

  it('уровень вне диапазона прижимается к допустимому', () => {
    expect(gearAtLevel(purse, 0).bonusGold).toBe(20);
    expect(gearAtLevel(purse, 99).bonusGold).toBe(40);
    expect(gearAtLevel(plain, 5)).toBe(plain);
  });
});
