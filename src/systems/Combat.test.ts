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
  // У всех стихий множители 1, кроме каменного: гибрид 1-го уровня бьёт на 15, базовый кот — на 10.
  elements: {
    ...(Object.fromEntries(
      Object.entries(catsJson.elements).map(([id, element]) => [id, { ...element, dmg: 1, rate: 1 }]),
    ) as CatsConfig['elements']),
    earth: { ...catsJson.elements.earth, dmg: 2, rate: 0.5 },
  },
  effects: {
    burn: { burnDps: 0.5, burnTime: 2 },
    slow: { slowFactor: 0.5, slowTime: 1 },
    heavy: {},
    none: {},
    splash_slow: { slowFactor: 0.6, slowTime: 1, splashRadius: 20, splashDamage: 0.5 },
    splash_burn: { burnDps: 0.4, burnTime: 2, splashRadius: 20, splashDamage: 0.5, splashBurnDps: 0.2 },
    chain: { jumps: 2, jumpRadius: 30, jumpDamage: 0.5 },
    freeze: { slowFactor: 0.2, slowTime: 1 },
    poison: { poisonDps: 0.5, poisonCap: 1.2, poisonTime: 3 },
    aura: {},
  },
};

const type = { color: '#000000', hp: 1, speed: 40, gold: 2, radius: 8, shield: 0, crystalChance: 0, crystalDrop: 0 };
const enemies: EnemiesConfig = {
  ...enemiesJson,
  bossSlowResist: 0.5,
  types: {
    mouse: { ...type, lifeDamage: 1 },
    rat: { ...type, lifeDamage: 2, crystalChance: 0.3, crystalDrop: 1 },
    shield: { ...type, lifeDamage: 1 },
    boss: { ...type, lifeDamage: 5, crystalChance: 1, crystalDrop: 2, slowResist: true },
    king: { ...type, lifeDamage: 20, slowResist: true, summon: { type: 'mouse', count: 2, interval: 2, spread: 10 } },
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
  return {
    type,
    distance,
    hp: 20,
    maxHp: 20,
    speed: 0,
    gold: 2,
    shield: 0,
    slowFactor: 1,
    slowTime: 0,
    burnDps: 0,
    burnTime: 0,
    poisonDps: 0,
    poisonTime: 0,
    ...overrides,
  };
}

/** По умолчанию ветряной: бьёт без побочных эффектов. */
function cat(element: ElementId = 'air', level = 1, overrides: Partial<Cat> = {}): Cat {
  return { element, level, cooldown: 0, ritual: 0, invested: 0, ...overrides };
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

    expect(ofKind(events, 'hit')).toEqual([{ kind: 'hit', enemy: mouse, x: 50, y: 50, element: 'air' }]);
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
    const events = run(combat, [cat('air', 2)], 0.8);

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

/** Один кот в клетке 0 делает один выстрел, и снаряд долетает (перезарядка 0.67 с, полёт 0.15 с). */
function oneHit(combat: Combat, element: ElementId): CombatEvent[] {
  return run(combat, [cat(element)], 0.3);
}

describe('Combat: огонь', () => {
  it('огненный кот поджигает: доля урона попадания в секунду', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 100 });
    const combat = create([mouse]);

    combat.update(DT, [cat('fire')]);
    run(combat, [], 0.1);

    // Попадание на 10 → огонь 5 в секунду на 2 с.
    expect(mouse).toMatchObject({ hp: 90, burnDps: 5, burnTime: 2 });
  });

  it('огонь наносит урон со временем и гаснет', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 100, burnDps: 5, burnTime: 2 });
    const combat = create([mouse]);

    run(combat, [], 1);
    expect(mouse.hp).toBeCloseTo(95);

    run(combat, [], 3);
    expect(mouse.hp).toBeCloseTo(90);
  });

  it('огонь жжёт мимо щита', () => {
    const bearer = enemy('shield', MIDDLE, { hp: 100, shield: 5 });
    const combat = create([bearer]);

    oneHit(combat, 'fire');
    run(combat, [], 1);

    expect(bearer.shield).toBe(4);
    expect(bearer.hp).toBeLessThan(100);
  });

  it('враг, сгоревший от огня, тоже даёт награду', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 1, gold: 4, burnDps: 5, burnTime: 2 });
    const combat = create([mouse]);

    const events = run(combat, [], 1);

    expect(ofKind(events, 'killed')).toEqual([{ kind: 'killed', enemy: mouse, x: 50, y: 50, gold: 4, crystals: 0 }]);
    expect(combat.enemies).toEqual([]);
  });

  it('слабый огонь не сбивает сильный, но продлевает его', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 1000, burnDps: 50, burnTime: 1 });
    const combat = create([mouse]);

    combat.update(DT, [cat('fire')]);
    run(combat, [], 0.1);

    expect(mouse).toMatchObject({ burnDps: 50, burnTime: 2 });
  });

  it('погасший огонь не возвращается с прежней силой', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 1000, burnDps: 50, burnTime: 0 });
    const combat = create([mouse]);

    oneHit(combat, 'fire');

    expect(mouse.burnDps).toBe(5);
  });
});

