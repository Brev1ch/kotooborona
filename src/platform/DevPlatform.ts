import type { Lang, Platform } from './Platform';

const STORAGE_PREFIX = 'koto_';

/** Заглушка для локальной разработки: сохранения в localStorage, реклама сразу отдаёт награду. */
export class DevPlatform implements Platform {
  async init(): Promise<void> {}

  getLang(): Lang {
    return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'ru';
  }

  gameReady(): void {}

  async showInterstitial(): Promise<void> {}

  async showRewarded(): Promise<boolean> {
    return true;
  }

  async load<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  async save<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch {
      // Хранилище может быть недоступно (приватный режим) — игра продолжает без сохранений.
    }
  }
}
