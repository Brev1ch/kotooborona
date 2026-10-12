import type { ElementId } from '../data/types';
import type { Cat } from '../entities/Cat';

export interface MergeRules {
  maxCatLevel: number;
}

/** Почему подходящую пару сейчас слить нельзя. */
export type MergeBlock = 'maxLevel';

export type MergeCheck =
  | { kind: 'none' }
  | { kind: 'merge'; cat: Cat }
  | { kind: 'blocked'; element: ElementId; reason: MergeBlock };

/** Что произойдёт, если отпустить кота над клеткой. */
export type DropResult =
  | { kind: 'stay' }
  | { kind: 'move' }
  | { kind: 'swap' }
  | Exclude<MergeCheck, { kind: 'none' }>;

/** Слияние одинаковых котов и ритуал смешения стихий. */
export class Merge {
  constructor(private readonly rules: MergeRules) {}

  /** Можно ли слить пару и какой кот получится; самих котов не меняет. */
  check(a: Cat, b: Cat): MergeCheck {
    if (a.level !== b.level) return { kind: 'none' };
    const element = this.resultElement(a, b);
    if (!element) return { kind: 'none' };
    if (a.level >= this.rules.maxCatLevel) return { kind: 'blocked', element, reason: 'maxLevel' };
    return { kind: 'merge', cat: { element, level: a.level + 1, cooldown: 0, ritual: 0 } };
  }

  /** Исход перетаскивания кота из клетки `from` в клетку `to` (null — мимо клеток); поле не меняет. */
  drop(board: readonly (Cat | null)[], from: number, to: number | null): DropResult {
    const dragged = board[from];
    if (!dragged || to === null || to === from) return { kind: 'stay' };

    const target = board[to];
    if (!target) return { kind: 'move' };

    const check = this.check(dragged, target);
    return check.kind === 'none' ? { kind: 'swap' } : check;
  }

  /** Стихия кота, который получится из пары одного уровня, или null, если пара не сливается. */
  private resultElement(a: Cat, b: Cat): ElementId | null {
    return a.element === b.element ? a.element : null;
  }
}
