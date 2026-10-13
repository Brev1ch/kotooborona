/** Почему звук временно молчит: вкладка скрыта или площадка показывает рекламу. */
export type PauseReason = 'hidden' | 'ad';

export interface SoundRule {
  /** Наименьший промежуток между двумя запусками одного звука, мс; 0 — без ограничения. */
  minIntervalMs: number;
}

/**
 * Решает, можно ли сейчас начать звук: учитывает настройку игрока, паузы
 * и не даёт частым звукам (выстрелы десяти котов) слиться в шум.
 */
export class SoundGate<Id extends string> {
  private enabled = true;
  private readonly pauses = new Set<PauseReason>();
  private readonly lastPlayed = new Map<Id, number>();

  constructor(private readonly rules: Record<Id, SoundRule>) {}

  /** Настройка игрока. */
  get on(): boolean {
    return this.enabled;
  }

  setOn(on: boolean): void {
    this.enabled = on;
  }

  /** Звук слышен: включён игроком и ни одна причина паузы не действует. */
  get audible(): boolean {
    return this.enabled && this.pauses.size === 0;
  }

  /** Причины независимы: звук вернётся, когда снимут все. */
  pause(reason: PauseReason): void {
    this.pauses.add(reason);
  }

  resume(reason: PauseReason): void {
    this.pauses.delete(reason);
  }

  /** Можно ли начать звук в момент `nowMs`. Если да — запоминает запуск. */
  allow(id: Id, nowMs: number): boolean {
    if (!this.audible) return false;
    const last = this.lastPlayed.get(id);
    if (last !== undefined && nowMs - last < this.rules[id].minIntervalMs) return false;
    this.lastPlayed.set(id, nowMs);
    return true;
  }
}
