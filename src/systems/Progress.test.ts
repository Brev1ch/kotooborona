import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cats as catsJson, gear as gearJson } from '../data';
import type { CatsConfig, EnemiesConfig, GearConfig } from '../data/types';
import { itemsBonuses, type Item } from './Items';
import { CURRENT_VERSION, parseSave, Progress, SAVE_KEY, type Migration, type SaveRules, type SaveStorage } from './Progress';

// Из конфигов нужны только старое снаряжение (по нему переносятся сохранения), правила предметов и списки стихий и врагов.
const rules: SaveRules = {
  gear: {
    defaults: { staff: 'none', mantle: 'thrift', amulet: 'cry' },
    staff: [{ id: 'none' }, { id: 'fire', element: 'fire', summonWeight: 1.5, upgrades: [{ summonWeight: 2 }] }],
    mantle: [{ id: 'thrift', overLimitCostMult: 0.8 }, { id: 'sorc', meteorCooldownMult: 0.8 }],
    amulet: [{ id: 'cry', bonusCrystals: 1 }, { id: 'purse', bonusGold: 20, upgrades: [{ bonusGold: 30 }, { bonusGold: 40 }] }],
    items: {
      ...gearJson.items,
      inventoryLimit: 6,
      rarities: {
        common: { bonuses: 1, roll: [0, 0.5], chance: 0.6, shards: 2 },
        rare: { bonuses: 2, roll: [0.2, 0.7], chance: 0.28, shards: 5 },
        epic: { bonuses: 3, roll: [0.5, 1], chance: 0.1, shards: 12 },
        legendary: { bonuses: 3, roll: [0.6, 1], chance: 0.02, shards: 30 },
      },
      upgrade: { maxLevel: 3, power: 0.5, shards: [2, 4], fish: [40, 90] },
    },
  } as unknown as GearConfig,
  cats: { elements: { fire: {}, water: {}, steam: {}, ice: {} } } as unknown as CatsConfig,
  enemies: { types: { mouse: {}, rat: {}, shield: {}, boots: {}, boss: {}, king: {} } } as unknown as EnemiesConfig,
};

/** Текущая версия сохранения и версия «из будущего», которой этот код ещё не знает. */
const V = CURRENT_VERSION;
const NEWER = CURRENT_VERSION + 5;

/** Три предмета, с которыми начинает новый игрок: то же, что было надето по умолчанию до инвентаря. */
const STAFF: Item = { id: 'i1', slot: 'staff', rarity: 'common', bonuses: [], level: 1 };
const MANTLE: Item = { id: 'i2', slot: 'mantle', rarity: 'common', bonuses: [{ kind: 'overLimitCost', value: 0.2 }], level: 1 };
const AMULET: Item = { id: 'i3', slot: 'amulet', rarity: 'common', bonuses: [{ kind: 'crystals', value: 1 }], level: 1 };
const STARTER = [STAFF, MANTLE, AMULET];

const defaults = {
  version: V,
  stars: {},
  items: STARTER,
  worn: { staff: 'i1', mantle: 'i2', amulet: 'i3' } as Record<string, string | null>,
  shards: 0,
  nextItem: 4,
  book: [] as string[],
  sound: true,
  music: true,
  fish: 0,
  chests: 0,
  bestiary: [] as string[],
  perfect: [] as string[],
  pending: { big: 0, small: 0 },
  adChestAt: 0,
};

/** Предмет инвентаря для тестов. */
function item(id: string, overrides: Partial<Item> = {}): Item {
  return { id, slot: 'amulet', rarity: 'common', bonuses: [{ kind: 'gold', value: 20 }], level: 1, ...overrides };
}

/** Хранилище в памяти; `saves` — всё, что в него записали, по порядку. */
function memoryStorage(initial?: unknown) {
  const saves: unknown[] = [];
  const storage: SaveStorage = {
    load: async <T>(_key: string, fallback: T) => (initial === undefined ? fallback : (initial as T)),
    save: vi.fn(async (_key: string, value: unknown) => {
      saves.push(value);
    }),
  };
  return { storage, saves };
}

async function loaded(initial?: unknown, delayMs?: number) {
  const { storage, saves } = memoryStorage(initial);
  const progress = new Progress(storage, rules, delayMs);
  await progress.load();
  return { progress, saves };
}

describe('parseSave: чтение сохранения', () => {
  it('пустое хранилище даёт прогресс по умолчанию: три стартовых предмета надеты', () => {
    expect(parseSave(null, rules)).toEqual({ data: defaults, extra: {}, foreignItems: [] });
  });

  it.each([['строка'], [42], [[1, 2]], [{}], [{ version: '1' }], [{ version: 0 }], [{ version: 1.5 }]])(
    'испорченное сохранение %j даёт прогресс по умолчанию',
    (raw) => {
      expect(parseSave(raw, rules).data).toEqual(defaults);
    },
  );

  it('читает сохранение текущей версии', () => {
    const raw = {
      version: V,
      stars: { opushka: 2 },
      items: [...STARTER, item('i4', { rarity: 'epic', level: 2, legendary: 'phoenix', slot: 'staff', bonuses: [{ kind: 'summonChance', value: 1.6, element: 'fire' }] })],
      worn: { staff: 'i4', mantle: 'i2', amulet: null },
      shards: 7,
      nextItem: 9,
      book: ['steam'],
      sound: false,
      music: true,
      fish: 9,
      chests: 3,
      bestiary: ['mouse', 'boots'],
      perfect: ['opushka'],
      pending: { big: 1, small: 2 },
      adChestAt: 1700000000000,
    };

    expect(parseSave(raw, rules)).toEqual({ data: raw, extra: {}, foreignItems: [] });
  });

  it('сохранение без настройки звука читается со включённым звуком, мусор в ней — тоже', () => {
    expect(parseSave({ version: V }, rules).data.sound).toBe(true);
    expect(parseSave({ version: V, sound: 'off' }, rules).data.sound).toBe(true);
  });

  it('недостающие поля заполняет умолчаниями', () => {
    expect(parseSave({ version: V, fish: 3 }, rules).data).toEqual({ ...defaults, fish: 3 });
  });

  it('звёзды держит в пределах от 1 до 3, мусор отбрасывает', () => {
    const { data } = parseSave({ version: V, stars: { a: 5, b: 0, c: -1, d: '3', e: 2.9, f: NaN } }, rules);

    expect(data.stars).toEqual({ a: 3, e: 2 });
  });

  it('из книги убирает неизвестных котов, мусор и повторы', () => {
    const { data } = parseSave({ version: V, book: ['steam', 'dragon', 3, 'steam', 'ice'] }, rules);

    expect(data.book).toEqual(['steam', 'ice']);
  });

  it('незнакомые поля сохранения текущей версии отбрасывает', () => {
    expect(parseSave({ version: V, junk: true }, rules).extra).toEqual({});
  });
});

