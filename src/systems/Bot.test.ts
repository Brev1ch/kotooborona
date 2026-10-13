import { describe, expect, it } from 'vitest';
import { cats, economy, enemies, gear, levels } from '../data';
import type { LevelConfig } from '../data';
import { Bot, DEFAULT_BOT, playLevel, reportLevel } from './Bot';
import { noBonuses } from './Loadout';
import { seededRandom } from './Random';
import { Simulation, type BattleConfigs } from './Simulation';

const configs: BattleConfigs = { cats, enemies, economy, gear, levels, board: { width: 360, height: 540 } };
const first = levels.levels[0];
const DT = DEFAULT_BOT.dt;

function create(overrides: Partial<LevelConfig> = {}, seed = 1): { sim: Simulation; bot: Bot } {
  const sim = new Simulation({ ...first, ...overrides }, configs, seededRandom(seed), noBonuses());
  return { sim, bot: new Bot(sim) };
}

function run(sim: Simulation, bot: Bot, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT) && !sim.finished; i++) {
    bot.update(DT);
    sim.step(DT);
  }
}

describe('Bot: стратегия', () => {
  it('призывает котов, пока хватает монет, по одному действию за раз', () => {
    const { sim, bot } = create({ startGold: 25 });
    bot.update(DT);
    expect(sim.result().summons).toBe(1);

    // Второе действие — не раньше, чем через время реакции.
    bot.update(DT);
    expect(sim.result().summons).toBe(1);
    run(sim, bot, 1.5);
    // Два кота по 10 монет; на третьего не хватает.
    expect(sim.result().summons).toBe(2);
  });

  it('сливает одинаковых котов', () => {
    const { sim, bot } = create({ startGold: 0, startCrystals: 0 });
    sim.board[0] = { element: 'fire', level: 1, cooldown: 0, ritual: 0 };
    sim.board[5] = { element: 'fire', level: 1, cooldown: 0, ritual: 0 };
    bot.update(DT);

    expect(sim.board.filter((cat) => cat !== null)).toEqual([expect.objectContaining({ element: 'fire', level: 2 })]);
  });

  it('из двух пар сливает ту, что даст кота уровнем выше', () => {
    const { sim, bot } = create({ startGold: 0, startCrystals: 0 });
    const cat = (element: 'fire' | 'water', level: number) => ({ element, level, cooldown: 0, ritual: 0 });
    sim.board[0] = cat('fire', 1);
    sim.board[1] = cat('fire', 1);
    sim.board[2] = cat('water', 3);
    sim.board[3] = cat('water', 3);
    bot.update(DT);

    expect(sim.result().topCatLevel).toBe(4);
  });

  it('делает гибрида за кристалл, пока на поле нет врагов', () => {
    const { sim, bot } = create({ startGold: 0, startCrystals: 1 });
    sim.board[0] = { element: 'fire', level: 1, cooldown: 0, ritual: 0 };
    sim.board[1] = { element: 'water', level: 1, cooldown: 0, ritual: 0 };
    bot.update(DT);

    expect(sim.result().hybrids).toBe(1);
    expect(sim.economy.crystals).toBe(0);
  });

  it('посреди волны гибрида не делает: ритуал выключил бы обоих котов', () => {
    const { sim, bot } = create({ startGold: 0, startCrystals: 1 });
    // Дожидаемся врагов без бота, потом даём ему пару для гибрида.
    while (sim.combat.enemies.length === 0) sim.step(DT);
    sim.board[0] = { element: 'fire', level: 1, cooldown: 0, ritual: 0 };
    sim.board[1] = { element: 'water', level: 1, cooldown: 0, ritual: 0 };
    bot.update(DT);

    expect(sim.result().hybrids).toBe(0);
  });

  it('бьёт метеором по скоплению врагов', () => {
    const { sim, bot } = create({ startGold: 0 });
    run(sim, bot, 20);

    expect(sim.result().meteors).toBeGreaterThan(0);
  });

  it('переставляет кота из клетки, откуда дороги не видно, в клетку получше', () => {
    // Дорога идёт только по левому краю; правая клетка до неё не достаёт.
    const level: Partial<LevelConfig> = {
      path: [[30, -20], [30, 560]],
      slots: [[60, 200], [290, 200]],
      startGold: 0,
    };
    const { sim, bot } = create(level);
    sim.board[1] = { element: 'fire', level: 1, cooldown: 0, ritual: 0 };
    bot.update(DT);

    expect(sim.board[0]).toMatchObject({ element: 'fire' });
    expect(sim.board[1]).toBeNull();
  });
});

describe('playLevel', () => {
  it('одно зерно — один и тот же итог', () => {
    expect(playLevel(first, configs, 11)).toEqual(playLevel(first, configs, 11));
  });

  it('итог содержит действия бота', () => {
    const result = playLevel(first, configs, 1);

    expect(result.summons).toBeGreaterThan(5);
    expect(result.merges).toBeGreaterThan(0);
    expect(result.topCatLevel).toBeGreaterThan(1);
    expect(result.time).toBeGreaterThan(60);
  });
});

// Страж баланса главы: если правка чисел в JSON ломает проходимость или кривую сложности, тест упадёт.
// Полный отчёт с большим числом прогонов — npm run balance.
describe('баланс главы 1 глазами бота', () => {
  const RUNS = 24;
  const reports = levels.levels.map((level) => reportLevel(level, configs, RUNS, 100));

  it('в главе десять уровней', () => {
    expect(levels.levels).toHaveLength(levels.chapterLevels);
  });

  it.each(levels.levels.map((level, index) => [index + 1, level.id] as const))(
    'уровень %i (%s) бот проходит почти всегда',
    (number) => {
      expect(reports[number - 1].winRate).toBeGreaterThanOrEqual(0.8);
    },
  );

  it.each(levels.levels.map((level, index) => [index + 1, level.id] as const))(
    'уровень %i (%s) бот не проходит на три звезды с запасом',
    (number) => {
      const report = reports[number - 1];
      // Хотя бы часть прогонов теряет жизни: трёх звёзд «всегда» нет ни на одном уровне.
      expect(report.stars[3]).toBeLessThan(RUNS);
    },
  );

  it('сложность растёт к концу главы', () => {
    const avg = (from: number, to: number): number =>
      reports.slice(from, to).reduce((sum, report) => sum + report.avgStars, 0) / (to - from);

    // Начало, середина и конец главы: звёзд у бота всё меньше.
    expect(avg(0, 3)).toBeGreaterThan(avg(3, 7));
    expect(avg(3, 7)).toBeGreaterThan(avg(7, 10));
    expect(reports[0].avgStars).toBeGreaterThan(2.5);
    expect(reports[9].avgStars).toBeLessThan(2.2);
  });

  it('уровень идёт от двух до семи минут', () => {
    for (const report of reports) {
      expect(report.avgTime).toBeGreaterThan(120);
      expect(report.avgTime).toBeLessThan(420);
    }
  });

  it('щитоносцев нет в начале главы, король — только на последнем уровне', () => {
    expect(levels.levels.slice(0, 4).every((level) => level.shieldChance === 0)).toBe(true);
    expect(levels.levels.slice(4).every((level) => level.shieldChance > 0)).toBe(true);
    expect(levels.levels.map((level) => level.kingWave !== undefined)).toEqual([...Array<boolean>(9).fill(false), true]);
    expect(levels.levels[9].kingWave).toBe(levels.levels[9].waves);
  });
});
