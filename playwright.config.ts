import { defineConfig } from '@playwright/test';

const PORT = 4173;
/** Сервер разработки: в нём работают отладочные средства (`src/debug.ts`), которых нет в сборке. */
const DEV_PORT = 4174;

// Смоук-проверка: свежая сборка в headless Chromium с экраном телефона.
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
  // Снимки английской — в screenshots/en. Одна локаль: npm run smoke -- --project=ru
  projects: [
    { name: 'ru', use: { locale: 'ru-RU' } },
    // Проверка с поддельным SDK Яндекса от языка браузера не зависит: ей хватает одного прогона.
    { name: 'en', use: { locale: 'en-US' }, testIgnore: 'yandex.smoke.ts' },
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
      command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
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
