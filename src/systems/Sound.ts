/** Почему звук временно молчит: вкладка скрыта или площадка показывает рекламу. */
export type PauseReason = 'hidden' | 'ad';

export interface SoundRule {
  /** Наименьший промежуток между двумя запусками одного звука, мс; 0 — без ограничения. */
  minIntervalMs: number;
  /** Вероятность, что звук прозвучит, от 0 до 1; без поля — всегда. Не прозвучавший промежуток не начинает. */
  chance?: number;
}

/**
 * Решает, можно ли сейчас начать звук: учитывает настройку игрока, паузы
 * и не даёт частым звукам (выстрелы десяти котов) слиться в шум.
 * Музыка включается отдельно от звуков, а паузы у них общие.
 */
export class SoundGate<Id extends string> {
  private enabled = true;
  private musicEnabled = true;
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

  /** Настройка игрока для музыки. */
  get musicOn(): boolean {
    return this.musicEnabled;
  }

  setMusicOn(on: boolean): void {
    this.musicEnabled = on;
  }

  /** Действует хотя бы одна причина паузы: молчит всё, и звуки, и музыка. */
  get paused(): boolean {
    return this.pauses.size > 0;
  }

  /** Музыка слышна: включена игроком и ни одна причина паузы не действует. */
  get musicAudible(): boolean {
    return this.musicEnabled && this.pauses.size === 0;
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

  /**
   * Можно ли начать звук в момент `nowMs`. Если да — запоминает запуск. `roll` — случайное число от 0 до 1 для шанса звука;
   * `force` — звук обязателен (первое открытие гибрида): шанс и промежуток не действуют, только настройка и паузы.
   */
  allow(id: Id, nowMs: number, roll = 0, force = false): boolean {
    if (!this.audible) return false;
    if (!force) {
      const { minIntervalMs, chance } = this.rules[id];
      const last = this.lastPlayed.get(id);
      if (last !== undefined && nowMs - last < minIntervalMs) return false;
      if (chance !== undefined && roll >= chance) return false;
    }
    this.lastPlayed.set(id, nowMs);
    return true;
  }
}

/**
 * Плавная смена фоновой музыки: нужный трек набирает громкость, прежний за то же время затихает.
 * Здесь только уровни от 0 до 1; сами звуки ведёт `audio.ts`.
 */
export class MusicMixer<Id extends string> {
  private target: Id | null = null;
  private readonly levels = new Map<Id, number>();

  /** `fadeMs` — за сколько трек проходит путь от тишины до полной громкости и обратно. */
  constructor(private readonly fadeMs: number) {}

  /** Трек, который должен играть; null — тишина. */
  get current(): Id | null {
    return this.target;
  }

  /** Что играть дальше: прежний трек затихнет, этот — проявится. null — музыка плавно умолкает. */
  play(id: Id | null): void {
    this.target = id;
    if (id !== null && !this.levels.has(id)) this.levels.set(id, 0);
  }

  /** Прошло `dtMs`: уровни сдвигаются к цели. Затихший до нуля трек из микшера уходит. */
  step(dtMs: number): void {
    const delta = this.fadeMs > 0 ? Math.max(0, dtMs) / this.fadeMs : 1;
    for (const [id, level] of this.levels) {
      if (id === this.target) this.levels.set(id, Math.min(1, level + delta));
      else if (level - delta <= 0) this.levels.delete(id);
      else this.levels.set(id, level - delta);
    }
  }

  /** Уровень трека от 0 до 1; 0 — не звучит. */
  level(id: Id): number {
    return this.levels.get(id) ?? 0;
  }

  /** Треки, которые сейчас в микшере: звучащий, проявляющийся и затихающие. */
  get active(): Id[] {
    return [...this.levels.keys()];
  }
}

/** Что сделать со звуком трека, чтобы он соответствовал микшеру; null — ничего. */
export type TrackAction = 'play' | 'resume' | 'pause' | 'stop' | null;

/**
 * Трек с уровнем `level` в микшере: пока музыка слышна, он играет; замолчала (выключена игроком, пауза) — встаёт на паузу
 * и потом продолжит с того же места; ушёл из микшера — останавливается.
 */
export function trackAction(level: number, audible: boolean, playing: boolean, paused: boolean): TrackAction {
  if (level <= 0) return playing || paused ? 'stop' : null;
  if (!audible) return playing ? 'pause' : null;
  if (playing) return null;
  return paused ? 'resume' : 'play';
}
