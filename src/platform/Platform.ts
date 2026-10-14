export type Lang = 'ru' | 'en';

/** Языки игры в порядке кнопок выбора. */
export const LANGS: readonly Lang[] = ['ru', 'en'];

/** Всё, что игра знает о площадке. Сцены и системы работают только через этот интерфейс. */
export interface Platform {
  init(): Promise<void>;
  getLang(): Lang;
  /** Сообщает площадке, что игра загрузилась и готова к показу. */
  gameReady(): void;
  /**
   * Игрок начал или продолжил играть: старт боя, снятие паузы. Повторный вызов ничего не делает.
   * Паузу на время рекламы и сворачивания площадка размечает сама.
   */
  gameplayStart(): void;
  /** Игрок перестал играть: пауза, конец боя, выход в меню. */
  gameplayStop(): void;
  /** Полноэкранная реклама. Завершается, когда её закрыли или показать не удалось. */
  showInterstitial(): Promise<void>;
  /** Возвращает true, если игрок досмотрел ролик и награду можно выдать. */
  showRewarded(): Promise<boolean>;
  /**
   * Площадка просит остановить игру и звук: `pause` — перед рекламой или когда игру свернули, `resume` — после.
   * Вызовы всегда парные.
   */
  onPause(pause: () => void, resume: () => void): void;
  load<T>(key: string, fallback: T): Promise<T>;
  save<T>(key: string, value: T): Promise<void>;
}
