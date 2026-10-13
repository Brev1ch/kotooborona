import { describe, expect, it } from 'vitest';
import type { EconomyConfig } from '../data';
import type { Building, Piece } from '../entities/Building';
import { Buildings } from './Buildings';

// Числа зафиксированы здесь, чтобы тесты не зависели от правок баланса в JSON.
const config: EconomyConfig['buildings'] = {
  maxPerKind: 2,
  kinds: {
    shop: [{ cost: 40, gold: 8 }, { cost: 30, gold: 14 }, { cost: 40, gold: 22 }],
    mine: [{ cost: 60, crystals: 1, everyWaves: 2 }, { cost: 50, crystals: 1 }, { cost: 70, crystals: 2 }],
    altar: [{ cost: 50, summonLimit: 1 }, { cost: 60, summonLimit: 2 }],
  },
};
const all = new Buildings(config, ['shop', 'mine', 'altar']);
const cat: Piece = { element: 'fire', level: 1, cooldown: 0, ritual: 0, invested: 10 };

function building(kind: Building['kind'], level = 1, waves = 0): Building {
  return { kind, level, invested: 0, waves };
}

describe('Buildings: постройка', () => {
  it('новое строение — первого уровня, вложена цена постройки', () => {
    expect(all.create('mine')).toEqual({ kind: 'mine', level: 1, invested: 60, waves: 0 });
    expect(all.cost('altar')).toBe(50);
  });

  it('без списка строений на уровне строить нечего', () => {
    const none = new Buildings(config);

    expect(none.available).toEqual([]);
    expect(none.blocked([null], 'shop')).toBe('unavailable');
  });

  it('закрытый на уровне вид недоступен, открытый — можно', () => {
    const onlyShop = new Buildings(config, ['shop']);

    expect(onlyShop.blocked([null], 'altar')).toBe('unavailable');
    expect(onlyShop.blocked([null], 'shop')).toBeNull();
  });

  it('предел считается по каждому виду отдельно', () => {
    const board = [building('shop'), building('shop'), building('mine'), null];

    expect(all.count(board, 'shop')).toBe(2);
    expect(all.blocked(board, 'shop')).toBe('limit');
    expect(all.blocked(board, 'mine')).toBeNull();
    expect(all.blocked(board, 'altar')).toBeNull();
  });

  it('на занятом поле места нет; коты тоже занимают клетки', () => {
    expect(all.blocked([cat, building('shop')], 'mine')).toBe('noRoom');
  });
});

describe('Buildings: улучшение', () => {
  it('улучшение поднимает уровень и добавляет свою цену к вложенному', () => {
    const shop = all.create('shop');

    expect(all.upgradeCost(shop)).toBe(30);
    expect(all.upgraded(shop)).toEqual({ kind: 'shop', level: 2, invested: 70, waves: 0 });
  });

  it('исходное строение не меняется, счёт волн переходит в улучшенное', () => {
    const mine = { ...all.create('mine'), waves: 1 };
    const next = all.upgraded(mine);

    expect(mine.level).toBe(1);
    expect(next?.waves).toBe(1);
  });

  it('на последнем уровне улучшать некуда', () => {
    const altar = building('altar', 2);

    expect(all.upgradeCost(altar)).toBeNull();
    expect(all.upgraded(altar)).toBeNull();
  });
});

describe('Buildings: доход', () => {
  it('лавка платит каждую волну, улучшенная — больше', () => {
    const board = [building('shop'), cat, building('shop', 3)];

    expect(all.startWave(board)).toEqual({
      gold: 30,
      crystals: 0,
      slots: [
        { slot: 0, gold: 8, crystals: 0 },
        { slot: 2, gold: 22, crystals: 0 },
      ],
    });
  });

  it('шахта первого уровня даёт кристалл раз в две волны', () => {
    const board = [building('mine')];

    const crystals = [1, 2, 3, 4].map(() => all.startWave(board).crystals);

    expect(crystals).toEqual([0, 1, 0, 1]);
  });

  it('улучшенная шахта платит каждую волну и не теряет накопленную волну', () => {
    const waited = building('mine', 1, 1);
    const board = [all.upgraded(waited)];

    expect(all.startWave(board).crystals).toBe(1);
    expect(all.startWave(board).crystals).toBe(1);
  });

  it('алтарь и коты дохода не дают', () => {
    expect(all.startWave([building('altar'), cat, null])).toEqual({ gold: 0, crystals: 0, slots: [] });
  });
});

describe('Buildings: лимит призывов', () => {
  it('алтари складываются, улучшенный даёт больше', () => {
    expect(all.summonLimitBonus([building('altar'), building('altar', 2), building('shop'), cat, null])).toBe(3);
  });

  it('без алтарей прибавки нет', () => {
    expect(all.summonLimitBonus([building('shop'), cat])).toBe(0);
  });
});
