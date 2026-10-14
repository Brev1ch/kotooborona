import { describe, expect, it } from 'vitest';
import { enemies } from '.';

describe('походка врагов', () => {
  it.each(Object.entries(enemies.types))('%s: походка согласована с особенностями', (_type, config) => {
    // Летающий — качается в воздухе, копающий — уходит под землю, остальные идут вперевалку.
    const expected = config.flying ? 'hover' : config.burrow ? 'burrow' : 'waddle';
    expect(config.motion).toBe(expected);
  });
});
