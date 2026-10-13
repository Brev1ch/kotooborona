import { describe, expect, it } from 'vitest';
import { cats, gear } from '../data';
import type { BonusKind, GearSlot, ItemsConfig, Rarity } from '../data/types';
import { GEAR_SLOTS } from './Gear';
import {
  bonusKinds,
  bonusValue,
  itemName,
  itemsBonuses,
  legacyItem,
  mainBonus,
  mainKinds,
  RARITIES,
  rollItem,
  rollRarity,
  salvageShards,
  shownBonus,
  upgradePrice,
  type Item,
} from './Items';
import { gearBonuses, noBonuses } from './Loadout';
import { seededRandom } from './Random';

// Числа зафиксированы здесь, чтобы тесты не зависели от правок баланса в JSON.
const config: ItemsConfig = {
  inventoryLimit: 30,
  rarities: {
    common: { bonuses: 1, roll: [0, 0.5], chance: 0.6, shards: 2 },
    rare: { bonuses: 2, roll: [0.2, 0.7], chance: 0.25, shards: 5 },
    epic: { bonuses: 3, roll: [0.5, 1], chance: 0.1, shards: 12 },
    legendary: { bonuses: 3, roll: [0.6, 1], chance: 0.05, shards: 30 },
  },
  pool: {
    summonChance: { slots: ['staff'], main: ['staff'], min: 1.5, max: 2, step: 0.1, scales: true, element: true },
    summonLimit: { slots: ['mantle'], main: ['mantle'], min: 1, max: 1, step: 1, scales: false, rarities: ['epic', 'legendary'] },
    overLimitCost: { slots: ['mantle', 'amulet'], main: ['mantle'], min: 0.1, max: 0.3, step: 0.05, scales: true, cap: 0.35 },
    elementDamage: { slots: ['staff', 'amulet'], min: 0.1, max: 0.2, step: 0.01, scales: true, element: true },
    meteorCooldown: { slots: ['staff', 'mantle'], main: ['mantle'], min: 0.1, max: 0.3, step: 0.01, scales: true, cap: 0.5 },
    ritualTime: { slots: ['mantle', 'amulet'], main: ['amulet'], min: 0.2, max: 0.5, step: 0.1, scales: true, cap: 0.75 },
    gold: { slots: ['mantle', 'amulet'], main: ['amulet'], min: 10, max: 40, step: 5, scales: true },
    crystals: { slots: ['amulet'], main: ['amulet'], min: 1, max: 2, step: 1, scales: false },
    buildingIncome: { slots: ['mantle', 'amulet'], min: 0.1, max: 0.3, step: 0.01, scales: true },
    level2Chance: { slots: ['staff', 'mantle'], min: 0.04, max: 0.12, step: 0.01, scales: true, cap: 0.3 },
  },
  upgrade: { maxLevel: 4, power: 0.5, shards: [2, 4], fish: [40, 90] },
  legendaries: [
    { id: 'phoenix', slot: 'staff', unique: 'burningGround', burnDps: 0.15, time: 4 },
    { id: 'thousandCats', slot: 'mantle', unique: 'freeSummon', every: 5 },
  ],
};

function item(overrides: Partial<Item> = {}): Item {
  return { id: 'i1', slot: 'amulet', rarity: 'common', bonuses: [], level: 1, ...overrides };
}

/** Много предметов подряд из одного генератора. */
function many(count: number, seed: number, fixed: { rarity?: Rarity; slot?: GearSlot } = {}): Item[] {
  const rng = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => rollItem(config, cats, rng, `i${i}`, fixed));
}

describe('rollItem: воспроизводимость', () => {
  it('одно зерно даёт один и тот же предмет', () => {
    for (const seed of [1, 2, 77, 12345]) {
      expect(rollItem(config, cats, seededRandom(seed), 'a')).toEqual(rollItem(config, cats, seededRandom(seed), 'a'));
    }
  });

  it('одна последовательность предметов повторяется целиком', () => {
    expect(many(50, 9)).toEqual(many(50, 9));
  });

  it('разные зёрна дают разные предметы', () => {
    const variants = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => JSON.stringify(rollItem(config, cats, seededRandom(seed), 'a'))));
    expect(variants.size).toBeGreaterThan(4);
  });

  it('id и первый уровень задаются снаружи, а не случаем', () => {
    expect(rollItem(config, cats, seededRandom(3), 'item-7')).toMatchObject({ id: 'item-7', level: 1 });
  });
});

