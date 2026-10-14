import type Phaser from 'phaser';
import type { LevelConfig, Point } from '../data';
import { levels } from '../data';
import { ONBOARDING_FEEL } from '../feel';
import { t } from '../i18n';
import {
  BOARD_H,
  BOARD_W,
  BOARD_Y,
  COLORS,
  CONTROLS_CENTER_Y,
  FONTS,
  GAME_H,
  GAME_W,
  METEOR_W,
  METEOR_X,
  MIN_TOUCH,
  SUMMON_W,
  SUMMON_X,
  TEXT_COLORS,
} from '../layout';
import type { OnboardingFocus } from '../systems/Onboarding';
import { addBakedShape } from './textures';
import { addButton } from './widgets';

/** Обучение включено: смоук-проверка его не проходит, кроме сценариев, которые просят его адресом (`?onboarding`). */
export function onboardingEnabled(): boolean {
  const params = new URLSearchParams(location.search);
  return !params.has('smoke') || params.has('onboarding');
}

/** Высота кнопок нижней полосы: цель шагов «призыв» и «метеор». */
const CONTROL_H = 44;
const SKIP = { w: 110, h: MIN_TOUCH, gap: 8 };
const TEXT_PAD = { x: 12, y: 7 };

/** Прямоугольник на экране: левый верхний угол и размер. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Интерактивное обучение поверх боя: всё, кроме цели шага, затемнено; рука показывает касание или перетаскивание;
 * одна строка подсказки; «Пропустить». Касаний оверлей не ловит, кроме своей кнопки: что можно нажать, решает
 * `Onboarding.allows` в бою и в HUD — затемнение только показывает это.
 */
