import type Phaser from 'phaser';
import type { LevelConfig, Point } from '../data';
import { gear, levels } from '../data';
import { TUTORIAL_FEEL } from '../feel';
import { t } from '../i18n';
import { BOARD_Y, COLORS, CONTROLS_Y, FONTS, METEOR_X, SUMMON_X, TEXT_COLORS } from '../layout';
import type { TutorialHint } from '../systems/Tutorial';
import { CIRCLE_RADIUS, ensureTextures, Texture } from './textures';

const TEXT_PAD_X = 10;
const TEXT_PAD_Y = 6;
const BUBBLE_RADIUS = 8;

/**
 * Подсказки обучения поверх боя: плашка с текстом и указатель — стрелка над кнопкой,
 * «палец», который тащит кота, или кольцо в точке удара.
 * Ничего здесь не ловит касания: игрок может не обращать на подсказку внимания.
 */
export class TutorialOverlay {
  private readonly bubble: Phaser.GameObjects.Container;
  private readonly bubbleBg: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private readonly arrow: Phaser.GameObjects.Triangle;
  private readonly finger: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Image;
  /** Подсказка, которая сейчас на экране, одной строкой: по ней видно, что пора перерисовать. */
  private shown = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly level: LevelConfig,
  ) {
    ensureTextures(scene);
    const [x, y] = level.tutorial?.at ?? [0, 0];
    this.bubbleBg = scene.add.graphics();
    this.text = scene.add
      .text(0, 0, '', {
        fontFamily: FONTS.body,
        fontSize: '13px',
        color: TEXT_COLORS.fg,
        align: 'center',
        wordWrap: { width: (level.tutorial?.width ?? 0) - TEXT_PAD_X * 2 },
      })
      .setOrigin(0.5);
    this.bubble = scene.add.container(x, y + BOARD_Y, [this.bubbleBg, this.text]).setVisible(false);

    const { arrowW, arrowH, fingerSize } = TUTORIAL_FEEL;
    this.arrow = scene.add
      .triangle(0, 0, -arrowW / 2, -arrowH / 2, arrowW / 2, -arrowH / 2, 0, arrowH / 2, COLORS.brass)
      .setVisible(false);
    this.finger = scene.add
      .image(0, 0, Texture.dot)
      .setDisplaySize(fingerSize, fingerSize)
      .setTint(COLORS.range)
      .setVisible(false);
    this.ring = scene.add.image(0, 0, Texture.ring).setTint(COLORS.brass).setVisible(false);
  }

  /** Шаг подсказки на экране; читает смоук-проверка (src/smoke.ts). */
  get step(): string | null {
    return this.shown ? (JSON.parse(this.shown) as TutorialHint).step : null;
  }

  /** Показывает подсказку или убирает её (null). Та же подсказка повторно ничего не перерисовывает. */
  show(hint: TutorialHint | null): void {
    const key = hint ? JSON.stringify(hint) : '';
    if (key === this.shown) return;
    this.shown = key;

    const { tweens } = this.scene;
    tweens.killTweensOf([this.arrow, this.finger, this.ring]);
    this.arrow.setVisible(false);
    this.finger.setVisible(false);
    this.ring.setVisible(false);
    this.bubble.setVisible(hint !== null);
    if (!hint) return;

    this.setText(t(`tutorial.${hint.step}`));
    switch (hint.step) {
      case 'summon':
        this.pointAt(SUMMON_X);
        break;
      case 'meteor':
        this.pointAt(METEOR_X);
        break;
      case 'merge':
      case 'hybrid':
        this.drag(this.slotCenter(hint.from), this.slotCenter(hint.to));
        break;
      case 'meteorAim':
        if (hint.point) this.mark([hint.point[0], hint.point[1] + BOARD_Y]);
        break;
    }
  }

  private setText(text: string): void {
    this.text.setText(text);
    const width = this.text.width + TEXT_PAD_X * 2;
    const height = this.text.height + TEXT_PAD_Y * 2;
    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(COLORS.bg, TUTORIAL_FEEL.bubbleAlpha);
    this.bubbleBg.lineStyle(1, COLORS.brass);
    this.bubbleBg.fillRoundedRect(-width / 2, -height / 2, width, height, BUBBLE_RADIUS);
    this.bubbleBg.strokeRoundedRect(-width / 2, -height / 2, width, height, BUBBLE_RADIUS);
  }

  /** Стрелка подпрыгивает над кнопкой нижней полосы. */
  private pointAt(x: number): void {
    const { arrowH, arrowGap, arrowBounce, arrowMs } = TUTORIAL_FEEL;
    const y = CONTROLS_Y - arrowGap - arrowH / 2;
    this.arrow.setPosition(x, y - arrowBounce).setVisible(true);
    this.scene.tweens.add({ targets: this.arrow, y, duration: arrowMs, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
  }

  /** «Палец» появляется на одном коте, едет на другого и гаснет — снова и снова. */
  private drag(from: Point, to: Point): void {
    const { fingerAlpha, dragMs, dragHoldMs } = TUTORIAL_FEEL;
    this.finger.setPosition(...from).setAlpha(0).setVisible(true);
    this.scene.tweens.chain({
      targets: this.finger,
      loop: -1,
      tweens: [
        { x: from[0], y: from[1], alpha: fingerAlpha, duration: dragHoldMs },
        { x: to[0], y: to[1], duration: dragMs, ease: 'Cubic.easeInOut' },
        { alpha: 0, duration: dragHoldMs, delay: dragHoldMs },
      ],
    });
  }

  /** Кольцо размером с удар метеора пульсирует там, где врагов больше всего. */
  private mark(point: Point): void {
    const scale = gear.meteor.radius / CIRCLE_RADIUS;
    this.ring.setPosition(...point).setScale(scale).setAlpha(1).setVisible(true);
    this.scene.tweens.add({
      targets: this.ring,
      scale: scale * TUTORIAL_FEEL.ringPulse,
      alpha: TUTORIAL_FEEL.ringAlpha,
      duration: TUTORIAL_FEEL.arrowMs,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** Центр клетки в координатах экрана. */
  private slotCenter(slot: number): Point {
    const [x, y] = this.level.slots[slot];
    const half = levels.slotSize / 2;
    return [x + half, y + half + BOARD_Y];
  }
}
