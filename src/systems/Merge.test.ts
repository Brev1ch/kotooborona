import { describe, expect, it } from 'vitest';
import { cats } from '../data';
import type { ElementId } from '../data';
import type { Cat } from '../entities/Cat';
import { Merge } from './Merge';
import type { MergeRules } from './Merge';

// Числа зафиксированы здесь, чтобы тесты не зависели от правок баланса в JSON.
const rules: MergeRules = { maxCatLevel: 5, ritualTime: 4, crystalCost: 1 };
const merge = new Merge(cats, rules);

function cat(element: ElementId, level = 1, ritual = 0): Cat {
  return { element, level, cooldown: 0.7, ritual };
}

const elementIds = Object.keys(cats.elements) as ElementId[];
const hybridIds = elementIds.filter((id) => cats.elements[id].from);
const baseIds = elementIds.filter((id) => !cats.elements[id].from);

describe('Merge.isHybrid', () => {
  it('отличает гибриды от базовых стихий', () => {
    expect(merge.isHybrid('fire')).toBe(false);
    expect(merge.isHybrid('steam')).toBe(true);
  });
});

describe('Merge.check: слияние одинаковых', () => {
  it('два одинаковых кота дают кота уровнем выше', () => {
    expect(merge.check(cat('fire', 2), cat('fire', 2), 0)).toEqual({
      kind: 'merge',
      cat: { element: 'fire', level: 3, cooldown: 0, ritual: 0 },
      crystalCost: 0,
    });
  });

  it('коты разного уровня не сливаются', () => {
    expect(merge.check(cat('fire', 1), cat('fire', 2), 5)).toEqual({ kind: 'none' });
  });

  it('на максимальном уровне слияние заблокировано', () => {
    expect(merge.check(cat('fire', 5), cat('fire', 5), 5)).toEqual({
      kind: 'blocked',
      element: 'fire',
      reason: 'maxLevel',
    });
  });

  it('до максимального уровня дорасти можно', () => {
    const check = merge.check(cat('fire', 4), cat('fire', 4), 0);

    expect(check.kind === 'merge' && check.cat.level).toBe(5);
  });

  it('не меняет исходных котов', () => {
    const a = cat('fire', 2);
    const b = cat('water', 2);

    merge.check(a, b, 5);

    expect(a).toEqual(cat('fire', 2));
    expect(b).toEqual(cat('water', 2));
  });
});

describe('Merge.check: гибриды и кристаллы', () => {
  it('разные базовые стихии дают гибрида за кристалл и запускают ритуал', () => {
    expect(merge.check(cat('fire', 2), cat('water', 2), 1)).toEqual({
      kind: 'merge',
      cat: { element: 'steam', level: 3, cooldown: 0, ritual: 4 },
      crystalCost: 1,
    });
  });

  it('у каждого гибрида из конфига работает рецепт в обоих порядках', () => {
    expect(hybridIds.length).toBeGreaterThan(0);
    for (const id of hybridIds) {
      const [x, y] = cats.elements[id].from!;

      expect(merge.check(cat(x), cat(y), 1)).toMatchObject({ kind: 'merge', cat: { element: id } });
      expect(merge.check(cat(y), cat(x), 1)).toMatchObject({ kind: 'merge', cat: { element: id } });
    }
  });

  it('любая пара разных базовых стихий даёт гибрида', () => {
    for (const x of baseIds) {
      for (const y of baseIds) {
        if (x === y) continue;
        const check = merge.check(cat(x), cat(y), 1);

        expect(check.kind === 'merge' && merge.isHybrid(check.cat.element)).toBe(true);
      }
    }
  });

  it('без кристаллов смешение заблокировано', () => {
    expect(merge.check(cat('fire'), cat('water'), 0)).toEqual({
      kind: 'blocked',
      element: 'steam',
      reason: 'noCrystal',
    });
  });

  it('цена гибрида берётся из правил', () => {
    const pricey = new Merge(cats, { ...rules, crystalCost: 2 });

    expect(pricey.check(cat('fire'), cat('water'), 1)).toMatchObject({ kind: 'blocked', reason: 'noCrystal' });
    expect(pricey.check(cat('fire'), cat('water'), 2)).toMatchObject({ kind: 'merge', crystalCost: 2 });
  });

  it('на максимальном уровне причина блокировки — уровень, а не кристаллы', () => {
    expect(merge.check(cat('fire', 5), cat('water', 5), 0)).toMatchObject({ kind: 'blocked', reason: 'maxLevel' });
  });

  it('коты разного уровня не смешиваются', () => {
    expect(merge.check(cat('fire', 1), cat('water', 2), 5)).toEqual({ kind: 'none' });
  });

  it('одинаковые гибриды сливаются бесплатно и без ритуала', () => {
    expect(merge.check(cat('steam', 2), cat('steam', 2), 0)).toEqual({
      kind: 'merge',
      cat: { element: 'steam', level: 3, cooldown: 0, ritual: 0 },
      crystalCost: 0,
    });
  });

  it('гибрид не смешивается ни с базовой стихией, ни с другим гибридом', () => {
    expect(merge.check(cat('steam'), cat('fire'), 5)).toEqual({ kind: 'none' });
    expect(merge.check(cat('steam'), cat('earth'), 5)).toEqual({ kind: 'none' });
    expect(merge.check(cat('steam'), cat('lava'), 5)).toEqual({ kind: 'none' });
  });
});

