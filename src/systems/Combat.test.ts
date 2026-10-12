import { describe, expect, it } from 'vitest';
import { cats as catsJson, enemies as enemiesJson } from '../data';
import type { CatsConfig, ElementId, EnemiesConfig, EnemyTypeId } from '../data';
import type { Cat } from '../entities/Cat';
import type { Enemy } from '../entities/Enemy';
import { catDamage, catRate, Combat, type CombatEvent } from './Combat';
import { buildPath } from './Path';

// Числа зафиксированы здесь, чтобы тесты не зависели от правок баланса в JSON.
const cats: CatsConfig = {
  ...catsJson,
  baseDamage: 10,
  levelDamageMult: 2,
  hybridDamageMult: 1.5,
  baseRate: 1,
  ratePerLevel: 0.5,
  baseRange: 50,
  rangePerLevel: 10,
  projectileSpeed: 200,
  hitRadiusMult: 0.5,
  targetMargin: 5,
  elements: {
    ...catsJson.elements,
    fire: { ...catsJson.elements.fire, dmg: 1, rate: 1 },
    earth: { ...catsJson.elements.earth, dmg: 2, rate: 0.5 },
    steam: { ...catsJson.elements.steam, dmg: 1, rate: 1 },
  },
};

const type = { color: '#000000', hp: 1, speed: 40, gold: 2, radius: 8, shield: 0, crystalChance: 0, crystalDrop: 0 };
const enemies: EnemiesConfig = {
  ...enemiesJson,
  types: {
    mouse: { ...type, lifeDamage: 1 },
    rat: { ...type, lifeDamage: 2, crystalChance: 0.3, crystalDrop: 1 },
    shield: { ...type, lifeDamage: 1 },
    boss: { ...type, lifeDamage: 5, crystalChance: 1, crystalDrop: 2 },
  },
};

// Прямая дорога слева направо на высоте 50; поле 100×100, дорога выходит за его края на 20.
const path = buildPath([
  [-20, 50],
  [120, 50],
]);
const bounds = { width: 100, height: 100 };
// Клетка 0 — над серединой дороги, клетка 1 — под ней. У кота 1-го уровня радиус 60.
const slots: [number, number][] = [
  [50, 20],
  [50, 80],
];
/** Расстояние по дороге до точки прямо под клеткой 0. */
const MIDDLE = 70;
const DT = 0.05;

function enemy(type: EnemyTypeId = 'mouse', distance = 0, overrides: Partial<Enemy> = {}): Enemy {
  return { type, distance, hp: 20, maxHp: 20, speed: 0, gold: 2, shield: 0, ...overrides };
}

function cat(element: ElementId = 'fire', level = 1, overrides: Partial<Cat> = {}): Cat {
  return { element, level, cooldown: 0, ritual: 0, ...overrides };
}

function create(list: Enemy[], roll = 0.99): Combat {
  const combat = new Combat({ cats, enemies, path, slots, bounds, rng: () => roll });
  for (const item of list) combat.add(item);
  return combat;
}

/** Прокручивает бой и возвращает все события. */
function run(combat: Combat, board: (Cat | null)[], seconds: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) events.push(...combat.update(DT, board));
  return events;
}

function ofKind<K extends CombatEvent['kind']>(events: CombatEvent[], kind: K): Extract<CombatEvent, { kind: K }>[] {
  return events.filter((event): event is Extract<CombatEvent, { kind: K }> => event.kind === kind);
}

describe('Combat: движение врагов', () => {
  it('враг проходит скорость × время', () => {
    const mouse = enemy('mouse', 10, { speed: 40 });
    const combat = create([mouse]);

    expect(combat.update(0.5, [])).toEqual([]);
    expect(mouse.distance).toBe(30);
  });

  it('враги идут каждый со своей скоростью', () => {
    const slow = enemy('rat', 0, { speed: 10 });
    const fast = enemy('mouse', 0, { speed: 50 });
    create([slow, fast]).update(1, []);

    expect(slow.distance).toBe(10);
    expect(fast.distance).toBe(50);
  });

  it('враг, дошедший до конца дороги, снимается с поля и отнимает жизни', () => {
    const mouse = enemy('mouse', 130, { speed: 40 });
    const combat = create([mouse]);

    expect(combat.update(0.25, [])).toEqual([{ kind: 'leaked', enemy: mouse, lifeDamage: 1 }]);
    expect(combat.enemies).toEqual([]);
  });

  it('крыса и командир отнимают больше жизней', () => {
    const combat = create([enemy('rat', 139, { speed: 40 }), enemy('boss', 139, { speed: 40 })]);

    expect(ofKind(combat.update(0.25, []), 'leaked').map((event) => event.lifeDamage)).toEqual([2, 5]);
  });

  it('остальные враги продолжают идти', () => {
    const first = enemy('mouse', 135, { speed: 40 });
    const second = enemy('mouse', 20, { speed: 40 });
    const combat = create([first, second]);
    combat.update(0.25, []);

    expect(combat.enemies).toEqual([second]);
    expect(second.distance).toBe(30);
  });
});

