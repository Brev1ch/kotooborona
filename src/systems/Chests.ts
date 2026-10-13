import type { CatsConfig, GearConfig, Rarity } from '../data/types';
import { rarityChances, rollItem, rollRarity, type Item } from './Items';

/** Что лежит в сундуке: предмет снаряжения и рыбки. */
export interface ChestLoot {
  item: Item | null;
  fish: number;
}

/** Обычный сундук или малый: в малом меньше рыбок и скромнее шансы редкости. */
export type ChestKind = 'big' | 'small';

/**
 * Откуда сундук: `stars` — за сумму звёзд, `big` — за первое прохождение уровня на три звезды,
 * `small` — найден после победы, `ad` — за наградной ролик.
 */
export type ChestSource = 'stars' | 'big' | 'small' | 'ad';

/** Сундуки, которые игрок заработал, но ещё не открыл. */
export interface PendingChests {
  big: number;
  small: number;
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

/** Какой сундук откроется следующим: сначала заработанные обычные, затем сундук за звёзды, затем малые. null — открывать нечего. */
export function nextChest(pending: PendingChests, starsReady: boolean): ChestSource | null {
  if (pending.big > 0) return 'big';
  if (starsReady) return 'stars';
  return pending.small > 0 ? 'small' : null;
}

/** Сколько сундуков ждёт открытия. */
export function chestsWaiting(pending: PendingChests, starsReady: boolean): number {
  return pending.big + pending.small + (starsReady ? 1 : 0);
}

/** Вид сундука по его источнику. */
export function chestKind(source: ChestSource): ChestKind {
  return source === 'small' ? 'small' : 'big';
}

/** Шансы редкости предмета в сундуке этого вида: их же показывает окно сундука. */
export function chestChances(gear: GearConfig, kind: ChestKind): Record<Rarity, number> {
  return kind === 'small' ? gear.chests.small.rarities : rarityChances(gear.items);
}

/** После победы найден малый сундук: один бросок `rng` против шанса из конфига. */
export function smallChestDrops(gear: GearConfig, rng: () => number): boolean {
  return rng() < gear.chests.small.chance;
}

/**
 * Сколько секунд осталось до следующего сундука за рекламу; 0 — можно брать. `lastAt` и `now` — время в миллисекундах,
 * `lastAt` 0 — сундук ещё не брали. Если часы устройства перевели назад, ждать придётся не дольше одной паузы.
 */
export function adChestWait(lastAt: number, now: number, cooldown: number): number {
  if (lastAt <= 0) return 0;
  const left = cooldown - (now - lastAt) / 1000;
  return Math.ceil(Math.max(0, Math.min(cooldown, left)));
}

/**
 * Содержимое сундука: предмет случайной редкости (шансы — `chestChances`) со случайными бонусами и немного рыбок.
 * `id` — id нового предмета в сохранении; `rng` возвращает число в [0, 1), подменяется в тестах.
 */
export function rollChest(gear: GearConfig, cats: CatsConfig, id: string, rng: () => number = Math.random, kind: ChestKind = 'big'): ChestLoot {
  if (kind === 'big') return { item: rollItem(gear.items, cats, rng, id), fish: gear.chests.fish };
  const rarity = rollRarity(gear.items, rng, chestChances(gear, kind));
  return { item: rollItem(gear.items, cats, rng, id, { rarity }), fish: gear.chests.small.fish };
}
