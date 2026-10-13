import Phaser from 'phaser';
import { adBreaks } from '../adBreaks';
import { audio } from '../audio';
import { ads, cats, gear, levels, type Rarity } from '../data';
import { CHEST_FEEL } from '../feel';
import { t, type StringKey } from '../i18n';
import {
  CHEST_POPUP,
  chestTakeCenter,
  COLORS,
  FONTS,
  GAME_H,
  GAME_W,
  MENU,
  menuAdChestCenter,
  menuBestiaryCenter,
  menuBookCenter,
  menuCardCenter,
  menuChestCenter,
  menuSoundCenter,
  TEXT_COLORS,
} from '../layout';
import { progress } from '../progress';
import { campaignTiles, type CampaignTile } from '../systems/Campaign';
import { adChestWait, chestChances, chestKind, chestState, chestsWaiting, nextChest, rollChest, type ChestKind, type ChestLoot, type ChestSource } from '../systems/Chests';
import { random } from '../systems/Random';
import { MAX_STARS } from '../systems/Progress';
import { itemLines, itemTitle, rarityColor, rarityFill } from './itemText';
import { SceneKey, type LevelSceneData } from './keys';
import { fadeIn, fadeOut } from './transitions';
import { addAdButton, addButton, addFishCounter, addFishIcon, addLockIcon, addPressFeel, addSoundButton, type FishCounter } from './widgets';

const CARD_PAD = 14;
const NUMBER_W = 26;
const STAR_STEP = 20;
const LOCKED_ALPHA = 0.55;
/** Звезда в полосе сундука и рыбка в окне добычи. */
const CHEST_STAR = { inner: 4, outer: 8.5 };
const LOOT_FISH = 22;

