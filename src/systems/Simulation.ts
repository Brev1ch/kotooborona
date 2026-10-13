import type { BuildingKind, CatsConfig, EconomyConfig, EnemiesConfig, GearConfig, LevelConfig, LevelsConfig, Point } from '../data/types';
import { isBuilding, isCat, type Piece } from '../entities/Building';
import type { Cat } from '../entities/Cat';
import type { Enemy } from '../entities/Enemy';
import { Buildings } from './Buildings';
import { catRange, Combat, type CombatEvent } from './Combat';
import { Economy, starsFor } from './Economy';
import { noBonuses, type GearBonuses } from './Loadout';
import { Merge } from './Merge';
import { Meteor } from './Meteor';
import { buildPath, positionAt, type Path } from './Path';
import { Summon } from './Summon';
import { Waves } from './Waves';

/** Конфиги игры, нужные бою. */
export interface BattleConfigs {
  cats: CatsConfig;
  enemies: EnemiesConfig;
  economy: EconomyConfig;
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
  /** Сколько котов и строений продано через корзину. */
  sales: number;
  /** Сколько строений каждого вида поставлено и сколько сделано улучшений. */
  built: Record<BuildingKind, number>;
  upgrades: number;
  /** Призывы по волнам: индекс — номер волны, во время которой призван кот (0 — до первой). */
  summonsByWave: number[];
  /** Сколько из призывов сделано сверх лимита волны. */
  overLimitSummons: number;
  /** Сколько монет и кристаллов принесли строения. */
  buildingGold: number;
  buildingCrystals: number;
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
  readonly board: (Piece | null)[];
  readonly buildings: Buildings;
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
  private counts = {
    summons: 0,
    merges: 0,
    hybrids: 0,
    meteors: 0,
    sales: 0,
    upgrades: 0,
    topCatLevel: 0,
    overLimitSummons: 0,
    buildingGold: 0,
    buildingCrystals: 0,
  };
  private summonsByWave: number[] = [];
  private built: Record<BuildingKind, number> = { shop: 0, mine: 0, altar: 0 };

  /** `rng` возвращает число в [0, 1); `bonuses` — снаряжение игрока. По умолчанию его нет: баланс подбирается так, чтобы уровни проходились без бонусов. */
  constructor(
    readonly level: LevelConfig,
    private readonly configs: BattleConfigs,
    rng: () => number = Math.random,
    bonuses: GearBonuses = noBonuses(),
  ) {
    const { cats, enemies, economy, gear, levels, board } = configs;
    const half = levels.slotSize / 2;
    this.slots = level.slots.map(([x, y]) => [x + half, y + half]);
    this.path = buildPath(level.path);
    this.economy = new Economy(level, economy, bonuses);
    this.summoner = new Summon(cats, bonuses.summonWeights, rng, bonuses.level2Chance);
    this.meteor = new Meteor(gear.meteor, bonuses.meteorCooldownMult, bonuses.meteorGround);
    this.merger = new Merge(cats, {
      maxCatLevel: level.maxCatLevel,
      ritualTime: gear.ritual.time * bonuses.ritualTimeMult,
      crystalCost: gear.ritual.crystalCost,
    });
    this.waves = new Waves(levels.waves, level, enemies, rng);
    this.combat = new Combat({ cats, enemies, path: this.path, slots: this.slots, bounds: board, rng, damageBonus: bonuses.elementDamage });
    this.board = level.slots.map(() => null);
    this.buildings = new Buildings(economy.buildings, level.buildings, bonuses.buildingIncomeMult);
  }

  get finished(): boolean {
    return this.outcome !== null;
  }

  /** Данные котов и врагов: по ним бот судит, кто кого может ранить. */
  get cats(): CatsConfig {
    return this.configs.cats;
  }

  get enemies(): EnemiesConfig {
    return this.configs.enemies;
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
      if (isCat(cat)) this.merger.advanceRitual(cat, dt);
    }
    const wave = this.waves.wave;
    for (const enemy of this.waves.update(dt, this.combat.enemies.length === 0)) this.combat.add(enemy);
    if (this.waves.wave !== wave) {
      this.economy.startWave();
      const income = this.buildings.startWave(this.board);
      this.economy.reward(income.gold, income.crystals);
      this.counts.buildingGold += income.gold;
      this.counts.buildingCrystals += income.crystals;
    }
    this.apply(this.combat.update(dt, this.board));

    if (this.economy.lives <= 0 || this.time >= TIME_LIMIT) this.outcome = false;
    else if (this.waves.finished && this.combat.enemies.length === 0) this.outcome = true;
  }

  /** Призыв кота в случайную свободную клетку. Возвращает false, если не хватило монет или места. */
  summon(): boolean {
    if (this.finished || !this.economy.canAffordSummon()) return false;
    const result = this.summoner.summon(this.board, this.economy.summonCost);
    if (!result) return false;
    if (this.economy.overLimitMult > 1) this.counts.overLimitSummons++;
    this.economy.paySummon();
    this.board[result.slot] = result.cat;
    this.counts.summons++;
    this.summonsByWave[this.waves.wave] = (this.summonsByWave[this.waves.wave] ?? 0) + 1;
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

  /** Продажа кота или строения из клетки через корзину. Возвращает false, если клетка пуста или кот проводит ритуал. */
  sell(slot: number): boolean {
    const piece = this.board[slot];
    if (this.finished || !piece || (isCat(piece) && piece.ritual > 0)) return false;
    this.economy.sell(piece.invested);
    this.board[slot] = null;
    this.counts.sales++;
    this.syncLimit();
    return true;
  }

  /** Ставит строение в случайную свободную клетку. Возвращает false, если строить нельзя или не хватило монет. */
  build(kind: BuildingKind): boolean {
    if (this.finished || this.buildings.blocked(this.board, kind)) return false;
    const slot = this.summoner.pickFreeSlot(this.board);
    if (slot === null || !this.economy.spend(this.buildings.cost(kind))) return false;
    this.board[slot] = this.buildings.create(kind);
    this.built[kind]++;
    this.syncLimit();
    return true;
  }

  /** Улучшает строение в клетке. Возвращает false, если там не строение, оно уже на последнем уровне или не хватило монет. */
  upgrade(slot: number): boolean {
    const piece = this.board[slot];
    if (this.finished || !isBuilding(piece)) return false;
    const next = this.buildings.upgraded(piece);
    if (!next || !this.economy.spend(next.invested - piece.invested)) return false;
    this.board[slot] = next;
    this.counts.upgrades++;
    this.syncLimit();
    return true;
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
      built: { ...this.built },
      summonsByWave: Array.from({ length: this.level.waves + 1 }, (_, wave) => this.summonsByWave[wave] ?? 0),
    };
  }

  /** Алтари на поле меняют лимит призывов сразу. */
  private syncLimit(): void {
    this.economy.limitBonus = this.buildings.summonLimitBonus(this.board);
  }

  private apply(events: CombatEvent[]): void {
    for (const event of events) {
      if (event.kind === 'leaked') this.economy.loseLives(event.lifeDamage);
      else if (event.kind === 'killed') this.economy.reward(event.gold, event.crystals);
    }
  }
}
