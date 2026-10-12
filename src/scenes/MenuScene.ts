import Phaser from 'phaser';
import { levels } from '../data';
import { t, type StringKey } from '../i18n';
import { COLORS, FONTS, GAME_H, GAME_W, TEXT_COLORS } from '../layout';
import { SceneKey, type LevelSceneData } from './keys';

const BUTTON_W = 200;
const BUTTON_H = 56;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Menu);
  }

  create(): void {
    const level = levels.levels[0];
    const cx = GAME_W / 2;

    this.add
      .text(cx, GAME_H * 0.3, t('game.title'), {
        fontFamily: FONTS.display,
        fontSize: '32px',
        color: TEXT_COLORS.fg,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, GAME_H * 0.3 + 40, t(`level.${level.id}` as StringKey), {
        fontFamily: FONTS.body,
        fontSize: '14px',
        color: TEXT_COLORS.muted,
      })
      .setOrigin(0.5);

    const button = this.add
      .rectangle(cx, GAME_H * 0.6, BUTTON_W, BUTTON_H, COLORS.brass)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(cx, GAME_H * 0.6, t('menu.play'), {
        fontFamily: FONTS.display,
        fontSize: '20px',
        color: TEXT_COLORS.dark,
      })
      .setOrigin(0.5);

    button.on('pointerup', () => {
      const data: LevelSceneData = { levelId: level.id };
      this.scene.start(SceneKey.Game, data);
    });
  }
}
