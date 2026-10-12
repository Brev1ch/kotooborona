import Phaser from 'phaser';
import { cats, getLevel, type ElementId, type LevelConfig } from '../data';
import { BANNER_FEEL, BUTTON_FEEL, STAT_FEEL } from '../feel';
import { t, type StringKey } from '../i18n';
import { BOARD_Y, COLORS, CONTROLS_H, CONTROLS_Y, FONTS, GAME_W, HUD_H, TEXT_COLORS } from '../layout';
import type { GameScene } from './GameScene';
import { GameEvent, SceneKey, type LevelSceneData } from './keys';

const STAT_PAD = 6;
const STAT_GAP = 6;
const STAT_COUNT = 4;

const SUMMON_W = 200;
const SUMMON_H = 44;
const SUMMON_PAD = 16;
const COIN_RADIUS = 5;

const BANNER_W = 280;
const BANNER_H = 46;
const BANNER_Y = BOARD_Y + 8;

/** HUD поверх GameScene: показатели уровня и кнопка призыва. */
export class UIScene extends Phaser.Scene {
  private level!: LevelConfig;
  private gameScene!: GameScene;
  private goldText!: Phaser.GameObjects.Text;
  private crystalsText!: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Container | null = null;
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
    this.crystalsText = this.addStat(g, 1, 'hud.crystals', String(startCrystals), TEXT_COLORS.crystal);
    this.addStat(g, 2, 'hud.wave', t('hud.waveValue', { current: 0, total: waves }), TEXT_COLORS.fg);
    this.addStat(g, 3, 'hud.lives', String(startLives), TEXT_COLORS.danger);

    this.addSummonButton();

    this.gameScene = this.scene.get(SceneKey.Game) as GameScene;
    this.gameScene.events.on(GameEvent.Changed, this.refresh, this);
    this.gameScene.events.on(GameEvent.Discovered, this.showDiscovered, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.gameScene.events.off(GameEvent.Changed, this.refresh, this);
      this.gameScene.events.off(GameEvent.Discovered, this.showDiscovered, this);
    });
    this.banner = null;
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
      this.tweens.add({
        targets: this.summonButton,
        scale: BUTTON_FEEL.pressScale,
        duration: BUTTON_FEEL.pressMs,
        yoyo: true,
      });
      this.gameScene.summon();
    });
  }

  private refresh(): void {
    const { gold, crystals, summonCost, canSummon } = this.gameScene.hudState();
    this.canSummon = canSummon;

    this.goldText.setText(String(gold));
    this.setStat(this.crystalsText, String(crystals));
    this.summonCost.setText(String(summonCost));
    this.summonCoin.setX(this.summonCost.x - this.summonCost.width - COIN_RADIUS - 4);

    const textColor = canSummon ? TEXT_COLORS.dark : TEXT_COLORS.muted;
    this.summonBg.setFillStyle(canSummon ? COLORS.brass : COLORS.panel);
    this.summonBg.setStrokeStyle(1, COLORS.line, canSummon ? 0 : 1);
    this.summonLabel.setColor(textColor);
    this.summonCost.setColor(textColor);
    this.summonCoin.setFillStyle(canSummon ? COLORS.bg : COLORS.line);
  }

  /** Обновляет счётчик; если значение изменилось, он вздрагивает. */
  private setStat(text: Phaser.GameObjects.Text, value: string): void {
    if (text.text === value) return;
    text.setText(value);
    this.tweens.killTweensOf(text);
    text.setScale(1);
    this.tweens.add({
      targets: text,
      scale: STAT_FEEL.pulseScale,
      duration: STAT_FEEL.pulseMs,
      yoyo: true,
    });
  }

  /** Уведомление вверху поля: игрок впервые получил гибрида. */
  private showDiscovered(element: ElementId): void {
    if (this.banner) {
      this.tweens.killTweensOf(this.banner);
      this.banner.destroy();
    }

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.bg);
    bg.lineStyle(1, COLORS.line);
    bg.fillRoundedRect(-BANNER_W / 2, 0, BANNER_W, BANNER_H, 10);
    bg.strokeRoundedRect(-BANNER_W / 2, 0, BANNER_W, BANNER_H, 10);

    const title = this.add
      .text(0, 8, t('book.discovered', { name: t(`cat.${element}`) }), {
        fontFamily: FONTS.display,
        fontSize: '13px',
        color: cats.elements[element].color,
      })
      .setOrigin(0.5, 0);
    const desc = this.add
      .text(0, 27, t(`cat.${element}.desc`), {
        fontFamily: FONTS.body,
        fontSize: '11px',
        color: TEXT_COLORS.fg,
      })
      .setOrigin(0.5, 0);

    const banner = this.add.container(GAME_W / 2, BANNER_Y - BANNER_FEEL.slide, [bg, title, desc]).setAlpha(0);
    this.banner = banner;

    this.tweens.add({
      targets: banner,
      y: BANNER_Y,
      alpha: 1,
      duration: BANNER_FEEL.showMs,
      ease: BANNER_FEEL.showEase,
    });
    this.tweens.add({
      targets: banner,
      alpha: 0,
      delay: BANNER_FEEL.showMs + BANNER_FEEL.holdMs,
      duration: BANNER_FEEL.hideMs,
      onComplete: () => {
        banner.destroy();
        if (this.banner === banner) this.banner = null;
      },
    });
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
