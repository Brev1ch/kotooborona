import Phaser from 'phaser';
import { audio } from '../audio';
import { gear, type GearSlot } from '../data';
import { t, type StringKey } from '../i18n';
import {
  COLORS,
  FONTS,
  GAME_H,
  GAME_W,
  GEAR,
  gearButtonCenter,
  gearCellCenter,
  gearFishCenter,
  gearWornCenter,
  ITEM_CARD,
  itemCardButtonCenter,
  TEXT_COLORS,
} from '../layout';
import { progress } from '../progress';
import { GEAR_SLOTS } from '../systems/Gear';
import { salvageShards, upgradePrice, type Item } from '../systems/Items';
import { drawSlotGlyph, itemAccent, itemLines, itemRarityLine, itemTitle, rarityColor, rarityFill } from './itemText';
import { SceneKey, type LevelSceneData } from './keys';
import { sceneBeforeBattle } from './IntroScene';
import { fadeIn, fadeOut } from './transitions';
import { addButton, addFishCounter, addPressFeel, fitText, type FishCounter } from './widgets';

/**
 * Экран перед уровнем: надетые предметы и инвентарь. Нажатие на предмет открывает карточку с бонусами:
 * предмет из инвентаря можно надеть (сравнив с надетым) или разобрать на осколки, надетый — улучшить за осколки и рыбки.
 */
export class GearScene extends Phaser.Scene {
  private levelId!: string;
  private fish!: FishCounter;
  /** Всё, что перерисовывается после каждого действия: надетые предметы, сетка инвентаря, счётчики. */
  private content: Phaser.GameObjects.GameObject[] = [];
  /** Части открытой карточки предмета; пусто — карточка закрыта. */
  private card: Phaser.GameObjects.GameObject[] = [];
  /** На сколько пикселей текст открытой карточки заходит на её кнопки; 0 — помещается. Читает смоук-проверка (src/smoke.ts). */
  cardOverflow = 0;

  constructor() {
    super(SceneKey.Gear);
  }

  init(data: LevelSceneData): void {
    this.levelId = data.levelId;
  }

  create(): void {
    fadeIn(this);
    this.content = [];
    this.card = [];
    this.add
      .text(GAME_W / 2, GEAR.titleY, t(`level.${this.levelId}` as StringKey), {
        fontFamily: FONTS.display,
        fontSize: '24px',
        color: TEXT_COLORS.fg,
      })
      .setOrigin(0.5);
    this.fish = addFishCounter(this, ...gearFishCenter(), progress.fish);
    this.render();

    const data: LevelSceneData = { levelId: this.levelId };
    addButton(this, ...gearButtonCenter('back'), GEAR.backW, GEAR.buttonH, t('nav.back'), false, () => {
      progress.flush();
      fadeOut(this, () => this.scene.start(SceneKey.Menu));
    });
    addButton(this, ...gearButtonCenter('start'), GEAR.startW, GEAR.buttonH, t('gear.start'), true, () => {
      progress.flush();
      // Перед первым уровнем главы и перед королём — сценка, перед уровнем с новым врагом — его карточка, затем бой.
      const next = sceneBeforeBattle(this.levelId);
      fadeOut(this, () => this.scene.start(next, data));
    });
  }

  /** Рисует надетое и инвентарь заново: после действия с предметом меняется почти всё. */
  private render(): void {
    for (const object of this.content) object.destroy();
    this.content = [];
    this.fish.set(progress.fish);
    const { pad, subtitleY, listTitleY, cell, wornW, wornH } = GEAR;

    this.content.push(
      this.add
        .text(pad, subtitleY, t('item.shards', { count: progress.shards }), { fontFamily: FONTS.body, fontSize: '14px', color: TEXT_COLORS.crystal })
        .setOrigin(0, 0.5),
    );

    GEAR_SLOTS.forEach((slot, index) => this.addWorn(slot, ...gearWornCenter(index), wornW, wornH));

    const bag = progress.items.filter((item) => !progress.isWorn(item.id));
    this.content.push(
      this.add
        .text(pad, listTitleY, t('item.inventory', { count: progress.items.length, limit: progress.inventoryLimit }), {
          fontFamily: FONTS.body,
          fontSize: '13px',
          color: TEXT_COLORS.muted,
        })
        .setOrigin(0, 0.5),
    );
    if (bag.length === 0) {
      const [, y] = gearCellCenter(0);
      this.content.push(
        this.add
          .text(GAME_W / 2, y, t('item.empty'), {
            fontFamily: FONTS.body,
            fontSize: '13px',
            color: TEXT_COLORS.muted,
            align: 'center',
            wordWrap: { width: GAME_W - pad * 2 },
          })
          .setOrigin(0.5),
      );
    }
    bag.forEach((item, index) => this.addCell(item, ...gearCellCenter(index), cell));
  }

