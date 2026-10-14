import Phaser from 'phaser';
import { addArtOrShape } from '../art';
import type { BuildingKind } from '../data';
import { COLORS, DEPTH } from '../layout';
import { artId } from '../systems/Art';
import type { Building } from './Building';
import { PieceView } from './PieceView';

/** Прямоугольник вокруг центра, в который помещается строение вместе с отметками уровня. */
const SHAPE_W = 52;
const SHAPE_H = 58;
/** Отметки уровня под строением: сколько всего и где. */
const PIPS = 3;
const PIP_Y = 24;
const PIP_GAP = 9;
const PIP_RADIUS = 3;

const point = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x, y);

/** Рисунки строений вокруг начала координат `g`: лавка с рыбой, шахта с кристаллом, грядка с кустиком мяты. */
const DRAW: Record<BuildingKind, (g: Phaser.GameObjects.Graphics) => void> = {
  shop(g) {
    g.fillStyle(COLORS.heroFur);
    g.fillRoundedRect(-17, -6, 34, 24, 3);
    g.fillStyle(COLORS.brass);
    g.fillTriangle(-23, -5, 0, -24, 23, -5);
    g.fillStyle(COLORS.fishDark);
    g.fillEllipse(-2, 7, 18, 10);
    g.fillTriangle(6, 7, 13, 1, 13, 13);
  },
  mine(g) {
    g.fillStyle(COLORS.line);
    g.fillPoints([point(-22, 18), point(-15, 2), point(15, 2), point(22, 18)], true);
    g.fillStyle(COLORS.crystal);
    g.fillPoints([point(0, -24), point(10, -8), point(0, 10), point(-10, -8)], true);
    g.fillStyle(COLORS.crystalLight);
    g.fillPoints([point(0, -24), point(10, -8), point(0, -4)], true);
  },
  altar(g) {
    g.fillStyle(COLORS.moundDark);
    g.fillRoundedRect(-21, 6, 42, 12, 5);
    g.fillStyle(COLORS.mound);
    g.fillRoundedRect(-19, 4, 38, 9, 4);
    g.fillStyle(COLORS.hp);
    g.fillEllipse(-8, -4, 16, 9);
    g.fillEllipse(8, -4, 16, 9);
    g.fillEllipse(0, -12, 9, 16);
  },
};

/** Картинка строения: готовый арт своего уровня, а пока его нет — рисунок с отметками уровня, запечённый один раз на каждый вид и уровень. */
export function addBuildingIcon(scene: Phaser.Scene, kind: BuildingKind, level: number): Phaser.GameObjects.Image {
  return addArtOrShape(scene, artId.building(kind, level), `building-${kind}-${level}`, SHAPE_W, SHAPE_H, (g) => {
    DRAW[kind](g);
    for (let pip = 0; pip < PIPS; pip++) {
      g.fillStyle(pip < level ? COLORS.brass : COLORS.line);
      g.fillCircle((pip - (PIPS - 1) / 2) * PIP_GAP, PIP_Y, PIP_RADIUS);
    }
  });
}

/** Вид строения: его картинка. */
export class BuildingView extends PieceView {
  constructor(scene: Phaser.Scene, x: number, y: number, building: Building) {
    super(scene, x, y);
    this.add(addBuildingIcon(scene, building.kind, building.level));
    this.setDepth(DEPTH.cat);
    scene.add.existing(this);
  }
}
