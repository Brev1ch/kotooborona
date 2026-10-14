import { describe, expect, it } from 'vitest';
import { enemies } from '.';

describe('походка врагов', () => {
  it.each(Object.entries(enemies.types))('%s: походка согласована с особенностями', (_type, config) => {
    // Летающий — качается в воздухе, копающий — уходит под землю, остальные идут вперевалку, король — тяжело.
    const expected = config.flying ? ['hover'] : config.burrow ? ['burrow'] : ['waddle', 'heavy'];
    expect(expected).toContain(config.motion);
  });
});

it('король ходит тяжело', () => {
  expect(enemies.types.king.motion).toBe('heavy');
});

it('до ворот дошёл враг — минус одна жизнь, Крысиный король — минус три', () => {
  for (const [type, config] of Object.entries(enemies.types)) {
    expect(config.livesCost ?? 1, type).toBe(type === 'king' ? 3 : 1);
  }
});
