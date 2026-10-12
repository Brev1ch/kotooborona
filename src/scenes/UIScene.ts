import Phaser from 'phaser';
import { getLevel, type LevelConfig } from '../data';
import { t, type StringKey } from '../i18n';
import { COLORS, CONTROLS_H, CONTROLS_Y, FONTS, GAME_W, HUD_H, TEXT_COLORS } from '../layout';
import { SceneKey, type LevelSceneData } from './keys';

const STAT_PAD = 6;
const STAT_GAP = 6;
const STAT_COUNT = 4;

/** HUD поверх GameScene. Пока показывает стартовые значения уровня. */
export class UIScene extends Phaser.Scene {
  private level!: LevelConfig;

  constructor() {
    super(SceneKey.UI);
  }

  init(data: LevelSceneData): void {
    this.level = getLevel(data.levelId);
  }

  create(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.bg);
    g.fillRect(0, 0, GAME_W, HUD_H);
    g.fillRect(0, CONTROLS_Y, GAME_W, CONTROLS_H);

    const { startGold, startCrystals, startLives, waves } = this.level;
    this.addStat(g, 0, 'hud.gold', String(startGold), TEXT_COLORS.brass);
    this.addStat(g, 1, 'hud.crystals', String(startCrystals), TEXT_COLORS.crystal);
    this.addStat(g, 2, 'hud.wave', t('hud.waveValue', { current: 0, total: waves }), TEXT_COLORS.fg);
    this.addStat(g, 3, 'hud.lives', String(startLives), TEXT_COLORS.danger);
  }

  private addStat(
    g: Phaser.GameObjects.Graphics,
    index: number,
    label: StringKey,
    value: string,
    valueColor: string,
  ): Phaser.GameObjects.Text {
    const w = (GAME_W - STAT_PAD * 2 - STAT_GAP * (STAT_COUNT - 1)) / STAT_COUNT;
    const h = HUD_H - 8;
    const x = STAT_PAD + index * (w + STAT_GAP);
    const y = 4;

    g.fillStyle(COLORS.panel);
    g.lineStyle(1, COLORS.line);
    g.fillRoundedRect(x, y, w, h, 8);
    g.strokeRoundedRect(x, y, w, h, 8);

    this.add.text(x + 7, y + 3, t(label).toUpperCase(), {
      fontFamily: FONTS.body,
      fontSize: '9px',
      color: TEXT_COLORS.muted,
    });

    return this.add.text(x + 7, y + 13, value, {
      fontFamily: FONTS.display,
      fontSize: '14px',
      color: valueColor,
    });
  }
}
