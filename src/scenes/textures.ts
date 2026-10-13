import Phaser from 'phaser';
import { COLORS } from '../layout';

/** Текстуры, нарисованные кодом: создаются при первом обращении и живут до конца игры. */
export const Texture = {
  /** Белый круг для частиц: цвет задаётся оттенком. */
  dot: 'dot',
  coin: 'coin',
  crystal: 'crystal',
} as const;

/** Текстуры крупнее, чем значки на экране, чтобы края оставались гладкими. */
const DOT_SIZE = 16;
const ICON_SIZE = 48;

function generate(scene: Phaser.Scene, key: string, size: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  draw(g);
  g.generateTexture(key, size, size);
  g.destroy();
}

export function ensureTextures(scene: Phaser.Scene): void {
  generate(scene, Texture.dot, DOT_SIZE, (g) => {
    g.fillStyle(COLORS.flash);
    g.fillCircle(DOT_SIZE / 2, DOT_SIZE / 2, DOT_SIZE / 2);
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
}
