import Phaser from 'phaser';
import { loadFonts } from '../fonts';
import { setLang } from '../i18n';
import { platform } from '../platform';
import { progress } from '../progress';
import { SceneKey } from './keys';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    const saves = platform.init().then(() => progress.load());
    void Promise.all([saves, loadFonts()]).then(() => {
      setLang(platform.getLang());
      platform.gameReady();
      this.scene.start(SceneKey.Menu);
    });
  }
}
