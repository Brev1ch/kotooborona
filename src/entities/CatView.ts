import Phaser from 'phaser';
import { addArtOrShape, art } from '../art';
import { cats, elementColor, type ElementId } from '../data';
import { CAT_LEVEL_FEEL, RITUAL_FEEL, SHOT_FEEL } from '../feel';
import { COLORS, DEPTH, FONTS, TEXT_COLORS } from '../layout';
import { addBakedShape } from '../scenes/textures';
import { artId } from '../systems/Art';
import type { Cat } from './Cat';
import { PieceView } from './PieceView';

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

/** Номер ступени уровня из `CAT_LEVEL_FEEL.tiers`: последняя, до которой уровень дорос. */
function levelTier(level: number): number {
  const { tiers } = CAT_LEVEL_FEEL;
  let tier = 0;
  tiers.forEach((entry, i) => {
    if (level >= entry.from) tier = i;
  });
  return tier;
}

/**
 * Насколько слой плашки уровня выше самого кота. Плашка — отдельный объект сцены, а не часть кота:
 * иначе хохолок нижнего кота, вздрогнувшего при выстреле, залезал бы на плашку верхнего.
 */
const LEVEL_DEPTH_ABOVE = 0.5;

/** Вид кота: картинка стихии и отметка уровня. */
export class CatView extends PieceView {
  private readonly shape: Phaser.GameObjects.Image;
  /** Масштаб картинки силуэта в покое: текстура крупнее, чем кот на экране. */
  private readonly shapeScale: number;
  /** Отметка уровня: цифра и плашка — то, что бледнеет вместе с котом на время ритуала. */
  private readonly marks: (Phaser.GameObjects.Image | Phaser.GameObjects.Text)[] = [];
  /** Плашка уровня поверх всех котов; каждый кадр перед отрисовкой повторяет положение, размер и прозрачность кота. */
  private levelLayer: Phaser.GameObjects.Container | null = null;
  private ritualRing: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, cat: Cat) {
    super(scene, x, y);

    const g = addCatImage(scene, cat.element);
    this.shape = g;
    this.shapeScale = g.scale;

    if (art.find(scene, artId.cat(cat.element))) {
      // На готовой картинке посреди кота мордочка: уровень показан под котом.
      g.setY(-CAT_LEVEL_FEEL.artLift);
      this.add(g);
      this.addPlate(cat.level);
    } else {
      // У силуэта цифра уровня стоит посреди тела.
      const label = scene.add
        .text(0, BODY_Y, String(cat.level), { fontFamily: FONTS.display, fontSize: '18px', color: TEXT_COLORS.dark })
        .setOrigin(0.5);
      this.marks.push(label);
      this.add([g, label]);
    }
    this.setDepth(DEPTH.cat);
    scene.add.existing(this);
    this.syncLevelLayer();
  }

  /** Цифра уровня на тёмной плашке под котом; рамка плашки — цвет ступени уровня. */
  private addPlate(level: number): void {
    const { y, width, height, radius, alpha, fontSize, border } = CAT_LEVEL_FEEL.plate;
    const tier = levelTier(level);
    const plate = addBakedShape(this.scene, `cat-level-plate-${tier}`, width, height, (shape) => {
      const inset = border / 2;
      shape.fillStyle(COLORS.bg, alpha);
      shape.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
      shape.lineStyle(border, CAT_LEVEL_FEEL.tiers[tier].color);
      shape.strokeRoundedRect(-width / 2 + inset, -height / 2 + inset, width - border, height - border, radius - inset);
    }).setPosition(0, y);
    const label = this.scene.add
      .text(0, y, String(level), { fontFamily: FONTS.display, fontSize: `${fontSize}px`, color: TEXT_COLORS.brass })
      .setOrigin(0.5);
    this.marks.push(plate, label);
    this.levelLayer = this.scene.add.container(this.x, this.y, [plate, label]);
    this.scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.syncLevelLayer, this);
    this.syncLevelLayer();
  }

  private syncLevelLayer(): void {
    this.levelLayer
      ?.setPosition(this.x, this.y)
      .setScale(this.scaleX, this.scaleY)
      .setAlpha(this.alpha)
      .setVisible(this.visible)
      .setDepth(this.depth + LEVEL_DEPTH_ABOVE);
  }

  override destroy(fromScene?: boolean): void {
    this.scene?.events.off(Phaser.Scenes.Events.PRE_RENDER, this.syncLevelLayer, this);
    this.levelLayer?.destroy(fromScene);
    this.levelLayer = null;
    super.destroy(fromScene);
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
    for (const mark of this.marks) mark.setAlpha(RITUAL_FEEL.catAlpha);
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

    this.scene.tweens.add({ targets: this.shape, alpha: 1, duration: RITUAL_FEEL.revealMs });
    for (const mark of this.marks) {
      this.scene.tweens.add({ targets: mark, alpha: 1, duration: RITUAL_FEEL.revealMs });
    }

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