describe('parseSave: предметы', () => {
  it('испорченные предметы и повторы id отбрасывает', () => {
    const good = item('i4');
    const items = [
      good,
      item('i4', { rarity: 'rare' }),
      { ...item('i5'), slot: 'boots' },
      { ...item('i6'), rarity: 'mythic' },
      { ...item('i7'), bonuses: [{ kind: 'luck', value: 1 }] },
      { ...item('i8'), bonuses: [{ kind: 'gold', value: 'много' }] },
      { ...item('i9'), bonuses: [{ kind: 'elementDamage', value: 0.1, element: 'plasma' }] },
      { ...item('i10'), bonuses: 'нет' },
      { ...item(''), id: '' },
      { ...item('i11'), legendary: 5 },
      'предмет',
      null,
    ];

    expect(parseSave({ version: V, items }, rules).data.items).toEqual([good]);
  });

  it('уровень предмета — целое не меньше единицы; мусор в нём — первый уровень', () => {
    const levels = [2.9, 0, -3, 'пять', NaN];
    const items = levels.map((level, i) => ({ ...item(`i${i}`), level }));

    expect(parseSave({ version: V, items }, rules).data.items.map((entry) => entry.level)).toEqual([2, 1, 1, 1, 1]);
  });

  it('надеть можно только свой предмет и только в его слот', () => {
    const items = [item('i4', { slot: 'staff' }), item('i5', { slot: 'amulet' })];
    const { data } = parseSave({ version: V, items, worn: { staff: 'i5', mantle: 'i99', amulet: 'i5' } }, rules);

    expect(data.worn).toEqual({ staff: null, mantle: null, amulet: 'i5' });
  });

  it('пустой инвентарь остаётся пустым, слоты — тоже', () => {
    const { data } = parseSave({ version: V, items: [] }, rules);

    expect(data.items).toEqual([]);
    expect(data.worn).toEqual({ staff: null, mantle: null, amulet: null });
  });

  it('осколки — целое неотрицательное число, мусор заменяет нулём', () => {
    expect(parseSave({ version: V, shards: 12.7 }, rules).data.shards).toBe(12);
    for (const shards of [-1, '5', NaN, null]) expect(parseSave({ version: V, shards }, rules).data.shards).toBe(0);
  });

  it('счётчик id не отстаёт от уже выданных предметов', () => {
    expect(parseSave({ version: V, items: [item('i12')], nextItem: 3 }, rules).data.nextItem).toBe(13);
    expect(parseSave({ version: V, items: [item('i2')], nextItem: 40 }, rules).data.nextItem).toBe(40);
    expect(parseSave({ version: V, items: [item('i2')] }, rules).data.nextItem).toBe(3);
    expect(parseSave({ version: V, items: [item('i2')], nextItem: 'семь' }, rules).data.nextItem).toBe(3);
  });
});

describe('parseSave: миграции', () => {
  // Версия 1 хранила звёзды массивом по порядку уровней, версия 2 — книгу под именем cats.
  const migrations: Migration[] = [
    (save) => {
      const [opushka] = save.stars as number[];
      return { ...save, stars: { opushka } };
    },
    ({ cats, ...save }) => ({ ...save, book: cats }),
  ];

  it('старое сохранение проходит все миграции по порядку', () => {
    const { data } = parseSave({ version: 1, stars: [3], cats: ['ice'] }, rules, migrations);

    expect(data).toEqual({ ...defaults, version: 3, stars: { opushka: 3 }, book: ['ice'] });
  });

  it('сохранение из середины цепочки проходит только оставшиеся миграции', () => {
    const { data } = parseSave({ version: 2, stars: { opushka: 1 }, cats: ['ice'] }, rules, migrations);

    expect(data).toEqual({ ...defaults, version: 3, stars: { opushka: 1 }, book: ['ice'] });
  });

  it('сохранение текущей версии миграции не трогают', () => {
    const { data } = parseSave({ version: 3, stars: { opushka: 2 }, book: ['steam'] }, rules, migrations);

    expect(data).toEqual({ ...defaults, version: 3, stars: { opushka: 2 }, book: ['steam'] });
  });

  it('миграция получает конфиги игры', () => {
    const seen: unknown[] = [];
    parseSave({ version: 1 }, rules, [(save, given) => (seen.push(given), save)]);

    expect(seen).toEqual([rules]);
  });
});

