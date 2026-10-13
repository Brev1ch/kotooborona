import { describe, expect, it } from 'vitest';
import { cats, levels } from '../data';
import type { Point } from '../data';
import type { Cat } from '../entities/Cat';
import { Merge } from './Merge';
import { densestPoint, findMergePair, findSellSlot, Tutorial, type TutorialState } from './Tutorial';

const rules = { summons: 2, meteorEnemies: 3, delay: 1, sellFreeSlots: 1 };

function state(overrides: Partial<TutorialState> = {}): TutorialState {
  return {
    finished: false,
    summons: 0,
    merges: 0,
    hybrids: 0,
    meteors: 0,
    sales: 0,
    builds: 0,
    canSummon: false,
    limitSpent: false,
    sellSlot: null,
    dragging: false,
    canBuild: false,
    mergePair: null,
    hybridPair: null,
    meteorReady: false,
    aiming: false,
    enemies: 0,
    cluster: null,
    ...overrides,
  };
}

/** Подсказка после того, как повод продержался дольше задержки. */
function settled(tutorial: Tutorial, current: TutorialState) {
  tutorial.update(0, current);
  return tutorial.update(rules.delay, current);
}

describe('Tutorial: шаги', () => {
  it('призыв: показывает на кнопку, пока игрок не призвал нужное число котов', () => {
    const tutorial = new Tutorial(['summon', 'merge'], rules);

    expect(settled(tutorial, state({ canSummon: true }))).toEqual({ step: 'summon', target: 'summonButton' });
    expect(settled(tutorial, state({ canSummon: true, summons: 1 }))?.step).toBe('summon');
    expect(settled(tutorial, state({ canSummon: true, summons: 2 }))).toBeNull();
  });

  it('призыв не подсказывается, когда на него нет монет', () => {
    expect(settled(new Tutorial(['summon'], rules), state({ canSummon: false }))).toBeNull();
  });

  it('слияние: показывает пару одинаковых котов, пока игрок ни разу не слил', () => {
    const tutorial = new Tutorial(['summon', 'merge'], rules);
    const withPair = state({ summons: 2, mergePair: [3, 7] });

    expect(settled(tutorial, withPair)).toEqual({ step: 'merge', from: 3, to: 7 });
    expect(settled(tutorial, { ...withPair, merges: 1 })).toBeNull();
  });

  it('шаги идут по порядку: пока можно призывать, про слияние молчит', () => {
    const tutorial = new Tutorial(['summon', 'merge'], rules);

    expect(settled(tutorial, state({ canSummon: true, mergePair: [0, 1] }))?.step).toBe('summon');
    // Монеты кончились — очередь слияния.
    expect(settled(tutorial, state({ canSummon: false, summons: 1, mergePair: [0, 1] }))?.step).toBe('merge');
  });

  it('гибрид: показывает пару разных стихий, пока игрок ни разу не смешал', () => {
    const tutorial = new Tutorial(['hybrid'], rules);

    expect(settled(tutorial, state({ hybridPair: [1, 2] }))).toEqual({ step: 'hybrid', from: 1, to: 2 });
    expect(settled(tutorial, state({ hybridPair: [1, 2], hybrids: 1 }))).toBeNull();
    expect(settled(tutorial, state({ hybridPair: null }))).toBeNull();
  });

  it('метеор: подсказка появляется, когда умение готово и врагов набралось достаточно', () => {
    const tutorial = new Tutorial(['meteor'], rules);

    expect(settled(tutorial, state({ meteorReady: true, enemies: 2 }))).toBeNull();
    expect(settled(tutorial, state({ meteorReady: false, enemies: 5 }))).toBeNull();
    expect(settled(tutorial, state({ meteorReady: true, enemies: 3 }))).toEqual({ step: 'meteor', target: 'meteorButton' });
  });

  it('метеор: когда игрок целится, показывает скопление врагов — сразу, без новой задержки', () => {
    const tutorial = new Tutorial(['meteor'], rules);
    settled(tutorial, state({ meteorReady: true, enemies: 4 }));
    const aiming = state({ meteorReady: true, aiming: true, enemies: 4, cluster: [30, 200] });

    expect(tutorial.update(0.016, aiming)).toEqual({ step: 'meteorAim', point: [30, 200] });
  });

  it('метеор: после первого удара подсказок больше нет', () => {
    const tutorial = new Tutorial(['meteor'], rules);

    expect(settled(tutorial, state({ meteorReady: true, enemies: 9, meteors: 1 }))).toBeNull();
    expect(settled(tutorial, state({ aiming: true, enemies: 9, meteors: 1 }))).toBeNull();
  });

  it('шагов, которых нет в уровне, обучение не подсказывает', () => {
    const tutorial = new Tutorial(['summon'], rules);

    expect(settled(tutorial, state({ mergePair: [0, 1], hybridPair: [0, 2], meteorReady: true, enemies: 9 }))).toBeNull();
  });

  it('после конца боя подсказок нет', () => {
    expect(settled(new Tutorial(['summon'], rules), state({ canSummon: true, finished: true }))).toBeNull();
  });
});

