import type { BuildingKind, BuildingLevel, EconomyConfig } from '../data/types';
import { isBuilding, type Building, type Piece } from '../entities/Building';

type Board = readonly (Piece | null)[];

/** Почему строение сейчас нельзя поставить. */
export type BuildBlock = 'unavailable' | 'limit' | 'noRoom';

/** Что строения принесли в начале волны. */
export interface BuildingIncome {
  gold: number;
  crystals: number;
  /** Клетки строений, которые что-то выдали: для всплывающих наград. */
  slots: { slot: number; gold: number; crystals: number }[];
}

/** Правила строений: что можно ставить на уровне, цены, улучшения и доход. Монеты списывает Economy. */
export class Buildings {
  /** `available` — виды строений, открытые на уровне; пустой список — строить нельзя. `goldMult` — множитель монетного дохода от снаряжения. */
  constructor(
    private readonly config: EconomyConfig['buildings'],
    readonly available: readonly BuildingKind[] = [],
    private readonly goldMult = 1,
  ) {}

  /** Сколько монет строение приносит за выдачу с учётом снаряжения. */
  gold(kind: BuildingKind, level: number): number {
    return Math.round((this.stats(kind, level).gold ?? 0) * this.goldMult);
  }

  /** Сколько строений этого вида уже стоит. */
  count(board: Board, kind: BuildingKind): number {
    return board.filter((piece) => isBuilding(piece) && piece.kind === kind).length;
  }

  /** Сколько строений этого вида можно поставить за уровень. */
  max(kind: BuildingKind): number {
    return this.config.maxOf?.[kind] ?? this.config.maxPerKind;
  }

  /** Что мешает поставить строение, не считая монет; null — ничего. */
  blocked(board: Board, kind: BuildingKind): BuildBlock | null {
    if (!this.available.includes(kind)) return 'unavailable';
    if (this.count(board, kind) >= this.max(kind)) return 'limit';
    if (!board.includes(null)) return 'noRoom';
    return null;
  }

  /** Цена постройки. */
  cost(kind: BuildingKind): number {
    return this.config.kinds[kind][0].cost;
  }

  /** Числа строения на уровне `level` (с единицы). */
  stats(kind: BuildingKind, level: number): BuildingLevel {
    const levels = this.config.kinds[kind];
    return levels[Math.min(level, levels.length) - 1];
  }

  /** Числа строения так, как их видит игрок: монетный доход — уже с учётом снаряжения. */
  shownStats(kind: BuildingKind, level: number): BuildingLevel {
    const stats = this.stats(kind, level);
    return stats.gold === undefined ? stats : { ...stats, gold: this.gold(kind, level) };
  }

  /** Цена следующего улучшения; null — строение уже на последнем уровне. */
  upgradeCost(building: Building): number | null {
    return this.config.kinds[building.kind][building.level]?.cost ?? null;
  }

  /** Новое строение первого уровня. */
  create(kind: BuildingKind): Building {
    return { kind, level: 1, invested: this.cost(kind), waves: 0 };
  }

  /** То же строение уровнем выше; null — улучшать некуда. Счёт волн до выдачи сохраняется. */
  upgraded(building: Building): Building | null {
    const cost = this.upgradeCost(building);
    if (cost === null) return null;
    return { ...building, level: building.level + 1, invested: building.invested + cost };
  }

  /** На сколько строения на поле поднимают лимит призывов волны. */
  summonLimitBonus(board: Board): number {
    return board.reduce((sum, piece) => sum + (isBuilding(piece) ? (this.stats(piece.kind, piece.level).summonLimit ?? 0) : 0), 0);
  }

  /** Началась волна: строения считают её и выдают доход. Счётчики волн в строениях меняются на месте. */
  startWave(board: Board): BuildingIncome {
    const income: BuildingIncome = { gold: 0, crystals: 0, slots: [] };
    board.forEach((piece, slot) => {
      if (!isBuilding(piece)) return;
      const { crystals = 0, everyWaves = 1 } = this.stats(piece.kind, piece.level);
      const gold = this.gold(piece.kind, piece.level);
      if (gold === 0 && crystals === 0) return;
      piece.waves++;
      if (piece.waves < everyWaves) return;
      piece.waves = 0;
      income.gold += gold;
      income.crystals += crystals;
      income.slots.push({ slot, gold, crystals });
    });
    return income;
  }
}
