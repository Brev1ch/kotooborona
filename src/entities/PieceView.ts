import Phaser from 'phaser';
import { CAT_FEEL, MERGE_FEEL } from '../feel';
import { DEPTH } from '../layout';
import { spawn } from './motion';

/** То, что стоит в клетке и перетаскивается пальцем: кот или строение. Появление, взятие в руку, посадка и исчезновение у них общие. */
export class PieceView extends Phaser.GameObjects.Container {
  playSpawn(delay = 0): void {
    spawn(this.scene, this, delay);
  }

  /** Взяли в руку: поверх остальных и чуть крупнее. */
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

  /** Плавно ставит в точку и возвращает обычный размер. */
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

  /** Стягивает в точку (слияние, продажа) и удаляет. */
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