describe('Merge.check: ритуал', () => {
  it('кот в ритуале не участвует в слиянии', () => {
    expect(merge.check(cat('steam', 2, 3), cat('steam', 2), 5)).toEqual({ kind: 'none' });
    expect(merge.check(cat('steam', 2), cat('steam', 2, 0.1), 5)).toEqual({ kind: 'none' });
  });
});

describe('Merge.drop', () => {
  it('кот остаётся на месте, если отпущен мимо клеток или над своей клеткой', () => {
    const board = [cat('fire'), cat('fire')];

    expect(merge.drop(board, 0, null, 5)).toEqual({ kind: 'stay' });
    expect(merge.drop(board, 0, 0, 5)).toEqual({ kind: 'stay' });
  });

  it('из пустой клетки тащить нечего', () => {
    expect(merge.drop([null, cat('fire')], 0, 1, 5)).toEqual({ kind: 'stay' });
  });

  it('кота в ритуале нельзя сдвинуть', () => {
    expect(merge.drop([cat('steam', 2, 3), null], 0, 1, 5)).toEqual({ kind: 'stay' });
  });

  it('в пустую клетку кот переезжает', () => {
    expect(merge.drop([cat('fire'), null], 0, 1, 5)).toEqual({ kind: 'move' });
  });

  it('клетка с котом в ритуале занята, даже если пара подошла бы', () => {
    expect(merge.drop([cat('steam', 2), cat('steam', 2, 3)], 0, 1, 5)).toEqual({ kind: 'busy' });
  });

  it('неподходящие коты меняются местами', () => {
    expect(merge.drop([cat('fire', 1), cat('fire', 2)], 0, 1, 5)).toEqual({ kind: 'swap' });
    expect(merge.drop([cat('steam'), cat('fire')], 0, 1, 5)).toEqual({ kind: 'swap' });
  });

  it('подходящая пара сливается', () => {
    expect(merge.drop([cat('fire'), null, cat('fire')], 0, 2, 0)).toEqual({
      kind: 'merge',
      cat: { element: 'fire', level: 2, cooldown: 0, ritual: 0 },
      crystalCost: 0,
    });
  });

  it('смешение стихий стоит кристалл и запускает ритуал', () => {
    expect(merge.drop([cat('earth'), cat('air')], 0, 1, 1)).toEqual({
      kind: 'merge',
      cat: { element: 'sand', level: 2, cooldown: 0, ritual: 4 },
      crystalCost: 1,
    });
  });

  it('заблокированная пара не меняется местами, а сообщает причину', () => {
    expect(merge.drop([cat('fire'), cat('water')], 0, 1, 0)).toEqual({
      kind: 'blocked',
      element: 'steam',
      reason: 'noCrystal',
    });
    expect(merge.drop([cat('fire', 5), cat('fire', 5)], 0, 1, 0)).toEqual({
      kind: 'blocked',
      element: 'fire',
      reason: 'maxLevel',
    });
  });

  it('не меняет поле', () => {
    const board = [cat('fire'), cat('water'), null];
    const before = structuredClone(board);

    merge.drop(board, 0, 1, 5);
    merge.drop(board, 0, 2, 5);

    expect(board).toEqual(before);
  });
});

describe('Merge.advanceRitual', () => {
  it('кота в строю не трогает', () => {
    const idle = cat('steam');

    expect(merge.advanceRitual(idle, 1)).toBe(false);
    expect(idle.ritual).toBe(0);
  });

  it('уменьшает оставшееся время ритуала', () => {
    const hybrid = cat('steam', 2, 4);

    expect(merge.advanceRitual(hybrid, 1.5)).toBe(false);
    expect(hybrid.ritual).toBe(2.5);
  });

  it('сообщает о завершении ровно один раз', () => {
    const hybrid = cat('steam', 2, 1);

    expect(merge.advanceRitual(hybrid, 1)).toBe(true);
    expect(hybrid.ritual).toBe(0);
    expect(merge.advanceRitual(hybrid, 1)).toBe(false);
  });

  it('не уводит время в минус при большом шаге', () => {
    const hybrid = cat('steam', 2, 0.5);

    expect(merge.advanceRitual(hybrid, 10)).toBe(true);
    expect(hybrid.ritual).toBe(0);
  });

  it('новый гибрид проходит ритуал за время из правил и после этого сливается', () => {
    const check = merge.check(cat('fire'), cat('water'), 1);
    if (check.kind !== 'merge') throw new Error('ожидалось слияние');
    const hybrid = check.cat;

    expect(merge.advanceRitual(hybrid, rules.ritualTime - 1)).toBe(false);
    expect(merge.check(hybrid, cat('steam', 2), 0)).toEqual({ kind: 'none' });
    expect(merge.advanceRitual(hybrid, 1)).toBe(true);
    expect(merge.check(hybrid, cat('steam', 2), 0)).toMatchObject({ kind: 'merge', cat: { level: 3 } });
  });
});