/** Секунды в виде «14:59». */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export class MenuScene extends Phaser.Scene {
  private fish!: FishCounter;
  /** Полоса сундука; пересоздаётся, когда сундук открыт. */
  private chest: Phaser.GameObjects.Container | null = null;
  /** Кнопка сундука за рекламу или отсчёт до следующего; пересоздаётся, когда меняется состояние. */
  private adChest: Phaser.GameObjects.Container | null = null;
  private adTimer: Phaser.GameObjects.Text | null = null;
  /** Идёт ролик или открыто окно сундука: второй сундук не начинается. */
  private busy = false;

  constructor() {
    super(SceneKey.Menu);
  }

  create(): void {
    fadeIn(this);
    this.add
      .text(GAME_W / 2, MENU.titleY, t('game.title'), {
        fontFamily: FONTS.display,
        fontSize: '30px',
        color: TEXT_COLORS.fg,
      })
      .setOrigin(0.5);

    this.fish = addFishCounter(this, MENU.fishX, MENU.fishY, progress.fish);
    addSoundButton(this, ...menuSoundCenter());

    this.chest = null;
    this.adChest = null;
    this.busy = false;
    this.addChest();
    this.addAdChest();
    // Отсчёт до сундука за рекламу идёт по настоящему времени: раз в секунду сверяемся с часами.
    this.time.addEvent({ delay: CHEST_FEEL.adTickMs, loop: true, callback: () => this.refreshAdChest() });

    const levelIds = levels.levels.map((level) => level.id);
    const tiles = campaignTiles(levelIds, levels.chapterLevels, (id) => progress.stars(id));
    tiles.forEach((tile, index) => this.addCard(tile, ...menuCardCenter(index)));

    addButton(this, ...menuBookCenter(), MENU.bookW, MENU.bookH, t('book.title'), false, () => {
      fadeOut(this, () => this.scene.start(SceneKey.Book));
    });
    addButton(this, ...menuBestiaryCenter(), MENU.bookW, MENU.bookH, t('bestiary.title'), false, () => {
      fadeOut(this, () => this.scene.start(SceneKey.Bestiary));
    });
  }

  /**
   * Полоса сундука: сколько звёзд набрано из нужных для следующего; когда есть что открыть — кнопка «Открыть сундук».
   * Сундуки открываются по одному: за три звезды на уровне, за сумму звёзд, затем малые; остальные ждут на этом же месте.
   */
  private addChest(): void {
    this.chest?.destroy();
    const { chestW, chestH } = MENU;
    const have = progress.totalStars;
    const { ready: starsReady, need } = chestState(have, progress.chestsOpened, gear.chests.stars);
    const source = nextChest(progress.pendingChests, starsReady);
    const waiting = chestsWaiting(progress.pendingChests, starsReady);
    const ready = source !== null;
    const open = t(source === 'small' ? 'chest.openSmall' : 'chest.open');

    const bg = this.add
      .rectangle(0, 0, chestW, chestH, ready ? COLORS.brass : COLORS.panel)
      .setStrokeStyle(1, COLORS.line, ready ? 0 : 1)
      .setName('chest');
    const text = ready
      ? waiting > 1
        ? t('chest.count', { label: open, count: waiting })
        : open
      : need === null
        ? t('chest.allOpened')
        : t('chest.progress', { have, need });
    const label = this.add
      .text(0, 0, text, {
        fontFamily: ready ? FONTS.display : FONTS.body,
        fontSize: ready ? '15px' : '14px',
        color: ready ? TEXT_COLORS.dark : TEXT_COLORS.muted,
      })
      .setOrigin(0.5);
    const star = this.add
      .star(-label.width / 2 - 14, 0, 5, CHEST_STAR.inner, CHEST_STAR.outer, ready ? COLORS.bg : COLORS.brass)
      .setVisible(ready || need !== null);
    const chest = this.add.container(...menuChestCenter(), [bg, star, label]);
    this.chest = chest;
    if (!source) return;

    bg.setInteractive({ useHandCursor: true });
    addPressFeel(this, bg, chest);
    bg.on('pointerdown', () => audio.play('click'));
    bg.once('pointerup', () => this.openChest(source));
    this.tweens.add({
      targets: chest,
      scale: CHEST_FEEL.readyPulseScale,
      duration: CHEST_FEEL.readyPulseMs,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * Сундук за наградной ролик: кнопка со значком ролика, а после сундука — отсчёт до следующего.
   * Пауза считается по настоящему времени и хранится в сохранении: перезапуск игры её не сбрасывает.
   */
  private addAdChest(): void {
    this.adChest?.destroy();
    this.adTimer = null;
    const { adChestW, chestH } = MENU;
    const wait = adChestWait(progress.adChestAt, Date.now(), ads.chest.cooldown);
    if (wait <= 0) {
      this.adChest = addAdButton(this, ...menuAdChestCenter(), adChestW, chestH, t('chest.ad'), () => void this.watchAdForChest());
      return;
    }
    const bg = this.add.rectangle(0, 0, adChestW, chestH, COLORS.panel).setStrokeStyle(1, COLORS.line);
    const label = this.add
      .text(0, -MENU.adChestLine, t('chest.ad'), { fontFamily: FONTS.body, fontSize: '12px', color: TEXT_COLORS.muted })
      .setOrigin(0.5);
    this.adTimer = this.add
      .text(0, MENU.adChestLine, clock(wait), { fontFamily: FONTS.display, fontSize: '14px', color: TEXT_COLORS.muted })
      .setOrigin(0.5);
    this.adChest = this.add.container(...menuAdChestCenter(), [bg, label, this.adTimer]);
  }

  /** Раз в секунду: отсчёт убывает, а когда пауза прошла — на его месте снова кнопка. */
  private refreshAdChest(): void {
    if (!this.adTimer) return;
    const wait = adChestWait(progress.adChestAt, Date.now(), ads.chest.cooldown);
    if (wait <= 0) this.addAdChest();
    else this.adTimer.setText(clock(wait));
  }

  private async watchAdForChest(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const rewarded = await adBreaks.rewarded();
    this.busy = false;
    // Пока шёл ролик, игрок мог уйти с экрана.
    if (!rewarded || !this.scene.isActive()) return;
    this.openChest('ad');
  }

  /** Открывает сундук: добыча сразу уходит в сохранение, окно только показывает её. */
  private openChest(source: ChestSource): void {
    if (this.busy) return;
    this.busy = true;
    const kind = chestKind(source);
    const loot = rollChest(gear, cats, progress.newItemId(), random, kind);
    const shards = progress.claimChest(loot, source, Date.now());
    progress.flush();
    audio.play('hybrid');
    this.addAdChest();
    this.showLoot(loot, shards, kind);
  }

  /** Окно сундука: предмет с редкостью и бонусами, рыбки и шансы редкостей. `shards` — осколки, если инвентарь был полон и предмет разобран. */
  private showLoot(loot: ChestLoot, shards: number, kind: ChestKind): void {
    const { y, w, h, titleY, itemY, rarityY, bonusY, fishY, chancesY, buttonW, buttonH } = CHEST_POPUP;
    // Затемнение перехватывает касания, чтобы под окном ничего не нажималось.
    const dim = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, COLORS.bg, CHEST_FEEL.dimAlpha)
      .setInteractive();

    const { item } = loot;
    const panel = this.add.rectangle(0, 0, w, h, COLORS.panel).setStrokeStyle(2, item ? rarityFill(item.rarity) : COLORS.brass);
    const title = this.add
      .text(0, titleY, t(kind === 'small' ? 'chest.titleSmall' : 'chest.title'), { fontFamily: FONTS.display, fontSize: '22px', color: TEXT_COLORS.fg })
      .setOrigin(0.5);
    const window = this.add.container(GAME_W / 2, y, [panel, title]);
    const wrap = { width: w - 32 };
    if (item) {
      window.add([
        this.add.text(0, itemY, itemTitle(item), { fontFamily: FONTS.display, fontSize: '16px', color: rarityColor(item.rarity) }).setOrigin(0.5),
        this.add
          .text(0, rarityY, t('item.rarity', { rarity: t(`rarity.${item.rarity}`) }), { fontFamily: FONTS.body, fontSize: '12px', color: TEXT_COLORS.muted })
          .setOrigin(0.5),
        this.add
          .text(0, bonusY, shards > 0 ? t('chest.full', { shards }) : itemLines(item).join('\n'), {
            fontFamily: FONTS.body,
            fontSize: '13px',
            color: shards > 0 ? TEXT_COLORS.danger : TEXT_COLORS.fg,
            align: 'center',
            wordWrap: wrap,
          })
          .setOrigin(0.5, 0),
      ]);
    }

    const fishText = this.add
      .text(0, fishY, t('chest.fish', { fish: loot.fish }), {
        fontFamily: FONTS.display,
        fontSize: '18px',
        color: TEXT_COLORS.fish,
      })
      .setOrigin(0, 0.5);
    const fishW = fishText.width + 6 + LOOT_FISH;
    fishText.setX(-fishW / 2);
    const fishIcon = addFishIcon(this, fishW / 2 - LOOT_FISH / 2, fishY, LOOT_FISH);
    // Шансы редкостей — из тех же данных, по которым выпал предмет.
    const odds = chestChances(gear, kind);
    const percent = (rarity: Rarity): number => Math.round(odds[rarity] * 100);
    const chances = this.add
      .text(0, chancesY, t('chest.chances', { common: percent('common'), rare: percent('rare'), epic: percent('epic'), legendary: percent('legendary') }), {
        fontFamily: FONTS.body,
        fontSize: '11px',
        color: TEXT_COLORS.muted,
        align: 'center',
        wordWrap: wrap,
      })
      .setOrigin(0.5, 0);
    window.add([fishText, fishIcon, chances]);

    const take = addButton(this, ...chestTakeCenter(), buttonW, buttonH, t('chest.take'), true, () => {
      dim.destroy();
      window.destroy();
      take.destroy();
      this.busy = false;
      this.fish.set(progress.fish);
      // Следующий сундук мог быть уже заработан.
      this.addChest();
    });

    this.tweens.add({
      targets: window,
      scale: { from: CHEST_FEEL.popupFromScale, to: 1 },
      alpha: { from: 0, to: 1 },
      duration: CHEST_FEEL.popupMs,
      ease: CHEST_FEEL.popupEase,
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
      card.add(addLockIcon(this, cardW / 2 - CARD_PAD - 10, 0));
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
}
