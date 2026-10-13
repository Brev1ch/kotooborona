import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalStore } from './LocalStore';
import { YandexPlatform } from './YandexPlatform';
import type { YandexAdCallbacks, YandexPauseEvent, YandexSdk } from './yandexSdk';

const TIMEOUTS = { playerMs: 1000, adOpenMs: 500 };

function memoryStore(initial: Record<string, unknown> = {}): LocalStore & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    load: <T>(key: string, fallback: T) => (key in data ? (data[key] as T) : fallback),
    save: (key, value) => {
      data[key] = value;
    },
  };
}

/** Поддельный SDK: запоминает вызовы и отдаёт колбэки рекламы тесту. */
function fakeSdk(options: { lang?: string; cloud?: Record<string, unknown>; player?: 'ok' | 'fail' | 'hang' } = {}) {
  const calls: string[] = [];
  const handlers = new Map<YandexPauseEvent, () => void>();
  let ad: YandexAdCallbacks = {};
  const setData = vi.fn(async (_data: Record<string, unknown>, _flush?: boolean) => {});

  const sdk: YandexSdk = {
    environment: { i18n: { lang: options.lang ?? 'ru' } },
    features: {
      LoadingAPI: { ready: () => calls.push('ready') },
      GameplayAPI: { start: () => calls.push('start'), stop: () => calls.push('stop') },
    },
    adv: {
      showFullscreenAdv: ({ callbacks } = {}) => {
        calls.push('fullscreen');
        ad = callbacks ?? {};
      },
      showRewardedVideo: ({ callbacks } = {}) => {
        calls.push('rewarded');
        ad = callbacks ?? {};
      },
    },
    getPlayer: () => {
      if (options.player === 'fail') return Promise.reject(new Error('нет игрока'));
      if (options.player === 'hang') return new Promise(() => {});
      return Promise.resolve({ getData: async () => ({ ...options.cloud }), setData });
    },
    on: (event, handler) => handlers.set(event, handler),
  };
  return { sdk, calls, setData, emit: (event: YandexPauseEvent) => handlers.get(event)?.(), ad: () => ad };
}

