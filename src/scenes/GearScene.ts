import Phaser from 'phaser';
import { audio } from '../audio';
import { gear, type GearItem, type GearSlot } from '../data';
import { GEAR_FEEL } from '../feel';
import { t, type StringKey } from '../i18n';
import { COLORS, FONTS, GAME_W, GEAR, gearButtonCenter, gearFishCenter, MIN_TOUCH, TEXT_COLORS } from '../layout';
import { progress } from '../progress';
import { gearAtLevel, GEAR_SLOTS, upgradeCost } from '../systems/Gear';
import { describeGear } from './gearText';
import { SceneKey, type LevelSceneData } from './keys';
import { storyForLevel } from './StoryScene';
import { fadeIn, fadeOut } from './transitions';
import { addButton, addFishCounter, addFishIcon, addLockIcon, addPressFeel, type FishCounter } from './widgets';

interface Chip {
  item: GearItem;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  lock: Phaser.GameObjects.Graphics;
}

/** Размеры кнопки прокачки: сверху «Улучшить», снизу цена в рыбках. */
const UPGRADE = { labelY: -9, costY: 10, icon: 14, gap: 4 };

/** Экран перед уровнем: игрок выбирает по предмету в каждый из трёх слотов и прокачивает их за рыбки. */
export class GearScene extends Phaser.Scene {
  private levelId!: string;
  private fish!: FishCounter;
  /** Перерисовывает слоты: после прокачки меняются рыбки, а с ними — доступность всех кнопок. */
  private refreshers: (() => void)[] = [];

  constructor() {
    super(SceneKey.Gear);
  }

  init(data: LevelSceneData): void {
    this.levelId = data.levelId;
  }

  create(): void {
    fadeIn(this);
    this.add
      .text(GAME_W / 2, GEAR.titleY, t(`level.${this.levelId}` as StringKey), {
        fontFamily: FONTS.display,
        fontSize: '24px',
        color: TEXT_COLORS.fg,
      })
      .setOrigin(0.5);
    this.add
      .text(GEAR.pad, GEAR.subtitleY, t('gear.title'), {
        fontFamily: FONTS.body,
        fontSize: '14px',
        color: TEXT_COLORS.muted,
      })
      .setOrigin(0, 0.5);
    this.fish = addFishCounter(this, ...gearFishCenter(), progress.fish);

    this.refreshers = [];
    let y = GEAR.listY;
    for (const slot of GEAR_SLOTS) y = this.addSlot(slot, y) + GEAR.blockGap;

    const data: LevelSceneData = { levelId: this.levelId };
    addButton(this, ...gearButtonCenter('back'), GEAR.backW, GEAR.buttonH, t('nav.back'), false, () => {
      progress.flush();
      fadeOut(this, () => this.scene.start(SceneKey.Menu));
    });
    addButton(this, ...gearButtonCenter('start'), GEAR.startW, GEAR.buttonH, t('gear.start'), true, () => {
      progress.flush();
      // Перед первым уровнем главы и перед королём — сценка, затем бой.
      const next = storyForLevel(this.levelId) ? SceneKey.Story : SceneKey.Game;
      fadeOut(this, () => this.scene.start(next, data));
    });
  }

