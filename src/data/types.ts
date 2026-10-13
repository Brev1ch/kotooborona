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

export type EnemyTypeId = 'mouse' | 'rat' | 'shield' | 'boss' | 'king';

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
  /** Замедляется слабее остальных: командиры и король. */
  slowResist?: boolean;
  /** Призывает подмогу: каждые `interval` секунд рядом появляются `count` врагов типа `type` на расстоянии `spread` друг от друга. */
  summon?: { type: EnemyTypeId; count: number; interval: number; spread: number };
}

export interface EnemiesConfig {
  baseHp: number;
  hpGrowthPerWave: number;
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
  /** Центр корзины, куда перетаскивают котов на продажу. */
  trash: Point;
  waves: number;
  bossWaves: number[];
  /** Волна, на которой вместе с обычными врагами выходит Крысиный король. */
  kingWave?: number;
  maxCatLevel: number;
  startGold: number;
  startCrystals: number;
  startLives: number;
  hpMult: number;
  ratChance: number;
  shieldChance: number;
  /** Рыбки за первое прохождение на одну звезду. */
  fish: number;
  /** Строения, которые можно ставить на уровне; нет списка — строить нельзя. */
  buildings?: BuildingKind[];
  /** Обучение на этом уровне: какие шаги подсказывать и где на поле стоит текст подсказки (центр и ширина). */
  tutorial?: { steps: TutorialStep[]; at: Point; width: number };
}

export type TutorialStep = 'summon' | 'merge' | 'hybrid' | 'meteor';

export interface TutorialRules {
  /** Про призыв подсказываем, пока игрок не призвал столько котов. */
  summons: number;
  /** Про метеор — когда на поле столько врагов. */
  meteorEnemies: number;
  /** Сколько секунд должен продержаться повод, чтобы подсказка появилась. */
  delay: number;
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
  tutorial: TutorialRules;
  levels: LevelConfig[];
}

export type GearSlot = 'staff' | 'mantle' | 'amulet';

/** Бонусы предмета; с уровнем предмета меняются только они. */
export interface GearStats {
  summonWeight?: number;
  /** Множитель цены призыва сверх лимита волны. */
  overLimitCostMult?: number;
  meteorCooldownMult?: number;
  ritualTimeMult?: number;
  bonusCrystals?: number;
  bonusGold?: number;
}

export interface GearItem extends GearStats {
  id: string;
  element?: ElementId;
  /**
   * Прокачка: бонусы 2-го, 3-го и следующих уровней; на 1-м уровне действуют бонусы самого предмета.
   * Нет списка — предмет не прокачивается.
   */
  upgrades?: GearStats[];
}

export interface GearConfig extends Record<GearSlot, GearItem[]> {
  ritual: { time: number; crystalCost: number };
  meteor: {
    cooldown: number;
    damage: number;
    damageGrowthPerWave: number;
    radius: number;
    burnDps: number;
    burnTime: number;
  };
  /** Цена прокачки в рыбках: до 2-го уровня, до 3-го и так далее. */
  upgradeCost: number[];
  /**
   * Сундуки: сколько всего звёзд нужно для каждого по порядку, сколько рыбок лежит в сундуке с предметом
   * и сколько — в сундуке, когда все предметы уже собраны.
   */
  chests: { stars: number[]; fish: number; fishInstead: number };
  /** Предметы, которые есть у игрока с начала игры и надеты по умолчанию. */
  defaults: Record<GearSlot, string>;
}

export interface EconomyConfig {
  summon: {
    /** Цена кота: одна и та же весь бой. */
    cost: number;
    /** Сколько призывов по обычной цене даёт каждая волна; остаток на следующую волну не переходит. */
    perWave: number;
    /** Лимит до начала первой волны. */
    beforeFirstWave: number;
    /** Во сколько раз дороже первый, второй и следующие призывы сверх лимита; дальше действует последний множитель. */
    overLimitMult: number[];
  };
  /** Продажа через корзину: какая доля вложенных монет возвращается. */
  sell: { refund: number };
  buildings: {
    /** Сколько строений одного вида можно поставить на уровне. */
    maxPerKind: number;
    /** Уровни каждого строения по порядку: первый — постройка, следующие — улучшения. */
    kinds: Record<BuildingKind, BuildingLevel[]>;
  };
}

/** Рыбная лавка, кристальная шахта, алтарь кошачьей мяты. */
export type BuildingKind = 'shop' | 'mine' | 'altar';

/** Строение на одном уровне: цена перехода на него и то, что оно даёт. */
export interface BuildingLevel {
  /** Цена постройки (у первого уровня) или улучшения до этого уровня. */
  cost: number;
  /** Монеты и кристаллы в начале волны — раз в `everyWaves` волн (по умолчанию каждую). */
  gold?: number;
  crystals?: number;
  everyWaves?: number;
  /** Прибавка к лимиту призывов волны. */
  summonLimit?: number;
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

export type StorySpeaker = 'archmage' | 'king' | 'mouse';

export interface StoryLine {
  speaker: StorySpeaker;
  /** Ключ строки в i18n. */
  text: string;
}

/** Сценка из нескольких реплик перед уровнем `before`. */
export interface StoryScene {
  id: string;
  before: string;
  lines: StoryLine[];
}

export interface StoryConfig {
  scenes: StoryScene[];
}
