import { defineConfig } from 'vite';

export default defineConfig({
  // Яндекс Игры раздают архив из подкаталога, поэтому пути только относительные.
  base: './',
  build: {
    // Phaser целиком весит больше стандартного порога предупреждения.
    chunkSizeWarningLimit: 1600,
  },
});