describe('характеристики кота', () => {
  it('урон растёт с уровнем и зависит от стихии', () => {
    expect(catDamage(cats, cat('fire', 1))).toBe(10);
    expect(catDamage(cats, cat('fire', 3))).toBe(40);
    expect(catDamage(cats, cat('earth', 1))).toBe(20);
  });

  it('гибрид получает бонус к урону', () => {
    expect(catDamage(cats, cat('steam', 2))).toBe(30);
  });

  it('скорострельность растёт с уровнем и зависит от стихии', () => {
    expect(catRate(cats, cat('fire', 1))).toBe(1.5);
    expect(catRate(cats, cat('fire', 2))).toBe(2);
    expect(catRate(cats, cat('earth', 2))).toBe(1);
  });
});

describe('Combat: выстрел', () => {
  it('кот стреляет по врагу в радиусе и уходит на перезарядку', () => {
    const mouse = enemy('mouse', MIDDLE);
    const shooter = cat('fire', 2);
    const combat = create([mouse]);

    const [shot] = ofKind(combat.update(DT, [shooter, null]), 'shot');

    expect(shot.slot).toBe(0);
    expect(shot.projectile).toMatchObject({ target: mouse, damage: 20, element: 'fire' });
    expect(combat.projectiles).toEqual([shot.projectile]);
    // 1 / скорострельность 2.
    expect(shooter.cooldown).toBe(0.5);
  });

  it('снаряд вылетает из клетки кота', () => {
    const combat = create([enemy('mouse', MIDDLE)]);

    const [shot] = ofKind(combat.update(0, [null, cat()]), 'shot');

    expect(shot.slot).toBe(1);
    expect([shot.projectile.x, shot.projectile.y]).toEqual([50, 80]);
  });

  it('по врагу вне радиуса кот не стреляет и не тратит перезарядку', () => {
    // Враг в точке (0, 50): до клетки 0 около 58 — в радиусе; в (−4, 50) — уже около 62.
    const shooter = cat();
    const combat = create([enemy('mouse', 16)]);

    expect(run(combat, [shooter], 1)).toEqual([]);
    expect(shooter.cooldown).toBe(0);
  });

  it('радиус растёт с уровнем кота', () => {
    const combat = create([enemy('mouse', 16)]);

    expect(ofKind(combat.update(DT, [cat('fire', 2)]), 'shot')).toHaveLength(1);
  });

  it('из нескольких врагов выбирает того, кто прошёл дальше', () => {
    const behind = enemy('mouse', 50);
    const ahead = enemy('mouse', 90);
    const combat = create([behind, ahead, enemy('mouse', 70)]);

    const [shot] = ofKind(combat.update(DT, [cat()]), 'shot');

    expect(shot.projectile.target).toBe(ahead);
  });

  it('врага за краем поля не видит, даже если он в радиусе', () => {
    // Клетка у левого края: враг в (−10, 50) в радиусе, но ещё не вышел на поле.
    const combat = new Combat({ cats, enemies, path, slots: [[10, 50]], bounds, rng: () => 0.99 });
    const hidden = enemy('mouse', 10);
    combat.add(hidden);

    expect(combat.update(DT, [cat()])).toEqual([]);

    hidden.distance = 16;
    expect(ofKind(combat.update(DT, [cat()]), 'shot')).toHaveLength(1);
  });

  it('следующий выстрел — только после перезарядки', () => {
    const combat = create([enemy('mouse', MIDDLE, { hp: 1000 })]);
    const board = [cat('fire', 2)];

    // Скорострельность 2: выстрелы примерно в 0 с, 0.5 с и 1 с.
    expect(ofKind(run(combat, board, 0.4), 'shot')).toHaveLength(1);
    expect(ofKind(run(combat, board, 0.3), 'shot')).toHaveLength(1);
    expect(ofKind(run(combat, board, 0.5), 'shot')).toHaveLength(1);
  });

  it('кот в ритуале не стреляет и не перезаряжается', () => {
    const busy = cat('fire', 1, { ritual: 2, cooldown: 0.3 });
    const combat = create([enemy('mouse', MIDDLE)]);

    expect(run(combat, [busy], 1)).toEqual([]);
    expect(busy.cooldown).toBe(0.3);
  });

  it('каждый кот на поле стреляет сам', () => {
    const combat = create([enemy('mouse', MIDDLE)]);

    const shots = ofKind(combat.update(DT, [cat('fire'), cat('earth')]), 'shot');

    expect(shots.map((shot) => shot.slot)).toEqual([0, 1]);
  });
});

