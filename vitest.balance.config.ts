import { defineConfig } from 'vitest/config';

// Отчёт о балансе главы (npm run balance): бот проходит каждый уровень много раз. Не входит в npm test — он долгий.
export default defineConfig({
  test: {
    include: ['balance/*.balance.ts'],
    testTimeout: 1_800_000,
    // Таблица печатается через console.log: перехват вывода её бы спрятал.
    disableConsoleIntercept: true,
    silent: false,
  },
});
