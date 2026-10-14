import { DevPlatform } from './DevPlatform';
import { browserStore } from './LocalStore';
import type { Lang, Platform } from './Platform';
import { YandexPlatform } from './YandexPlatform';
import { loadYandexSdk } from './yandexSdk';

/**
 * Площадка выбирается при запуске: SDK Яндекс Игр доступен — работаем через него, иначе — заглушка разработки.
 * До `init` все вызовы идут в заглушку.
 */
class AutoPlatform implements Platform {
  private impl: Platform = new DevPlatform();

  async init(): Promise<void> {
    const sdk = await loadYandexSdk();
    if (sdk) this.impl = new YandexPlatform(sdk, browserStore);
    await this.impl.init();
  }

  getLang(): Lang {
    return this.impl.getLang();
  }

  gameReady(): void {
    this.impl.gameReady();
  }

  gameplayStart(): void {
    this.impl.gameplayStart();
  }

  gameplayStop(): void {
    this.impl.gameplayStop();
  }

  showInterstitial(): Promise<void> {
    return this.impl.showInterstitial();
  }

  showRewarded(): Promise<boolean> {
    return this.impl.showRewarded();
  }

  onPause(pause: () => void, resume: () => void): void {
    this.impl.onPause(pause, resume);
  }

  load<T>(key: string, fallback: T): Promise<T> {
    return this.impl.load(key, fallback);
  }

  save<T>(key: string, value: T): Promise<void> {
    return this.impl.save(key, value);
  }
}

export const platform: Platform = new AutoPlatform();

export type { Lang, Platform } from './Platform';
export { LANGS } from './Platform';
