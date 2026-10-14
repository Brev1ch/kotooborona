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

export type EnemyTypeId = 'mouse' | 'rat' | 'shield' | 'boots' | 'fire' | 'shaman' | 'mole' | 'ninja' | 'bat' | 'boss' | 'king';

/** Эффекты, которые коты накладывают на врага. Заморозка — отдельный от замедления эффект ледяного кота. */
/** Походка врага; та же, что `EnemyMotion` в `feel.ts`. */
export type EnemyMotion = 'waddle' | 'heavy' | 'hover' | 'burrow';

export type StatusId = 'slow' | 'freeze' | 'burn' | 'poison';

export interface EnemyTypeConfig {
  color: string;
  /** Во сколько раз враг на картинке крупнее обычной мыши: картинка — квадрат стороной `enemyFrame` из art.json, умноженной на это. */
  size: number;
  /** Множитель к базовому HP волны. */
  hp: number;
  speed: number;
  gold: number;
  radius: number;
  lifeDamage: number;
  shield: number;
  crystalChance: number;
  crystalDrop: number;
  /** С какой волны уровня выходит; до неё вместо него идут мыши. Без поля — с первой. */
  fromWave?: number;
  /** Замедляется слабее остальных: командиры и король. */
  slowResist?: boolean;
  /** Эти эффекты на врага не ложатся. */
  immune?: StatusId[];
  /** Множитель урона от стихии кота, включая её огонь и яд; 0 — урона нет вовсе. Стихий, которых здесь нет, это не касается. */
  resist?: Partial<Record<ElementId, number>>;
  /** Лечит соседей: каждые `interval` секунд всем в радиусе `radius` возвращает долю `part` их полного здоровья. Себя и других лекарей не лечит. */
  heal?: { radius: number; part: number; interval: number };
  /** Подкоп: на участке пути между долями `from` и `to` враг под землёй — неуязвим и не виден котам. */
  burrow?: { from: number; to: number };
  /** Уклоняется от каждого N-го летящего в него снаряда. Урон по площади, перескок молнии и буря попадают всегда. */
  dodgeEvery?: number;
  /** Летает: достают только коты этих стихий. Метеор падает сверху и бьёт всегда. */
  flying?: { hitBy: ElementId[] };
  /** Призывает подмогу: каждые `interval` секунд рядом появляются `count` врагов типа `type` на расстоянии `spread` друг от друга. */
  summon?: { type: EnemyTypeId; count: number; interval: number; spread: number };
  /**
   * Как враг двигается на поле (`entities/motion.ts`): `waddle` — вперевалку, `heavy` — вперевалку тяжело (король),
   * `hover` — летит и качается, `burrow` — вперевалку и уходит под землю. Задано в данных, чтобы готовые картинки встали без правок кода.
   */
  motion: EnemyMotion;
}

export interface EnemiesConfig {
  baseHp: number;
  hpGrowthPerWave: number;
  bossSlowResist: number;
  types: Record<EnemyTypeId, EnemyTypeConfig>;
}

/** Фон поля: один на несколько уровней (`background` в levels.json и в art.json). */
export type BackgroundId = 'forest' | 'stream' | 'ravine' | 'camp';

export interface LevelConfig {
  id: string;
  /** Фон поля уровня; дорогу поверх него рисует игра по `path`. */
  background: BackgroundId;
  /** Координаты в системе игрового поля (см. layout.ts). */
  path: Point[];
  /** Левый верхний угол каждой клетки. */
  slots: Point[];
  hero: Point;
  waves: number;
  bossWaves: number[];
  /** Волна, на которой вместе с обычными врагами выходит Крысиный король. */
  kingWave?: number;
  maxCatLevel: number;
  startGold: number;
  startCrystals: number;
  startLives: number;
  hpMult: number;
  /** Состав обычных волн: доля каждого типа от 0 до 1, остальные — мыши. Порядок записи важен: бросок сверяется с долями по очереди. */
  enemies: Partial<Record<EnemyTypeId, number>>;
  /** Враг, который впервые выходит на этом уровне: перед боем игроку показывают его карточку. */
  intro?: EnemyTypeId;
  /** Рыбки за первое прохождение на одну звезду. */
  fish: number;
  /** Строения, которые можно ставить на уровне; нет списка — строить нельзя. */
  buildings?: BuildingKind[];
  /** Обучение на этом уровне: какие шаги подсказывать и где на поле стоит текст подсказки (центр и ширина). */
  tutorial?: { steps: TutorialStep[]; at: Point; width: number };
}