describe('Combat: замедление', () => {
  it('водный кот замедляет', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 100 });
    const combat = create([mouse]);

    combat.update(DT, [cat('water')]);
    run(combat, [], 0.1);

    expect(mouse).toMatchObject({ hp: 90, slowFactor: 0.5, slowTime: 1 });
  });

  it('ледяной кот почти останавливает', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 100 });
    const combat = create([mouse]);

    oneHit(combat, 'ice');

    expect(mouse.slowFactor).toBe(0.2);
  });

  it('замедленный враг идёт медленнее, пока действует эффект', () => {
    const mouse = enemy('mouse', 0, { speed: 40, slowFactor: 0.5, slowTime: 1 });
    const combat = create([mouse]);

    run(combat, [], 0.5);
    expect(mouse.distance).toBeCloseTo(10);

    run(combat, [], 1);
    expect(mouse.slowFactor).toBe(1);
    const before = mouse.distance;
    run(combat, [], 1);
    expect(mouse.distance - before).toBeCloseTo(40);
  });

  it('слабое замедление не сбивает сильное', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 100, slowFactor: 0.2, slowTime: 5 });
    const combat = create([mouse]);

    oneHit(combat, 'water');

    expect(mouse.slowFactor).toBe(0.2);
  });

  it('командир замедляется вдвое слабее', () => {
    const boss = enemy('boss', MIDDLE, { hp: 100 });
    const combat = create([boss]);

    oneHit(combat, 'water');

    expect(boss.slowFactor).toBe(0.75);
  });
});

describe('Combat: каменный и ветряной', () => {
  it('бьют без побочных эффектов', () => {
    for (const element of ['earth', 'air'] as const) {
      const mouse = enemy('mouse', MIDDLE, { hp: 100 });
      const neighbour = enemy('mouse', MIDDLE - 5, { hp: 100 });
      const combat = create([mouse, neighbour]);

      const events = oneHit(combat, element);

      expect(ofKind(events, 'hit')).toHaveLength(1);
      expect(mouse).toMatchObject({ slowTime: 0, burnTime: 0, poisonTime: 0 });
      expect(neighbour.hp).toBe(100);
    }
  });
});