describe('parseSave: настоящие миграции с версии 1', () => {
  // Сохранение первой версии игры: без рыбок, всё снаряжение доступно сразу.
  const v1 = {
    version: 1,
    stars: { opushka: 3 },
    gear: { staff: 'fire', mantle: 'sorc', amulet: 'purse' },
    book: ['steam', 'ice'],
    sound: false,
  };
  // Все предметы тестового списка старого снаряжения в новом виде: сначала стартовые, затем остальные по порядку.
  const FIRE: Item = { id: 'i4', slot: 'staff', rarity: 'common', bonuses: [{ kind: 'summonChance', value: 1.5, element: 'fire' }], level: 1 };
  const SORC: Item = { id: 'i5', slot: 'mantle', rarity: 'common', bonuses: [{ kind: 'meteorCooldown', value: 0.2 }], level: 1 };
  const PURSE: Item = { id: 'i6', slot: 'amulet', rarity: 'common', bonuses: [{ kind: 'gold', value: 20 }], level: 1 };
  const ALL = [...STARTER, FIRE, SORC, PURSE];

  it('сохранение версии 1 читается без потерь', () => {
    const { data, extra } = parseSave(v1, rules);

    expect(data.version).toBe(V);
    expect(data.stars).toEqual({ opushka: 3 });
    expect(data.book).toEqual(['steam', 'ice']);
    expect(data.sound).toBe(false);
    expect(extra).toEqual({});
  });

  it('версия 1 → 2: рыбок ещё нет, счёт начинается с нуля', () => {
    expect(parseSave(v1, rules).data.fish).toBe(0);
  });

  it('версии 1 и 2 → 5: всё снаряжение, доступное до сундуков, лежит в инвентаре, надетое осталось надетым', () => {
    for (const save of [v1, { ...v1, version: 2, fish: 12 }]) {
      const { data } = parseSave(save, rules);

      // Предметов, которых нет в тестовом списке (остальные посохи, амулет алхимика), в результате нет.
      expect(data.items).toEqual(ALL);
      expect(data.worn).toEqual({ staff: 'i4', mantle: 'i5', amulet: 'i6' });
      expect(data.shards).toBe(0);
      expect(data.nextItem).toBe(7);
      expect(data.chests).toBe(0);
    }
    expect(parseSave({ ...v1, version: 2, fish: 12 }, rules).data.fish).toBe(12);
  });

  it('старых полей снаряжения в сохранении после переноса нет', async () => {
    const { progress, saves } = await loaded(v1, 1000);
    progress.addFish(5);
    progress.flush();

    expect(saves).toEqual([
      { ...defaults, ...{ stars: v1.stars, book: v1.book, sound: false, music: false }, fish: 5, items: ALL, worn: { staff: 'i4', mantle: 'i5', amulet: 'i6' }, nextItem: 7, bestiary: ['mouse', 'rat', 'boss'], perfect: ['opushka'], pending: { big: 1, small: 0 } },
    ]);
    expect(Object.keys(saves[0] as object)).not.toEqual(expect.arrayContaining(['gear', 'owned', 'gearLevels']));
  });
});

describe('parseSave: версия 4 → 5, инвентарь', () => {
  const v4 = (overrides: Record<string, unknown>) => ({
    version: 4,
    stars: { opushka: 2 },
    gear: { staff: 'none', mantle: 'thrift', amulet: 'cry' },
    book: [],
    sound: true,
    fish: 30,
    owned: ['staff:none', 'mantle:thrift', 'amulet:cry'],
    gearLevels: {},
    chests: 2,
    bestiary: ['mouse'],
    ...overrides,
  });

  it('игрок со стартовым снаряжением получает три стартовых предмета', () => {
    const { data } = parseSave(v4({}), rules);

    expect(data).toEqual({ ...defaults, stars: { opushka: 2 }, fish: 30, chests: 2, bestiary: ['mouse'] });
  });

  it('предметы из сундуков переходят в инвентарь в порядке получения, после стартовых', () => {
    const { data } = parseSave(v4({ owned: ['amulet:purse', 'staff:none', 'staff:fire'] }), rules);

    expect(data.items.map((entry) => `${entry.id}:${entry.slot}`)).toEqual(['i1:staff', 'i2:mantle', 'i3:amulet', 'i4:amulet', 'i5:staff']);
    expect(data.nextItem).toBe(6);
  });

  it('надетое остаётся надетым', () => {
    const { data } = parseSave(v4({ owned: ['staff:fire', 'amulet:purse'], gear: { staff: 'fire', mantle: 'thrift', amulet: 'purse' } }), rules);

    expect(data.worn).toEqual({ staff: 'i4', mantle: 'i2', amulet: 'i5' });
  });

  it('прокачанный предмет сохраняет силу бонуса своего уровня и получает редкость выше', () => {
    const { data } = parseSave(v4({ owned: ['amulet:purse', 'staff:fire'], gearLevels: { 'amulet:purse': 3, 'staff:fire': 2 } }), rules);

    expect(data.items[3]).toEqual({ id: 'i4', slot: 'amulet', rarity: 'epic', bonuses: [{ kind: 'gold', value: 40 }], level: 1 });
    expect(data.items[4]).toEqual({ id: 'i5', slot: 'staff', rarity: 'rare', bonuses: [{ kind: 'summonChance', value: 2, element: 'fire' }], level: 1 });
  });

  it('в бою перенесённое снаряжение даёт то же, что давало', async () => {
    const save = v4({ owned: ['amulet:purse', 'staff:fire', 'mantle:sorc'], gearLevels: { 'amulet:purse': 2, 'staff:fire': 2 }, gear: { staff: 'fire', mantle: 'sorc', amulet: 'purse' } });
    const { progress } = await loaded(save);
    const bonuses = itemsBonuses(rules.gear.items, progress.wornItems());

    expect(bonuses.summonWeights).toEqual({ fire: 2 });
    expect(bonuses.meteorCooldownMult).toBeCloseTo(0.8);
    expect(bonuses.bonusGold).toBe(30);
    expect(bonuses.overLimitCostMult).toBe(1);
    expect(bonuses.bonusCrystals).toBe(0);
  });

  it('незнакомый, чужой для слота или не полученный надетый предмет заменяется предметом по умолчанию', () => {
    for (const gear of [{ staff: 'laser' }, { staff: 'fire' }, { staff: 7 }, null, 'посох']) {
      const { data } = parseSave(v4({ gear }), rules);
      expect(data.worn, JSON.stringify(gear)).toEqual({ staff: 'i1', mantle: 'i2', amulet: 'i3' });
    }
  });

  it('мусор в списке предметов и в уровнях не мешает переносу', () => {
    const { data } = parseSave(v4({ owned: ['staff:fire', 'staff:fire', 'boots:iron', 'staff', 5, 'staff:laser'], gearLevels: { 'staff:fire': 'два' } }), rules);

    expect(data.items).toHaveLength(4);
    expect(data.items[3]).toMatchObject({ slot: 'staff', rarity: 'common', bonuses: [{ kind: 'summonChance', value: 1.5, element: 'fire' }] });
    expect(parseSave(v4({ owned: 'всё', gearLevels: [] }), rules).data.items).toEqual(STARTER);
  });

  it('остальное сохранение миграция не трогает', () => {
    const { data } = parseSave(v4({ book: ['steam'], sound: false }), rules);

    expect(data).toMatchObject({ version: V, stars: { opushka: 2 }, fish: 30, chests: 2, book: ['steam'], sound: false, bestiary: ['mouse'] });
  });

  it('в данных игры каждый предмет старого снаряжения переносится', () => {
    const real: SaveRules = { ...rules, gear: gearJson, cats: catsJson };
    const owned = (['staff', 'mantle', 'amulet'] as const).flatMap((slot) => gearJson[slot].map((entry) => `${slot}:${entry.id}`));
    const { data } = parseSave(v4({ owned }), real);

    expect(data.items).toHaveLength(owned.length);
    expect(data.items.length).toBeLessThanOrEqual(gearJson.items.inventoryLimit);
  });
});

