import { DevPlatform } from './DevPlatform';
import type { Platform } from './Platform';

// Пока есть только заглушка. Реализация на Yandex Games SDK подключится здесь же.
export const platform: Platform = new DevPlatform();

export type { Lang, Platform } from './Platform';
