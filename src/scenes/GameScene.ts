import Phaser from 'phaser';
import { cats, elementColor, gear, getLevel, levels, type LevelConfig, type Point } from '../data';
import type { Cat } from '../entities/Cat';
import { CatView } from '../entities/CatView';
import { CAT_FEEL, DRAG_FEEL, MERGE_FEEL, TOAST_FEEL } from '../feel';
import { t, type StringKey } from '../i18n';
import { BOARD_H, BOARD_W, BOARD_Y, COLORS, DEPTH, FONTS, ROAD, SLOT_RADIUS, TEXT_COLORS } from '../layout';
import { catRange } from '../systems/Combat';
import { Economy } from '../systems/Economy';
import { Merge, type MergeBlock } from '../systems/Merge';
import { Summon } from '../systems/Summon';
import { GameEvent, SceneKey, type HudState, type LevelSceneData } from './keys';

// Пока снаряжение не выбирается игроком, посох берётся из умолчаний.
const STAFF_ID = gear.defaults.staff;

const BLOCK_TEXT: Record<MergeBlock, StringKey> = {
  maxLevel: 'merge.maxLevel',
};

interface Drag {
  pointerId: number;
  slot: number;
  view: CatView;
  /** Клетка под пальцем, кроме исходной. */
  hover: number | null;
}

export class GameScene extends Phaser.Scene {
  private level!: LevelConfig;
  private economy!: Economy;
  private summoner!: Summon;
  /** Кот в каждой клетке, индексы совпадают с level.slots. */
  private board!: (Cat | null)[];
  private merger!: Merge;
  private views!: (CatView | null)[];
  private drag: Drag | null = null;
  private highlights!: Phaser.GameObjects.Graphics;
  private rangeRing!: Phaser.GameObjects.Graphics;
  private toast: Phaser.GameObjects.Text | null = null;

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
    this.merger = new Merge(this.level);
    this.board = this.level.slots.map(() => null);
    this.views = this.level.slots.map(() => null);
    this.drag = null;
    this.toast = null;

