import type { BuildingKind } from '../data/types';
import type { Cat } from './Cat';

/** Строение: занимает клетку, не атакует и не сливается. */
export interface Building {
  kind: BuildingKind;
  /** 1 — только построено; каждое улучшение прибавляет уровень. */
  level: number;
  /** Монеты, заплаченные за постройку и улучшения: от них считается цена продажи. */
  invested: number;
  /** Сколько волн началось с последней выдачи: для строений, которые платят не каждую волну. */
  waves: number;
}

/** То, что стоит в клетке поля. */
export type Piece = Cat | Building;

export function isCat(piece: Piece | null): piece is Cat {
  return piece !== null && 'element' in piece;
}

export function isBuilding(piece: Piece | null): piece is Building {
  return piece !== null && 'kind' in piece;
}