describe('parseSave: версия 3 → 4, бестиарий', () => {
  const v3 = (stars: unknown) => ({ version: 3, stars, gear: rules.gear.defaults, book: [], sound: true, fish: 7, owned: [], gearLevels: {}, chests: 1 });

  it('у игрока без пройденных уровней бестиарий пуст', () => {
    expect(parseSave(v3({}), rules).data.bestiary).toEqual([]);
  });

  it('пройденный уровень начала главы открывает мышь, крысу и командира', () => {
    expect(parseSave(v3({ opushka: 1 }), rules).data.bestiary).toEqual(['mouse', 'rat', 'boss']);
    expect(parseSave(v3({ tropinka: 3, dub: 2 }), rules).data.bestiary).toEqual(['mouse', 'rat', 'boss']);
  });

  it.each(['polyana', 'ovrag', 'burelom', 'melnitsa', 'most'])('пройденный уровень %s открывает ещё и щитоносца', (id) => {
    expect(parseSave(v3({ opushka: 3, [id]: 1 }), rules).data.bestiary).toEqual(['mouse', 'rat', 'shield', 'boss']);
  });

  it('пройденный последний уровень открывает короля', () => {
    expect(parseSave(v3({ lager: 2 }), rules).data.bestiary).toEqual(['mouse', 'rat', 'shield', 'boss', 'king']);
  });

  it('уровень без звёзд и мусор вместо звёзд никого не открывают', () => {
    expect(parseSave(v3({ lager: 0, opushka: 'три' }), rules).data.bestiary).toEqual([]);
    expect(parseSave(v3([3, 3]), rules).data.bestiary).toEqual([]);
    expect(parseSave(v3(null), rules).data.bestiary).toEqual([]);
  });

  it('остальное сохранение миграция не трогает', () => {
    const { data } = parseSave(v3({ opushka: 2 }), rules);

    expect(data).toMatchObject({ version: V, stars: { opushka: 2 }, fish: 7, chests: 1 });
  });

  it('версии 1 и 2 проходят всю цепочку и тоже получают бестиарий', () => {
    expect(parseSave({ version: 1, stars: { lager: 3 } }, rules).data.bestiary).toEqual(['mouse', 'rat', 'shield', 'boss', 'king']);
    expect(parseSave({ version: 2, stars: { polyana: 1 }, fish: 3 }, rules).data.bestiary).toEqual(['mouse', 'rat', 'shield', 'boss']);
  });

  it('сохранение с бестиарием читается как есть: без повторов, чужих типов и мусора', () => {
    const raw = { version: V, stars: { lager: 3 }, bestiary: ['boots', 'boots', 'dragon', 7, 'mouse'] };

    expect(parseSave(raw, rules).data.bestiary).toEqual(['boots', 'mouse']);
    expect(parseSave({ version: V, bestiary: 'boots' }, rules).data.bestiary).toEqual([]);
  });

  it('в данных игры есть все уровни и враги, на которые опирается миграция', async () => {
    const { enemies, levels } = await import('../data');
    const ids = levels.levels.map((level) => level.id);

    for (const id of ['polyana', 'ovrag', 'burelom', 'melnitsa', 'most', 'lager']) expect(ids, id).toContain(id);
    for (const type of ['mouse', 'rat', 'shield', 'boss', 'king']) expect(Object.keys(enemies.types), type).toContain(type);
  });
});

describe('parseSave: рыбки', () => {
  it('читает целое неотрицательное число, мусор заменяет нулём', () => {
    expect(parseSave({ version: V, fish: 42 }, rules).data.fish).toBe(42);
    expect(parseSave({ version: V, fish: 7.9 }, rules).data.fish).toBe(7);
    for (const fish of [-3, '10', NaN, null, Infinity]) {
      expect(parseSave({ version: V, fish }, rules).data.fish).toBe(0);
    }
  });
});

describe('Progress: рыбки', () => {
  it('копятся и тратятся, в минус не уходят', () => {
    const progress = new Progress(memoryStorage().storage, rules);

    progress.addFish(30);
    progress.addFish(0);
    progress.addFish(-5);
    expect(progress.fish).toBe(30);

    expect(progress.spendFish(31)).toBe(false);
    expect(progress.fish).toBe(30);
    expect(progress.spendFish(30)).toBe(true);
    expect(progress.fish).toBe(0);
    expect(progress.spendFish(-1)).toBe(false);
  });
});

