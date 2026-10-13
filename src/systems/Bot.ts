import type { BuildingKind, LevelConfig, Point } from '../data/types';
import { isBuilding, isCat } from '../entities/Building';
import type { Cat } from '../entities/Cat';
import { positionAt } from './Path';
import { seededRandom } from './Random';
import { Simulation, type BattleConfigs, type SimResult } from './Simulation';

/** Как играет бот. Числа подобраны под обычного игрока: не мгновенная реакция и метеор по понятным поводам. */
export interface BotOptions {
  /** Секунды между действиями: одно действие за раз, как пальцем. */
  reaction: number;
  /** Метеор летит, когда в круг попадает столько врагов… */
  meteorTargets: number;
  /** …или когда враг прошёл такую долю дороги: пора спасать ворота. */
  meteorDanger: number;
  /** Шаг симуляции, секунды. */
  dt: number;
  /** Сколько клеток бот оставляет котам: строение ставится, только если свободных клеток не меньше. */
  freeSlotsToBuild: number;
  /** Алтарь и шахта — покупки на вырост: бот берёт их, только если после покупки останется столько монет на котов. */
  spareGold: number;
  /** Алтарь окупается, если до конца уровня осталось хотя бы столько волн; шахта — столько. */
  altarWaves: number;
  mineWaves: number;
}

/** Шаг, с которым бот размечает дорогу точками, и сколько таких точек должна прибавить перестановка, чтобы её стоило делать. */
const ROAD_STEP = 10;
const MOVE_GAIN = 4;
/** Клетка и уровень кота в одном числе — ключ запомненного обзора. */
const VIEW_KEY_BASE = 100;

export const DEFAULT_BOT: BotOptions = {
  reaction: 0.4,
  meteorTargets: 4,
  meteorDanger: 0.8,
  dt: 1 / 30,
  freeSlotsToBuild: 2,
  spareGold: 20,
  altarWaves: 3,
  mineWaves: 3,
};

/**
 * Бот с простой стратегией, по одному действию за раз, в порядке важности:
 * 1. метеор — по самому плотному скоплению врагов или по тому, кто уже у ворот;
 * 2. слияние одинаковых котов — сначала самых высоких уровней;
 * 3. гибрид — если есть кристалл, а на поле нет врагов (ритуал выключает обоих котов) или поле забито;
 * 4. призыв по обычной цене — пока волна даёт призывы, хватает монет и есть свободная клетка;
 * 5. стройка и улучшение — лавка, пока успеет окупиться; шахта, когда кристаллы кончились; алтарь, когда монет с запасом;
 * 6. продажа — строений, от которых на последней волне уже нет толку, и кота без пары, когда поле забито;
 * 7. призыв сверх лимита — только если копить больше не на что;
 * 8. перестановка — кот из клетки, откуда видно мало дороги, переезжает в свободную клетку получше.
 */
export class Bot {
  private wait = 0;
  /** Точки дороги на поле с шагом `ROAD_STEP`: по ним бот оценивает, сколько дороги видно из клетки. */
  private readonly road: Point[];
  private readonly views = new Map<number, number>();

  constructor(
    private readonly sim: Simulation,
    private readonly options: BotOptions = DEFAULT_BOT,
  ) {
    const { width, height } = sim.bounds;
    this.road = [];
    for (let distance = 0; distance <= sim.path.length; distance += ROAD_STEP) {
      const [x, y] = positionAt(sim.path, distance);
      if (x >= 0 && y >= 0 && x <= width && y <= height) this.road.push([x, y]);
    }
  }

  /** Вызывается каждый шаг симуляции; смотрит на поле и делает не больше одного хода раз в `reaction` секунд. */
  update(dt: number): void {
    this.wait -= dt;
    if (this.wait > 0) return;
    // Сделал ход или нет — следующий раз бот смотрит на поле через то же время.
    this.wait = this.options.reaction;
    void (
      this.tryMeteor() ||
      this.tryMerge(false) ||
      this.tryMerge(true) ||
      this.trySummon(false) ||
      this.tryBuild() ||
      this.trySell() ||
      this.trySummon(true) ||
      this.tryMove()
    );
  }