export type TutorialStep = 'summon' | 'merge' | 'hybrid' | 'meteor' | 'limit' | 'sell' | 'build';

export interface TutorialRules {
  /** Про призыв подсказываем, пока игрок не призвал столько котов. */
  summons: number;
  /** Про метеор — когда на поле столько врагов. */
  meteorEnemies: number;
  /** Сколько секунд должен продержаться повод, чтобы подсказка появилась. */
  delay: number;
  /** Про продажу — когда свободных клеток осталось не больше, а на поле есть кот без пары. */
  sellFreeSlots: number;
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

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Виды бонусов, из которых собирается предмет. */
export type BonusKind =
  | 'summonChance'
  | 'summonLimit'
  | 'overLimitCost'
  | 'elementDamage'
  | 'meteorCooldown'
  | 'ritualTime'
  | 'gold'
  | 'crystals'
  | 'buildingIncome'
  | 'level2Chance';

/**
 * Правило бонуса в пуле. Значение бонуса — его сила: у шанса стихии это вес стихии при призыве (1 — как у остальных),
 * у скидок и прибавок — доля (0.2 — на двадцать процентов), у монет, кристаллов и лимита — штуки.
 */
export interface BonusRule {
  /** В каких слотах бонус может выпасть. */
  slots: GearSlot[];
  /**
   * Слоты, для которых бонус характерен: первый бонус нового предмета всегда из таких, и по нему предмет назван
   * («Огненный посох», «Мантия бережливости»). Без списка бонус выпадает только вторым и дальше.
   */
  main?: GearSlot[];
  min: number;
  max: number;
  /** Значение округляется до кратного шагу. */
  step: number;
  /** Растёт ли бонус с уровнем предмета. */
  scales: boolean;
  /** Выше этого бонус не поднимается даже с прокачкой. */
  cap?: number;
  /** Бонус привязан к базовой стихии, она выбирается случайно. */
  element?: boolean;
  /** Бонус выпадает только у этих редкостей; без списка — у любой. */
  rarities?: Rarity[];
}

export interface RarityRule {
  /** Сколько бонусов у предмета. */
  bonuses: number;
  /** Из какой части диапазона бонуса берётся значение: 0 — минимум, 1 — максимум. */
  roll: [number, number];
  /** Шанс выпадения из сундука; по всем редкостям в сумме 1. */
  chance: number;
  /** Сколько осколков даёт разбор. */
  shards: number;
}

/** Легендарный предмет: слот и уникальное правило с его числами. */
export interface LegendaryRule {
  id: string;
  slot: GearSlot;
  unique: 'burningGround' | 'freeSummon';
  /** Горящая зона метеора: доля урона взрыва в секунду и сколько секунд горит. */
  burnDps?: number;
  time?: number;
  /** Каждый какой по счёту призыв бесплатный. */
  every?: number;
}

export interface ItemsConfig {
  inventoryLimit: number;
  rarities: Record<Rarity, RarityRule>;
  pool: Record<BonusKind, BonusRule>;
  /** Прокачка: каждый уровень усиливает растущие бонусы на долю `power`; цены — до 2-го уровня, до 3-го и так далее. */
  upgrade: { maxLevel: number; power: number; shards: number[]; fish: number[] };
  legendaries: LegendaryRule[];
}

export interface GearConfig extends Record<GearSlot, GearItem[]> {
  /** Предметы со случайными бонусами: редкости, пул бонусов, прокачка, легендарные. */
  items: ItemsConfig;
  ritual: { time: number; crystalCost: number };
  meteor: {
    cooldown: number;
    damage: number;
    damageGrowthPerWave: number;
    radius: number;
    burnDps: number;
    burnTime: number;
  };
  /**
   * Сундуки: сколько всего звёзд нужно для каждого по порядку и сколько рыбок лежит в сундуке вместе с предметом.
   * `small` — малый сундук: шанс найти его за победу, рыбки в нём и свои шансы редкости предмета.
   */
  chests: { stars: number[]; fish: number; small: { chance: number; fish: number; rarities: Record<Rarity, number> } };
  /**
   * Списки `staff`, `mantle`, `amulet` — снаряжение до инвентаря: по ним старые сохранения переводятся в предметы.
   * `defaults` — три предмета из этих списков, с которыми начинает новый игрок.
   */
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
    /** Во сколько раз дороже первый, второй и следующие призывы сверх лимита. */
    overLimitMult: number[];
    /** Когда список кончился, множитель растёт на столько с каждым призывом: штраф не останавливается. */
    overLimitGrowth: number;
  };
  /** Продажа через корзину: какая доля вложенных монет возвращается. */
  sell: { refund: number };
  buildings: {
    /** Сколько строений одного вида можно поставить на уровне; `maxOf` задаёт своё число для отдельных видов. */
    maxPerKind: number;
    maxOf?: Partial<Record<BuildingKind, number>>;
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
  /** Сундук за наградной ролик в меню: пауза до следующего, секунды настоящего времени. */
  chest: { cooldown: number };
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

/** Группа картинок: по ней собран список для художника и выбран атлас. */
export type ArtGroup = 'cats' | 'enemies' | 'hero' | 'buildings' | 'items' | 'icons' | 'buttons' | 'portraits' | 'backgrounds';

/** Картинка, которую ждёт игра. Пока файла нет, на её месте — рисунок кодом. */
export interface ArtImage {
  id: string;
  /** Исходник в `assets-src/art/`. */
  file: string;
  /** Размер готовой картинки в пикселях: логический размер на экране, умноженный на `scale` манифеста. */
  width: number;
  height: number;
  group: ArtGroup;
  /** Что нарисовано — для списка художнику. */
  use: string;
  /** Атлас, в который картинка собирается; без поля — отдельный файл. Атласы грузятся при запуске. */
  atlas?: string;
  /** Как обрезанная картинка встаёт в свой размер: `bottom` — по нижнему краю (коты стоят на земле); без поля — по центру. */
  align?: 'bottom';
  /**
   * Коты и враги: ручная поправка размера тела к общему масштабу (`npm run art` выравнивает их по высоте от лап до щёк).
   * 1.1 — фигура на десятую крупнее остальных; без поля — 1.
   */
  scale?: number;
  /**
   * Точки на картинке, к которым игра привязывает эффекты, в долях её ширины и высоты от левого верхнего угла:
   * `crystal` — кристалл на посохе шамана (вспышка при лечении), `orb` — навершие посоха героя (там игра рисует сферу).
   */
  anchors?: Record<string, [number, number]>;
  /** Только у врагов: картинка не своего типа, а его состояния (щитоносец со сломанным щитом) — размер как у этого типа. */
  sizeOf?: EnemyTypeId;
  /** Фон кнопки: края такой ширины в пикселях не растягиваются. */
  slice?: number;
  /** Фон поля: грузится при входе в уровень с этим фоном (`background` в levels.json). */
  background?: BackgroundId;
}

export interface ArtConfig {
  /** Во сколько раз картинки крупнее логических размеров экрана. */
  scale: number;
  /** Сторона картинки обычной мыши в пикселях; у других врагов — умноженная на их `size` в enemies.json. */
  enemyFrame: number;
  images: ArtImage[];
}
