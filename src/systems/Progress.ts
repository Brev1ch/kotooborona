import type { CatsConfig, ElementId, GearConfig, GearSlot } from '../data/types';

export const SAVE_KEY = 'save';
export const MAX_STARS = 3;
export const GEAR_SLOTS: readonly GearSlot[] = ['staff', 'mantle', 'amulet'];

/** Облачные сохранения площадки не любят частых записей: изменения копятся и уходят одной записью. */
const SAVE_DELAY_MS = 1000;

export type GearSelection = Record<GearSlot, string>;

/** То, что лежит в хранилище площадки. */
export interface SaveData {
  version: number;
  /** Лучший результат по id уровня; непройденных уровней здесь нет. */
  stars: Record<string, number>;
  gear: GearSelection;
  /** Открытые коты. В сохранении новее кода здесь могут быть и незнакомые стихии. */
  book: string[];
}

type RawSave = Record<string, unknown>;

/** Переводит сохранение на следующую версию. */
export type Migration = (save: RawSave) => RawSave;

/**
 * Миграции по порядку: элемент с индексом i переводит версию i+1 в i+2.
 * Текущая версия сохранения — на единицу больше длины списка. Меняешь структуру — добавь миграцию в конец.
 */
const MIGRATIONS: readonly Migration[] = [];

/** Конфиги, по которым проверяется содержимое сохранения. */
export interface SaveRules {
  gear: GearConfig;
  cats: CatsConfig;
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

const KNOWN_FIELDS = ['version', 'stars', 'gear', 'book'];

function isRecord(value: unknown): value is RawSave {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function defaultSave(rules: SaveRules, version = MIGRATIONS.length + 1): SaveData {
  return { version, stars: {}, gear: { ...rules.gear.defaults }, book: [] };
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
      if (rules.gear[slot].some((item) => item.id === id)) data.gear[slot] = id as string;
    }
  }

  if (Array.isArray(save.book)) {
    const cats = save.book.filter((id): id is string => typeof id === 'string');
    // Кот из будущей версии этой игре незнаком, но у игрока он открыт — не теряем.
    data.book = [...new Set(newer ? cats : cats.filter((id) => id in rules.cats.elements))];
  }

  const extra: RawSave = {};
  if (newer) {
    for (const [field, value] of Object.entries(save)) {
      if (!KNOWN_FIELDS.includes(field)) extra[field] = value;
    }
  }
  return { data, extra };
}

/** Прогресс игрока между уровнями: звёзды, выбранное снаряжение, книга котов. */
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

  get gear(): Readonly<GearSelection> {
    return this.data.gear;
  }

  /** Надевает предмет в слот; предмета не из этого слота не бывает. */
  selectGear(slot: GearSlot, id: string): void {
    if (this.data.gear[slot] === id || !this.rules.gear[slot].some((item) => item.id === id)) return;
    this.data.gear[slot] = id;
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

  /** Пишет накопленные изменения сразу, не дожидаясь задержки. Без изменений ничего не пишет. */
  flush(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return;
    this.dirty = false;
    const { version, stars, gear, book } = this.data;
    const snapshot = { ...this.extra, version, stars: { ...stars }, gear: { ...gear }, book: [...book] };
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
