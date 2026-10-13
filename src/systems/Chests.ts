import type { GearConfig, GearSlot } from '../data/types';
import { GEAR_SLOTS } from './Gear';

/** Что лежит в сундуке: предмет снаряжения (если ещё есть несобранные) и рыбки. */
export interface ChestLoot {
  item: { slot: GearSlot; id: string } | null;
  fish: number;
}

/** Состояние сундуков игрока. */
export interface ChestState {
  /** Звёзд хватает на следующий сундук: его можно открыть. */
  ready: boolean;
  /** Сколько всего звёзд нужно для следующего сундука; null — все сундуки открыты. */
  need: number | null;
}

/** Сундуки открываются по порядку: очередной — когда всего звёзд набралось не меньше его порога. */
export function chestState(totalStars: number, opened: number, thresholds: readonly number[]): ChestState {
  const need = thresholds[opened] ?? null;
  return { ready: need !== null && totalStars >= need, need };
}

/**
 * Содержимое сундука: случайный предмет из тех, которых у игрока ещё нет, и немного рыбок.
 * Когда собрано всё — только рыбки, но больше. `rng` возвращает число в [0, 1); подменяется в тестах.
 */
export function rollChest(
  gear: GearConfig,
  owns: (slot: GearSlot, id: string) => boolean,
  rng: () => number = Math.random,
): ChestLoot {
  const missing = GEAR_SLOTS.flatMap((slot) =>
    gear[slot].filter((item) => !owns(slot, item.id)).map((item) => ({ slot, id: item.id })),
  );
  if (missing.length === 0) return { item: null, fish: gear.chests.fishInstead };
  const item = missing[Math.min(Math.floor(rng() * missing.length), missing.length - 1)];
  return { item, fish: gear.chests.fish };
}
