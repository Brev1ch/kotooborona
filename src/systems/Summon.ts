import type { CatsConfig, ElementId, GearItem } from '../data/types';
import type { Cat } from '../entities/Cat';

export interface SummonResult {
  slot: number;
  cat: Cat;
}

/** Призыв кота: выбор стихии и свободной клетки. */
export class Summon {
  private readonly elements: ElementId[];
  private readonly weights: number[];

  /** `rng` возвращает число в [0, 1); подменяется в тестах. */
  constructor(
    cats: CatsConfig,
    staff: GearItem | undefined,
    private readonly rng: () => number = Math.random,
  ) {
    // Базовые стихии — те, что не получаются смешением.
    this.elements = (Object.keys(cats.elements) as ElementId[]).filter((id) => !cats.elements[id].from);
    this.weights = this.elements.map((id) => (id === staff?.element ? (staff.summonWeight ?? 1) : 1));
  }

  rollElement(): ElementId {
    const total = this.weights.reduce((sum, w) => sum + w, 0);
    let roll = this.rng() * total;
    for (let i = 0; i < this.elements.length; i++) {
      roll -= this.weights[i];
      if (roll < 0) return this.elements[i];
    }
    return this.elements[this.elements.length - 1];
  }

  /** Индекс случайной свободной клетки или null, если поле занято. */
  pickFreeSlot(board: readonly (Cat | null)[]): number | null {
    const free: number[] = [];
    board.forEach((cat, slot) => {
      if (!cat) free.push(slot);
    });
    if (free.length === 0) return null;
    return free[Math.min(Math.floor(this.rng() * free.length), free.length - 1)];
  }

  /** Кот 1-го уровня для случайной свободной клетки; поле не меняет. */
  summon(board: readonly (Cat | null)[]): SummonResult | null {
    const slot = this.pickFreeSlot(board);
    if (slot === null) return null;
    return { slot, cat: { element: this.rollElement(), level: 1, cooldown: 0, ritual: 0 } };
  }
}
