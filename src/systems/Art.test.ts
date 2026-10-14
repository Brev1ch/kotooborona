import { describe, expect, it } from 'vitest';
import { art, cats, economy, enemies, gear, levels, story } from '../data';
import type { BuildingKind, ElementId, EnemyTypeId, GearSlot } from '../data/types';
import { ArtCatalog, artId, itemArtId, readArtIndex, type ArtIndex } from './Art';
import type { Item } from './Items';

const ids = new Set(art.images.map((image) => image.id));
const byId = (id: string) => art.images.find((image) => image.id === id);

describe('манифест арта', () => {
  it('имена и файлы не повторяются', () => {
    expect(ids.size).toBe(art.images.length);
    expect(new Set(art.images.map((image) => image.file)).size).toBe(art.images.length);
  });

  it.each(art.images.map((image) => [image.id, image] as const))('%s: размер, файл и назначение заданы', (_id, image) => {
    expect(Number.isInteger(image.width) && image.width > 0).toBe(true);
    expect(Number.isInteger(image.height) && image.height > 0).toBe(true);
    expect(image.file).toMatch(/^[a-z]+\/[A-Za-z0-9-]+\.png$/);
    expect(image.use.length).toBeGreaterThan(0);
  });

  it('у каждой стихии есть кот', () => {
    for (const element of Object.keys(cats.elements) as ElementId[]) expect(ids).toContain(artId.cat(element));
    expect(art.images.filter((image) => image.group === 'cats')).toHaveLength(Object.keys(cats.elements).length);
  });

  it('коты — квадратные и стоят по нижнему краю: в клетке у всех одна линия земли', () => {
    for (const image of art.images.filter((entry) => entry.group === 'cats')) {
      expect(image.width).toBe(image.height);
      expect(image.align).toBe('bottom');
    }
  });

  it('враги — квадратные, стоят по нижнему краю, сторона — по их размеру из enemies.json', () => {
    for (const type of Object.keys(enemies.types) as EnemyTypeId[]) {
      const image = byId(artId.enemy(type))!;
      const side = Math.round(art.enemyFrame * enemies.types[type].size);
      expect([image.width, image.height, image.align]).toEqual([side, side, 'bottom']);
    }
    const broken = byId(artId.shieldBroken)!;
    expect(broken.sizeOf).toBe('shield');
    expect([broken.width, broken.height, broken.align]).toEqual([byId(artId.enemy('shield'))!.width, byId(artId.enemy('shield'))!.height, 'bottom']);
  });

  it('точки для эффектов лежат внутри картинки; у героя есть навершие посоха, у шамана — кристалл', () => {
    for (const image of art.images) {
      for (const [x, y] of Object.values(image.anchors ?? {})) {
        expect(x >= 0 && x <= 1 && y >= 0 && y <= 1).toBe(true);
      }
    }
    expect(byId(artId.hero)?.anchors?.orb).toBeDefined();
    expect(byId(artId.enemy('shaman'))?.anchors?.crystal).toBeDefined();
  });

  it('ручная поправка масштаба — только у котов и врагов и положительная', () => {
    for (const image of art.images.filter((entry) => entry.scale !== undefined)) {
      expect(['cats', 'enemies']).toContain(image.group);
      expect(image.scale).toBeGreaterThan(0);
    }
  });

  it('у каждого типа врага есть картинка', () => {
    for (const type of Object.keys(enemies.types) as EnemyTypeId[]) expect(ids).toContain(artId.enemy(type));
    // И сломанный щит щитоносца.
    expect(ids).toContain(artId.shieldBroken);
    expect(art.images.filter((image) => image.group === 'enemies')).toHaveLength(Object.keys(enemies.types).length + 1);
  });

  it('есть герой', () => {
    expect(ids).toContain(artId.hero);
  });

  it('у каждого строения есть картинка на каждый уровень', () => {
    const kinds = Object.entries(economy.buildings.kinds) as [BuildingKind, unknown[]][];
    for (const [kind, kindLevels] of kinds) {
      kindLevels.forEach((_, index) => expect(ids).toContain(artId.building(kind, index + 1)));
    }
    expect(art.images.filter((image) => image.group === 'buildings')).toHaveLength(kinds.reduce((sum, [, list]) => sum + list.length, 0));
  });

  it('у каждого уровня главы свой фон, и грузится он при входе в этот уровень', () => {
    for (const level of levels.levels) {
      const image = byId(artId.background(level.id));
      expect(image?.level).toBe(level.id);
      expect(image?.atlas).toBeUndefined();
      expect([image?.width, image?.height]).toEqual([360 * art.scale, 540 * art.scale]);
    }
    expect(art.images.filter((image) => image.group === 'backgrounds')).toHaveLength(levels.levels.length);
  });

  it('у каждого говорящего в сценках есть портрет', () => {
    const speakers = new Set(story.scenes.flatMap((scene) => scene.lines.map((line) => line.speaker)));
    for (const speaker of speakers) expect(ids).toContain(artId.portrait(speaker));
    expect(art.images.filter((image) => image.group === 'portraits')).toHaveLength(speakers.size);
  });

  it('есть значки валют и три фона кнопок с нерастягиваемыми краями', () => {
    for (const icon of ['coin', 'crystal', 'fish'] as const) expect(ids).toContain(artId.icon(icon));
    for (const kind of ['normal', 'primary', 'ad'] as const) {
      const image = byId(artId.button(kind));
      expect(image?.slice).toBeGreaterThan(0);
      // Середина между краями должна остаться.
      expect(image!.slice! * 2).toBeLessThan(Math.min(image!.width, image!.height));
    }
  });

  it('всё, кроме фонов уровней, собрано в атласы', () => {
    for (const image of art.images) expect(image.atlas === undefined).toBe(image.group === 'backgrounds');
  });
});

