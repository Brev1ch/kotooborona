// Та часть Yandex Games SDK, которой пользуется игра. Описана по yandex.ru/dev/games/doc (октябрь 2026).

export interface YandexAdCallbacks {
  onOpen?: () => void;
  /** У полноэкранной рекламы приходит и после ошибки, и при слишком частом вызове; `wasShown` — была ли она показана. */
  onClose?: (wasShown?: boolean) => void;
  onError?: (error: unknown) => void;
  /** Только у ролика с наградой: просмотр засчитан. */
  onRewarded?: () => void;
}

export interface YandexPlayer {
  /** Без `keys` — все данные игрока. */
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  /** Заменяет данные игрока целиком; `flush` — отправить сразу, а не поставить в очередь. */
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
}

export type YandexPauseEvent = 'game_api_pause' | 'game_api_resume';

export interface YandexSdk {
  environment: { i18n: { lang: string } };
  features: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  adv: {
    showFullscreenAdv(options?: { callbacks?: YandexAdCallbacks }): void;
    showRewardedVideo(options?: { callbacks?: YandexAdCallbacks }): void;
  };
  getPlayer(): Promise<YandexPlayer>;
  /** Площадка просит поставить игру на паузу и снять с неё: реклама, покупки, другая вкладка, свёрнутое окно. */
  on?(event: YandexPauseEvent, handler: () => void): void;
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<YandexSdk> };
  }
}

/** Адрес SDK на площадке: Яндекс раздаёт его с того же домена, что и игру. */
const SDK_URL = '/sdk.js';

/**
 * Подключает SDK, если игра открыта на Яндекс Играх (или через их локальный прокси), и возвращает его.
 * Вне площадки по этому адресу скрипта нет — возвращает null, и игра работает с заглушкой.
 */
export async function loadYandexSdk(): Promise<YandexSdk | null> {
  try {
    // Сначала смотрим, что по адресу лежит именно скрипт: сервер разработки отдаёт на любой адрес страницу игры.
    const probe = await fetch(SDK_URL);
    const type = probe.headers.get('content-type') ?? '';
    void probe.body?.cancel();
    if (!probe.ok || !type.includes('javascript')) return null;

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SDK_URL;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('sdk.js не загрузился'));
      document.head.append(script);
    });
    return window.YaGames ? await window.YaGames.init() : null;
  } catch (error) {
    console.warn('Yandex Games SDK недоступен, игра работает с заглушкой', error);
    return null;
  }
}
