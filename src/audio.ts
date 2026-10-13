import type Phaser from 'phaser';
import { SOUND_FEEL, type SoundId } from './feel';
import { progress } from './progress';
import { SoundGate, type PauseReason } from './systems/Sound';

const SOUND_IDS = Object.keys(SOUND_FEEL) as SoundId[];

function cacheKey(id: SoundId): string {
  return `sfx-${id}`;
}

/** Звуки игры поверх Phaser Sound. Сцены знают только `audio.play(id)`. */
class GameAudio {
  private game: Phaser.Game | null = null;
  private readonly gate = new SoundGate(SOUND_FEEL);
  /** Заранее созданные копии каждого звука: в бою новые объекты не создаются. */
  private readonly voices = new Map<SoundId, Phaser.Sound.BaseSound[]>();
  private readonly nextVoice = new Map<SoundId, number>();

  /** Ставит файлы в очередь загрузки сцены: ogg, а где его нет (старый Safari) — mp3. */
  preload(scene: Phaser.Scene): void {
    for (const id of SOUND_IDS) {
      scene.load.audio(cacheKey(id), [`assets/sfx/${id}.ogg`, `assets/sfx/${id}.mp3`]);
    }
  }

  /** Вызывается один раз, когда звуки и сохранение загружены. */
  init(game: Phaser.Game): void {
    this.game = game;
    this.gate.setOn(progress.soundOn);

    for (const id of SOUND_IDS) {
      // Файл не загрузился — игра идёт без этого звука.
      if (!game.cache.audio.exists(cacheKey(id))) continue;
      this.voices.set(
        id,
        Array.from({ length: SOUND_FEEL[id].voices }, () => game.sound.add(cacheKey(id))),
      );
    }

    // Площадка требует тишины, когда вкладка скрыта или игра свёрнута.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause('hidden');
      else this.resume('hidden');
    });
    if (document.hidden) this.gate.pause('hidden');
    this.apply();
  }

  /** Настройка игрока; хранится в сохранении. */
  get on(): boolean {
    return this.gate.on;
  }

  /** Включает или выключает звук. Возвращает новое состояние. */
  toggle(): boolean {
    const on = !this.gate.on;
    this.gate.setOn(on);
    progress.setSound(on);
    this.apply();
    return on;
  }

  /** Заглушает всё, пока причину не снимут через `resume`: вкладка скрыта, идёт реклама. */
  pause(reason: PauseReason): void {
    this.gate.pause(reason);
    this.apply();
  }

  resume(reason: PauseReason): void {
    this.gate.resume(reason);
    this.apply();
  }

  play(id: SoundId): void {
    const voices = this.voices.get(id);
    if (!voices || !this.gate.allow(id, performance.now())) return;

    const index = this.nextVoice.get(id) ?? 0;
    this.nextVoice.set(id, (index + 1) % voices.length);
    const { volume, detune } = SOUND_FEEL[id];
    voices[index].play({ volume, detune: (Math.random() * 2 - 1) * detune });
  }

  /** Заглушает и уже звучащее: длинный звук не должен доигрывать в скрытой вкладке или под рекламой. */
  private apply(): void {
    this.game?.sound.setMute(!this.gate.audible);
  }
}

export const audio = new GameAudio();