describe('Combat: урон по площади', () => {
  /** Цель под клеткой, сосед в 10 от неё, дальний — в 30 (радиус взрыва 20). */
  function trio(): [Enemy, Enemy, Enemy] {
    return [
      enemy('mouse', MIDDLE, { hp: 100 }),
      enemy('shield', MIDDLE - 10, { hp: 100, shield: 3 }),
      enemy('mouse', MIDDLE - 30, { hp: 100 }),
    ];
  }

  it('паровой кот: облако ранит и замедляет соседей', () => {
    const [target, neighbour, far] = trio();
    const combat = create([target, neighbour, far]);

    const events = oneHit(combat, 'steam');

    expect(target).toMatchObject({ hp: 85, slowFactor: 0.6 });
    // Половина урона, мимо щита.
    expect(neighbour).toMatchObject({ hp: 92.5, shield: 3, slowFactor: 0.6 });
    expect(far).toMatchObject({ hp: 100, slowFactor: 1 });
    expect(ofKind(events, 'splash')).toEqual([{ kind: 'splash', x: 50, y: 50, radius: 20, element: 'steam' }]);
  });

  it('лавовый кот: взрыв ранит и поджигает соседей', () => {
    const [target, neighbour, far] = trio();
    const combat = create([target, neighbour, far]);

    combat.update(DT, [cat('lava')]);
    run(combat, [], 0.1);

    expect(target).toMatchObject({ hp: 85, burnDps: 6 });
    expect(neighbour).toMatchObject({ hp: 92.5, burnDps: 3, burnTime: 2 });
    expect(far).toMatchObject({ hp: 100, burnTime: 0 });
  });

  it('сосед, убитый взрывом, даёт награду', () => {
    const neighbour = enemy('mouse', MIDDLE - 10, { hp: 5 });
    const combat = create([enemy('mouse', MIDDLE, { hp: 100 }), neighbour]);

    const killed = ofKind(oneHit(combat, 'lava'), 'killed');

    expect(killed.map((event) => event.enemy)).toEqual([neighbour]);
  });
});

describe('Combat: цепная молния', () => {
  it('грозовой кот: молния перескакивает на соседей с ослабленным уроном', () => {
    const target = enemy('mouse', MIDDLE, { hp: 100 });
    const second = enemy('mouse', MIDDLE - 10, { hp: 100 });
    const third = enemy('mouse', MIDDLE - 25, { hp: 100 });
    const fourth = enemy('mouse', MIDDLE - 40, { hp: 100 });
    const combat = create([target, second, third, fourth]);

    const events = oneHit(combat, 'storm');

    // Два прыжка по 50% урона; на третьего соседа прыжков не хватает.
    expect([target.hp, second.hp, third.hp, fourth.hp]).toEqual([85, 92.5, 92.5, 100]);
    expect(ofKind(events, 'chain')).toEqual([
      { kind: 'chain', from: [50, 50], to: [40, 50], element: 'storm' },
      { kind: 'chain', from: [40, 50], to: [25, 50], element: 'storm' },
    ]);
  });

  it('молния не прыгает дальше своего радиуса', () => {
    const target = enemy('mouse', MIDDLE, { hp: 100 });
    const far = enemy('mouse', MIDDLE - 31, { hp: 100 });
    const combat = create([target, far]);

    expect(ofKind(oneHit(combat, 'storm'), 'chain')).toEqual([]);
    expect(far.hp).toBe(100);
  });

  it('прыжок молнии — прямое попадание: щит его принимает', () => {
    const bearer = enemy('shield', MIDDLE - 10, { hp: 100, shield: 2 });
    const combat = create([enemy('mouse', MIDDLE, { hp: 100 }), bearer]);

    oneHit(combat, 'storm');

    expect(bearer).toMatchObject({ hp: 100, shield: 1 });
  });
});

