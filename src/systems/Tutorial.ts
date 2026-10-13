import type { Point, TutorialRules, TutorialStep } from '../data/types';
import { isCat, type Piece } from '../entities/Building';
import type { Merge } from './Merge';

/** Что обучению нужно знать о бое. */
export interface TutorialState {
  /** Бой окончен: подсказки не нужны. */
  finished: boolean;
  /** Сколько раз игрок уже призвал кота, слил одинаковых, смешал стихии и ударил метеором в этом бою. */
  summons: number;
  merges: number;
  hybrids: number;
  meteors: number;
  canSummon: boolean;
  /** Клетки двух одинаковых котов, которых можно слить прямо сейчас; null — такой пары нет. */
  mergePair: [number, number] | null;
  /** Клетки двух котов разных стихий, из которых получится гибрид, если на него хватает кристаллов. */
  hybridPair: [number, number] | null;
  meteorReady: boolean;
  /** Игрок нажал «Метеор» и выбирает точку. */
  aiming: boolean;
  /** Сколько врагов на поле и где их больше всего. */
  enemies: number;
  cluster: Point | null;
}

/** Подсказка: что сказать и куда показать. */
export type TutorialHint =
  | { step: 'summon'; target: 'summonButton' }
  | { step: 'merge' | 'hybrid'; from: number; to: number }
  | { step: 'meteor'; target: 'meteorButton' }
  /** Игрок уже целится: показываем, куда бить. */
  | { step: 'meteorAim'; point: Point | null };

/** Шаг обучения, который сейчас уместно подсказать; null — подсказывать нечего. */
function applicable(steps: readonly TutorialStep[], rules: TutorialRules, state: TutorialState): TutorialHint | null {
  if (state.finished) return null;
  for (const step of steps) {
    switch (step) {
      case 'summon':
        if (state.summons < rules.summons && state.canSummon) return { step, target: 'summonButton' };
        break;
      case 'merge':
        if (state.merges === 0 && state.mergePair) return { step, from: state.mergePair[0], to: state.mergePair[1] };
        break;
      case 'hybrid':
        if (state.hybrids === 0 && state.hybridPair) return { step, from: state.hybridPair[0], to: state.hybridPair[1] };
        break;
      case 'meteor':
        if (state.meteors > 0) break;
        if (state.aiming) return { step: 'meteorAim', point: state.cluster };
        if (state.meteorReady && state.enemies >= rules.meteorEnemies) return { step, target: 'meteorButton' };
        break;
    }
  }
  return null;
}

/**
 * Обучение на уровне: подсказывает шаги по порядку и каждый — только пока игрок его не сделал.
 * Подсказка появляется не сразу, а когда повод держится `rules.delay` секунд:
 * тому, кто и так действует, она на глаза не попадается.
 */
export class Tutorial {
  private pending: string | null = null;
  private waited = 0;

  constructor(
    private readonly steps: readonly TutorialStep[],
    private readonly rules: TutorialRules,
  ) {}

  /** Продвигает время на `dt` секунд и возвращает подсказку, которую пора показать, или null. */
  update(dt: number, state: TutorialState): TutorialHint | null {
    const hint = applicable(this.steps, this.rules, state);
    if (!hint) {
      this.pending = null;
      return null;
    }
    // Прицеливание продолжает подсказку про метеор: второй раз задержки нет.
    const key = hint.step === 'meteorAim' ? 'meteor' : hint.step;
    if (key !== this.pending) {
      this.pending = key;
      this.waited = 0;
    } else {
      this.waited += dt;
    }
    return this.waited >= this.rules.delay ? hint : null;
  }
}

/**
 * Первая пара котов, которую можно слить: при `hybrid` — разных стихий за кристаллы, иначе одинаковых.
 * Возвращает клетки «откуда» и «куда».
 */
export function findMergePair(
  board: readonly (Piece | null)[],
  merger: Merge,
  crystals: number,
  hybrid: boolean,
): [number, number] | null {
  for (let from = 0; from < board.length; from++) {
    const dragged = board[from];
    if (!isCat(dragged)) continue;
    for (let to = from + 1; to < board.length; to++) {
      const target = board[to];
      if (!isCat(target)) continue;
      const check = merger.check(dragged, target, crystals);
      if (check.kind === 'merge' && check.crystalCost > 0 === hybrid) return [from, to];
    }
  }
  return null;
}

/** Точка из списка, вокруг которой в радиусе больше всего других; null для пустого списка. */
export function densestPoint(points: readonly Point[], radius: number): Point | null {
  let best: Point | null = null;
  let bestCount = 0;
  for (const point of points) {
    const count = points.filter(([x, y]) => Math.hypot(x - point[0], y - point[1]) <= radius).length;
    if (count > bestCount) {
      bestCount = count;
      best = point;
    }
  }
  return best;
}
