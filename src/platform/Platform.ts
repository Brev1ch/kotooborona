export type Lang = 'ru' | 'en';

/** Всё, что игра знает о площадке. Сцены и системы работают только через этот интерфейс. */
export interface Platform {
  init(): Promise<void>;
  getLang(): Lang;
  /** Сообщает площадке, что игра загрузилась и готова к показу. */
  gameReady(): void;
  showInterstitial(): Promise<void>;
  /** Возвращает true, если игрок досмотрел ролик и награду можно выдать. */
  showRewarded(): Promise<boolean>;
  /**
   * Площадка просит остановить игру и звук на время рекламы: `pause` — перед показом, `resume` — после закрытия.
   * Вызовы всегда парные.
   */
  onPause(pause: () => void, resume: () => void): void;
  load<T>(key: string, fallback: T): Promise<T>;
  save<T>(key: string, value: T): Promise<void>;
}
