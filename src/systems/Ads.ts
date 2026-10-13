import type { AdsConfig } from '../data/types';

/** Наградной ролик «+монеты» в бою: после награды кнопка отдыхает. */
export class CoinAd {
  /** Секунды до следующего показа; 0 — кнопка готова. */
  remaining = 0;

  constructor(private readonly config: AdsConfig['coins']) {}

  get ready(): boolean {
    return this.remaining <= 0;
  }

  update(dt: number): void {
    this.remaining = Math.max(0, this.remaining - dt);
  }

  /** Игрок досмотрел ролик: возвращает монеты и запускает отдых. Пока кнопка отдыхает — 0. */
  claim(): number {
    if (!this.ready) return 0;
    this.remaining = this.config.cooldown;
    return this.config.gold;
  }
}

/** «Второй шанс»: один раз за уровень возвращает жизни после поражения. */
export class SecondChance {
  private used = false;

  constructor(private readonly config: AdsConfig['secondChance']) {}

  get available(): boolean {
    return !this.used;
  }

  /** Сколько жизней вернётся. */
  get lives(): number {
    return this.config.lives;
  }

  /** Тратит шанс и возвращает число жизней; второй раз — 0. */
  use(): number {
    if (this.used) return 0;
    this.used = true;
    return this.config.lives;
  }
}

/**
 * Когда между уровнями можно показать полноэкранную рекламу: не чаще, чем раз в `minInterval` секунд.
 * Отсчёт идёт от запуска игры и от любой показанной рекламы, в том числе наградной.
 */
export class InterstitialSchedule {
  private last: number;

  /** `now` — текущее время в секундах; отсчёт от него же при следующих вызовах. */
  constructor(
    private readonly config: AdsConfig['interstitial'],
    now: number,
  ) {
    this.last = now;
  }

  due(now: number): boolean {
    return now - this.last >= this.config.minInterval;
  }

  /** Реклама показана (или игрок только что посмотрел ролик): отсчёт начинается заново. */
  shown(now: number): void {
    this.last = now;
  }
}
