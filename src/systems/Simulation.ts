import type { CatsConfig, EnemiesConfig, GearConfig, LevelConfig, LevelsConfig, Point } from '../data/types';
import type { Cat } from '../entities/Cat';
import type { Enemy } from '../entities/Enemy';
import { catRange, Combat, type CombatEvent } from './Combat';
import { Economy, starsFor } from './Economy';
import { gearBonuses, type GearBonuses } from './Loadout';
import { Merge } from './Merge';
import { Meteor } from './Meteor';
import { buildPath, positionAt, type Path } from './Path';
import { Summon } from './Summon';
import { Waves } from './Waves';

/** Конфиги игры, нужные бою. */
export interface BattleConfigs {
  cats: CatsConfig;
  enemies: EnemiesConfig;
  gear: GearConfig;
  levels: LevelsConfig;
  /** Размер игрового поля: врагов за его краем коты не видят. */
  board: { width: number; height: number };
}

/** Итог прогона уровня. */
export interface SimResult {
  won: boolean;
  /** 0 при поражении. */
  stars: number;
  livesLost: number;
  /** Последняя начавшаяся волна. */
  wave: number;
  /** Длительность боя, секунды. */
  time: number;
  summons: number;
  merges: number;
  hybrids: number;
  meteors: number;
  /** Самый высокий уровень кота за бой. */
  topCatLevel: number;
}

/** Дольше уровень идти не может: если бой не кончился, считаем его проигранным. */
const TIME_LIMIT = 1200;

/**
 * Бой без отрисовки: те же системы, что в GameScene, и те же действия игрока — призыв, перетаскивание, метеор.
 * Отличие одно: метеор бьёт сразу, без трёх десятых секунды полёта.
 */
export class Simulation {
  readonly economy: Economy;
  readonly board: (Cat | null)[];
  readonly meteor: Meteor;
  readonly waves: Waves;
  readonly combat: Combat;
  readonly path: Path;
  /** Центры клеток, индексы совпадают с полем. */
  readonly slots: Point[];
  time = 0;
  private readonly merger: Merge;
  private readonly summoner: Summon;
  private outcome: boolean | null = null;
  private counts = { summons: 0, merges: 0, hybrids: 0, meteors: 0, topCatLevel: 0 };

  /** `rng` возвращает число в [0, 1); `bonuses` — снаряжение игрока, по умолчанию стартовое первого уровня. */
  constructor(
    readonly level: LevelConfig,
    private readonly configs: BattleConfigs,
    rng: () => number = Math.random,
    bonuses: GearBonuses = gearBonuses(configs.gear, configs.gear.defaults),
  ) {
    const { cats, enemies, gear, levels, board } = configs;
    const half = levels.slotSize / 2;
    this.slots = level.slots.map(([x, y]) => [x + half, y + half]);
    this.path = buildPath(level.path);
    this.economy = new Economy(level, gear.summon, bonuses);
    this.summoner = new Summon(cats, bonuses.summonWeights, rng);
    this.meteor = new Meteor(gear.meteor, bonuses.meteorCooldownMult);
    this.merger = new Merge(cats, {
      maxCatLevel: level.maxCatLevel,
      ritualTime: gear.ritual.time * bonuses.ritualTimeMult,
      crystalCost: gear.ritual.crystalCost,
    });
    this.waves = new Waves(levels.waves, level, enemies, rng);
    this.combat = new Combat({ cats, enemies, path: this.path, slots: this.slots, bounds: board, rng });
    this.board = level.slots.map(() => null);
  }

  get finished(): boolean {
    return this.outcome !== null;
  }

  get bounds(): { width: number; height: number } {
    return this.configs.board;
  }

  get meteorRadius(): number {
    return this.configs.gear.meteor.radius;
  }

  /** Продвигает бой на `dt` секунд. */
  step(dt: number): void {
    if (this.finished) return;
    this.time += dt;
    this.meteor.update(dt);
    for (const cat of this.board) {
      if (cat) this.merger.advanceRitual(cat, dt);
    }
    for (const enemy of this.waves.update(dt, this.combat.enemies.length === 0)) this.combat.add(enemy);
    this.apply(this.combat.update(dt, this.board));

    if (this.economy.lives <= 0 || this.time >= TIME_LIMIT) this.outcome = false;
    else if (this.waves.finished && this.combat.enemies.length === 0) this.outcome = true;
  }

  /** Призыв кота в случайную свободную клетку. Возвращает false, если не хватило монет или места. */
  summon(): boolean {
    if (this.finished || !this.economy.canAffordSummon()) return false;
    const result = this.summoner.summon(this.board);
    if (!result) return false;
    this.economy.paySummon();
    this.board[result.slot] = result.cat;
    this.counts.summons++;
    this.counts.topCatLevel = Math.max(this.counts.topCatLevel, result.cat.level);
    return true;
  }

  /** Кто получится, если перетащить кота из клетки `from` в клетку `to`; null — коты не сольются. */
  mergeResult(from: number, to: number): { cat: Cat; crystalCost: number } | null {
    const result = this.merger.drop(this.board, from, to, this.economy.crystals);
    return result.kind === 'merge' ? { cat: result.cat, crystalCost: result.crystalCost } : null;
  }

  /** Перетаскивание кота из клетки в клетку: слияние, переезд или обмен. Возвращает false, если ничего не произошло. */
  drop(from: number, to: number): boolean {
    if (this.finished) return false;
    const result = this.merger.drop(this.board, from, to, this.economy.crystals);
    switch (result.kind) {
      case 'move':
        this.board[to] = this.board[from];
        this.board[from] = null;
        return true;
      case 'swap':
        [this.board[from], this.board[to]] = [this.board[to], this.board[from]];
        return true;
      case 'merge':
        this.economy.crystals -= result.crystalCost;
        this.board[to] = result.cat;
        this.board[from] = null;
        this.counts.merges++;
        if (result.crystalCost > 0) this.counts.hybrids++;
        this.counts.topCatLevel = Math.max(this.counts.topCatLevel, result.cat.level);
        return true;
      default:
        return false;
    }
  }

  /** Удар метеора в точку поля. Возвращает false, если умение не готово. */
  castMeteor(x: number, y: number): boolean {
    if (this.finished) return false;
    const blast = this.meteor.cast(this.waves.wave, this.level.hpMult);
    if (!blast) return false;
    this.counts.meteors++;
    this.apply(this.combat.strike(x, y, blast));
    return true;
  }

  /** Дальность атаки кота. */
  range(cat: Cat): number {
    return catRange(this.configs.cats, cat);
  }

  /** Где сейчас враг на поле. */
  position(enemy: Enemy): Point {
    return positionAt(this.path, enemy.distance);
  }

  result(): SimResult {
    const won = this.outcome === true;
    const { livesLost } = this.economy;
    return {
      won,
      stars: won ? starsFor(livesLost, this.configs.levels.stars) : 0,
      livesLost,
      wave: this.waves.wave,
      time: this.time,
      ...this.counts,
    };
  }

  private apply(events: CombatEvent[]): void {
    for (const event of events) {
      if (event.kind === 'leaked') this.economy.loseLives(event.lifeDamage);
      else if (event.kind === 'killed') this.economy.reward(event.gold, event.crystals);
    }
  }
}