async function setup(options: Parameters<typeof fakeSdk>[0] = {}, local = memoryStore()) {
  const fake = fakeSdk(options);
  const platform = new YandexPlatform(fake.sdk, local, TIMEOUTS);
  const pauses: string[] = [];
  await platform.init();
  platform.onPause(
    () => pauses.push('pause'),
    () => pauses.push('resume'),
  );
  return { ...fake, platform, pauses, local };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('YandexPlatform: язык и готовность', () => {
  it('берёт язык из окружения SDK', async () => {
    expect((await setup({ lang: 'ru' })).platform.getLang()).toBe('ru');
    expect((await setup({ lang: 'en' })).platform.getLang()).toBe('en');
    expect((await setup({ lang: 'tr' })).platform.getLang()).toBe('en');
    expect((await setup({ lang: 'kk' })).platform.getLang()).toBe('ru');
  });

  it('сообщает о готовности через LoadingAPI.ready', async () => {
    const { platform, calls } = await setup();
    platform.gameReady();
    expect(calls).toEqual(['ready']);
  });

  it('работает, если у SDK нет LoadingAPI и GameplayAPI', async () => {
    const { platform, sdk } = await setup();
    sdk.features = {};
    expect(() => {
      platform.gameReady();
      platform.gameplayStart();
      platform.gameplayStop();
    }).not.toThrow();
  });
});

describe('YandexPlatform: разметка игрового процесса', () => {
  it('start и stop уходят в GameplayAPI по одному разу на смену состояния', async () => {
    const { platform, calls } = await setup();
    platform.gameplayStop();
    platform.gameplayStart();
    platform.gameplayStart();
    platform.gameplayStop();
    platform.gameplayStop();
    platform.gameplayStart();
    expect(calls).toEqual(['start', 'stop', 'start']);
  });
});

describe('YandexPlatform: реклама', () => {
  it('полноэкранная: пауза при открытии, продолжение при закрытии', async () => {
    const { platform, pauses, ad, calls } = await setup();
    let closed = false;
    const shown = platform.showInterstitial().then(() => {
      closed = true;
    });
    expect(calls).toEqual(['fullscreen']);
    expect(pauses).toEqual([]);

    ad().onOpen?.();
    expect(pauses).toEqual(['pause']);
    await Promise.resolve();
    expect(closed).toBe(false);

    ad().onClose?.(true);
    await shown;
    expect(pauses).toEqual(['pause', 'resume']);
  });

  it('полноэкранная не показана (слишком часто): игра не вставала и идёт дальше', async () => {
    const { platform, pauses, ad } = await setup();
    const shown = platform.showInterstitial();
    ad().onClose?.(false);
    await shown;
    expect(pauses).toEqual([]);
  });

  it('ролик досмотрен: награда выдаётся после закрытия', async () => {
    const { platform, pauses, ad } = await setup();
    const shown = platform.showRewarded();
    ad().onOpen?.();
    ad().onRewarded?.();
    ad().onClose?.();
    expect(await shown).toBe(true);
    expect(pauses).toEqual(['pause', 'resume']);
  });

  it('ролик закрыт раньше времени: награды нет', async () => {
    const { platform, ad } = await setup();
    const shown = platform.showRewarded();
    ad().onOpen?.();
    ad().onClose?.();
    expect(await shown).toBe(false);
  });

  it('ошибка рекламы: награды нет, игра снята с паузы один раз', async () => {
    const { platform, pauses, ad } = await setup();
    const shown = platform.showRewarded();
    ad().onOpen?.();
    ad().onError?.(new Error('нет рекламы'));
    ad().onClose?.();
    expect(await shown).toBe(false);
    expect(pauses).toEqual(['pause', 'resume']);
  });

  it('площадка молчит: показ считается несостоявшимся, игра не зависает', async () => {
    const { platform, pauses } = await setup();
    vi.useFakeTimers();
    const shown = platform.showRewarded();
    vi.advanceTimersByTime(TIMEOUTS.adOpenMs);
    expect(await shown).toBe(false);
    expect(pauses).toEqual([]);
  });

  it('открытую рекламу не обрывает таймер ожидания', async () => {
    const { platform, pauses, ad } = await setup();
    vi.useFakeTimers();
    const shown = platform.showRewarded();
    ad().onOpen?.();
    vi.advanceTimersByTime(TIMEOUTS.adOpenMs * 100);
    expect(pauses).toEqual(['pause']);
    ad().onRewarded?.();
    ad().onClose?.();
    expect(await shown).toBe(true);
  });

  it('SDK бросил исключение при показе: награды нет', async () => {
    const { platform, sdk } = await setup();
    sdk.adv.showRewardedVideo = () => {
      throw new Error('сломано');
    };
    expect(await platform.showRewarded()).toBe(false);
  });
});

describe('YandexPlatform: пауза по просьбе площадки', () => {
  it('game_api_pause и game_api_resume ставят и снимают паузу', async () => {
    const { pauses, emit } = await setup();
    emit('game_api_pause');
    emit('game_api_pause');
    expect(pauses).toEqual(['pause']);
    emit('game_api_resume');
    expect(pauses).toEqual(['pause', 'resume']);
    emit('game_api_resume');
    expect(pauses).toEqual(['pause', 'resume']);
  });

  it('реклама и просьба площадки вместе дают одну паузу; игра идёт, когда кончились обе', async () => {
    const { platform, pauses, ad, emit } = await setup();
    const shown = platform.showRewarded();
    emit('game_api_pause');
    ad().onOpen?.();
    expect(pauses).toEqual(['pause']);
    ad().onRewarded?.();
    ad().onClose?.();
    await shown;
    expect(pauses).toEqual(['pause']);
    emit('game_api_resume');
    expect(pauses).toEqual(['pause', 'resume']);
  });

  it('пауза до подписки (стартовая реклама) доходит до игры при подписке', async () => {
    const fake = fakeSdk();
    const platform = new YandexPlatform(fake.sdk, memoryStore(), TIMEOUTS);
    await platform.init();
    fake.emit('game_api_pause');

    const pauses: string[] = [];
    platform.onPause(
      () => pauses.push('pause'),
      () => pauses.push('resume'),
    );
    expect(pauses).toEqual(['pause']);
    fake.emit('game_api_resume');
    expect(pauses).toEqual(['pause', 'resume']);
  });
});

describe('YandexPlatform: сохранения', () => {
  it('читает сохранение из данных игрока', async () => {
    const { platform } = await setup({ cloud: { save: { version: 1 } } }, memoryStore({ save: { version: 0 } }));
    expect(await platform.load('save', null)).toEqual({ version: 1 });
  });

  it('в облаке пусто — берёт копию с устройства, а без неё — значение по умолчанию', async () => {
    const withLocal = await setup({ cloud: {} }, memoryStore({ save: 'local' }));
    expect(await withLocal.platform.load('save', null)).toBe('local');
    const empty = await setup({ cloud: {} });
    expect(await empty.platform.load('save', 'fallback')).toBe('fallback');
  });

  it('пишет в облако сразу, не теряя чужие ключи, и кладёт копию на устройство', async () => {
    const { platform, setData, local } = await setup({ cloud: { other: 1 } });
    await platform.save('save', { stars: 3 });
    expect(setData).toHaveBeenCalledWith({ other: 1, save: { stars: 3 } }, true);
    expect(local.data.save).toEqual({ stars: 3 });
    expect(await platform.load('save', null)).toEqual({ stars: 3 });
  });

  it('игрок недоступен: сохранение живёт на устройстве', async () => {
    const { platform, setData, local } = await setup({ player: 'fail' }, memoryStore({ save: 'old' }));
    expect(await platform.load('save', null)).toBe('old');
    await platform.save('save', 'new');
    expect(setData).not.toHaveBeenCalled();
    expect(local.data.save).toBe('new');
  });

  it('игрок не отвечает: запуск не зависает', async () => {
    vi.useFakeTimers();
    const fake = fakeSdk({ player: 'hang' });
    const platform = new YandexPlatform(fake.sdk, memoryStore({ save: 'local' }), TIMEOUTS);
    const ready = platform.init();
    await vi.advanceTimersByTimeAsync(TIMEOUTS.playerMs);
    await ready;
    expect(await platform.load('save', null)).toBe('local');
  });

  it('ошибка записи в облако доходит до вызывающего: прогресс повторит запись', async () => {
    const { platform, setData } = await setup();
    setData.mockRejectedValueOnce(new Error('лимит'));
    await expect(platform.save('save', 1)).rejects.toThrow('лимит');
  });
});
