import { defineConfig } from '@playwright/test';

const PORT = 4173;
/** Сервер разработки: в нём работают отладочные средства (`src/debug.ts`), которых нет в сборке. */
const DEV_PORT = 4174;
/** Заглушки арта для проекта `art`: вне сборки и вне git. Тот же путь — в `smoke/game.smoke.ts`. */
const SMOKE_ART = 'node_modules/.cache/smoke-art';

// Полная смоук-проверка (`npm run smoke:full`): свежая сборка в headless Chromium с экраном телефона.
// Быстрая (`npm run smoke`) — `playwright.quick.config.ts`.
export default defineConfig({
  testDir: 'smoke',
  // Не *.spec.ts и не *.test.ts: такие файлы подхватил бы Vitest в `npm test`.
  testMatch: '*.smoke.ts',
  outputDir: 'test-results',
  reporter: 'list',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  use: {
    browserName: 'chromium',
    headless: true,
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  // Игра берёт язык из браузера: вся проверка идёт дважды, на русском и на английском.
  // Снимки английской — в screenshots/en. Одна локаль: npm run smoke:full -- --project=ru
  projects: [
    { name: 'ru', use: { locale: 'ru-RU' } },
    // Проверка с поддельным SDK Яндекса от языка браузера не зависит: ей хватает одного прогона.
    { name: 'en', use: { locale: 'en-US' }, testIgnore: 'yandex.smoke.ts' },
    // Та же проверка с готовым артом: вместо пустого `assets/art` страница получает заглушки всех картинок манифеста.
    // Снимки — в screenshots/art.
    { name: 'art', use: { locale: 'ru-RU' }, testIgnore: 'yandex.smoke.ts' },
    // Так играет разработчик: `npm run dev` со счётчиком FPS и отладочными кнопками. Здесь — только цепочка уровней.
    {
      name: 'dev',
      use: { locale: 'ru-RU', baseURL: `http://localhost:${DEV_PORT}` },
      testIgnore: 'yandex.smoke.ts',
      grep: /уровень за уровнем/,
    },
  ],
  webServer: [
    {
      // Заглушка каждой картинки манифеста проходит тот же конвейер, что и настоящий арт.
      command: `node scripts/art.mjs --placeholders --src ${SMOKE_ART}/src --out ${SMOKE_ART}/out && npm run build && npx vite preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
