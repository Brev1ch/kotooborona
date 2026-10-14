import type Phaser from 'phaser';
import { MUSIC_FEEL, SOUND_FEEL, type MusicId, type SoundId } from './feel';
import { progress } from './progress';
import { MusicMixer, SoundGate, trackAction, type PauseReason } from './systems/Sound';

const SOUND_IDS = Object.keys(SOUND_FEEL) as SoundId[];
const MUSIC_IDS = Object.keys(MUSIC_FEEL.tracks) as MusicId[];
/** Список готовых треков: его пишет `npm run sfx`. */
const MUSIC_INDEX = 'music-index';

function cacheKey(id: SoundId): string {
  return `sfx-${id}`;
}

function musicKey(id: MusicId): string {
  return `music-${id}`;
}

/** Звук трека: то общее, что есть у звуков Phaser на любом движке (Web Audio, HTML5, без звука). */
type TrackSound = Phaser.Sound.BaseSound & { setVolume(volume: number): unknown };

/** Звуки и музыка игры поверх Phaser Sound. Сцены знают только `audio.play(id)` и `audio.music(scene, id)`. */
class GameAudio {
  private game: Phaser.Game | null = null;
  private readonly gate = new SoundGate(SOUND_FEEL);
  /** Заранее созданные копии каждого звука: в бою новые объекты не создаются. */
  private readonly voices = new Map<SoundId, Phaser.Sound.BaseSound[]>();
  private readonly nextVoice = new Map<SoundId, number>();
  private readonly mixer = new MusicMixer<MusicId>(MUSIC_FEEL.fadeMs);
  /** Треки, файлы которых собраны; остальных в игре пока нет. */
  private readonly readyTracks = new Set<MusicId>();
  private readonly loadingTracks = new Set<MusicId>();
  private readonly tracks = new Map<MusicId, TrackSound>();

  /** Ставит файлы в очередь загрузки сцены: ogg, а где его нет (старый Safari) — mp3. Музыка сюда не входит: она грузится позже. */
  preload(scene: Phaser.Scene): void {
    for (const id of SOUND_IDS) {
      scene.load.audio(cacheKey(id), [`assets/sfx/${id}.ogg`, `assets/sfx/${id}.mp3`]);
    }
    scene.load.json(MUSIC_INDEX, 'assets/music/index.json');
  }

  /** Вызывается один раз, когда звуки и сохранение загружены. */
  init(game: Phaser.Game): void {
    this.game = game;
    this.gate.setOn(progress.soundOn);
    this.gate.setMusicOn(progress.musicOn);

    for (const id of SOUND_IDS) {
      // Файл не загрузился — игра идёт без этого звука.
      if (!game.cache.audio.exists(cacheKey(id))) continue;
      this.voices.set(
        id,
        Array.from({ length: SOUND_FEEL[id].voices }, () => game.sound.add(cacheKey(id))),
      );
    }

    const index: unknown = game.cache.json.get(MUSIC_INDEX);
    const listed = typeof index === 'object' && index !== null ? (index as { tracks?: unknown }).tracks : null;
    for (const id of MUSIC_IDS) if (Array.isArray(listed) && listed.includes(id)) this.readyTracks.add(id);
    // Шаг игры идёт и на паузе боя: музыка меняется плавно, что бы ни делали сцены.
    game.events.on('step', (_time: number, delta: number) => this.stepMusic(delta));

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

  /** Включает или выключает звуки; музыки это не касается. Возвращает новое состояние. */
  toggle(): boolean {
    const on = !this.gate.on;
    this.gate.setOn(on);
    progress.setSound(on);
    // Длинный звук не должен доигрывать после выключения.
    if (!on) for (const voices of this.voices.values()) for (const voice of voices) voice.stop();
    return on;
  }

  /** Настройка музыки; хранится в сохранении отдельно от звуков. */
  get musicOn(): boolean {
    return this.gate.musicOn;
  }

  /** Включает или выключает музыку: трек встаёт на паузу и потом продолжает с того же места. Возвращает новое состояние. */
  toggleMusic(): boolean {
    const on = !this.gate.musicOn;
    this.gate.setMusicOn(on);
    progress.setMusic(on);
    this.stepMusic(0);
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

  /**
   * Фоновая музыка экрана: прежний трек плавно сменяется этим; тот же трек продолжает играть. null — тишина.
   * Файл трека грузится при первом обращении, в очереди сцены `scene`, и игру не задерживает: загрузка начинается
   * после первого кадра сцены, когда экран (меню) уже показан. Пока трека нет — тихо.
   */
  music(scene: Phaser.Scene, id: MusicId | null): void {
    this.mixer.play(id);
    if (id === null || !this.readyTracks.has(id) || this.loadingTracks.has(id) || scene.cache.audio.exists(musicKey(id))) return;
    this.loadingTracks.add(id);
    const start = (): void => {
      scene.load.once(`filecomplete-audio-${musicKey(id)}`, done);
      scene.load.once('loaderror', done);
      scene.load.audio(musicKey(id), [`assets/music/${id}.ogg`, `assets/music/${id}.mp3`]);
      scene.load.start();
    };
    // Сцену могут закрыть раньше, чем файл придёт или кадр нарисуется: тогда загрузку начнёт следующая.
    const done = (): void => {
      this.loadingTracks.delete(id);
      scene.events.off('render', start);
    };
    scene.events.once('render', start);
    scene.events.once('shutdown', done);
  }

  /** Треки, которые сейчас звучат; для смоук-проверки. */
  get musicPlaying(): MusicId[] {
    return MUSIC_IDS.filter((id) => this.tracks.get(id)?.isPlaying);
  }

  /** Сдвигает уровни микшера и приводит к ним звуки треков. */
  private stepMusic(deltaMs: number): void {
    const { game } = this;
    if (!game) return;
    const audible = this.gate.musicAudible;
    // Пока музыка молчит, смена трека не идёт: после паузы она продолжится с того же места.
    if (audible) this.mixer.step(deltaMs);
    for (const id of MUSIC_IDS) {
      const level = this.mixer.level(id);
      let track = this.tracks.get(id);
      if (!track) {
        if (level <= 0 || !game.cache.audio.exists(musicKey(id))) continue;
        track = game.sound.add(musicKey(id), { loop: true, volume: 0 }) as TrackSound;
        this.tracks.set(id, track);
      }
      const action = trackAction(level, audible, track.isPlaying, track.isPaused);
      if (action) track[action]();
      if (level > 0) track.setVolume(level * MUSIC_FEEL.tracks[id].volume);
    }
  }

  /** На паузе глушится и уже звучащее: длинный звук не должен доигрывать в скрытой вкладке или под рекламой. */
  private apply(): void {
    this.game?.sound.setMute(this.gate.paused);
    this.stepMusic(0);
  }
}

export const audio = new GameAudio();
