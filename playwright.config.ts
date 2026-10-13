import { defineConfig } from '@playwright/test';

const PORT = 4173;

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
    // Основная аудитория — русскоязычная: на скриншотах русские строки.
    locale: 'ru-RU',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
