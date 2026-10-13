import { describe, expect, it } from 'vitest';
import { Meteor } from './Meteor';

// Числа зафиксированы здесь, чтобы тесты не зависели от правок баланса в JSON.
const config = { cooldown: 20, damage: 40, damageGrowthPerWave: 2, radius: 60, burnDps: 0.1, burnTime: 2 };

describe('Meteor: перезарядка', () => {
  it('на старте умение готово', () => {
    const meteor = new Meteor(config);

    expect(meteor.ready).toBe(true);
    expect(meteor.remaining).toBe(0);
    expect(meteor.progress).toBe(1);
  });

  it('удар запускает полную перезарядку', () => {
    const meteor = new Meteor(config);

    expect(meteor.cast(1, 1)).not.toBeNull();
    expect(meteor.ready).toBe(false);
    expect(meteor.remaining).toBe(20);
    expect(meteor.progress).toBe(0);
  });

  it('пока идёт перезарядка, ударить нельзя', () => {
    const meteor = new Meteor(config);
    meteor.cast(1, 1);
    meteor.update(5);

    expect(meteor.cast(1, 1)).toBeNull();
    expect(meteor.remaining).toBe(15);
  });

  it('перезарядка идёт со временем и не уходит ниже нуля', () => {
    const meteor = new Meteor(config);
    meteor.cast(1, 1);

    meteor.update(5);
    expect(meteor.remaining).toBe(15);
    expect(meteor.progress).toBe(0.25);

    meteor.update(100);
    expect(meteor.remaining).toBe(0);
    expect(meteor.ready).toBe(true);
    expect(meteor.cast(1, 1)).not.toBeNull();
  });

  it('снаряжение сокращает перезарядку', () => {
    const meteor = new Meteor(config, 0.8);
    meteor.cast(1, 1);

    expect(meteor.cooldown).toBe(16);
    expect(meteor.remaining).toBe(16);
  });

  it('с сокращённой перезарядкой умение готово раньше', () => {
    const meteor = new Meteor(config, 0.8);
    meteor.cast(1, 1);
    meteor.update(8);
    expect(meteor.progress).toBeCloseTo(0.5);

    meteor.update(8);
    expect(meteor.ready).toBe(true);
  });
});

describe('Meteor: прицеливание', () => {
  it('включается и отменяется повторным нажатием', () => {
    const meteor = new Meteor(config);

    expect(meteor.toggleAim()).toBe(true);
    expect(meteor.aiming).toBe(true);
    expect(meteor.toggleAim()).toBe(false);
    expect(meteor.aiming).toBe(false);
  });

  it('не включается, пока идёт перезарядка', () => {
    const meteor = new Meteor(config);
    meteor.cast(1, 1);

    expect(meteor.toggleAim()).toBe(false);
    expect(meteor.aiming).toBe(false);
  });

  it('удар снимает прицел', () => {
    const meteor = new Meteor(config);
    meteor.toggleAim();
    meteor.cast(1, 1);

    expect(meteor.aiming).toBe(false);
  });

  it('cancelAim снимает прицел и не трогает перезарядку', () => {
    const meteor = new Meteor(config);
    meteor.toggleAim();
    meteor.cancelAim();

    expect(meteor.aiming).toBe(false);
    expect(meteor.ready).toBe(true);
  });
});

describe('Meteor: второй шанс', () => {
  it('recharge делает умение готовым посреди перезарядки', () => {
    const meteor = new Meteor(config);
    meteor.cast(1, 1);
    expect(meteor.ready).toBe(false);

    meteor.recharge();
    expect(meteor.ready).toBe(true);
    expect(meteor.progress).toBe(1);
  });
});

describe('Meteor: сила удара', () => {
  it('на первой волне — базовый урон, радиус и поджог из конфига', () => {
    expect(new Meteor(config).cast(1, 1)).toEqual({ radius: 60, damage: 40, burnDps: 4, burnTime: 2 });
  });

  it('до первой волны урон тоже базовый', () => {
    expect(new Meteor(config).cast(0, 1)?.damage).toBe(40);
  });

  it('урон растёт с каждой волной, поджог — вместе с ним', () => {
    const blast = new Meteor(config).cast(3, 1);

    // 40 × 2²
    expect(blast?.damage).toBe(160);
    expect(blast?.burnDps).toBe(16);
  });

  it('урон умножается на живучесть врагов уровня', () => {
    expect(new Meteor(config).cast(2, 1.5)?.damage).toBe(120);
  });
});
