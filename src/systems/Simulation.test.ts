import { describe, expect, it } from 'vitest';
import { cats, economy, enemies, gear, levels } from '../data';
import type { LevelConfig } from '../data';
import { isBuilding, isCat } from '../entities/Building';
import type { Cat } from '../entities/Cat';
import { noBonuses } from './Loadout';
import { seededRandom } from './Random';
import { Simulation, type BattleConfigs } from './Simulation';

const configs: BattleConfigs = { cats, enemies, economy, gear, levels, board: { width: 360, height: 540 } };
// Короткий уровень с фиксированными числами: две волны мышей, много монет и кристаллов.
const level: LevelConfig = {
  ...levels.levels[0],
  waves: 2,
  bossWaves: [],
  kingWave: undefined,
  maxCatLevel: 5,
  startGold: 500,
  startCrystals: 3,
  startLives: 5,
  hpMult: 1,
  enemies: {},
};
const DT = 1 / 30;

function create(overrides: Partial<LevelConfig> = {}, seed = 1): Simulation {
  return new Simulation({ ...level, ...overrides }, configs, seededRandom(seed), noBonuses());
}

/** Кот в клетке; падает, если там пусто или строение. */
function catAt(sim: Simulation, slot: number): Cat {
  const piece = sim.board[slot];
  if (!isCat(piece)) throw new Error(`В клетке ${slot} нет кота`);
  return piece;
}

function run(sim: Simulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT) && !sim.finished; i++) sim.step(DT);
}

/** Призывает котов, пока на поле не окажутся два одной стихии; возвращает их клетки. */
function summonPair(sim: Simulation, same: boolean): [number, number] {
  for (let i = 0; i < sim.board.length; i++) {
    sim.summon();
    for (let a = 0; a < sim.board.length; a++) {
      for (let b = 0; b < sim.board.length; b++) {
        const first = sim.board[a];
        const second = sim.board[b];
        if (a !== b && isCat(first) && isCat(second) && (first.element === second.element) === same) return [a, b];
      }
    }
  }
  throw new Error('Нужная пара котов не выпала');
}

describe('Simulation: действия игрока', () => {
  it('призыв ставит кота на поле и списывает монеты', () => {
    const sim = create();

    expect(sim.summon()).toBe(true);
    expect(sim.board.filter((cat) => cat !== null)).toHaveLength(1);
    expect(sim.economy.gold).toBe(490);
  });

  it('сверх лимита волны призыв дороже, с началом волны лимит обновляется', () => {
    const sim = create();
    const { cost, beforeFirstWave, perWave, overLimitMult } = economy.summon;
    for (let i = 0; i < beforeFirstWave; i++) sim.summon();
    expect(sim.economy.summonsLeft).toBe(0);
    expect(sim.economy.summonCost).toBe(cost * overLimitMult[0]);

    // Первая волна начинается через firstWaveDelay секунд.
    run(sim, levels.waves.firstWaveDelay + 0.5);

    expect(sim.waves.wave).toBe(1);
    expect(sim.economy.summonsLeft).toBe(perWave);
    expect(sim.economy.summonCost).toBe(cost);
  });

  it('продажа убирает кота и возвращает половину вложенного', () => {
    const sim = create();
    sim.summon();
    const slot = sim.board.findIndex((cat) => cat !== null);

    expect(sim.sell(slot)).toBe(true);
    expect(sim.board[slot]).toBeNull();
    expect(sim.economy.gold).toBe(500 - economy.summon.cost + economy.summon.cost * economy.sell.refund);
    expect(sim.result().sales).toBe(1);
  });

  it('за слитого кота возвращается доля всех призывов, включая штрафные', () => {
    const sim = create();
    const [from, to] = summonPair(sim, true);
    const paid = 500 - sim.economy.gold;
    sim.drop(from, to);
    const before = sim.economy.gold;
    // Остальных котов продаём первыми: их цена известна по отдельности.
    const others = sim.board.reduce((sum, cat, slot) => (cat && slot !== to ? sum + cat.invested : sum), 0);

    sim.sell(to);

    expect(sim.economy.gold).toBe(before + Math.floor((paid - others) * economy.sell.refund));
  });

  it('пустую клетку и кота в ритуале продать нельзя', () => {
    const sim = create();
    expect(sim.sell(0)).toBe(false);

    const [from, to] = summonPair(sim, false);
    sim.drop(from, to);
    const gold = sim.economy.gold;

    expect(catAt(sim, to).ritual).toBeGreaterThan(0);
    expect(sim.sell(to)).toBe(false);
    expect(sim.economy.gold).toBe(gold);
  });

  it('без монет и без свободных клеток призыва нет', () => {
    expect(create({ startGold: 5 }).summon()).toBe(false);

    const full = create({ startGold: 100_000 });
    for (let i = 0; i < full.board.length; i++) expect(full.summon()).toBe(true);
    expect(full.summon()).toBe(false);
  });

  it('одинаковые коты сливаются бесплатно в кота уровнем выше', () => {
    const sim = create();
    const [from, to] = summonPair(sim, true);
    const element = catAt(sim, to).element;

    expect(sim.mergeResult(from, to)).toMatchObject({ crystalCost: 0, cat: { element, level: 2 } });
    expect(sim.drop(from, to)).toBe(true);
    expect(sim.board[from]).toBeNull();
    expect(sim.board[to]).toMatchObject({ element, level: 2, ritual: 0 });
    expect(sim.economy.crystals).toBe(3);
  });

  it('разные стихии дают гибрида за кристалл, и он сначала проводит ритуал', () => {
    const sim = create();
    const [from, to] = summonPair(sim, false);

    expect(sim.drop(from, to)).toBe(true);
    expect(sim.economy.crystals).toBe(2);
    expect(sim.board[to]?.level).toBe(2);
    expect(catAt(sim, to).ritual).toBe(gear.ritual.time);

    run(sim, gear.ritual.time + 0.1);
    expect(catAt(sim, to).ritual).toBe(0);
    expect(sim.result()).toMatchObject({ merges: 1, hybrids: 1, topCatLevel: 2 });
  });

  it('без кристалла гибрид не получается, коты остаются на местах', () => {
    const sim = create({ startCrystals: 0 });
    const [from, to] = summonPair(sim, false);

    expect(sim.mergeResult(from, to)).toBeNull();
    expect(sim.drop(from, to)).toBe(false);
    expect(sim.board[from]).not.toBeNull();
  });

  it('кот переезжает в пустую клетку', () => {
    const sim = create();
    sim.summon();
    const from = sim.board.findIndex((cat) => cat !== null);
    const to = sim.board.findIndex((cat) => cat === null);

    expect(sim.drop(from, to)).toBe(true);
    expect(sim.board[from]).toBeNull();
    expect(sim.board[to]).not.toBeNull();
  });

  it('метеор бьёт врагов в точке и уходит на перезарядку', () => {
    const sim = create();
    run(sim, 8);
    const target = sim.combat.enemies[0];
    const hp = target.hp;

    expect(sim.castMeteor(...sim.position(target))).toBe(true);
    expect(target.hp).toBeLessThan(hp);
    expect(sim.meteor.ready).toBe(false);
    expect(sim.castMeteor(...sim.position(target))).toBe(false);
    expect(sim.result().meteors).toBe(1);
  });
});