    this.highlights = this.add.graphics().setDepth(DEPTH.highlight);
    this.rangeRing = this.add.graphics().setDepth(DEPTH.fx).setVisible(false);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);

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

    const [x, y] = this.slotCenter(result.slot);
    const view = new CatView(this, x, y, result.cat);
    view.playSpawn();
    this.views[result.slot] = view;

    if (this.drag) this.drawHighlights();
    this.events.emit(GameEvent.Changed);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.drag) return;
    const slot = this.slotAt(pointer);
    if (slot === null) return;
    const cat = this.board[slot];
    const view = this.views[slot];
    if (!cat || !view) return;

    this.drag = { pointerId: pointer.id, slot, view, hover: null };
    view.lift();

    const range = catRange(cats, cat);
    this.rangeRing.clear();
    this.rangeRing.fillStyle(COLORS.range, DRAG_FEEL.rangeFillAlpha);
    this.rangeRing.fillCircle(0, 0, range);
    this.rangeRing.lineStyle(DRAG_FEEL.rangeLineWidth, COLORS.range, DRAG_FEEL.rangeLineAlpha);
    this.rangeRing.strokeCircle(0, 0, range);
    this.rangeRing.setVisible(true);

    this.followPointer(pointer);
    this.drawHighlights();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.drag || pointer.id !== this.drag.pointerId) return;
    this.followPointer(pointer);

    const over = this.slotAt(pointer);
    const hover = over === this.drag.slot ? null : over;
    if (hover !== this.drag.hover) {
      this.drag.hover = hover;
      this.drawHighlights();
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.drag || pointer.id !== this.drag.pointerId) return;
    const { slot: from, view } = this.drag;
    const to = this.slotAt(pointer);
    this.drag = null;
    this.highlights.clear();
    this.rangeRing.setVisible(false);

    const result = this.merger.drop(this.board, from, to);
    if (to === null || result.kind === 'stay' || result.kind === 'blocked') {
      view.settle(...this.slotCenter(from), CAT_FEEL.returnMs);
      if (to !== null && result.kind === 'blocked') this.showBlocked(to, result.reason);
      return;
    }

    const target = this.views[to];
    switch (result.kind) {
      case 'move':
        this.board[to] = this.board[from];
        this.board[from] = null;
        this.views[to] = view;
        this.views[from] = null;
        view.settle(...this.slotCenter(to), CAT_FEEL.moveMs);
        break;

      case 'swap':
        [this.board[from], this.board[to]] = [this.board[to], this.board[from]];
        this.views[from] = target;
        this.views[to] = view;
        view.settle(...this.slotCenter(to), CAT_FEEL.moveMs);
        target?.settle(...this.slotCenter(from), CAT_FEEL.swapMs);
        break;

      case 'merge': {
        const [x, y] = this.slotCenter(to);
        view.absorb(x, y);
        target?.absorb(x, y);

        this.board[to] = result.cat;
        this.board[from] = null;
        const merged = new CatView(this, x, y, result.cat);
        merged.playSpawn(MERGE_FEEL.absorbMs);
        this.views[to] = merged;
        this.views[from] = null;

        this.playRing(x, y, elementColor(result.cat.element));
        break;
      }
    }
    this.events.emit(GameEvent.Changed);
  }

  private followPointer(pointer: Phaser.Input.Pointer): void {
    if (!this.drag) return;
    const { x, y } = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.drag.view.setPosition(x, y);
    this.rangeRing.setPosition(x, y);
  }

  /** Обводит клетки, с которыми взятый кот сольётся или упрётся в потолок уровня. */
  private drawHighlights(): void {
    const g = this.highlights;
    g.clear();
    if (!this.drag) return;
    const dragged = this.board[this.drag.slot];
    if (!dragged) return;

    const size = levels.slotSize;
    this.level.slots.forEach(([x, y], slot) => {
      if (slot === this.drag?.slot) return;
      if (slot === this.drag?.hover) {
        g.fillStyle(COLORS.slotHover);
        g.fillRoundedRect(x, y, size, size, SLOT_RADIUS);
      }
      const cat = this.board[slot];
      if (!cat) return;
      const check = this.merger.check(dragged, cat);
      if (check.kind === 'none') return;
      g.lineStyle(DRAG_FEEL.highlightLineWidth, check.kind === 'merge' ? elementColor(check.cat.element) : COLORS.danger);
      g.strokeRoundedRect(x, y, size, size, SLOT_RADIUS);
    });
  }

  /** Расходящееся кольцо слияния; стартует, когда коты стянулись в точку. */
  private playRing(x: number, y: number, color: number): void {
    const ring = this.add.graphics().setDepth(DEPTH.fx);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      delay: MERGE_FEEL.absorbMs,
      duration: MERGE_FEEL.ringMs,
      ease: MERGE_FEEL.ringEase,
      onUpdate: (tween) => {
        const k = tween.getValue() ?? 0;
        ring.clear();
        ring.lineStyle(MERGE_FEEL.ringLineWidth, color, 1 - k);
        ring.strokeCircle(x, y, MERGE_FEEL.ringFrom + (MERGE_FEEL.ringTo - MERGE_FEEL.ringFrom) * k);
      },
      onComplete: () => ring.destroy(),
    });
  }

  /** Всплывающая надпись над клеткой: почему слияние не состоялось. */
  private showBlocked(slot: number, reason: MergeBlock): void {
    if (this.toast) {
      this.tweens.killTweensOf(this.toast);
      this.toast.destroy();
    }

    const [x, y] = this.level.slots[slot];
    const toast = this.add
      .text(x + levels.slotSize / 2, y - TOAST_FEEL.offsetY, t(BLOCK_TEXT[reason], { level: this.level.maxCatLevel }), {
        fontFamily: FONTS.display,
        fontSize: '13px',
        color: TEXT_COLORS.danger,
      })
      .setOrigin(0.5, 1)
      .setStroke(TEXT_COLORS.dark, 4)
      .setDepth(DEPTH.toast)
      .setAlpha(0);
    this.toast = toast;

    this.tweens.add({
      targets: toast,
      y: toast.y - TOAST_FEEL.rise,
      alpha: 1,
      duration: TOAST_FEEL.riseMs,
      ease: TOAST_FEEL.riseEase,
    });
    this.tweens.add({
      targets: toast,
      alpha: 0,
      delay: TOAST_FEEL.riseMs + TOAST_FEEL.holdMs,
      duration: TOAST_FEEL.fadeMs,
      onComplete: () => {
        toast.destroy();
        if (this.toast === toast) this.toast = null;
      },
    });
  }

  private slotCenter(slot: number): Point {
    const [x, y] = this.level.slots[slot];
    const half = levels.slotSize / 2;
    return [x + half, y + half];
  }

  /** Клетка под указателем или null. */
  private slotAt(pointer: Phaser.Input.Pointer): number | null {
    const { x, y } = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const size = levels.slotSize;
    const slot = this.level.slots.findIndex(([sx, sy]) => x >= sx && x <= sx + size && y >= sy && y <= sy + size);
    return slot === -1 ? null : slot;
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