  /** Плашка слота: значок, название слота, редкость и уровень надетого предмета. */
  private addWorn(slot: GearSlot, x: number, y: number, width: number, height: number): void {
    const item = progress.wornItem(slot);
    const bg = this.add
      .rectangle(0, 0, width, height, COLORS.panel)
      .setStrokeStyle(2, item ? rarityFill(item.rarity) : COLORS.line)
      // По имени плашку находит смоук-проверка.
      .setName(`worn:${slot}`);
    const glyph = this.add.graphics({ x: 0, y: -14 });
    drawSlotGlyph(glyph, slot, 26, item ? rarityFill(item.rarity) : COLORS.line, item ? itemAccent(item) : COLORS.line);
    const name = this.add
      .text(0, 12, item ? itemTitle(item, true) : t(`gear.slot.${slot}`), {
        fontFamily: FONTS.body,
        fontSize: '11px',
        color: item ? TEXT_COLORS.fg : TEXT_COLORS.muted,
        align: 'center',
        wordWrap: { width: width - 8 },
      })
      .setOrigin(0.5, 0);
    const box = this.add.container(x, y, [bg, glyph, name]);
    if (item) {
      const level = this.add
        .text(width / 2 - 6, -height / 2 + 5, t('gear.level', { level: item.level }), { fontFamily: FONTS.body, fontSize: '11px', color: TEXT_COLORS.muted })
        .setOrigin(1, 0);
      box.add(level);
      this.makePressable(bg, box, item);
    }
    this.content.push(box);
  }

  /** Ячейка инвентаря: рамка цвета редкости и значок слота. */
  private addCell(item: Item, x: number, y: number, size: number): void {
    const bg = this.add.rectangle(0, 0, size, size, COLORS.panel).setStrokeStyle(2, rarityFill(item.rarity)).setName(`item:${item.id}`);
    const glyph = this.add.graphics();
    drawSlotGlyph(glyph, item.slot, 28, rarityFill(item.rarity), itemAccent(item));
    const box = this.add.container(x, y, [bg, glyph]);
    this.makePressable(bg, box, item);
    this.content.push(box);
  }

  private makePressable(bg: Phaser.GameObjects.Rectangle, box: Phaser.GameObjects.Container, item: Item): void {
    bg.setInteractive({ useHandCursor: true });
    addPressFeel(this, bg, box, () => this.card.length === 0);
    bg.on('pointerup', () => {
      if (this.card.length > 0) return;
      audio.play('click');
      this.showCard(item);
    });
  }

  private closeCard(): void {
    for (const object of this.card) object.destroy();
    this.card = [];
    this.cardOverflow = 0;
  }

  /** Карточка предмета: что он даёт, чем отличается от надетого, и что с ним можно сделать. */
  private showCard(item: Item): void {
    const { y, w, h, pad, titleY, rarityY, textY, lineGap, blockGap, buttonH, buttonGap } = ITEM_CARD;
    const worn = progress.isWorn(item.id);
    // Затемнение перехватывает касания, чтобы под карточкой ничего не нажималось.
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, COLORS.shadow, 0.6).setInteractive();
    const panel = this.add.rectangle(0, 0, w, h, COLORS.panel).setStrokeStyle(2, rarityFill(item.rarity));
    const title = fitText(
      this.add.text(0, titleY, itemTitle(item), { fontFamily: FONTS.display, fontSize: '18px', color: rarityColor(item.rarity) }).setOrigin(0.5),
      w - pad * 2,
    );
    const rarity = this.add
      .text(0, rarityY, itemRarityLine(item), { fontFamily: FONTS.body, fontSize: '12px', color: TEXT_COLORS.muted })
      .setOrigin(0.5);
    const window = this.add.container(GAME_W / 2, y, [panel, title, rarity]);

    // Строки идут друг за другом сверху вниз: высота каждой зависит от языка.
    const left = -w / 2 + pad;
    let top = textY;
    const addLine = (text: string, color: string, size: string, gap: number): void => {
      const line = this.add.text(left, top, text, { fontFamily: FONTS.body, fontSize: size, color, wordWrap: { width: w - pad * 2 } });
      window.add(line);
      top += line.height + gap;
    };
    for (const line of itemLines(item)) addLine(line, TEXT_COLORS.fg, '14px', lineGap);
    const other = worn ? null : progress.wornItem(item.slot);
    if (other) {
      top += blockGap - lineGap;
      addLine(t('item.wornNow', { rarity: t(`rarity.${other.rarity}`), level: other.level }), TEXT_COLORS.brass, '12px', lineGap);
      for (const line of itemLines(other)) addLine(line, TEXT_COLORS.muted, '13px', lineGap);
    }
    this.card = [dim, window];
    this.cardOverflow = Math.max(0, Math.ceil(top - (ITEM_CARD.actionY - buttonH / 2)));

    const done = (): void => {
      this.closeCard();
      this.render();
    };
    const full = w - pad * 2;
    const half = (full - buttonGap) / 2;
    if (worn) {
      const price = upgradePrice(gear.items, item);
      const affordable = price !== null && progress.shards >= price.shards && progress.fish >= price.fish;
      const label = price ? t('item.upgrade', { shards: price.shards, fish: price.fish }) : t('gear.maxLevel');
      this.card.push(
        addButton(this, ...itemCardButtonCenter('wide'), full, buttonH, label, affordable, () => {
          if (!progress.upgradeItem(item.id)) return;
          audio.play('merge');
          done();
        }),
      );
    } else {
      this.card.push(
        addButton(this, ...itemCardButtonCenter('left'), half, buttonH, t('item.equip'), true, () => {
          progress.equip(item.id);
          done();
        }),
        addButton(this, ...itemCardButtonCenter('right'), half, buttonH, t('item.salvage', { shards: salvageShards(gear.items, item) }), false, () => {
          progress.salvage(item.id);
          done();
        }),
      );
    }
    this.card.push(addButton(this, ...itemCardButtonCenter('close'), full, buttonH, t('item.close'), false, () => this.closeCard()));
  }
}
