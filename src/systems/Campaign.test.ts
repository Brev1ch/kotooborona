import { describe, expect, it } from 'vitest';
import { campaignTiles } from './Campaign';

function starsFrom(stars: Record<string, number>): (levelId: string) => number {
  return (levelId) => stars[levelId] ?? 0;
}

describe('campaignTiles', () => {
  it('в новой игре открыт только первый уровень', () => {
    const tiles = campaignTiles(['a', 'b', 'c'], 3, starsFrom({}));

    expect(tiles).toEqual([
      { number: 1, levelId: 'a', unlocked: true, stars: 0 },
      { number: 2, levelId: 'b', unlocked: false, stars: 0 },
      { number: 3, levelId: 'c', unlocked: false, stars: 0 },
    ]);
  });

  it('пройденный уровень открывает следующий и показывает свои звёзды', () => {
    const tiles = campaignTiles(['a', 'b', 'c'], 3, starsFrom({ a: 2 }));

    expect(tiles.map((tile) => tile.unlocked)).toEqual([true, true, false]);
    expect(tiles.map((tile) => tile.stars)).toEqual([2, 0, 0]);
  });

  it('уровень не открывается через непройденный', () => {
    const tiles = campaignTiles(['a', 'b', 'c'], 3, starsFrom({ a: 1, c: 3 }));

    expect(tiles.map((tile) => tile.unlocked)).toEqual([true, true, false]);
  });

  it('уровни, которых ещё нет в игре, закрыты, даже если предыдущий пройден', () => {
    const tiles = campaignTiles(['a'], 4, starsFrom({ a: 3 }));

    expect(tiles).toEqual([
      { number: 1, levelId: 'a', unlocked: true, stars: 3 },
      { number: 2, levelId: null, unlocked: false, stars: 0 },
      { number: 3, levelId: null, unlocked: false, stars: 0 },
      { number: 4, levelId: null, unlocked: false, stars: 0 },
    ]);
  });

  it('показывает все уровни, если их больше, чем заявлено в главе', () => {
    expect(campaignTiles(['a', 'b', 'c'], 2, starsFrom({}))).toHaveLength(3);
  });
});
