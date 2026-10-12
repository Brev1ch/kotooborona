import { describe, expect, it } from 'vitest';
import { enemies as enemiesJson } from '../data';
import type { EnemiesConfig, EnemyTypeId } from '../data';
import type { Enemy } from '../entities/Enemy';
import { Combat } from './Combat';
import { buildPath } from './Path';

// Числа зафиксированы здесь, чтобы тесты не зависели от правок баланса в JSON.
const type = { color: '#000000', hp: 1, speed: 40, gold: 2, radius: 8, shield: 0, crystalChance: 0, crystalDrop: 0 };
const enemies: EnemiesConfig = {
  ...enemiesJson,
  types: {
    mouse: { ...type, lifeDamage: 1 },
    rat: { ...type, lifeDamage: 2 },
    shield: { ...type, lifeDamage: 1 },
    boss: { ...type, lifeDamage: 5 },
  },
};

// Прямая дорога длиной 100 слева направо.
const path = buildPath([
  [0, 50],
  [100, 50],
]);

function enemy(type: EnemyTypeId = 'mouse', distance = 0, speed = 40): Enemy {
  return { type, distance, hp: 20, maxHp: 20, speed, gold: 2, shield: 0 };
}

function create(...list: Enemy[]): Combat {
  const combat = new Combat({ enemies, path });
  for (const item of list) combat.add(item);
  return combat;
}

describe('Combat: движение врагов', () => {
  it('враг проходит скорость × время', () => {
    const mouse = enemy('mouse', 10, 40);
    const combat = create(mouse);

    expect(combat.update(0.5)).toEqual([]);
    expect(mouse.distance).toBe(30);
  });

  it('враги идут каждый со своей скоростью', () => {
    const slow = enemy('rat', 0, 10);
    const fast = enemy('mouse', 0, 50);
    create(slow, fast).update(1);

    expect(slow.distance).toBe(10);
    expect(fast.distance).toBe(50);
  });

  it('враг, дошедший до конца дороги, снимается с поля и отнимает жизни', () => {
    const mouse = enemy('mouse', 90, 40);
    const combat = create(mouse);

    expect(combat.update(0.25)).toEqual([{ kind: 'leaked', enemy: mouse, lifeDamage: 1 }]);
    expect(combat.enemies).toEqual([]);
  });

  it('крыса и командир отнимают больше жизней', () => {
    const combat = create(enemy('rat', 99), enemy('boss', 99));

    expect(combat.update(0.25).map((event) => event.lifeDamage)).toEqual([2, 5]);
  });

  it('остальные враги продолжают идти', () => {
    const first = enemy('mouse', 95);
    const second = enemy('mouse', 20);
    const combat = create(first, second);
    combat.update(0.25);

    expect(combat.enemies).toEqual([second]);
    expect(second.distance).toBe(30);
  });
});
