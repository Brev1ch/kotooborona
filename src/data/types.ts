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
}

export interface LevelsConfig {
  slotSize: number;
  waves: WavesConfig;
  stars: { threeStarsMaxLost: number; twoStarsMaxLost: number };
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
  rewardedAd: { gold: number; cooldown: number };
  defaults: Record<GearSlot, string>;
}
