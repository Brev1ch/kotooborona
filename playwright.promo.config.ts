import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const PORT = 4173;

// Промо для каталога (npm run promo, scripts/promo.mjs): та же сборка и тот же экран, что у смоука.
// Скриншоты — на русском и на английском, запись геймплея для видео — только на русском.
export default defineConfig({
  ...base,
  testMatch: '*.promo.ts',
  timeout: 180_000,
  projects: [
    { name: 'ru', use: { locale: 'ru-RU' }, grep: /скриншоты/ },
    { name: 'en', use: { locale: 'en-US' }, grep: /скриншоты/ },
    // Запись идёт с холста игры (MediaRecorder в сценарии), до 1080 по высоте её увеличивает scripts/promo.mjs.
    { name: 'video', use: { locale: 'ru-RU' }, grep: /видео/ },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