describe('Progress: инвентарь', () => {
  const bag = { version: V, items: [...STARTER, item('i4'), item('i5', { slot: 'staff', rarity: 'rare' })], worn: defaults.worn, nextItem: 6 };

  it('новый игрок: три стартовых предмета надеты, инвентарь не полон', () => {
    const progress = new Progress(memoryStorage().storage, rules);

    expect(progress.items).toEqual(STARTER);
    expect(progress.wornItems()).toEqual(STARTER);
    expect(progress.wornItem('mantle')).toEqual(MANTLE);
    expect(progress.isWorn('i2')).toBe(true);
    expect(progress.inventoryFull).toBe(false);
    expect(progress.inventoryLimit).toBe(6);
    expect(progress.shards).toBe(0);
  });

  it('надеть: предмет встаёт в свой слот, прежний остаётся в инвентаре', async () => {
    const { progress } = await loaded(bag);

    expect(progress.equip('i5')).toBe(true);
    expect(progress.wornItem('staff')?.id).toBe('i5');
    expect(progress.isWorn('i1')).toBe(false);
    expect(progress.items).toHaveLength(5);
  });

  it('уже надетый и несуществующий предмет ничего не меняют', async () => {
    const { progress, saves } = await loaded(bag);

    expect(progress.equip('i1')).toBe(false);
    expect(progress.equip('i99')).toBe(false);
    progress.flush();
    expect(saves).toEqual([]);
  });

  it('разобрать: предмет пропадает, осколки по редкости приходят', async () => {
    const { progress } = await loaded(bag);

    expect(progress.salvage('i5')).toBe(5);
    expect(progress.salvage('i4')).toBe(2);
    expect(progress.shards).toBe(7);
    expect(progress.items.map((entry) => entry.id)).toEqual(['i1', 'i2', 'i3']);
  });

  it('надетый и несуществующий предмет не разбираются', async () => {
    const { progress } = await loaded(bag);

    expect(progress.salvage('i2')).toBe(0);
    expect(progress.salvage('i99')).toBe(0);
    expect(progress.items).toHaveLength(5);
    expect(progress.shards).toBe(0);
  });

  it('улучшить можно только надетый предмет, за осколки и рыбки вместе', async () => {
    const { progress } = await loaded({ ...bag, shards: 10, fish: 200 });

    expect(progress.upgradeItem('i4')).toBe(false);
    expect(progress.upgradeItem('i99')).toBe(false);

    expect(progress.upgradeItem('i3')).toBe(true);
    expect(progress.item('i3')?.level).toBe(2);
    expect(progress.shards).toBe(8);
    expect(progress.fish).toBe(160);

    expect(progress.upgradeItem('i3')).toBe(true);
    expect(progress.item('i3')?.level).toBe(3);
    expect(progress.shards).toBe(4);
    expect(progress.fish).toBe(70);

    // Третий уровень в тестовом конфиге — последний.
    expect(progress.upgradeItem('i3')).toBe(false);
    expect(progress.shards).toBe(4);
  });

  it.each([
    ['осколков', { shards: 1, fish: 200 }],
    ['рыбок', { shards: 10, fish: 39 }],
  ])('без %s улучшение не проходит и ничего не списывает', async (_name, wallet) => {
    const { progress } = await loaded({ ...bag, ...wallet });

    expect(progress.upgradeItem('i3')).toBe(false);
    expect(progress.item('i3')?.level).toBe(1);
    expect(progress.shards).toBe(wallet.shards);
    expect(progress.fish).toBe(wallet.fish);
  });

  it('улучшение усиливает бонусы предмета в бою', async () => {
    const { progress } = await loaded({ ...bag, worn: { ...defaults.worn, amulet: 'i4' }, shards: 10, fish: 200 });
    expect(itemsBonuses(rules.gear.items, progress.wornItems()).bonusGold).toBe(20);

    progress.upgradeItem('i4');
    expect(itemsBonuses(rules.gear.items, progress.wornItems()).bonusGold).toBe(30);
  });

  it('id новых предметов идут подряд и не повторяются после перезагрузки', async () => {
    const { progress, saves } = await loaded(bag);

    expect([progress.newItemId(), progress.newItemId()]).toEqual(['i6', 'i7']);
    progress.flush();

    const again = await loaded(saves[0]);
    expect(again.progress.newItemId()).toBe('i8');
  });
});

describe('Progress: новый предмет', () => {
  it('ложится в инвентарь копией, пока есть место', () => {
    const progress = new Progress(memoryStorage().storage, rules);
    const fresh = item('i4');

    expect(progress.addItem(fresh)).toBe(true);
    fresh.level = 9;
    expect(progress.item('i4')?.level).toBe(1);
  });

  it('в полный инвентарь не ложится', async () => {
    const { progress } = await loaded({ version: V, items: [...STARTER, item('i4'), item('i5'), item('i6')], worn: defaults.worn });

    expect(progress.addItem(item('i7'))).toBe(false);
    expect(progress.items).toHaveLength(6);
  });
});

describe('Progress: сундуки', () => {
  it('предмет из сундука ложится в инвентарь, рыбки и счёт сундуков растут', () => {
    const progress = new Progress(memoryStorage().storage, rules);
    const loot = { item: item('i4', { rarity: 'rare' }), fish: 15 };

    expect(progress.claimChest(loot)).toBe(0);
    expect(progress.chestsOpened).toBe(1);
    expect(progress.fish).toBe(15);
    expect(progress.items.map((entry) => entry.id)).toEqual(['i1', 'i2', 'i3', 'i4']);
    expect(progress.isWorn('i4')).toBe(false);
  });

  it('предмет в инвентаре — копия: правка добычи его не меняет', () => {
    const progress = new Progress(memoryStorage().storage, rules);
    const loot = { item: item('i4'), fish: 0 };
    progress.claimChest(loot);
    loot.item.bonuses[0].value = 999;

    expect(progress.item('i4')?.bonuses[0].value).toBe(20);
  });

  it('когда инвентарь полон, предмет из сундука сразу разбирается на осколки', async () => {
    const full = [...STARTER, item('i4'), item('i5'), item('i6')];
    const { progress } = await loaded({ version: V, items: full, worn: defaults.worn });
    expect(progress.inventoryFull).toBe(true);

    expect(progress.claimChest({ item: item('i7', { rarity: 'epic' }), fish: 15 })).toBe(12);
    expect(progress.items).toHaveLength(6);
    expect(progress.shards).toBe(12);
    expect(progress.fish).toBe(15);
    expect(progress.chestsOpened).toBe(1);
  });

  it('сундук без предмета даёт только рыбки; дробные и отрицательные рыбки не портят счёт', () => {
    const progress = new Progress(memoryStorage().storage, rules);

    progress.claimChest({ item: null, fish: 9.8 });
    progress.claimChest({ item: null, fish: -4 });

    expect(progress.fish).toBe(9);
    expect(progress.chestsOpened).toBe(2);
    expect(progress.items).toHaveLength(3);
  });
});

