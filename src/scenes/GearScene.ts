import Phaser from 'phaser';
import { audio } from '../audio';
import { cats, gear, type GearItem, type GearSlot } from '../data';
import { t, type StringKey } from '../i18n';
import { COLORS, FONTS, GAME_W, GEAR, gearButtonCenter, MIN_TOUCH, TEXT_COLORS } from '../layout';
import { progress } from '../progress';
import { itemBonuses, type BonusLine } from '../systems/Loadout';
import { GEAR_SLOTS } from '../systems/Progress';
import { SceneKey, type LevelSceneData } from './keys';
import { fadeIn, fadeOut } from './transitions';
import { addButton, addPressFeel } from './widgets';

interface Chip {
  id: string;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/** Экран перед уровнем: игрок выбирает по предмету в каждый из трёх слотов. */
export class GearScene extends Phaser.Scene {
  private levelId!: string;

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
        fontSize: '26px',
        color: TEXT_COLORS.fg,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_W / 2, GEAR.subtitleY, t('gear.title'), {
        fontFamily: FONTS.body,
        fontSize: '14px',
        color: TEXT_COLORS.muted,
      })
      .setOrigin(0.5);

    let y = GEAR.listY;
    for (const slot of GEAR_SLOTS) y = this.addSlot(slot, y) + GEAR.blockGap;

    const data: LevelSceneData = { levelId: this.levelId };
    addButton(this, ...gearButtonCenter('back'), GEAR.backW, GEAR.buttonH, t('nav.back'), false, () => {
      fadeOut(this, () => this.scene.start(SceneKey.Menu));
    });
    addButton(this, ...gearButtonCenter('start'), GEAR.startW, GEAR.buttonH, t('gear.start'), true, () => {
      fadeOut(this, () => this.scene.start(SceneKey.Game, data));
    });
  }

  /** Слот: заголовок, предметы плашками в несколько рядов и бонус надетого предмета. Возвращает нижний край блока. */
  private addSlot(slot: GearSlot, top: number): number {
    const { pad, headH, chipH, chipGap, chipPadX, descH } = GEAR;

    this.add
      .text(pad, top, t(`gear.slot.${slot}`).toUpperCase(), {
        fontFamily: FONTS.body,
        fontSize: '11px',
        color: TEXT_COLORS.muted,
      })
      .setLetterSpacing(0.6);

    const chips: Chip[] = [];
    let x = pad;
    let y = top + headH;
    for (const item of gear[slot]) {
      const label = this.add
        .text(0, 0, t(`gear.${slot}.${item.id}` as StringKey), { fontFamily: FONTS.body, fontSize: '14px' })
        .setOrigin(0.5);
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
      const chip = this.add.container(x + width / 2, y + chipH / 2, [bg, label]);
      chips.push({ id: item.id, bg, label });
      x += width + chipGap;

      addPressFeel(this, bg, chip);
      bg.on('pointerdown', () => {
        audio.play('click');
        progress.selectGear(slot, item.id);
        refresh();
      });
    }

    const descY = y + chipH + chipGap;
    const desc = this.add.text(pad, descY, '', { fontFamily: FONTS.body, fontSize: '13px', color: TEXT_COLORS.brass });

    const refresh = (): void => {
      const worn = progress.gear[slot];
      for (const { id, bg, label } of chips) {
        const selected = id === worn;
        bg.setFillStyle(selected ? COLORS.brass : COLORS.panel);
        bg.setStrokeStyle(1, COLORS.line, selected ? 0 : 1);
        label.setColor(selected ? TEXT_COLORS.dark : TEXT_COLORS.fg);
      }
      const item = gear[slot].find((candidate) => candidate.id === worn);
      desc.setText(item ? this.describe(item) : '');
    };
    refresh();

    return descY + descH;
  }

  private describe(item: GearItem): string {
    const lines = itemBonuses(item, cats).map((line) => this.bonusText(line));
    return lines.length > 0 ? lines.join(' · ') : t('gear.bonus.none');
  }

  private bonusText(line: BonusLine): string {
    if (line.kind === 'summonChance') {
      return t('gear.bonus.summonChance', { ...line, element: t(`cat.${line.element}`) });
    }
    return t(`gear.bonus.${line.kind}`, { ...line });
  }
}
