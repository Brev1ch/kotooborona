import { describe, expect, it } from 'vitest';
import { cats, economy, enemies, gear, levels } from '../data';
import type { ElementId, EnemiesConfig, EnemyTypeId, LevelConfig } from '../data';
import type { Enemy } from '../entities/Enemy';
import { Bot, DEFAULT_BOT, elementValue, elementVersus, playLevel, reportLevel } from './Bot';
import { isBuilding } from '../entities/Building';
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
    sim.board[0] = { element: 'fire', level: 1, cooldown: 0, ritual: 0, invested: 0 };
    sim.board[5] = { element: 'fire', level: 1, cooldown: 0, ritual: 0, invested: 0 };
    bot.update(DT);

    expect(sim.board.filter((cat) => cat !== null)).toEqual([expect.objectContaining({ element: 'fire', level: 2 })]);
  });

  it('из двух пар сливает ту, что даст кота уровнем выше', () => {
    const { sim, bot } = create({ startGold: 0, startCrystals: 0 });
    const cat = (element: 'fire' | 'water', level: number) => ({ element, level, cooldown: 0, ritual: 0, invested: 0 });
    sim.board[0] = cat('fire', 1);
    sim.board[1] = cat('fire', 1);
    sim.board[2] = cat('water', 3);
    sim.board[3] = cat('water', 3);
    bot.update(DT);

    expect(sim.result().topCatLevel).toBe(4);
  });

  it('делает гибрида за кристалл, пока на поле нет врагов', () => {
    const { sim, bot } = create({ startGold: 0, startCrystals: 1 });
    sim.board[0] = { element: 'fire', level: 1, cooldown: 0, ritual: 0, invested: 0 };
    sim.board[1] = { element: 'water', level: 1, cooldown: 0, ritual: 0, invested: 0 };
    bot.update(DT);

    expect(sim.result().hybrids).toBe(1);
    expect(sim.economy.crystals).toBe(0);
  });

  it('посреди волны гибрида не делает: ритуал выключил бы обоих котов', () => {
    const { sim, bot } = create({ startGold: 0, startCrystals: 1 });
    // Дожидаемся врагов без бота, потом даём ему пару для гибрида.
    while (sim.combat.enemies.length === 0) sim.step(DT);
    sim.board[0] = { element: 'fire', level: 1, cooldown: 0, ritual: 0, invested: 0 };
    sim.board[1] = { element: 'water', level: 1, cooldown: 0, ritual: 0, invested: 0 };
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
    sim.board[1] = { element: 'fire', level: 1, cooldown: 0, ritual: 0, invested: 0 };
    bot.update(DT);

    expect(sim.board[0]).toMatchObject({ element: 'fire' });
    expect(sim.board[1]).toBeNull();
  });
});

