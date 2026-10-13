import Phaser from 'phaser';
import { audio } from '../audio';
import { loadFonts } from '../fonts';
import { setLang } from '../i18n';
import { platform } from '../platform';
import { progress } from '../progress';
import { SceneKey } from './keys';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  preload(): void {
    audio.preload(this);
  }

  create(): void {
    const saves = platform.init().then(() => progress.load());
    void Promise.all([saves, loadFonts()]).then(() => {
      setLang(platform.getLang());
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
