import Phaser from 'phaser';
import { COLORS } from '../layout';

/** Текстуры, нарисованные кодом: создаются при первом обращении и живут до конца игры. */
export const Texture = {
  /** Белый круг для частиц: цвет задаётся оттенком. */
  dot: 'dot',
  /** Большой белый круг для вспышек по площади: растягивается до нужного радиуса. */
  disc: 'disc',
  /** Белое кольцо: расходящиеся волны, метки на врагах. */
  ring: 'ring',
  coin: 'coin',
  crystal: 'crystal',
  fish: 'fish',
} as const;

/** Текстуры крупнее, чем значки на экране, чтобы края оставались гладкими. */
const DOT_SIZE = 16;
const ICON_SIZE = 48;
/** Радиус круга и кольца в их текстурах: масштаб картинки = нужный радиус / этот. */
export const CIRCLE_RADIUS = 64;
const RING_WIDTH = 3;

function generate(scene: Phaser.Scene, key: string, size: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  draw(g);
  g.generateTexture(key, size, size);
  g.destroy();
}

/** Во сколько раз запечённая фигура крупнее, чем на экране: остаётся чёткой, когда её увеличивает анимация. */
export const SHAPE_SCALE = 2;

/**
 * Запекает нарисованное в текстуру: Graphics заново разбивается на треугольники каждый кадр,
 * а картинка — один прямоугольник. Всё, что не меняется, рисуется так. Повторный вызов с тем же ключом ничего не делает.
 * `draw` рисует в прямоугольнике от (0, 0) до (width, height).
 */
export function bakeTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  generateSized(scene, key, width, height, 1, draw);
}

/**
 * Запекает фигуру, нарисованную вокруг начала координат, и ставит её картинкой с тем же центром.
 * `width` и `height` — прямоугольник вокруг центра, в который фигура помещается целиком.
 */
/** Запекает фигуру вокруг начала координат в текстуру `key`, не ставя картинку; картинку с ней масштабировать на `1 / SHAPE_SCALE`. */
export function bakeShape(scene: Phaser.Scene, key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
  generateSized(scene, key, width, height, SHAPE_SCALE, (g) => {
    g.translateCanvas(width / 2, height / 2);
    draw(g);
  });
}

export function addBakedShape(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): Phaser.GameObjects.Image {
  generateSized(scene, key, width, height, SHAPE_SCALE, (g) => {
    g.translateCanvas(width / 2, height / 2);
    draw(g);
  });
  return scene.add.image(0, 0, key).setScale(1 / SHAPE_SCALE);
}

function generateSized(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  scale: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  g.scaleCanvas(scale, scale);
  draw(g);
  g.generateTexture(key, Math.ceil(width * scale), Math.ceil(height * scale));
  g.destroy();
}

export function ensureTextures(scene: Phaser.Scene): void {
  generate(scene, Texture.dot, DOT_SIZE, (g) => {
    g.fillStyle(COLORS.flash);
    g.fillCircle(DOT_SIZE / 2, DOT_SIZE / 2, DOT_SIZE / 2);
  });

  generate(scene, Texture.disc, CIRCLE_RADIUS * 2, (g) => {
    g.fillStyle(COLORS.flash);
    g.fillCircle(CIRCLE_RADIUS, CIRCLE_RADIUS, CIRCLE_RADIUS);
  });

  generate(scene, Texture.ring, CIRCLE_RADIUS * 2, (g) => {
    g.lineStyle(RING_WIDTH, COLORS.flash);
    g.strokeCircle(CIRCLE_RADIUS, CIRCLE_RADIUS, CIRCLE_RADIUS - RING_WIDTH / 2);
  });

  generate(scene, Texture.coin, ICON_SIZE, (g) => {
    const half = ICON_SIZE / 2;
    g.fillStyle(COLORS.coinEdge);
    g.fillCircle(half, half, half);
    g.fillStyle(COLORS.brass);
    g.fillCircle(half, half, half * 0.78);
    // Блик сверху слева.
    g.fillStyle(COLORS.coinShine);
    g.fillCircle(half * 0.72, half * 0.72, half * 0.24);
  });

  generate(scene, Texture.crystal, ICON_SIZE, (g) => {
    const half = ICON_SIZE / 2;
    const side = ICON_SIZE * 0.4;
    const top = new Phaser.Math.Vector2(half, 0);
    const right = new Phaser.Math.Vector2(half + side, half);
    const bottom = new Phaser.Math.Vector2(half, ICON_SIZE);
    const left = new Phaser.Math.Vector2(half - side, half);
    g.fillStyle(COLORS.crystal);
    g.fillPoints([top, right, bottom, left], true);
    // Светлая грань сверху слева.
    g.fillStyle(COLORS.crystalLight);
    g.fillPoints([top, new Phaser.Math.Vector2(half, half), left], true);
  });

  // Рыбка носом влево: тело, хвост, плавник и глаз.
  generate(scene, Texture.fish, ICON_SIZE, (g) => {
    const half = ICON_SIZE / 2;
    g.fillStyle(COLORS.fishDark);
    g.fillTriangle(ICON_SIZE * 0.66, half, ICON_SIZE, ICON_SIZE * 0.22, ICON_SIZE, ICON_SIZE * 0.78);
    g.fillTriangle(ICON_SIZE * 0.3, ICON_SIZE * 0.3, ICON_SIZE * 0.55, ICON_SIZE * 0.1, ICON_SIZE * 0.6, ICON_SIZE * 0.35);
    g.fillStyle(COLORS.fish);
    g.fillEllipse(ICON_SIZE * 0.4, half, ICON_SIZE * 0.78, ICON_SIZE * 0.5);
    g.fillStyle(COLORS.bg);
    g.fillCircle(ICON_SIZE * 0.2, ICON_SIZE * 0.44, ICON_SIZE * 0.05);
  });
}

/**
 * Кольцо заряда вокруг начала координат `g`: тусклая дорожка и дуга от верха по часовой стрелке на долю `progress`.
 * Перерисовывать только при заметной смене доли: `Graphics` разбивается на треугольники заново при каждой отрисовке.
 */
export function drawChargeRing(
  g: Phaser.GameObjects.Graphics,
  radius: number,
  width: number,
  progress: number,
  color: number,
  trackAlpha: number,
): void {
  g.clear();
  g.lineStyle(width, color, trackAlpha);
  g.strokeCircle(0, 0, radius);
  const k = Math.max(0, Math.min(1, progress));
  if (k <= 0) return;
  g.lineStyle(width, color, 1);
  g.beginPath();
  g.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
  g.strokePath();
}