describe('Tutorial: не мешает тому, кто уже разобрался', () => {
  it('подсказка появляется, только когда повод продержался дольше задержки', () => {
    const tutorial = new Tutorial(['merge'], rules);
    const withPair = state({ mergePair: [0, 1] });

    expect(tutorial.update(0.5, withPair)).toBeNull();
    expect(tutorial.update(0.4, withPair)).toBeNull();
    expect(tutorial.update(0.6, withPair)?.step).toBe('merge');
  });

  it('игрок сделал шаг раньше задержки — подсказки не было вовсе', () => {
    const tutorial = new Tutorial(['merge'], rules);
    const shown = [
      tutorial.update(0.5, state({ mergePair: [0, 1] })),
      tutorial.update(0.4, state({ mergePair: [0, 1] })),
      tutorial.update(0.5, state({ merges: 1 })),
      tutorial.update(5, state({ merges: 1, mergePair: [2, 3] })),
    ];

    expect(shown).toEqual([null, null, null, null]);
  });

  it('повод пропал и вернулся — задержка отсчитывается заново', () => {
    const tutorial = new Tutorial(['merge'], rules);
    tutorial.update(0.9, state({ mergePair: [0, 1] }));
    tutorial.update(0.9, state());

    expect(tutorial.update(0.9, state({ mergePair: [0, 1] }))).toBeNull();
    expect(tutorial.update(0.9, state({ mergePair: [0, 1] }))).toBeNull();
    expect(tutorial.update(0.2, state({ mergePair: [0, 1] }))?.step).toBe('merge');
  });
});

describe('Tutorial: лимит, продажа и стройка', () => {
  it('лимит: показывает на кнопку призыва, когда призывы волны кончились', () => {
    const tutorial = new Tutorial(['limit'], rules);

    expect(settled(tutorial, state())).toBeNull();
    expect(settled(tutorial, state({ limitSpent: true }))).toEqual({ step: 'limit', target: 'summonButton' });
  });

  it('про лимит рассказывает один раз за бой: после новой волны подсказка не возвращается', () => {
    const tutorial = new Tutorial(['limit'], rules);
    settled(tutorial, state({ limitSpent: true }));
    // Началась волна — лимит обновился.
    expect(settled(tutorial, state())).toBeNull();

    expect(settled(tutorial, state({ limitSpent: true }))).toBeNull();
  });

  it('лимит кончился и обновился раньше, чем подсказка появилась, — она ещё впереди', () => {
    const tutorial = new Tutorial(['limit'], rules);
    tutorial.update(0.5, state({ limitSpent: true }));
    tutorial.update(0.5, state());

    expect(settled(tutorial, state({ limitSpent: true }))?.step).toBe('limit');
  });

  it('слияние важнее лимита: сначала игрок учится сливать', () => {
    const tutorial = new Tutorial(['summon', 'merge', 'limit'], rules);
    const both = state({ summons: 4, limitSpent: true, mergePair: [0, 1] });

    expect(settled(tutorial, both)?.step).toBe('merge');
    expect(settled(tutorial, { ...both, merges: 1, mergePair: null })?.step).toBe('limit');
  });

  it('продажа: показывает кота без пары, пока игрок ничего не продал', () => {
    const tutorial = new Tutorial(['sell'], rules);

    expect(settled(tutorial, state({ sellSlot: 4 }))).toEqual({ step: 'sell', from: 4 });
    expect(settled(tutorial, state({ sellSlot: 4, sales: 1 }))).toBeNull();
  });

  it('пока игрок что-то держит в руке, про продажу не подсказывает', () => {
    expect(settled(new Tutorial(['sell'], rules), state({ sellSlot: 4, dragging: true }))).toBeNull();
  });

  it('стройка: показывает на кнопку, пока игрок ничего не построил и строить можно', () => {
    const tutorial = new Tutorial(['build'], rules);

    expect(settled(tutorial, state())).toBeNull();
    expect(settled(tutorial, state({ canBuild: true }))).toEqual({ step: 'build', target: 'buildButton' });
    expect(settled(tutorial, state({ canBuild: true, builds: 1 }))).toBeNull();
  });
});