  private tryMeteor(): boolean {
    const { sim, options } = this;
    if (!sim.meteor.ready) return false;
    const radius = sim.meteorRadius;
    const { width, height } = sim.bounds;
    // Целимся в одного из врагов: круг с центром на нём накрывает скопление вокруг.
    const points = sim.combat.enemies
      .map((enemy) => ({ enemy, point: sim.position(enemy) }))
      .filter(({ point: [x, y] }) => x >= 0 && y >= 0 && x <= width && y <= height);

    let best: Point | null = null;
    let bestCount = 0;
    let danger: Point | null = null;
    let dangerDistance = sim.path.length * options.meteorDanger;
    for (const { enemy, point } of points) {
      const count = points.filter(({ point: other }) => Math.hypot(other[0] - point[0], other[1] - point[1]) <= radius).length;
      if (count > bestCount) {
        bestCount = count;
        best = point;
      }
      if (enemy.distance >= dangerDistance) {
        dangerDistance = enemy.distance;
        danger = point;
      }
    }
    const target = bestCount >= options.meteorTargets ? best : danger;
    return target !== null && sim.castMeteor(...target);
  }

  /** Сливает лучшую пару: одинаковых котов или, при `hybrid`, разных стихий за кристалл. */
  private tryMerge(hybrid: boolean): boolean {
    const { sim } = this;
    if (hybrid) {
      // Ритуал выключает обоих котов на несколько секунд: посреди волны бот рискует, только когда поле забито.
      const full = !sim.board.includes(null);
      if (sim.combat.enemies.length > 0 && !full) return false;
    }

    // Лучшая пара — та, что даёт кота уровнем выше; при равенстве новый кот встаёт в клетку, откуда видно больше дороги.
    let pick: { from: number; to: number; level: number; view: number } | null = null;
    for (let from = 0; from < sim.board.length; from++) {
      for (let to = 0; to < sim.board.length; to++) {
        if (from === to || !sim.board[from] || !sim.board[to]) continue;
        const merged = sim.mergeResult(from, to);
        if (!merged || merged.crystalCost > 0 !== hybrid) continue;
        const view = this.view(to, merged.cat);
        if (!pick || merged.cat.level > pick.level || (merged.cat.level === pick.level && view > pick.view)) {
          pick = { from, to, level: merged.cat.level, view };
        }
      }
    }
    return pick !== null && sim.drop(pick.from, pick.to);
  }

  /** Призыв: по обычной цене — всегда; сверх лимита — только когда монеты больше не на что копить. */
  private trySummon(overLimit: boolean): boolean {
    const { sim } = this;
    if (sim.economy.overLimitMult > 1 !== overLimit) return false;
    // Призывы по обычной цене — самая выгодная трата, их бот не пропускает; копит он вместо дорогих призывов сверх лимита.
    if (overLimit && this.wanted() !== null) return false;
    return sim.summon();
  }

  /** Волны, которые ещё начнутся: столько раз строение успеет принести доход. */
  private get wavesLeft(): number {
    return this.sim.level.waves - this.sim.waves.wave;
  }

