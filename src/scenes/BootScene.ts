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
      platform.onPause(
        () => audio.pause('ad'),
        () => audio.resume('ad'),
      );
      platform.gameReady();
      this.scene.start(SceneKey.Menu);
    });
  }
}
