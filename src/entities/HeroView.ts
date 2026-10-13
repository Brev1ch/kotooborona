import Phaser from 'phaser';
import type { Point } from '../data';
import { HERO_FEEL } from '../feel';
import { COLORS, DEPTH } from '../layout';

const ORB_X = 20;
const ORB_Y = -19;
/** Сколько отрезков в скруглённом верхе мантии. */
const MANTLE_STEPS = 10;

/** Временный вид героя: кот в мантии и шляпе мага, с посохом. Сфера на посохе показывает готовность умения. */
export class HeroView extends Phaser.GameObjects.Container {
  private readonly staff: Phaser.GameObjects.Container;
  private readonly orb: Phaser.GameObjects.Arc;
  private readonly halo: Phaser.GameObjects.Arc;
  private ready: boolean | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, orbColor: number) {
    super(scene, x, y);

    const body = scene.add.graphics();
    body.fillStyle(COLORS.shadow, HERO_FEEL.shadowAlpha);
    body.fillEllipse(0, 22, 40, 10);
    // Мантия — колокол: парабола от полы до полы с вершиной у шеи.
    const mantle: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i <= MANTLE_STEPS; i++) {
      const k = i / MANTLE_STEPS;
      mantle.push({ x: -18 + 36 * k, y: 22 - 52 * k * (1 - k) });
    }
    body.fillStyle(COLORS.heroMantle);
    body.fillPoints(mantle, true);

    const head = scene.add.graphics();
    head.fillStyle(COLORS.heroFur);
    head.fillCircle(0, -2, 12);
    head.fillTriangle(-11, -6, -9, -19, -3, -12);
    head.fillTriangle(11, -6, 9, -19, 3, -12);
    head.fillStyle(COLORS.heroHat);
    head.fillTriangle(-13, -10, 13, -10, 4, -34);
    head.fillStyle(COLORS.brass);
    head.fillRect(-13, -12, 26, 3);
    head.fillStyle(COLORS.bg);
    head.fillCircle(-4, -2, 1.8);
    head.fillCircle(4, -2, 1.8);

    const stick = scene.add.graphics();
    stick.lineStyle(3, COLORS.heroStaff);
    stick.lineBetween(17, 22, ORB_X, -16);
    this.halo = scene.add.circle(ORB_X, ORB_Y, HERO_FEEL.orbRadius * HERO_FEEL.haloScale, orbColor);
    this.orb = scene.add.circle(ORB_X, ORB_Y, HERO_FEEL.orbRadius, orbColor);
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
      this.orb.setScale(HERO_FEEL.orbIdleScale).setAlpha(HERO_FEEL.orbIdleAlpha);
      this.halo.setVisible(false);
      return;
    }

    this.halo.setVisible(true).setScale(1);
    const pulse = { duration: HERO_FEEL.orbPulseMs, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 };
    tweens.add({
      ...pulse,
      targets: this.orb,
      scale: { from: 1, to: HERO_FEEL.orbPulseScale },
      alpha: { from: HERO_FEEL.orbPulseAlphaFrom, to: HERO_FEEL.orbPulseAlphaTo },
    });
    tweens.add({
      ...pulse,
      targets: this.halo,
      scale: { from: 1, to: HERO_FEEL.orbPulseScale },
      alpha: { from: HERO_FEEL.haloPulseAlphaFrom, to: HERO_FEEL.haloPulseAlphaTo },
    });
    if (recharged) this.playRecharged();
  }

  /** Вспышка на сфере: умение перезарядилось. */
  private playRecharged(): void {
    const flash = this.scene.add.circle(ORB_X, ORB_Y, HERO_FEEL.orbRadius, COLORS.flash);
    this.staff.add(flash);
    this.scene.tweens.add({
      targets: flash,
      scale: HERO_FEEL.readyPopScale,
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