  /**
   * Покупка, на которую бот сейчас копит: строение или улучшение, которое успеет окупиться.
   * Лавка и её улучшения — первыми: чем раньше, тем больше волн дохода.
   */
  private wanted(): { cost: number; buy: () => boolean } | null {
    const { sim, options, wavesLeft } = this;
    const { buildings, board, economy } = sim;
    const free = board.filter((piece) => piece === null).length;
    const canPlace = (kind: BuildingKind): boolean => free >= options.freeSlotsToBuild && buildings.blocked(board, kind) === null;
    const build = (kind: BuildingKind, spare = 0) => ({ cost: buildings.cost(kind) + spare, buy: () => sim.build(kind) });

    // На последней волне бот строения продаёт, поэтому настоящая цена покупки — то, что не вернётся при продаже.
    const net = (cost: number): number => cost - economy.sellValue(cost);
    const shop = buildings.stats('shop', 1);
    if (canPlace('shop') && (shop.gold ?? 0) * wavesLeft >= net(shop.cost)) return build('shop');

    // Улучшение лавки — если прибавка дохода за оставшиеся волны больше цены.
    for (let slot = 0; slot < board.length; slot++) {
      const piece = board[slot];
      if (!isBuilding(piece) || piece.kind !== 'shop') continue;
      const cost = buildings.upgradeCost(piece);
      if (cost === null) continue;
      const gain = (buildings.stats('shop', piece.level + 1).gold ?? 0) - (buildings.stats('shop', piece.level).gold ?? 0);
      if (gain * wavesLeft >= net(cost)) return { cost, buy: () => sim.upgrade(slot) };
    }

    // Шахта — когда кристаллы кончились: без них гибридов не будет.
    if (canPlace('mine') && economy.crystals === 0 && buildings.count(board, 'mine') === 0 && wavesLeft >= options.mineWaves) {
      return build('mine', options.spareGold);
    }
    // Алтарь — когда монет хватает и на него, и на котов: лишний призыв каждую волну до конца уровня.
    if (canPlace('altar') && wavesLeft >= options.altarWaves) return build('altar', options.spareGold);
    return null;
  }

  private tryBuild(): boolean {
    const wanted = this.wanted();
    return wanted !== null && this.sim.economy.gold >= wanted.cost && wanted.buy();
  }

  /**
   * Продаёт то, от чего больше нет толку: на последней волне — строения (дохода уже не будет, а клетка и монеты нужны котам);
   * на забитом поле — самого дешёвого кота, которому не с кем слиться, чтобы призвать на его место другого.
   */
  private trySell(): boolean {
    const { sim } = this;
    const { board } = sim;
    if (this.wavesLeft === 0) {
      const building = board.findIndex((piece) => isBuilding(piece));
      if (building >= 0) return sim.sell(building);
    }
    if (board.includes(null) || !sim.economy.canAffordSummon()) return false;

    let pick: { slot: number; invested: number } | null = null;
    board.forEach((cat, slot) => {
      if (!isCat(cat) || cat.ritual > 0) return;
      // Есть кот того же уровня — пара ещё может сложиться (хотя бы гибридом, когда появится кристалл).
      const paired = board.some((other, at) => at !== slot && isCat(other) && other.level === cat.level);
      if (paired) return;
      if (!pick || cat.invested < pick.invested) pick = { slot, invested: cat.invested };
    });
    const sale = pick as { slot: number } | null;
    return sale !== null && sim.sell(sale.slot);
  }

  /** Переставляет одного кота туда, откуда он достанет заметно больше дороги; первыми — коты высоких уровней. */
  private tryMove(): boolean {
    const { sim } = this;
    let pick: { from: number; to: number; level: number; gain: number } | null = null;
    sim.board.forEach((cat, from) => {
      if (!isCat(cat) || cat.ritual > 0) return;
      const here = this.view(from, cat);
      sim.board.forEach((other, to) => {
        if (other) return;
        const gain = this.view(to, cat) - here;
        if (gain < MOVE_GAIN) return;
        if (!pick || cat.level > pick.level || (cat.level === pick.level && gain > pick.gain)) {
          pick = { from, to, level: cat.level, gain };
        }
      });
    });
    const move = pick as { from: number; to: number } | null;
    return move !== null && sim.drop(move.from, move.to);
  }

  /** Сколько точек дороги достаёт кот из клетки. Дальность зависит только от уровня кота — ответ запоминается. */
  private view(slot: number, cat: Cat): number {
    const key = slot * VIEW_KEY_BASE + cat.level;
    let seen = this.views.get(key);
    if (seen === undefined) {
      const [x, y] = this.sim.slots[slot];
      const range = this.sim.range(cat);
      seen = this.road.filter(([rx, ry]) => Math.hypot(rx - x, ry - y) <= range).length;
      this.views.set(key, seen);
    }
    return seen;
  }
}