describe('Simulation: строения', () => {
  const ALL = ['shop', 'mine', 'altar'] as const;
  const { kinds, maxPerKind } = economy.buildings;
  const built = (overrides: Partial<LevelConfig> = {}): Simulation => create({ buildings: [...ALL], ...overrides });
  const slotOf = (sim: Simulation, kind: string): number => sim.board.findIndex((piece) => isBuilding(piece) && piece.kind === kind);

  it('строение встаёт в свободную клетку и стоит монет', () => {
    const sim = built();

    expect(sim.build('shop')).toBe(true);
    expect(sim.board.filter(isBuilding)).toEqual([{ kind: 'shop', level: 1, invested: kinds.shop[0].cost, waves: 0 }]);
    expect(sim.economy.gold).toBe(500 - kinds.shop[0].cost);
    expect(sim.result().built).toEqual({ shop: 1, mine: 0, altar: 0 });
  });

  it('на уровне без списка строений строить нельзя', () => {
    const sim = create({ buildings: undefined });

    expect(sim.build('shop')).toBe(false);
    expect(sim.economy.gold).toBe(500);
  });

  it('строится только то, что открыто на уровне', () => {
    const sim = create({ buildings: ['shop'] });

    expect(sim.build('altar')).toBe(false);
    expect(sim.build('shop')).toBe(true);
  });

  it('строений одного вида — не больше предела, проданное место освобождает', () => {
    const sim = built({ startGold: 10_000 });
    for (let i = 0; i < maxPerKind; i++) expect(sim.build('shop')).toBe(true);

    expect(sim.build('shop')).toBe(false);
    expect(sim.build('mine')).toBe(true);

    sim.sell(slotOf(sim, 'shop'));
    expect(sim.build('shop')).toBe(true);
  });

  it('без монет и без свободной клетки строить нельзя', () => {
    expect(built({ startGold: kinds.shop[0].cost - 1 }).build('shop')).toBe(false);

    const full = built({ startGold: 10_000 });
    while (full.summon());
    expect(full.board.includes(null)).toBe(false);
    expect(full.build('shop')).toBe(false);
  });

  it('лавка приносит монеты в начале каждой волны', () => {
    const sim = built();
    sim.build('shop');
    const gold = sim.economy.gold;

    run(sim, levels.waves.firstWaveDelay + 0.2);

    expect(sim.waves.wave).toBe(1);
    expect(sim.economy.gold).toBe(gold + (kinds.shop[0].gold ?? 0));
  });

  it('алтарь сразу прибавляет призыв, а без него лимит прежний', () => {
    const sim = built();
    const { beforeFirstWave } = economy.summon;
    sim.build('altar');

    expect(sim.economy.summonLimit).toBe(beforeFirstWave + (kinds.altar[0].summonLimit ?? 0));

    sim.sell(slotOf(sim, 'altar'));
    expect(sim.economy.summonLimit).toBe(beforeFirstWave);
  });

  it('улучшение стоит монет и усиливает строение', () => {
    const sim = built();
    sim.build('altar');
    const slot = slotOf(sim, 'altar');
    const gold = sim.economy.gold;

    expect(sim.upgrade(slot)).toBe(true);
    expect(sim.board[slot]).toMatchObject({ kind: 'altar', level: 2, invested: kinds.altar[0].cost + kinds.altar[1].cost });
    expect(sim.economy.gold).toBe(gold - kinds.altar[1].cost);
    expect(sim.economy.summonLimit).toBe(economy.summon.beforeFirstWave + (kinds.altar[1].summonLimit ?? 0));
    expect(sim.result().upgrades).toBe(1);
  });

  it('выше последнего уровня, без монет и не строение улучшить нельзя', () => {
    const sim = built({ startGold: 10_000 });
    sim.build('shop');
    const slot = slotOf(sim, 'shop');
    for (let i = 1; i < kinds.shop.length; i++) expect(sim.upgrade(slot)).toBe(true);
    expect(sim.upgrade(slot)).toBe(false);

    sim.summon();
    expect(sim.upgrade(sim.board.findIndex(isCat))).toBe(false);
    expect(sim.upgrade(sim.board.indexOf(null))).toBe(false);

    const poor = built({ startGold: kinds.shop[0].cost });
    poor.build('shop');
    expect(poor.upgrade(slotOf(poor, 'shop'))).toBe(false);
  });

  it('продажа строения возвращает долю постройки и улучшений', () => {
    const sim = built();
    sim.build('shop');
    const slot = slotOf(sim, 'shop');
    sim.upgrade(slot);
    const gold = sim.economy.gold;

    expect(sim.sell(slot)).toBe(true);
    expect(sim.economy.gold).toBe(gold + Math.floor((kinds.shop[0].cost + kinds.shop[1].cost) * economy.sell.refund));
  });

  it('строение переезжает и меняется местами с котом, но не сливается', () => {
    const sim = built();
    sim.build('shop');
    sim.build('shop');
    const [first, second] = sim.board.flatMap((piece, slot) => (isBuilding(piece) ? [slot] : []));
    expect(sim.mergeResult(first, second)).toBeNull();

    sim.summon();
    const cat = sim.board.findIndex(isCat);
    expect(sim.drop(first, cat)).toBe(true);
    expect(isBuilding(sim.board[cat])).toBe(true);
    expect(isCat(sim.board[first])).toBe(true);

    const free = sim.board.indexOf(null);
    expect(sim.drop(second, free)).toBe(true);
    expect(isBuilding(sim.board[free])).toBe(true);
  });
});

