import type { CatsConfig, GearConfig } from '../data/types';
import { rollItem, type Item } from './Items';

/** Что лежит в сундуке: предмет снаряжения и рыбки. */
export interface ChestLoot {
  item: Item | null;
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
 * Содержимое сундука: предмет случайной редкости (шансы — в `gear.json` → `items.rarities`) со случайными бонусами и немного рыбок.
 * `id` — id нового предмета в сохранении; `rng` возвращает число в [0, 1), подменяется в тестах.
 */
export function rollChest(gear: GearConfig, cats: CatsConfig, id: string, rng: () => number = Math.random): ChestLoot {
  return { item: rollItem(gear.items, cats, rng, id), fish: gear.chests.fish };
}
