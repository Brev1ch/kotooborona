import Phaser from 'phaser';
import { audio } from '../audio';
import { BUTTON_FEEL } from '../feel';
import { COLORS, FONTS, MIN_TOUCH, TEXT_COLORS } from '../layout';

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
    audio.play('click');
    scene.tweens.add({ targets: button, scale: BUTTON_FEEL.pressScale, duration: BUTTON_FEEL.pressMs, yoyo: true });
  });
  bg.once('pointerup', onClick);
  return button;
}

/** Кнопка звука: динамик с волнами, а когда звук выключен — перечёркнутый. Состояние хранится в сохранении. */
export function addSoundButton(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const bg = scene.add
    .rectangle(0, 0, MIN_TOUCH, MIN_TOUCH, COLORS.panel)
    .setStrokeStyle(1, COLORS.line)
    .setName('sound')
    .setInteractive({ useHandCursor: true });
  const icon = scene.add.graphics();
  const button = scene.add.container(x, y, [bg, icon]);

  const draw = (on: boolean): void => {
    const color = on ? COLORS.range : COLORS.line;
    icon.clear();
    icon.fillStyle(color);
    icon.fillRect(-11, -4, 6, 8);
    icon.fillTriangle(-6, -4, 1, -10, 1, 10);
    icon.fillTriangle(-6, -4, 1, 10, -6, 4);
    icon.lineStyle(2, color);
    if (on) {
      for (const radius of [6, 11]) {
        icon.beginPath();
        icon.arc(1, 0, radius, -Math.PI / 4, Math.PI / 4);
        icon.strokePath();
      }
    } else {
      icon.lineBetween(5, -5, 12, 5);
      icon.lineBetween(12, -5, 5, 5);
    }
  };
  draw(audio.on);

  bg.on('pointerdown', () => {
    draw(audio.toggle());
    // Слышно только при включении: так игрок сразу понимает, что звук вернулся.
    audio.play('click');
    scene.tweens.add({ targets: button, scale: BUTTON_FEEL.pressScale, duration: BUTTON_FEEL.pressMs, yoyo: true });
  });
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