describe('Simulation: исход боя', () => {
  it('без котов мыши проходят в ворота, и бой проигран', () => {
    const sim = create();
    run(sim, 600);

    expect(sim.finished).toBe(true);
    expect(sim.result()).toMatchObject({ won: false, stars: 0, livesLost: 5, wave: 1 });
  });

  it('поле сильных котов выигрывает без потерь — три звезды', () => {
    const sim = create();
    sim.board.fill({ element: 'storm', level: 5, cooldown: 0, ritual: 0, invested: 0 });
    // У каждой клетки свой кот: перезарядка хранится в нём.
    sim.board.forEach((cat, slot) => (sim.board[slot] = cat && { ...cat }));
    run(sim, 600);

    expect(sim.result()).toMatchObject({ won: true, stars: 3, livesLost: 0, wave: 2 });
    // Награда за убитых пришла в экономику.
    expect(sim.economy.gold).toBeGreaterThan(500);
  });

  it('после конца боя действия и время не идут', () => {
    const sim = create();
    run(sim, 600);
    const { time } = sim;

    sim.step(DT);
    expect(sim.time).toBe(time);
    expect(sim.summon()).toBe(false);
    expect(sim.castMeteor(100, 100)).toBe(false);
  });

  it('одно зерно — один и тот же бой', () => {
    const play = (seed: number) => {
      const sim = create({}, seed);
      for (let i = 0; i < 4; i++) sim.summon();
      run(sim, 600);
      return sim.result();
    };

    expect(play(3)).toEqual(play(3));
  });
});
