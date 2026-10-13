import type { RewardRules } from '../data/types';

/**
 * Рыбки за пройденный уровень. `base` — награда уровня за первую победу на одну звезду;
 * каждая звезда сверх первой прибавляет долю, повторное прохождение даёт меньше. Не меньше одной рыбки.
 */
export function levelFish(base: number, stars: number, firstClear: boolean, rules: RewardRules): number {
  const withStars = base * (1 + rules.fishPerExtraStar * Math.max(0, stars - 1));
  return Math.max(1, Math.round(withStars * (firstClear ? 1 : rules.replayMult)));
}
