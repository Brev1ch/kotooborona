import Phaser from 'phaser';
import { cats, elementColor } from '../data';
import { CAT_FEEL, MERGE_FEEL, RITUAL_FEEL, SHOT_FEEL } from '../feel';
import { COLORS, DEPTH, FONTS, TEXT_COLORS } from '../layout';
import { addBakedShape } from '../scenes/textures';
import type { Cat } from './Cat';

const BODY_RADIUS = 21;
const BODY_Y = 3;
/** Прямоугольник вокруг центра, в который помещается силуэт. */
const SHAPE_W = 48;
const SHAPE_H = 58;

/** Силуэт кота: два уха и круглое тело. Рисуется вокруг начала координат `g`. */
export function drawCatShape(g: Phaser.GameObjects.Graphics, earLeft: number, earRight: number, body: number): void {
  g.fillStyle(earLeft);
  g.fillTriangle(-20, -5, -17, -25, -4, -16);
  g.fillStyle(earRight);
  g.fillTriangle(20, -5, 17, -25, 4, -16);
  g.fillStyle(body);
  g.fillCircle(0, BODY_Y, BODY_RADIUS);
}

/** Временный вид кота: круг цвета стихии, уши и цифра уровня. */
export class CatView extends Phaser.GameObjects.Container {
  private readonly shape: Phaser.GameObjects.Image;
  /** Масштаб картинки силуэта в покое: текстура крупнее, чем кот на экране. */
  private readonly shapeScale: number;
  private readonly label: Phaser.GameObjects.Text;
  private ritualRing: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, cat: Cat) {
    super(scene, x, y);

    // У гибрида уши в цветах исходных стихий. Силуэт запечён в текстуру: по одной на стихию.
    const [earLeft, earRight] = cats.elements[cat.element].from ?? [cat.element, cat.element];
    const g = addBakedShape(scene, `cat-${cat.element}`, SHAPE_W, SHAPE_H, (shape) => {
      drawCatShape(shape, elementColor(earLeft), elementColor(earRight), elementColor(cat.element));
    });
    const shapeScale = g.scale;

    const level = scene.add
      .text(0, BODY_Y, String(cat.level), {
        fontFamily: FONTS.display,
        fontSize: '18px',
        color: TEXT_COLORS.dark,
      })
      .setOrigin(0.5);

    this.shape = g;
    this.shapeScale = shapeScale;
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

  /** Отдача при выстреле: вздрагивает только фигура, чтобы не спорить с анимациями самого кота. */
  playShot(): void {
    this.scene.tweens.killTweensOf(this.shape);
    this.shape.setScale(this.shapeScale * SHOT_FEEL.recoilScale);
    this.scene.tweens.add({ targets: this.shape, scale: this.shapeScale, duration: SHOT_FEEL.recoilMs });
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
