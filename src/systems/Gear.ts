import type { GearConfig, GearItem, GearSlot } from '../data/types';

export const GEAR_SLOTS: readonly GearSlot[] = ['staff', 'mantle', 'amulet'];

/** Предмет в сохранении: слот и id вместе, потому что id уникален только внутри слота. */
export function gearKey(slot: GearSlot, id: string): string {
  return `${slot}:${id}`;
}

export function findGear(config: GearConfig, slot: GearSlot, id: string): GearItem | undefined {
  return config[slot].find((item) => item.id === id);
}

/** Наибольший уровень предмета; 1 — предмет не прокачивается. */
export function maxGearLevel(item: GearItem): number {
  return 1 + (item.upgrades?.length ?? 0);
}

/** Предмет с бонусами своего уровня. Уровень вне диапазона прижимается к ближайшему допустимому. */
export function gearAtLevel(item: GearItem, level: number): GearItem {
  const clamped = Math.max(1, Math.min(maxGearLevel(item), Math.floor(level)));
  return clamped === 1 ? item : { ...item, ...item.upgrades?.[clamped - 2] };
}
