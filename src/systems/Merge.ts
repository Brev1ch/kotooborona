import type { CatsConfig, ElementId } from '../data/types';
import { isCat, type Piece } from '../entities/Building';
import type { Cat } from '../entities/Cat';

export interface MergeRules {
  maxCatLevel: number;
  /** Длительность ритуала смешения, секунды. */
  ritualTime: number;
  /** Сколько кристаллов стоит гибрид. */
  crystalCost: number;
}

/** Почему подходящую пару сейчас слить нельзя. */
export type MergeBlock = 'maxLevel' | 'noCrystal';

export type MergeCheck =
  | { kind: 'none' }
  /** `crystalCost` больше нуля только при смешении стихий. */
  | { kind: 'merge'; cat: Cat; crystalCost: number }
  | { kind: 'blocked'; element: ElementId; reason: MergeBlock };

/** Что произойдёт, если отпустить кота над клеткой. */
export type DropResult =
  | { kind: 'stay' }
  | { kind: 'move' }
  | { kind: 'swap' }
  /** Кот в клетке проводит ритуал: его нельзя ни слить, ни сдвинуть. */
  | { kind: 'busy' }
  | Exclude<MergeCheck, { kind: 'none' }>;

/** Слияние одинаковых котов и ритуал смешения стихий. */
export class Merge {
  /** Гибрид по паре базовых стихий. */
  private readonly recipes = new Map<string, ElementId>();

  constructor(
    private readonly cats: CatsConfig,
    private readonly rules: MergeRules,
  ) {
    for (const id of Object.keys(cats.elements) as ElementId[]) {
      const from = cats.elements[id].from;
      if (from) this.recipes.set(recipeKey(from[0], from[1]), id);
    }
  }

  /** Полная длительность ритуала, секунды. */
  get ritualTime(): number {
    return this.rules.ritualTime;
  }

  isHybrid(element: ElementId): boolean {
    return !!this.cats.elements[element].from;
  }

  /** Можно ли слить пару и какой кот получится; самих котов не меняет. */
  check(a: Cat, b: Cat, crystals: number): MergeCheck {
    if (a.ritual > 0 || b.ritual > 0) return { kind: 'none' };
    if (a.level !== b.level) return { kind: 'none' };
    const element = this.resultElement(a, b);
    if (!element) return { kind: 'none' };
    if (a.level >= this.rules.maxCatLevel) return { kind: 'blocked', element, reason: 'maxLevel' };

    const mixed = a.element !== b.element;
    const crystalCost = mixed ? this.rules.crystalCost : 0;
    if (crystals < crystalCost) return { kind: 'blocked', element, reason: 'noCrystal' };

    const ritual = mixed ? this.rules.ritualTime : 0;
    const invested = a.invested + b.invested;
    return { kind: 'merge', cat: { element, level: a.level + 1, cooldown: 0, ritual, invested }, crystalCost };
  }

  /** Исход перетаскивания кота или строения из клетки `from` в клетку `to` (null — мимо клеток); поле не меняет. */
  drop(board: readonly (Piece | null)[], from: number, to: number | null, crystals: number): DropResult {
    const dragged = board[from];
    if (!dragged || inRitual(dragged) || to === null || to === from) return { kind: 'stay' };

    const target = board[to];
    if (!target) return { kind: 'move' };
    if (inRitual(target)) return { kind: 'busy' };
    // Строение ни с кем не сливается: оно просто меняется местами.
    if (!isCat(dragged) || !isCat(target)) return { kind: 'swap' };

    const check = this.check(dragged, target, crystals);
    return check.kind === 'none' ? { kind: 'swap' } : check;
  }

  /** Продвигает ритуал кота на `dt` секунд. Возвращает true в тот момент, когда ритуал завершился. */
  advanceRitual(cat: Cat, dt: number): boolean {
    if (cat.ritual <= 0) return false;
    cat.ritual = Math.max(0, cat.ritual - dt);
    return cat.ritual === 0;
  }

  /** Стихия кота, который получится из пары одного уровня, или null, если пара не сливается. */
  private resultElement(a: Cat, b: Cat): ElementId | null {
    if (a.element === b.element) return a.element;
    // Гибриды смешиваются только с такими же гибридами: в рецептах есть лишь пары базовых стихий.
    return this.recipes.get(recipeKey(a.element, b.element)) ?? null;
  }
}

function inRitual(piece: Piece): boolean {
  return isCat(piece) && piece.ritual > 0;
}

function recipeKey(a: ElementId, b: ElementId): string {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}
