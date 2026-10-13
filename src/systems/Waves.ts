import type { EnemiesConfig, EnemyTypeId, LevelConfig, WavesConfig } from '../data/types';
import type { Enemy } from '../entities/Enemy';

/** Волна, которая начнётся после паузы. */
export interface UpcomingWave {
  wave: number;
  boss: boolean;
  /** На этой волне выходит Крысиный король. */
  king: boolean;
}

/** Обычные враги волн — все, кроме мыши (она занимает остаток долей), командира и короля: у тех свои волны. */
const NOT_IN_MIX: readonly EnemyTypeId[] = ['mouse', 'boss', 'king'];

/**
 * Уровень, в волнах которого поровну идут все типы обычных врагов, включая мышей.
 * Нужен только в разработке (`?enemies=all`): посмотреть врагов, которых в главе ещё нет.
 */
export function mixAllEnemies(level: LevelConfig, enemies: EnemiesConfig): LevelConfig {
  const types = (Object.keys(enemies.types) as EnemyTypeId[]).filter((type) => !NOT_IN_MIX.includes(type));
  const share = 1 / (types.length + 1);
  return { ...level, enemies: Object.fromEntries(types.map((type) => [type, share])) };
}

/** Расписание волн и появление врагов. */
export class Waves {
  /** Номер идущей волны; 0 — первая ещё не началась. */
  wave = 0;
  private spawnLeft = 0;
  /** Король этой волны ещё не вышел. */
  private kingLeft = false;
  private spawnTimer = 0;
  private pause: number;
  /** Поле пусто, идёт отсчёт до следующей волны. */
  private waiting = true;

  /** `rng` возвращает число в [0, 1); подменяется в тестах. */
  constructor(
    private readonly config: WavesConfig,
    private readonly level: LevelConfig,
    private readonly enemies: EnemiesConfig,
    private readonly rng: () => number = Math.random,
  ) {
    this.pause = config.firstWaveDelay;
  }

  /** Последняя волна выпущена целиком: новых врагов больше не будет. */
  get finished(): boolean {
    return this.wave >= this.level.waves && this.spawnLeft === 0 && !this.kingLeft;
  }

  /** Следующая волна, пока идёт пауза перед ней; иначе null. */
  get upcoming(): UpcomingWave | null {
    if (!this.waiting || this.spawnLeft > 0 || this.kingLeft || this.finished) return null;
    const wave = this.wave + 1;
    return { wave, boss: this.isBossWave(wave), king: wave === this.level.kingWave };
  }

  /**
   * Продвигает расписание на `dt` секунд и возвращает появившихся врагов.
   * Пауза перед следующей волной идёт, только пока на поле никого нет.
   */
  update(dt: number, fieldEmpty: boolean): Enemy[] {
    if (this.spawnLeft > 0 || this.kingLeft) {
      this.spawnTimer -= dt;
      if (this.spawnTimer > 0) return [];
      // Король выходит первым, его армия — следом.
      if (this.kingLeft) {
        this.kingLeft = false;
        this.spawnTimer = this.config.bossSpawnInterval;
        return [this.createEnemy('king')];
      }
      this.spawnLeft--;
      const boss = this.isBossWave(this.wave);
      this.spawnTimer = boss ? this.config.bossSpawnInterval : this.config.spawnInterval;
      return [this.createEnemy(boss ? 'boss' : this.rollType())];
    }

    this.waiting = fieldEmpty;
    if (!fieldEmpty || this.finished) return [];

    this.pause -= dt;
    if (this.pause <= 0) {
      this.startWave();
      this.pause = this.config.waveDelay;
    }
    return [];
  }

  private startWave(): void {
    this.wave++;
    this.waiting = false;
    this.spawnTimer = 0;
    this.kingLeft = this.wave === this.level.kingWave;
    const { enemiesBase, enemiesPerWave, bossesBase, extraBossEveryWaves } = this.config;
    this.spawnLeft = this.isBossWave(this.wave)
      ? bossesBase + Math.floor(this.wave / extraBossEveryWaves)
      : enemiesBase + this.wave * enemiesPerWave;
  }

  private isBossWave(wave: number): boolean {
    return this.level.bossWaves.includes(wave);
  }

  /** Один бросок на врага: доли типов идут подряд в порядке записи в уровне, остальные — мыши. Тип, чья волна ещё не пришла, заменяется мышью. */
  private rollType(): EnemyTypeId {
    const roll = this.rng();
    let edge = 0;
    for (const [type, share] of Object.entries(this.level.enemies) as [EnemyTypeId, number][]) {
      edge += share;
      if (roll < edge) return this.wave >= (this.enemies.types[type].fromWave ?? 1) ? type : 'mouse';
    }
    return 'mouse';
  }

  private createEnemy(type: EnemyTypeId): Enemy {
    const { baseHp, hpGrowthPerWave, types } = this.enemies;
    const config = types[type];
    const hp = baseHp * Math.pow(hpGrowthPerWave, this.wave - 1) * this.level.hpMult * config.hp;
    // Подмога призывающего врага — обычные враги этой же волны.
    const summon = config.summon && {
      timer: config.summon.interval,
      interval: config.summon.interval,
      count: config.summon.count,
      spread: config.summon.spread,
      minion: this.createEnemy(config.summon.type),
    };
    return {
      ...(summon ? { summon } : {}),
      type,
      distance: 0,
      hp,
      maxHp: hp,
      // Скорость и награда от номера волны не зависят: сложность растёт здоровьем и числом врагов.
      speed: config.speed,
      gold: config.gold,
      shield: config.shield,
      slowFactor: 1,
      slowTime: 0,
      burnDps: 0,
      burnTime: 0,
      poisonDps: 0,
      poisonTime: 0,
    };
  }
}
