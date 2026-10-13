import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatsConfig, EnemiesConfig, GearConfig } from '../data/types';
import { CURRENT_VERSION, parseSave, Progress, SAVE_KEY, type Migration, type SaveRules, type SaveStorage } from './Progress';

// Из конфигов нужны только id предметов, умолчания, прокачка одного предмета и список стихий.
const rules: SaveRules = {
  gear: {
    defaults: { staff: 'none', mantle: 'thrift', amulet: 'cry' },
    staff: [{ id: 'none' }, { id: 'fire' }],
    mantle: [{ id: 'thrift' }, { id: 'sorc' }],
    amulet: [{ id: 'cry' }, { id: 'purse', bonusGold: 20, upgrades: [{ bonusGold: 30 }, { bonusGold: 40 }] }],
    upgradeCost: [40, 90],
  } as unknown as GearConfig,
  cats: { elements: { fire: {}, water: {}, steam: {}, ice: {} } } as unknown as CatsConfig,
  enemies: { types: { mouse: {}, rat: {}, shield: {}, boots: {}, boss: {}, king: {} } } as unknown as EnemiesConfig,
};

/** Текущая версия сохранения и версия «из будущего», которой этот код ещё не знает. */
const V = CURRENT_VERSION;
const NEWER = CURRENT_VERSION + 5;

const defaults = {
  version: V,
  stars: {},
  gear: { staff: 'none', mantle: 'thrift', amulet: 'cry' },
  book: [],
  sound: true,
  fish: 0,
  owned: ['staff:none', 'mantle:thrift', 'amulet:cry'],
  gearLevels: {},
  chests: 0,
  bestiary: [] as string[],
};

/** Все предметы тестового конфига: так выглядит инвентарь игрока, открывшего все сундуки. */
const ALL_GEAR = ['staff:none', 'mantle:thrift', 'amulet:cry', 'staff:fire', 'mantle:sorc', 'amulet:purse'];

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

