import Phaser from 'phaser';
import { cats } from '../data';
import { addCatImage } from '../entities/CatView';
import { t } from '../i18n';
import { BOOK, bookBackCenter, COLORS, FONTS, GAME_W, TEXT_COLORS } from '../layout';
import { progress } from '../progress';
import { bookEntries, type BookEntry } from '../systems/Book';
import { SceneKey } from './keys';
import { fadeIn, fadeOut } from './transitions';
import { addButton } from './widgets';

/** Книга котов: открытые — с описанием эффекта, неоткрытые — «???» с рецептом. */
export class BookScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Book);
  }

  create(): void {
    fadeIn(this);
    const entries = bookEntries(cats, (element) => progress.hasCat(element));
    const found = entries.filter((entry) => entry.known).length;

    this.add
      .text(GAME_W / 2, BOOK.titleY, t('book.title'), {
        fontFamily: FONTS.display,
        fontSize: '26px',
        color: TEXT_COLORS.fg,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_W / 2, BOOK.countY, t('book.count', { found, total: entries.length }), {
        fontFamily: FONTS.body,
        fontSize: '14px',
        color: TEXT_COLORS.brass,
      })
      .setOrigin(0.5);

    // По строкам слева направо: четыре базовые стихии — две верхние строки, ниже гибриды.
    const columns = BOOK.columnX.length;
    entries.forEach((entry, i) =>
      this.addCell(entry, BOOK.columnX[i % columns], BOOK.listY + Math.floor(i / columns) * BOOK.rowH + BOOK.rowH / 2),
    );

    addButton(this, ...bookBackCenter(), BOOK.backW, BOOK.backH, t('nav.back'), false, () => {
      fadeOut(this, () => this.scene.start(SceneKey.Menu));
    });
  }

  private addCell(entry: BookEntry, x: number, y: number): void {
    const { element, known, recipe } = entry;

    // Неоткрытый кот — силуэт.
    const icon = addCatImage(this, element).setPosition(x + BOOK.iconX, y);
    icon.setScale(icon.scale * BOOK.iconScale);
    if (!known) icon.setTintFill(COLORS.line);

    const title = known ? t('book.catName', { name: t(`cat.${element}`) }) : t('book.unknown');
    // Рецепт неоткрытого кота — названия двух стихий, которые нужно смешать.
    const detail =
      !known && recipe
        ? t('book.recipe', { first: t(`cat.${recipe[0]}`), second: t(`cat.${recipe[1]}`) })
        : t(`cat.${element}.desc`);

    const wrap = { width: BOOK.textW, useAdvancedWrap: true };
    const name = this.add.text(x + BOOK.textX, 0, title, {
      fontFamily: FONTS.body,
      fontSize: '15px',
      color: known ? TEXT_COLORS.fg : TEXT_COLORS.muted,
      wordWrap: wrap,
    });
    const effect = this.add.text(x + BOOK.textX, 0, detail, {
      fontFamily: FONTS.body,
      fontSize: '12px',
      color: TEXT_COLORS.muted,
      wordWrap: wrap,
    });
    // Имя и эффект — одним блоком посередине клетки, сколько бы строк ни занял эффект.
    const top = y - (name.height + BOOK.textGap + effect.height) / 2;
    name.setY(top);
    effect.setY(top + name.height + BOOK.textGap);
  }
}
