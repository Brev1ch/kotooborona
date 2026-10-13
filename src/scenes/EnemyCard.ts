import Phaser from 'phaser';
import { enemies, type EnemyTypeId } from '../data';
import { addEnemyPortrait } from '../entities/EnemyView';
import { t, type StringKey } from '../i18n';
import { COLORS, ENEMY_CARD, FONTS, GAME_H, GAME_W, TEXT_COLORS } from '../layout';
import { traitParams } from '../systems/Bestiary';
import { addButton } from './widgets';

/** Имя врага. */
export function enemyName(type: EnemyTypeId): string {
  return t(`enemy.${type}` as StringKey);
}

/** Особенность врага одной строкой; числа берутся из его данных. */
export function enemyTrait(type: EnemyTypeId): string {
  return t(`enemy.${type}.trait` as StringKey, traitParams(enemies, type));
}

export interface EnemyCardOptions {
  /** Строка над портретом, например «Новый враг». */
  heading?: string;
  button: string;
  onClose: () => void;
}

/**
 * Карточка врага поверх экрана: портрет, имя, описание, особенность и подсказка, кем его бить.
 * Затемнение перехватывает касания, закрывает карточку только кнопка.
 */
export function addEnemyCard(scene: Phaser.Scene, type: EnemyTypeId, options: EnemyCardOptions): Phaser.GameObjects.Container {
  const { y, w, h, pad, headingY, portraitY, portraitSize, nameY, textY, blockGap, labelGap, buttonY, buttonW, buttonH } = ENEMY_CARD;
  const dim = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, COLORS.shadow, 0.6).setInteractive();
  const panel = scene.add.rectangle(0, 0, w, h, COLORS.panel).setStrokeStyle(1, COLORS.line);
  const card = scene.add.container(GAME_W / 2, y, [panel]);

  if (options.heading) {
    card.add(
      scene.add
        .text(0, headingY, options.heading, { fontFamily: FONTS.display, fontSize: '15px', color: TEXT_COLORS.brass })
        .setOrigin(0.5),
    );
  }
  card.add(addEnemyPortrait(scene, type, 0, portraitY, portraitSize));
  card.add(
    scene.add
      .text(0, nameY, enemyName(type), {
        fontFamily: FONTS.display,
        fontSize: '18px',
        color: TEXT_COLORS.fg,
        align: 'center',
        wordWrap: { width: w - pad * 2 },
      })
      .setOrigin(0.5),
  );

  // Абзацы идут друг за другом сверху вниз: высота каждого зависит от языка.
  const left = -w / 2 + pad;
  const wrap = { width: w - pad * 2 };
  let top = textY;
  const addText = (text: string, color: string, size: string, gap: number): void => {
    const line = scene.add.text(left, top, text, { fontFamily: FONTS.body, fontSize: size, color, wordWrap: wrap });
    card.add(line);
    top += line.height + gap;
  };
  addText(t(`enemy.${type}.desc` as StringKey), TEXT_COLORS.fg, '14px', blockGap);
  addText(t('enemy.traitLabel'), TEXT_COLORS.brass, '12px', labelGap);
  addText(enemyTrait(type), TEXT_COLORS.fg, '14px', blockGap);
  addText(t('enemy.tipLabel'), TEXT_COLORS.brass, '12px', labelGap);
  addText(t(`enemy.${type}.tip` as StringKey), TEXT_COLORS.fg, '14px', 0);

  const button = addButton(scene, GAME_W / 2, y + buttonY, buttonW, buttonH, options.button, true, () => {
    for (const part of [dim, card, button]) part.destroy();
    options.onClose();
  });
  return card;
}
