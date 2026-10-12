import Phaser from 'phaser';
import { cats, elementColor } from '../data';
import { CAT_FEEL, MERGE_FEEL, RITUAL_FEEL } from '../feel';
import { COLORS, DEPTH, FONTS, TEXT_COLORS } from '../layout';
import type { Cat } from './Cat';

const BODY_RADIUS = 21;
const BODY_Y = 3;

/** Временный вид кота: круг цвета стихии, уши и цифра уровня. */
export class CatView extends Phaser.GameObjects.Container {
  private readonly shape: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private ritualRing: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, cat: Cat) {
    super(scene, x, y);

    const g = scene.add.graphics();
    // У гибрида уши в цветах исходных стихий.
    const [earLeft, earRight] = cats.elements[cat.element].from ?? [cat.element, cat.element];
    g.fillStyle(elementColor(earLeft));
    g.fillTriangle(-20, -5, -17, -25, -4, -16);
    g.fillStyle(elementColor(earRight));
    g.fillTriangle(20, -5, 17, -25, 4, -16);
    g.fillStyle(elementColor(cat.element));
    g.fillCircle(0, BODY_Y, BODY_RADIUS);

    const level = scene.add
      .text(0, BODY_Y, String(cat.level), {
        fontFamily: FONTS.display,
        fontSize: '18px',
        color: TEXT_COLORS.dark,
      })
      .setOrigin(0.5);

    this.shape = g;
    this.label = level;
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

  /** Кот проводит ритуал: полупрозрачный, вокруг — кольцо прогресса. */
  startRitual(): void {
    this.shape.setAlpha(RITUAL_FEEL.catAlpha);
    this.label.setAlpha(RITUAL_FEEL.catAlpha);
    this.ritualRing = this.scene.add.graphics();
    this.add(this.ritualRing);
    this.setRitualProgress(0);
  }

  /** `progress` — доля прошедшего ритуала от 0 до 1. */
  setRitualProgress(progress: number): void {
    const ring = this.ritualRing;
    if (!ring) return;
    const start = -Math.PI / 2;
    ring.clear();
    ring.lineStyle(RITUAL_FEEL.ringLineWidth, COLORS.crystal, RITUAL_FEEL.ringTrackAlpha);
    ring.strokeCircle(0, BODY_Y, RITUAL_FEEL.ringRadius);
    ring.lineStyle(RITUAL_FEEL.ringLineWidth, COLORS.crystal);
    ring.beginPath();
    ring.arc(0, BODY_Y, RITUAL_FEEL.ringRadius, start, start + Math.PI * 2 * Phaser.Math.Clamp(progress, 0, 1));
    ring.strokePath();
  }

  /** Ритуал окончен: кот проявляется со вспышкой. */
  finishRitual(): void {
    this.ritualRing?.destroy();
    this.ritualRing = null;

    this.scene.tweens.add({
      targets: [this.shape, this.label],
      alpha: 1,
      duration: RITUAL_FEEL.revealMs,
    });

    const flash = this.scene.add.graphics();
    flash.fillStyle(COLORS.flash);
    flash.fillCircle(0, BODY_Y, RITUAL_FEEL.flashRadius);
    flash.setAlpha(RITUAL_FEEL.flashAlpha);
    this.add(flash);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: RITUAL_FEEL.flashScale,
      duration: RITUAL_FEEL.flashMs,
      onComplete: () => flash.destroy(),
    });

    this.scene.tweens.killTweensOf(this);
    this.setScale(RITUAL_FEEL.popScale);
    this.scene.tweens.add({
      targets: this,
      scale: 1,
      duration: RITUAL_FEEL.popMs,
      ease: RITUAL_FEEL.popEase,
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
