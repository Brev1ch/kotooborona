import Phaser from 'phaser';
import { addArtOrShape, art } from '../art';
import { cats, elementColor, type ElementId } from '../data';
import { RITUAL_FEEL, SHOT_FEEL } from '../feel';
import { COLORS, DEPTH, FONTS, TEXT_COLORS } from '../layout';
import { ensureTextures, Texture } from '../scenes/textures';
import { artId } from '../systems/Art';
import type { Cat } from './Cat';
import { PieceView } from './PieceView';

const BODY_RADIUS = 21;
const BODY_Y = 3;
/** Прямоугольник вокруг центра, в который помещается силуэт. */
const SHAPE_W = 48;
const SHAPE_H = 58;
/** Уровень кота на готовой картинке: кружок в правом верхнем углу, чтобы цифра не закрывала мордочку и не уходила за край экрана, когда кота несут над нижней полосой. */
const BADGE = { x: 15, y: -19, size: 17 };

/** Силуэт кота: два уха и круглое тело. Рисуется вокруг начала координат `g`. */
export function drawCatShape(g: Phaser.GameObjects.Graphics, earLeft: number, earRight: number, body: number): void {
  g.fillStyle(earLeft);
  g.fillTriangle(-20, -5, -17, -25, -4, -16);
  g.fillStyle(earRight);
  g.fillTriangle(20, -5, 17, -25, 4, -16);
  g.fillStyle(body);
  g.fillCircle(0, BODY_Y, BODY_RADIUS);
}

/**
 * Картинка кота стихии: готовый арт, а пока его нет — силуэт, запечённый в текстуру, по одной на стихию.
 * У гибрида уши силуэта в цветах исходных стихий.
 */
export function addCatImage(scene: Phaser.Scene, element: ElementId): Phaser.GameObjects.Image {
  const [earLeft, earRight] = cats.elements[element].from ?? [element, element];
  return addArtOrShape(scene, artId.cat(element), `cat-${element}`, SHAPE_W, SHAPE_H, (shape) => {
    drawCatShape(shape, elementColor(earLeft), elementColor(earRight), elementColor(element));
  });
}

/** Вид кота: картинка стихии и цифра уровня. */
export class CatView extends PieceView {
  private readonly shape: Phaser.GameObjects.Image;
  /** Масштаб картинки силуэта в покое: текстура крупнее, чем кот на экране. */
  private readonly shapeScale: number;
  private readonly label: Phaser.GameObjects.Text;
  private badge: Phaser.GameObjects.Image | null = null;
  private ritualRing: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, cat: Cat) {
    super(scene, x, y);

    const g = addCatImage(scene, cat.element);
    const shapeScale = g.scale;

    // На силуэте цифра уровня стоит посреди тела; на готовой картинке там мордочка, и цифра уходит в кружок в углу.
    const drawn = art.find(scene, artId.cat(cat.element)) !== null;
    const level = scene.add
      .text(drawn ? BADGE.x : 0, drawn ? BADGE.y : BODY_Y, String(cat.level), {
        fontFamily: FONTS.display,
        fontSize: drawn ? '13px' : '18px',
        color: drawn ? TEXT_COLORS.fg : TEXT_COLORS.dark,
      })
      .setOrigin(0.5);

    this.shape = g;
    this.shapeScale = shapeScale;
    this.label = level;
    this.add(g);
    if (drawn) {
      ensureTextures(scene);
      this.badge = scene.add.image(BADGE.x, BADGE.y, Texture.disc).setDisplaySize(BADGE.size, BADGE.size).setTint(COLORS.bg);
      this.add(this.badge);
    }
    this.add(level);
    this.setDepth(DEPTH.cat);
    scene.add.existing(this);
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
}
