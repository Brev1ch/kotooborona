import { afterEach, describe, expect, it } from 'vitest';
import { cats, gear, type GearSlot, type Rarity } from '../data';
import { setLang } from '../i18n';
import { legacyItem, rollItem, type Item, type ItemBonus } from '../systems/Items';
import { seededRandom } from '../systems/Random';
import { itemTitle } from './itemTitle';

function item(slot: GearSlot, bonuses: ItemBonus[], rarity: Rarity = 'common', legendary?: string): Item {
  return { id: 'i1', slot, rarity, bonuses, level: 1, ...(legendary ? { legendary } : {}) };
}

afterEach(() => setLang('ru'));

describe('itemTitle: название по главному бонусу', () => {
  it.each([
    [item('staff', [{ kind: 'summonChance', value: 1.5, element: 'fire' }]), 'Огненный посох', 'Fire Staff'],
    [item('staff', [{ kind: 'summonChance', value: 1.5, element: 'air' }]), 'Ветряной посох', 'Wind Staff'],
    [item('mantle', [{ kind: 'overLimitCost', value: 0.2 }]), 'Мантия бережливости', 'Mantle of Thrift'],
    [item('mantle', [{ kind: 'meteorCooldown', value: 0.2 }]), 'Мантия чародея', 'Mantle of the Sorcerer'],
    [item('amulet', [{ kind: 'ritualTime', value: 0.3 }]), 'Амулет алхимика', 'Amulet of the Alchemist'],
    [item('amulet', [{ kind: 'elementDamage', value: 0.1, element: 'water' }]), 'Амулет воды', 'Amulet of Water'],
  ])('%#: %s', (subject, ru, en) => {
    expect(itemTitle(subject)).toBe(ru);
    setLang('en');
    expect(itemTitle(subject)).toBe(en);
  });

  it('у эпических и легендарных — приставка редкости, согласованная со слотом', () => {
    expect(itemTitle(item('staff', [{ kind: 'summonChance', value: 1.5, element: 'fire' }], 'epic'))).toBe('Эпический огненный посох');
    expect(itemTitle(item('mantle', [{ kind: 'overLimitCost', value: 0.2 }], 'epic'))).toBe('Эпическая мантия бережливости');
    expect(itemTitle(item('amulet', [{ kind: 'ritualTime', value: 0.3 }], 'legendary'))).toBe('Легендарный амулет алхимика');
    setLang('en');
    expect(itemTitle(item('staff', [{ kind: 'summonChance', value: 1.5, element: 'fire' }], 'epic'))).toBe('Epic Fire Staff');
    expect(itemTitle(item('amulet', [{ kind: 'ritualTime', value: 0.3 }], 'legendary'))).toBe('Legendary Amulet of the Alchemist');
  });

  it('у обычных и редких приставки нет', () => {
    for (const rarity of ['common', 'rare'] as const) {
      expect(itemTitle(item('mantle', [{ kind: 'overLimitCost', value: 0.2 }], rarity)), rarity).toBe('Мантия бережливости');
    }
  });

  it('у легендарного предмета с уникальным правилом — своё имя', () => {
    expect(itemTitle(item('staff', [{ kind: 'summonChance', value: 1.5, element: 'fire' }], 'legendary', 'phoenix'))).toBe('Посох феникса');
  });

  it('предмет без бонусов называется по слоту', () => {
    expect(itemTitle(item('staff', []))).toBe('Посох');
  });

  it('название берётся по характерному для слота бонусу, даже если он не первый', () => {
    const mixed = item('staff', [
      { kind: 'meteorCooldown', value: 0.2 },
      { kind: 'summonChance', value: 1.5, element: 'earth' },
    ]);

    expect(itemTitle(mixed)).toBe('Каменный посох');
  });

  it('старое снаряжение получает прежние по смыслу названия', () => {
    const title = (slot: GearSlot, id: string, level = 1): string => itemTitle(legacyItem(gear, slot, id, level, 'i1') as Item);

    expect(title('staff', 'none')).toBe('Посох');
    expect(title('staff', 'fire')).toBe('Огненный посох');
    expect(title('mantle', 'thrift')).toBe('Мантия бережливости');
    expect(title('mantle', 'sorc')).toBe('Мантия чародея');
    expect(title('amulet', 'alch')).toBe('Амулет алхимика');
    expect(title('amulet', 'alch', 3)).toBe('Эпический амулет алхимика');
  });

  it.each(['ru', 'en'] as const)('у любого предмета генератора название собрано целиком (%s)', (lang) => {
    setLang(lang);
    const rng = seededRandom(77);
    for (let i = 0; i < 400; i++) {
      const title = itemTitle(rollItem(gear.items, cats, rng, `i${i}`));
      expect(title, title).not.toMatch(/[{}]|\s{2,}|^\s|\s$/);
      expect(title[0], title).toBe(title[0].toLocaleUpperCase());
      // Название не сводится к одному слову слота: в нём есть слово бонуса.
      expect(title.split(' ').length, title).toBeGreaterThan(1);
    }
  });

  it('посох из генератора всегда назван по стихии', () => {
    const rng = seededRandom(5);
    const adjectives = /огненный|водный|каменный|ветряной/i;
    for (let i = 0; i < 200; i++) {
      const staff = rollItem(gear.items, cats, rng, `i${i}`, { slot: 'staff', rarity: i % 2 ? 'common' : 'epic' });
      expect(itemTitle(staff), itemTitle(staff)).toMatch(adjectives);
    }
  });
});

describe('itemTitle: короткое название', () => {
  it('без приставки редкости, остальное то же', () => {
    const mantle = item('mantle', [{ kind: 'overLimitCost', value: 0.2 }], 'epic');

    expect(itemTitle(mantle, true)).toBe('Мантия бережливости');
    expect(itemTitle(item('staff', [], 'epic'), true)).toBe('Посох');
    expect(itemTitle(item('staff', [{ kind: 'summonChance', value: 1.5, element: 'fire' }], 'legendary', 'phoenix'), true)).toBe('Посох феникса');
  });
});
