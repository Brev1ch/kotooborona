import Phaser from 'phaser';
import { art } from '../art';
import type { Point } from '../data';
import { HERO_FEEL } from '../feel';
import { COLORS, DEPTH } from '../layout';
import { addBakedShape, CIRCLE_RADIUS, drawChargeRing, ensureTextures, Texture } from '../scenes/textures';
import { artId } from '../systems/Art';

const ORB_X = 20;
const ORB_Y = -19;
/** Сколько отрезков в скруглённом верхе мантии. */
const MANTLE_STEPS = 10;
/** Прямоугольник вокруг центра героя, в который помещается каждая его часть. */
const PART_W = 52;
const PART_H = 76;
/** Масштаб картинки-круга для сферы и ореола в покое. */
const ORB_SCALE = HERO_FEEL.orbRadius / CIRCLE_RADIUS;
const HALO_SCALE = ORB_SCALE * HERO_FEEL.haloScale;

/**
 * Вид героя: кот в мантии и шляпе мага, с посохом. Сфера на посохе показывает готовность умения:
 * её и ореол рисует игра и поверх готового арта, поэтому на картинке героя посох без сферы.
 */
export class HeroView extends Phaser.GameObjects.Container {
  private readonly staff: Phaser.GameObjects.Container;
  private readonly orb: Phaser.GameObjects.Image;
  private readonly halo: Phaser.GameObjects.Image;
  private ready: boolean | null = null;
  /** Кольцо заряда метеора вокруг сферы и сколько процентов на нём нарисовано. */
  private readonly ring: Phaser.GameObjects.Graphics;
  private shownCharge = -1;
  private orbColor: number;

  constructor(scene: Phaser.Scene, x: number, y: number, orbColor: number) {
    super(scene, x, y);

    // Неподвижные части запечены в текстуры; сфера и ореол — круги из общей текстуры, окрашенные в цвет посоха.
    ensureTextures(scene);
    const picture = art.add(scene, artId.hero);
    // Сфера — на навершии посоха: у готовой картинки точка из манифеста (`anchors.orb`), у рисунка кодом — своя.
    const anchor = picture ? art.anchor(artId.hero, 'orb') : null;
    const [orbX, orbY] = picture && anchor ? [(anchor[0] - 0.5) * picture.displayWidth, (anchor[1] - 0.5) * picture.displayHeight] : [ORB_X, ORB_Y];
    this.halo = scene.add.image(orbX, orbY, Texture.disc).setTint(orbColor);
    this.orb = scene.add.image(orbX, orbY, Texture.disc).setTint(orbColor);
    this.orbColor = orbColor;
    this.ring = scene.add.graphics({ x: orbX, y: orbY });
    this.staff = scene.add.container(0, 0, [this.halo, this.ring, this.orb]);
    this.add(picture ? [picture, this.staff] : [...this.drawParts(), this.staff]);
    this.setDepth(DEPTH.cat);
    scene.add.existing(this);
    this.setReady(true);
  }

  /** Герой, нарисованный кодом: мантия и голова; посох встаёт под сферу. Голова покачивается. */
  private drawParts(): Phaser.GameObjects.Image[] {
    const { scene } = this;
    const body = addBakedShape(scene, 'hero-body', PART_W, PART_H, (g) => {
      g.fillStyle(COLORS.shadow, HERO_FEEL.shadowAlpha);
      g.fillEllipse(0, 22, 40, 10);
      // Мантия — колокол: парабола от полы до полы с вершиной у шеи.
      const mantle: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i <= MANTLE_STEPS; i++) {
        const k = i / MANTLE_STEPS;
        mantle.push({ x: -18 + 36 * k, y: 22 - 52 * k * (1 - k) });
      }
      g.fillStyle(COLORS.heroMantle);
      g.fillPoints(mantle, true);
    });

