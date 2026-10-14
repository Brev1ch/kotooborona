import Phaser from 'phaser';
import { addArtOrShape, art } from '../art';
import { cats, elementColor, levels, type ElementId } from '../data';
import { CAT_LEVEL_FEEL, RITUAL_FEEL, SHOT_FEEL, type CatLevelMode } from '../feel';
import { COLORS, DEPTH, FONTS, SLOT_RADIUS, TEXT_COLORS } from '../layout';
import { addBakedShape, ensureTextures, Texture } from '../scenes/textures';
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

/** Способ показа уровня: из `feel.ts`, а в разработке и в смоук-проверке — из `?catLevel=` в адресе. */
function levelMode(): CatLevelMode {
  const params = new URLSearchParams(location.search);
  const asked = import.meta.env.DEV || params.has('smoke') ? params.get('catLevel') : null;
  return asked === 'plate' || asked === 'stars' || asked === 'glow' ? asked : CAT_LEVEL_FEEL.mode;
}

/** Пятиконечная звезда вокруг начала координат. */
function starPoints(x: number, radius: number): Phaser.Math.Vector2[] {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    return new Phaser.Math.Vector2(x + Math.cos(angle) * r, Math.sin(angle) * r);
  });
}

/** Вид кота: картинка стихии и отметка уровня. */
export class CatView extends PieceView {
  private readonly shape: Phaser.GameObjects.Image;
  /** Масштаб картинки силуэта в покое: текстура крупнее, чем кот на экране. */
  private readonly shapeScale: number;
  /** Отметка уровня: цифра, плашка, звёзды, свечение — всё, что бледнеет вместе с котом на время ритуала. */
  private readonly marks: (Phaser.GameObjects.Image | Phaser.GameObjects.Text)[] = [];
  /** Прозрачность отметок до ритуала: у свечения и ободка она своя. */
  private readonly markAlpha = new Map<Phaser.GameObjects.Image | Phaser.GameObjects.Text, number>();
  private ritualRing: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, cat: Cat) {
    super(scene, x, y);

    const g = addCatImage(scene, cat.element);
    this.shape = g;
    this.shapeScale = g.scale;

    if (art.find(scene, artId.cat(cat.element))) {
      // На готовой картинке посреди кота мордочка: уровень показан под котом или вокруг него.
      g.setY(-CAT_LEVEL_FEEL.artLift);
      const mode = levelMode();
      if (mode === 'glow') this.addGlow(cat.level);
      this.add(g);
      if (mode === 'plate') this.addPlate(cat.level);
      if (mode === 'stars') this.addStars(cat.level);
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
  }

  /** Цифра уровня на тёмной плашке под котом. */
  private addPlate(level: number): void {
    const { y, width, height, radius, alpha, fontSize } = CAT_LEVEL_FEEL.plate;
    const plate = addBakedShape(this.scene, 'cat-level-plate', width, height, (shape) => {
      shape.fillStyle(COLORS.bg, alpha);
      shape.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
    }).setPosition(0, y);
    const label = this.scene.add
      .text(0, y, String(level), { fontFamily: FONTS.display, fontSize: `${fontSize}px`, color: TEXT_COLORS.brass })
      .setOrigin(0.5);
    this.marks.push(plate, label);
    this.add([plate, label]);
  }

  /** Ряд звёздочек по числу уровней; запекается одной картинкой на каждое число. */
  private addStars(level: number): void {
    const { y, size, step, padX, height, backAlpha } = CAT_LEVEL_FEEL.stars;
    const width = (level - 1) * step + size + padX * 2;
    const stars = addBakedShape(this.scene, `cat-level-stars-${level}`, width, height, (shape) => {
      shape.fillStyle(COLORS.bg, backAlpha);
      shape.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
      shape.fillStyle(COLORS.brass);
      for (let i = 0; i < level; i++) shape.fillPoints(starPoints((i - (level - 1) / 2) * step, size / 2), true);
    }).setPosition(0, y);
    this.marks.push(stars);
    this.add(stars);
  }

  /** Свечение за котом и, на высоких уровнях, ободок клетки: цвет по ступени уровня. */
  private addGlow(level: number): void {
    const { radius, ringWidth, tiers } = CAT_LEVEL_FEEL.glow;
    const tier = [...tiers].reverse().find((entry) => level >= entry.from) ?? tiers[0];
    const alpha = Math.min(1, tier.alpha + (level - tier.from) * tier.alphaPerLevel);
    ensureTextures(this.scene);
    if (alpha > 0) {
      const glow = this.scene.add.image(0, 0, Texture.disc).setDisplaySize(radius * 2, radius * 2).setTint(tier.color).setAlpha(alpha);
      this.marks.push(glow);
      this.add(glow);
    }
    if (tier.ring > 0) {
      const side = levels.slotSize;
      const ring = addBakedShape(this.scene, 'cat-level-ring', side, side, (shape) => {
        shape.lineStyle(ringWidth, COLORS.flash);
        shape.strokeRoundedRect(-side / 2 + ringWidth / 2, -side / 2 + ringWidth / 2, side - ringWidth, side - ringWidth, SLOT_RADIUS);
      })
        .setTint(tier.color)
        .setAlpha(tier.ring);
      this.marks.push(ring);
      this.add(ring);
    }
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
    for (const mark of this.marks) {
      this.markAlpha.set(mark, mark.alpha);
      mark.setAlpha(mark.alpha * RITUAL_FEEL.catAlpha);
    }
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
      this.scene.tweens.add({ targets: mark, alpha: this.markAlpha.get(mark) ?? 1, duration: RITUAL_FEEL.revealMs });
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
