import Phaser from 'phaser';
import { audio } from '../audio';
import { cats, getLevel, type ElementId, type LevelConfig } from '../data';
import { ANNOUNCE_FEEL, BANNER_FEEL, COIN_FEEL, METEOR_FEEL, RESULT_FEEL, STAT_FEEL, WAVE_BANNER_FEEL, type SoundId } from '../feel';
import { t, type StringKey } from '../i18n';
import {
  BOARD_H,
  BOARD_Y,
  COLORS,
  CONTROLS_H,
  CONTROLS_PAD,
  CONTROLS_Y,
  FONTS,
  GAME_H,
  GAME_W,
  HUD_H,
  HUD_PAD,
  MIN_TOUCH,
  PAUSE_MENU,
  pauseButtonCenter,
  pauseMenuButtonCenter,
  SUMMON_W,
  SUMMON_X,
  TEXT_COLORS,
} from '../layout';
import { progress } from '../progress';
import { Pool } from '../systems/Pool';
import { MAX_STARS } from '../systems/Progress';
import type { UpcomingWave } from '../systems/Waves';
import type { GameScene } from './GameScene';
import { GameEvent, SceneKey, type LevelResult, type LevelSceneData, type RewardDrop } from './keys';
import { bakeTexture } from './textures';
import { fadeIn, fadeOut } from './transitions';
import { addButton, addCoinIcon, addCrystalIcon, addPressFeel, addSoundToggle } from './widgets';

const STAT_GAP = 6;
const STAT_COUNT = 4;
/** Ширина одного показателя: полоса делится между ними и кнопкой паузы. */
const STAT_W = (GAME_W - HUD_PAD * 2 - MIN_TOUCH - STAT_GAP * STAT_COUNT) / STAT_COUNT;
const STAT_H = 40;
const STAT_Y = (HUD_H - STAT_H) / 2;
const STAT_LABEL_Y = 6;
const STAT_VALUE_Y = 17;
const HUD_TEXTURE = 'hud';

/** Левый край показателя с номером `index`. */
function statX(index: number): number {
  return HUD_PAD + index * (STAT_W + STAT_GAP);
}

/** Значок паузы: две полоски. */
const PAUSE_BAR = { width: 5, height: 16, gap: 6 };

const CONTROLS_GAP = 8;
const SUMMON_H = 44;
const SUMMON_PAD = 16;
const METEOR_W = GAME_W - CONTROLS_PAD * 2 - CONTROLS_GAP - SUMMON_W;
const METEOR_X = GAME_W - CONTROLS_PAD - METEOR_W / 2;
const METEOR_LABEL_Y = -8;
const METEOR_STATUS_Y = 11;
const COIN_RADIUS = 5;

const BANNER_W = 280;
const BANNER_H = 46;
const BANNER_Y = BOARD_Y + 8;

/** Баннер начала волны — над клетками. */
const WAVE_BANNER_Y = BOARD_Y + 100;
const WAVE_BANNER_H = 60;
const WAVE_BANNER_SUBTITLE_Y = 16;

/** Куда в счётчике прилетает монета: левый край числа. */
const COIN_TARGET_X = 6;

