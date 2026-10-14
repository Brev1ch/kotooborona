import type { CatsConfig, ElementId, EnemiesConfig, EnemyTypeId, GearConfig, GearSlot } from '../data/types';
import { LANGS, type Lang } from '../platform/Platform';
import type { ChestLoot, ChestSource, PendingChests } from './Chests';
import { GEAR_SLOTS, gearKey } from './Gear';
import { legacyItem, RARITIES, salvageShards, upgradePrice, type Item, type ItemBonus } from './Items';

export { GEAR_SLOTS };
export const SAVE_KEY = 'save';
export const MAX_STARS = 3;

/** Облачные сохранения площадки не любят частых записей: изменения копятся и уходят одной записью. */
const SAVE_DELAY_MS = 1000;

/** Надетые предметы: id предмета инвентаря в каждом слоте; null — слот пуст. */
export type WornItems = Record<GearSlot, string | null>;

/** То, что лежит в хранилище площадки. */
export interface SaveData {
  version: number;
  /** Лучший результат по id уровня; непройденных уровней здесь нет. */
  stars: Record<string, number>;
  /** Предметы игрока: и надетые, и лежащие в инвентаре. */
  items: Item[];
  /** Какой предмет надет в каждом слоте. */
  worn: WornItems;
  /** Осколки: остаются от разобранных предметов, идут на прокачку. */
  shards: number;
  /** Номер для id следующего предмета: id в сохранении не повторяются. */
  nextItem: number;
  /** Открытые коты. В сохранении новее кода здесь могут быть и незнакомые стихии. */
  book: string[];
  /** Звуки включены. */
  sound: boolean;
  /** Музыка включена: отдельно от звуков. */
  music: boolean;
  /** Рыбки: валюта между уровнями. */
  fish: number;
  /** Сколько сундуков открыто. */
  chests: number;
  /** Враги, которых игрок уже побеждал: они открыты в бестиарии. В сохранении новее кода здесь могут быть и незнакомые типы. */
  bestiary: string[];
  /** Уровни, за первое прохождение которых на три звезды сундук уже выдан. */
  perfect: string[];
  /** Заработанные, но ещё не открытые сундуки. */
  pending: PendingChests;
  /** Когда взят последний сундук за рекламу: время в миллисекундах; 0 — ещё не брали. */
  adChestAt: number;
  /** Обучение на первом уровне пройдено или пропущено: показывается один раз, «Пройти обучение заново» сбрасывает. */
  onboarded: boolean;
  /** Подсказки при первой встрече, которые игрок уже видел (`inventory`, `chest`, `build`): каждая — один раз. */
  hintsSeen: string[];
  /** Язык, выбранный игроком в настройках; null — язык площадки. Выбор игрока важнее языка из SDK. */
  lang: Lang | null;
}

type RawSave = Record<string, unknown>;

/** Переводит сохранение на следующую версию; `rules` — конфиги игры, если миграции нужны данные из них. */
export type Migration = (save: RawSave, rules: SaveRules) => RawSave;

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
  // 4 → 5: появился инвентарь. Каждый предмет старого снаряжения становится предметом инвентаря с теми же бонусами, надетое остаётся надетым.
  ({ gear, owned, gearLevels, ...save }, rules) => ({ ...save, ...inventoryFromOldGear(rules, gear, owned, gearLevels) }),
  // 5 → 6: сундук за первое прохождение уровня на три звезды, малые сундуки и сундук за рекламу. За уже пройденные на три звезды уровни сундуки выдаются сразу.
  (save) => ({ ...save, ...chestsForPerfectLevels(save.stars) }),
  // 6 → 7: у музыки свой выключатель. Кто выключил звук, когда выключатель был один, остаётся и без музыки.
  (save) => ({ ...save, music: save.sound !== false }),
  // 7 → 8: интерактивное обучение на первом уровне. Кто уже проходил уровни, умеет играть: ему обучение не показывается.
  (save) => ({ ...save, onboarded: isRecord(save.stars) && Object.values(save.stars).some((value) => typeof value === 'number' && value >= 1) }),
  // 8 → 9: подсказки при первой встрече. Кто уже проходил уровни, видел снаряжение и сундуки: им они не нужны.
  (save) => ({ ...save, hintsSeen: save.onboarded === true ? [...HINTS_FOR_PLAYERS] : [] }),
  // 9 → 10: язык можно выбрать в настройках. Раньше его не выбирали: остаётся язык площадки.
  (save) => ({ ...save, lang: null }),
];