describe('rollItem: редкость и бонусы', () => {
  it.each(RARITIES)('у предмета редкости %s столько бонусов, сколько положено, и все разные', (rarity) => {
    for (const rolled of many(200, 5, { rarity })) {
      expect(rolled.rarity).toBe(rarity);
      expect(rolled.bonuses).toHaveLength(config.rarities[rarity].bonuses);
      expect(new Set(rolled.bonuses.map((bonus) => bonus.kind)).size).toBe(rolled.bonuses.length);
    }
  });

  it('бонус выпадает только в своём слоте и только у своей редкости', () => {
    for (const rolled of many(600, 11)) {
      const allowed = bonusKinds(config, rolled.slot, rolled.rarity);
      for (const bonus of rolled.bonuses) expect(allowed, `${rolled.slot} ${rolled.rarity}`).toContain(bonus.kind);
    }
    expect(bonusKinds(config, 'mantle', 'rare')).not.toContain('summonLimit');
    expect(bonusKinds(config, 'mantle', 'epic')).toContain('summonLimit');
    expect(bonusKinds(config, 'staff', 'common')).toEqual(['summonChance', 'elementDamage', 'meteorCooldown', 'level2Chance']);
  });

  it('значение лежит в части диапазона своей редкости и кратно шагу', () => {
    for (const rolled of many(600, 21)) {
      const [from, to] = config.rarities[rolled.rarity].roll;
      for (const { kind, value } of rolled.bonuses) {
        const { min, max, step } = config.pool[kind];
        const span = max - min;
        expect(value, `${kind} ${rolled.rarity}`).toBeGreaterThanOrEqual(min + span * from - step / 2 - 1e-9);
        expect(value, `${kind} ${rolled.rarity}`).toBeLessThanOrEqual(Math.min(max, min + span * to + step / 2) + 1e-9);
        expect(Math.abs((value - min) / step - Math.round((value - min) / step))).toBeLessThan(1e-6);
      }
    }
  });

  it('эпический предмет сильнее обычного: его значения из верхней половины диапазона', () => {
    const average = (rarity: Rarity): number => {
      const values = many(300, 31, { rarity, slot: 'amulet' }).flatMap((rolled) =>
        rolled.bonuses.filter((bonus) => bonus.kind === 'gold').map((bonus) => bonus.value),
      );
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };

    expect(average('epic')).toBeGreaterThan(average('common') + 10);
  });

  it('у бонуса стихии есть базовая стихия, у остальных её нет', () => {
    for (const rolled of many(400, 41)) {
      for (const bonus of rolled.bonuses) {
        if (config.pool[bonus.kind].element) expect(['fire', 'water', 'earth', 'air']).toContain(bonus.element);
        else expect(bonus.element).toBeUndefined();
      }
    }
  });

  it('заданный слот соблюдается', () => {
    for (const slot of GEAR_SLOTS) {
      expect(many(60, 51, { slot, rarity: 'rare' }).every((rolled) => rolled.slot === slot)).toBe(true);
    }
  });
});

