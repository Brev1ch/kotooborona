import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatsConfig, GearConfig } from '../data/types';
import { parseSave, Progress, SAVE_KEY, type Migration, type SaveRules, type SaveStorage } from './Progress';

// Из конфигов нужны только id предметов, умолчания и список стихий.
const rules: SaveRules = {
  gear: {
    defaults: { staff: 'none', mantle: 'thrift', amulet: 'cry' },
    staff: [{ id: 'none' }, { id: 'fire' }],
    mantle: [{ id: 'thrift' }, { id: 'sorc' }],
    amulet: [{ id: 'cry' }, { id: 'purse' }],
  } as unknown as GearConfig,
  cats: { elements: { fire: {}, water: {}, steam: {}, ice: {} } } as unknown as CatsConfig,
};

const defaults = { version: 1, stars: {}, gear: { staff: 'none', mantle: 'thrift', amulet: 'cry' }, book: [], sound: true };

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
      version: 1,
      stars: { opushka: 2 },
      gear: { staff: 'fire', mantle: 'sorc', amulet: 'purse' },
      book: ['steam'],
      sound: false,
    };

    expect(parseSave(raw, rules)).toEqual({ data: raw, extra: {} });
  });

  it('сохранение без настройки звука читается со включённым звуком, мусор в ней — тоже', () => {
    expect(parseSave({ version: 1 }, rules).data.sound).toBe(true);
    expect(parseSave({ version: 1, sound: 'off' }, rules).data.sound).toBe(true);
  });

  it('недостающие поля заполняет умолчаниями', () => {
    expect(parseSave({ version: 1, gear: { staff: 'fire' } }, rules).data).toEqual({
      ...defaults,
      gear: { staff: 'fire', mantle: 'thrift', amulet: 'cry' },
    });
  });

  it('неизвестный предмет и предмет из чужого слота заменяет умолчанием', () => {
    const { data } = parseSave({ version: 1, gear: { staff: 'laser', mantle: 'fire', amulet: 7 } }, rules);

    expect(data.gear).toEqual(defaults.gear);
  });

  it('звёзды держит в пределах от 1 до 3, мусор отбрасывает', () => {
    const { data } = parseSave({ version: 1, stars: { a: 5, b: 0, c: -1, d: '3', e: 2.9, f: NaN } }, rules);

    expect(data.stars).toEqual({ a: 3, e: 2 });
  });

  it('из книги убирает неизвестных котов, мусор и повторы', () => {
    const { data } = parseSave({ version: 1, book: ['steam', 'dragon', 3, 'steam', 'ice'] }, rules);

    expect(data.book).toEqual(['steam', 'ice']);
  });

  it('незнакомые поля сохранения текущей версии отбрасывает', () => {
    expect(parseSave({ version: 1, junk: true }, rules).extra).toEqual({});
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

describe('parseSave: сохранение новее кода', () => {
  const raw = {
    version: 4,
    stars: { opushka: 3, volcano: 2 },
    gear: { staff: 'fire', mantle: 'cloak', amulet: 'purse' },
    book: ['steam', 'dragon'],
    fish: 120,
    chests: [{ id: 'wood' }],
  };

  it('знакомые поля читает, версию не понижает', () => {
    const { data } = parseSave(raw, rules);

    expect(data.version).toBe(4);
    expect(data.stars).toEqual({ opushka: 3, volcano: 2 });
  });

  it('незнакомый предмет оставляет в слоте, мусор заменяет умолчанием', () => {
    expect(parseSave(raw, rules).data.gear).toEqual({ staff: 'fire', mantle: 'cloak', amulet: 'purse' });
    expect(parseSave({ version: 4, gear: { mantle: 7 } }, rules).data.gear).toEqual(defaults.gear);
  });

  it('незнакомые поля и незнакомых котов сохраняет', () => {
    const { data, extra } = parseSave(raw, rules);

    expect(extra).toEqual({ fish: 120, chests: [{ id: 'wood' }] });
    expect(data.book).toEqual(['steam', 'dragon']);
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
    const saved = { version: 1, stars: { opushka: 2 }, gear: { staff: 'fire' }, book: ['steam'] };
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

  it('надевает только предмет своего слота', () => {
    const progress = new Progress(memoryStorage().storage, rules);

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

  it('звук включён по умолчанию и читается из сохранения', async () => {
    expect(new Progress(memoryStorage().storage, rules).soundOn).toBe(true);

    const progress = new Progress(memoryStorage({ version: 1, sound: false }).storage, rules);
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

  it('несколько изменений подряд уходят одной записью', () => {
    const { storage, saves } = memoryStorage();
    const progress = new Progress(storage, rules, 1000);

    progress.discover('steam');
    vi.advanceTimersByTime(400);
    progress.selectGear('staff', 'fire');
    progress.recordStars('opushka', 3);
    vi.advanceTimersByTime(5000);

    expect(saves).toEqual([
      { version: 1, stars: { opushka: 3 }, gear: { staff: 'fire', mantle: 'thrift', amulet: 'cry' }, book: ['steam'], sound: true },
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
    const saved = { version: 4, stars: { volcano: 2 }, book: ['dragon'], fish: 120, chests: [{ id: 'wood' }] };
    const { storage, saves } = memoryStorage(saved);
    const progress = new Progress(storage, rules, 1000);
    await progress.load();

    progress.recordStars('opushka', 3);
    progress.discover('steam');
    progress.flush();

    expect(saves).toEqual([
      {
        version: 4,
        stars: { volcano: 2, opushka: 3 },
        gear: defaults.gear,
        book: ['dragon', 'steam'],
        sound: true,
        fish: 120,
        chests: [{ id: 'wood' }],
      },
    ]);
  });

  describe('незнакомый предмет из сохранения новее кода', () => {
    const saved = { version: 4, gear: { staff: 'fire', mantle: 'cloak', amulet: 'purse' } };

    it('в бою заменяется предметом по умолчанию, а в сохранении остаётся', async () => {
      const { storage, saves } = memoryStorage(saved);
      const progress = new Progress(storage, rules, 1000);
      await progress.load();
      expect(progress.gear).toEqual({ staff: 'fire', mantle: 'thrift', amulet: 'purse' });

      progress.selectGear('staff', 'none');
      // Мантия по умолчанию и так показана надетой: её выбор — не смена предмета.
      progress.selectGear('mantle', 'thrift');
      progress.flush();

      expect(saves).toEqual([{ ...defaults, version: 4, gear: { staff: 'none', mantle: 'cloak', amulet: 'purse' } }]);
    });

    it('пропадает из сохранения, когда игрок выбрал в слоте другой предмет', async () => {
      const { storage, saves } = memoryStorage(saved);
      const progress = new Progress(storage, rules, 1000);
      await progress.load();

      progress.selectGear('mantle', 'sorc');
      progress.flush();

      expect(progress.gear.mantle).toBe('sorc');
      expect(saves).toEqual([{ ...defaults, version: 4, gear: { staff: 'fire', mantle: 'sorc', amulet: 'purse' } }]);
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
