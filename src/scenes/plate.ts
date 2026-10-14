import type Phaser from 'phaser';
import { BUTTON_FEEL } from '../feel';
import { bakeShape, SHAPE_SCALE } from './textures';

/** Цвет плашки и, если нужно выделить кнопку (открытая карточка, нажатый режим), цвет обводки вместо тёмно-коричневого. */
export interface PlateStyle {
  fill: number;
  outline?: number;
}

/** Имя тени внутри кнопки: её находит отклик нажатия, чтобы тень осталась на месте, когда кнопка садится на неё. */
export const PLATE_SHADOW = 'plate-shadow';

/** Светлее цвета `color` на долю `k` — блик. */
function lighten(color: number, k: number): number {
  const channel = (shift: number): number => {
    const c = (color >> shift) & 0xff;
    return Math.round(c + (255 - c) * k) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}

/**
 * Мультяшная плашка кнопки поверх её прямоугольника нажатия: скруглённая, с толстой тёмной обводкой, бликом сверху
 * и тенью снизу. Прямоугольник остаётся областью нажатия и становится прозрачным. Плашка запекается в текстуру,
 * одна на размер и цвет: в бою кнопок много, а перерисовывать каждую каждый кадр дорого.
 */
export class Plate {
  private readonly face: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  private key = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bg: Phaser.GameObjects.Rectangle,
    style: PlateStyle,
  ) {
    const { width, height } = bg;
    const { shadowDepth, shadowColor, shadowAlpha, radius } = BUTTON_FEEL;
    const shadowKey = `plate-shadow-${width}x${height}`;
    bakeShape(scene, shadowKey, width, height, (g) => {
      g.fillStyle(shadowColor, shadowAlpha);
      g.fillRoundedRect(-width / 2, -height / 2, width, height, Math.min(radius, height / 2));
    });
    this.shadow = scene.add.image(bg.x, bg.y + shadowDepth, shadowKey).setScale(1 / SHAPE_SCALE).setName(PLATE_SHADOW);
    this.face = scene.add.image(bg.x, bg.y, shadowKey).setScale(1 / SHAPE_SCALE);
    bg.setFillStyle(bg.fillColor, 0).setStrokeStyle();
    // Тень и лицо — сразу за прямоугольником нажатия: подписи и значки кнопки остаются поверх.
    const parent = bg.parentContainer;
    if (parent) {
      const at = parent.getIndex(bg) + 1;
      parent.addAt([this.shadow, this.face], at);
    }
    this.setStyle(style);
  }

  /** Перекрашивает плашку: готова, выключена, выбрана. */
  setStyle({ fill, outline = BUTTON_FEEL.outlineColor }: PlateStyle): this {
    const { width, height } = this.bg;
    const key = `plate-${width}x${height}-${fill.toString(16)}-${outline.toString(16)}`;
    if (key === this.key) return this;
    this.key = key;
    const { radius, outline: border, highlight, highlightAlpha } = BUTTON_FEEL;
    bakeShape(this.scene, key, width, height, (g) => {
      const r = Math.min(radius, height / 2);
      g.fillStyle(outline);
      g.fillRoundedRect(-width / 2, -height / 2, width, height, r);
      const w = width - border * 2;
      const h = height - border * 2;
      const inner = Math.max(1, r - border);
      g.fillStyle(fill);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, inner);
      // Блик: светлая полоса по верху, со своим скруглением.
      const bandH = h * highlight;
      g.fillStyle(lighten(fill, 0.6), highlightAlpha);
      g.fillRoundedRect(-w / 2 + border, -h / 2 + border / 2, w - border * 2, bandH, Math.min(inner, bandH / 2));
    });
    this.face.setTexture(key);
    return this;
  }

  setVisible(visible: boolean): this {
    this.face.setVisible(visible);
    this.shadow.setVisible(visible);
    return this;
  }
}

/** Плашка на прямоугольнике нажатия `bg`, который уже лежит в контейнере кнопки. */
export function addPlate(scene: Phaser.Scene, bg: Phaser.GameObjects.Rectangle, style: PlateStyle): Plate {
  return new Plate(scene, bg, style);
}