/** Подсказки, которые не показываются игроку, уже проходившему уровни до их появления. */
const HINTS_FOR_PLAYERS = ['inventory', 'chest', 'build'];

/** Сундуки за уровни, пройденные на три звезды до того, как за это стали давать сундук: по одному за каждый. */
function chestsForPerfectLevels(stars: unknown): Pick<SaveData, 'perfect' | 'pending' | 'adChestAt'> {
  const perfect = isRecord(stars) ? Object.keys(stars).filter((id) => typeof stars[id] === 'number' && (stars[id] as number) >= MAX_STARS) : [];
  return { perfect, pending: { big: perfect.length, small: 0 }, adChestAt: 0 };
}

/**
 * Инвентарь из снаряжения версий 1–4: у игрока были предметы из списка (`owned`, ключи `слот:id`) с уровнями прокачки
 * (`gearLevels`) и по одному надетому на слот (`gear`). Сила бонусов сохраняется такой, какой была на уровне предмета.
 */
function inventoryFromOldGear(rules: SaveRules, gear: unknown, owned: unknown, gearLevels: unknown): Pick<SaveData, 'items' | 'worn' | 'shards' | 'nextItem'> {
  const levels = isRecord(gearLevels) ? gearLevels : {};
  // Предметы по умолчанию были у игрока всегда, даже если в списке их нет.
  const keys = [...starterKeys(rules), ...(Array.isArray(owned) ? owned.filter((key): key is string => typeof key === 'string') : [])];
  const items: Item[] = [];
  const idByKey = new Map<string, string>();
  for (const key of new Set(keys)) {
    const [slot, legacyId] = key.split(':') as [GearSlot, string | undefined];
    if (!GEAR_SLOTS.includes(slot) || legacyId === undefined) continue;
    const level = typeof levels[key] === 'number' && Number.isFinite(levels[key]) ? Math.max(1, Math.floor(levels[key] as number)) : 1;
    const item = legacyItem(rules.gear, slot, legacyId, level, `i${items.length + 1}`);
    if (!item) continue;
    items.push(item);
    idByKey.set(key, item.id);
  }
  const selected = isRecord(gear) ? gear : {};
  const worn = {} as WornItems;
  for (const slot of GEAR_SLOTS) {
    const chosen = typeof selected[slot] === 'string' ? idByKey.get(gearKey(slot, selected[slot] as string)) : undefined;
    worn[slot] = chosen ?? idByKey.get(gearKey(slot, rules.gear.defaults[slot])) ?? null;
  }
  return { items, worn, shards: 0, nextItem: items.length + 1 };
}

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
  /** Предметы сохранения новее кода, которые эта версия игры разобрать не смогла: при записи возвращаются как были. */
  foreignItems: unknown[];
  /** Незнакомые поля сохранения новее кода: при записи возвращаются в хранилище как были. */
  extra: RawSave;
}

/** Часть интерфейса площадки, нужная прогрессу. */
export interface SaveStorage {
  load<T>(key: string, fallback: T): Promise<T>;
  save<T>(key: string, value: T): Promise<void>;
}

const KNOWN_FIELDS = ['version', 'stars', 'items', 'worn', 'shards', 'nextItem', 'book', 'sound', 'music', 'fish', 'chests', 'bestiary', 'perfect', 'pending', 'adChestAt'];