describe('Progress: сундук за три звезды, малый сундук, сундук за рекламу', () => {
  it('первое прохождение уровня на три звезды приносит один сундук', () => {
    const progress = new Progress(memoryStorage().storage, rules);

    expect(progress.recordStars('opushka', 2)).toBe(false);
    expect(progress.pendingChests).toEqual({ big: 0, small: 0 });
    expect(progress.recordStars('opushka', 3)).toBe(true);
    expect(progress.pendingChests).toEqual({ big: 1, small: 0 });
  });

  it('повторное прохождение на три звезды сундука не даёт', () => {
    const progress = new Progress(memoryStorage().storage, rules);
    progress.recordStars('opushka', 3);

    expect(progress.recordStars('opushka', 3)).toBe(false);
    expect(progress.pendingChests.big).toBe(1);
  });

  it('у каждого уровня свой сундук', () => {
    const progress = new Progress(memoryStorage().storage, rules);
    progress.recordStars('opushka', 3);
    progress.recordStars('tropinka', 3);

    expect(progress.pendingChests.big).toBe(2);
  });

  it('уровень, за который сундук уже выдан, второго не даёт, даже если звёзды в сохранении пропали', async () => {
    const { progress } = await loaded({ version: V, stars: {}, perfect: ['opushka'] });

    expect(progress.recordStars('opushka', 3)).toBe(false);
    expect(progress.pendingChests.big).toBe(0);
  });

  it('открытый сундук за три звезды убывает из запаса, счёт сундуков за звёзды не растёт', () => {
    const progress = new Progress(memoryStorage().storage, rules);
    progress.recordStars('opushka', 3);

    progress.claimChest({ item: item('i4'), fish: 15 }, 'big');

    expect(progress.pendingChests.big).toBe(0);
    expect(progress.chestsOpened).toBe(0);
    expect(progress.fish).toBe(15);
    expect(progress.item('i4')).not.toBeNull();
  });

  it('малый сундук копится и открывается по одному', () => {
    const progress = new Progress(memoryStorage().storage, rules);
    progress.addSmallChest();
    progress.addSmallChest();

    progress.claimChest({ item: null, fish: 5 }, 'small');

    expect(progress.pendingChests).toEqual({ big: 0, small: 1 });
    expect(progress.chestsOpened).toBe(0);
  });

  it('запас сундуков не уходит ниже нуля', () => {
    const progress = new Progress(memoryStorage().storage, rules);

    progress.claimChest({ item: null, fish: 5 }, 'small');

    expect(progress.pendingChests.small).toBe(0);
  });

  it('сундук за рекламу запоминает время и других счётчиков не трогает', () => {
    const progress = new Progress(memoryStorage().storage, rules);
    progress.recordStars('opushka', 3);

    progress.claimChest({ item: item('i4'), fish: 15 }, 'ad', 1700000000123.7);

    expect(progress.adChestAt).toBe(1700000000123);
    expect(progress.pendingChests.big).toBe(1);
    expect(progress.chestsOpened).toBe(0);
  });

  it('запас сундуков и время рекламного сундука уходят в сохранение и читаются обратно', async () => {
    const { storage, saves } = memoryStorage();
    const progress = new Progress(storage, rules);
    progress.recordStars('opushka', 3);
    progress.addSmallChest();
    progress.claimChest({ item: null, fish: 0 }, 'ad', 5000);
    progress.flush();

    const { data } = parseSave(saves[0], rules);

    expect(data).toMatchObject({ perfect: ['opushka'], pending: { big: 1, small: 1 }, adChestAt: 5000 });
  });
});

describe('parseSave: версия 5 → 6, сундуки за три звезды задним числом', () => {
  const v5 = (stars: unknown) => ({ version: 5, stars, items: STARTER, worn: defaults.worn, shards: 3, nextItem: 4, book: [], sound: true, fish: 30, chests: 2, bestiary: ['mouse'] });

  it('за каждый уровень, уже пройденный на три звезды, выдаётся сундук', () => {
    const { data } = parseSave(v5({ opushka: 3, tropinka: 2, ruchey: 3 }), rules);

    expect(data.perfect).toEqual(['opushka', 'ruchey']);
    expect(data.pending).toEqual({ big: 2, small: 0 });
    expect(data.adChestAt).toBe(0);
  });

  it('остальное сохранение не меняется', () => {
    const { data } = parseSave(v5({ opushka: 3 }), rules);

    expect(data).toEqual({ ...defaults, stars: { opushka: 3 }, shards: 3, fish: 30, chests: 2, bestiary: ['mouse'], perfect: ['opushka'], pending: { big: 1, small: 0 } });
  });

  it('без уровней на три звезды сундуков нет', () => {
    expect(parseSave(v5({ opushka: 2 }), rules).data).toMatchObject({ perfect: [], pending: { big: 0, small: 0 } });
    expect(parseSave(v5('мусор'), rules).data).toMatchObject({ perfect: [], pending: { big: 0, small: 0 } });
  });

  it('после переноса эти уровни второго сундука не дают', async () => {
    const { progress } = await loaded(v5({ opushka: 3, tropinka: 2 }));

    expect(progress.recordStars('opushka', 3)).toBe(false);
    expect(progress.recordStars('tropinka', 3)).toBe(true);
    expect(progress.pendingChests.big).toBe(2);
  });

  it('сохранение версии 1 доходит до сундуков через все миграции', () => {
    const { data } = parseSave({ version: 1, stars: { opushka: 3, tropinka: 3 }, gear: {}, book: [], sound: true }, rules);

    expect(data.pending.big).toBe(2);
  });

  it.each([[{ big: -2, small: 1.9 }, { big: 0, small: 1 }], [{ big: 'много' }, { big: 0, small: 0 }], ['мусор', { big: 0, small: 0 }]])(
    'мусор в запасе сундуков %j не ломает сохранение',
    (pending, expected) => {
      expect(parseSave({ version: V, pending }, rules).data.pending).toEqual(expected);
    },
  );

  it('мусор во времени рекламного сундука и в списке уровней отбрасывается', () => {
    const { data } = parseSave({ version: V, adChestAt: -5, perfect: ['opushka', 7, 'opushka'] }, rules);

    expect(data.adChestAt).toBe(0);
    expect(data.perfect).toEqual(['opushka']);
  });
});

