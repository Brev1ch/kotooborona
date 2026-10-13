import type { CatsConfig, ElementId } from '../data/types';
import type { Piece } from '../entities/Building';
import type { Cat } from '../entities/Cat';

export interface SummonResult {
  slot: number;
  cat: Cat;
}

/** Призыв кота: выбор стихии и свободной клетки. */
export class Summon {
  private readonly elements: ElementId[];
  private readonly weights: number[];

  /**
   * `summonWeights` — веса стихий от снаряжения, у остальных вес 1.
   * `rng` возвращает число в [0, 1); подменяется в тестах.
   * `level2Chance` — шанс от снаряжения, что кот придёт сразу 2-го уровня; без него лишний бросок не делается.
   */
  constructor(
    cats: CatsConfig,
    summonWeights: Partial<Record<ElementId, number>> = {},
    private readonly rng: () => number = Math.random,
    private readonly level2Chance = 0,
  ) {
    // Базовые стихии — те, что не получаются смешением.
    this.elements = (Object.keys(cats.elements) as ElementId[]).filter((id) => !cats.elements[id].from);
    this.weights = this.elements.map((id) => summonWeights[id] ?? 1);
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
  pickFreeSlot(board: readonly (Piece | null)[]): number | null {
    const free: number[] = [];
    board.forEach((piece, slot) => {
      if (!piece) free.push(slot);
    });
    if (free.length === 0) return null;
    return free[Math.min(Math.floor(this.rng() * free.length), free.length - 1)];
  }

  /** Кот 1-го (со снаряжением иногда 2-го) уровня для случайной свободной клетки; поле не меняет. `price` — сколько за него заплачено. */
  summon(board: readonly (Piece | null)[], price: number): SummonResult | null {
    const slot = this.pickFreeSlot(board);
    if (slot === null) return null;
    const element = this.rollElement();
    const level = this.level2Chance > 0 && this.rng() < this.level2Chance ? 2 : 1;
    return { slot, cat: { element, level, cooldown: 0, ritual: 0, invested: price } };
  }
}
