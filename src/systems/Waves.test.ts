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
  speedPerWave: 1,
  bonusGoldEveryWaves: 2,
  types: {
    mouse: { ...type, hp: 1, speed: 44, gold: 2, shield: 0 },
    rat: { ...type, hp: 3, speed: 32, gold: 5, shield: 0 },
    shield: { ...type, hp: 1.5, speed: 38, gold: 4, shield: 3 },
    boss: { ...type, hp: 14, speed: 26, gold: 30, shield: 0 },
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
    expect(create().upcoming).toEqual({ wave: 1, boss: false });
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

    expect(waves.upcoming).toEqual({ wave: 4, boss: true });
  });

  it('после последней волны объявлять нечего', () => {
    const waves = create();
    skipWaves(waves, 4);
    run(waves, 1);

    expect(waves.upcoming).toBeNull();
  });
});

describe('Waves: враги', () => {
  it('мышь первой волны: HP, скорость и монеты по формулам', () => {
    const [mouse] = nextWave(create());

    // HP: 10 × 2^0 × hpMult 2 × 1; скорость: 44 + 1 за волну; монеты: 2 + ⌊1/2⌋.
    expect(mouse).toMatchObject({ type: 'mouse', distance: 0, hp: 20, maxHp: 20, speed: 45, gold: 2, shield: 0 });
  });

  it('враг появляется без замедления, огня и яда', () => {
    const [mouse] = nextWave(create());

    expect(mouse).toMatchObject({ slowFactor: 1, slowTime: 0, burnDps: 0, burnTime: 0, poisonDps: 0, poisonTime: 0 });
  });

  it('с каждой волной враги крепче, быстрее и дороже', () => {
    const waves = create();
    skipWaves(waves, 2);
    const [mouse] = nextWave(waves);

    // HP: 10 × 2^2 × 2; скорость: 44 + 3; монеты: 2 + ⌊3/2⌋.
    expect(mouse).toMatchObject({ hp: 80, maxHp: 80, speed: 47, gold: 3 });
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

    // HP: 10 × 2^1 × 2 × 3; монеты: 5 + ⌊2/2⌋.
    expect(rat).toMatchObject({ type: 'rat', hp: 120, speed: 34, gold: 6 });
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

    // HP: 10 × 2^3 × 2 × 14; монеты: 30 + ⌊4/2⌋.
    expect(bosses.map((enemy) => enemy.type)).toEqual(['boss', 'boss', 'boss']);
    expect(bosses[0]).toMatchObject({ hp: 2240, speed: 30, gold: 32 });
  });
});