describe('картинка предмета', () => {
  const item = (slot: GearSlot, bonuses: Item['bonuses'], extra: Partial<Item> = {}): Item => ({ id: 'i1', slot, rarity: 'common', bonuses, level: 1, ...extra });

  it('на каждую пару «слот и характерный бонус» и на каждый слот — своя, всего десять', () => {
    const expected = new Set<string>();
    for (const slot of ['staff', 'mantle', 'amulet'] as const) {
      expected.add(itemArtId(gear.items, item(slot, [])));
      for (const [kind, rule] of Object.entries(gear.items.pool)) {
        if (!rule.main?.includes(slot)) continue;
        expected.add(itemArtId(gear.items, item(slot, [{ kind: kind as keyof typeof gear.items.pool, value: rule.min }])));
      }
    }
    expect([...expected].sort()).toEqual(art.images.filter((image) => image.group === 'items').map((image) => image.id).sort());
    expect(expected.size).toBe(10);
  });

  it('выбирается по главному бонусу, даже если он стоит не первым', () => {
    const bonuses: Item['bonuses'] = [
      { kind: 'buildingIncome', value: 0.1 },
      { kind: 'gold', value: 10 },
    ];
    expect(itemArtId(gear.items, item('amulet', bonuses))).toBe('item-amulet-gold');
  });

  it('стихия на картинку не влияет', () => {
    const fire = item('staff', [{ kind: 'summonChance', value: 1.5, element: 'fire' }]);
    const water = item('staff', [{ kind: 'summonChance', value: 1.5, element: 'water' }]);
    expect(itemArtId(gear.items, fire)).toBe(itemArtId(gear.items, water));
  });

  it('без характерного бонуса — общая картинка слота', () => {
    expect(itemArtId(gear.items, item('staff', [{ kind: 'elementDamage', value: 0.1, element: 'fire' }]))).toBe('item-staff');
    expect(itemArtId(gear.items, item('mantle', []))).toBe('item-mantle');
  });

  it('легендарный предмет берёт картинку по своему главному бонусу', () => {
    const phoenix = item('staff', [{ kind: 'summonChance', value: 2, element: 'fire' }], { rarity: 'legendary', legendary: 'phoenix' });
    expect(itemArtId(gear.items, phoenix)).toBe('item-staff-summonChance');
  });
});

