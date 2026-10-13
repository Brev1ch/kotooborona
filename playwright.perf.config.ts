import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Замер производительности (npm run perf): та же сборка и тот же экран, что у смоука, но другой набор проверок.
export default defineConfig({
  ...base,
  testMatch: '*.perf.ts',
  timeout: 180_000,
});
