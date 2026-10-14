import { defineConfig } from 'vite';
import { soundPicker } from './scripts/soundPicker.mjs';

export default defineConfig({
  // Яндекс Игры раздают архив из подкаталога, поэтому пути только относительные.
  base: './',
  // /sound-picker.html — прослушивание звуков, только в `npm run dev`.
  plugins: [soundPicker()],
  build: {
    // Phaser целиком весит больше стандартного порога предупреждения.
    chunkSizeWarningLimit: 1600,
  },
});
