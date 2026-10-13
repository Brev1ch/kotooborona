import { describe, expect, it } from 'vitest';
import { enemies as enemiesJson, levels } from '../data';
import type { EnemiesConfig, LevelConfig, WavesConfig } from '../data';
import type { Enemy } from '../entities/Enemy';
import { Waves } from './Waves';

// Числа зафиксированы здесь, чтобы тесты не зависели от правок баланса в JSON.
const config: WavesConfig = {
  enemiesBase: 2,
  enemiesPerWave: 1,
  bossesBase: 1,
  extraBossEveryWaves: 2,
  spawnInterval: 0.5,
  bossSpawnInterval: 1,
  firstWaveDelay: 2,
  waveDelay: 3,
  ratFromWave: 2,
  shieldFromWave: 3,
};
const level: LevelConfig = {
  ...levels.levels[0],
  waves: 4,
  bossWaves: [4],
  hpMult: 2,
  ratChance: 0.2,
  shieldChance: 0.3,
};
const type = { color: '#000000', radius: 8, lifeDamage: 1, crystalChance: 0, crystalDrop: 0 };
const enemies: EnemiesConfig = {
  ...enemiesJson,
  baseHp: 10,
  hpGrowthPerWave: 2,
  types: {
    mouse: { ...type, hp: 1, speed: 44, gold: 2, shield: 0 },
    rat: { ...type, hp: 3, speed: 32, gold: 5, shield: 0 },
    shield: { ...type, hp: 1.5, speed: 38, gold: 4, shield: 3 },
    boots: { ...type, hp: 1.6, speed: 40, gold: 3, shield: 0 },
    fire: { ...type, hp: 1.8, speed: 40, gold: 4, shield: 0 },
    boss: { ...type, hp: 14, speed: 26, gold: 30, shield: 0 },
    king: { ...type, hp: 50, speed: 20, gold: 80, shield: 0, summon: { type: 'mouse', count: 2, interval: 6, spread: 14 } },
  },
};

// Шаг точно представим в двоичном виде: таймеры обнуляются без погрешности.
const DT = 0.25;

/** Бросок 0.9 — всегда мышь. */
function create(roll = 0.9): Waves {
  return new Waves(config, level, enemies, () => roll);
}

/** Прокручивает `seconds` секунд и возвращает, сколько врагов появилось на каждом шаге. */
function run(waves: Waves, seconds: number, fieldEmpty = true): number[] {
  const spawned: number[] = [];
  for (let i = 0; i < seconds / DT; i++) spawned.push(waves.update(DT, fieldEmpty).length);
  return spawned;
}

/** Дожидается следующей волны на пустом поле и возвращает всех её врагов. */
function nextWave(waves: Waves): Enemy[] {
  const start = waves.wave;
  const spawned: Enemy[] = [];
  for (let i = 0; i < 1000; i++) {
    spawned.push(...waves.update(DT, true));
    if (waves.wave > start && (waves.finished || waves.upcoming)) return spawned;
  }
  throw new Error('Wave did not finish');
}

function skipWaves(waves: Waves, count: number): void {
  for (let i = 0; i < count; i++) nextWave(waves);
}

