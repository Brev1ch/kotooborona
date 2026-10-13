import { afterEach, describe, expect, it } from 'vitest';
import { random, restartRandom, seededRandom, seedRandom } from './Random';

describe('seededRandom', () => {
  it('одно зерно даёт одну и ту же последовательность', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);

    expect(Array.from({ length: 20 }, a)).toEqual(Array.from({ length: 20 }, b));
  });

  it('разные зёрна дают разные последовательности', () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });

  it('числа лежат в [0, 1) и не скапливаются в одной половине', () => {
    const random = seededRandom(7);
    const values = Array.from({ length: 2000 }, random);

    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    const low = values.filter((value) => value < 0.5).length;
    expect(low).toBeGreaterThan(900);
    expect(low).toBeLessThan(1100);
  });
});

describe('случайность игры', () => {
  afterEach(() => seedRandom(null));

  it('без зерна числа лежат в [0, 1)', () => {
    const values = Array.from({ length: 100 }, random);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('с зерном идёт по последовательности этого зерна', () => {
    seedRandom(5);
    expect(Array.from({ length: 10 }, random)).toEqual(Array.from({ length: 10 }, seededRandom(5)));
  });

  it('начало боя возвращает последовательность к началу', () => {
    seedRandom(5);
    const first = Array.from({ length: 10 }, random);
    restartRandom();

    expect(Array.from({ length: 10 }, random)).toEqual(first);
  });

  it('без зерна начало боя ничего не фиксирует, а сброс зерна возвращает обычную случайность', () => {
    seedRandom(5);
    seedRandom(null);
    restartRandom();
    const a = Array.from({ length: 5 }, random);
    restartRandom();

    expect(Array.from({ length: 5 }, random)).not.toEqual(a);
  });
});
