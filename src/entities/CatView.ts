import Phaser from 'phaser';
import { elementColor } from '../data';
import { CAT_FEEL, MERGE_FEEL } from '../feel';
import { DEPTH, FONTS, TEXT_COLORS } from '../layout';
import type { Cat } from './Cat';

const BODY_RADIUS = 21;
const BODY_Y = 3;

/** Временный вид кота: круг цвета стихии, уши и цифра уровня. */
export class CatView extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, cat: Cat) {
    super(scene, x, y);

    const g = scene.add.graphics();
    g.fillStyle(elementColor(cat.element));
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
    this.setDepth(DEPTH.cat);
    scene.add.existing(this);
  }

  playSpawn(delay = 0): void {
    this.setScale(0);
    this.scene.tweens.add({
      targets: this,
      scale: 1,
      delay,
      duration: CAT_FEEL.spawnMs,
      ease: CAT_FEEL.spawnEase,
    });
  }

  /** Кота взяли: поверх остальных и чуть крупнее. */
  lift(): void {
    this.scene.tweens.killTweensOf(this);
    this.setDepth(DEPTH.dragged);
    this.scene.tweens.add({
      targets: this,
      scale: CAT_FEEL.liftScale,
      duration: CAT_FEEL.liftMs,
      ease: CAT_FEEL.liftEase,
    });
  }

  /** Плавно ставит кота в точку и возвращает обычный размер. */
  settle(x: number, y: number, duration: number): void {
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      x,
      y,
      scale: 1,
      duration,
      ease: CAT_FEEL.settleEase,
      onComplete: () => this.setDepth(DEPTH.cat),
    });
  }

  /** Стягивает кота в точку слияния и удаляет его. */
  absorb(x: number, y: number): void {
    this.scene.tweens.killTweensOf(this);
    this.setDepth(DEPTH.dragged);
    this.scene.tweens.add({
      targets: this,
      x,
      y,
      scale: MERGE_FEEL.absorbScale,
      duration: MERGE_FEEL.absorbMs,
      ease: MERGE_FEEL.absorbEase,
      onComplete: () => this.destroy(),
    });
  }
}
