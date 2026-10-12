import Phaser from 'phaser';
import { cats, gear, getLevel, levels, type LevelConfig, type Point } from '../data';
import type { Cat } from '../entities/Cat';
import { CatView } from '../entities/CatView';
import { BOARD_H, BOARD_W, BOARD_Y, COLORS, ROAD, SLOT_RADIUS } from '../layout';
import { Economy } from '../systems/Economy';
import { Summon } from '../systems/Summon';
import { GameEvent, SceneKey, type HudState, type LevelSceneData } from './keys';

// Пока снаряжение не выбирается игроком, посох берётся из умолчаний.
const STAFF_ID = gear.defaults.staff;

export class GameScene extends Phaser.Scene {
  private level!: LevelConfig;
  private economy!: Economy;
  private summoner!: Summon;
  /** Кот в каждой клетке, индексы совпадают с level.slots. */
  private board!: (Cat | null)[];

  constructor() {
    super(SceneKey.Game);
  }

  init(data: LevelSceneData): void {
    this.level = getLevel(data.levelId);
  }

  create(): void {
    // Камера обрезана по игровому полю, поэтому координаты сцены совпадают
    // с координатами из levels.json, а дорога за краем поля не видна.
    this.cameras.main.setViewport(0, BOARD_Y, BOARD_W, BOARD_H);
    this.cameras.main.setBackgroundColor(COLORS.board);

    const g = this.add.graphics();
    this.drawRoad(g, this.level.path);
    this.drawGate(g, this.level.path[this.level.path.length - 1]);
    this.drawSlots(g, this.level.slots);

    this.economy = new Economy(this.level, gear.summon);
    this.summoner = new Summon(cats, gear.staff.find((item) => item.id === STAFF_ID));
    this.board = this.level.slots.map(() => null);

    const data: LevelSceneData = { levelId: this.level.id };
    this.scene.launch(SceneKey.UI, data);
  }

  hudState(): HudState {
    return {
      gold: this.economy.gold,
      summonCost: this.economy.summonCost,
      canSummon: this.economy.canAffordSummon() && this.board.includes(null),
    };
  }

  summon(): void {
    if (!this.economy.canAffordSummon()) return;
    const result = this.summoner.summon(this.board);
    if (!result) return;

    this.economy.paySummon();
    this.board[result.slot] = result.cat;

    const [x, y] = this.level.slots[result.slot];
    const half = levels.slotSize / 2;
    new CatView(this, x + half, y + half, result.cat).playSpawn();

    this.events.emit(GameEvent.Changed);
  }

  private drawRoad(g: Phaser.GameObjects.Graphics, path: Point[]): void {
    this.strokePath(g, path, ROAD.outerWidth, COLORS.roadEdge);
    this.strokePath(g, path, ROAD.innerWidth, COLORS.road);

    g.lineStyle(2, COLORS.brass, 0.3);
    const period = ROAD.dash + ROAD.gap;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay] = path[i];
      const [bx, by] = path[i + 1];
      const length = Math.hypot(bx - ax, by - ay);
      const ux = (bx - ax) / length;
      const uy = (by - ay) / length;
      for (let d = 0; d < length; d += period) {
        const end = Math.min(d + ROAD.dash, length);
        g.lineBetween(ax + ux * d, ay + uy * d, ax + ux * end, ay + uy * end);
      }
    }
  }

  /** Ломаная со скруглёнными стыками: Graphics сам стыки не скругляет. */
  private strokePath(g: Phaser.GameObjects.Graphics, path: Point[], width: number, color: number): void {
    g.lineStyle(width, color);
    g.fillStyle(color);
    for (let i = 0; i < path.length - 1; i++) {
      g.lineBetween(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
    }
    for (const [x, y] of path) g.fillCircle(x, y, width / 2);
  }

  private drawGate(g: Phaser.GameObjects.Graphics, end: Point): void {
    const x = Phaser.Math.Clamp(end[0], 20, BOARD_W - 20);
    const y = Phaser.Math.Clamp(end[1], 14, BOARD_H - 14);

    g.fillStyle(COLORS.gateWall);
    g.fillRoundedRect(x - 22, y - 12, 44, 24, 4);
    g.fillStyle(COLORS.danger);
    for (let i = 0; i < 4; i++) g.fillRect(x - 18 + i * 10, y - 16, 6, 5);
    g.fillStyle(COLORS.gateDoor);
    g.fillRoundedRect(x - 7, y - 4, 14, 16, 6);
  }

  private drawSlots(g: Phaser.GameObjects.Graphics, slots: Point[]): void {
    const size = levels.slotSize;
    g.fillStyle(COLORS.slot);
    g.lineStyle(1, COLORS.line);
    for (const [x, y] of slots) {
      g.fillRoundedRect(x, y, size, size, SLOT_RADIUS);
      g.strokeRoundedRect(x, y, size, size, SLOT_RADIUS);
    }
  }
}
