import type { Plugin } from 'vite';

/** Плагин страницы /sound-picker.html для сервера разработки (scripts/soundPicker.mjs). */
export function soundPicker(): Plugin;
/** Строки таблицы SOUNDS из текста scripts/sfx.mjs: событие → исходник. */
export function readSounds(source: string): Record<string, string>;
