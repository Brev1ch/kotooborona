import Phaser from 'phaser';
import { cats, elementColor } from '../data';
import { drawCatShape } from '../entities/CatView';
import { t } from '../i18n';
import { BOOK, bookBackCenter, COLORS, FONTS, GAME_W, TEXT_COLORS } from '../layout';
import { progress } from '../progress';
import { bookEntries, type BookEntry } from '../systems/Book';
import { SceneKey } from './keys';
import { addButton } from './widgets';

/** Книга котов: открытые — с описанием эффекта, неоткрытые — «???» с рецептом. */
export class BookScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Book);
  }

  create(): void {
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

    entries.forEach((entry, i) => this.addRow(entry, BOOK.listY + i * BOOK.rowH + BOOK.rowH / 2));

    addButton(this, ...bookBackCenter(), BOOK.backW, BOOK.backH, t('nav.back'), false, () => {
      this.scene.start(SceneKey.Menu);
    });
  }

  private addRow(entry: BookEntry, y: number): void {
    const { element, known, recipe } = entry;

    const icon = this.add.graphics({ x: BOOK.iconX, y }).setScale(BOOK.iconScale);
    if (known) {
      const [earLeft, earRight] = recipe ?? [element, element];
      drawCatShape(icon, elementColor(earLeft), elementColor(earRight), elementColor(element));
    } else {
      drawCatShape(icon, COLORS.line, COLORS.line, COLORS.line);
    }

    const title = known ? t('book.catName', { name: t(`cat.${element}`) }) : t('book.unknown');
    // Рецепт неоткрытого кота — названия двух стихий, которые нужно смешать.
    const detail =
      !known && recipe
        ? t('book.recipe', { first: t(`cat.${recipe[0]}`), second: t(`cat.${recipe[1]}`) })
        : t(`cat.${element}.desc`);

    this.add
      .text(BOOK.textX, y - 9, title, {
        fontFamily: FONTS.body,
        fontSize: '15px',
        color: known ? TEXT_COLORS.fg : TEXT_COLORS.muted,
      })
      .setOrigin(0, 0.5);
    this.add
      .text(BOOK.textX, y + 10, detail, { fontFamily: FONTS.body, fontSize: '12px', color: TEXT_COLORS.muted })
      .setOrigin(0, 0.5);
  }
}
