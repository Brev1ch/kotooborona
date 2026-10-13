const STORAGE_PREFIX = 'koto_';

/** Хранилище на устройстве: основное в разработке, запасное на площадке. */
export interface LocalStore {
  load<T>(key: string, fallback: T): T;
  save<T>(key: string, value: T): void;
}

/** localStorage браузера. Если он недоступен (приватный режим), игра идёт без сохранений. */
export const browserStore: LocalStore = {
  load<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },

  save<T>(key: string, value: T): void {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch {
      // Хранилище недоступно — продолжаем без записи.
    }
  },
};