  /**
   * Слот: заголовок, предметы плашками в несколько рядов, под ними — уровень и бонус надетого предмета и кнопка прокачки.
   * Предметы, которых у игрока ещё нет, приглушены и с замком. Возвращает нижний край блока.
   */
  private addSlot(slot: GearSlot, top: number): number {
    const { pad, headH, chipH, chipGap, chipPadX, descH, upgradeW } = GEAR;

    this.add
      .text(pad, top, t(`gear.slot.${slot}`).toUpperCase(), {
        fontFamily: FONTS.body,
        fontSize: '11px',
        color: TEXT_COLORS.muted,
      })
      .setLetterSpacing(0.6);

    /** Предмет без плашки «надет», о котором сейчас рассказывает строка под плашками: игрок нажал на закрытый. */
    let peeked: GearItem | null = null;
    const chips: Chip[] = [];
    let x = pad;
    let y = top + headH;
    for (const item of gear[slot]) {
      const label = this.add
        .text(0, 0, t(`gear.${slot}.${item.id}` as StringKey), { fontFamily: FONTS.body, fontSize: '14px' })
        .setOrigin(0.5);
      const owned = progress.ownsGear(slot, item.id);
      const width = Math.max(MIN_TOUCH, Math.ceil(label.width) + chipPadX * 2);
      if (x + width > GAME_W - pad) {
        x = pad;
        y += chipH + chipGap;
      }
      const bg = this.add
        .rectangle(0, 0, width, chipH, COLORS.panel)
        // По имени плашку находит смоук-проверка.
        .setName(`gear:${slot}:${item.id}`)
        .setInteractive({ useHandCursor: true });
      // У закрытого предмета в углу плашки — замок: ширина плашки от него не меняется, и ряды не переносятся.
      const lock = addLockIcon(this, width / 2 - GEAR_FEEL.lockInset, -chipH / 2 + GEAR_FEEL.lockInset, GEAR_FEEL.lockScale).setVisible(!owned);
      const chip = this.add.container(x + width / 2, y + chipH / 2, [bg, label, lock]);
      chips.push({ item, bg, label, lock });
      x += width + chipGap;

      addPressFeel(this, bg, chip);
      bg.on('pointerdown', () => {
        audio.play('click');
        if (progress.ownsGear(slot, item.id)) {
          peeked = null;
          progress.selectGear(slot, item.id);
        } else {
          peeked = item;
        }
        refresh();
      });
    }

    const rowY = y + chipH + chipGap + descH / 2;
    const desc = this.add
      .text(pad, rowY, '', {
        fontFamily: FONTS.body,
        fontSize: '13px',
        color: TEXT_COLORS.brass,
        wordWrap: { width: GAME_W - pad * 2 - upgradeW - chipGap },
      })
      .setOrigin(0, 0.5);

    // Кнопка прокачки надетого предмета.
    const upBg = this.add
      .rectangle(0, 0, upgradeW, descH, COLORS.brass)
      .setName(`upgrade:${slot}`)
      .setInteractive({ useHandCursor: true });
    const upLabel = this.add
      .text(0, UPGRADE.labelY, t('gear.upgrade'), { fontFamily: FONTS.display, fontSize: '13px', color: TEXT_COLORS.dark })
      .setOrigin(0.5);
    const upIcon = addFishIcon(this, 0, UPGRADE.costY, UPGRADE.icon);
    const upCost = this.add
      .text(0, UPGRADE.costY, '', { fontFamily: FONTS.display, fontSize: '13px', color: TEXT_COLORS.dark })
      .setOrigin(0, 0.5);
    const upButton = this.add.container(GAME_W - pad - upgradeW / 2, rowY, [upBg, upLabel, upIcon, upCost]);
    const canUpgrade = (): boolean => {
      const worn = gear[slot].find((candidate) => candidate.id === progress.gear[slot]);
      const cost = worn ? upgradeCost(gear, worn, progress.gearLevel(slot, worn.id)) : null;
      return peeked === null && cost !== null && progress.fish >= cost;
    };
    addPressFeel(this, upBg, upButton, canUpgrade);
    upBg.on('pointerdown', () => {
      if (!canUpgrade() || !progress.upgradeGear(slot, progress.gear[slot])) return;
      audio.play('merge');
      this.fish.set(progress.fish);
      this.tweens.add({
        targets: desc,
        scale: { from: GEAR_FEEL.upgradePulse, to: 1 },
        duration: GEAR_FEEL.upgradePulseMs,
        ease: 'Cubic.easeOut',
      });
      for (const refreshSlot of this.refreshers) refreshSlot();
    });

    const refresh = (): void => {
      const wornId = progress.gear[slot];
      for (const { item, bg, label, lock } of chips) {
        const owned = progress.ownsGear(slot, item.id);
        const selected = item.id === wornId;
        bg.setFillStyle(selected ? COLORS.brass : COLORS.panel);
        bg.setStrokeStyle(1, item === peeked ? COLORS.range : COLORS.line, selected ? 0 : 1);
        label.setColor(selected ? TEXT_COLORS.dark : owned ? TEXT_COLORS.fg : TEXT_COLORS.muted);
        lock.setVisible(!owned);
      }

      if (peeked) {
        // Закрытый предмет: что он даёт и откуда берётся. Прокачивать и надевать его пока нельзя.
        desc.setColor(TEXT_COLORS.muted).setText(`${t('gear.locked')} · ${describeGear(peeked)}`);
        upButton.setVisible(false);
        return;
      }

      const worn = gear[slot].find((candidate) => candidate.id === wornId);
      if (!worn) {
        desc.setText('');
        upButton.setVisible(false);
        return;
      }
      const level = progress.gearLevel(slot, worn.id);
      const cost = upgradeCost(gear, worn, level);
      const text = describeGear(gearAtLevel(worn, level));
      // Уровень показываем только у того, что прокачивается.
      desc.setColor(TEXT_COLORS.brass).setText(worn.upgrades ? `${t('gear.level', { level })} · ${text}` : text);

      upButton.setVisible(worn.upgrades !== undefined);
      const affordable = cost !== null && progress.fish >= cost;
      upBg.setFillStyle(affordable ? COLORS.brass : COLORS.panel).setStrokeStyle(1, COLORS.line, affordable ? 0 : 1);
      const color = affordable ? TEXT_COLORS.dark : TEXT_COLORS.muted;
      if (cost === null) {
        upLabel.setText(t('gear.maxLevel')).setColor(color).setY(0);
        upIcon.setVisible(false);
        upCost.setVisible(false);
        return;
      }
      upLabel.setText(t('gear.upgrade')).setColor(color).setY(UPGRADE.labelY);
      upCost.setVisible(true).setText(String(cost)).setColor(color);
      // Рыбка и цена вместе стоят по центру кнопки.
      const width = UPGRADE.icon + UPGRADE.gap + upCost.width;
      upIcon.setVisible(true).setX(-width / 2 + UPGRADE.icon / 2);
      upCost.setX(-width / 2 + UPGRADE.icon + UPGRADE.gap);
    };
    this.refreshers.push(refresh);
    refresh();

    return rowY + descH / 2;
  }
}