describe('rollItem: главный бонус', () => {
  it('первый бонус предмета — характерный для его слота', () => {
    for (const piece of many(600, 21)) {
      const kind = piece.bonuses[0].kind;
      expect(config.pool[kind].main, `${piece.slot}: ${kind}`).toContain(piece.slot);
    }
  });

  it('у посоха первым всегда стоит шанс стихии', () => {
    for (const rarity of RARITIES) {
      for (const staff of many(100, 22, { slot: 'staff', rarity })) expect(staff.bonuses[0].kind).toBe('summonChance');
    }
  });

  it('у мантии и амулета главные бонусы разные и выпадают все', () => {
    const firsts = (slot: GearSlot): string[] => [...new Set(many(400, 23, { slot, rarity: 'epic' }).map((piece) => piece.bonuses[0].kind))].sort();

    expect(firsts('mantle')).toEqual(['meteorCooldown', 'overLimitCost', 'summonLimit']);
    expect(firsts('amulet')).toEqual(['crystals', 'gold', 'ritualTime']);
  });

  it('главный бонус не повторяется среди остальных', () => {
    for (const piece of many(300, 24, { rarity: 'epic' })) {
      const kinds = piece.bonuses.map((bonus) => bonus.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
  });

  it('остальные бонусы — любые из пула слота, не только характерные', () => {
    const rest = new Set(many(600, 25, { rarity: 'epic' }).flatMap((piece) => piece.bonuses.slice(1).map((bonus) => bonus.kind)));

    for (const kind of ['elementDamage', 'buildingIncome', 'level2Chance']) expect(rest.has(kind as BonusKind), kind).toBe(true);
  });

  it('главный бонус редкости, которой он не положен, первым не выпадает', () => {
    for (const mantle of many(300, 26, { slot: 'mantle', rarity: 'common' })) expect(mantle.bonuses[0].kind).not.toBe('summonLimit');
    expect(mainKinds(config, 'mantle', 'common')).not.toContain('summonLimit');
    expect(mainKinds(config, 'mantle', 'epic')).toContain('summonLimit');
  });

  it('если характерных бонусов у слота нет, первый берётся из всего пула слота', () => {
    const plain: ItemsConfig = { ...config, pool: Object.fromEntries(Object.entries(config.pool).map(([kind, rule]) => [kind, { ...rule, main: undefined }])) as ItemsConfig['pool'] };

    const staff = rollItem(plain, cats, seededRandom(3), 'i1', { slot: 'staff', rarity: 'epic' });

    expect(staff.bonuses).toHaveLength(3);
  });

  it('в данных игры у каждого слота есть характерный бонус для любой редкости, и он из пула этого слота', () => {
    for (const slot of GEAR_SLOTS) {
      for (const rarity of RARITIES) expect(mainKinds(gear.items, slot, rarity).length, `${slot} ${rarity}`).toBeGreaterThan(0);
    }
    for (const [kind, rule] of Object.entries(gear.items.pool)) {
      for (const slot of rule.main ?? []) expect(rule.slots, kind).toContain(slot);
    }
    expect(mainKinds(gear.items, 'staff', 'common')).toEqual(['summonChance']);
  });
});

describe('mainBonus и itemName', () => {
  const chance = { kind: 'summonChance', value: 1.5, element: 'fire' } as const;
  const meteor = { kind: 'meteorCooldown', value: 0.2 } as const;

  it('главный бонус — характерный для слота, даже если стоит не первым', () => {
    expect(mainBonus(config, item({ slot: 'staff', bonuses: [meteor, chance] }))).toEqual(chance);
  });

  it('без характерных бонусов главный — первый; без бонусов его нет', () => {
    expect(mainBonus(config, item({ slot: 'staff', bonuses: [meteor] }))).toEqual(meteor);
    expect(mainBonus(config, item())).toBeNull();
  });

  it('название — слот, вид и стихия главного бонуса', () => {
    expect(itemName(config, item({ slot: 'staff', bonuses: [chance] }))).toEqual({ slot: 'staff', kind: 'summonChance', element: 'fire', prefix: null });
    expect(itemName(config, item({ slot: 'mantle', bonuses: [meteor] }))).toEqual({ slot: 'mantle', kind: 'meteorCooldown', prefix: null });
  });

  it('приставка редкости — только у эпических и легендарных', () => {
    const prefix = (rarity: Rarity): Rarity | null => itemName(config, item({ rarity, bonuses: [meteor] })).prefix;

    expect(RARITIES.map(prefix)).toEqual([null, null, 'epic', 'legendary']);
  });

  it('у легендарного предмета из списка — своё имя, без приставки', () => {
    expect(itemName(config, item({ slot: 'staff', rarity: 'legendary', legendary: 'phoenix', bonuses: [chance] }))).toEqual({ legendary: 'phoenix', slot: 'staff', kind: null, prefix: null });
  });

  it('незнакомое легендарное имя не мешает назвать предмет по бонусу', () => {
    expect(itemName(config, item({ slot: 'staff', rarity: 'legendary', legendary: 'dragon', bonuses: [chance] }))).toEqual({ slot: 'staff', kind: 'summonChance', element: 'fire', prefix: 'legendary' });
  });

  it('предмет без бонусов называется по слоту', () => {
    expect(itemName(config, item())).toEqual({ slot: 'amulet', kind: null, prefix: null });
  });
});

describe('rollItem: легендарные', () => {
  it('легендарный предмет — один из списка, в его слоте, с тремя обычными бонусами', () => {
    for (const rolled of many(100, 61, { rarity: 'legendary' })) {
      const rule = config.legendaries.find((entry) => entry.id === rolled.legendary);
      expect(rule, rolled.legendary).toBeDefined();
      expect(rolled.slot).toBe(rule?.slot);
      expect(rolled.bonuses).toHaveLength(3);
    }
  });

  it('выпадают оба легендарных предмета', () => {
    expect(new Set(many(100, 61, { rarity: 'legendary' }).map((rolled) => rolled.legendary))).toEqual(new Set(['phoenix', 'thousandCats']));
  });

  it('у предметов других редкостей уникального правила нет', () => {
    for (const rarity of ['common', 'rare', 'epic'] as const) {
      expect(many(100, 71, { rarity }).every((rolled) => rolled.legendary === undefined)).toBe(true);
    }
  });

  it('для слота без легендарных предметов выпадает легендарный без уникального правила', () => {
    const rolled = rollItem(config, cats, seededRandom(1), 'a', { rarity: 'legendary', slot: 'amulet' });

    expect(rolled).toMatchObject({ slot: 'amulet', rarity: 'legendary' });
    expect(rolled.legendary).toBeUndefined();
  });
});

describe('rollRarity', () => {
  it('граница шансов: бросок попадает в свою редкость', () => {
    const at = (roll: number): Rarity => rollRarity(config, () => roll);

    expect(at(0)).toBe('common');
    expect(at(0.59)).toBe('common');
    expect(at(0.6)).toBe('rare');
    expect(at(0.84)).toBe('rare');
    expect(at(0.86)).toBe('epic');
    expect(at(0.96)).toBe('legendary');
    expect(at(0.999)).toBe('legendary');
  });

  it('на большой выборке доли редкостей близки к шансам', () => {
    const rng = seededRandom(5);
    const counts: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const total = 20000;
    for (let i = 0; i < total; i++) counts[rollRarity(config, rng)]++;

    for (const rarity of RARITIES) expect(counts[rarity] / total).toBeCloseTo(config.rarities[rarity].chance, 1.5);
  });

  it('в данных игры шансы редкостей в сумме дают единицу и убывают от обычной к легендарной', () => {
    const chances = RARITIES.map((rarity) => gear.items.rarities[rarity].chance);

    expect(chances.reduce((sum, chance) => sum + chance, 0)).toBeCloseTo(1);
    expect([...chances].sort((a, b) => b - a)).toEqual(chances);
  });
});

describe('данные игры', () => {
  it('в каждом слоте хватает видов бонусов на предмет любой редкости', () => {
    for (const slot of GEAR_SLOTS) {
      for (const rarity of RARITIES) {
        expect(bonusKinds(gear.items, slot, rarity).length, `${slot} ${rarity}`).toBeGreaterThanOrEqual(gear.items.rarities[rarity].bonuses);
      }
    }
  });

  it('число бонусов растёт с редкостью, легендарных предметов два или три', () => {
    expect(RARITIES.map((rarity) => gear.items.rarities[rarity].bonuses)).toEqual([1, 2, 3, 3]);
    expect(gear.items.legendaries.length).toBeGreaterThanOrEqual(2);
    expect(gear.items.legendaries.length).toBeLessThanOrEqual(3);
  });

  it('предметы из данных игры генерируются воспроизводимо и по правилам', () => {
    const roll = (): Item[] => {
      const rng = seededRandom(2024);
      return Array.from({ length: 300 }, (_, i) => rollItem(gear.items, cats, rng, `i${i}`));
    };
    const items = roll();

    expect(items).toEqual(roll());
    for (const rolled of items) {
      expect(rolled.bonuses).toHaveLength(gear.items.rarities[rolled.rarity].bonuses);
      for (const { kind, value } of rolled.bonuses) {
        expect(value, kind).toBeGreaterThanOrEqual(gear.items.pool[kind].min);
        expect(value, kind).toBeLessThanOrEqual(gear.items.pool[kind].max);
      }
    }
  });
});

describe('bonusValue: прокачка', () => {
  it('растущий бонус прибавляет долю за уровень', () => {
    expect(bonusValue(config, { kind: 'gold', value: 20 }, 1)).toBe(20);
    expect(bonusValue(config, { kind: 'gold', value: 20 }, 2)).toBe(30);
    expect(bonusValue(config, { kind: 'buildingIncome', value: 0.2 }, 3)).toBe(0.4);
  });

  it('у веса стихии растёт прибавка над единицей', () => {
    expect(bonusValue(config, { kind: 'summonChance', value: 1.6, element: 'fire' }, 1)).toBe(1.6);
    expect(bonusValue(config, { kind: 'summonChance', value: 1.6, element: 'fire' }, 3)).toBe(2.2);
  });

  it('потолок бонуса прокачкой не пробивается', () => {
    expect(bonusValue(config, { kind: 'overLimitCost', value: 0.3 }, 2)).toBe(0.35);
    expect(bonusValue(config, { kind: 'overLimitCost', value: 0.3 }, 4)).toBe(0.35);
  });

  it('штучные бонусы с уровнем не растут', () => {
    expect(bonusValue(config, { kind: 'crystals', value: 1 }, 4)).toBe(1);
    expect(bonusValue(config, { kind: 'summonLimit', value: 1 }, 4)).toBe(1);
  });

  it('уровень вне диапазона прижимается к допустимому', () => {
    expect(bonusValue(config, { kind: 'gold', value: 20 }, 0)).toBe(20);
    expect(bonusValue(config, { kind: 'gold', value: 20 }, 99)).toBe(50);
  });
});

describe('itemsBonuses', () => {
  it('без предметов и с предметами без бонусов бой не меняется', () => {
    expect(itemsBonuses(config, [])).toEqual(noBonuses());
    expect(itemsBonuses(config, [item(), item({ slot: 'staff' })])).toEqual(noBonuses());
  });

  it('каждый вид бонуса попадает в своё поле', () => {
    const one = (kind: BonusKind, value: number, element?: 'fire'): ReturnType<typeof itemsBonuses> =>
      itemsBonuses(config, [item({ bonuses: [element ? { kind, value, element } : { kind, value }] })]);

    expect(one('summonChance', 1.5, 'fire').summonWeights).toEqual({ fire: 1.5 });
    expect(one('summonLimit', 1).summonLimitBonus).toBe(1);
    expect(one('overLimitCost', 0.2).overLimitCostMult).toBeCloseTo(0.8);
    expect(one('elementDamage', 0.15, 'fire').elementDamage).toEqual({ fire: 0.15 });
    expect(one('meteorCooldown', 0.25).meteorCooldownMult).toBeCloseTo(0.75);
    expect(one('ritualTime', 0.3).ritualTimeMult).toBeCloseTo(0.7);
    expect(one('gold', 20).bonusGold).toBe(20);
    expect(one('crystals', 2).bonusCrystals).toBe(2);
    expect(one('buildingIncome', 0.2).buildingIncomeMult).toBeCloseTo(1.2);
    expect(one('level2Chance', 0.1).level2Chance).toBeCloseTo(0.1);
  });

  it('бонусы трёх предметов складываются: множители перемножаются, прибавки суммируются', () => {
    const total = itemsBonuses(config, [
      item({ slot: 'staff', bonuses: [{ kind: 'summonChance', value: 1.5, element: 'fire' }, { kind: 'elementDamage', value: 0.1, element: 'fire' }] }),
      item({ slot: 'mantle', bonuses: [{ kind: 'overLimitCost', value: 0.2 }, { kind: 'gold', value: 10 }] }),
      item({ slot: 'amulet', bonuses: [{ kind: 'overLimitCost', value: 0.1 }, { kind: 'gold', value: 15 }, { kind: 'elementDamage', value: 0.1, element: 'fire' }] }),
    ]);

    expect(total.summonWeights).toEqual({ fire: 1.5 });
    expect(total.elementDamage.fire).toBeCloseTo(0.2);
    expect(total.overLimitCostMult).toBeCloseTo(0.72);
    expect(total.bonusGold).toBe(25);
  });

  it('уровень предмета усиливает его бонусы', () => {
    const total = itemsBonuses(config, [item({ level: 3, bonuses: [{ kind: 'gold', value: 20 }, { kind: 'crystals', value: 1 }] })]);

    expect(total).toMatchObject({ bonusGold: 40, bonusCrystals: 1 });
  });

  it('легендарные правила: горящая зона метеора и бесплатный призыв', () => {
    const total = itemsBonuses(config, [
      item({ slot: 'staff', rarity: 'legendary', legendary: 'phoenix' }),
      item({ slot: 'mantle', rarity: 'legendary', legendary: 'thousandCats' }),
    ]);

    expect(total.meteorGround).toEqual({ burnDps: 0.15, time: 4 });
    expect(total.freeSummonEvery).toBe(5);
  });

  it('незнакомое легендарное правило ничего не даёт', () => {
    expect(itemsBonuses(config, [item({ legendary: 'unknown' })])).toEqual(noBonuses());
  });
});

describe('разбор и цена прокачки', () => {
  it('осколков за разбор тем больше, чем выше редкость', () => {
    expect(RARITIES.map((rarity) => salvageShards(config, item({ rarity })))).toEqual([2, 5, 12, 30]);
  });

  it('цена прокачки растёт с уровнем; после списка цен действует последняя; на потолке цены нет', () => {
    expect(upgradePrice(config, item({ level: 1 }))).toEqual({ shards: 2, fish: 40 });
    expect(upgradePrice(config, item({ level: 2 }))).toEqual({ shards: 4, fish: 90 });
    expect(upgradePrice(config, item({ level: 3 }))).toEqual({ shards: 4, fish: 90 });
    expect(upgradePrice(config, item({ level: 4 }))).toBeNull();
  });

  it('в данных игры цен хватает на все уровни', () => {
    const { maxLevel, shards, fish } = gear.items.upgrade;

    expect(shards).toHaveLength(maxLevel - 1);
    expect(fish).toHaveLength(maxLevel - 1);
  });
});

describe('legacyItem: старое снаряжение в новом виде', () => {
  it('предмет без бонусов остаётся без бонусов', () => {
    expect(legacyItem(gear, 'staff', 'none', 1, 'a')).toEqual({ id: 'a', slot: 'staff', rarity: 'common', bonuses: [], level: 1 });
  });

  it('незнакомого предмета нет', () => {
    expect(legacyItem(gear, 'staff', 'laser', 1, 'a')).toBeNull();
    expect(legacyItem(gear, 'mantle', 'fire', 1, 'a')).toBeNull();
  });

  it('редкость отражает прежнюю прокачку, уровень нового предмета — первый', () => {
    expect([1, 2, 3, 4].map((level) => legacyItem(gear, 'staff', 'fire', level, 'a')?.rarity)).toEqual(['common', 'rare', 'epic', 'epic']);
    expect(legacyItem(gear, 'staff', 'fire', 4, 'a')?.level).toBe(1);
  });

  it('каждый старый предмет на каждом уровне даёт в бою ровно то же, что давал', () => {
    for (const slot of GEAR_SLOTS) {
      for (const old of gear[slot]) {
        const levels = 1 + (old.upgrades?.length ?? 0);
        for (let level = 1; level <= levels; level++) {
          const worn = { ...gear.defaults, [slot]: old.id };
          // Остальные два слота — предметы по умолчанию первого уровня, в новом виде они те же.
          const before = gearBonuses(gear, worn, (wornSlot, id) => (wornSlot === slot && id === old.id ? level : 1));
          const converted = GEAR_SLOTS.map((wornSlot) => legacyItem(gear, wornSlot, worn[wornSlot], wornSlot === slot ? level : 1, wornSlot));
          const after = itemsBonuses(gear.items, converted.filter((entry): entry is Item => entry !== null));

          expect(after.summonWeights, `${slot}:${old.id} ур. ${level}`).toEqual(before.summonWeights);
          for (const field of ['overLimitCostMult', 'meteorCooldownMult', 'ritualTimeMult', 'bonusCrystals', 'bonusGold'] as const) {
            expect(after[field], `${slot}:${old.id} ур. ${level}: ${field}`).toBeCloseTo(before[field], 6);
          }
        }
      }
    }
  });
});

describe('shownBonus', () => {
  it('шанс стихии — шанс призвать её кота в процентах', () => {
    // Вес 2 против трёх остальных базовых стихий с весом 1: 2 из 5.
    expect(shownBonus(config, cats, { kind: 'summonChance', value: 2, element: 'fire' }, 1)).toEqual({ kind: 'summonChance', amount: 40, element: 'fire' });
  });

  it('доли — в целых процентах, штуки — как есть', () => {
    expect(shownBonus(config, cats, { kind: 'overLimitCost', value: 0.15 }, 1)).toEqual({ kind: 'overLimitCost', amount: 15 });
    expect(shownBonus(config, cats, { kind: 'elementDamage', value: 0.12, element: 'air' }, 1)).toEqual({ kind: 'elementDamage', amount: 12, element: 'air' });
    expect(shownBonus(config, cats, { kind: 'gold', value: 25 }, 1)).toEqual({ kind: 'gold', amount: 25 });
    expect(shownBonus(config, cats, { kind: 'crystals', value: 2 }, 1)).toEqual({ kind: 'crystals', amount: 2 });
  });

  it('показывает значение с учётом уровня предмета', () => {
    expect(shownBonus(config, cats, { kind: 'gold', value: 20 }, 3).amount).toBe(40);
  });
});
