import Phaser from 'phaser';
import { cats, getLevel, type ElementId, type LevelConfig } from '../data';
import { ANNOUNCE_FEEL, BANNER_FEEL, BUTTON_FEEL, METEOR_FEEL, RESULT_FEEL, STAT_FEEL } from '../feel';
import { t, type StringKey } from '../i18n';
import { BOARD_H, BOARD_Y, COLORS, CONTROLS_H, CONTROLS_Y, FONTS, GAME_W, HUD_H, TEXT_COLORS } from '../layout';
import type { UpcomingWave } from '../systems/Waves';
import type { GameScene } from './GameScene';
import { GameEvent, SceneKey, type LevelResult, type LevelSceneData } from './keys';

const STAT_PAD = 6;
const STAT_GAP = 6;
const STAT_COUNT = 4;

// Нижняя полоса: «Призвать» слева, «Метеор» справа.
const CONTROLS_PAD = 8;
const CONTROLS_GAP = 8;
const SUMMON_W = 204;
const SUMMON_H = 44;
const SUMMON_PAD = 16;
const SUMMON_X = CONTROLS_PAD + SUMMON_W / 2;
const METEOR_W = GAME_W - CONTROLS_PAD * 2 - CONTROLS_GAP - SUMMON_W;
const METEOR_X = GAME_W - CONTROLS_PAD - METEOR_W / 2;
const METEOR_LABEL_Y = -8;
const METEOR_STATUS_Y = 11;
const COIN_RADIUS = 5;

const BANNER_W = 280;
const BANNER_H = 46;
const BANNER_Y = BOARD_Y + 8;

const RESULT_Y = BOARD_Y + BOARD_H / 2;
const RESULT_TEXT_W = 280;
const RESULT_BUTTON_W = 130;
const RESULT_BUTTON_H = 46;
const RESULT_BUTTON_GAP = 12;
const STAR_STEP = 44;
const MAX_STARS = 3;

const ANNOUNCE_BG = `rgba(27, 34, 51, ${ANNOUNCE_FEEL.bgAlpha})`;

/** Объявление волны — между клетками и нижним отрезком дороги, чтобы не закрывать котов. */
const ANNOUNCE_Y = CONTROLS_Y - 86;

/** HUD поверх GameScene: показатели уровня, кнопки призыва и метеора. */
export class UIScene extends Phaser.Scene {
  private level!: LevelConfig;
  private gameScene!: GameScene;
  private goldText!: Phaser.GameObjects.Text;
  private crystalsText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private announce!: Phaser.GameObjects.Text;
  /** Волна, объявление о которой сейчас на экране; 0 — объявления нет. */
  private announcedWave = 0;
  private banner: Phaser.GameObjects.Container | null = null;
  private summonButton!: Phaser.GameObjects.Container;
  private summonBg!: Phaser.GameObjects.Rectangle;
  private summonLabel!: Phaser.GameObjects.Text;
  private summonCost!: Phaser.GameObjects.Text;
  private summonCoin!: Phaser.GameObjects.Arc;
  private canSummon = false;
  private meteorButton!: Phaser.GameObjects.Container;
  private meteorBg!: Phaser.GameObjects.Rectangle;
  /** Заполняется слева направо, пока идёт перезарядка. */
  private meteorFill!: Phaser.GameObjects.Rectangle;
  private meteorLabel!: Phaser.GameObjects.Text;
  private meteorStatus!: Phaser.GameObjects.Text;
  /** Состояние кнопки метеора, уже показанное на экране. */
  private shownMeteor = '';

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
    this.waveText = this.addStat(g, 2, 'hud.wave', t('hud.waveValue', { current: 0, total: waves }), TEXT_COLORS.fg);
    this.livesText = this.addStat(g, 3, 'hud.lives', String(startLives), TEXT_COLORS.danger);