describe('parseSave: сохранение новее кода', () => {
  const mythic = { id: 'i9', slot: 'staff', rarity: 'mythic', bonuses: [{ kind: 'luck', value: 3 }], level: 2 };
  const raw = {
    version: NEWER,
    stars: { opushka: 3, volcano: 2 },
    items: [...STARTER, mythic],
    worn: { staff: 'i9', mantle: 'i2', amulet: 'i3' },
    book: ['steam', 'dragon'],
    guild: 120,
    pets: [{ id: 'owl' }],
  };

  it('знакомые поля читает, версию не понижает', () => {
    const { data } = parseSave(raw, rules);

    expect(data.version).toBe(NEWER);
    expect(data.stars).toEqual({ opushka: 3, volcano: 2 });
  });

  it('незнакомые поля и незнакомых котов сохраняет', () => {
    const { data, extra } = parseSave(raw, rules);

    expect(extra).toEqual({ guild: 120, pets: [{ id: 'owl' }] });
    expect(data.book).toEqual(['steam', 'dragon']);
  });

  it('незнакомых врагов в бестиарии сохраняет', () => {
    const { data } = parseSave({ ...raw, bestiary: ['mouse', 'hydra'] }, rules);

    expect(data.bestiary).toEqual(['mouse', 'hydra']);
  });

  it('предмет, которого эта версия не понимает, в игре не участвует, но не теряется', () => {
    const { data, foreignItems } = parseSave(raw, rules);

    expect(data.items).toEqual(STARTER);
    expect(data.worn.staff).toBeNull();
    expect(foreignItems).toEqual([mythic]);
  });

  it('в сохранении текущей версии непонятные предметы просто отбрасываются', () => {
    expect(parseSave({ ...raw, version: V }, rules).foreignItems).toEqual([]);
  });
});

describe('Progress: изменения', () => {
  it('до загрузки и без сохранения отдаёт умолчания', async () => {
    const progress = new Progress(memoryStorage().storage, rules);

    expect(progress.stars('opushka')).toBe(0);
    expect(progress.wornItems()).toEqual(STARTER);

    await progress.load();
    expect(progress.stars('opushka')).toBe(0);
    expect(progress.hasCat('steam')).toBe(false);
  });

  it('читает сохранение площадки', async () => {
    const { progress } = await loaded({ version: V, stars: { opushka: 2 }, book: ['steam'] });

    expect(progress.stars('opushka')).toBe(2);
    expect(progress.hasCat('steam')).toBe(true);
  });

  it('звёзды уровня только растут и не превышают трёх', () => {
    const progress = new Progress(memoryStorage().storage, rules);

    progress.recordStars('opushka', 2);
    progress.recordStars('opushka', 1);
    expect(progress.stars('opushka')).toBe(2);

    progress.recordStars('opushka', 5);
    expect(progress.stars('opushka')).toBe(3);
    progress.recordStars('tropinka', 1);
    expect(progress.totalStars).toBe(4);
  });

  it('кот открывается один раз', () => {
    const progress = new Progress(memoryStorage().storage, rules);

    expect(progress.discover('steam')).toBe(true);
    expect(progress.discover('steam')).toBe(false);
    expect(progress.hasCat('steam')).toBe(true);
  });

  it('враг открывается в бестиарии один раз и уходит в запись', () => {
    const { storage, saves } = memoryStorage();
    const progress = new Progress(storage, rules);

    expect(progress.hasEnemy('boots')).toBe(false);
    expect(progress.meetEnemy('boots')).toBe(true);
    expect(progress.meetEnemy('boots')).toBe(false);
    expect(progress.hasEnemy('boots')).toBe(true);

    progress.flush();
    expect(saves).toEqual([{ ...defaults, bestiary: ['boots'] }]);
  });

  it('бестиарий читается из сохранения', async () => {
    const { progress } = await loaded({ version: V, bestiary: ['rat'] });

    expect(progress.hasEnemy('rat')).toBe(true);
    expect(progress.hasEnemy('mouse')).toBe(false);
  });

  it('звук включён по умолчанию и читается из сохранения', async () => {
    expect(new Progress(memoryStorage().storage, rules).soundOn).toBe(true);

    const { progress } = await loaded({ version: V, sound: false });
    expect(progress.soundOn).toBe(false);
  });
});