function isRecord(value: unknown): value is RawSave {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Ключи предметов старого снаряжения, которые были у игрока с начала игры. */
function starterKeys(rules: SaveRules): string[] {
  return GEAR_SLOTS.map((slot) => gearKey(slot, rules.gear.defaults[slot]));
}

const BONUS_KINDS: readonly string[] = [
  'summonChance',
  'summonLimit',
  'overLimitCost',
  'elementDamage',
  'meteorCooldown',
  'ritualTime',
  'gold',
  'crystals',
  'buildingIncome',
  'level2Chance',
];

/** Бонус предмета из сохранения; null — запись испорчена. */
function parseBonus(raw: unknown, rules: SaveRules): ItemBonus | null {
  if (!isRecord(raw) || typeof raw.kind !== 'string' || !BONUS_KINDS.includes(raw.kind)) return null;
  if (typeof raw.value !== 'number' || !Number.isFinite(raw.value)) return null;
  const bonus: ItemBonus = { kind: raw.kind as ItemBonus['kind'], value: raw.value };
  if (raw.element === undefined) return bonus;
  if (typeof raw.element !== 'string' || !(raw.element in rules.cats.elements)) return null;
  return { ...bonus, element: raw.element as ElementId };
}

/** Предмет из сохранения; null — запись испорчена или предмет этой версии игры незнаком. */
function parseItem(raw: unknown, rules: SaveRules): Item | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
  if (!GEAR_SLOTS.includes(raw.slot as GearSlot) || !RARITIES.includes(raw.rarity as Item['rarity'])) return null;
  if (!Array.isArray(raw.bonuses)) return null;
  const bonuses = raw.bonuses.map((bonus) => parseBonus(bonus, rules));
  if (bonuses.includes(null)) return null;
  const level = typeof raw.level === 'number' && Number.isFinite(raw.level) ? Math.max(1, Math.floor(raw.level)) : 1;
  const item: Item = { id: raw.id, slot: raw.slot as GearSlot, rarity: raw.rarity as Item['rarity'], bonuses: bonuses as ItemBonus[], level };
  if (raw.legendary === undefined) return item;
  return typeof raw.legendary === 'string' ? { ...item, legendary: raw.legendary } : null;
}

export function defaultSave(rules: SaveRules, version = MIGRATIONS.length + 1): SaveData {
  return {
    version,
    stars: {},
    // Новый игрок начинает с тем же, с чем начинали до инвентаря: три простых предмета, они же надеты.
    ...inventoryFromOldGear(rules, rules.gear.defaults, [], {}),
    book: [],
    sound: true,
    music: true,
    fish: 0,
    chests: 0,
    bestiary: [],
    perfect: [],
    pending: { big: 0, small: 0 },
    adChestAt: 0,
    onboarded: false,
    hintsSeen: [],
    lang: null,
  };
}

/**
 * Разбирает то, что пришло из хранилища: старое сохранение доводит миграциями до текущей версии,
 * испорченные поля заменяет значениями по умолчанию. Сохранение новее кода читается как есть и версию не теряет.
 */