describe('Bot: строения и продажа', () => {
  const ALL: LevelConfig['buildings'] = ['shop', 'mine', 'altar'];
  const { cost, beforeFirstWave, overLimitMult } = economy.summon;
  const shop = economy.buildings.kinds.shop;
  /** Бот делает `count` ходов подряд; бой при этом стоит, волны не начинаются. */
  const act = (bot: Bot, count: number): void => {
    for (let i = 0; i < count; i++) bot.update(DEFAULT_BOT.reaction);
  };
  const cat = (level: number, element: 'fire' | 'storm' = 'storm') => ({ element, level, cooldown: 0, ritual: 0, invested: 10 });

  /** Цены призывов сверх лимита, которые бот ещё оплачивает, прежде чем предпочесть лавку: они дешевле её цены с поправкой. */
  const cheapSummons = overLimitMult.map((mult) => cost * mult).filter((price) => price < shop[0].cost * DEFAULT_BOT.buildOverSummon);
  const cheapTotal = cheapSummons.reduce((sum, price) => sum + price, 0);

  it('лавку берёт вместо подорожавшего призыва: сначала призывы волны и те сверх лимита, что дешевле', () => {
    const gold = beforeFirstWave * cost + cheapTotal + shop[0].cost;
    const { sim, bot } = create({ buildings: ALL, waves: 8, startGold: gold, startCrystals: 5 });
    act(bot, 12);

    expect(sim.result().summons).toBe(beforeFirstWave + cheapSummons.length);
    expect(sim.result().built).toEqual({ shop: 1, mine: 0, altar: 0 });
    expect(sim.economy.gold).toBe(0);
  });

  it('когда призыв уже подорожал, ждёт монет на лавку, а не призывает дальше', () => {
    const short = shop[0].cost - 5;
    const gold = beforeFirstWave * cost + cheapTotal + short;
    const { sim, bot } = create({ buildings: ALL, waves: 8, startGold: gold, startCrystals: 5 });
    act(bot, 12);

    // На следующий призыв монет хватило бы, но он уже не дешевле лавки.
    expect(short).toBeGreaterThanOrEqual(cost * overLimitMult[cheapSummons.length]);
    expect(sim.result().overLimitSummons).toBe(cheapSummons.length);
    expect(sim.result().built.shop).toBe(0);
    expect(sim.economy.gold).toBe(short);
  });

  it('когда кристаллы на исходе, копит на шахту и сверх лимита не призывает', () => {
    const mine = economy.buildings.kinds.mine[0].cost;
    const { sim, bot } = create({ buildings: ALL, waves: 8, startGold: beforeFirstWave * cost + mine - 5, startCrystals: 0 });
    act(bot, 12);
    expect(sim.result().overLimitSummons).toBe(0);
    expect(sim.result().built.mine).toBe(0);

    sim.economy.gold += 5;
    act(bot, 2);
    expect(sim.result().built).toEqual({ shop: 0, mine: 1, altar: 0 });
  });

  it('строит только те строения, что разрешены настройкой', () => {
    const mine = economy.buildings.kinds.mine[0].cost;
    const { sim } = create({ buildings: ALL, waves: 8, startGold: beforeFirstWave * cost + mine, startCrystals: 0 });
    const bot = new Bot(sim, { ...DEFAULT_BOT, kinds: [] });
    act(bot, 12);

    expect(sim.result().built).toEqual({ shop: 0, mine: 0, altar: 0 });
    expect(sim.result().overLimitSummons).toBeGreaterThan(0);
  });

  it('там, где строить нельзя, лишние монеты идут на призыв сверх лимита', () => {
    const { sim, bot } = create({ buildings: undefined, startGold: beforeFirstWave * cost + 100, startCrystals: 0 });
    act(bot, 12);

    expect(sim.result().overLimitSummons).toBeGreaterThan(0);
  });

  it('лавку, которая не успеет окупиться, не строит', () => {
    const { sim, bot } = create({ buildings: ['shop'], waves: 1, bossWaves: [], startGold: 500, startCrystals: 0 });
    act(bot, 20);

    expect(sim.result().built.shop).toBe(0);
    expect(sim.result().overLimitSummons).toBeGreaterThan(0);
  });

  it('оставляет клетки котам: на почти занятом поле не строит', () => {
    const { sim, bot } = create({ buildings: ALL, waves: 8, startGold: 500, startCrystals: 0 });
    // Свободна одна клетка; у котов разные уровни, сливаться им не с кем.
    for (let slot = 1; slot < sim.board.length; slot++) sim.board[slot] = cat(first.maxCatLevel);
    act(bot, 3);

    expect(sim.result().built).toEqual({ shop: 0, mine: 0, altar: 0 });
  });

  it('улучшает лавку, когда новые ставить уже нельзя', () => {
    const { sim, bot } = create({ buildings: ['shop'], waves: 8, startGold: 10_000, startCrystals: 0 });
    for (let i = 0; i < economy.buildings.maxPerKind; i++) sim.build('shop');
    sim.economy.gold = beforeFirstWave * cost + cost * overLimitMult[0] + shop[1].cost;
    act(bot, 12);

    expect(sim.result().upgrades).toBe(1);
    expect(sim.economy.gold).toBe(0);
  });

  it('на последней волне продаёт строения: дохода от них уже не будет', () => {
    const { sim, bot } = create({ buildings: ['shop'], waves: 1, bossWaves: [], startGold: 0, startCrystals: 0 });
    sim.economy.gold = shop[0].cost;
    sim.build('shop');
    run(sim, bot, levels.waves.firstWaveDelay + 1);

    expect(sim.waves.wave).toBe(1);
    expect(sim.board.some(isBuilding)).toBe(false);
    expect(sim.result().sales).toBe(1);
  });

  it('на забитом поле продаёт кота без пары и призывает другого', () => {
    const { sim, bot } = create({ startGold: cost, startCrystals: 0 });
    // Все коты на потолке уровня и слиться не могут; у кота 1-го уровня пары нет вовсе.
    sim.board.fill(cat(first.maxCatLevel));
    sim.board[3] = cat(1, 'fire');
    act(bot, 2);

    expect(sim.result().sales).toBe(1);
    expect(sim.result().summons).toBe(1);
    expect(sim.board[3]).toMatchObject({ level: 1, invested: cost });
  });

  it('пока есть свободная клетка, котов не продаёт', () => {
    const { sim, bot } = create({ startGold: 0, startCrystals: 0 });
    sim.board[3] = cat(1, 'fire');
    act(bot, 3);

    expect(sim.result().sales).toBe(0);
  });
});

