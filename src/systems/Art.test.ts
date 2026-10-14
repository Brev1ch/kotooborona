import { describe, expect, it } from 'vitest';
import { art, cats, economy, enemies, gear, levels, story } from '../data';
import type { BuildingKind, ElementId, EnemyTypeId, GearSlot } from '../data/types';
import { artId, itemArtId } from './Art';
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

  it('у каждого типа врага есть картинка', () => {
    for (const type of Object.keys(enemies.types) as EnemyTypeId[]) expect(ids).toContain(artId.enemy(type));
    expect(art.images.filter((image) => image.group === 'enemies')).toHaveLength(Object.keys(enemies.types).length);
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