export function parseSave(raw: unknown, rules: SaveRules, migrations: readonly Migration[] = MIGRATIONS): ParsedSave {
  const current = migrations.length + 1;
  if (!isRecord(raw) || !Number.isInteger(raw.version) || (raw.version as number) < 1) {
    return { data: defaultSave(rules, current), extra: {}, foreignItems: [] };
  }

  const version = raw.version as number;
  const newer = version > current;
  let save = raw;
  for (let v = version; v < current; v++) save = migrations[v - 1](save, rules);

  const data = defaultSave(rules, Math.max(version, current));

  if (isRecord(save.stars)) {
    for (const [levelId, value] of Object.entries(save.stars)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const stars = Math.min(MAX_STARS, Math.floor(value));
      if (stars > 0) data.stars[levelId] = stars;
    }
  }

  // Предметы: испорченные записи отбрасываются; если поля нет вовсе — остаётся стартовый набор.
  const foreignItems: unknown[] = [];
  if (Array.isArray(save.items)) {
    data.items = [];
    const ids = new Set<string>();
    for (const raw of save.items) {
      const item = parseItem(raw, rules);
      if (item && !ids.has(item.id)) {
        ids.add(item.id);
        data.items.push(item);
      } else if (newer && !item) {
        foreignItems.push(raw);
      }
    }
    for (const slot of GEAR_SLOTS) data.worn[slot] = null;
  }
  if (isRecord(save.worn)) {
    for (const slot of GEAR_SLOTS) {
      const id = save.worn[slot];
      // Надеть можно только свой предмет и только в его слот.
      data.worn[slot] = data.items.some((item) => item.id === id && item.slot === slot) ? (id as string) : null;
    }
  }
  if (typeof save.shards === 'number' && Number.isFinite(save.shards)) data.shards = Math.max(0, Math.floor(save.shards));
  // Счётчик id не отстаёт от уже выданных, в том числе непонятым этой версией предметам: новый предмет не повторит id старого.
  const ids = [...data.items, ...foreignItems].map((item) => (isRecord(item) && typeof item.id === 'string' ? item.id : ''));
  const used = ids.reduce((max, id) => Math.max(max, Number(/^i(\d+)$/.exec(id)?.[1] ?? 0)), 0);
  const next = typeof save.nextItem === 'number' && Number.isFinite(save.nextItem) ? Math.floor(save.nextItem) : 1;
  data.nextItem = Math.max(next, used + 1, 1);

  if (Array.isArray(save.book)) {
    const cats = save.book.filter((id): id is string => typeof id === 'string');
    // Кот из будущей версии этой игре незнаком, но у игрока он открыт — не теряем.
    data.book = [...new Set(newer ? cats : cats.filter((id) => id in rules.cats.elements))];
  }

  // Поля нет в сохранениях, сделанных до появления звука: остаётся включённым.
  if (typeof save.sound === 'boolean') data.sound = save.sound;
  if (typeof save.music === 'boolean') data.music = save.music;
  if (typeof save.onboarded === 'boolean') data.onboarded = save.onboarded;
  if (LANGS.includes(save.lang as Lang)) data.lang = save.lang as Lang;
  if (Array.isArray(save.hintsSeen)) data.hintsSeen = [...new Set(save.hintsSeen.filter((id): id is string => typeof id === 'string'))];

  if (typeof save.fish === 'number' && Number.isFinite(save.fish)) data.fish = Math.max(0, Math.floor(save.fish));

  if (typeof save.chests === 'number' && Number.isFinite(save.chests)) data.chests = Math.max(0, Math.floor(save.chests));

  if (Array.isArray(save.bestiary)) {
    const types = save.bestiary.filter((id): id is string => typeof id === 'string');
    // Враг из будущей версии этой игре незнаком, но у игрока он открыт — не теряем.
    data.bestiary = [...new Set(newer ? types : types.filter((id) => id in rules.enemies.types))];
  }

  if (Array.isArray(save.perfect)) data.perfect = [...new Set(save.perfect.filter((id): id is string => typeof id === 'string'))];
  if (isRecord(save.pending)) {
    const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
    data.pending = { big: count(save.pending.big), small: count(save.pending.small) };
  }
  if (typeof save.adChestAt === 'number' && Number.isFinite(save.adChestAt)) data.adChestAt = Math.max(0, Math.floor(save.adChestAt));

  const extra: RawSave = {};
  if (newer) {
    for (const [field, value] of Object.entries(save)) {
      if (!KNOWN_FIELDS.includes(field)) extra[field] = value;
    }
  }
  return { data, extra, foreignItems };
}

