import { describe, expect, it } from 'vitest';
import { levels } from './index';

describe('строения по уровням', () => {
  it('на обучающих уровнях строить нельзя, дальше открыты все три', () => {
    const open = levels.levels.map((level) => [...(level.buildings ?? [])].sort());

    expect(open.slice(0, 3)).toEqual([[], [], []]);
    for (const kinds of open.slice(3)) expect(kinds).toEqual(['altar', 'mine', 'shop']);
  });
});
