import Phaser from 'phaser';
import { audio } from '../audio';
import { cats, gear, levels, type Rarity } from '../data';
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
  menuBestiaryCenter,
  menuBookCenter,
  menuCardCenter,
  menuChestCenter,
  menuSoundCenter,
  TEXT_COLORS,
} from '../layout';
import { progress } from '../progress';
import { campaignTiles, type CampaignTile } from '../systems/Campaign';
import { chestState, rollChest, type ChestLoot } from '../systems/Chests';
import { random } from '../systems/Random';
import { MAX_STARS } from '../systems/Progress';
import { itemLines, itemTitle, rarityColor, rarityFill } from './itemText';
import { SceneKey, type LevelSceneData } from './keys';
import { fadeIn, fadeOut } from './transitions';
import { addButton, addFishCounter, addFishIcon, addLockIcon, addPressFeel, addSoundButton, type FishCounter } from './widgets';

const CARD_PAD = 14;
const NUMBER_W = 26;
const STAR_STEP = 20;
const LOCKED_ALPHA = 0.55;
/** Звезда в полосе сундука и рыбка в окне добычи. */
const CHEST_STAR = { inner: 4, outer: 8.5 };
const LOOT_FISH = 22;

export class MenuScene extends Phaser.Scene {
  private fish!: FishCounter;
  /** Полоса сундука; пересоздаётся, когда сундук открыт. */
  private chest: Phaser.GameObjects.Container | null = null;

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
    this.addChest();

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
   * Полоса сундука: сколько звёзд набрано из нужных для следующего; когда хватает — кнопка «Открыть сундук».
   * Сундуки открываются по одному: если звёзд хватает сразу на два, второй ждёт на этом же месте.
   */
  private addChest(): void {
    this.chest?.destroy();
    const { chestW, chestH } = MENU;
    const have = progress.totalStars;
    const { ready, need } = chestState(have, progress.chestsOpened, gear.chests.stars);

    const bg = this.add
      .rectangle(0, 0, chestW, chestH, ready ? COLORS.brass : COLORS.panel)
      .setStrokeStyle(1, COLORS.line, ready ? 0 : 1)
      .setName('chest');
    const text =
      need === null ? t('chest.allOpened') : ready ? t('chest.open') : t('chest.progress', { have, need });
    const label = this.add
      .text(0, 0, text, {
        fontFamily: ready ? FONTS.display : FONTS.body,
        fontSize: ready ? '15px' : '14px',
        color: ready ? TEXT_COLORS.dark : TEXT_COLORS.muted,
      })
      .setOrigin(0.5);
    const star = this.add
      .star(-label.width / 2 - 14, 0, 5, CHEST_STAR.inner, CHEST_STAR.outer, ready ? COLORS.bg : COLORS.brass)
      .setVisible(need !== null);
    const chest = this.add.container(...menuChestCenter(), [bg, star, label]);
    this.chest = chest;
    if (!ready) return;

    bg.setInteractive({ useHandCursor: true });
    addPressFeel(this, bg, chest);
    bg.on('pointerdown', () => audio.play('click'));
    bg.once('pointerup', () => this.openChest());
    this.tweens.add({
      targets: chest,
      scale: CHEST_FEEL.readyPulseScale,
      duration: CHEST_FEEL.readyPulseMs,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** Открывает сундук: добыча сразу уходит в сохранение, окно только показывает её. */
  private openChest(): void {
    const loot = rollChest(gear, cats, progress.newItemId(), random);
    const shards = progress.claimChest(loot);
    progress.flush();
    audio.play('hybrid');
    this.showLoot(loot, shards);
  }

  /** Окно сундука: предмет с редкостью и бонусами, рыбки и шансы редкостей. `shards` — осколки, если инвентарь был полон и предмет разобран. */
  private showLoot(loot: ChestLoot, shards: number): void {
    const { y, w, h, titleY, itemY, rarityY, bonusY, fishY, chancesY, buttonW, buttonH } = CHEST_POPUP;
    // Затемнение перехватывает касания, чтобы под окном ничего не нажималось.
    const dim = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, COLORS.bg, CHEST_FEEL.dimAlpha)
      .setInteractive();

    const { item } = loot;
    const panel = this.add.rectangle(0, 0, w, h, COLORS.panel).setStrokeStyle(2, item ? rarityFill(item.rarity) : COLORS.brass);
    const title = this.add
      .text(0, titleY, t('chest.title'), { fontFamily: FONTS.display, fontSize: '22px', color: TEXT_COLORS.fg })
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
    const percent = (rarity: Rarity): number => Math.round(gear.items.rarities[rarity].chance * 100);
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