/** Прогресс игрока между уровнями: звёзды, выбранное снаряжение, книга котов, бестиарий. */
export class Progress {
  private data: SaveData;
  private extra: RawSave = {};
  private foreignItems: unknown[] = [];
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
    ({ data: this.data, extra: this.extra, foreignItems: this.foreignItems } = parseSave(raw, this.rules));
  }

  /** Лучший результат уровня; 0 — уровень ещё не пройден. */
  stars(levelId: string): number {
    return this.data.stars[levelId] ?? 0;
  }

  /**
   * Запоминает результат уровня, если он лучше прежнего. Первое прохождение уровня на три звезды приносит сундук:
   * он ждёт открытия в меню. Возвращает true, если сундук заработан этим прохождением.
   */
  recordStars(levelId: string, stars: number): boolean {
    if (stars <= this.stars(levelId)) return false;
    this.data.stars[levelId] = Math.min(MAX_STARS, stars);
    const perfect = stars >= MAX_STARS && !this.data.perfect.includes(levelId);
    if (perfect) {
      this.data.perfect.push(levelId);
      this.data.pending.big++;
    }
    this.touch();
    return perfect;
  }

  /** Сумма лучших результатов по всем уровням: за неё открываются сундуки. */
  get totalStars(): number {
    return Object.values(this.data.stars).reduce((sum, stars) => sum + stars, 0);
  }

  /** Все предметы игрока: надетые и лежащие в инвентаре. */
  get items(): readonly Item[] {
    return this.data.items;
  }

  /** Осколки от разобранных предметов. */
  get shards(): number {
    return this.data.shards;
  }

  /** Сколько предметов помещается у игрока; надетые тоже считаются. */
  get inventoryLimit(): number {
    return this.rules.gear.items.inventoryLimit;
  }

  get inventoryFull(): boolean {
    return this.data.items.length >= this.inventoryLimit;
  }

  item(id: string): Item | null {
    return this.data.items.find((item) => item.id === id) ?? null;
  }

  /** Предмет, надетый в слот; null — слот пуст. */
  wornItem(slot: GearSlot): Item | null {
    const id = this.data.worn[slot];
    return id === null ? null : this.item(id);
  }

  /** Все надетые предметы: по ним считаются бонусы боя. */
  wornItems(): Item[] {
    return GEAR_SLOTS.flatMap((slot) => this.wornItem(slot) ?? []);
  }

  isWorn(id: string): boolean {
    return GEAR_SLOTS.some((slot) => this.data.worn[slot] === id);
  }

  /** Надевает предмет в его слот; прежний остаётся в инвентаре. Возвращает false, если предмета нет или он уже надет. */
  equip(id: string): boolean {
    const item = this.item(id);
    if (!item || this.data.worn[item.slot] === id) return false;
    this.data.worn[item.slot] = id;
    this.touch();
    return true;
  }

  /** id для нового предмета; каждый вызов даёт следующий. */
  newItemId(): string {
    const id = `i${this.data.nextItem}`;
    this.data.nextItem++;
    this.touch();
    return id;
  }

  /** Разбирает предмет на осколки. Надетый разобрать нельзя. Возвращает, сколько осколков получено; 0 — ничего не разобрано. */
  salvage(id: string): number {
    const item = this.item(id);
    if (!item || this.isWorn(id)) return 0;
    const shards = salvageShards(this.rules.gear.items, item);
    this.data.items = this.data.items.filter((other) => other.id !== id);
    this.data.shards += shards;
    this.touch();
    return shards;
  }

  /**
   * Поднимает уровень надетого предмета на один за осколки и рыбки. Возвращает false и ничего не меняет,
   * если предмет не надет, уже на последнем уровне или не хватает осколков или рыбок.
   */
  upgradeItem(id: string): boolean {
    const item = this.item(id);
    if (!item || !this.isWorn(id)) return false;
    const price = upgradePrice(this.rules.gear.items, item);
    if (!price || this.data.shards < price.shards || this.data.fish < price.fish) return false;
    this.data.shards -= price.shards;
    this.data.fish -= price.fish;
    item.level++;
    this.touch();
    return true;
  }

  get chestsOpened(): number {
    return this.data.chests;
  }

  /** Заработанные, но ещё не открытые сундуки: за три звезды и малые. */
  get pendingChests(): Readonly<PendingChests> {
    return this.data.pending;
  }

  /** После победы найден малый сундук: он ждёт открытия в меню. */
  addSmallChest(): void {
    this.data.pending.small++;
    this.touch();
  }

  /** Когда взят последний сундук за рекламу, миллисекунды; 0 — ещё не брали. */
  get adChestAt(): number {
    return this.data.adChestAt;
  }

  /**
   * Забирает содержимое сундука: рыбки переходят игроку, предмет ложится в инвентарь. По источнику сундука (`source`)
   * растёт счёт открытых сундуков за звёзды, убывает запас заработанных или запоминается время сундука за рекламу (`now`, мс).
   * Если инвентарь полон, предмет сразу разбирается на осколки. Возвращает, сколько осколков получено вместо предмета.
   */
  claimChest(loot: ChestLoot, source: ChestSource = 'stars', now = 0): number {
    if (source === 'stars') this.data.chests++;
    else if (source === 'ad') this.data.adChestAt = Math.max(0, Math.floor(now));
    else this.data.pending[source] = Math.max(0, this.data.pending[source] - 1);
    this.data.fish += Math.max(0, Math.floor(loot.fish));
    let shards = 0;
    if (loot.item && !this.addItem(loot.item)) {
      shards = salvageShards(this.rules.gear.items, loot.item);
      this.data.shards += shards;
    }
    this.touch();
    return shards;
  }

  /** Кладёт предмет в инвентарь. Возвращает false и ничего не меняет, если инвентарь полон. */
  addItem(item: Item): boolean {
    if (this.inventoryFull) return false;
    this.data.items.push({ ...item, bonuses: item.bonuses.map((bonus) => ({ ...bonus })) });
    this.touch();
    return true;
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

  get musicOn(): boolean {
    return this.data.music;
  }

  setMusic(on: boolean): void {
    if (this.data.music === on) return;
    this.data.music = on;
    this.touch();
  }

  /** Подсказку при первой встрече игрок уже видел. */
  hintSeen(id: string): boolean {
    return this.data.hintsSeen.includes(id);
  }

  /** Отмечает подсказку показанной; возвращает true, если раньше её не было. */
  markHint(id: string): boolean {
    if (this.hintSeen(id)) return false;
    this.data.hintsSeen.push(id);
    this.touch();
    return true;
  }

  /** Язык, выбранный игроком; null — не выбирал, берётся язык площадки. */
  get lang(): Lang | null {
    return this.data.lang;
  }

  setLang(lang: Lang): void {
    if (this.data.lang === lang) return;
    this.data.lang = lang;
    this.touch();
  }

  /** Обучение на первом уровне пройдено или пропущено. */
  get onboarded(): boolean {
    return this.data.onboarded;
  }

  setOnboarded(done: boolean): void {
    if (this.data.onboarded === done) return;
    this.data.onboarded = done;
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
    const { version, stars, items, worn, shards, nextItem, book, sound, music, fish, chests, bestiary, perfect, pending, adChestAt, onboarded, hintsSeen, lang } = this.data;
    const snapshot = {
      ...this.extra,
      version,
      stars: { ...stars },
      items: [...items.map((item) => ({ ...item, bonuses: item.bonuses.map((bonus) => ({ ...bonus })) })), ...this.foreignItems],
      worn: { ...worn },
      shards,
      nextItem,
      book: [...book],
      sound,
      music,
      fish,
      chests,
      bestiary: [...bestiary],
      perfect: [...perfect],
      pending: { ...pending },
      adChestAt,
      onboarded,
      hintsSeen: [...hintsSeen],
      lang,
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