describe('Waves: расписание', () => {
  it('до конца стартовой паузы врагов нет', () => {
    const waves = create();

    expect(run(waves, 1.75)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(waves.wave).toBe(0);
  });

  it('первая волна начинается после стартовой паузы', () => {
    const waves = create();
    run(waves, 2);

    expect(waves.wave).toBe(1);
  });

  it('враги выходят по одному через интервал', () => {
    const waves = create();
    run(waves, 2);

    // 3 врага: сразу, через 0.5 с и ещё через 0.5 с.
    expect(run(waves, 2)).toEqual([1, 0, 1, 0, 1, 0, 0, 0]);
  });

  it('в волне базовое число врагов плюс прибавка за номер волны', () => {
    const waves = create();

    expect(nextWave(waves)).toHaveLength(3);
    expect(nextWave(waves)).toHaveLength(4);
    expect(nextWave(waves)).toHaveLength(5);
  });

  it('пауза между волнами идёт, только пока поле пусто', () => {
    const waves = create();
    nextWave(waves);

    run(waves, 10, false);
    expect(waves.wave).toBe(1);

    // Первый шаг паузы (из трёх секунд) уже прошёл внутри nextWave.
    run(waves, 2.5);
    expect(waves.wave).toBe(1);
    run(waves, 0.25);
    expect(waves.wave).toBe(2);
  });

  it('после последней волны новые не начинаются', () => {
    const waves = create();
    skipWaves(waves, 4);

    expect(waves.finished).toBe(true);
    expect(run(waves, 20).every((count) => count === 0)).toBe(true);
    expect(waves.wave).toBe(4);
  });

  it('волна не считается законченной, пока не вышли все враги', () => {
    const waves = create();
    skipWaves(waves, 3);
    run(waves, 3);

    expect(waves.wave).toBe(4);
    expect(waves.finished).toBe(false);
  });
});

describe('Waves: объявление следующей волны', () => {
  it('до первой волны объявляет первую', () => {
    expect(create().upcoming).toEqual({ wave: 1, boss: false, king: false });
  });

  it('пока волна идёт, объявления нет', () => {
    const waves = create();
    run(waves, 2.25);

    expect(waves.upcoming).toBeNull();
  });

  it('пока на поле остались враги, объявления нет', () => {
    const waves = create();
    nextWave(waves);
    run(waves, 1, false);

    expect(waves.upcoming).toBeNull();
  });

  it('перед волной с командиром предупреждает о нём', () => {
    const waves = create();
    skipWaves(waves, 3);

    expect(waves.upcoming).toEqual({ wave: 4, boss: true, king: false });
  });

  it('после последней волны объявлять нечего', () => {
    const waves = create();
    skipWaves(waves, 4);
    run(waves, 1);

    expect(waves.upcoming).toBeNull();
  });
});

describe('Waves: враги', () => {
  it('мышь первой волны: HP по формуле, скорость и монеты — из типа', () => {
    const [mouse] = nextWave(create());

    // HP: 10 × 2^0 × hpMult 2 × 1.
    expect(mouse).toMatchObject({ type: 'mouse', distance: 0, hp: 20, maxHp: 20, speed: 44, gold: 2, shield: 0 });
  });

  it('враг появляется без замедления, огня и яда', () => {
    const [mouse] = nextWave(create());

    expect(mouse).toMatchObject({ slowFactor: 1, slowTime: 0, burnDps: 0, burnTime: 0, poisonDps: 0, poisonTime: 0 });
  });

  it('с каждой волной враги крепче, но не быстрее и не дороже', () => {
    const waves = create();
    skipWaves(waves, 2);
    const [mouse] = nextWave(waves);

    // HP: 10 × 2^2 × 2.
    expect(mouse).toMatchObject({ hp: 80, maxHp: 80, speed: 44, gold: 2 });
  });

  it('крысы появляются только с заданной волны', () => {
    const waves = create(0.1);

    expect(nextWave(waves).every((enemy) => enemy.type === 'mouse')).toBe(true);
    expect(nextWave(waves).every((enemy) => enemy.type === 'rat')).toBe(true);
  });

  it('крыса крепче мыши в множитель типа', () => {
    const waves = create(0.1);
    skipWaves(waves, 1);
    const [rat] = nextWave(waves);

    // HP: 10 × 2^1 × 2 × 3.
    expect(rat).toMatchObject({ type: 'rat', hp: 120, speed: 32, gold: 5 });
  });

  it('щитоносцы появляются только с заданной волны и несут щит', () => {
    const waves = create(0.3);
    skipWaves(waves, 1);

    expect(nextWave(waves).every((enemy) => enemy.type === 'mouse')).toBe(true);
    const third = nextWave(waves);
    expect(third.every((enemy) => enemy.type === 'shield')).toBe(true);
    expect(third[0].shield).toBe(3);
  });

  it('доля щитоносцев идёт сразу за долей крыс', () => {
    const typeAt = (roll: number) => {
      const waves = create(roll);
      skipWaves(waves, 2);
      return nextWave(waves)[0].type;
    };

    expect(typeAt(0.19)).toBe('rat');
    expect(typeAt(0.2)).toBe('shield');
    expect(typeAt(0.49)).toBe('shield');
    expect(typeAt(0.5)).toBe('mouse');
  });

  it('в волне командира выходят только командиры, реже обычных врагов', () => {
    const waves = create(0.1);
    skipWaves(waves, 3);
    run(waves, 2.75);

    // 1 + ⌊4/2⌋ = 3 командира с интервалом 1 с.
    expect(run(waves, 3)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    expect(waves.finished).toBe(true);
  });

  it('командир — усиленная крыса', () => {
    const waves = create();
    skipWaves(waves, 3);
    const bosses = nextWave(waves);

    // HP: 10 × 2^3 × 2 × 14.
    expect(bosses.map((enemy) => enemy.type)).toEqual(['boss', 'boss', 'boss']);
    expect(bosses[0]).toMatchObject({ hp: 2240, speed: 26, gold: 30 });
  });
});

describe('Waves: Крысиный король', () => {
  const kingLevel: LevelConfig = { ...level, waves: 3, bossWaves: [], kingWave: 3 };

  function createKing(): Waves {
    return new Waves(config, kingLevel, enemies, () => 0.9);
  }

  it('объявление волны говорит, что идёт король', () => {
    const waves = createKing();
    expect(waves.upcoming).toEqual({ wave: 1, boss: false, king: false });

    skipWaves(waves, 2);
    expect(waves.upcoming).toEqual({ wave: 3, boss: false, king: true });
  });

  it('король выходит первым, за ним — обычные враги волны', () => {
    const waves = createKing();
    skipWaves(waves, 2);
    const spawned = nextWave(waves);

    // Обычная третья волна — 2 + 3 врага, и король перед ними.
    expect(spawned.map((enemy) => enemy.type)).toEqual(['king', 'mouse', 'mouse', 'mouse', 'mouse', 'mouse']);
  });

  it('у короля здоровье волны и подмога из врагов той же волны', () => {
    const waves = createKing();
    skipWaves(waves, 2);
    const [king] = nextWave(waves);

    // База 10 × рост 2² × живучесть уровня 2 = 80; у короля ×50, у мыши ×1.
    expect(king.hp).toBe(4000);
    expect(king.summon).toMatchObject({ timer: 6, interval: 6, count: 2, spread: 14 });
    expect(king.summon?.minion).toMatchObject({ type: 'mouse', hp: 80, speed: 44, distance: 0 });
    expect(king.summon?.minion.summon).toBeUndefined();
  });

  it('волна не закончена, пока король не вышел', () => {
    const waves = createKing();
    skipWaves(waves, 2);
    // Пауза перед волной: волна началась, но первый враг ещё не появился.
    while (waves.wave < 3) waves.update(DT, true);

    expect(waves.finished).toBe(false);
    run(waves, 20);
    expect(waves.finished).toBe(true);
  });

  it('у обычных врагов подмоги нет', () => {
    const waves = createKing();
    expect(nextWave(waves).every((enemy) => enemy.summon === undefined)).toBe(true);
  });
});
