import Phaser from 'phaser';
import { cats } from '../data';
import { FONTS, TEXT_COLORS } from '../layout';
import type { Cat } from './Cat';

const BODY_RADIUS = 21;
const BODY_Y = 3;
const SPAWN_MS = 280;

/** Временный вид кота: круг цвета стихии, уши и цифра уровня. */
export class CatView extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, cat: Cat) {
    super(scene, x, y);

    const color = Phaser.Display.Color.HexStringToColor(cats.elements[cat.element].color).color;
    const g = scene.add.graphics();
    g.fillStyle(color);
    g.fillTriangle(-20, -5, -17, -25, -4, -16);
    g.fillTriangle(20, -5, 17, -25, 4, -16);
    g.fillCircle(0, BODY_Y, BODY_RADIUS);

    const level = scene.add
      .text(0, BODY_Y, String(cat.level), {
        fontFamily: FONTS.display,
        fontSize: '18px',
        color: TEXT_COLORS.dark,
      })
      .setOrigin(0.5);

    this.add([g, level]);
    scene.add.existing(this);
  }

  playSpawn(): void {
    this.setScale(0);
    this.scene.tweens.add({ targets: this, scale: 1, duration: SPAWN_MS, ease: 'Back.easeOut' });
  }
}
