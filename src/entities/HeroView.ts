import Phaser from 'phaser';
import type { Point } from '../data';
import { HERO_FEEL } from '../feel';
import { COLORS, DEPTH } from '../layout';
import { addBakedShape, CIRCLE_RADIUS, ensureTextures, Texture } from '../scenes/textures';

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

/** Временный вид героя: кот в мантии и шляпе мага, с посохом. Сфера на посохе показывает готовность умения. */
export class HeroView extends Phaser.GameObjects.Container {
  private readonly staff: Phaser.GameObjects.Container;
  private readonly orb: Phaser.GameObjects.Image;
  private readonly halo: Phaser.GameObjects.Image;
  private ready: boolean | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, orbColor: number) {
    super(scene, x, y);

    // Неподвижные части запечены в текстуры; сфера и ореол — круги из общей текстуры, окрашенные в цвет посоха.
    ensureTextures(scene);
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
    this.halo = scene.add.image(ORB_X, ORB_Y, Texture.disc).setTint(orbColor);
    this.orb = scene.add.image(ORB_X, ORB_Y, Texture.disc).setTint(orbColor);
    this.staff = scene.add.container(0, 0, [stick, this.halo, this.orb]);

    this.add([body, head, this.staff]);
    this.setDepth(DEPTH.cat);
    scene.add.existing(this);

    scene.tweens.add({
      targets: head,
      y: { from: -HERO_FEEL.bobY, to: HERO_FEEL.bobY },
      duration: HERO_FEEL.bobMs,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    this.setReady(true);
  }

  /** Точка в координатах поля, откуда вылетает метеор. */
  orbPoint(): Point {
    return [this.x + ORB_X, this.y + ORB_Y];
  }

  /** Умение готово — сфера светится и пульсирует; на перезарядке — маленькая и тусклая. */
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
    const flash = this.scene.add.image(ORB_X, ORB_Y, Texture.disc).setScale(ORB_SCALE);
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
