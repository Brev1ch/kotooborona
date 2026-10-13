import Phaser from 'phaser';
import { audio } from '../audio';
import { levels } from '../data';
import { t, type StringKey } from '../i18n';
import { COLORS, FONTS, GAME_W, MENU, menuBookCenter, menuCardCenter, menuSoundCenter, TEXT_COLORS } from '../layout';
import { progress } from '../progress';
import { campaignTiles, type CampaignTile } from '../systems/Campaign';
import { MAX_STARS } from '../systems/Progress';
import { SceneKey, type LevelSceneData } from './keys';
import { fadeIn, fadeOut } from './transitions';
import { addButton, addPressFeel, addSoundButton } from './widgets';

const CARD_PAD = 14;
const NUMBER_W = 26;
const STAR_STEP = 20;
const LOCKED_ALPHA = 0.55;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Menu);
  }

  create(): void {
    fadeIn(this);
    this.add
      .text(GAME_W / 2, MENU.titleY, t('game.title'), {
        fontFamily: FONTS.display,
        fontSize: '32px',
        color: TEXT_COLORS.fg,
      })
      .setOrigin(0.5);

    addSoundButton(this, ...menuSoundCenter());

    const levelIds = levels.levels.map((level) => level.id);
    const tiles = campaignTiles(levelIds, levels.chapterLevels, (id) => progress.stars(id));
    tiles.forEach((tile, index) => this.addCard(tile, ...menuCardCenter(index)));

    addButton(this, ...menuBookCenter(), MENU.bookW, MENU.bookH, t('book.title'), false, () => {
      fadeOut(this, () => this.scene.start(SceneKey.Book));
    });
  }

  /** Плитка уровня: номер, название и звёзды; у закрытого — номер и замок. */
  private addCard(tile: CampaignTile, x: number, y: number): void {
    const { cardW, cardH } = MENU;
    const open = tile.unlocked && tile.levelId !== null;
    const left = -cardW / 2 + CARD_PAD;

    const bg = this.add.rectangle(0, 0, cardW, cardH, COLORS.panel).setStrokeStyle(1, open ? COLORS.brass : COLORS.line);
    const number = this.add
      .text(left + NUMBER_W / 2, 0, String(tile.number), {
        fontFamily: FONTS.display,
        fontSize: '22px',
        color: open ? TEXT_COLORS.brass : TEXT_COLORS.muted,
      })
      .setOrigin(0.5);
    const card = this.add.container(x, y, [bg, number]);

    if (!open || tile.levelId === null) {
      card.add(this.drawLock(cardW / 2 - CARD_PAD - 10, 0));
      card.setAlpha(LOCKED_ALPHA);
      return;
    }

    const contentX = left + NUMBER_W + 10;
    card.add(
      this.add
        .text(contentX, -12, t(`level.${tile.levelId}` as StringKey), {
          fontFamily: FONTS.body,
          fontSize: '16px',
          color: TEXT_COLORS.fg,
        })
        .setOrigin(0, 0.5),
    );
    for (let i = 0; i < MAX_STARS; i++) {
      const color = i < tile.stars ? COLORS.brass : COLORS.line;
      card.add(this.add.star(contentX + 8 + i * STAR_STEP, 13, 5, 4, 8.5, color));
    }

    const data: LevelSceneData = { levelId: tile.levelId };
    bg.setInteractive({ useHandCursor: true });
    addPressFeel(this, bg, card);
    bg.on('pointerdown', () => audio.play('click'));
    bg.once('pointerup', () => fadeOut(this, () => this.scene.start(SceneKey.Gear, data)));
  }

  private drawLock(x: number, y: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics({ x, y });
    g.lineStyle(2.5, COLORS.line);
    g.beginPath();
    g.arc(0, -3, 5, Math.PI, 0);
    g.strokePath();
    g.fillStyle(COLORS.line);
    g.fillRoundedRect(-8, -3, 16, 12, 3);
    return g;
  }
}