    this.announcedWave = 0;
    this.announce = this.add
      .text(GAME_W / 2, ANNOUNCE_Y, '', {
        fontFamily: FONTS.display,
        fontSize: '14px',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.addSummonButton();
    this.addMeteorButton();

    this.gameScene = this.scene.get(SceneKey.Game) as GameScene;
    this.gameScene.events.on(GameEvent.Changed, this.refresh, this);
    this.gameScene.events.on(GameEvent.Discovered, this.showDiscovered, this);
    this.gameScene.events.on(GameEvent.Finished, this.showResult, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.gameScene.events.off(GameEvent.Changed, this.refresh, this);
      this.gameScene.events.off(GameEvent.Discovered, this.showDiscovered, this);
      this.gameScene.events.off(GameEvent.Finished, this.showResult, this);
    });
    this.banner = null;
    this.refresh();
    this.refreshMeteor();

    // Ветка и сам модуль вырезаются из сборки для игроков.
    if (import.meta.env.DEV) {
      void import('../debug').then(({ addDebugButtons }) => addDebugButtons(this, this.gameScene));
    }
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

    this.summonButton = this.add.container(SUMMON_X, CONTROLS_Y + CONTROLS_H / 2, [
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

  private addMeteorButton(): void {
    this.meteorBg = this.add.rectangle(0, 0, METEOR_W, SUMMON_H, COLORS.meteor).setInteractive({ useHandCursor: true });
    this.meteorFill = this.add
      .rectangle(-METEOR_W / 2, 0, METEOR_W, SUMMON_H, COLORS.meteor, METEOR_FEEL.buttonFillAlpha)
      .setOrigin(0, 0.5);

    this.meteorLabel = this.add
      .text(0, METEOR_LABEL_Y, t('meteor.button'), {
        fontFamily: FONTS.display,
        fontSize: '15px',
        color: TEXT_COLORS.dark,
      })
      .setOrigin(0.5);
    this.meteorStatus = this.add
      .text(0, METEOR_STATUS_Y, '', {
        fontFamily: FONTS.body,
        fontSize: '11px',
        color: TEXT_COLORS.dark,
      })
      .setOrigin(0.5);

    this.meteorButton = this.add.container(METEOR_X, CONTROLS_Y + CONTROLS_H / 2, [
      this.meteorBg,
      this.meteorFill,
      this.meteorLabel,
      this.meteorStatus,
    ]);
    this.shownMeteor = '';

    // Повторное нажатие отменяет прицеливание.
    this.meteorBg.on('pointerdown', () => {
      if (!this.gameScene.meteorState().ready) return;
      this.tweens.killTweensOf(this.meteorButton);
      this.meteorButton.setScale(1);
      this.tweens.add({
        targets: this.meteorButton,
        scale: BUTTON_FEEL.pressScale,
        duration: BUTTON_FEEL.pressMs,
        yoyo: true,
      });
      this.gameScene.toggleMeteorAim();
      this.refreshMeteor();
    });
  }

  update(): void {
    this.refreshMeteor();
  }

  /** Кнопка метеора: готов, идёт перезарядка (полоса и секунды) или прицеливание. */
  private refreshMeteor(): void {
    const { ready, aiming, remaining, progress } = this.gameScene.meteorState();
    this.meteorFill.setScale(progress, 1);

    const seconds = Math.ceil(remaining);
    const shown = `${ready}:${aiming}:${seconds}`;
    if (shown === this.shownMeteor) return;
    this.shownMeteor = shown;

    this.meteorFill.setVisible(!ready);
    this.meteorBg.setFillStyle(ready ? COLORS.meteor : COLORS.panel);
    this.meteorBg.setStrokeStyle(
      aiming ? METEOR_FEEL.buttonAimStroke : 1,
      aiming ? COLORS.range : COLORS.line,
      aiming || !ready ? 1 : 0,
    );
    this.meteorLabel.setColor(ready ? TEXT_COLORS.dark : TEXT_COLORS.muted);
    this.meteorStatus
      .setColor(ready ? TEXT_COLORS.dark : TEXT_COLORS.fg)
      .setText(aiming ? t('meteor.aim') : ready ? t('meteor.ready') : t('meteor.cooldown', { seconds }));
  }

  private refresh(): void {
    const { gold, crystals, summonCost, canSummon, lives, wave, totalWaves, upcoming } = this.gameScene.hudState();
    this.canSummon = canSummon;

    this.goldText.setText(String(gold));
    this.setStat(this.crystalsText, String(crystals));
    this.setStat(this.waveText, t('hud.waveValue', { current: wave, total: totalWaves }));
    this.setStat(this.livesText, String(lives));
    this.showUpcoming(upcoming);
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

  /** Показывает объявление, пока идёт пауза перед волной, и прячет его с началом волны. */
  private showUpcoming(upcoming: UpcomingWave | null): void {
    const wave = upcoming?.wave ?? 0;
    if (wave === this.announcedWave) return;
    this.announcedWave = wave;
    this.tweens.killTweensOf(this.announce);

    if (!upcoming) {
      this.tweens.add({ targets: this.announce, alpha: 0, duration: ANNOUNCE_FEEL.hideMs });
      return;
    }
    this.announce
      .setText(t(upcoming.boss ? 'wave.bossSoon' : 'wave.soon', { wave }))
      .setColor(upcoming.boss ? TEXT_COLORS.danger : TEXT_COLORS.fg)
      .setBackgroundColor(ANNOUNCE_BG);
    this.tweens.add({ targets: this.announce, alpha: 1, duration: ANNOUNCE_FEEL.showMs });
  }

  /** Экран поверх поля: победа со звёздами или поражение, кнопки «Ещё раз» и «В меню». */
  private showResult(result: LevelResult): void {
    this.tweens.killTweensOf(this.announce);
    this.announce.setAlpha(0);
    // Кнопки появляются вместе с экраном: случайное касание во время паузы ничего не нажмёт.
    this.time.delayedCall(RESULT_FEEL.delayMs, () => this.buildResult(result));
  }

  private buildResult(result: LevelResult): void {
    // Затемнение перехватывает касания, чтобы под экраном ничего не нажималось.
    const dim = this.add
      .rectangle(GAME_W / 2, RESULT_Y, GAME_W, BOARD_H, COLORS.bg, RESULT_FEEL.dimAlpha)
      .setInteractive();

    const title = this.add
      .text(GAME_W / 2, RESULT_Y - 96, t(result.won ? 'result.win' : 'result.lose'), {
        fontFamily: FONTS.display,
        fontSize: '26px',
        color: TEXT_COLORS.fg,
      })
      .setOrigin(0.5);

    const stars: Phaser.GameObjects.Star[] = [];
    if (result.won) {
      for (let i = 0; i < MAX_STARS; i++) {
        const earned = i < result.stars;
        const x = GAME_W / 2 + (i - (MAX_STARS - 1) / 2) * STAR_STEP;
        stars.push(this.add.star(x, RESULT_Y - 44, 5, 8, 17, earned ? COLORS.brass : COLORS.line));
      }
    }

    const detail = this.add
      .text(GAME_W / 2, RESULT_Y + 6, this.resultText(result), {
        fontFamily: FONTS.body,
        fontSize: '14px',
        color: TEXT_COLORS.muted,
        align: 'center',
        wordWrap: { width: RESULT_TEXT_W },
      })
      .setOrigin(0.5);

    const data: LevelSceneData = { levelId: this.level.id };
    const offset = (RESULT_BUTTON_W + RESULT_BUTTON_GAP) / 2;
    const menu = this.addResultButton(GAME_W / 2 - offset, 'result.menu', false, () => {
      this.scene.stop(SceneKey.Game);
      this.scene.start(SceneKey.Menu);
    });
    // GameScene при запуске сама перезапускает HUD.
    const retry = this.addResultButton(GAME_W / 2 + offset, 'result.retry', true, () => {
      this.gameScene.scene.restart(data);
    });

    const overlay = this.add.container(0, 0, [dim, title, ...stars, detail, menu, retry]).setAlpha(0);
    this.tweens.add({ targets: overlay, alpha: 1, duration: RESULT_FEEL.showMs });

    // Заработанные звёзды выскакивают по одной.
    stars.slice(0, result.stars).forEach((star, i) => {
      star.setScale(0);
      this.tweens.add({
        targets: star,
        scale: 1,
        delay: RESULT_FEEL.showMs + i * RESULT_FEEL.starDelayMs,
        duration: RESULT_FEEL.starMs,
        ease: RESULT_FEEL.starEase,
      });
    });
  }

  private resultText(result: LevelResult): string {
    if (!result.won) return t('result.reached', { wave: result.wave, total: result.totalWaves });
    const lines = [result.livesLost === 0 ? t('result.noLosses') : t('result.livesLost', { lost: result.livesLost })];
    if (result.stars < MAX_STARS) lines.push(t('result.starsHint'));
    return lines.join('\n');
  }

  private addResultButton(x: number, label: StringKey, primary: boolean, onClick: () => void): Phaser.GameObjects.Container {
    const bg = this.add
      .rectangle(0, 0, RESULT_BUTTON_W, RESULT_BUTTON_H, primary ? COLORS.brass : COLORS.panel)
      .setStrokeStyle(1, COLORS.line, primary ? 0 : 1)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(0, 0, t(label), {
        fontFamily: FONTS.display,
        fontSize: '15px',
        color: primary ? TEXT_COLORS.dark : TEXT_COLORS.fg,
      })
      .setOrigin(0.5);
    const button = this.add.container(x, RESULT_Y + 78, [bg, text]);

    bg.on('pointerdown', () => {
      this.tweens.add({ targets: button, scale: BUTTON_FEEL.pressScale, duration: BUTTON_FEEL.pressMs, yoyo: true });
    });
    bg.once('pointerup', onClick);
    return button;
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
