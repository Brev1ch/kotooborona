const STORAGE_PREFIX = 'koto_';

/** Хранилище на устройстве: основное в разработке, запасное на площадке. */
export interface LocalStore {
  load<T>(key: string, fallback: T): T;
  save<T>(key: string, value: T): void;
  /** Стирает всё, что игра сохранила на устройстве. */
  clear(): void;
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

  clear(): void {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
      }
    } catch {
      // Хранилище недоступно — стирать нечего.
    }
  },
};