describe('Bot: особенности врагов', () => {
  const { controlImmune, dotImmune } = DEFAULT_BOT;
  const versus = (element: ElementId, type: EnemyTypeId): number => elementVersus(cats, enemies, element, type);
  const act = (bot: Bot, count: number): void => {
    for (let i = 0; i < count; i++) bot.update(DEFAULT_BOT.reaction);
  };
  const cat = (element: ElementId, level = 1) => ({ element, level, cooldown: 0, ritual: 0, invested: 10 });
  /** Враг, уже прошедший долю дороги `progress`. */
  const enemyAt = (sim: Simulation, type: EnemyTypeId, progress: number): Enemy => ({
    type,
    distance: sim.path.length * progress,
    hp: 1000,
    maxHp: 1000,
    speed: 0,
    gold: 0,
    shield: 0,
    slowFactor: 1,
    slowTime: 0,
    burnDps: 0,
    burnTime: 0,
    poisonDps: 0,
    poisonTime: 0,
  });

  it('обычную мышь любой кот бьёт в полную силу', () => {
    for (const element of Object.keys(cats.elements) as ElementId[]) expect(versus(element, 'mouse'), element).toBe(1);
  });

  it('сопротивление стихии и иммунитет к её огню снижают пользу кота', () => {
    expect(versus('fire', 'fire')).toBe(0);
    expect(versus('lava', 'fire')).toBeCloseTo(0.5 * dotImmune);
    expect(versus('steam', 'fire')).toBe(1);
    expect(versus('storm', 'fire')).toBe(1);
    expect(versus('water', 'fire')).toBe(1);
  });

  it('иммунитет к замедлению и заморозке обесценивает котов контроля', () => {
    expect(versus('water', 'boots')).toBe(controlImmune);
    expect(versus('ice', 'boots')).toBe(controlImmune);
    expect(versus('steam', 'boots')).toBe(controlImmune);
    expect(versus('earth', 'boots')).toBe(1);
    expect(versus('fire', 'boots')).toBe(1);
  });

  it('летающего достают только указанные стихии', () => {
    expect(versus('air', 'bat')).toBe(1);
    expect(versus('storm', 'bat')).toBe(1);
    expect(versus('earth', 'bat')).toBe(0);
    expect(versus('sand', 'bat')).toBe(0);
  });

  it('от снарядов ниндзя уклоняется, от урона по площади — нет', () => {
    const hits = 1 - 1 / (enemies.types.ninja.dodgeEvery ?? 1);
    expect(versus('air', 'ninja')).toBeCloseTo(hits);
    expect(versus('earth', 'ninja')).toBeCloseTo(hits);
    for (const element of ['steam', 'lava', 'storm', 'sand'] as const) expect(versus(element, 'ninja'), element).toBe(1);
  });

  it('польза на уровне — средняя по долям врагов, остаток — мыши', () => {
    const level: LevelConfig = { ...first, enemies: { fire: 0.5, boots: 0.2 } };

    expect(elementValue(cats, enemies, level, 'fire')).toBeCloseTo(0.5 * 0 + 0.2 * 1 + 0.3 * 1);
    expect(elementValue(cats, enemies, level, 'water')).toBeCloseTo(0.5 * 1 + 0.2 * controlImmune + 0.3 * 1);
    expect(elementValue(cats, enemies, level, 'earth')).toBe(1);
  });

  it('врага, чья волна на уровне не наступит, польза не учитывает', () => {
    const late: EnemiesConfig = { ...enemies, types: { ...enemies.types, fire: { ...enemies.types.fire, fromWave: 99 } } };
    const level: LevelConfig = { ...first, enemies: { fire: 0.5 } };

    expect(elementValue(cats, late, level, 'fire')).toBe(1);
  });

  it('метеор бьёт по скоплению на поверхности', () => {
    const { sim, bot } = create({ startGold: 0 });
    for (let i = 0; i < DEFAULT_BOT.meteorTargets; i++) sim.combat.add(enemyAt(sim, 'mouse', 0.5));
    bot.update(DT);

    expect(sim.result().meteors).toBe(1);
  });

  it('на кротов под землёй метеор не тратит, даже когда их толпа', () => {
    const { sim, bot } = create({ startGold: 0 });
    for (let i = 0; i < DEFAULT_BOT.meteorTargets + 2; i++) sim.combat.add(enemyAt(sim, 'mole', 0.5));
    act(bot, 3);

    expect(sim.result().meteors).toBe(0);
  });

  it('кротов под землёй не считает в скоплении, а по вышедшим бьёт', () => {
    const { sim, bot } = create({ startGold: 0 });
    for (let i = 0; i < DEFAULT_BOT.meteorTargets - 1; i++) sim.combat.add(enemyAt(sim, 'mouse', 0.5));
    sim.combat.add(enemyAt(sim, 'mole', 0.5));
    act(bot, 2);
    expect(sim.result().meteors).toBe(0);

    // Тот же крот до подкопа — обычная цель.
    const { sim: open, bot: other } = create({ startGold: 0 });
    for (let i = 0; i < DEFAULT_BOT.meteorTargets - 1; i++) open.combat.add(enemyAt(open, 'mouse', 0.3));
    open.combat.add(enemyAt(open, 'mole', 0.3));
    other.update(DT);
    expect(open.result().meteors).toBe(1);
  });

  it('из гибридов одного уровня делает того, от кого больше пользы против врагов уровня', () => {
    // Против сапог пар и лёд почти бесполезны, гроза бьёт в полную силу.
    const { sim, bot } = create({ startGold: 0, startCrystals: 1, enemies: { boots: 0.6 } });
    sim.board[0] = cat('fire');
    sim.board[1] = cat('water');
    sim.board[2] = cat('air');
    bot.update(DT);

    expect(sim.board.filter((piece) => piece !== null).map((piece) => (piece as { element: string }).element).sort()).toEqual(['storm', 'water']);
  });

  it('на уровне без особых врагов выбор гибрида не меняется', () => {
    const { sim, bot } = create({ startGold: 0, startCrystals: 1, enemies: {} });
    sim.board[0] = cat('fire');
    sim.board[1] = cat('water');
    bot.update(DT);

    expect(sim.result().hybrids).toBe(1);
  });

  it('из котов без пары продаёт того, от кого против врагов уровня меньше пользы', () => {
    const cost = economy.summon.cost;
    const { sim, bot } = create({ startGold: cost, startCrystals: 0, enemies: { boots: 0.6 } });
    sim.board.fill(cat('storm', first.maxCatLevel));
    // Вложено поровну; ветряной сапогам страшен, водный — почти нет.
    sim.board[3] = cat('air', 1);
    sim.board[5] = cat('water', 2);
    act(bot, 1);

    expect(sim.result().sales).toBe(1);
    expect(sim.board[3]).toMatchObject({ element: 'air', level: 1 });
    expect(sim.board[5]).toBeNull();
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

  it('уровень идёт от двух до пяти минут', () => {
    for (const report of reports) {
      expect(report.avgTime).toBeGreaterThan(120);
      // Цель — пять минут; десять секунд сверху — на разброс между прогонами.
      expect(report.avgTime).toBeLessThan(310);
    }
  });

  it('лимит призывов держится до конца уровня: на поздних уровнях бот призывает немногим больше лимита', () => {
    for (const report of reports.slice(6)) {
      expect(report.avgLateSummons).toBeGreaterThan(3);
      expect(report.avgLateSummons).toBeLessThan(6.5);
    }
  });

  it('кристаллы остаются редкими, а продажа — выходом из тупика, а не способом играть', () => {
    for (const report of reports) {
      expect(report.avgHybrids).toBeLessThan(11);
      expect(report.avgSales).toBeLessThan(10);
    }
  });

  it('новые враги входят в главу по одному, каждые один-два уровня с третьего; крот и летучая мышь — в следующих главах', () => {
    expect(levels.levels.map((level) => level.intro ?? null)).toEqual([
      null,
      null,
      'boots',
      null,
      'shield',
      'fire',
      null,
      'shaman',
      'ninja',
      'king',
    ]);
    for (const level of levels.levels) {
      expect(level.enemies.mole, level.id).toBeUndefined();
      expect(level.enemies.bat, level.id).toBeUndefined();
    }
  });

  it('щитоносцев нет в начале главы, король — только на последнем уровне', () => {
    expect(levels.levels.slice(0, 4).every((level) => level.enemies.shield === undefined)).toBe(true);
    expect(levels.levels.slice(4).every((level) => (level.enemies.shield ?? 0) > 0)).toBe(true);
    expect(levels.levels.map((level) => level.kingWave !== undefined)).toEqual([...Array<boolean>(9).fill(false), true]);
    expect(levels.levels[9].kingWave).toBe(levels.levels[9].waves);
  });
});