describe('parseSave: чтение сохранения', () => {
  it('пустое хранилище даёт прогресс по умолчанию', () => {
    expect(parseSave(null, rules)).toEqual({ data: defaults, extra: {} });
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
      gear: { staff: 'fire', mantle: 'sorc', amulet: 'purse' },
      book: ['steam'],
      sound: false,
      fish: 9,
      owned: ALL_GEAR,
      gearLevels: { 'amulet:purse': 2 },
      chests: 3,
      bestiary: ['mouse', 'boots'],
    };

    expect(parseSave(raw, rules)).toEqual({ data: raw, extra: {} });
  });

  it('сохранение без настройки звука читается со включённым звуком, мусор в ней — тоже', () => {
    expect(parseSave({ version: V }, rules).data.sound).toBe(true);
    expect(parseSave({ version: V, sound: 'off' }, rules).data.sound).toBe(true);
  });

  it('недостающие поля заполняет умолчаниями', () => {
    expect(parseSave({ version: V, gear: { staff: 'fire' } }, rules).data).toEqual({
      ...defaults,
      gear: { staff: 'fire', mantle: 'thrift', amulet: 'cry' },
    });
  });

  it('неизвестный предмет и предмет из чужого слота заменяет умолчанием', () => {
    const { data } = parseSave({ version: V, gear: { staff: 'laser', mantle: 'fire', amulet: 7 } }, rules);

    expect(data.gear).toEqual(defaults.gear);
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
});

describe('parseSave: настоящие миграции', () => {
  // Сохранение первой версии игры: без рыбок.
  const v1 = {
    version: 1,
    stars: { opushka: 3 },
    gear: { staff: 'fire', mantle: 'sorc', amulet: 'purse' },
    book: ['steam', 'ice'],
    sound: false,
  };

  it('сохранение версии 1 читается без потерь', () => {
    const { data, extra } = parseSave(v1, rules);

    expect(data.version).toBe(V);
    expect(data.stars).toEqual({ opushka: 3 });
    expect(data.gear).toEqual({ staff: 'fire', mantle: 'sorc', amulet: 'purse' });
    expect(data.book).toEqual(['steam', 'ice']);
    expect(data.sound).toBe(false);
    expect(extra).toEqual({});
  });

  it('версия 1 → 2: рыбок ещё нет, счёт начинается с нуля', () => {
    expect(parseSave(v1, rules).data.fish).toBe(0);
  });

  it('версия 2 → 3: всё снаряжение, доступное до сундуков, остаётся у игрока', () => {
    const { data } = parseSave({ ...v1, version: 2, fish: 12 }, rules);

    // Предметов, которых нет в тестовом конфиге (остальные посохи, амулет алхимика), в результате нет.
    expect([...data.owned].sort()).toEqual([...ALL_GEAR].sort());
    expect(data.gearLevels).toEqual({});
    expect(data.chests).toBe(0);
    expect(data.fish).toBe(12);
  });

  it('после миграции надетые до неё предметы остаются надетыми', async () => {
    const progress = new Progress(memoryStorage(v1).storage, rules);
    await progress.load();

    expect(progress.gear).toEqual({ staff: 'fire', mantle: 'sorc', amulet: 'purse' });
    expect(progress.ownsGear('staff', 'fire')).toBe(true);
  });

  it('после загрузки версии 1 запись уходит уже в текущей версии и с прежним прогрессом', async () => {
    const { storage, saves } = memoryStorage(v1);
    const progress = new Progress(storage, rules, 1000);
    await progress.load();

    progress.addFish(5);
    progress.flush();

    expect(saves).toEqual([{ ...defaults, ...v1, version: V, fish: 5, owned: ALL_GEAR, bestiary: ['mouse', 'rat', 'boss'] }]);
  });
});

describe('parseSave: версия 3 → 4, бестиарий', () => {
  const v3 = (stars: unknown) => ({ version: 3, stars, gear: defaults.gear, book: [], sound: true, fish: 7, owned: [], gearLevels: {}, chests: 1 });

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

  it('сохранение версии 4 читается как есть: без повторов, чужих типов и мусора', () => {
    const raw = { version: 4, stars: { lager: 3 }, bestiary: ['boots', 'boots', 'dragon', 7, 'mouse'] };

    expect(parseSave(raw, rules).data.bestiary).toEqual(['boots', 'mouse']);
    expect(parseSave({ version: 4, bestiary: 'boots' }, rules).data.bestiary).toEqual([]);
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
    expect(progress.fish).toBe(0);

    progress.addFish(30);
    progress.addFish(12);
    expect(progress.fish).toBe(42);

    expect(progress.spendFish(50)).toBe(false);
    expect(progress.fish).toBe(42);
    expect(progress.spendFish(40)).toBe(true);
    expect(progress.fish).toBe(2);
  });

  it('нулевая и отрицательная прибавка ничего не меняют и не пишут', () => {
    const { storage, saves } = memoryStorage();
    const progress = new Progress(storage, rules, 1000);
    progress.addFish(0);
    progress.addFish(-5);
    progress.flush();

    expect(progress.fish).toBe(0);
    expect(saves).toEqual([]);
  });
});

describe('parseSave: снаряжение и сундуки', () => {
  it('предметы по умолчанию есть всегда, даже если в сохранении их нет', () => {
    const { data } = parseSave({ version: V, owned: ['staff:fire'] }, rules);

    expect(data.owned).toEqual([...defaults.owned, 'staff:fire']);
  });

  it('из списка предметов убирает незнакомые, мусор и повторы', () => {
    const owned = ['staff:fire', 'staff:laser', 'fire', 7, 'staff:fire', 'boots:fire', 'mantle:fire'];

    expect(parseSave({ version: V, owned }, rules).data.owned).toEqual([...defaults.owned, 'staff:fire']);
  });

  it('уровни держит в пределах предмета; первый уровень, мусор и незнакомые предметы не хранит', () => {
    const gearLevels = { 'amulet:purse': 9, 'staff:fire': 3, 'mantle:sorc': 1, 'amulet:cry': 'два', 'staff:laser': 2 };

    expect(parseSave({ version: V, gearLevels }, rules).data.gearLevels).toEqual({ 'amulet:purse': 3 });
  });

  it('число открытых сундуков — целое неотрицательное', () => {
    expect(parseSave({ version: V, chests: 4 }, rules).data.chests).toBe(4);
    expect(parseSave({ version: V, chests: 2.7 }, rules).data.chests).toBe(2);
    for (const chests of [-1, '3', NaN, null]) expect(parseSave({ version: V, chests }, rules).data.chests).toBe(0);
  });

  it('сохранение новее кода: незнакомые предметы и уровни выше известных остаются', () => {
    const raw = { version: NEWER, owned: ['staff:laser'], gearLevels: { 'staff:laser': 4, 'amulet:purse': 7 } };
    const { data } = parseSave(raw, rules);

    expect(data.owned).toEqual([...defaults.owned, 'staff:laser']);
    expect(data.gearLevels).toEqual({ 'staff:laser': 4, 'amulet:purse': 7 });
  });
});

describe('Progress: снаряжение из сундуков', () => {
  it('у нового игрока есть только предметы по умолчанию, чужой предмет не надевается', () => {
    const progress = new Progress(memoryStorage().storage, rules);

    expect(progress.ownsGear('mantle', 'thrift')).toBe(true);
    expect(progress.ownsGear('staff', 'fire')).toBe(false);

    progress.selectGear('staff', 'fire');
    expect(progress.gear.staff).toBe('none');
  });

  it('предмет из сундука появляется у игрока вместе с рыбками, счёт сундуков растёт', () => {
    const { storage, saves } = memoryStorage();
    const progress = new Progress(storage, rules, 1000);

    progress.claimChest({ item: { slot: 'staff', id: 'fire' }, fish: 15 });
    expect(progress.chestsOpened).toBe(1);
    expect(progress.fish).toBe(15);
    expect(progress.ownsGear('staff', 'fire')).toBe(true);

    progress.selectGear('staff', 'fire');
    expect(progress.gear.staff).toBe('fire');

    progress.flush();
    expect(saves).toEqual([
      { ...defaults, fish: 15, chests: 1, owned: [...defaults.owned, 'staff:fire'], gear: { ...defaults.gear, staff: 'fire' } },
    ]);
  });

  it('сундук без предмета даёт только рыбки; тот же предмет дважды не записывается', () => {
    const progress = new Progress(memoryStorage().storage, rules);
    progress.claimChest({ item: null, fish: 60 });
    progress.claimChest({ item: { slot: 'mantle', id: 'thrift' }, fish: 0 });

    expect(progress.chestsOpened).toBe(2);
    expect(progress.fish).toBe(60);
  });

  it('надетый в сохранении предмет, которого у игрока нет, заменяется предметом по умолчанию', async () => {
    const progress = new Progress(memoryStorage({ version: V, gear: { staff: 'fire' } }).storage, rules);
    await progress.load();

    expect(progress.gear.staff).toBe('none');
  });

  it('звёзды всех уровней складываются', () => {
    const progress = new Progress(memoryStorage().storage, rules);
    expect(progress.totalStars).toBe(0);

    progress.recordStars('a', 3);
    progress.recordStars('b', 1);
    progress.recordStars('a', 2);
    expect(progress.totalStars).toBe(4);
  });
});

describe('Progress: прокачка снаряжения', () => {
  async function withPurse(fish: number) {
    const { storage, saves } = memoryStorage({ version: V, fish, owned: ['amulet:purse'] });
    const progress = new Progress(storage, rules, 1000);
    await progress.load();
    return { progress, saves };
  }

  it('уровень растёт на один, рыбки списываются по цене уровня', async () => {
    const { progress, saves } = await withPurse(200);
    expect(progress.gearLevel('amulet', 'purse')).toBe(1);

    expect(progress.upgradeGear('amulet', 'purse')).toBe(true);
    expect(progress.gearLevel('amulet', 'purse')).toBe(2);
    expect(progress.fish).toBe(160);

    expect(progress.upgradeGear('amulet', 'purse')).toBe(true);
    expect(progress.gearLevel('amulet', 'purse')).toBe(3);
    expect(progress.fish).toBe(70);

    progress.flush();
    expect(saves[0]).toMatchObject({ fish: 70, gearLevels: { 'amulet:purse': 3 } });
  });

  it('на последнем уровне прокачка не идёт и рыбки не тратятся', async () => {
    const { progress } = await withPurse(1000);
    progress.upgradeGear('amulet', 'purse');
    progress.upgradeGear('amulet', 'purse');

    expect(progress.upgradeGear('amulet', 'purse')).toBe(false);
    expect(progress.gearLevel('amulet', 'purse')).toBe(3);
    expect(progress.fish).toBe(870);
  });

  it('без рыбок, без предмета и у предмета без улучшений прокачки нет', async () => {
    const { progress } = await withPurse(39);
    expect(progress.upgradeGear('amulet', 'purse')).toBe(false);

    progress.addFish(500);
    expect(progress.upgradeGear('staff', 'fire')).toBe(false);
    expect(progress.upgradeGear('amulet', 'cry')).toBe(false);
    expect(progress.upgradeGear('amulet', 'laser')).toBe(false);
    expect(progress.fish).toBe(539);
    expect(progress.gearLevel('amulet', 'laser')).toBe(1);
  });
});

describe('parseSave: сохранение новее кода', () => {
  const raw = {
    version: NEWER,
    stars: { opushka: 3, volcano: 2 },
    gear: { staff: 'fire', mantle: 'cloak', amulet: 'purse' },
    book: ['steam', 'dragon'],
    guild: 120,
    pets: [{ id: 'owl' }],
  };

  it('знакомые поля читает, версию не понижает', () => {
    const { data } = parseSave(raw, rules);

    expect(data.version).toBe(NEWER);
    expect(data.stars).toEqual({ opushka: 3, volcano: 2 });
  });

  it('незнакомый предмет оставляет в слоте, мусор заменяет умолчанием', () => {
    expect(parseSave(raw, rules).data.gear).toEqual({ staff: 'fire', mantle: 'cloak', amulet: 'purse' });
    expect(parseSave({ version: NEWER, gear: { mantle: 7 } }, rules).data.gear).toEqual(defaults.gear);
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
});

describe('Progress: изменения', () => {
  it('до загрузки и без сохранения отдаёт умолчания', async () => {
    const progress = new Progress(memoryStorage().storage, rules);

    expect(progress.gear).toEqual(defaults.gear);
    await progress.load();

    expect(progress.gear).toEqual(defaults.gear);
    expect(progress.stars('opushka')).toBe(0);
    expect(progress.hasCat('steam')).toBe(false);
  });

  it('загружает сохранённый прогресс', async () => {
    const saved = { version: V, stars: { opushka: 2 }, gear: { staff: 'fire' }, book: ['steam'], owned: ALL_GEAR };
    const progress = new Progress(memoryStorage(saved).storage, rules);
    await progress.load();

    expect(progress.stars('opushka')).toBe(2);
    expect(progress.gear.staff).toBe('fire');
    expect(progress.hasCat('steam')).toBe(true);
  });

  it('звёзды уровня только растут', () => {
    const progress = new Progress(memoryStorage().storage, rules);

    progress.recordStars('opushka', 2);
    progress.recordStars('opushka', 1);
    expect(progress.stars('opushka')).toBe(2);

    progress.recordStars('opushka', 3);
    expect(progress.stars('opushka')).toBe(3);
  });

  it('надевает только предмет своего слота', async () => {
    const progress = new Progress(memoryStorage({ version: V, owned: ALL_GEAR }).storage, rules);
    await progress.load();

    progress.selectGear('mantle', 'sorc');
    progress.selectGear('staff', 'sorc');
    progress.selectGear('amulet', 'laser');

    expect(progress.gear).toEqual({ staff: 'none', mantle: 'sorc', amulet: 'cry' });
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
    const progress = new Progress(memoryStorage({ version: V, bestiary: ['rat'] }).storage, rules);
    await progress.load();

    expect(progress.hasEnemy('rat')).toBe(true);
    expect(progress.hasEnemy('mouse')).toBe(false);
  });

  it('звук включён по умолчанию и читается из сохранения', async () => {
    expect(new Progress(memoryStorage().storage, rules).soundOn).toBe(true);

    const progress = new Progress(memoryStorage({ version: V, sound: false }).storage, rules);
    await progress.load();

    expect(progress.soundOn).toBe(false);
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
    const { storage, saves } = memoryStorage({ version: V, owned: ALL_GEAR });
    const progress = new Progress(storage, rules, 1000);
    await progress.load();

    progress.discover('steam');
    vi.advanceTimersByTime(400);
    progress.selectGear('staff', 'fire');
    progress.recordStars('opushka', 3);
    vi.advanceTimersByTime(5000);

    expect(saves).toEqual([
      {
        ...defaults,
        stars: { opushka: 3 },
        gear: { staff: 'fire', mantle: 'thrift', amulet: 'cry' },
        book: ['steam'],
        owned: ALL_GEAR,
      },
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

  it('без изменений ничего не пишет', () => {
    const { storage, saves } = memoryStorage();
    const progress = new Progress(storage, rules, 1000);

    progress.flush();
    progress.selectGear('staff', 'none');
    progress.recordStars('opushka', 0);
    vi.advanceTimersByTime(5000);

    expect(saves).toEqual([]);
  });

  it('записанный снимок не меняется от следующих изменений', () => {
    const { storage, saves } = memoryStorage();
    const progress = new Progress(storage, rules, 1000);

    progress.discover('steam');
    progress.flush();
    progress.discover('ice');

    expect(saves[0]).toEqual({ ...defaults, book: ['steam'] });
  });

  it('незнакомые поля сохранения новее кода возвращает в хранилище как были', async () => {
    const saved = { version: NEWER, stars: { volcano: 2 }, book: ['dragon'], fish: 7, guild: 120, pets: [{ id: 'owl' }] };
    const { storage, saves } = memoryStorage(saved);
    const progress = new Progress(storage, rules, 1000);
    await progress.load();

    progress.recordStars('opushka', 3);
    progress.discover('steam');
    progress.flush();

    expect(saves).toEqual([
      {
        version: NEWER,
        stars: { volcano: 2, opushka: 3 },
        gear: defaults.gear,
        book: ['dragon', 'steam'],
        sound: true,
        fish: 7,
        owned: defaults.owned,
        gearLevels: {},
        chests: 0,
        bestiary: [],
        guild: 120,
        pets: [{ id: 'owl' }],
      },
    ]);
  });

  describe('незнакомый предмет из сохранения новее кода', () => {
    const saved = { version: NEWER, gear: { staff: 'fire', mantle: 'cloak', amulet: 'purse' }, owned: [...ALL_GEAR, 'mantle:cloak'] };
    const owned = saved.owned;

    it('в бою заменяется предметом по умолчанию, а в сохранении остаётся', async () => {
      const { storage, saves } = memoryStorage(saved);
      const progress = new Progress(storage, rules, 1000);
      await progress.load();
      expect(progress.gear).toEqual({ staff: 'fire', mantle: 'thrift', amulet: 'purse' });

      progress.selectGear('staff', 'none');
      // Мантия по умолчанию и так показана надетой: её выбор — не смена предмета.
      progress.selectGear('mantle', 'thrift');
      progress.flush();

      expect(saves).toEqual([{ ...defaults, version: NEWER, owned, gear: { staff: 'none', mantle: 'cloak', amulet: 'purse' } }]);
    });

    it('пропадает из сохранения, когда игрок выбрал в слоте другой предмет', async () => {
      const { storage, saves } = memoryStorage(saved);
      const progress = new Progress(storage, rules, 1000);
      await progress.load();

      progress.selectGear('mantle', 'sorc');
      progress.flush();

      expect(progress.gear.mantle).toBe('sorc');
      expect(saves).toEqual([{ ...defaults, version: NEWER, owned, gear: { staff: 'fire', mantle: 'sorc', amulet: 'purse' } }]);
    });
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
