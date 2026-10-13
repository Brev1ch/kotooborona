import Phaser from 'phaser';
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

const CRYSTAL_TEXTURE = 'crystal';
/** Текстура крупнее, чем значок на экране, чтобы края оставались гладкими. */
const CRYSTAL_TEXTURE_SIZE = 48;

/** Значок кристалла высотой `size`. Нарисован, а не взят из шрифта: на всех устройствах выглядит одинаково. */
export function addCrystalIcon(scene: Phaser.Scene, x: number, y: number, size: number): Phaser.GameObjects.Image {
  if (!scene.textures.exists(CRYSTAL_TEXTURE)) {
    const s = CRYSTAL_TEXTURE_SIZE;
    const half = s / 2;
    const side = s * 0.4;
    const top = new Phaser.Math.Vector2(half, 0);
    const right = new Phaser.Math.Vector2(half + side, half);
    const bottom = new Phaser.Math.Vector2(half, s);
    const left = new Phaser.Math.Vector2(half - side, half);
    const g = scene.make.graphics({}, false);
    g.fillStyle(COLORS.crystal);
    g.fillPoints([top, right, bottom, left], true);
    // Светлая грань сверху слева.
    g.fillStyle(COLORS.crystalLight);
    g.fillPoints([top, new Phaser.Math.Vector2(half, half), left], true);
    g.generateTexture(CRYSTAL_TEXTURE, s, s);
    g.destroy();
  }
  return scene.add.image(x, y, CRYSTAL_TEXTURE).setDisplaySize(size, size);
}
