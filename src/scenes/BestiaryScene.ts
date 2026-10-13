import Phaser from 'phaser';
import { enemies } from '../data';
import { addEnemyPortrait } from '../entities/EnemyView';
import { t } from '../i18n';
import { BESTIARY, bestiaryBackCenter, bestiaryRowCenter, COLORS, FONTS, GAME_W, TEXT_COLORS } from '../layout';
import { progress } from '../progress';
import { bestiaryEntries, type BestiaryEntry } from '../systems/Bestiary';
import { addEnemyCard, enemyName, enemyTrait } from './EnemyCard';
import { SceneKey } from './keys';
import { fadeIn, fadeOut } from './transitions';
import { addButton, addPressFeel } from './widgets';

/** Бестиарий: побеждённые враги — с особенностью, по нажатию — карточка; остальные — силуэтом. */
export class BestiaryScene extends Phaser.Scene {
  /** Карточка врага открыта: строки под ней не нажимаются. */
  private cardOpen = false;

  constructor() {
    super(SceneKey.Bestiary);
  }

  create(): void {
    fadeIn(this);
    this.cardOpen = false;
    const entries = bestiaryEntries(enemies, (type) => progress.hasEnemy(type));
    const found = entries.filter((entry) => entry.known).length;

    this.add
      .text(GAME_W / 2, BESTIARY.titleY, t('bestiary.title'), {
        fontFamily: FONTS.display,
        fontSize: '26px',
        color: TEXT_COLORS.fg,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_W / 2, BESTIARY.countY, t('book.count', { found, total: entries.length }), {
        fontFamily: FONTS.body,
        fontSize: '14px',
        color: TEXT_COLORS.brass,
      })
      .setOrigin(0.5);

    entries.forEach((entry, index) => this.addRow(entry, ...bestiaryRowCenter(index)));

    addButton(this, ...bestiaryBackCenter(), BESTIARY.backW, BESTIARY.backH, t('nav.back'), false, () => {
      fadeOut(this, () => this.scene.start(SceneKey.Menu));
    });
  }

  private addRow({ type, known }: BestiaryEntry, x: number, y: number): void {
    const { rowW, rowH, iconX, iconSize, textX } = BESTIARY;
    const left = -rowW / 2;
    const bg = this.add.rectangle(0, 0, rowW, rowH, COLORS.panel, known ? 1 : 0).setStrokeStyle(1, COLORS.line, known ? 1 : 0.4);
    const icon = addEnemyPortrait(this, type, left + iconX, 0, iconSize, known);
    const title = this.add
      .text(left + textX, -9, known ? enemyName(type) : t('book.unknown'), {
        fontFamily: FONTS.body,
        fontSize: '15px',
        color: known ? TEXT_COLORS.fg : TEXT_COLORS.muted,
      })
      .setOrigin(0, 0.5);
    const detail = this.add
      .text(left + textX, 10, known ? enemyTrait(type) : t('bestiary.locked'), {
        fontFamily: FONTS.body,
        fontSize: '12px',
        color: TEXT_COLORS.muted,
      })
      .setOrigin(0, 0.5);
    const row = this.add.container(x, y, [bg, icon, title, detail]);
    if (!known) return;

    bg.setName(`enemy-${type}`).setInteractive({ useHandCursor: true });
    addPressFeel(this, bg, row, () => !this.cardOpen);
    bg.on('pointerup', () => {
      if (this.cardOpen) return;
      this.cardOpen = true;
      addEnemyCard(this, type, { button: t('enemy.cardClose'), onClose: () => (this.cardOpen = false) });
    });
  }
}
