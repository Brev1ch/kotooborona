import type { CatsConfig, ElementId, EnemiesConfig, EnemyTypeId, GearConfig, GearSlot } from '../data/types';
import type { ChestLoot } from './Chests';
import { findGear, GEAR_SLOTS, gearKey, maxGearLevel, upgradeCost } from './Gear';

export { GEAR_SLOTS };
export const SAVE_KEY = 'save';
export const MAX_STARS = 3;

/** Облачные сохранения площадки не любят частых записей: изменения копятся и уходят одной записью. */
const SAVE_DELAY_MS = 1000;

export type GearSelection = Record<GearSlot, string>;

/** То, что лежит в хранилище площадки. */
export interface SaveData {
  version: number;
  /** Лучший результат по id уровня; непройденных уровней здесь нет. */
  stars: Record<string, number>;
  /** Предмет в каждом слоте. В сохранении новее кода здесь может быть незнакомый id. */
  gear: GearSelection;
  /** Открытые коты. В сохранении новее кода здесь могут быть и незнакомые стихии. */
  book: string[];
  /** Звук включён. */
  sound: boolean;
  /** Рыбки: валюта между уровнями. */
  fish: number;
  /** Предметы снаряжения, которые есть у игрока; ключи — `gearKey`. Предметы по умолчанию есть всегда. */
  owned: string[];
  /** Уровни прокачки предметов по `gearKey`; предметов первого уровня здесь нет. */
  gearLevels: Record<string, number>;
  /** Сколько сундуков открыто. */
  chests: number;
  /** Враги, которых игрок уже побеждал: они открыты в бестиарии. В сохранении новее кода здесь могут быть и незнакомые типы. */
  bestiary: string[];
}

type RawSave = Record<string, unknown>;

/** Переводит сохранение на следующую версию. */
export type Migration = (save: RawSave) => RawSave;

/**
 * Миграции по порядку: элемент с индексом i переводит версию i+1 в i+2.
 * Текущая версия сохранения — на единицу больше длины списка. Меняешь структуру — добавь миграцию в конец.
 */
const MIGRATIONS: readonly Migration[] = [
  // 1 → 2: появились рыбки.
  (save) => ({ ...save, fish: 0 }),
  // 2 → 3: предметы теперь выпадают из сундуков и прокачиваются. До этого игроку были доступны все — оставляем их ему.
  (save) => ({ ...save, owned: [...GEAR_BEFORE_CHESTS], gearLevels: {}, chests: 0 }),
  // 3 → 4: появился бестиарий. Тех, кого игрок наверняка уже побеждал, открываем по пройденным уровням.
  (save) => ({ ...save, bestiary: enemiesMetBeforeBestiary(save.stars) }),
];

/** Уровни, на которых до появления бестиария (версии сохранения 1–3) выходили щитоносцы, и уровень с королём. */
const SHIELD_LEVELS_BEFORE_BESTIARY = ['polyana', 'ovrag', 'burelom', 'melnitsa', 'most', 'lager'];
const KING_LEVEL_BEFORE_BESTIARY = 'lager';

/**
 * Враги, побеждённые до появления бестиария. Мыши, крысы и командир были на каждом уровне,
 * щитоносцы — с пятого, король — на последнем: пройденный уровень значит, что игрок их убивал.
 */
function enemiesMetBeforeBestiary(stars: unknown): string[] {
  if (!isRecord(stars)) return [];
  const passed = Object.keys(stars).filter((id) => typeof stars[id] === 'number' && (stars[id] as number) >= 1);
  if (passed.length === 0) return [];
  const met = ['mouse', 'rat'];
  if (passed.some((id) => SHIELD_LEVELS_BEFORE_BESTIARY.includes(id))) met.push('shield');
  met.push('boss');
  if (passed.includes(KING_LEVEL_BEFORE_BESTIARY)) met.push('king');
  return met;
}

