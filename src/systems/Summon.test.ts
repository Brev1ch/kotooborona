import { describe, expect, it } from 'vitest';
import { cats } from '../data';
import type { Cat } from '../entities/Cat';
import { Summon } from './Summon';

/** Генератор, выдающий заданные числа по кругу. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function cat(): Cat {
  return { element: 'fire', level: 1, cooldown: 0, ritual: 0, invested: 0 };
}

const fireStaff = { fire: 3 };

describe('Summon.rollElement', () => {
  it('без посоха базовые стихии выпадают равновероятно', () => {
    const rolls = [0, 0.24, 0.25, 0.5, 0.75, 0.99];
    const summon = new Summon(cats, {}, sequence(...rolls));

    expect(rolls.map(() => summon.rollElement())).toEqual(['fire', 'fire', 'water', 'earth', 'air', 'air']);
  });

  it('никогда не выдаёт гибрид', () => {
    const rolls = Array.from({ length: 100 }, (_, i) => i / 100);
    const summon = new Summon(cats, fireStaff, sequence(...rolls));

    for (const _ of rolls) {
      expect(cats.elements[summon.rollElement()].from).toBeUndefined();
    }
  });

  it('посох увеличивает шанс своей стихии', () => {
    // Веса 3:1:1:1 — огню достаётся половина диапазона.
    const rolls = [0, 0.49, 0.5, 0.67, 0.84];
    const summon = new Summon(cats, fireStaff, sequence(...rolls));

    expect(rolls.map(() => summon.rollElement())).toEqual(['fire', 'fire', 'water', 'earth', 'air']);
  });

  it('вес гибрида в снаряжении не добавляет его в призыв', () => {
    const rolls = [0, 0.25, 0.5, 0.75];
    const summon = new Summon(cats, { steam: 5 }, sequence(...rolls));

    expect(rolls.map(() => summon.rollElement())).toEqual(['fire', 'water', 'earth', 'air']);
  });
});

describe('Summon.pickFreeSlot', () => {
  const board = [cat(), null, cat(), null];

  it('выбирает только свободные клетки', () => {
    const rolls = [0, 0.49, 0.5, 0.99];
    const summon = new Summon(cats, {}, sequence(...rolls));

    expect(rolls.map(() => summon.pickFreeSlot(board))).toEqual([1, 1, 3, 3]);
  });

  it('возвращает null, если поле занято', () => {
    const summon = new Summon(cats, {}, sequence(0));

    expect(summon.pickFreeSlot([cat(), cat()])).toBeNull();
    expect(summon.pickFreeSlot([])).toBeNull();
  });

  it('не выходит за границы, даже если генератор вернул 1', () => {
    const summon = new Summon(cats, {}, sequence(1));

    expect(summon.pickFreeSlot(board)).toBe(3);
  });
});

describe('Summon.summon', () => {
  it('выдаёт кота 1-го уровня в строю для свободной клетки', () => {
    // Первое число — клетка, второе — стихия.
    const summon = new Summon(cats, {}, sequence(0.5, 0.25));

    expect(summon.summon([cat(), null, cat(), null], 20)).toEqual({
      slot: 3,
      // Кот помнит, сколько за него заплачено.
      cat: { element: 'water', level: 1, cooldown: 0, ritual: 0, invested: 20 },
    });
  });

  it('не меняет поле', () => {
    const board = [null, cat(), null];
    const before = [...board];

    new Summon(cats, {}, sequence(0)).summon(board, 10);

    expect(board).toEqual(before);
  });

  it('возвращает null, если поле занято', () => {
    const summon = new Summon(cats, {}, sequence(0));

    expect(summon.summon([cat(), cat()], 10)).toBeNull();
  });
});

describe('Summon: шанс кота 2-го уровня от снаряжения', () => {
  it('бросок ниже шанса даёт кота 2-го уровня, выше — 1-го', () => {
    // Броски: клетка, стихия, уровень.
    const lucky = new Summon(cats, {}, sequence(0, 0, 0.09), 0.1);
    const unlucky = new Summon(cats, {}, sequence(0, 0, 0.1), 0.1);

    expect(lucky.summon([null], 10)?.cat).toMatchObject({ level: 2, invested: 10 });
    expect(unlucky.summon([null], 10)?.cat.level).toBe(1);
  });

  it('без шанса лишний бросок не делается: последовательность призывов та же, что без снаряжения', () => {
    let calls = 0;
    const counting = (): number => {
      calls++;
      return 0.5;
    };
    new Summon(cats, {}, counting).summon([null], 10);
    expect(calls).toBe(2);

    calls = 0;
    new Summon(cats, {}, counting, 0.2).summon([null], 10);
    expect(calls).toBe(3);
  });
});
