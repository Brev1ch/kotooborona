import { describe, expect, it } from 'vitest';
import { CoinAd, InterstitialSchedule, SecondChance } from './Ads';

describe('CoinAd', () => {
  const config = { gold: 60, cooldown: 30 };

  it('в начале боя готова и отдаёт монеты из конфига', () => {
    const ad = new CoinAd(config);
    expect(ad.ready).toBe(true);
    expect(ad.claim()).toBe(60);
  });

  it('после награды отдыхает ровно cooldown секунд', () => {
    const ad = new CoinAd(config);
    ad.claim();
    expect(ad.ready).toBe(false);
    expect(ad.remaining).toBe(30);

    ad.update(29.9);
    expect(ad.ready).toBe(false);
    expect(ad.claim()).toBe(0);

    ad.update(0.2);
    expect(ad.ready).toBe(true);
    expect(ad.remaining).toBe(0);
    expect(ad.claim()).toBe(60);
  });

  it('неудачная попытка отдых не продлевает', () => {
    const ad = new CoinAd(config);
    ad.claim();
    ad.update(10);
    ad.claim();
    expect(ad.remaining).toBe(20);
  });
});

describe('SecondChance', () => {
  it('срабатывает один раз за уровень', () => {
    const chance = new SecondChance({ lives: 10 });
    expect(chance.available).toBe(true);
    expect(chance.lives).toBe(10);
    expect(chance.use()).toBe(10);
    expect(chance.available).toBe(false);
    expect(chance.use()).toBe(0);
  });
});

describe('InterstitialSchedule', () => {
  const config = { minInterval: 150 };

  it('первый показ — не раньше, чем через промежуток после запуска игры', () => {
    const schedule = new InterstitialSchedule(config, 1000);
    expect(schedule.due(1000)).toBe(false);
    expect(schedule.due(1149)).toBe(false);
    expect(schedule.due(1150)).toBe(true);
  });

  it('после показа отсчёт начинается заново', () => {
    const schedule = new InterstitialSchedule(config, 0);
    expect(schedule.due(200)).toBe(true);
    schedule.shown(200);
    expect(schedule.due(300)).toBe(false);
    expect(schedule.due(350)).toBe(true);
  });

  it('просмотренный ролик с наградой тоже отодвигает показ', () => {
    const schedule = new InterstitialSchedule(config, 0);
    schedule.shown(140);
    expect(schedule.due(160)).toBe(false);
    expect(schedule.due(290)).toBe(true);
  });
});
