import Phaser from 'phaser';
import { getLevel, type LevelConfig } from '../data';
import { t, type StringKey } from '../i18n';
import { COLORS, CONTROLS_H, CONTROLS_Y, FONTS, GAME_W, HUD_H, TEXT_COLORS } from '../layout';
import type { GameScene } from './GameScene';
import { GameEvent, SceneKey, type LevelSceneData } from './keys';

const STAT_PAD = 6;
const STAT_GAP = 6;
const STAT_COUNT = 4;

const SUMMON_W = 200;
const SUMMON_H = 44;
const SUMMON_PAD = 16;
const COIN_RADIUS = 5;

/** HUD поверх GameScene: показатели уровня и кнопка призыва. */
export class UIScene extends Phaser.Scene {
  private level!: LevelConfig;
  private gameScene!: GameScene;
  private goldText!: Phaser.GameObjects.Text;
  private summonButton!: Phaser.GameObjects.Container;
  private summonBg!: Phaser.GameObjects.Rectangle;
  private summonLabel!: Phaser.GameObjects.Text;
  private summonCost!: Phaser.GameObjects.Text;
  private summonCoin!: Phaser.GameObjects.Arc;
  private canSummon = false;

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
    this.goldText = this.addStat(g, 0, 'hud.gold', String(startGold), TEXT_COLORS.brass);
    this.addStat(g, 1, 'hud.crystals', String(startCrystals), TEXT_COLORS.crystal);
    this.addStat(g, 2, 'hud.wave', t('hud.waveValue', { current: 0, total: waves }), TEXT_COLORS.fg);
    this.addStat(g, 3, 'hud.lives', String(startLives), TEXT_COLORS.danger);

    this.addSummonButton();

    this.gameScene = this.scene.get(SceneKey.Game) as GameScene;
    this.gameScene.events.on(GameEvent.Changed, this.refresh, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.gameScene.events.off(GameEvent.Changed, this.refresh, this);
    });
    this.refresh();
  }

  private addSummonButton(): void {
    this.summonBg = this.add
      .rectangle(0, 0, SUMMON_W, SUMMON_H, COLORS.brass)
      .setInteractive({ useHandCursor: true });

    this.summonLabel = this.add
      .text(-SUMMON_W / 2 + SUMMON_PAD, 0, t('summon.button'), {
        fontFamily: FONTS.display,
        fontSize: '16px',
        color: TEXT_COLORS.dark,
      })
      .setOrigin(0, 0.5);

    this.summonCost = this.add
      .text(SUMMON_W / 2 - SUMMON_PAD, 0, '', {
        fontFamily: FONTS.display,
        fontSize: '16px',
        color: TEXT_COLORS.dark,
      })
      .setOrigin(1, 0.5);

    this.summonCoin = this.add.circle(0, 0, COIN_RADIUS, COLORS.bg);

    this.summonButton = this.add.container(GAME_W / 2, CONTROLS_Y + CONTROLS_H / 2, [
      this.summonBg,
      this.summonLabel,
      this.summonCost,
      this.summonCoin,
    ]);

    // Призыв по нажатию, а не по отпусканию: кнопку жмут часто и быстро.
    this.summonBg.on('pointerdown', () => {
      if (!this.canSummon) return;
      this.tweens.killTweensOf(this.summonButton);
      this.summonButton.setScale(1);
      this.tweens.add({ targets: this.summonButton, scale: 0.94, duration: 70, yoyo: true });
      this.gameScene.summon();
    });
  }

  private refresh(): void {
    const { gold, summonCost, canSummon } = this.gameScene.hudState();
    this.canSummon = canSummon;

    this.goldText.setText(String(gold));
    this.summonCost.setText(String(summonCost));
    this.summonCoin.setX(this.summonCost.x - this.summonCost.width - COIN_RADIUS - 4);

    const textColor = canSummon ? TEXT_COLORS.dark : TEXT_COLORS.muted;
    this.summonBg.setFillStyle(canSummon ? COLORS.brass : COLORS.panel);
    this.summonBg.setStrokeStyle(1, COLORS.line, canSummon ? 0 : 1);
    this.summonLabel.setColor(textColor);
    this.summonCost.setColor(textColor);
    this.summonCoin.setFillStyle(canSummon ? COLORS.bg : COLORS.line);
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
