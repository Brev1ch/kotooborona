import { pickLang } from './lang';
import type { LocalStore } from './LocalStore';
import type { Lang, Platform } from './Platform';
import type { YandexAdCallbacks, YandexPlayer, YandexSdk } from './yandexSdk';

/** Почему игра стоит: идёт реклама или площадка сама попросила паузу (другая вкладка, окно покупки). */
type PauseReason = 'ad' | 'platform';

export interface YandexTimeouts {
  /** Сколько ждём данные игрока при запуске; дольше — играем с сохранением на устройстве. */
  playerMs: number;
  /** Сколько ждём, что реклама откроется или откажет; дольше — считаем, что показа не будет. */
  adOpenMs: number;
}

const DEFAULT_TIMEOUTS: YandexTimeouts = { playerMs: 6000, adOpenMs: 4000 };

/** Яндекс Игры: реклама, облачные сохранения в данных игрока, язык площадки, разметка игрового процесса. */
export class YandexPlatform implements Platform {
  private player: YandexPlayer | null = null;
  /** Данные игрока в облаке: `setData` заменяет их целиком, поэтому держим копию. */
  private cloud: Record<string, unknown> = {};
  private pause: () => void = () => {};
  private resume: () => void = () => {};
  private readonly reasons = new Set<PauseReason>();
  private playing = false;

  constructor(
    private readonly sdk: YandexSdk,
    /** Копия сохранения на устройстве: выручает, когда облако недоступно. */
    private readonly local: LocalStore,
    private readonly timeouts: YandexTimeouts = DEFAULT_TIMEOUTS,
  ) {}

  async init(): Promise<void> {
    // Стартовую рекламу площадка показывает сама, ещё во время загрузки: слушаем паузу с самого начала.
    this.sdk.on?.('game_api_pause', () => this.hold('platform'));
    this.sdk.on?.('game_api_resume', () => this.release('platform'));

    try {
      const player = await withTimeout(this.sdk.getPlayer(), this.timeouts.playerMs);
      this.cloud = { ...(await withTimeout(player.getData(), this.timeouts.playerMs)) };
      this.player = player;
    } catch (error) {
      console.warn('Данные игрока Яндекса недоступны, сохранение — на устройстве', error);
    }
  }

  getLang(): Lang {
    return pickLang(this.sdk.environment?.i18n?.lang);
  }

  gameReady(): void {
    this.sdk.features.LoadingAPI?.ready();
  }

  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    this.sdk.features.GameplayAPI?.start();
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.sdk.features.GameplayAPI?.stop();
  }

  onPause(pause: () => void, resume: () => void): void {
    this.pause = pause;
    this.resume = resume;
    // Пауза могла начаться до подписки: стартовая реклама.
    if (this.reasons.size > 0) pause();
  }

  showInterstitial(): Promise<void> {
    return this.showAd((callbacks) => this.sdk.adv.showFullscreenAdv({ callbacks })).then(() => undefined);
  }

  showRewarded(): Promise<boolean> {
    return this.showAd((callbacks) => this.sdk.adv.showRewardedVideo({ callbacks }));
  }

  async load<T>(key: string, fallback: T): Promise<T> {
    const value = this.cloud[key];
    // В облаке пусто — берём копию с устройства: игрок мог играть, пока облако было недоступно.
    return value !== undefined && value !== null ? (value as T) : this.local.load(key, fallback);
  }

  async save<T>(key: string, value: T): Promise<void> {
    this.local.save(key, value);
    if (!this.player) return;
    this.cloud = { ...this.cloud, [key]: value };
    await this.player.setData(this.cloud, true);
  }

  /**
   * Показывает рекламу и ждёт, пока её закроют. На время показа игра и звук стоят.
   * Возвращает true, если площадка засчитала просмотр (у полноэкранной рекламы — всегда false).
   */
  private showAd(show: (callbacks: Required<YandexAdCallbacks>) => void): Promise<boolean> {
    return new Promise((resolve) => {
      let rewarded = false;
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        clearTimeout(watchdog);
        this.release('ad');
        resolve(rewarded);
      };
      // Площадка могла не ответить вовсе (нет сети, блокировщик): игра не должна ждать вечно.
      const watchdog = setTimeout(finish, this.timeouts.adOpenMs);

      try {
        show({
          onOpen: () => {
            clearTimeout(watchdog);
            if (!done) this.hold('ad');
          },
          onRewarded: () => {
            rewarded = true;
          },
          onClose: finish,
          onError: finish,
        });
      } catch {
        finish();
      }
    });
  }

  private hold(reason: PauseReason): void {
    const paused = this.reasons.size > 0;
    this.reasons.add(reason);
    if (!paused) this.pause();
  }

  private release(reason: PauseReason): void {
    if (!this.reasons.delete(reason)) return;
    if (this.reasons.size === 0) this.resume();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Нет ответа за ${ms} мс`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
