import { describe, expect, it } from 'vitest';
import { cats as catsJson, enemies as enemiesJson } from '../data';
import type { CatsConfig, ElementId, EnemiesConfig, EnemyTypeId } from '../data';
import type { Building, Piece } from '../entities/Building';
import type { Cat } from '../entities/Cat';
import type { Enemy } from '../entities/Enemy';
import { catDamage, catRate, Combat, isBurrowed, type CombatEvent } from './Combat';
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

const type = { color: '#000000', hp: 1, speed: 40, gold: 2, radius: 8, shield: 0, crystalChance: 0, crystalDrop: 0, motion: 'waddle' as const, size: 1 };
const enemies: EnemiesConfig = {
  ...enemiesJson,
  bossSlowResist: 0.5,
  types: {
    mouse: { ...type },
    rat: { ...type, crystalChance: 0.3, crystalDrop: 1 },
    shield: { ...type },
    boots: { ...type, immune: ['slow', 'freeze'] },
    fire: { ...type, immune: ['burn'], resist: { fire: 0, lava: 0.5, steam: 1, storm: 1 } },
    shaman: { ...type, heal: { radius: 20, part: 0.1, interval: 1 } },
    // Дорога длиной 140: подкоп идёт от 56 до 84, точка под клеткой 0 — внутри него.
    mole: { ...type, burrow: { from: 0.4, to: 0.6 } },
    ninja: { ...type, dodgeEvery: 3 },
    bat: { ...type, flying: { hitBy: ['air', 'storm'] } },
    boss: { ...type, crystalChance: 1, crystalDrop: 2, slowResist: true },
    king: { ...type, livesCost: 3, slowResist: true, summon: { type: 'mouse', count: 2, interval: 2, spread: 10 } },
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
function run(combat: Combat, board: (Piece | null)[], seconds: number): CombatEvent[] {
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

    expect(combat.update(0.25, [])).toEqual([{ kind: 'leaked', enemy: mouse, livesCost: 1 }]);
    expect(combat.enemies).toEqual([]);
  });

  it('враги отнимают по одной жизни, а Крысиный король — три', () => {
    const combat = create([enemy('rat', 139, { speed: 40 }), enemy('boss', 139, { speed: 40 }), enemy('king', 139, { speed: 40 })]);

    expect(ofKind(combat.update(0.25, []), 'leaked').map((event) => event.livesCost)).toEqual([1, 1, 3]);
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

describe('Combat: строения', () => {
  it('строение в клетке не стреляет, кот рядом — стреляет', () => {
    const shop: Building = { kind: 'shop', level: 1, invested: 40, waves: 0 };
    const alone = run(create([enemy('mouse', MIDDLE)]), [shop], 1);
    expect(ofKind(alone, 'shot')).toHaveLength(0);

    const withCat = run(create([enemy('mouse', MIDDLE)]), [shop, cat()], 1);
    expect(ofKind(withCat, 'shot').every((event) => event.slot === 1)).toBe(true);
    expect(ofKind(withCat, 'shot').length).toBeGreaterThan(0);
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

describe('Combat: иммунитеты к эффектам', () => {
  /** Один выстрел кота по врагу и события до попадания включительно. */
  function shoot(combat: Combat, element: ElementId): CombatEvent[] {
    return [...combat.update(DT, [cat(element)]), ...run(combat, [], 0.1)];
  }

  it('мышь в сапогах не замедляется, но урон получает', () => {
    const boots = enemy('boots', MIDDLE, { hp: 100 });
    const events = shoot(create([boots]), 'water');

    expect(boots).toMatchObject({ hp: 90, slowFactor: 1, slowTime: 0 });
    expect(ofKind(events, 'hit')).toHaveLength(1);
    expect(ofKind(events, 'immune')).toEqual([{ kind: 'immune', enemy: boots, x: 50, y: 50 }]);
  });

  it('мышь в сапогах не замерзает', () => {
    const boots = enemy('boots', MIDDLE, { hp: 100 });
    const events = shoot(create([boots]), 'ice');

    expect(boots).toMatchObject({ hp: 85, slowFactor: 1, slowTime: 0 });
    expect(ofKind(events, 'immune')).toHaveLength(1);
  });

  it('облако пара замедляет соседей, а мышь в сапогах — нет', () => {
    const boots = enemy('boots', MIDDLE, { hp: 100 });
    const mouse = enemy('mouse', MIDDLE - 10, { hp: 100 });
    const events = shoot(create([boots, mouse]), 'steam');

    expect(boots).toMatchObject({ hp: 85, slowFactor: 1 });
    expect(mouse).toMatchObject({ hp: 92.5, slowFactor: 0.6 });
    expect(ofKind(events, 'immune').map((event) => event.enemy)).toEqual([boots]);
  });

  it('иммунитет к замедлению и иммунитет к заморозке — разные', () => {
    const custom: EnemiesConfig = { ...enemies, types: { ...enemies.types, boots: { ...enemies.types.boots, immune: ['freeze'] } } };
    const boots = enemy('boots', MIDDLE, { hp: 100 });
    const combat = new Combat({ cats, enemies: custom, path, slots, bounds });
    combat.add(boots);

    shoot(combat, 'water');
    expect(boots.slowFactor).toBe(0.5);
  });

  it('иммунный к поджогу не горит', () => {
    const custom: EnemiesConfig = { ...enemies, types: { ...enemies.types, boots: { ...enemies.types.boots, immune: ['burn'] } } };
    const boots = enemy('boots', MIDDLE, { hp: 100 });
    const combat = new Combat({ cats, enemies: custom, path, slots, bounds });
    combat.add(boots);

    const events = shoot(combat, 'fire');
    expect(boots).toMatchObject({ hp: 90, burnDps: 0, burnTime: 0 });
    expect(ofKind(events, 'immune')).toHaveLength(1);
  });

  it('иммунный к яду не отравляется', () => {
    const custom: EnemiesConfig = { ...enemies, types: { ...enemies.types, boots: { ...enemies.types.boots, immune: ['poison'] } } };
    const boots = enemy('boots', MIDDLE, { hp: 100 });
    const combat = new Combat({ cats, enemies: custom, path, slots, bounds });
    combat.add(boots);

    const events = shoot(combat, 'swamp');
    expect(boots).toMatchObject({ hp: 85, poisonDps: 0, poisonTime: 0 });
    expect(ofKind(events, 'immune')).toHaveLength(1);
  });

  it('обычная мышь событий иммунитета не даёт', () => {
    const combat = create([enemy('mouse', MIDDLE, { hp: 100 })]);
    expect(ofKind(shoot(combat, 'water'), 'immune')).toEqual([]);
  });
});

describe('Combat: сопротивление стихиям', () => {
  function shoot(combat: Combat, element: ElementId): CombatEvent[] {
    return [...combat.update(DT, [cat(element)]), ...run(combat, [], 0.1)];
  }

  it('пожарная мышь не получает урона от огня и не горит: одно событие иммунитета вместо попадания', () => {
    const fire = enemy('fire', MIDDLE, { hp: 100 });
    const events = shoot(create([fire]), 'fire');

    expect(fire).toMatchObject({ hp: 100, burnTime: 0 });
    expect(ofKind(events, 'hit')).toEqual([]);
    expect(ofKind(events, 'immune')).toEqual([{ kind: 'immune', enemy: fire, x: 50, y: 50 }]);
  });

  it('лава бьёт пожарную мышь вполсилы и не поджигает', () => {
    const fire = enemy('fire', MIDDLE, { hp: 100 });
    shoot(create([fire]), 'lava');

    expect(fire).toMatchObject({ hp: 92.5, burnTime: 0 });
  });

  it('осколки лавы тоже слабеют, а соседняя мышь получает их целиком и горит', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 100 });
    const fire = enemy('fire', MIDDLE - 10, { hp: 100 });
    const other = enemy('mouse', MIDDLE - 15, { hp: 100 });
    shoot(create([mouse, fire, other]), 'lava');

    expect(fire).toMatchObject({ hp: 96.25, burnTime: 0 });
    expect(other).toMatchObject({ hp: 92.5, burnDps: 3 });
  });

  it('пар и молния бьют пожарную мышь в полную силу', () => {
    const steamed = enemy('fire', MIDDLE, { hp: 100 });
    shoot(create([steamed]), 'steam');
    expect(steamed.hp).toBe(85);

    const struck = enemy('fire', MIDDLE, { hp: 100 });
    const events = shoot(create([struck]), 'storm');
    expect(struck.hp).toBe(85);
    expect(ofKind(events, 'immune')).toEqual([]);
  });

  it('перескок молнии считается по стихии кота', () => {
    const custom: EnemiesConfig = { ...enemies, types: { ...enemies.types, fire: { ...enemies.types.fire, resist: { storm: 0.5 } } } };
    const mouse = enemy('mouse', MIDDLE, { hp: 100 });
    const fire = enemy('fire', MIDDLE - 10, { hp: 100 });
    const combat = new Combat({ cats, enemies: custom, path, slots, bounds });
    combat.add(mouse);
    combat.add(fire);

    shoot(combat, 'storm');
    // Перескок — половина от 15, сопротивление — ещё половина.
    expect(fire.hp).toBe(96.25);
  });

  it('буря по устойчивому к ней врагу урона не наносит', () => {
    const custom: EnemiesConfig = { ...enemies, types: { ...enemies.types, fire: { ...enemies.types.fire, resist: { sand: 0 } } } };
    const fire = enemy('fire', MIDDLE, { hp: 100 });
    const combat = new Combat({ cats, enemies: custom, path, slots, bounds });
    combat.add(fire);

    const events = combat.update(DT, [cat('sand')]);
    expect(fire.hp).toBe(100);
    expect(ofKind(events, 'immune')).toHaveLength(1);
  });

  it('яд слабеет вместе с уроном стихии', () => {
    const custom: EnemiesConfig = { ...enemies, types: { ...enemies.types, fire: { ...enemies.types.fire, resist: { swamp: 0.5 } } } };
    const fire = enemy('fire', MIDDLE, { hp: 100 });
    const combat = new Combat({ cats, enemies: custom, path, slots, bounds });
    combat.add(fire);

    combat.update(DT, [cat('swamp')]);
    // Без шагов после попадания яд ещё не успевает тикнуть: смотрим только дозу.
    while (fire.poisonTime === 0) combat.update(DT, []);
    expect(fire.poisonDps).toBe(3.75);
  });

  it('щит принимает попадание раньше сопротивления', () => {
    const fire = enemy('fire', MIDDLE, { hp: 100, shield: 1 });
    const events = shoot(create([fire]), 'fire');

    expect(fire.shield).toBe(0);
    expect(ofKind(events, 'blocked')).toHaveLength(1);
  });

  it('метеор бьёт пожарную мышь в полную силу, но не поджигает', () => {
    const fire = enemy('fire', MIDDLE, { hp: 100 });
    const events = create([fire]).strike(50, 50, { radius: 20, damage: 30, burnDps: 4, burnTime: 2 });

    expect(fire).toMatchObject({ hp: 70, burnTime: 0 });
    expect(ofKind(events, 'hit')).toHaveLength(1);
    expect(ofKind(events, 'immune')).toHaveLength(1);
  });

  it('в игровых данных у пожарной мыши явно записаны все огненные стихии', () => {
    expect(enemiesJson.types.fire.immune).toEqual(['burn']);
    expect(enemiesJson.types.fire.resist).toEqual({ fire: 0, lava: 0.5, steam: 1, storm: 1 });
    expect(enemiesJson.types.boots.immune).toEqual(['slow', 'freeze']);
  });
});

describe('Combat: шаман', () => {
  it('раз в интервал лечит соседей в радиусе на долю их полного здоровья', () => {
    const shaman = enemy('shaman', MIDDLE);
    const near = enemy('mouse', MIDDLE - 20, { hp: 50, maxHp: 100 });
    const far = enemy('mouse', MIDDLE - 21, { hp: 50, maxHp: 100 });
    const combat = create([shaman, near, far]);

    expect(ofKind(run(combat, [], 0.9), 'healed')).toEqual([]);
    const events = run(combat, [], 0.2);

    expect(near.hp).toBe(60);
    expect(far.hp).toBe(50);
    expect(ofKind(events, 'healed')).toEqual([{ kind: 'healed', enemy: shaman, x: 50, y: 50, radius: 20 }]);

    run(combat, [], 1);
    expect(near.hp).toBe(70);
  });

  it('не лечит выше полного здоровья', () => {
    const near = enemy('mouse', MIDDLE - 5, { hp: 95, maxHp: 100 });
    run(create([enemy('shaman', MIDDLE), near]), [], 1.1);

    expect(near.hp).toBe(100);
  });

  it('себя не лечит', () => {
    const shaman = enemy('shaman', MIDDLE, { hp: 5, maxHp: 20 });
    const events = run(create([shaman]), [], 3);

    expect(shaman.hp).toBe(5);
    expect(ofKind(events, 'healed')).toEqual([]);
  });

  it('других шаманов не лечит: пара шаманов друг друга не вытягивает', () => {
    const first = enemy('shaman', MIDDLE, { hp: 5, maxHp: 20 });
    const second = enemy('shaman', MIDDLE - 5, { hp: 7, maxHp: 20 });
    const events = run(create([first, second]), [], 10);

    expect([first.hp, second.hp]).toEqual([5, 7]);
    expect(ofKind(events, 'healed')).toEqual([]);
  });

  it('пара шаманов лечит мышь оба, но не друг друга', () => {
    const first = enemy('shaman', MIDDLE, { hp: 5, maxHp: 20 });
    const second = enemy('shaman', MIDDLE - 5, { hp: 5, maxHp: 20 });
    const mouse = enemy('mouse', MIDDLE - 2, { hp: 10, maxHp: 100 });
    run(create([first, second, mouse]), [], 1.1);

    expect([first.hp, second.hp, mouse.hp]).toEqual([5, 5, 30]);
  });

  it('если лечить некого, события нет', () => {
    const events = run(create([enemy('shaman', MIDDLE), enemy('mouse', MIDDLE - 5)]), [], 2.1);
    expect(ofKind(events, 'healed')).toEqual([]);
  });

  it('убитый шаман больше не лечит', () => {
    const shaman = enemy('shaman', MIDDLE, { hp: 1 });
    const mouse = enemy('mouse', 10, { hp: 50, maxHp: 100 });
    const combat = create([shaman, mouse]);
    run(combat, [cat()], 0.5);
    expect(combat.enemies).toEqual([mouse]);

    mouse.distance = MIDDLE;
    run(combat, [], 2);
    expect(mouse.hp).toBe(50);
  });
});

describe('Combat: крот', () => {
  it('под землёй — только на участке подкопа', () => {
    const length = path.length;
    expect(isBurrowed(enemies, enemy('mole', 55), length)).toBe(false);
    expect(isBurrowed(enemies, enemy('mole', 56), length)).toBe(true);
    expect(isBurrowed(enemies, enemy('mole', 83), length)).toBe(true);
    expect(isBurrowed(enemies, enemy('mole', 84), length)).toBe(false);
    expect(isBurrowed(enemies, enemy('mouse', 70), length)).toBe(false);
  });

  it('под землёй коты по нему не стреляют', () => {
    const mole = enemy('mole', MIDDLE, { hp: 100 });
    const events = run(create([mole]), [cat()], 1);

    expect(ofKind(events, 'shot')).toEqual([]);
    expect(mole.hp).toBe(100);
  });

  it('до подкопа и после него получает урон как все', () => {
    const before = enemy('mole', 50, { hp: 100 });
    run(create([before]), [cat()], 0.3);
    expect(before.hp).toBe(90);

    const after = enemy('mole', 90, { hp: 100 });
    run(create([after]), [cat()], 0.3);
    expect(after.hp).toBe(90);
  });

  it('снаряд, не успевший долететь до ушедшего под землю, пропадает', () => {
    // За шаг крот проходит 4: после первого шага он ещё на поверхности, после второго — уже под землёй.
    const mole = enemy('mole', 50, { hp: 100, speed: 80 });
    const combat = create([mole]);

    combat.update(DT, [cat()]);
    expect(combat.projectiles).toHaveLength(1);
    combat.update(DT, []);

    expect(combat.projectiles).toEqual([]);
    expect(mole.hp).toBe(100);
  });

  it('под землёй не страшны ни буря, ни осколки, ни молния, ни метеор', () => {
    const mole = enemy('mole', MIDDLE, { hp: 100 });
    const mouse = enemy('mouse', 90, { hp: 1000 });
    const combat = create([mole, mouse]);

    run(combat, [cat('sand'), cat('lava')], 1);
    run(combat, [cat('storm'), cat('steam')], 1);
    const events = combat.strike(50, 50, { radius: 30, damage: 30, burnDps: 4, burnTime: 2 });

    expect(mole).toMatchObject({ hp: 100, burnTime: 0, slowTime: 0 });
    expect(ofKind(events, 'hit').map((event) => event.enemy)).toEqual([mouse]);
  });

  it('огонь и яд под землёй не жгут, а после подкопа продолжают', () => {
    const mole = enemy('mole', MIDDLE, { hp: 100, burnDps: 10, burnTime: 5, poisonDps: 10, poisonTime: 5 });
    const combat = create([mole]);

    run(combat, [], 1);
    expect(mole.hp).toBe(100);

    mole.distance = 90;
    run(combat, [], 1);
    expect(mole.hp).toBeCloseTo(80);
  });

  it('шаман под землёй крота не лечит', () => {
    const mole = enemy('mole', MIDDLE, { hp: 50, maxHp: 100 });
    run(create([enemy('shaman', MIDDLE), mole]), [], 1.1);

    expect(mole.hp).toBe(50);
  });
});

describe('Combat: ниндзя', () => {
  it('уклоняется от каждого третьего снаряда', () => {
    const ninja = enemy('ninja', MIDDLE, { hp: 1000 });
    const combat = create([ninja]);

    // Ветряной кот 1-го уровня стреляет раз в 0.67 с: за 4.2 с вылетает и долетает шесть снарядов.
    const events = run(combat, [cat()], 4.2);

    expect(ofKind(events, 'shot')).toHaveLength(6);
    expect(ofKind(events, 'hit')).toHaveLength(4);
    expect(ofKind(events, 'dodged')).toEqual([
      { kind: 'dodged', enemy: ninja, x: 50, y: 50 },
      { kind: 'dodged', enemy: ninja, x: 50, y: 50 },
    ]);
    expect(ninja.hp).toBe(960);
  });

  it('промах не накладывает эффект и не даёт осколков', () => {
    const ninja = enemy('ninja', MIDDLE, { hp: 1000, shotsTaken: 2 });
    const mouse = enemy('mouse', MIDDLE - 10, { hp: 100 });
    const combat = create([ninja, mouse]);

    const events = [...combat.update(DT, [cat('lava')]), ...run(combat, [], 0.1)];

    expect(ofKind(events, 'dodged')).toHaveLength(1);
    expect(ofKind(events, 'splash')).toEqual([]);
    expect(ninja).toMatchObject({ hp: 1000, burnTime: 0 });
    expect(mouse.hp).toBe(100);
  });

  it('счёт у каждого ниндзя свой', () => {
    const first = enemy('ninja', MIDDLE, { hp: 1000, shotsTaken: 2 });
    const second = enemy('ninja', MIDDLE - 30, { hp: 1000 });
    const combat = create([first, second]);

    run(combat, [cat()], 0.3);
    expect(first.shotsTaken).toBe(3);
    expect(second.shotsTaken ?? 0).toBe(0);
  });

  it('от бури, осколков и перескока молнии не уклоняется', () => {
    const stormed = enemy('ninja', MIDDLE, { hp: 1000 });
    expect(ofKind(run(create([stormed]), [cat('sand')], 3.2), 'dodged')).toEqual([]);
    expect(stormed.hp).toBe(1000 - 15 * 5);

    const mouse = enemy('mouse', MIDDLE, { hp: 1000 });
    const splashed = enemy('ninja', MIDDLE - 10, { hp: 1000, shotsTaken: 2 });
    const combat = create([mouse, splashed]);
    combat.update(DT, [cat('lava')]);
    run(combat, [], 0.1);
    expect(splashed.hp).toBe(992.5);

    const chained = enemy('ninja', MIDDLE - 10, { hp: 1000, shotsTaken: 2 });
    const chain = create([enemy('mouse', MIDDLE, { hp: 1000 }), chained]);
    chain.update(DT, [cat('storm')]);
    run(chain, [], 0.1);
    expect(chained).toMatchObject({ hp: 992.5, shotsTaken: 2 });
  });

  it('от метеора не уклоняется', () => {
    const ninja = enemy('ninja', MIDDLE, { hp: 100, shotsTaken: 2 });
    create([ninja]).strike(50, 50, { radius: 20, damage: 30, burnDps: 4, burnTime: 2 });

    expect(ninja.hp).toBe(70);
  });
});

describe('Combat: летучая мышь', () => {
  it.each(['air', 'storm'] as const)('%s по ней стреляет', (element) => {
    const bat = enemy('bat', MIDDLE, { hp: 100 });
    const events = run(create([bat]), [cat(element)], 0.3);

    expect(ofKind(events, 'shot')).toHaveLength(1);
    expect(bat.hp).toBeLessThan(100);
  });

  it.each(['fire', 'water', 'earth', 'steam', 'lava', 'ice', 'swamp', 'sand'] as const)('%s её не достаёт', (element) => {
    const bat = enemy('bat', MIDDLE, { hp: 100 });
    const events = run(create([bat]), [cat(element)], 2);

    expect(ofKind(events, 'shot')).toEqual([]);
    expect(ofKind(events, 'aura')).toEqual([]);
    expect(bat.hp).toBe(100);
  });

  it('кот, которому она не по силам, стреляет по тому, кто идёт за ней', () => {
    const bat = enemy('bat', MIDDLE + 10, { hp: 100 });
    const mouse = enemy('mouse', MIDDLE, { hp: 100 });
    const events = run(create([bat, mouse]), [cat('fire')], 0.3);

    expect(ofKind(events, 'shot')[0].projectile.target).toBe(mouse);
  });

  it('осколки и облако с земли её не задевают', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 1000 });
    const bat = enemy('bat', MIDDLE - 10, { hp: 100 });
    const combat = create([mouse, bat]);

    run(combat, [cat('lava'), cat('steam')], 1);

    expect(bat).toMatchObject({ hp: 100, burnTime: 0, slowTime: 0 });
  });

  it('молния перескакивает на неё с наземного врага', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 1000 });
    const bat = enemy('bat', MIDDLE - 10, { hp: 100 });
    const combat = create([mouse, bat]);

    combat.update(DT, [cat('storm')]);
    run(combat, [], 0.1);

    expect(bat.hp).toBe(92.5);
  });

  it('метеор падает сверху и бьёт её', () => {
    const bat = enemy('bat', MIDDLE, { hp: 100 });
    create([bat]).strike(50, 50, { radius: 20, damage: 30, burnDps: 4, burnTime: 2 });

    expect(bat).toMatchObject({ hp: 70, burnTime: 2 });
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

describe('Combat: бонусы снаряжения', () => {
  it('прибавка к урону стихии действует на её котов', () => {
    expect(catDamage(cats, cat('fire'), { fire: 0.2 })).toBeCloseTo(12);
    expect(catDamage(cats, cat('water'), { fire: 0.2 })).toBe(10);
    expect(catDamage(cats, cat('fire', 3), { fire: 0.5 })).toBeCloseTo(60);
  });

  it('и на гибридов, в которых эта стихия есть; прибавки двух стихий складываются', () => {
    // Пар — огонь и вода: гибрид 1-го уровня бьёт на 15.
    expect(catDamage(cats, cat('steam'), { fire: 0.2 })).toBeCloseTo(18);
    expect(catDamage(cats, cat('steam'), { fire: 0.2, water: 0.1 })).toBeCloseTo(19.5);
    expect(catDamage(cats, cat('sand'), { fire: 0.2 })).toBe(15);
  });

  it('в бою кот бьёт с прибавкой, заданной при создании боя', () => {
    const mouse = enemy('mouse', MIDDLE, { hp: 100 });
    const combat = new Combat({ cats, enemies, path, slots, bounds, damageBonus: { air: 0.5 } });
    combat.add(mouse);
    run(combat, [cat('air')], 0.3);

    expect(mouse.hp).toBe(85);
  });
});

describe('Combat: горящая зона метеора', () => {
  const blast = { radius: 20, damage: 30, burnDps: 4, burnTime: 2, ground: { burnDps: 6, time: 3 } };

  it('удар с зоной сообщает о ней и запоминает её', () => {
    const combat = create([]);
    const events = combat.strike(50, 50, blast);

    expect(ofKind(events, 'ground')).toEqual([{ kind: 'ground', x: 50, y: 50, radius: 20, time: 3 }]);
    expect(combat.burningGrounds).toHaveLength(1);
  });

  it('без зоны удар её не оставляет', () => {
    const combat = create([]);
    combat.strike(50, 50, { radius: 20, damage: 30, burnDps: 4, burnTime: 2 });

    expect(combat.burningGrounds).toEqual([]);
  });

  it('враг, вошедший в зону после удара, загорается', () => {
    const late = enemy('mouse', MIDDLE - 40, { hp: 100, speed: 40 });
    const combat = create([late]);
    combat.strike(50, 50, blast);
    expect(late.burnTime).toBe(0);

    run(combat, [], 1);
    expect(late).toMatchObject({ burnDps: 6 });
    expect(late.burnTime).toBeGreaterThan(0);
    expect(late.hp).toBeLessThan(100);
  });

  it('тот, кто в зону не заходил, не горит', () => {
    const far = enemy('mouse', MIDDLE + 40, { hp: 100 });
    const combat = create([far]);
    combat.strike(50, 50, blast);
    run(combat, [], 3);

    expect(far).toMatchObject({ hp: 100, burnTime: 0 });
  });

  it('зона гаснет через своё время и больше не поджигает', () => {
    const combat = create([]);
    combat.strike(50, 50, blast);
    run(combat, [], 3.1);
    expect(combat.burningGrounds).toEqual([]);

    const mouse = enemy('mouse', MIDDLE, { hp: 100 });
    combat.add(mouse);
    run(combat, [], 1);
    expect(mouse).toMatchObject({ hp: 100, burnTime: 0 });
  });

  it('невосприимчивого к огню зона не поджигает и событиями не сыплет', () => {
    const fire = enemy('fire', MIDDLE, { hp: 100 });
    const combat = create([fire]);
    combat.strike(50, 50, blast);
    const events = run(combat, [], 1);

    expect(fire.burnTime).toBe(0);
    expect(ofKind(events, 'immune')).toEqual([]);
  });

  it('крота под землёй зона не трогает', () => {
    const mole = enemy('mole', MIDDLE, { hp: 100 });
    const combat = create([mole]);
    combat.strike(50, 50, blast);
    run(combat, [], 1);

    expect(mole).toMatchObject({ hp: 100, burnTime: 0 });
  });
});