describe('Combat: попадание', () => {
  it('снаряд долетает до цели и наносит урон', () => {
    const mouse = enemy('mouse', MIDDLE);
    const combat = create([mouse]);

    const events = run(combat, [cat()], 0.3);

    expect(ofKind(events, 'hit')).toEqual([{ kind: 'hit', enemy: mouse, x: 50, y: 50, element: 'fire' }]);
    expect(mouse.hp).toBe(10);
    expect(combat.projectiles).toEqual([]);
  });

  it('снаряд летит с заданной скоростью', () => {
    const combat = create([enemy('mouse', MIDDLE)]);

    const [shot] = ofKind(combat.update(DT, [cat()]), 'shot');

    // 200 в секунду × 0.05 с = 10 вниз от клетки (50, 20).
    expect([shot.projectile.x, shot.projectile.y]).toEqual([50, 30]);
  });

  it('снаряд догоняет движущуюся цель', () => {
    const mouse = enemy('mouse', MIDDLE, { speed: 40 });
    const combat = create([mouse]);

    expect(ofKind(run(combat, [cat()], 0.5), 'hit')).toHaveLength(1);
  });

  it('щит принимает попадание на себя', () => {
    const bearer = enemy('shield', MIDDLE, { shield: 2 });
    const combat = create([bearer]);

    const events = run(combat, [cat()], 0.3);

    expect(ofKind(events, 'blocked')).toEqual([{ kind: 'blocked', enemy: bearer, x: 50, y: 50 }]);
    expect(ofKind(events, 'hit')).toEqual([]);
    expect(bearer.shield).toBe(1);
    expect(bearer.hp).toBe(20);
  });

  it('когда щит разбит, урон проходит', () => {
    const bearer = enemy('shield', MIDDLE, { shield: 1 });
    const combat = create([bearer]);

    // Два выстрела: первый снимает щит, второй ранит.
    const events = run(combat, [cat('fire', 2)], 0.8);

    expect(ofKind(events, 'blocked')).toHaveLength(1);
    expect(ofKind(events, 'hit')).toHaveLength(1);
    expect(bearer.shield).toBe(0);
    expect(bearer.hp).toBe(0);
  });
});

describe('Combat: убийство', () => {
  it('убитый враг снимается с поля и отдаёт монеты', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 10, gold: 7 });
    const combat = create([mouse]);

    const events = run(combat, [cat()], 0.3);

    expect(ofKind(events, 'killed')).toEqual([{ kind: 'killed', enemy: mouse, x: 50, y: 50, gold: 7, crystals: 0 }]);
    expect(combat.enemies).toEqual([]);
  });

  it('крыса роняет кристалл, если бросок меньше шанса', () => {
    const lucky = create([enemy('rat', MIDDLE, { hp: 10 })], 0.29);
    const unlucky = create([enemy('rat', MIDDLE, { hp: 10 })], 0.3);

    expect(ofKind(run(lucky, [cat()], 0.3), 'killed')[0].crystals).toBe(1);
    expect(ofKind(run(unlucky, [cat()], 0.3), 'killed')[0].crystals).toBe(0);
  });

  it('командир роняет кристаллы всегда', () => {
    const combat = create([enemy('boss', MIDDLE, { hp: 10 })], 0.99);

    expect(ofKind(run(combat, [cat()], 0.3), 'killed')[0].crystals).toBe(2);
  });

  it('снаряд, летевший в уже убитого врага, пропадает', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 10 });
    const combat = create([mouse]);

    // Оба кота стреляют одновременно, первому попаданию хватает урона.
    const events = run(combat, [cat(), cat()], 0.3);

    expect(ofKind(events, 'shot')).toHaveLength(2);
    expect(ofKind(events, 'hit')).toHaveLength(1);
    expect(ofKind(events, 'killed')).toHaveLength(1);
    expect(combat.projectiles).toEqual([]);
  });

  it('снаряд, летевший во врага, который ушёл в ворота, пропадает', () => {
    // Враг у правого края поля, на границе радиуса: снаряду лететь далеко.
    const runner = enemy('mouse', 120);
    const combat = create([runner]);
    const board = [cat()];

    const events = combat.update(DT, board);
    runner.speed = 1000;
    events.push(...combat.update(DT, board));

    expect(ofKind(events, 'shot')).toHaveLength(1);
    expect(ofKind(events, 'leaked')).toHaveLength(1);
    expect(ofKind(events, 'hit')).toEqual([]);
    expect(combat.projectiles).toEqual([]);
  });

  it('после убийства кот переключается на следующего врага', () => {
    const first = enemy('mouse', 90, { hp: 10 });
    const second = enemy('mouse', 50);
    const combat = create([first, second]);

    const shots = ofKind(run(combat, [cat()], 1), 'shot');

    expect(shots.map((shot) => shot.projectile.target)).toEqual([first, second]);
  });
});
