import { describe, expect, it } from 'vitest';
import { Meteor } from './Meteor';

// Числа зафиксированы здесь, чтобы тесты не зависели от правок баланса в JSON.
const config = { chargeTime: 20, minChargeMult: 0.5, damage: 40, damageGrowthPerWave: 2, radius: 60, burnDps: 0.1, burnTime: 2 };

/** Метеор с полным зарядом. */
function charged(chargeTime = 20, mult = 1, ground: { burnDps: number; time: number } | null = null): Meteor {
  const meteor = new Meteor(config, chargeTime, mult, ground);
  meteor.recharge();
  return meteor;
}

describe('Meteor: заряд', () => {
  it('в начале уровня заряд пуст и бить нельзя', () => {
    const meteor = new Meteor(config);

    expect(meteor.ready).toBe(false);
    expect(meteor.progress).toBe(0);
    expect(meteor.remaining).toBe(20);
    expect(meteor.cast(1, 1)).toBeNull();
  });

  it('заряд копится со временем боя и не уходит выше полного', () => {
    const meteor = new Meteor(config);

    meteor.update(5);
    expect(meteor.progress).toBe(0.25);
    expect(meteor.remaining).toBe(15);
    expect(meteor.ready).toBe(false);

    meteor.update(100);
    expect(meteor.progress).toBe(1);
    expect(meteor.ready).toBe(true);
  });

  it('пока заряд не полон, бить нельзя: даже на 99 %', () => {
    const meteor = new Meteor(config);
    meteor.update(19.8);

    expect(meteor.cast(1, 1)).toBeNull();
    expect(meteor.progress).toBeCloseTo(0.99);
  });

  it('удар опустошает заряд целиком', () => {
    const meteor = charged();

    expect(meteor.cast(1, 1)).not.toBeNull();
    expect(meteor.progress).toBe(0);
    expect(meteor.ready).toBe(false);
  });

  it('у уровня может быть своё время заряда', () => {
    const meteor = new Meteor(config, 40);
    meteor.update(20);

    expect(meteor.chargeTime).toBe(40);
    expect(meteor.progress).toBe(0.5);
  });

  it('снаряжение ускоряет заряд', () => {
    const meteor = new Meteor(config, 20, 0.8);
    meteor.update(8);

    expect(meteor.chargeTime).toBe(16);
    expect(meteor.progress).toBeCloseTo(0.5);
  });

  it('ускорение от снаряжения не больше предела: метеор не становится частым', () => {
    expect(new Meteor(config, 20, 0.1).chargeTime).toBe(10);
    expect(new Meteor(config, 20, 0.5).chargeTime).toBe(10);
  });
});

describe('Meteor: прицеливание', () => {
  it('включается и отменяется повторным нажатием', () => {
    const meteor = charged();

    expect(meteor.toggleAim()).toBe(true);
    expect(meteor.aiming).toBe(true);
    expect(meteor.toggleAim()).toBe(false);
    expect(meteor.aiming).toBe(false);
  });

  it('не включается, пока заряд не полон', () => {
    const meteor = new Meteor(config);
    meteor.update(10);

    expect(meteor.toggleAim()).toBe(false);
    expect(meteor.aiming).toBe(false);
  });

  it('удар снимает прицел', () => {
    const meteor = charged();
    meteor.toggleAim();
    meteor.cast(1, 1);

    expect(meteor.aiming).toBe(false);
  });

  it('cancelAim снимает прицел и не трогает заряд', () => {
    const meteor = charged();
    meteor.toggleAim();
    meteor.cancelAim();

    expect(meteor.aiming).toBe(false);
    expect(meteor.ready).toBe(true);
  });
});

describe('Meteor: второй шанс', () => {
  it('recharge сразу наполняет заряд', () => {
    const meteor = new Meteor(config);
    meteor.update(3);

    meteor.recharge();
    expect(meteor.ready).toBe(true);
    expect(meteor.progress).toBe(1);
  });
});

describe('Meteor: сила удара', () => {
  it('на первой волне — базовый урон, радиус и поджог из конфига', () => {
    expect(charged().cast(1, 1)).toEqual({ radius: 60, damage: 40, burnDps: 4, burnTime: 2 });
  });

  it('до первой волны урон тоже базовый', () => {
    expect(charged().cast(0, 1)?.damage).toBe(40);
  });

  it('урон растёт с каждой волной, поджог — вместе с ним', () => {
    const blast = charged().cast(3, 1);

    // 40 × 2²
    expect(blast?.damage).toBe(160);
    expect(blast?.burnDps).toBe(16);
  });

  it('урон умножается на живучесть врагов уровня', () => {
    expect(charged().cast(2, 1.5)?.damage).toBe(120);
  });
});

describe('Meteor: горящая зона от снаряжения', () => {
  it('без снаряжения зоны нет', () => {
    expect(charged().cast(1, 1)?.ground).toBeUndefined();
  });

  it('сила зоны — доля урона взрыва, растёт вместе с ним', () => {
    const ground = { burnDps: 0.25, time: 4 };

    expect(charged(20, 1, ground).cast(1, 1)?.ground).toEqual({ burnDps: 10, time: 4 });
    expect(charged(20, 1, ground).cast(3, 1.5)?.ground).toEqual({ burnDps: 60, time: 4 });
  });
});