/** Всё снаряжение, которое было в игре до появления сундуков (версии сохранения 1 и 2). */
const GEAR_BEFORE_CHESTS = [
  'staff:none',
  'staff:fire',
  'staff:water',
  'staff:earth',
  'staff:air',
  'mantle:thrift',
  'mantle:sorc',
  'amulet:alch',
  'amulet:cry',
  'amulet:purse',
];

/** Версия, в которой игра пишет сохранение. */
export const CURRENT_VERSION = MIGRATIONS.length + 1;

/** Конфиги, по которым проверяется содержимое сохранения. */
export interface SaveRules {
  gear: GearConfig;
  cats: CatsConfig;
  enemies: EnemiesConfig;
}

export interface ParsedSave {
  data: SaveData;
  /** Незнакомые поля сохранения новее кода: при записи возвращаются в хранилище как были. */
  extra: RawSave;
}

/** Часть интерфейса площадки, нужная прогрессу. */
export interface SaveStorage {
  load<T>(key: string, fallback: T): Promise<T>;
  save<T>(key: string, value: T): Promise<void>;
}

const KNOWN_FIELDS = ['version', 'stars', 'gear', 'book', 'sound', 'fish', 'owned', 'gearLevels', 'chests', 'bestiary'];

function isRecord(value: unknown): value is RawSave {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Предметы, которые есть у игрока с начала игры. */
function starterGear(rules: SaveRules): string[] {
  return GEAR_SLOTS.map((slot) => gearKey(slot, rules.gear.defaults[slot]));
}

/** Слот и предмет по ключу из сохранения; null — такого предмета в игре нет. */
function gearByKey(rules: SaveRules, key: string): { slot: GearSlot; id: string } | null {
  const [slot, id] = key.split(':') as [GearSlot, string | undefined];
  if (!GEAR_SLOTS.includes(slot) || id === undefined || !findGear(rules.gear, slot, id)) return null;
  return { slot, id };
}

export function defaultSave(rules: SaveRules, version = MIGRATIONS.length + 1): SaveData {
  return {
    version,
    stars: {},
    gear: { ...rules.gear.defaults },
    book: [],
    sound: true,
    fish: 0,
    owned: starterGear(rules),
    gearLevels: {},
    chests: 0,
    bestiary: [],
  };
}

/**
 * Разбирает то, что пришло из хранилища: старое сохранение доводит миграциями до текущей версии,
 * испорченные поля заменяет значениями по умолчанию. Сохранение новее кода читается как есть и версию не теряет.
 */
export function parseSave(raw: unknown, rules: SaveRules, migrations: readonly Migration[] = MIGRATIONS): ParsedSave {
  const current = migrations.length + 1;
  if (!isRecord(raw) || !Number.isInteger(raw.version) || (raw.version as number) < 1) {
    return { data: defaultSave(rules, current), extra: {} };
  }

  const version = raw.version as number;
  const newer = version > current;
  let save = raw;
  for (let v = version; v < current; v++) save = migrations[v - 1](save);

  const data = defaultSave(rules, Math.max(version, current));

  if (isRecord(save.stars)) {
    for (const [levelId, value] of Object.entries(save.stars)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const stars = Math.min(MAX_STARS, Math.floor(value));
      if (stars > 0) data.stars[levelId] = stars;
    }
  }

  if (isRecord(save.gear)) {
    for (const slot of GEAR_SLOTS) {
      const id = save.gear[slot];
      // Предмет из будущей версии остаётся в сохранении; в бою вместо него работает предмет по умолчанию.
      const known = rules.gear[slot].some((item) => item.id === id);
      if (known || (newer && typeof id === 'string')) data.gear[slot] = id as string;
    }
  }

  if (Array.isArray(save.book)) {
    const cats = save.book.filter((id): id is string => typeof id === 'string');
    // Кот из будущей версии этой игре незнаком, но у игрока он открыт — не теряем.
    data.book = [...new Set(newer ? cats : cats.filter((id) => id in rules.cats.elements))];
  }

  // Поля нет в сохранениях, сделанных до появления звука: остаётся включённым.
  if (typeof save.sound === 'boolean') data.sound = save.sound;

  if (typeof save.fish === 'number' && Number.isFinite(save.fish)) data.fish = Math.max(0, Math.floor(save.fish));

  if (Array.isArray(save.owned)) {
    const keys = save.owned.filter((key): key is string => typeof key === 'string');
    // Предмет из будущей версии этой игре незнаком, но у игрока он есть — не теряем.
    data.owned = [...new Set([...data.owned, ...keys.filter((key) => newer || gearByKey(rules, key) !== null)])];
  }

  if (isRecord(save.gearLevels)) {
    for (const [key, value] of Object.entries(save.gearLevels)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const found = gearByKey(rules, key);
      const item = found && findGear(rules.gear, found.slot, found.id);
      if (!item) {
        if (newer) data.gearLevels[key] = value;
        continue;
      }
      // Уровень выше известного этой версии (сохранение новее кода) остаётся в сохранении; в бою он прижмётся к наибольшему.
      const level = newer ? Math.floor(value) : Math.min(maxGearLevel(item), Math.floor(value));
      if (level > 1) data.gearLevels[key] = level;
    }
  }

  if (typeof save.chests === 'number' && Number.isFinite(save.chests)) data.chests = Math.max(0, Math.floor(save.chests));

  if (Array.isArray(save.bestiary)) {
    const types = save.bestiary.filter((id): id is string => typeof id === 'string');
    // Враг из будущей версии этой игре незнаком, но у игрока он открыт — не теряем.
    data.bestiary = [...new Set(newer ? types : types.filter((id) => id in rules.enemies.types))];
  }

  const extra: RawSave = {};
  if (newer) {
    for (const [field, value] of Object.entries(save)) {
      if (!KNOWN_FIELDS.includes(field)) extra[field] = value;
    }
  }
  return { data, extra };
}

/** Прогресс игрока между уровнями: звёзды, выбранное снаряжение, книга котов, бестиарий. */
export class Progress {
  private data: SaveData;
  private extra: RawSave = {};
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly storage: SaveStorage,
    private readonly rules: SaveRules,
    private readonly delayMs = SAVE_DELAY_MS,
  ) {
    this.data = defaultSave(rules);
  }

  /** Читает сохранение площадки; вызывается один раз до первого экрана. */
  async load(): Promise<void> {
    const raw = await this.storage.load<unknown>(SAVE_KEY, null);
    ({ data: this.data, extra: this.extra } = parseSave(raw, this.rules));
  }

  /** Лучший результат уровня; 0 — уровень ещё не пройден. */
  stars(levelId: string): number {
    return this.data.stars[levelId] ?? 0;
  }

  /** Запоминает результат уровня, если он лучше прежнего. */
  recordStars(levelId: string, stars: number): void {
    if (stars <= this.stars(levelId)) return;
    this.data.stars[levelId] = Math.min(MAX_STARS, stars);
    this.touch();
  }

  /** Сумма лучших результатов по всем уровням: за неё открываются сундуки. */
  get totalStars(): number {
    return Object.values(this.data.stars).reduce((sum, stars) => sum + stars, 0);
  }

  /** Надетые предметы; вместо незнакомого этой версии игры и вместо того, которого у игрока нет, — предмет по умолчанию. */
  get gear(): Readonly<GearSelection> {
    const { gear } = this.rules;
    const worn = { ...this.data.gear };
    for (const slot of GEAR_SLOTS) {
      if (!findGear(gear, slot, worn[slot]) || !this.ownsGear(slot, worn[slot])) worn[slot] = gear.defaults[slot];
    }
    return worn;
  }

  /** Надевает предмет в слот. Уже надетый, чужой для слота и ещё не полученный предмет сохранение не меняют. */
  selectGear(slot: GearSlot, id: string): void {
    if (this.gear[slot] === id || !findGear(this.rules.gear, slot, id) || !this.ownsGear(slot, id)) return;
    this.data.gear[slot] = id;
    this.touch();
  }

  ownsGear(slot: GearSlot, id: string): boolean {
    return this.data.owned.includes(gearKey(slot, id));
  }

  /** Уровень прокачки предмета; у непрокачанного и незнакомого — 1. */
  gearLevel(slot: GearSlot, id: string): number {
    const item = findGear(this.rules.gear, slot, id);
    if (!item) return 1;
    return Math.min(maxGearLevel(item), this.data.gearLevels[gearKey(slot, id)] ?? 1);
  }

  /**
   * Поднимает уровень предмета на один за рыбки. Возвращает false и ничего не меняет,
   * если предмета у игрока нет, он уже на последнем уровне или рыбок не хватает.
   */
  upgradeGear(slot: GearSlot, id: string): boolean {
    const item = findGear(this.rules.gear, slot, id);
    if (!item || !this.ownsGear(slot, id)) return false;
    const level = this.gearLevel(slot, id);
    const cost = upgradeCost(this.rules.gear, item, level);
    if (cost === null || !this.spendFish(cost)) return false;
    this.data.gearLevels[gearKey(slot, id)] = level + 1;
    this.touch();
    return true;
  }

  get chestsOpened(): number {
    return this.data.chests;
  }

  /** Забирает содержимое сундука: счёт открытых сундуков растёт, предмет и рыбки переходят игроку. */
  claimChest(loot: ChestLoot): void {
    this.data.chests++;
    if (loot.item) {
      const key = gearKey(loot.item.slot, loot.item.id);
      if (!this.data.owned.includes(key)) this.data.owned.push(key);
    }
    this.data.fish += Math.max(0, Math.floor(loot.fish));
    this.touch();
  }

  hasCat(element: ElementId): boolean {
    return this.data.book.includes(element);
  }

  /** Заносит кота в книгу. Возвращает true, если он открыт впервые. */
  discover(element: ElementId): boolean {
    if (this.hasCat(element)) return false;
    this.data.book.push(element);
    this.touch();
    return true;
  }

  /** Враг открыт в бестиарии. */
  hasEnemy(type: EnemyTypeId): boolean {
    return this.data.bestiary.includes(type);
  }

  /** Заносит побеждённого врага в бестиарий. Возвращает true, если он побеждён впервые. */
  meetEnemy(type: EnemyTypeId): boolean {
    if (this.hasEnemy(type)) return false;
    this.data.bestiary.push(type);
    this.touch();
    return true;
  }

  get soundOn(): boolean {
    return this.data.sound;
  }

  setSound(on: boolean): void {
    if (this.data.sound === on) return;
    this.data.sound = on;
    this.touch();
  }

  get fish(): number {
    return this.data.fish;
  }

  addFish(amount: number): void {
    if (amount <= 0) return;
    this.data.fish += Math.floor(amount);
    this.touch();
  }

  /** Списывает рыбки. Возвращает false и ничего не меняет, если их не хватает. */
  spendFish(amount: number): boolean {
    if (amount < 0 || this.data.fish < amount) return false;
    this.data.fish -= amount;
    this.touch();
    return true;
  }

  /** Пишет накопленные изменения сразу, не дожидаясь задержки. Без изменений ничего не пишет. */
  flush(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return;
    this.dirty = false;
    const { version, stars, gear, book, sound, fish, owned, gearLevels, chests, bestiary } = this.data;
    const snapshot = {
      ...this.extra,
      version,
      stars: { ...stars },
      gear: { ...gear },
      book: [...book],
      sound,
      fish,
      owned: [...owned],
      gearLevels: { ...gearLevels },
      chests,
      bestiary: [...bestiary],
    };
    // Не записалось — изменения уйдут со следующей записью.
    this.storage.save(SAVE_KEY, snapshot).catch(() => {
      this.dirty = true;
    });
  }

  /** Отмечает изменение; запись уйдёт через `delayMs` вместе со всем, что изменится за это время. */
  private touch(): void {
    this.dirty = true;
    this.timer ??= setTimeout(() => this.flush(), this.delayMs);
  }
}