describe('parseSave: версия 6 → 7, свой выключатель у музыки', () => {
  const v6 = (extra: object) => ({ ...defaults, version: 6, music: undefined, ...extra });

  it('у игрока со включённым звуком музыка включена', () => {
    const { data } = parseSave(v6({ sound: true }), rules);
    expect(data).toMatchObject({ version: V, sound: true, music: true });
  });

  it('кто выключил звук, когда выключатель был один, остаётся и без музыки', () => {
    const { data } = parseSave(v6({ sound: false }), rules);
    expect(data).toMatchObject({ version: V, sound: false, music: false });
  });

  it('остальное сохранение не меняется', () => {
    const { data } = parseSave(v6({ stars: { opushka: 3 }, fish: 12, perfect: ['opushka'], pending: { big: 1, small: 2 } }), rules);
    expect(data).toEqual({ ...defaults, stars: { opushka: 3 }, fish: 12, perfect: ['opushka'], pending: { big: 1, small: 2 } });
  });

  it('сохранение первой версии доходит до текущей с музыкой по настройке звука', () => {
    expect(parseSave({ version: 1, stars: {}, gear: {}, book: [], sound: false }, rules).data.music).toBe(false);
    expect(parseSave({ version: 1, stars: {}, gear: {}, book: [] }, rules).data.music).toBe(true);
  });

  it('в текущей версии музыка читается сама по себе, мусор вместо неё — включена', () => {
    expect(parseSave({ version: V, sound: false, music: true }, rules).data).toMatchObject({ sound: false, music: true });
    expect(parseSave({ version: V, sound: true, music: false }, rules).data).toMatchObject({ sound: true, music: false });
    expect(parseSave({ version: V, music: 'off' }, rules).data.music).toBe(true);
  });
});

describe('Progress: запись', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('пишет не сразу, а после задержки', () => {
    const { storage, saves } = memoryStorage();
    const progress = new Progress(storage, rules, 1000);

    progress.discover('steam');
    vi.advanceTimersByTime(999);
    expect(saves).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(storage.save).toHaveBeenCalledWith(SAVE_KEY, { ...defaults, book: ['steam'] });
  });

  it('несколько изменений подряд уходят одной записью', async () => {
    const { progress, saves } = await loaded({ version: V, items: [...STARTER, item('i4')], worn: defaults.worn }, 1000);

    progress.discover('steam');
    vi.advanceTimersByTime(400);
    progress.equip('i4');
    progress.recordStars('opushka', 3);
    vi.advanceTimersByTime(5000);

    expect(saves).toEqual([
      { ...defaults, stars: { opushka: 3 }, items: [...STARTER, item('i4')], worn: { ...defaults.worn, amulet: 'i4' }, nextItem: 5, book: ['steam'], perfect: ['opushka'], pending: { big: 1, small: 0 } },
    ]);
  });

  it('изменение после записи запускает новую задержку', () => {
    const { storage, saves } = memoryStorage();
    const progress = new Progress(storage, rules, 1000);

    progress.discover('steam');
    vi.advanceTimersByTime(1000);
    progress.discover('ice');
    vi.advanceTimersByTime(999);
    expect(saves).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(saves).toHaveLength(2);
  });

  it('flush пишет сразу и отменяет отложенную запись', () => {
    const { storage, saves } = memoryStorage();
    const progress = new Progress(storage, rules, 1000);

    progress.recordStars('opushka', 2);
    progress.flush();
    expect(saves).toEqual([{ ...defaults, stars: { opushka: 2 } }]);

    vi.advanceTimersByTime(5000);
    expect(saves).toHaveLength(1);
  });

  it('выключение звука уходит в сохранение, повтор того же значения — нет', () => {
    const { storage, saves } = memoryStorage();
    const progress = new Progress(storage, rules, 1000);

    progress.setSound(false);
    progress.flush();
    progress.setSound(false);
    progress.flush();

    expect(progress.soundOn).toBe(false);
    expect(saves).toEqual([{ ...defaults, sound: false }]);
  });

  it('выключение музыки уходит в сохранение отдельно от звука', () => {
    const { storage, saves } = memoryStorage();
    const progress = new Progress(storage, rules, 1000);

    progress.setMusic(false);
    progress.flush();
    progress.setMusic(false);
    progress.flush();

    expect([progress.soundOn, progress.musicOn]).toEqual([true, false]);
    expect(saves).toEqual([{ ...defaults, music: false }]);
  });

  it('без изменений ничего не пишет', () => {
    const { storage, saves } = memoryStorage();
    const progress = new Progress(storage, rules, 1000);

    progress.flush();
    progress.equip('i1');
    progress.salvage('i1');
    progress.upgradeItem('i1');
    progress.recordStars('opushka', 0);
    vi.advanceTimersByTime(5000);

    expect(saves).toEqual([]);
  });

  it('записанный снимок не меняется от следующих изменений', async () => {
    const { progress, saves } = await loaded({ version: V, shards: 10, fish: 100 }, 1000);

    progress.discover('steam');
    progress.flush();
    progress.discover('ice');
    progress.upgradeItem('i3');

    expect(saves[0]).toEqual({ ...defaults, shards: 10, fish: 100, book: ['steam'] });
  });

  it('незнакомые поля и предметы сохранения новее кода возвращает в хранилище как были', async () => {
    const mythic = { id: 'i9', slot: 'staff', rarity: 'mythic', bonuses: [], level: 1 };
    const saved = { version: NEWER, stars: { volcano: 2 }, items: [...STARTER, mythic], worn: defaults.worn, book: ['dragon'], fish: 7, guild: 120, pets: [{ id: 'owl' }] };
    const { progress, saves } = await loaded(saved, 1000);

    progress.recordStars('opushka', 3);
    progress.discover('steam');
    progress.flush();

    expect(saves).toEqual([
      {
        ...defaults,
        version: NEWER,
        stars: { volcano: 2, opushka: 3 },
        items: [...STARTER, mythic],
        // Номер непонятного предмета учтён: новый предмет его id не повторит.
        nextItem: 10,
        book: ['dragon', 'steam'],
        fish: 7,
        perfect: ['opushka'],
        pending: { big: 1, small: 0 },
        guild: 120,
        pets: [{ id: 'owl' }],
      },
    ]);
  });

  it('неудачная запись повторяется при следующем flush', async () => {
    const { storage, saves } = memoryStorage();
    vi.mocked(storage.save).mockRejectedValueOnce(new Error('offline'));
    const progress = new Progress(storage, rules, 1000);

    progress.discover('steam');
    progress.flush();
    await vi.advanceTimersByTimeAsync(0);
    progress.flush();

    expect(saves).toEqual([{ ...defaults, book: ['steam'] }]);
  });
});