const RESULT_Y = BOARD_Y + BOARD_H / 2;
const RESULT_TEXT_W = 280;
const RESULT_BUTTON_W = 130;
const RESULT_BUTTON_H = 46;
const RESULT_BUTTON_GAP = 12;
const STAR_STEP = 44;

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
  /** Волна, начало которой уже объявлено баннером. */
  private startedWave = 0;
  private waveBanner: Phaser.GameObjects.Container | null = null;
  /** Летящие монеты и кристаллы берутся из пулов: за волну их сотни. */
  private coinPool!: Pool<Phaser.GameObjects.Image>;
  private crystalPool!: Pool<Phaser.GameObjects.Image>;
  /** Меню паузы, пока оно открыто. */
  private pauseMenu: Phaser.GameObjects.Container | null = null;

  constructor() {
    super(SceneKey.UI);
  }

  init(data: LevelSceneData): void {
    this.level = getLevel(data.levelId);
  }

  create(): void {
    fadeIn(this);
    // Полосы и рамки показателей не меняются — запекаются в одну картинку.
    bakeTexture(this, HUD_TEXTURE, GAME_W, GAME_H, (g) => {
      g.fillStyle(COLORS.bg);
      g.fillRect(0, 0, GAME_W, HUD_H);
      g.fillRect(0, CONTROLS_Y, GAME_W, CONTROLS_H);
      g.fillStyle(COLORS.panel);
      g.lineStyle(1, COLORS.line);
      for (let index = 0; index < STAT_COUNT; index++) {
        g.fillRoundedRect(statX(index), STAT_Y, STAT_W, STAT_H, 8);
        g.strokeRoundedRect(statX(index), STAT_Y, STAT_W, STAT_H, 8);
      }
    });
    this.add.image(0, 0, HUD_TEXTURE).setOrigin(0);

    // Стартовые запасы берутся из боя, а не из уровня: снаряжение их меняет.
    this.gameScene = this.scene.get(SceneKey.Game) as GameScene;
    const { gold, crystals, lives, wave, totalWaves } = this.gameScene.hudState();
    this.goldText = this.addStat(0, 'hud.gold', String(gold), TEXT_COLORS.brass);
    this.crystalsText = this.addStat(1, 'hud.crystals', String(crystals), TEXT_COLORS.crystal);
    const waveValue = t('hud.waveValue', { current: wave, total: totalWaves });
    this.waveText = this.addStat(2, 'hud.wave', waveValue, TEXT_COLORS.fg);
    this.livesText = this.addStat(3, 'hud.lives', String(lives), TEXT_COLORS.danger);

    this.announcedWave = 0;
    this.startedWave = wave;
    this.waveBanner = null;
    this.announce = this.add
      .text(GAME_W / 2, ANNOUNCE_Y, '', {
        fontFamily: FONTS.display,
        fontSize: '14px',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.coinPool = new Pool(() => addCoinIcon(this, 0, 0, COIN_FEEL.size));
    this.crystalPool = new Pool(() => addCrystalIcon(this, 0, 0, COIN_FEEL.crystalSize));
    this.addSummonButton();
    this.addMeteorButton();
    this.addPauseButton();
    this.pauseMenu = null;

    this.gameScene.events.on(GameEvent.Changed, this.refresh, this);
    this.gameScene.events.on(GameEvent.Discovered, this.showDiscovered, this);
    this.gameScene.events.on(GameEvent.Finished, this.showResult, this);
    this.gameScene.events.on(GameEvent.Reward, this.flyReward, this);
    // Игрок свернул игру или ушёл на другую вкладку: вернётся он в меню паузы, а не в идущий бой.
    const onVisibility = (): void => {
      if (document.hidden) this.openPause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', onVisibility);
      this.gameScene.events.off(GameEvent.Changed, this.refresh, this);
      this.gameScene.events.off(GameEvent.Discovered, this.showDiscovered, this);
      this.gameScene.events.off(GameEvent.Finished, this.showResult, this);
      this.gameScene.events.off(GameEvent.Reward, this.flyReward, this);
    });
    this.banner = null;
    this.refresh();
    this.refreshMeteor();

    // Ветка и сам модуль вырезаются из сборки для игроков.
    if (import.meta.env.DEV) {
      void import('../debug').then(({ addDebugButtons, addFpsCounter }) => {
        addDebugButtons(this, this.gameScene);
        addFpsCounter(this);
      });
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

    addPressFeel(this, this.summonBg, this.summonButton, () => this.canSummon);
    // Призыв по нажатию, а не по отпусканию: кнопку жмут часто и быстро.
    this.summonBg.on('pointerdown', () => {
      if (this.canSummon) this.gameScene.summon();
    });
  }

  private addPauseButton(): void {
    const bg = this.add
      .rectangle(0, 0, MIN_TOUCH, MIN_TOUCH, COLORS.panel)
      .setStrokeStyle(1, COLORS.line)
      .setName('pause')
      .setInteractive({ useHandCursor: true });
    const { width, height, gap } = PAUSE_BAR;
    const icon = this.add.graphics();
    icon.fillStyle(COLORS.range);
    icon.fillRect(-gap / 2 - width, -height / 2, width, height);
    icon.fillRect(gap / 2, -height / 2, width, height);
    const button = this.add.container(...pauseButtonCenter(), [bg, icon]);

    addPressFeel(this, bg, button);
    bg.on('pointerdown', () => audio.play('click'));
    bg.on('pointerup', () => this.openPause());
  }

  /** Останавливает бой и показывает меню паузы: «Продолжить», звук, «В меню». */
  private openPause(): void {
    if (this.pauseMenu || !this.gameScene.pauseBattle()) return;

    // Затемнение перехватывает касания, чтобы под меню ничего не нажималось.
    const dim = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, COLORS.bg, RESULT_FEEL.dimAlpha)
      .setInteractive();
    const title = this.add
      .text(GAME_W / 2, PAUSE_MENU.titleY, t('pause.title'), {
        fontFamily: FONTS.display,
        fontSize: '26px',
        color: TEXT_COLORS.fg,
      })
      .setOrigin(0.5);

    const { buttonW, buttonH } = PAUSE_MENU;
    const resume = addButton(this, ...pauseMenuButtonCenter(0), buttonW, buttonH, t('pause.resume'), true, () => {
      this.pauseMenu?.destroy();
      this.pauseMenu = null;
      this.gameScene.resumeBattle();
    });
    const sound = addSoundToggle(this, ...pauseMenuButtonCenter(1), buttonW, buttonH);
    const menu = addButton(this, ...pauseMenuButtonCenter(2), buttonW, buttonH, t('pause.menu'), false, () => {
      this.leaveToMenu();
    });

    this.pauseMenu = this.add.container(0, 0, [dim, title, resume, sound, menu]);
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

    addPressFeel(this, this.meteorBg, this.meteorButton, () => this.gameScene.meteorState().ready);
    // Повторное нажатие отменяет прицеливание.
    this.meteorBg.on('pointerdown', () => {
      if (!this.gameScene.meteorState().ready) return;
      audio.play('click');
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
    this.showWaveStart(wave);
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

  /**
   * Награда за врага разлетается монетами и кристаллами и летит в счётчики.
   * Полёт только для глаз: сами счётчики уже обновлены, а когда значок долетает, счётчик вздрагивает.
   */
  private flyReward({ x, y, gold, crystals }: RewardDrop): void {
    const screenY = y + BOARD_Y;
    const coins = Math.min(COIN_FEEL.maxCoins, Math.ceil(gold / COIN_FEEL.goldPerCoin));
    for (let i = 0; i < coins; i++) {
      this.flyIcon(this.coinPool, COIN_FEEL.size, x, screenY, this.goldText, i, 'coins');
    }
    // Кристаллы летят следом за монетами.
    for (let i = 0; i < Math.min(COIN_FEEL.maxCoins, crystals); i++) {
      this.flyIcon(this.crystalPool, COIN_FEEL.crystalSize, x, screenY, this.crystalsText, coins + i);
    }
  }

  /** Значок из пула отскакивает от врага в случайную сторону, затем летит в счётчик; `order` задаёт очерёдность вылета. */
  private flyIcon(
    pool: Pool<Phaser.GameObjects.Image>,
    size: number,
    x: number,
    y: number,
    counter: Phaser.GameObjects.Text,
    order: number,
    sound?: SoundId,
  ): void {
    const icon = pool.acquire().setPosition(x, y).setDisplaySize(size, size).setVisible(true);
    const angle = Math.random() * Math.PI * 2;
    const distance = COIN_FEEL.scatter * (0.5 + Math.random() * 0.5);
    this.tweens.chain({
      targets: icon,
      tweens: [
        {
          x: icon.x + Math.cos(angle) * distance,
          y: icon.y + Math.sin(angle) * distance,
          duration: COIN_FEEL.scatterMs,
          ease: COIN_FEEL.scatterEase,
        },
        {
          x: counter.x + COIN_TARGET_X,
          y: counter.y + counter.height / 2,
          scale: icon.scale * COIN_FEEL.endScale,
          delay: order * COIN_FEEL.staggerMs,
          duration: COIN_FEEL.flyMs,
          ease: COIN_FEEL.flyEase,
        },
      ],
      onComplete: () => {
        icon.setVisible(false);
        pool.release(icon);
        if (sound) audio.play(sound);
        this.pulseStat(counter);
      },
    });
  }

  /** Баннер «Волна N» в момент, когда волна началась; у волны с боссом — красный, с подписью. */
  private showWaveStart(wave: number): void {
    if (wave <= this.startedWave) return;
    this.startedWave = wave;
    if (this.waveBanner) {
      this.tweens.killTweensOf(this.waveBanner.list);
      this.tweens.killTweensOf(this.waveBanner);
      this.waveBanner.destroy();
    }

    const boss = this.level.bossWaves.includes(wave);
    const accent = boss ? COLORS.danger : COLORS.brass;
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.bg, WAVE_BANNER_FEEL.bgAlpha);
    bg.fillRect(-GAME_W / 2, -WAVE_BANNER_H / 2, GAME_W, WAVE_BANNER_H);
    bg.fillStyle(accent);
    bg.fillRect(-GAME_W / 2, -WAVE_BANNER_H / 2, GAME_W, 2);
    bg.fillRect(-GAME_W / 2, WAVE_BANNER_H / 2 - 2, GAME_W, 2);

    const title = this.add
      .text(0, boss ? -8 : 0, t('wave.start', { wave }), {
        fontFamily: FONTS.display,
        fontSize: '24px',
        color: boss ? TEXT_COLORS.danger : TEXT_COLORS.fg,
      })
      .setOrigin(0.5);
    const parts: Phaser.GameObjects.GameObject[] = [bg, title];
    if (boss) {
      parts.push(
        this.add
          .text(0, WAVE_BANNER_SUBTITLE_Y, t('wave.boss'), { fontFamily: FONTS.body, fontSize: '13px', color: TEXT_COLORS.fg })
          .setOrigin(0.5),
      );
    }

    const banner = this.add.container(GAME_W / 2, WAVE_BANNER_Y - WAVE_BANNER_FEEL.slide, parts).setAlpha(0);
    this.waveBanner = banner;
    const { showMs, showEase, holdMs, hideMs, textFromScale } = WAVE_BANNER_FEEL;
    this.tweens.add({ targets: banner, y: WAVE_BANNER_Y, alpha: 1, duration: showMs });
    this.tweens.add({ targets: title, scale: { from: textFromScale, to: 1 }, duration: showMs, ease: showEase });
    this.tweens.add({
      targets: banner,
      alpha: 0,
      delay: showMs + holdMs,
      duration: hideMs,
      onComplete: () => {
        banner.destroy();
        if (this.waveBanner === banner) this.waveBanner = null;
      },
    });
  }

  /** Обновляет счётчик; если значение изменилось, он вздрагивает. */
  private setStat(text: Phaser.GameObjects.Text, value: string): void {
    if (text.text === value) return;
    text.setText(value);
    this.pulseStat(text);
  }

  private pulseStat(text: Phaser.GameObjects.Text): void {
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
    audio.play(result.won ? 'win' : 'lose');
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
    const menu = this.addResultButton(GAME_W / 2 - offset, 'result.menu', false, () => this.leaveToMenu());
    // GameScene при запуске сама перезапускает HUD.
    const retry = this.addResultButton(GAME_W / 2 + offset, 'result.retry', true, () => {
      fadeOut(this, () => this.gameScene.scene.restart(data));
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

  private leaveToMenu(): void {
    progress.flush();
    fadeOut(this, () => {
      this.scene.stop(SceneKey.Game);
      this.scene.start(SceneKey.Menu);
    });
  }

  private resultText(result: LevelResult): string {
    if (!result.won) return t('result.reached', { wave: result.wave, total: result.totalWaves });
    const lines = [result.livesLost === 0 ? t('result.noLosses') : t('result.livesLost', { lost: result.livesLost })];
    if (result.stars < MAX_STARS) lines.push(t('result.starsHint'));
    return lines.join('\n');
  }

  private addResultButton(x: number, label: StringKey, primary: boolean, onClick: () => void): Phaser.GameObjects.Container {
    return addButton(this, x, RESULT_Y + 78, RESULT_BUTTON_W, RESULT_BUTTON_H, t(label), primary, onClick);
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

  private addStat(index: number, label: StringKey, value: string, valueColor: string): Phaser.GameObjects.Text {
    const x = statX(index);
    const y = STAT_Y;

    this.add.text(x + 7, y + STAT_LABEL_Y, t(label).toUpperCase(), {
      fontFamily: FONTS.body,
      fontSize: '9px',
      color: TEXT_COLORS.muted,
    });

    return this.add.text(x + 7, y + STAT_VALUE_Y, value, {
      fontFamily: FONTS.display,
      fontSize: '14px',
      color: valueColor,
    });
  }
}
