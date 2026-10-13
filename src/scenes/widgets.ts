import type Phaser from 'phaser';
import { BUTTON_FEEL } from '../feel';
import { COLORS, FONTS, TEXT_COLORS } from '../layout';

/**
 * Кнопка перехода между экранами: главная — латунная, второстепенная — контурная.
 * Срабатывает один раз, на отпускание.
 */
export function addButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  primary: boolean,
  onClick: () => void,
): Phaser.GameObjects.Container {
  const bg = scene.add
    .rectangle(0, 0, width, height, primary ? COLORS.brass : COLORS.panel)
    .setStrokeStyle(1, COLORS.line, primary ? 0 : 1)
    .setInteractive({ useHandCursor: true });
  const text = scene.add
    .text(0, 0, label, {
      fontFamily: FONTS.display,
      fontSize: '15px',
      color: primary ? TEXT_COLORS.dark : TEXT_COLORS.fg,
    })
    .setOrigin(0.5);
  const button = scene.add.container(x, y, [bg, text]);

  bg.on('pointerdown', () => {
    scene.tweens.add({ targets: button, scale: BUTTON_FEEL.pressScale, duration: BUTTON_FEEL.pressMs, yoyo: true });
  });
  bg.once('pointerup', onClick);
  return button;
}
