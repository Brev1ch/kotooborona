import { describe, expect, it } from 'vitest';
import { levelFish } from './Rewards';

const rules = { fishPerExtraStar: 0.25, replayMult: 0.4 };

describe('levelFish', () => {
  it('первая победа на одну звезду даёт награду уровня', () => {
    expect(levelFish(20, 1, true, rules)).toBe(20);
  });

  it('каждая звезда сверх первой прибавляет долю награды', () => {
    expect(levelFish(20, 2, true, rules)).toBe(25);
    expect(levelFish(20, 3, true, rules)).toBe(30);
  });

  it('повторное прохождение даёт меньше', () => {
    expect(levelFish(20, 1, false, rules)).toBe(8);
    expect(levelFish(20, 3, false, rules)).toBe(12);
  });

  it('округляет до целого и не опускается ниже одной рыбки', () => {
    expect(levelFish(7, 2, true, rules)).toBe(9);
    expect(levelFish(1, 1, false, rules)).toBe(1);
  });
});