export class OnboardingOverlay {
  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly hand: Phaser.GameObjects.Image;
  private readonly bubble: Phaser.GameObjects.Container;
  private readonly bubbleBg: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private readonly skip: Phaser.GameObjects.Container;
  private shown = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly level: LevelConfig,
    onSkip: () => void,
  ) {
    this.dim = scene.add.graphics().setVisible(false);
    const { handSize } = ONBOARDING_FEEL;
    // Рука: ладонь и вытянутый указательный палец, кончик пальца — точка касания (верх картинки).
    this.hand = addBakedShape(scene, 'onboarding-hand', handSize, handSize, (g) => {
      const s = handSize;
      g.fillStyle(COLORS.shadow, 0.35);
      g.fillRoundedRect(-s * 0.24, -s * 0.02, s * 0.6, s * 0.5, s * 0.16);
      g.lineStyle(2, COLORS.bg);
      g.fillStyle(COLORS.range);
      g.fillRoundedRect(-s * 0.1, -s * 0.5, s * 0.2, s * 0.62, s * 0.1);
      g.strokeRoundedRect(-s * 0.1, -s * 0.5, s * 0.2, s * 0.62, s * 0.1);
      g.fillRoundedRect(-s * 0.3, -s * 0.06, s * 0.6, s * 0.5, s * 0.16);
      g.strokeRoundedRect(-s * 0.3, -s * 0.06, s * 0.6, s * 0.5, s * 0.16);
    })
      .setOrigin(0.5, 0)
      .setVisible(false);
    this.bubbleBg = scene.add.graphics();
    this.text = scene.add
      .text(0, 0, '', { fontFamily: FONTS.display, fontSize: '14px', color: TEXT_COLORS.fg, align: 'center' })
      .setOrigin(0.5);
    this.bubble = scene.add.container(GAME_W / 2, 0, [this.bubbleBg, this.text]).setVisible(false);
    this.skip = addButton(
      scene,
      GAME_W - SKIP.gap - SKIP.w / 2,
      BOARD_Y + SKIP.gap + SKIP.h / 2,
      SKIP.w,
      SKIP.h,
      t('onboarding.skip'),
      false,
      onSkip,
    ).setVisible(false);
    // По имени кнопку находит смоук-проверка.
    (this.skip.list[0] as Phaser.GameObjects.Rectangle).setName('onboarding-skip');
  }

  /** Шаг на экране; читает смоук-проверка. */
  get step(): string | null {
    return this.shown ? (JSON.parse(this.shown) as OnboardingFocus).step : null;
  }

  /** Показывает шаг или убирает оверлей (null). Тот же шаг повторно ничего не перерисовывает. */
  show(focus: OnboardingFocus | null): void {
    const key = focus ? JSON.stringify(focus) : '';
    if (key === this.shown) return;
    this.shown = key;
    this.scene.tweens.killTweensOf(this.hand);
    const visible = focus !== null;
    for (const part of [this.dim, this.bubble, this.skip]) part.setVisible(visible);
    this.hand.setVisible(false);
    if (!focus) return;

    // Баннеры и всплывающие надписи HUD появляются позже оверлея: он поднимается над ними.
    for (const part of [this.dim, this.bubble, this.hand, this.skip]) this.scene.children.bringToTop(part);
    const hole = this.holeFor(focus);
    this.drawDim(hole);
    this.setText(t(`onboarding.${focus.step}`), hole);
    switch (focus.step) {
      case 'summon':
      case 'summonSame':
      case 'meteor':
        this.tap([hole.x + hole.w / 2, hole.y + hole.h / 2]);
        break;
      case 'merge':
      case 'hybrid':
        this.drag(this.slotCenter(focus.from), this.slotCenter(focus.to));
        break;
      case 'meteorAim':
        break;
    }
  }

  /** Что видно сквозь затемнение: кнопка, две клетки пары или всё поле, когда игрок целится метеором. */
  private holeFor(focus: OnboardingFocus): Rect {
    const pad = ONBOARDING_FEEL.holePad;
    switch (focus.step) {
      case 'summon':
      case 'summonSame':
        return { x: SUMMON_X - SUMMON_W / 2 - pad, y: CONTROLS_CENTER_Y - CONTROL_H / 2 - pad, w: SUMMON_W + pad * 2, h: CONTROL_H + pad * 2 };
      case 'meteor':
        return { x: METEOR_X - METEOR_W / 2 - pad, y: CONTROLS_CENTER_Y - CONTROL_H / 2 - pad, w: METEOR_W + pad * 2, h: CONTROL_H + pad * 2 };
      case 'merge':
      case 'hybrid': {
        const size = levels.slotSize;
        const [ax, ay] = this.level.slots[focus.from];
        const [bx, by] = this.level.slots[focus.to];
        const x = Math.min(ax, bx) - pad;
        const y = Math.min(ay, by) + BOARD_Y - pad;
        return { x, y, w: Math.max(ax, bx) + size - Math.min(ax, bx) + pad * 2, h: Math.max(ay, by) + size - Math.min(ay, by) + pad * 2 };
      }
      case 'meteorAim':
        return { x: 0, y: BOARD_Y, w: BOARD_W, h: BOARD_H };
    }
  }

  /** Затемнение всего экрана, кроме прямоугольника `hole`: четыре полосы вокруг него. */
  private drawDim(hole: Rect): void {
    const g = this.dim;
    g.clear();
    g.fillStyle(COLORS.shadow, ONBOARDING_FEEL.dimAlpha);
    g.fillRect(0, 0, GAME_W, hole.y);
    g.fillRect(0, hole.y + hole.h, GAME_W, GAME_H - hole.y - hole.h);
    g.fillRect(0, hole.y, hole.x, hole.h);
    g.fillRect(hole.x + hole.w, hole.y, GAME_W - hole.x - hole.w, hole.h);
    g.lineStyle(2, COLORS.brass);
    g.strokeRoundedRect(hole.x, hole.y, hole.w, hole.h, 10);
  }

  /** Строка подсказки над целью; у цели вверху поля — под ней. */
  private setText(line: string, hole: Rect): void {
    const { textGap, textMinY, textAlpha } = ONBOARDING_FEEL;
    this.text.setText(line);
    const w = this.text.width + TEXT_PAD.x * 2;
    const h = this.text.height + TEXT_PAD.y * 2;
    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(COLORS.bg, textAlpha);
    this.bubbleBg.lineStyle(2, COLORS.brass);
    this.bubbleBg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.bubbleBg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    // Над кнопкой нижней полосы — рука сверху: строка встаёт выше неё.
    const hand = hole.y + hole.h / 2 > GAME_H * 0.75 ? ONBOARDING_FEEL.handSize + ONBOARDING_FEEL.handTapLift : 0;
    const above = hole.y - textGap - hand - h / 2;
    const y = above >= textMinY + h / 2 ? above : hole.y + hole.h + textGap + h / 2;
    // Пока игрок целится, поле открыто целиком: строка — у верха поля, под кнопкой «Пропустить».
    this.bubble.setPosition(GAME_W / 2, hole.h >= BOARD_H ? BOARD_Y + SKIP.gap * 2 + SKIP.h + h / 2 : Math.min(y, GAME_H - h));
  }

  /**
   * Рука нажимает в точку `at` и отпускает — снова и снова. Кнопки нижней полосы рука показывает сверху:
   * снизу она ушла бы за край экрана.
   */
  private tap(at: Point): void {
    const { handTapLift, tapMs } = ONBOARDING_FEEL;
    const fromAbove = at[1] > GAME_H * 0.75;
    const lift = fromAbove ? -handTapLift : handTapLift;
    this.hand
      .setFlipY(fromAbove)
      .setOrigin(0.5, fromAbove ? 1 : 0)
      .setPosition(at[0], at[1] + lift)
      .setVisible(true)
      .setAlpha(1);
    this.scene.tweens.add({ targets: this.hand, y: at[1], duration: tapMs / 2, ease: 'Quad.easeIn', yoyo: true, repeat: -1 });
  }

  /** Рука берёт кота в одной клетке, тащит на другую и отпускает — снова и снова. */
  private drag(from: Point, to: Point): void {
    const { dragMs, holdMs } = ONBOARDING_FEEL;
    this.hand.setFlipY(false).setOrigin(0.5, 0).setPosition(...from).setAlpha(0).setVisible(true);
    this.scene.tweens.chain({
      targets: this.hand,
      loop: -1,
      tweens: [
        { x: from[0], y: from[1], alpha: 1, duration: holdMs },
        { x: to[0], y: to[1], duration: dragMs, ease: 'Cubic.easeInOut' },
        { alpha: 0, duration: holdMs, delay: holdMs },
      ],
    });
  }

  /** Центр клетки в координатах экрана. */
  private slotCenter(slot: number): Point {
    const [x, y] = this.level.slots[slot];
    const half = levels.slotSize / 2;
    return [x + half, y + half + BOARD_Y];
  }
}