describe('каталог готового арта', () => {
  const frame = { frame: { x: 0, y: 0, w: 10, h: 10 } };
  const index: ArtIndex = {
    atlases: {
      units: { file: 'units.webp', bytes: 1000, frames: { 'cat-fire': frame, 'enemy-mouse': frame } },
      ui: { file: 'ui.webp', bytes: 500, frames: { 'button-primary': frame } },
      old: { file: 'old.webp', bytes: 70, frames: { gone: frame } },
    },
    images: {
      'bg-opushka': { file: 'backgrounds/opushka.webp', bytes: 300 },
      'bg-lager': { file: 'backgrounds/lager.webp', bytes: 400 },
    },
  };
  const catalog = new ArtCatalog(art, index);

  it('без списка готового картинок нет: всё рисуется кодом', () => {
    const empty = new ArtCatalog(art);
    for (const image of art.images) expect(empty.find(image.id)).toBeNull();
    expect(empty.startupLoads('opushka')).toEqual([]);
    expect(empty.levelLoads('opushka')).toEqual([]);
  });

  it('готовая картинка атласа — кадр атласа с размером на экране вдвое меньше картинки', () => {
    expect(catalog.find('cat-fire')).toEqual({ key: 'art:units', frame: 'cat-fire', width: 60, height: 60, scale: 2 });
  });

  it('картинки, которой в атласе нет, нет и в игре', () => {
    expect(catalog.find('cat-water')).toBeNull();
    expect(catalog.find('hero')).toBeNull();
  });

  it('имени, которого нет в манифесте, нет, даже если оно есть в списке', () => {
    expect(catalog.find('gone')).toBeNull();
    expect(catalog.find('nothing')).toBeNull();
  });

  it('у фона кнопки известны нерастягиваемые края', () => {
    expect(catalog.find('button-primary')).toMatchObject({ slice: 24, width: 48, height: 48 });
  });

  it('фон уровня — отдельная картинка', () => {
    expect(catalog.find('bg-lager')).toEqual({ key: 'bg-lager', width: 360, height: 540, scale: 2 });
    expect(catalog.find('bg-dub')).toBeNull();
  });

  it('при запуске грузятся атласы манифеста и фон первого уровня, остальные фоны — нет', () => {
    const loads = catalog.startupLoads('opushka');
    expect(loads.map((load) => load.key)).toEqual(['art:units', 'art:ui', 'bg-opushka']);
    expect(loads[0]).toEqual({ key: 'art:units', file: 'units.webp', bytes: 1000, frames: index.atlases.units.frames });
    expect(loads.reduce((sum, load) => sum + load.bytes, 0)).toBe(1800);
  });

  it('при входе в уровень грузится только его фон', () => {
    expect(catalog.levelLoads('lager')).toEqual([{ key: 'bg-lager', file: 'backgrounds/lager.webp', bytes: 400 }]);
    expect(catalog.levelLoads('dub')).toEqual([]);
  });

  it('фоны других уровней при входе в уровень освобождаются', () => {
    const keys = catalog.otherLevelKeys('lager');
    expect(keys).toHaveLength(levels.levels.length - 1);
    expect(keys).toContain('bg-opushka');
    expect(keys).not.toContain('bg-lager');
  });
});

describe('чтение списка готового арта', () => {
  it.each([null, undefined, 5, 'x', [], {}, { atlases: 3, images: [] }])('испорченный список %j — пустой', (raw) => {
    expect(readArtIndex(raw)).toEqual({ atlases: {}, images: {} });
  });

  it('пропускает записи без файла и без кадров, остальное читает', () => {
    const read = readArtIndex({
      atlases: {
        units: { file: 'units.webp', bytes: 10, width: 1024, frames: { a: { frame: {} }, b: 5 } },
        broken: { file: 'broken.webp' },
        nameless: { frames: {} },
      },
      images: { 'bg-opushka': { file: 'backgrounds/opushka.webp', bytes: 7 }, bad: { bytes: 1 }, worse: 'x' },
    });
    expect(read).toEqual({
      atlases: { units: { file: 'units.webp', bytes: 10, frames: { a: { frame: {} } } } },
      images: { 'bg-opushka': { file: 'backgrounds/opushka.webp', bytes: 7 } },
    });
  });
});
