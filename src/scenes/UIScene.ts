import Phaser from 'phaser';
import { adBreaks } from '../adBreaks';
import { audio } from '../audio';
import { ads, cats, getLevel, levels, type ElementId, type LevelConfig } from '../data';
import {
  ANNOUNCE_FEEL,
  BANNER_FEEL,
  COIN_FEEL,
  METEOR_FEEL,
  RESULT_FEEL,
  SELL_FEEL,
  STAT_FEEL,
  WAVE_BANNER_FEEL,
  type SoundId,
} from '../feel';
import { t, type StringKey } from '../i18n';
import {
  BOARD_H,
  BOARD_Y,
  BUILD_W,
  BUILD_X,
  COIN_AD_W,
  COIN_AD_X,
  COLORS,
  CONTROLS_CENTER_Y,
  DRAG_GHOST_MAX_Y,
  CONTROLS_H,
  CONTROLS_PAD,
  CONTROLS_Y,
  FONTS,
  GAME_H,
  GAME_W,
  HUD_BUTTON_GAP,
  HUD_GAP,
  HUD_H,
  HUD_PAD,
  METEOR_W,
  METEOR_X,
  MIN_TOUCH,
  PAUSE_MENU,
  pauseButtonCenter,
  pauseMenuButtonCenter,
  RESULT,
  RESULT_Y,
  resultAdCenter,
  resultButtonCenter,
  speedButtonCenter,
  SUMMON_W,
  SUMMON_X,
  TEXT_COLORS,
} from '../layout';
import { isCat } from '../entities/Building';
import { BuildingView } from '../entities/BuildingView';
import { CatView } from '../entities/CatView';
import type { PieceView } from '../entities/PieceView';
import { progress } from '../progress';
import { nextLevelId } from '../systems/Campaign';
import { Pool } from '../systems/Pool';
import { MAX_STARS } from '../systems/Progress';
import { Tutorial } from '../systems/Tutorial';
import type { UpcomingWave } from '../systems/Waves';
import type { GameScene } from './GameScene';
import { BuildPanel } from './BuildPanel';
import { GameEvent, SceneKey, type DragGhost, type LevelResult, type LevelSceneData, type RewardDrop, type SellOffer } from './keys';
import { addBakedShape, bakeTexture } from './textures';
import { fadeIn, fadeOut } from './transitions';
import { TutorialOverlay } from './TutorialOverlay';
import { addAdButton, addButton, addCoinIcon, addCrystalIcon, addFishIcon, addPressFeel, addSoundToggle } from './widgets';

const STAT_GAP = HUD_GAP;
/** Доли ширины показателей — монеты, кристаллы, волна, жизни: длинной подписи «Кристаллы» и числу волн «10/11» нужно больше места. */
const STAT_SHARES = [54, 69, 59, 48];
/** Что остаётся показателям: полоса без краёв, двух кнопок справа и промежутков. */
const STATS_W = GAME_W - HUD_PAD * 2 - MIN_TOUCH * 2 - STAT_GAP * STAT_SHARES.length - HUD_BUTTON_GAP;
const SHARES_SUM = STAT_SHARES.reduce((sum, share) => sum + share, 0);

/** Ширина показателя с номером `index`. */
function statW(index: number): number {
  return (STATS_W * STAT_SHARES[index]) / SHARES_SUM;
}
const STAT_H = 40;
const STAT_Y = (HUD_H - STAT_H) / 2;
const STAT_LABEL_Y = 6;
const STAT_VALUE_Y = 17;
const HUD_TEXTURE = 'hud';

/** Левый край показателя с номером `index`. */
function statX(index: number): number {
  let x = HUD_PAD;
  for (let before = 0; before < index; before++) x += statW(before) + STAT_GAP;
  return x;
}

/** Значок паузы: две полоски. */
const PAUSE_BAR = { width: 5, height: 16, gap: 6 };

