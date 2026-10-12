import Phaser from 'phaser';
import { setLang } from '../i18n';
import { platform } from '../platform';
import { SceneKey } from './keys';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    void platform.init().then(() => {
      setLang(platform.getLang());
      platform.gameReady();
      this.scene.start(SceneKey.Menu);
    });
  }
}