describe('Combat: яд', () => {
  it('болотный кот: яд копится от попадания к попаданию до потолка', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 10000 });
    const combat = create([mouse]);
    const board = [cat('swamp')];
    const doses: number[] = [];
    for (let i = 0; i < 4; i++) {
      // Перезарядка 0.67 с: в каждое окно попадает ровно один снаряд.
      run(combat, board, 0.65);
      doses.push(mouse.poisonDps);
    }

    // Попадание на 15: +7.5 в секунду за каждое, потолок 15 × 1.2.
    expect(doses).toEqual([7.5, 15, 18, 18]);
  });

  it('яд наносит урон со временем и выветривается', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 100, poisonDps: 10, poisonTime: 2 });
    const combat = create([mouse]);

    run(combat, [], 4);

    expect(mouse.hp).toBeCloseTo(80);
    expect(mouse.poisonDps).toBe(0);
  });

  it('слабый яд не сбивает сильный, но продлевает его', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 10000, poisonDps: 100, poisonTime: 0.5 });
    const combat = create([mouse]);

    combat.update(DT, [cat('swamp')]);
    run(combat, [], 0.1);

    expect(mouse).toMatchObject({ poisonDps: 100, poisonTime: 3 });
  });

  it('враг, умирающий сразу от огня и яда, считается убитым один раз', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 1, burnDps: 100, burnTime: 2, poisonDps: 100, poisonTime: 2 });
    const combat = create([mouse]);

    expect(ofKind(run(combat, [], 0.5), 'killed')).toHaveLength(1);
  });
});

describe('Combat: буря', () => {
  it('песчаный кот бьёт всех в радиусе сразу, без снаряда', () => {
    const near = enemy('mouse', MIDDLE, { hp: 100 });
    const alsoNear = enemy('mouse', MIDDLE - 20, { hp: 100 });
    const far = enemy('mouse', MIDDLE - 60, { hp: 100 });
    const storm = cat('sand');
    const combat = create([near, alsoNear, far]);

    const events = combat.update(DT, [storm]);

    expect(ofKind(events, 'aura')).toEqual([{ kind: 'aura', slot: 0, radius: 60, element: 'sand' }]);
    expect(ofKind(events, 'shot')).toEqual([]);
    expect(combat.projectiles).toEqual([]);
    expect([near.hp, alsoNear.hp, far.hp]).toEqual([85, 85, 100]);
    expect(storm.cooldown).toBeCloseTo(1 / 1.5);
  });

  it('буря не поднимается, пока в радиусе никого нет', () => {
    const storm = cat('sand');
    const combat = create([enemy('mouse', MIDDLE - 60)]);

    expect(run(combat, [storm], 1)).toEqual([]);
    expect(storm.cooldown).toBe(0);
  });

  it('удар бури — прямое попадание: щит его принимает', () => {
    const bearer = enemy('shield', MIDDLE, { hp: 100, shield: 2 });
    const combat = create([bearer]);

    combat.update(DT, [cat('sand')]);

    expect(bearer).toMatchObject({ hp: 100, shield: 1 });
  });

  it('буря повторяется после перезарядки', () => {
    const combat = create([enemy('mouse', MIDDLE, { hp: 10000 })]);

    expect(ofKind(run(combat, [cat('sand')], 1.5), 'aura')).toHaveLength(3);
  });
});

describe('Combat: взрыв по площади (метеор)', () => {
  const blast = { radius: 20, damage: 30, burnDps: 4, burnTime: 2 };

  it('задевает только тех, кто в радиусе в момент удара', () => {
    const center = enemy('mouse', MIDDLE, { hp: 100 });
    const edge = enemy('mouse', MIDDLE + 20, { hp: 100 });
    const outside = enemy('mouse', MIDDLE + 21, { hp: 100 });
    const combat = create([center, edge, outside]);

    const events = combat.strike(50, 50, blast);

    expect([center.hp, edge.hp, outside.hp]).toEqual([70, 70, 100]);
    expect(ofKind(events, 'hit').map((event) => event.enemy)).toEqual([center, edge]);
  });

  it('удар мимо врагов ничего не делает', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 100 });
    const combat = create([mouse]);

    expect(combat.strike(50, 90, blast)).toEqual([]);
    expect(mouse).toMatchObject({ hp: 100, burnTime: 0 });
  });

  it('щит не спасает и не тратится', () => {
    const bearer = enemy('shield', MIDDLE, { hp: 100, shield: 3 });
    const events = create([bearer]).strike(50, 50, blast);

    expect(bearer).toMatchObject({ hp: 70, shield: 3 });
    expect(ofKind(events, 'blocked')).toEqual([]);
  });

  it('поджигает задетых: огонь жжёт в следующих шагах', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 100 });
    const combat = create([mouse]);

    combat.strike(50, 50, blast);
    expect(mouse).toMatchObject({ burnDps: 4, burnTime: 2 });

    run(combat, [], 1);
    expect(mouse.hp).toBeCloseTo(66);
  });

  it('более сильный огонь слабым не сбивается', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 100, burnDps: 9, burnTime: 1 });
    create([mouse]).strike(50, 50, blast);

    expect(mouse).toMatchObject({ burnDps: 9, burnTime: 2 });
  });

  it('убитый сразу снимается с поля и приносит награду', () => {
    const weak = enemy('mouse', MIDDLE, { hp: 30, gold: 7 });
    const strong = enemy('mouse', MIDDLE + 10, { hp: 100 });
    const combat = create([weak, strong]);

    const events = combat.strike(50, 50, blast);

    expect(ofKind(events, 'killed')).toEqual([{ kind: 'killed', enemy: weak, x: 50, y: 50, gold: 7, crystals: 0 }]);
    expect(combat.enemies).toEqual([strong]);
  });
});

