import { expect, test, type Page } from '@playwright/test';
import { SceneKey } from '../src/scenes/keys';

// Игра на Яндекс Играх: вместо настоящего /sdk.js страница получает подделку, которая записывает вызовы.
// Проверяется путь целиком: игра сама находит SDK, инициализирует его, берёт язык и сохранение, размечает бой.

const SCREEN_TIMEOUT = 10_000;

/** Подделка SDK. Выполняется в странице; вызовы копятся в window.__ya. */
const FAKE_SDK = `
  window.__ya = { calls: [], data: {}, handlers: {}, ad: null };
  window.YaGames = {
    init: async () => {
      window.__ya.calls.push('init');
      return {
        environment: { i18n: { lang: 'en' } },
        features: {
          LoadingAPI: { ready: () => window.__ya.calls.push('ready') },
          GameplayAPI: {
            start: () => window.__ya.calls.push('start'),
            stop: () => window.__ya.calls.push('stop'),
          },
        },
        adv: {
          showFullscreenAdv: ({ callbacks }) => { window.__ya.calls.push('fullscreen'); window.__ya.ad = callbacks; },
          showRewardedVideo: ({ callbacks }) => { window.__ya.calls.push('rewarded'); window.__ya.ad = callbacks; },
        },
        getPlayer: async () => ({
          getData: async () => window.__ya.data,
          setData: async (data) => { window.__ya.calls.push('setData'); window.__ya.data = data; },
        }),
        on: (event, handler) => { window.__ya.handlers[event] = handler; },
      };
    },
  };
`;

interface FakeYa {
  calls: string[];
  data: Record<string, unknown>;
  handlers: Record<string, () => void>;
  ad: Record<string, (arg?: unknown) => void> | null;
}

declare global {
  interface Window {
    __ya: FakeYa;
  }
}

function calls(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__ya.calls);
}

async function waitForScene(page: Page, key: string): Promise<void> {
  await page.waitForFunction(
    (scene) => {
      const state = window.__smoke?.state();
      return !!state && !state.fading && state.scenes.includes(scene);
    },
    key,
    { timeout: SCREEN_TIMEOUT },
  );
}

test('Яндекс Игры: SDK найден, язык и сохранение — с площадки, бой размечен', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.route('**/sdk.js', (route) =>
    route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: FAKE_SDK }),
  );

  await page.goto('/?smoke');
  await waitForScene(page, SceneKey.Menu);
  expect(await calls(page)).toEqual(['init', 'ready']);
  // Язык площадки — английский, хотя браузер русский.
  await page.screenshot({ path: 'screenshots/ya-01-menu-en.png' });

  // Пауза по просьбе площадки (другая вкладка, реклама при запуске) глушит звук и останавливает игру.
  await page.evaluate(() => window.__ya.handlers.game_api_pause());
  expect(await page.evaluate(() => window.__smoke?.frozen())).toBe(true);
  await page.evaluate(() => window.__ya.handlers.game_api_resume());
  expect(await page.evaluate(() => window.__smoke?.frozen())).toBe(false);

  await page.evaluate(() => window.__smoke?.startLevel());
  await waitForScene(page, SceneKey.UI);
  expect(await calls(page)).toEqual(['init', 'ready', 'start']);

  // Настройка звука — изменение прогресса: оно должно уйти в данные игрока.
  await page.evaluate(() => window.__smoke?.toggleSound());
  await expect.poll(() => calls(page), { timeout: 5000 }).toContain('setData');
  const saved = await page.evaluate(() => window.__ya.data.save as { sound: boolean });
  expect(saved.sound).toBe(false);

  expect(errors).toEqual([]);
});