/** Проходит уровень ботом. Одно зерно — один и тот же бой. */
export function playLevel(
  level: LevelConfig,
  configs: BattleConfigs,
  seed: number,
  options: BotOptions = DEFAULT_BOT,
): SimResult {
  const sim = new Simulation(level, configs, seededRandom(seed));
  const bot = new Bot(sim, options);
  while (!sim.finished) {
    bot.update(options.dt);
    sim.step(options.dt);
  }
  return sim.result();
}

/** Сводка по нескольким прогонам уровня. */
export interface LevelReport {
  runs: number;
  /** Доля побед от 0 до 1. */
  winRate: number;
  /** Сколько прогонов закончилось на 0, 1, 2 и 3 звезды. */
  stars: [number, number, number, number];
  /** Среднее число звёзд, поражение считается за 0. */
  avgStars: number;
  /** Средние потери жизней и длительность — по победным прогонам. */
  avgLivesLost: number;
  avgTime: number;
  avgTopCatLevel: number;
  avgHybrids: number;
  /** Сколько строений каждого вида бот ставит за бой, сколько раз улучшает и сколько продаёт (котов и строений). */
  avgBuilt: Record<BuildingKind, number>;
  avgUpgrades: number;
  avgSales: number;
  /** Призывов за волну в последней трети уровня и сколько из всех призывов сделано сверх лимита. */
  avgLateSummons: number;
  avgOverLimit: number;
  /** Кристаллы со шахт и монеты с лавок за бой. */
  avgMineCrystals: number;
  avgShopGold: number;
}

/** Среднее число призывов за волну в последней трети уровня: показывает, держит ли лимит до конца. */
function lateSummons(result: SimResult): number {
  const waves = result.summonsByWave.slice(1);
  const late = waves.slice(Math.floor((waves.length * 2) / 3));
  return late.length === 0 ? 0 : late.reduce((sum, count) => sum + count, 0) / late.length;
}

/** Прогоняет уровень ботом `runs` раз с зёрнами `seed`, `seed + 1`, … и сводит итоги. */
export function reportLevel(
  level: LevelConfig,
  configs: BattleConfigs,
  runs: number,
  seed = 1,
  options: BotOptions = DEFAULT_BOT,
): LevelReport {
  const results = Array.from({ length: runs }, (_, i) => playLevel(level, configs, seed + i, options));
  const wins = results.filter((result) => result.won);
  const avg = (list: SimResult[], pick: (result: SimResult) => number): number =>
    list.length === 0 ? 0 : list.reduce((sum, result) => sum + pick(result), 0) / list.length;
  const stars: [number, number, number, number] = [0, 0, 0, 0];
  for (const result of results) stars[result.stars]++;
  return {
    runs,
    winRate: wins.length / runs,
    stars,
    avgStars: avg(results, (result) => result.stars),
    avgLivesLost: avg(wins, (result) => result.livesLost),
    avgTime: avg(wins, (result) => result.time),
    avgTopCatLevel: avg(results, (result) => result.topCatLevel),
    avgHybrids: avg(results, (result) => result.hybrids),
    avgBuilt: {
      shop: avg(results, (result) => result.built.shop),
      mine: avg(results, (result) => result.built.mine),
      altar: avg(results, (result) => result.built.altar),
    },
    avgUpgrades: avg(results, (result) => result.upgrades),
    avgSales: avg(results, (result) => result.sales),
    avgLateSummons: avg(results, lateSummons),
    avgOverLimit: avg(results, (result) => result.overLimitSummons),
    avgMineCrystals: avg(results, (result) => result.buildingCrystals),
    avgShopGold: avg(results, (result) => result.buildingGold),
  };
}
