import { describe, expect, it } from 'vitest';
import { cats, economy, enemies, gear, levels } from '../data';
import type { LevelConfig } from '../data';
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
  ratChance: 0,
  shieldChance: 0,
};
const DT = 1 / 30;

function create(overrides: Partial<LevelConfig> = {}, seed = 1): Simulation {
  return new Simulation({ ...level, ...overrides }, configs, seededRandom(seed), noBonuses());
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
        if (a !== b && first && second && (first.element === second.element) === same) return [a, b];
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

    expect(sim.board[to]?.ritual).toBeGreaterThan(0);
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
    const element = sim.board[to]?.element;

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
    expect(sim.board[to]?.ritual).toBe(gear.ritual.time);

    run(sim, gear.ritual.time + 0.1);
    expect(sim.board[to]?.ritual).toBe(0);
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
