import type { EnemiesConfig, EnemyTypeId, LevelConfig, WavesConfig } from '../data/types';
import type { Enemy } from '../entities/Enemy';

/** Волна, которая начнётся после паузы. */
export interface UpcomingWave {
  wave: number;
  boss: boolean;
  /** На этой волне выходит Крысиный король. */
  king: boolean;
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

  /** Один бросок на врага: сначала доля крыс, за ней доля щитоносцев, остальные — мыши. */
  private rollType(): EnemyTypeId {
    const { ratChance, shieldChance } = this.level;
    const roll = this.rng();
    if (roll < ratChance) return this.wave >= this.config.ratFromWave ? 'rat' : 'mouse';
    if (roll < ratChance + shieldChance) return this.wave >= this.config.shieldFromWave ? 'shield' : 'mouse';
    return 'mouse';
  }

  private createEnemy(type: EnemyTypeId): Enemy {
    const { baseHp, hpGrowthPerWave, speedPerWave, bonusGoldEveryWaves, types } = this.enemies;
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
      speed: config.speed + this.wave * speedPerWave,
      gold: config.gold + Math.floor(this.wave / bonusGoldEveryWaves),
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
