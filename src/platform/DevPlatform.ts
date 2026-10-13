import { pickLang } from './lang';
import { browserStore } from './LocalStore';
import type { Lang, Platform } from './Platform';

/**
 * Заглушка для локальной разработки: сохранения в localStorage, реклама сразу отдаёт награду.
 * Язык — из браузера; параметр адреса `?lang=en` или `?lang=ru` задаёт его вручную.
 * Параметр `?reset` стирает сохранение: игра начинается как у нового игрока.
 */
export class DevPlatform implements Platform {
  private pause: () => void = () => {};
  private resume: () => void = () => {};

  async init(): Promise<void> {
    if (new URLSearchParams(location.search).has('reset')) browserStore.clear();
  }

  getLang(): Lang {
    return pickLang(new URLSearchParams(location.search).get('lang') ?? navigator.language);
  }

  gameReady(): void {}

  gameplayStart(): void {}

  gameplayStop(): void {}

  onPause(pause: () => void, resume: () => void): void {
    this.pause = pause;
    this.resume = resume;
  }

  async showInterstitial(): Promise<void> {
    this.pause();
    this.resume();
  }

  async showRewarded(): Promise<boolean> {
    this.pause();
    this.resume();
    return true;
  }

  async load<T>(key: string, fallback: T): Promise<T> {
    return browserStore.load(key, fallback);
  }

  async save<T>(key: string, value: T): Promise<void> {
    browserStore.save(key, value);
  }
}
