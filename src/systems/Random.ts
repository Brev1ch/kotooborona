/**
 * Повторяемый генератор случайных чисел (mulberry32): одно зерно — одна и та же последовательность.
 * Нужен симулятору: прогон уровня с тем же зерном всегда идёт одинаково. Возвращает числа в [0, 1).
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let seed: number | null = null;
let source: () => number = Math.random;

/**
 * Случайность самой игры: стихия призванного кота, состав волны, кристалл с врага, предмет из сундука.
 * Обычно это `Math.random`; смоук-проверка задаёт зерно, и тогда каждый бой идёт по одной и той же последовательности.
 */
export function random(): number {
  return source();
}

/** Задаёт зерно случайности игры; `null` возвращает `Math.random`. */
export function seedRandom(value: number | null): void {
  seed = value;
  restartRandom();
}

/** Начало боя: при заданном зерне последовательность начинается заново, так что бой не зависит от того, что было до него. */
export function restartRandom(): void {
  source = seed === null ? Math.random : seededRandom(seed);
}