describe('findSellSlot', () => {
  const cat = (level: number, invested = 10): Cat => ({ element: 'fire', level, cooldown: 0, ritual: 0, invested });
  const shop = { kind: 'shop' as const, level: 1, invested: 30, waves: 0 };

  it('пока свободных клеток хватает, продавать некого', () => {
    expect(findSellSlot([cat(1), cat(2), null, null], 1)).toBeNull();
  });

  it('на почти занятом поле выбирает кота, у которого нет соседа того же уровня', () => {
    expect(findSellSlot([cat(2), cat(2), cat(1), null], 1)).toBe(2);
  });

  it('из нескольких таких — самого дешёвого', () => {
    expect(findSellSlot([cat(3, 40), cat(2, 20), cat(1, 30)], 0)).toBe(1);
  });

  it('у всех есть пара по уровню — продавать некого', () => {
    expect(findSellSlot([cat(1), cat(1), cat(2), cat(2)], 0)).toBeNull();
  });

  it('строения и коты в ритуале не предлагаются', () => {
    expect(findSellSlot([shop, { ...cat(1), ritual: 2 }, cat(3), cat(3)], 0)).toBeNull();
  });
});

describe('findMergePair', () => {
  const merger = new Merge(cats, { maxCatLevel: 3, ritualTime: 4, crystalCost: 1 });
  const cat = (element: Cat['element'], level = 1, ritual = 0): Cat => ({ element, level, cooldown: 0, ritual, invested: 0 });

  it('находит двух одинаковых котов одного уровня', () => {
    const board = [cat('fire'), null, cat('water'), cat('fire', 2), cat('fire')];

    expect(findMergePair(board, merger, 0, false)).toEqual([0, 4]);
  });

  it('разные уровни, потолок уровня и ритуал парой не считаются', () => {
    expect(findMergePair([cat('fire'), cat('fire', 2)], merger, 0, false)).toBeNull();
    expect(findMergePair([cat('fire', 3), cat('fire', 3)], merger, 0, false)).toBeNull();
    expect(findMergePair([cat('fire'), cat('fire', 1, 2)], merger, 0, false)).toBeNull();
  });

  it('для гибрида находит разные стихии, если хватает кристаллов', () => {
    const board = [cat('fire'), cat('fire', 2), cat('water')];

    expect(findMergePair(board, merger, 1, true)).toEqual([0, 2]);
    expect(findMergePair(board, merger, 0, true)).toBeNull();
  });

  it('одинаковые коты — не пара для гибрида, разные — не пара для слияния', () => {
    expect(findMergePair([cat('fire'), cat('fire')], merger, 5, true)).toBeNull();
    expect(findMergePair([cat('fire'), cat('water')], merger, 5, false)).toBeNull();
  });
});

describe('densestPoint', () => {
  it('выбирает точку, вокруг которой больше всего соседей', () => {
    const points: Point[] = [[0, 0], [100, 100], [105, 100], [100, 108], [300, 0]];

    expect(densestPoint(points, 20)).toEqual([100, 100]);
  });

  it('для пустого списка — null', () => {
    expect(densestPoint([], 20)).toBeNull();
  });
});

describe('обучение в уровнях главы', () => {
  it('идёт на первых четырёх уровнях: призыв, слияние и лимит; гибрид и продажа; метеор; стройка', () => {
    expect(levels.levels.map((level) => level.tutorial?.steps ?? [])).toEqual([
      ['summon', 'merge', 'limit'],
      ['hybrid', 'sell'],
      ['meteor'],
      ['build'],
      ...Array<string[]>(6).fill([]),
    ]);
  });

  it('про стройку подсказывает первый уровень, где она открыта', () => {
    const first = levels.levels.findIndex((level) => (level.buildings ?? []).length > 0);

    expect(levels.levels[first].tutorial?.steps).toContain('build');
  });

  it('на уровне с гибридом игроку хватает кристаллов уже со старта', () => {
    expect(levels.levels[1].startCrystals).toBeGreaterThanOrEqual(1);
  });
});