const SUMMON_H = 44;
const SUMMON_PAD = 10;
// Две строки кнопки призыва: название, под ним — остаток лимита слева и цена справа.
const SUMMON_LABEL_Y = -8;
const SUMMON_LIMIT_Y = 11;
const METEOR_LABEL_Y = -8;
const METEOR_STATUS_Y = 11;
const COIN_RADIUS = 4;
/** Значок кнопки «Строить» и зона продажи на месте нижней полосы. */
const BUILD_ICON = 28;
const SELL_COIN = 14;

const BANNER_W = 280;
const BANNER_H = 46;
const BANNER_Y = BOARD_Y + 8;

/** Баннер начала волны — над клетками. */
const WAVE_BANNER_Y = BOARD_Y + 100;
const WAVE_BANNER_H = 60;
const WAVE_BANNER_SUBTITLE_Y = 16;

/** Куда в счётчике прилетает монета: левый край числа. */
const COIN_TARGET_X = 6;

const STAR_STEP = 44;
/** Строка награды на экране победы: подпись, рыбка, число. */
const REWARD_ICON = 22;
const REWARD_GAP = 6;

/** Кнопка «монеты за рекламу»: сверху награда с монетой, снизу — «за рекламу» или секунды до следующего показа. */
const COIN_AD_TOP_Y = -8;
const COIN_AD_BOTTOM_Y = 11;
const COIN_AD_ICON = 11;

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
  /** Вторая строка кнопки: остаток призывов волны или штраф за призыв сверх лимита. */
  private summonLimit!: Phaser.GameObjects.Text;
  private summonCoin!: Phaser.GameObjects.Arc;
  private canSummon = false;
  private speedBg!: Phaser.GameObjects.Rectangle;
  private speedLabel!: Phaser.GameObjects.Text;
  private buildPanel: BuildPanel | null = null;
  /** Кнопки нижней полосы: прячутся, пока игрок держит кота или строение. */
  private controls: Phaser.GameObjects.Container[] = [];
  private sellZone: Phaser.GameObjects.Container | null = null;
  private sellBg!: Phaser.GameObjects.Rectangle;
  /** Кот или строение в руке игрока: рисуется здесь, поверх поля и нижней полосы. */
  private ghost: PieceView | null = null;
  private sellLabel!: Phaser.GameObjects.Text;
  private sellCoin!: Phaser.GameObjects.Image;
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
  private coinAdBg!: Phaser.GameObjects.Rectangle;
  private coinAdAmount!: Phaser.GameObjects.Text;
  private coinAdStatus!: Phaser.GameObjects.Text;
  /** Состояние кнопки рекламы, уже показанное на экране. */
  private shownCoinAd = '';
  /** Экран победы или поражения, пока он открыт. */
  private resultOverlay: Phaser.GameObjects.Container | null = null;
  /** Идёт ролик с наградой: второй не запускаем. */
  private adBusy = false;
  private resultWon = false;
  /** Обучение: есть только на уровнях с подсказками и пока уровень не пройден. */
  private tutorial: Tutorial | null = null;
  private tutorialOverlay: TutorialOverlay | null = null;
  /** Игрок уже уходит с экрана итога: кнопки больше не действуют. */
  private leaving = false;

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
      for (let index = 0; index < STAT_SHARES.length; index++) {
        g.fillRoundedRect(statX(index), STAT_Y, statW(index), STAT_H, 8);
        g.strokeRoundedRect(statX(index), STAT_Y, statW(index), STAT_H, 8);
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
    this.buildPanel = new BuildPanel(this, this.gameScene);
    this.controls = [this.addSummonButton(), this.addBuildButton(), this.addMeteorButton(), this.addCoinAdButton()];
    this.addSellZone();
    this.addSpeedButton();
    this.addPauseButton();
    this.pauseMenu = null;
    // Подсказки нужны, только пока уровень не пройден: вернувшийся за звёздами игрок уже всё умеет.
    const learning = this.level.tutorial !== undefined && progress.stars(this.level.id) === 0;
    this.tutorial = learning && this.level.tutorial ? new Tutorial(this.level.tutorial.steps, levels.tutorial) : null;
    this.tutorialOverlay = this.tutorial ? new TutorialOverlay(this, this.level) : null;
    this.resultOverlay = null;
    this.adBusy = false;
    this.leaving = false;

    this.gameScene.events.on(GameEvent.Changed, this.refresh, this);
    this.gameScene.events.on(GameEvent.Discovered, this.showDiscovered, this);
    this.gameScene.events.on(GameEvent.Finished, this.showResult, this);
    this.gameScene.events.on(GameEvent.Reward, this.flyReward, this);
    this.gameScene.events.on(GameEvent.SellOffer, this.showSellOffer, this);
    this.gameScene.events.on(GameEvent.BuildingTapped, this.openUpgrade, this);
    this.gameScene.events.on(GameEvent.DragMove, this.moveGhost, this);
    this.gameScene.events.on(GameEvent.DragEnd, this.dropGhost, this);
    this.ghost = null;
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
      this.gameScene.events.off(GameEvent.SellOffer, this.showSellOffer, this);
      this.gameScene.events.off(GameEvent.BuildingTapped, this.openUpgrade, this);
      this.gameScene.events.off(GameEvent.DragMove, this.moveGhost, this);
      this.gameScene.events.off(GameEvent.DragEnd, this.dropGhost, this);
    });
    this.banner = null;
    this.refresh();
    this.refreshMeteor();
    this.refreshCoinAd();

    // Ветка и сам модуль вырезаются из сборки для игроков.
    if (import.meta.env.DEV) {
      // Модуль догружается не сразу: если бой за это время закрыли, ставить кнопки уже некуда.
      let open = true;
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (open = false));
      void import('../debug').then(({ addDebugButtons, addFpsCounter }) => {
        if (!open) return;
        addDebugButtons(this, this.gameScene);
        addFpsCounter(this);
      });
    }
  }

  private addSummonButton(): Phaser.GameObjects.Container {
    this.summonBg = this.add
      .rectangle(0, 0, SUMMON_W, SUMMON_H, COLORS.brass)
      .setInteractive({ useHandCursor: true });

    this.summonLabel = this.add
      .text(-SUMMON_W / 2 + SUMMON_PAD, SUMMON_LABEL_Y, t('summon.button'), {
        fontFamily: FONTS.display,
        fontSize: '16px',
        color: TEXT_COLORS.dark,
      })
      .setOrigin(0, 0.5);

    this.summonLimit = this.add
      .text(-SUMMON_W / 2 + SUMMON_PAD, SUMMON_LIMIT_Y, '', {
        fontFamily: FONTS.body,
        fontSize: '11px',
        color: TEXT_COLORS.dark,
      })
      .setOrigin(0, 0.5);

    this.summonCost = this.add
      .text(SUMMON_W / 2 - SUMMON_PAD, SUMMON_LIMIT_Y, '', {
        fontFamily: FONTS.display,
        fontSize: '13px',
        color: TEXT_COLORS.dark,
      })
      .setOrigin(1, 0.5);

    this.summonCoin = this.add.circle(0, SUMMON_LIMIT_Y, COIN_RADIUS, COLORS.bg);

    this.summonButton = this.add.container(SUMMON_X, CONTROLS_CENTER_Y, [
      this.summonBg,
      this.summonLabel,
      this.summonLimit,
      this.summonCost,
      this.summonCoin,
    ]);

    addPressFeel(this, this.summonBg, this.summonButton, () => this.canSummon);
    // Призыв по нажатию, а не по отпусканию: кнопку жмут часто и быстро.
    this.summonBg.on('pointerdown', () => {
      if (this.canSummon) this.gameScene.summon();
    });
    return this.summonButton;
  }

  /** Кнопка «Строить»: открывает список строений. На уровнях, где строить нельзя, она тусклая и не нажимается. */
  private addBuildButton(): Phaser.GameObjects.Container {
    const open = (this.level.buildings ?? []).length > 0;
    const bg = this.add
      .rectangle(0, 0, BUILD_W, SUMMON_H, COLORS.panel)
      .setStrokeStyle(1, open ? COLORS.brass : COLORS.line)
      .setName('build');
    // Молоток: рукоять и боёк.
    const icon = addBakedShape(this, 'build-icon', BUILD_ICON, BUILD_ICON, (g) => {
      g.fillStyle(COLORS.heroStaff);
      g.fillPoints(
        [new Phaser.Math.Vector2(-11, 9), new Phaser.Math.Vector2(-8, 12), new Phaser.Math.Vector2(5, -1), new Phaser.Math.Vector2(2, -4)],
        true,
      );
      g.fillStyle(COLORS.range);
      g.fillPoints(
        [new Phaser.Math.Vector2(-3, -9), new Phaser.Math.Vector2(3, -13), new Phaser.Math.Vector2(12, -2), new Phaser.Math.Vector2(6, 2)],
        true,
      );
    }).setAlpha(open ? 1 : 0.3);
    const button = this.add.container(BUILD_X, CONTROLS_CENTER_Y, [bg, icon]);
    if (!open) return button;

    bg.setInteractive({ useHandCursor: true });
    addPressFeel(this, bg, button);
    bg.on('pointerdown', () => audio.play('click'));
    bg.on('pointerup', () => this.buildPanel?.showBuild());
    return button;
  }

  /** Зона продажи на месте кнопок: видна, пока игрок держит кота или строение. Касаний не перехватывает — их ведёт GameScene. */
  private addSellZone(): void {
    this.sellBg = this.add.rectangle(0, 0, GAME_W - CONTROLS_PAD * 2, SUMMON_H, COLORS.panel).setStrokeStyle(2, COLORS.brass);
    this.sellLabel = this.add
      .text(0, 0, '', { fontFamily: FONTS.display, fontSize: '16px', color: TEXT_COLORS.brass })
      .setOrigin(0, 0.5);
    this.sellCoin = addCoinIcon(this, 0, 0, SELL_COIN);
    this.sellZone = this.add
      .container(GAME_W / 2, CONTROLS_CENTER_Y, [this.sellBg, this.sellLabel, this.sellCoin])
      .setVisible(false);
  }

  /** Игрок взял кота или строение, навёл на зону продажи или отпустил (`offer` — null). */
  private showSellOffer(offer: SellOffer | null): void {
    const zone = this.sellZone;
    if (!zone) return;
    const holding = offer !== null;
    for (const button of this.controls) button.setVisible(!holding);
    zone.setVisible(holding);
    if (!offer) {
      this.tweens.killTweensOf(zone);
      zone.setScale(1);
      return;
    }

    // Над зоной она зелёная, а не латунная: латунные детали того, что в руке (крыша лавки, точки уровня), на ней не теряются.
    this.sellBg.setFillStyle(offer.over ? COLORS.reward : COLORS.panel);
    this.sellLabel.setText(t('sell.zone', { gold: offer.gold })).setColor(offer.over ? TEXT_COLORS.fg : TEXT_COLORS.brass);
    // Подпись и монета вместе стоят по центру зоны.
    const width = this.sellLabel.width + 5 + SELL_COIN;
    this.sellLabel.setX(-width / 2);
    this.sellCoin.setX(width / 2 - SELL_COIN / 2);
    this.tweens.killTweensOf(zone);
    this.tweens.add({
      targets: zone,
      scaleY: offer.over ? SELL_FEEL.overScale : 1,
      duration: SELL_FEEL.tweenMs,
      ease: SELL_FEEL.ease,
    });
  }

  /** Взятое следует за пальцем; при первом вызове появляется его картинка. */
  private moveGhost({ piece, x, y }: DragGhost): void {
    if (!this.ghost) {
      this.ghost = isCat(piece) ? new CatView(this, x, y, piece) : new BuildingView(this, x, y, piece);
      this.ghost.lift();
    }
    this.ghost.setPosition(x, Math.min(y, DRAG_GHOST_MAX_Y));
  }

  /** Игрок отпустил взятое: проданное стягивается в зону продажи, остальное возвращается на поле уже там. */
  private dropGhost(sold: boolean): void {
    const ghost = this.ghost;
    this.ghost = null;
    if (!ghost) return;
    if (sold) ghost.absorb(ghost.x, CONTROLS_CENTER_Y);
    else ghost.destroy();
  }

  /** Игрок держит кота или строение, и оно нарисовано поверх экрана. Для смоук-проверки. */
  holdingGhost(): boolean {
    return this.ghost !== null;
  }

  /** Нажатие на строение: окно с его улучшением. */
  private openUpgrade(slot: number): void {
    this.buildPanel?.showUpgrade(slot);
  }

  /** Окно стройки или улучшения открыто; сколько в нём строк. Для смоук-проверки. */
  buildPanelRows(): number {
    // Зонд может спросить раньше, чем сцена создана.
    return this.buildPanel?.rows ?? 0;
  }

  /** Зона продажи сейчас на экране и что на ней написано; null — её нет. Для смоук-проверки. */
  sellZoneText(): string | null {
    return this.sellZone?.visible ? this.sellLabel.text : null;
  }

  /** Кнопка скорости боя: показывает текущую скорость, в ускоренном бою — латунная. */
  private addSpeedButton(): void {
    this.speedBg = this.add
      .rectangle(0, 0, MIN_TOUCH, MIN_TOUCH, COLORS.panel)
      .setStrokeStyle(1, COLORS.line)
      .setName('speed')
      .setInteractive({ useHandCursor: true });
    this.speedLabel = this.add
      .text(0, 0, '', { fontFamily: FONTS.display, fontSize: '15px', color: TEXT_COLORS.fg })
      .setOrigin(0.5);
    const button = this.add.container(...speedButtonCenter(), [this.speedBg, this.speedLabel]);

    addPressFeel(this, this.speedBg, button);
    this.speedBg.on('pointerdown', () => audio.play('click'));
    this.speedBg.on('pointerup', () => this.gameScene.toggleSpeed());
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
    this.buildPanel?.close();

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
    const music = addSoundToggle(this, ...pauseMenuButtonCenter(2), buttonW, buttonH, 'music');
    const menu = addButton(this, ...pauseMenuButtonCenter(3), buttonW, buttonH, t('pause.menu'), false, () => {
      this.leaveToMenu();
    });

    this.pauseMenu = this.add.container(0, 0, [dim, title, resume, sound, music, menu]);
  }

  private addMeteorButton(): Phaser.GameObjects.Container {
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

    this.meteorButton = this.add.container(METEOR_X, CONTROLS_CENTER_Y, [
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
    return this.meteorButton;
  }

  /** Кнопка «монеты за рекламу»: ролик идёт на паузе боя, монеты приходят, только если его досмотрели. */
  private addCoinAdButton(): Phaser.GameObjects.Container {
    this.coinAdBg = this.add
      .rectangle(0, 0, COIN_AD_W, SUMMON_H, COLORS.reward)
      .setName('coinAd')
      .setInteractive({ useHandCursor: true });
    this.coinAdAmount = this.add
      .text(0, COIN_AD_TOP_Y, t('ad.coins', { gold: ads.coins.gold }), {
        fontFamily: FONTS.display,
        fontSize: '15px',
        color: TEXT_COLORS.fg,
      })
      .setOrigin(0, 0.5);
    // Число и монета вместе стоят по центру кнопки.
    const width = this.coinAdAmount.width + 4 + COIN_AD_ICON;
    this.coinAdAmount.setX(-width / 2);
    const coin = addCoinIcon(this, width / 2 - COIN_AD_ICON / 2, COIN_AD_TOP_Y, COIN_AD_ICON);
    this.coinAdStatus = this.add
      .text(0, COIN_AD_BOTTOM_Y, '', { fontFamily: FONTS.body, fontSize: '11px', color: TEXT_COLORS.fg })
      .setOrigin(0.5);
    const button = this.add.container(COIN_AD_X, CONTROLS_CENTER_Y, [this.coinAdBg, this.coinAdAmount, coin, this.coinAdStatus]);
    this.shownCoinAd = '';

    addPressFeel(this, this.coinAdBg, button, () => this.gameScene.coinAdState().ready);
    this.coinAdBg.on('pointerup', () => void this.watchCoinAd());
    return button;
  }

  private async watchCoinAd(): Promise<void> {
    if (this.adBusy || !this.gameScene.coinAdState().ready) return;
    audio.play('click');
    // Бой стоит с момента нажатия: площадка открывает ролик не сразу.
    const held = this.gameScene.pauseBattle();
    const rewarded = await this.watchAd();
    if (held) this.gameScene.resumeBattle();
    if (!rewarded) return;

    const gold = this.gameScene.claimCoinAd();
    if (gold > 0) this.flyReward({ x: COIN_AD_X, y: CONTROLS_CENTER_Y - BOARD_Y, gold, crystals: 0 });
  }

  /** Показывает ролик с наградой; true — досмотрен. Пока идёт один ролик или игрок уходит с экрана, второй не начинается. */
  private async watchAd(): Promise<boolean> {
    if (this.adBusy || this.leaving) return false;
    this.adBusy = true;
    try {
      return await adBreaks.rewarded();
    } finally {
      this.adBusy = false;
    }
  }

  private refreshCoinAd(): void {
    const { ready, remaining } = this.gameScene.coinAdState();
    const seconds = Math.ceil(remaining);
    const shown = `${ready}:${seconds}`;
    if (shown === this.shownCoinAd) return;
    this.shownCoinAd = shown;

    this.coinAdBg.setFillStyle(ready ? COLORS.reward : COLORS.panel);
    this.coinAdBg.setStrokeStyle(1, COLORS.line, ready ? 0 : 1);
    this.coinAdAmount.setColor(ready ? TEXT_COLORS.fg : TEXT_COLORS.muted);
    this.coinAdStatus
      .setColor(ready ? TEXT_COLORS.fg : TEXT_COLORS.muted)
      .setText(seconds > 0 ? t('meteor.cooldown', { seconds }) : t('ad.watch'));
  }

  update(_time: number, delta: number): void {
    this.refreshMeteor();
    this.refreshCoinAd();
    // На паузе бой стоит, и отсчёт подсказок стоит вместе с ним.
    if (this.tutorial && !this.pauseMenu) {
      const state = this.gameScene.tutorialState();
      // Пока окно стройки открыто, звать к нему уже не нужно.
      if (this.buildPanel?.open) state.canBuild = false;
      this.tutorialOverlay?.show(this.tutorial.update(delta / 1000, state));
    }
  }

  /** Шаг обучения, подсказка о котором сейчас на экране; читает смоук-проверка (src/smoke.ts). */
  tutorialStep(): string | null {
    return this.tutorialOverlay?.step ?? null;
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
    const { gold, crystals, summonCost, summonsLeft, summonLimit, overLimitMult, canSummon, lives, wave, totalWaves, speed, upcoming } =
      this.gameScene.hudState();
    const fast = speed > 1;
    this.speedBg.setFillStyle(fast ? COLORS.brass : COLORS.panel);
    this.speedLabel.setText(t('hud.speed', { speed })).setColor(fast ? TEXT_COLORS.dark : TEXT_COLORS.fg);
    this.canSummon = canSummon;

    this.goldText.setText(String(gold));
    this.setStat(this.crystalsText, String(crystals));
    this.showWaveStart(wave);
    this.setStat(this.waveText, t('hud.waveValue', { current: wave, total: totalWaves }));
    this.setStat(this.livesText, String(lives));
    this.showUpcoming(upcoming);
    this.summonCost.setText(String(summonCost));
    this.summonLimit.setText(
      overLimitMult > 1 ? t('summon.over', { mult: overLimitMult }) : t('summon.left', { left: summonsLeft, limit: summonLimit }),
    );
    this.summonCoin.setX(this.summonCost.x - this.summonCost.width - COIN_RADIUS - 4);

    const textColor = canSummon ? TEXT_COLORS.dark : TEXT_COLORS.muted;
    this.summonBg.setFillStyle(canSummon ? COLORS.brass : COLORS.panel);
    this.summonBg.setStrokeStyle(1, COLORS.line, canSummon ? 0 : 1);
    this.summonLabel.setColor(textColor);
    this.summonCost.setColor(textColor);
    this.summonLimit.setColor(textColor);
    this.summonCoin.setFillStyle(canSummon ? COLORS.bg : COLORS.line);
    this.buildPanel?.refresh();
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

    const king = this.level.kingWave === wave;
    const boss = king || this.level.bossWaves.includes(wave);
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
          .text(0, WAVE_BANNER_SUBTITLE_Y, t(king ? 'wave.king' : 'wave.boss'), { fontFamily: FONTS.body, fontSize: '13px', color: TEXT_COLORS.fg })
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
      .setText(t(upcoming.king ? 'wave.kingSoon' : upcoming.boss ? 'wave.bossSoon' : 'wave.soon', { wave }))
      .setColor(upcoming.boss || upcoming.king ? TEXT_COLORS.danger : TEXT_COLORS.fg)
      .setBackgroundColor(ANNOUNCE_BG);
    this.tweens.add({ targets: this.announce, alpha: 1, duration: ANNOUNCE_FEEL.showMs });
  }

  /** Экран поверх поля: победа со звёздами или поражение, кнопки «Ещё раз» и «В меню». */
  private showResult(result: LevelResult): void {
    this.buildPanel?.close();
    this.tweens.killTweensOf(this.announce);
    this.announce.setAlpha(0);
    // Кнопки появляются вместе с экраном: случайное касание во время паузы ничего не нажмёт.
    this.time.delayedCall(RESULT_FEEL.delayMs, () => this.buildResult(result));
  }

  /** Какой экран итога сейчас открыт; читает смоук-проверка (src/smoke.ts). */
  resultShown(): 'win' | 'lose' | null {
    if (!this.resultOverlay) return null;
    return this.resultWon ? 'win' : 'lose';
  }

  private buildResult(result: LevelResult): void {
    this.resultWon = result.won;
    audio.play(result.won ? 'win' : 'lose');
    audio.playAfter(result.won ? 'win' : 'lose', result.won ? 'purrWin' : 'meowSad');
    // Затемнение перехватывает касания, чтобы под экраном ничего не нажималось.
    const dim = this.add
      .rectangle(GAME_W / 2, RESULT_Y, GAME_W, BOARD_H, COLORS.bg, RESULT_FEEL.dimAlpha)
      .setInteractive();

    const title = this.add
      .text(GAME_W / 2, RESULT_Y + RESULT.titleY, t(result.won ? 'result.win' : 'result.lose'), {
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
        stars.push(this.add.star(x, RESULT_Y + RESULT.starsY, 5, 8, 17, earned ? COLORS.brass : COLORS.line));
      }
    }

    const detail = this.add
      .text(GAME_W / 2, RESULT_Y + RESULT.detailY, this.resultText(result), {
        fontFamily: FONTS.body,
        fontSize: '14px',
        color: TEXT_COLORS.muted,
        align: 'center',
        wordWrap: { width: RESULT.textW },
      })
      .setOrigin(0.5);

    const overlay = this.add.container(0, 0, [dim, title, ...stars, detail]).setAlpha(0);
    this.resultOverlay = overlay;
    if (result.won) this.addWinReward(overlay, result);
    else if (result.canRevive) this.addReviveOffer(overlay, result);

    const data: LevelSceneData = { levelId: this.level.id };
    const next = result.won ? nextLevelId(levels.levels.map((level) => level.id), this.level.id) : null;
    overlay.add(
      addButton(this, ...resultButtonCenter('left'), RESULT.buttonW, RESULT.buttonH, t('result.menu'), false, () => {
        this.leaveAfterResult(() => {
          this.scene.stop(SceneKey.Game);
          this.scene.start(SceneKey.Menu);
        });
      }),
    );
    overlay.add(
      next
        ? addButton(this, ...resultButtonCenter('right'), RESULT.buttonW, RESULT.buttonH, t('result.next'), true, () => {
            const nextData: LevelSceneData = { levelId: next };
            this.leaveAfterResult(() => {
              this.scene.stop(SceneKey.Game);
              this.scene.start(SceneKey.Gear, nextData);
            });
          })
        : addButton(this, ...resultButtonCenter('right'), RESULT.buttonW, RESULT.buttonH, t('result.retry'), true, () => {
            // GameScene при запуске сама перезапускает HUD.
            this.leaveAfterResult(() => this.gameScene.scene.restart(data));
          }),
    );

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

  /** Победа: строка «Награда: рыбки» и кнопка, удваивающая её за ролик. */
  private addWinReward(overlay: Phaser.GameObjects.Container, result: LevelResult): void {
    const y = RESULT_Y + RESULT.rewardY;
    const label = this.add
      .text(0, y, t('result.reward'), { fontFamily: FONTS.body, fontSize: '15px', color: TEXT_COLORS.muted })
      .setOrigin(0, 0.5);
    const amount = this.add
      .text(0, y, String(result.fish), { fontFamily: FONTS.display, fontSize: '20px', color: TEXT_COLORS.fish })
      .setOrigin(0, 0.5);
    // Подпись, рыбка и число вместе стоят по центру; место под число считаем по удвоенной награде.
    const doubled = result.fish * ads.doubleReward.mult;
    const amountW = amount.setText(String(doubled)).width;
    amount.setText(String(result.fish));
    const left = GAME_W / 2 - (label.width + REWARD_GAP + REWARD_ICON + REWARD_GAP + amountW) / 2;
    label.setX(left);
    const icon = addFishIcon(this, left + label.width + REWARD_GAP + REWARD_ICON / 2, y, REWARD_ICON);
    amount.setX(icon.x + REWARD_ICON / 2 + REWARD_GAP);
    overlay.add([label, icon, amount]);

    const button = addAdButton(this, ...resultAdCenter(), RESULT.adW, RESULT.buttonH, t('ad.double'), () => {
      void this.watchAd().then((rewarded) => {
        if (!rewarded || !button.active) return;
        progress.addFish(doubled - result.fish);
        progress.flush();
        button.destroy();
        amount.setText(String(doubled));
        this.pulseStat(amount);
        audio.play('coins');
      });
    });
    overlay.add(button);
  }

  /** Поражение: один раз за уровень ролик возвращает жизни, и бой идёт дальше с того же места. */
  private addReviveOffer(overlay: Phaser.GameObjects.Container, result: LevelResult): void {
    const hint = this.add
      .text(GAME_W / 2, RESULT_Y + RESULT.rewardY, t('ad.reviveHint', { lives: result.reviveLives }), {
        fontFamily: FONTS.body,
        fontSize: '14px',
        color: TEXT_COLORS.fg,
      })
      .setOrigin(0.5);
    const button = addAdButton(this, ...resultAdCenter(), RESULT.adW, RESULT.buttonH, t('ad.revive'), () => {
      void this.watchAd().then((rewarded) => {
        if (!rewarded || this.leaving || this.resultOverlay !== overlay || !this.gameScene.revive()) return;
        this.tweens.killTweensOf(overlay);
        overlay.destroy();
        this.resultOverlay = null;
      });
    });
    overlay.add([hint, button]);
  }

  /** Уход с экрана итога. Это пауза между уровнями — единственное место, где показывается полноэкранная реклама. */
  private leaveAfterResult(go: () => void): void {
    if (this.leaving) return;
    this.leaving = true;
    progress.flush();
    void adBreaks.betweenLevels().then(() => fadeOut(this, go));
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
    if (result.perfectChest) lines.push(t('result.perfectChest'));
    if (result.smallChest) lines.push(t('result.smallChest'));
    return lines.join('\n');
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