    const head = addBakedShape(scene, 'hero-head', PART_W, PART_H, (g) => {
      g.fillStyle(COLORS.heroFur);
      g.fillCircle(0, -2, 12);
      g.fillTriangle(-11, -6, -9, -19, -3, -12);
      g.fillTriangle(11, -6, 9, -19, 3, -12);
      g.fillStyle(COLORS.heroHat);
      g.fillTriangle(-13, -10, 13, -10, 4, -34);
      g.fillStyle(COLORS.brass);
      g.fillRect(-13, -12, 26, 3);
      g.fillStyle(COLORS.bg);
      g.fillCircle(-4, -2, 1.8);
      g.fillCircle(4, -2, 1.8);
    });

    const stick = addBakedShape(scene, 'hero-stick', PART_W, PART_H, (g) => {
      g.lineStyle(3, COLORS.heroStaff);
      g.lineBetween(17, 22, ORB_X, -16);
    });
    this.staff.addAt(stick, 0);

    scene.tweens.add({
      targets: head,
      y: { from: -HERO_FEEL.bobY, to: HERO_FEEL.bobY },
      duration: HERO_FEEL.bobMs,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    return [body, head];
  }

  /** Точка в координатах поля, откуда вылетает метеор. */
  orbPoint(): Point {
    return [this.x + this.orb.x, this.y + this.orb.y];
  }

  /** Заряд метеора от 0 до 1 — кольцом вокруг сферы; перерисовывается, только когда сменился процент. */
  setCharge(progress: number): void {
    const percent = Math.floor(Math.max(0, Math.min(1, progress)) * 100);
    if (percent === this.shownCharge) return;
    this.shownCharge = percent;
    drawChargeRing(this.ring, HERO_FEEL.chargeRadius, HERO_FEEL.chargeWidth, percent / 100, this.orbColor, HERO_FEEL.chargeTrackAlpha);
  }

  /** Умение готово — сфера светится и пульсирует; пока копится заряд — маленькая и тусклая. */
  setReady(ready: boolean): void {
    if (ready === this.ready) return;
    const recharged = this.ready === false && ready;
    this.ready = ready;

    const { tweens } = this.scene;
    tweens.killTweensOf([this.orb, this.halo]);
    if (!ready) {
      this.orb.setScale(ORB_SCALE * HERO_FEEL.orbIdleScale).setAlpha(HERO_FEEL.orbIdleAlpha);
      this.halo.setVisible(false);
      return;
    }

    this.halo.setVisible(true).setScale(HALO_SCALE);
    const pulse = { duration: HERO_FEEL.orbPulseMs, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 };
    tweens.add({
      ...pulse,
      targets: this.orb,
      scale: { from: ORB_SCALE, to: ORB_SCALE * HERO_FEEL.orbPulseScale },
      alpha: { from: HERO_FEEL.orbPulseAlphaFrom, to: HERO_FEEL.orbPulseAlphaTo },
    });
    tweens.add({
      ...pulse,
      targets: this.halo,
      scale: { from: HALO_SCALE, to: HALO_SCALE * HERO_FEEL.orbPulseScale },
      alpha: { from: HERO_FEEL.haloPulseAlphaFrom, to: HERO_FEEL.haloPulseAlphaTo },
    });
    if (recharged) this.playRecharged();
  }

  /** Вспышка на сфере: умение перезарядилось. */
  private playRecharged(): void {
    const flash = this.scene.add.image(this.orb.x, this.orb.y, Texture.disc).setScale(ORB_SCALE);
    this.staff.add(flash);
    this.scene.tweens.add({
      targets: flash,
      scale: ORB_SCALE * HERO_FEEL.readyPopScale,
      alpha: 0,
      duration: HERO_FEEL.readyPopMs,
      onComplete: () => flash.destroy(),
    });
  }

  /** Герой бросает метеор: посох вздрагивает. */
  playCast(): void {
    this.scene.tweens.killTweensOf(this.staff);
    this.staff.setScale(HERO_FEEL.castScale);
    this.scene.tweens.add({ targets: this.staff, scale: 1, duration: HERO_FEEL.castMs });
  }
}
