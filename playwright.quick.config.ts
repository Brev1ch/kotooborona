import { defineConfig } from '@playwright/test';
import full from './playwright.config';

const PORT = 4173;

// Быстрый смоук (`npm run smoke`, 2–3 минуты) — после каждой фичи: основной сценарий, ритуал смешения и обучение нового игрока на русском,
// без заглушек арта и без сервера разработки. Всё остальное — `npm run smoke:full`.
export default defineConfig({
  ...full,
  projects: [{ name: 'ru', use: { locale: 'ru-RU' }, testMatch: 'game.smoke.ts', grep: /старое сохранение|ритуал смешения|интерактивное обучение/ }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
