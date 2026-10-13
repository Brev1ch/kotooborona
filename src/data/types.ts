export type Point = [number, number];

export type ElementId =
  | 'fire'
  | 'water'
  | 'earth'
  | 'air'
  | 'steam'
  | 'lava'
  | 'storm'
  | 'ice'
  | 'swamp'
  | 'sand';

export type CatEffect =
  | 'burn'
  | 'slow'
  | 'heavy'
  | 'none'
  | 'splash_slow'
  | 'splash_burn'
  | 'chain'
  | 'freeze'
  | 'poison'
  | 'aura';

export interface ElementConfig {
  color: string;
  dmg: number;
  rate: number;
  fx: CatEffect;
  /** Пара базовых стихий, из которых получается гибрид. */
  from?: [ElementId, ElementId];
}

export interface CatsConfig {
  baseDamage: number;
  levelDamageMult: number;
  hybridDamageMult: number;
  baseRate: number;
  ratePerLevel: number;
  baseRange: number;
  rangePerLevel: number;
  projectileSpeed: number;
  /** Снаряд попадает, подлетев на эту долю радиуса врага. */
  hitRadiusMult: number;
  /** На сколько враг может выйти за край поля, оставаясь целью. */
  targetMargin: number;
  elements: Record<ElementId, ElementConfig>;
  effects: Record<CatEffect, Record<string, number>>;
}

export type EnemyTypeId = 'mouse' | 'rat' | 'shield' | 'boss';

export interface EnemyTypeConfig {
  color: string;
  /** Множитель к базовому HP волны. */
  hp: number;
  speed: number;
  gold: number;
  radius: number;
  lifeDamage: number;
  shield: number;
  crystalChance: number;
  crystalDrop: number;
}

export interface EnemiesConfig {
  baseHp: number;
  hpGrowthPerWave: number;
  speedPerWave: number;
  bonusGoldEveryWaves: number;
  bossSlowResist: number;
  types: Record<EnemyTypeId, EnemyTypeConfig>;
}

export interface LevelConfig {
  id: string;
  /** Координаты в системе игрового поля (см. layout.ts). */
  path: Point[];
  /** Левый верхний угол каждой клетки. */
  slots: Point[];
  hero: Point;
  waves: number;
  bossWaves: number[];
  maxCatLevel: number;
  startGold: number;
  startCrystals: number;
  startLives: number;
  hpMult: number;
  ratChance: number;
  shieldChance: number;
  /** Рыбки за первое прохождение на одну звезду. */
  fish: number;
}

export interface WavesConfig {
  enemiesBase: number;
  enemiesPerWave: number;
  bossesBase: number;
  extraBossEveryWaves: number;
  spawnInterval: number;
  bossSpawnInterval: number;
  firstWaveDelay: number;
  waveDelay: number;
  ratFromWave: number;
  shieldFromWave: number;
}

export interface RewardRules {
  /** Прибавка к рыбкам уровня за каждую звезду сверх первой, доля от награды уровня. */
  fishPerExtraStar: number;
  /** Множитель награды за повторное прохождение уже пройденного уровня. */
  replayMult: number;
}

export interface LevelsConfig {
  slotSize: number;
  /** Сколько уровней в главе; тех, что ещё не описаны в `levels`, меню показывает закрытыми. */
  chapterLevels: number;
  waves: WavesConfig;
  stars: { threeStarsMaxLost: number; twoStarsMaxLost: number };
  rewards: RewardRules;
  levels: LevelConfig[];
}

export type GearSlot = 'staff' | 'mantle' | 'amulet';

export interface GearItem {
  id: string;
  element?: ElementId;
  summonWeight?: number;
  summonCostMult?: number;
  meteorCooldownMult?: number;
  ritualTimeMult?: number;
  bonusCrystals?: number;
  bonusGold?: number;
}

export interface GearConfig extends Record<GearSlot, GearItem[]> {
  summon: { baseCost: number; costGrowth: number };
  ritual: { time: number; crystalCost: number };
  meteor: {
    cooldown: number;
    damage: number;
    damageGrowthPerWave: number;
    radius: number;
    burnDps: number;
    burnTime: number;
  };
  defaults: Record<GearSlot, string>;
}

export interface AdsConfig {
  /** Наградной ролик в бою: монеты и пауза до следующего показа, секунды. */
  coins: { gold: number; cooldown: number };
  /** «Второй шанс» после поражения: сколько жизней возвращает. */
  secondChance: { lives: number };
  /** Во сколько раз ролик на экране победы увеличивает награду уровня. */
  doubleReward: { mult: number };
  /** Полноэкранная реклама между уровнями: наименьший промежуток между показами, секунды. */
  interstitial: { minInterval: number };
}