describe('Combat: подмога короля', () => {
  function king(distance: number, overrides: Partial<Enemy> = {}): Enemy {
    return enemy('king', distance, {
      hp: 1000,
      maxHp: 1000,
      summon: { timer: 2, interval: 2, count: 2, spread: 10, minion: enemy('mouse', 0, { hp: 7, maxHp: 7, speed: 40, gold: 3 }) },
      ...overrides,
    });
  }

  it('когда таймер вышел, позади короля появляются враги, и о каждом приходит событие', () => {
    const boss = king(MIDDLE);
    const combat = create([boss]);
    const events = ofKind(run(combat, [], 2), 'spawned');

    expect(events).toHaveLength(2);
    expect(combat.enemies).toHaveLength(3);
    expect(events.map((event) => event.enemy.distance)).toEqual([MIDDLE - 10, MIDDLE - 20]);
    expect(events[0].enemy).toMatchObject({ type: 'mouse', hp: 7, speed: 40, gold: 3 });
  });

  it('призванные — отдельные враги: урон одному не трогает другого', () => {
    const combat = create([king(MIDDLE)]);
    const [first, second] = ofKind(run(combat, [], 2), 'spawned').map((event) => event.enemy);
    first.hp = 1;

    expect(second.hp).toBe(7);
  });

  it('призывы повторяются через интервал', () => {
    const combat = create([king(MIDDLE)]);

    expect(ofKind(run(combat, [], 6.1), 'spawned')).toHaveLength(6);
  });

  it('за краем поля король подмогу не зовёт, а таймер ждёт', () => {
    const boss = king(0);
    const combat = create([boss]);

    expect(ofKind(run(combat, [], 5), 'spawned')).toEqual([]);
    expect(boss.summon?.timer).toBe(2);
  });

  it('у самого входа призванные не появляются раньше начала дороги', () => {
    // Король только вышел на поле: в 15 от начала дороги (поле начинается с 20, запас видимости 5).
    const combat = create([king(15)]);
    const spawned = ofKind(run(combat, [], 2), 'spawned').map((event) => event.enemy.distance);

    expect(spawned).toEqual([5, 0]);
  });

  it('убитый король больше никого не призывает', () => {
    const boss = king(MIDDLE, { hp: 5, maxHp: 5 });
    const combat = create([boss]);
    const events = run(combat, [cat('air', 1)], 6);

    expect(ofKind(events, 'killed').map((event) => event.enemy)).toContain(boss);
    expect(ofKind(events, 'spawned')).toEqual([]);
  });

  it('король, как и командир, замедляется слабее', () => {
    const boss = king(MIDDLE);
    const combat = create([boss]);
    run(combat, [cat('water', 1)], 1);

    expect(boss.slowFactor).toBe(0.75);
  });
});
