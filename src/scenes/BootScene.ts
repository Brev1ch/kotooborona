import Phaser from 'phaser';
import { art } from '../art';
import { audio } from '../audio';
import { levels } from '../data';
import { loadFonts } from '../fonts';
import { setLang, t } from '../i18n';
import { platform } from '../platform';
import { progress } from '../progress';
import { SceneKey } from './keys';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  preload(): void {
    audio.preload(this);
    // Арт: атласы и фон первого уровня; фоны остальных грузит сцена боя при входе в уровень.
    art.preload(this, levels.levels[0].background);
  }

  create(): void {
    const saves = platform.init().then(() => progress.load());
    void Promise.all([saves, loadFonts()]).then(() => {
      // Язык, выбранный в настройках, важнее языка площадки.
      setLang(progress.lang ?? platform.getLang());
      document.title = t('game.title');
      audio.init(this.game);
      // Реклама: вся игра замирает (бой, анимации, таймеры), молчит и не принимает касаний.
      platform.onPause(
        () => {
          audio.pause('ad');
          this.game.input.enabled = false;
          this.game.pause();
        },
        () => {
          this.game.resume();
          this.game.input.enabled = true;
          audio.resume('ad');
        },
      );
      platform.gameReady();
      this.scene.start(SceneKey.Menu);
    });
  }
}
