import Phaser from 'phaser';
import { cats, elementColor, enemies, gear, getLevel, levels, type ElementId, type LevelConfig, type Point } from '../data';
import type { Cat } from '../entities/Cat';
import { CatView } from '../entities/CatView';
import type { Enemy } from '../entities/Enemy';
import type { Projectile } from '../entities/Projectile';
import { EnemyView } from '../entities/EnemyView';
import { HeroView } from '../entities/HeroView';
import { CAT_FEEL, DRAG_FEEL, ENEMY_FEEL, FX_FEEL, HINT_FEEL, MERGE_FEEL, METEOR_FEEL, SHOT_FEEL, TOAST_FEEL } from '../feel';
import { t, type StringKey } from '../i18n';
import { BOARD_H, BOARD_W, BOARD_Y, COLORS, DEPTH, FONTS, ROAD, SLOT_RADIUS, TEXT_COLORS } from '../layout';
import { progress } from '../progress';
import { catRange, Combat, type Blast, type CombatEvent } from '../systems/Combat';
import { Economy, starsFor } from '../systems/Economy';
import { Merge, type MergeBlock, type MergeCheck } from '../systems/Merge';
import { Meteor } from '../systems/Meteor';
import { buildPath, positionAt, type Path } from '../systems/Path';
import { Summon } from '../systems/Summon';
import { Waves } from '../systems/Waves';
import { GameEvent, SceneKey, type HudState, type LevelResult, type LevelSceneData, type MeteorState } from './keys';

// Пока снаряжение не выбирается игроком, посох и мантия берутся из умолчаний.
const STAFF_ID = gear.defaults.staff;
const MANTLE_ID = gear.defaults.mantle;

const BLOCK_TEXT: Record<MergeBlock, StringKey> = {
  maxLevel: 'merge.maxLevel',
  noCrystal: 'merge.noCrystal',
};

/** Самый длинный шаг боя, секунды: после подвисания вкладки враги не перескакивают дорогу. */
const MAX_STEP = 0.05;
/** На сколько вперёд по дороге смотрит враг, чтобы повернуться по ходу. */
const LOOK_AHEAD = 2;

interface Drag {
  pointerId: number;
  slot: number;
  view: CatView;
  /** Клетка под пальцем, кроме исходной. */
  hover: number | null;
}

export class GameScene extends Phaser.Scene {
  private level!: LevelConfig;
  /** Открыт наружу для отладочных кнопок (src/debug.ts). */
  economy!: Economy;
  private summoner!: Summon;
  /** Кот в каждой клетке, индексы совпадают с level.slots. */
  private board!: (Cat | null)[];
  private merger!: Merge;
  private views!: (CatView | null)[];
  private drag: Drag | null = null;
  private highlights!: Phaser.GameObjects.Graphics;
  private rangeRing!: Phaser.GameObjects.Graphics;
  private toast: Phaser.GameObjects.Text | null = null;
  /** Подпись над клеткой под пальцем: кто получится при слиянии. */
  private hint!: Phaser.GameObjects.Text;
  private path!: Path;
  private waves!: Waves;
  private combat!: Combat;
  private enemyViews = new Map<Enemy, EnemyView>();
  private projectileViews = new Map<Projectile, Phaser.GameObjects.Arc>();
  /** Номер волны и объявление, уже показанные в HUD. */
  private shownWave = '';
  /** Бой окончен: поле замирает, призыв и перетаскивание отключены. */
  private finished = false;
  private meteor!: Meteor;
  private hero!: HeroView;
  /** Подсветка поля, пока игрок выбирает точку удара. */
  private aimGlow!: Phaser.GameObjects.Graphics;
  /** Круг радиуса удара под пальцем. */
  private reticle!: Phaser.GameObjects.Graphics;
  /** Палец, который коснулся поля в режиме прицеливания: удар — когда он отпустит. */
  private aimPointerId: number | null = null;

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
    const staff = gear.staff.find((item) => item.id === STAFF_ID);
    this.summoner = new Summon(cats, staff);
    this.meteor = new Meteor(gear.meteor, gear.mantle.find((item) => item.id === MANTLE_ID));
    this.hero = new HeroView(this, ...this.level.hero, staff?.element ? elementColor(staff.element) : COLORS.meteor);
    this.merger = new Merge(cats, {
      maxCatLevel: this.level.maxCatLevel,
      ritualTime: gear.ritual.time,
      crystalCost: gear.ritual.crystalCost,
    });
    this.path = buildPath(this.level.path);
    this.waves = new Waves(levels.waves, this.level, enemies);
    this.combat = new Combat({
      cats,
      enemies,
      path: this.path,
      slots: this.level.slots.map((_, slot) => this.slotCenter(slot)),
      bounds: { width: BOARD_W, height: BOARD_H },
    });
    this.enemyViews = new Map();
    this.projectileViews = new Map();
    this.shownWave = '';
    this.finished = false;
    this.board = this.level.slots.map(() => null);
    this.views = this.level.slots.map(() => null);
    this.drag = null;
    this.toast = null;

    this.hint = this.add
      .text(0, 0, '', {
        fontFamily: FONTS.body,
        fontSize: '11px',
        backgroundColor: TEXT_COLORS.dark,
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.toast)
      .setVisible(false);

    this.highlights = this.add.graphics().setDepth(DEPTH.highlight);
    this.rangeRing = this.add.graphics().setDepth(DEPTH.fx).setVisible(false);
    this.addAimLayers();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);

    const data: LevelSceneData = { levelId: this.level.id };
    this.scene.launch(SceneKey.UI, data);
  }

  update(_time: number, delta: number): void {
    if (this.finished) return;
    const dt = Math.min(MAX_STEP, delta / 1000);
    this.meteor.update(dt);
    this.hero.setReady(this.meteor.ready);
    this.updateRituals(dt);
    this.updateBattle(dt);

    if (this.economy.lives <= 0) this.finish(false);
    else if (this.waves.finished && this.combat.enemies.length === 0) this.finish(true);
  }

  private finish(won: boolean): void {
    this.finished = true;
    this.cancelDrag();
    this.meteor.cancelAim();
    this.syncAim();

    const livesLost = this.level.startLives - this.economy.lives;
    const result: LevelResult = {
      won,
      stars: won ? starsFor(livesLost, levels.stars) : 0,
      livesLost,
      wave: this.waves.wave,
      totalWaves: this.level.waves,
    };
    if (won) {
      progress.recordStars(this.level.id, result.stars);
      progress.flush();
    }
    this.events.emit(GameEvent.Changed);
    this.events.emit(GameEvent.Finished, result);
  }

  private updateRituals(dt: number): void {
    this.board.forEach((cat, slot) => {
      if (!cat || cat.ritual <= 0) return;
      const view = this.views[slot];
      if (!this.merger.advanceRitual(cat, dt)) {
        view?.setRitualProgress(1 - cat.ritual / gear.ritual.time);
        return;
      }
      view?.finishRitual();
      this.playRing(...this.slotCenter(slot), elementColor(cat.element));
      this.discover(cat.element);
      // Кот вышел из ритуала и мог стать парой для того, которого сейчас держат.
      if (this.drag) this.drawHighlights();
    });
  }

  private updateBattle(dt: number): void {
    let changed = false;

    for (const enemy of this.waves.update(dt, this.combat.enemies.length === 0)) {
      this.combat.add(enemy);
      this.enemyViews.set(enemy, new EnemyView(this, ...positionAt(this.path, enemy.distance), enemy));
    }

    for (const event of this.combat.update(dt, this.board)) {
      if (this.handleCombatEvent(event)) changed = true;
    }

    const flying = new Set(this.combat.projectiles);
    for (const [projectile, view] of this.projectileViews) {
      if (flying.has(projectile)) {
        view.setPosition(projectile.x, projectile.y);
      } else {
        view.destroy();
        this.projectileViews.delete(projectile);
      }
    }

    for (const enemy of this.combat.enemies) {
      const [x, y] = positionAt(this.path, enemy.distance);
      const [aheadX, aheadY] = positionAt(this.path, enemy.distance + LOOK_AHEAD);
      this.enemyViews.get(enemy)?.sync(enemy, x, y, Math.atan2(aheadY - y, aheadX - x));
    }

    const wave = `${this.waves.wave}:${this.waves.upcoming?.wave ?? ''}`;
    if (wave !== this.shownWave) {
      this.shownWave = wave;
      changed = true;
    }
    if (changed) this.events.emit(GameEvent.Changed);
  }

  /** Меняет экономику и картинку по событию боя. Возвращает true, если HUD пора обновить. */
  private handleCombatEvent(event: CombatEvent): boolean {
    switch (event.kind) {
      case 'leaked':
        this.economy.loseLives(event.lifeDamage);
        this.enemyViews.get(event.enemy)?.destroy();
        this.enemyViews.delete(event.enemy);
        this.cameras.main.shake(ENEMY_FEEL.leakShakeMs, ENEMY_FEEL.leakShakeIntensity);
        return true;

      case 'shot':
        this.views[event.slot]?.playShot();
        this.addProjectileView(event.projectile);
        break;

      case 'hit':
        this.enemyViews.get(event.enemy)?.playHit();
        break;

      case 'splash': {
        const { x, y, radius } = event;
        const color = elementColor(event.element);
        this.playFx(FX_FEEL.splashMs, (g, k) => {
          g.fillStyle(color, FX_FEEL.splashAlpha * (1 - k));
          g.fillCircle(x, y, radius * (FX_FEEL.splashFrom + (1 - FX_FEEL.splashFrom) * k));
        });
        break;
      }

      case 'chain': {
        const [fromX, fromY] = event.from;
        const [toX, toY] = event.to;
        const color = elementColor(event.element);
        this.playFx(FX_FEEL.boltMs, (g, k) => {
          g.lineStyle(FX_FEEL.boltWidth, color, 1 - k);
          g.beginPath();
          g.moveTo(fromX, fromY);
          g.lineTo((fromX + toX) / 2 + FX_FEEL.boltKink, (fromY + toY) / 2 - FX_FEEL.boltKink);
          g.lineTo(toX, toY);
          g.strokePath();
        });
        break;
      }

      case 'aura': {
        const [x, y] = this.slotCenter(event.slot);
        const { radius } = event;
        const color = elementColor(event.element);
        this.views[event.slot]?.playShot();
        this.playFx(FX_FEEL.auraMs, (g, k) => {
          g.lineStyle(FX_FEEL.auraWidth, color, FX_FEEL.auraAlpha * (1 - k));
          g.strokeCircle(x, y, radius * (FX_FEEL.auraFrom + (1 - FX_FEEL.auraFrom) * k));
        });
        break;
      }

      case 'blocked':
        this.enemyViews.get(event.enemy)?.playBlock();
        break;

      case 'killed':
        this.economy.reward(event.gold, event.crystals);
        this.enemyViews.get(event.enemy)?.playDeath();
        this.enemyViews.delete(event.enemy);
        this.showReward(event.x, event.y, event.gold, event.crystals);
        // С новым кристаллом заблокированное смешение могло стать доступным.
        if (this.drag && event.crystals > 0) this.drawHighlights();
        return true;
    }
    return false;
  }

  private addProjectileView(projectile: Projectile): void {
    const heavy = cats.elements[projectile.element].fx === 'heavy';
    const view = this.add
      .circle(projectile.x, projectile.y, heavy ? SHOT_FEEL.heavyRadius : SHOT_FEEL.radius, elementColor(projectile.element))
      .setDepth(DEPTH.projectile);
    this.projectileViews.set(projectile, view);
  }

  /** Короткая вспышка эффекта: `draw` перерисовывает её, пока `k` идёт от 0 до 1. */
  private playFx(duration: number, draw: (g: Phaser.GameObjects.Graphics, k: number) => void): void {
    const g = this.add.graphics().setDepth(DEPTH.fx);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      onUpdate: (tween) => {
        g.clear();
        draw(g, tween.getValue() ?? 0);
      },
      onComplete: () => g.destroy(),
    });
  }

  /** Всплывающая награда над убитым врагом. */
  private showReward(x: number, y: number, gold: number, crystals: number): void {
    const text = this.add
      .text(x, y - SHOT_FEEL.rewardOffsetY, t(crystals > 0 ? 'reward.goldCrystals' : 'reward.gold', { gold, crystals }), {
        fontFamily: FONTS.display,
        fontSize: '13px',
        color: crystals > 0 ? TEXT_COLORS.crystal : TEXT_COLORS.brass,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.fx);
    this.tweens.add({
      targets: text,
      y: text.y - SHOT_FEEL.rewardRise,
      alpha: 0,
      duration: SHOT_FEEL.rewardMs,
      onComplete: () => text.destroy(),
    });
  }

  hudState(): HudState {
    return {
      gold: this.economy.gold,
      crystals: this.economy.crystals,
      summonCost: this.economy.summonCost,
      canSummon: !this.finished && this.economy.canAffordSummon() && this.board.includes(null),
      lives: this.economy.lives,
      wave: this.waves.wave,
      totalWaves: this.level.waves,
      upcoming: this.waves.upcoming,
    };
  }

  /** Сколько котов и врагов на поле; читает смоук-проверка (src/smoke.ts). */
  fieldCounts(): { cats: number; enemies: number } {
    return {
      cats: this.board.filter((cat) => cat !== null).length,
      enemies: this.combat.enemies.length,
    };
  }

  meteorState(): MeteorState {
    const { ready, aiming, remaining, progress } = this.meteor;
    return { ready, aiming, remaining, progress };
  }

  /** Кнопка «Метеор»: включает прицеливание или отменяет его. */
  toggleMeteorAim(): void {
    if (this.finished) return;
    // Пока идёт прицеливание, котов не таскают: взятый возвращается на место.
    if (this.meteor.toggleAim()) this.cancelDrag();
    this.syncAim();
  }

  private addAimLayers(): void {
    const inset = METEOR_FEEL.aimBorderInset;
    this.aimGlow = this.add.graphics().setDepth(DEPTH.highlight).setVisible(false);
    this.aimGlow.fillStyle(COLORS.meteor, METEOR_FEEL.aimFillAlpha);
    this.aimGlow.fillRect(0, 0, BOARD_W, BOARD_H);
    this.aimGlow.lineStyle(METEOR_FEEL.aimBorderWidth, COLORS.meteor, METEOR_FEEL.aimBorderAlpha);
    this.aimGlow.strokeRect(inset, inset, BOARD_W - inset * 2, BOARD_H - inset * 2);

    const { radius } = gear.meteor;
    this.reticle = this.add.graphics().setDepth(DEPTH.dragged).setVisible(false);
    this.reticle.fillStyle(COLORS.meteor, METEOR_FEEL.reticleFillAlpha);
    this.reticle.fillCircle(0, 0, radius);
    this.reticle.lineStyle(METEOR_FEEL.reticleLineWidth, COLORS.meteor, METEOR_FEEL.reticleLineAlpha);
    this.reticle.strokeCircle(0, 0, radius);
    this.reticle.fillStyle(COLORS.meteor);
    this.reticle.fillCircle(0, 0, METEOR_FEEL.reticleDot);
    this.aimPointerId = null;
  }

  /** Показывает или прячет подсветку поля по состоянию прицеливания. */
  private syncAim(): void {
    const { aiming } = this.meteor;
    if (aiming === this.aimGlow.visible) return;
    this.tweens.killTweensOf(this.aimGlow);
    this.aimGlow.setVisible(aiming).setAlpha(1);
    if (aiming) {
      this.tweens.add({
        targets: this.aimGlow,
        alpha: METEOR_FEEL.aimPulseAlpha,
        duration: METEOR_FEEL.aimPulseMs,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    } else {
      this.reticle.setVisible(false);
      this.aimPointerId = null;
    }
  }

  /** Ставит круг удара под указатель; за пределами поля круг прячется. */
  private moveReticle(pointer: Phaser.Input.Pointer): Point | null {
    const point = this.boardPoint(pointer);
    this.reticle.setVisible(point !== null);
    if (point) this.reticle.setPosition(...point);
    return point;
  }

  /** Метеор летит от посоха героя в точку и взрывается там. */
  private castMeteor(x: number, y: number): void {
    const blast = this.meteor.cast(this.waves.wave, this.level.hpMult);
    this.syncAim();
    if (!blast) return;

    this.hero.playCast();
    const [fromX, fromY] = this.hero.orbPoint();
    const ball = this.add.circle(fromX, fromY, METEOR_FEEL.ballRadius, COLORS.meteor).setDepth(DEPTH.dragged);
    const trail = this.time.addEvent({
      delay: METEOR_FEEL.trailEveryMs,
      loop: true,
      callback: () => {
        const spark = this.add
          .circle(ball.x, ball.y, METEOR_FEEL.ballRadius * ball.scale * METEOR_FEEL.trailScale, COLORS.brass, METEOR_FEEL.trailAlpha)
          .setDepth(DEPTH.fx);
        this.tweens.add({
          targets: spark,
          alpha: 0,
          scale: 0,
          duration: METEOR_FEEL.trailMs,
          onComplete: () => spark.destroy(),
        });
      },
    });
    this.tweens.add({
      targets: ball,
      x,
      y,
      scale: { from: METEOR_FEEL.ballFromScale, to: 1 },
      duration: METEOR_FEEL.flightMs,
      ease: METEOR_FEEL.flightEase,
      onComplete: () => {
        trail.remove();
        ball.destroy();
        this.landMeteor(x, y, blast);
      },
    });
  }

  /** Взрыв: урон получают те, кто в круге в момент прилёта. */
  private landMeteor(x: number, y: number, blast: Blast): void {
    if (this.finished) return;

    let changed = false;
    for (const event of this.combat.strike(x, y, blast)) {
      if (this.handleCombatEvent(event)) changed = true;
    }
    if (changed) this.events.emit(GameEvent.Changed);

    const { radius } = blast;
    this.playFx(METEOR_FEEL.blastMs, (g, k) => {
      const r = radius * (METEOR_FEEL.blastFrom + (1 - METEOR_FEEL.blastFrom) * Phaser.Math.Easing.Cubic.Out(k));
      g.fillStyle(COLORS.meteor, METEOR_FEEL.blastAlpha * (1 - k));
      g.fillCircle(x, y, r);
      g.lineStyle(METEOR_FEEL.blastRingWidth, COLORS.brass, 1 - k);
      g.strokeCircle(x, y, r);
    });
    this.playFx(METEOR_FEEL.blastCoreMs, (g, k) => {
      g.fillStyle(COLORS.flash, 1 - k);
      g.fillCircle(x, y, radius * METEOR_FEEL.blastCoreRadius * (1 - k));
    });
    this.playFx(METEOR_FEEL.flashMs, (g, k) => {
      g.fillStyle(COLORS.flash, METEOR_FEEL.flashAlpha * (1 - k));
      g.fillRect(0, 0, BOARD_W, BOARD_H);
    });
    this.cameras.main.shake(METEOR_FEEL.shakeMs, METEOR_FEEL.shakeIntensity);
  }

  summon(): void {
    if (this.finished || !this.economy.canAffordSummon()) return;
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
    if (this.drag || this.finished) return;
    if (this.meteor.aiming) {
      if (this.moveReticle(pointer)) this.aimPointerId = pointer.id;
      return;
    }
    const slot = this.slotAt(pointer);
    if (slot === null) return;
    const cat = this.board[slot];
    const view = this.views[slot];
    if (!cat || !view) return;
    if (cat.ritual > 0) {
      this.showToast(slot, t('merge.ritual'));
      return;
    }

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
    if (this.meteor.aiming) {
      // Мышь водит круг и без нажатия; второй палец прицел не перехватывает.
      if (this.aimPointerId === null || pointer.id === this.aimPointerId) this.moveReticle(pointer);
      return;
    }
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
    if (this.meteor.aiming) {
      if (pointer.id !== this.aimPointerId) return;
      this.aimPointerId = null;
      // Отпустили за краем поля — удара нет, прицеливание продолжается.
      const point = this.moveReticle(pointer);
      if (point) this.castMeteor(...point);
      return;
    }
    if (!this.drag || pointer.id !== this.drag.pointerId) return;
    const { slot: from, view } = this.drag;
    const to = this.slotAt(pointer);
    this.drag = null;
    this.highlights.clear();
    this.hint.setVisible(false);
    this.rangeRing.setVisible(false);

    const result = this.merger.drop(this.board, from, to, this.economy.crystals);
    if (to === null || result.kind === 'stay' || result.kind === 'blocked' || result.kind === 'busy') {
      view.settle(...this.slotCenter(from), CAT_FEEL.returnMs);
      if (to !== null && result.kind === 'blocked') this.showToast(to, this.blockText(result.reason));
      if (to !== null && result.kind === 'busy') this.showToast(to, t('merge.ritual'));
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

        this.economy.crystals -= result.crystalCost;
        this.board[to] = result.cat;
        this.board[from] = null;
        const merged = new CatView(this, x, y, result.cat);
        merged.playSpawn(MERGE_FEEL.absorbMs);
        this.views[to] = merged;
        this.views[from] = null;

        if (result.cat.ritual > 0) {
          // Вспышка, кольцо и открытие кота — по окончании ритуала, см. update().
          merged.startRitual();
        } else {
          this.playRing(x, y, elementColor(result.cat.element), MERGE_FEEL.absorbMs);
          this.discover(result.cat.element);
        }
        break;
      }
    }
    this.events.emit(GameEvent.Changed);
  }

  /** Возвращает взятого кота на место. */
  private cancelDrag(): void {
    if (!this.drag) return;
    this.drag.view.settle(...this.slotCenter(this.drag.slot), CAT_FEEL.returnMs);
    this.drag = null;
    this.highlights.clear();
    this.hint.setVisible(false);
    this.rangeRing.setVisible(false);
  }

  private followPointer(pointer: Phaser.Input.Pointer): void {
    if (!this.drag) return;
    const { x, y } = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.drag.view.setPosition(x, y);
    this.rangeRing.setPosition(x, y);
  }

  /** Обводит клетки, с которыми взятый кот сольётся или слияние чем-то заблокировано, и подписывает ту, что под пальцем. */
  private drawHighlights(): void {
    const g = this.highlights;
    g.clear();
    this.hint.setVisible(false);
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
      const check = this.merger.check(dragged, cat, this.economy.crystals);
      if (check.kind === 'none') return;
      g.lineStyle(DRAG_FEEL.highlightLineWidth, check.kind === 'merge' ? elementColor(check.cat.element) : COLORS.danger);
      g.strokeRoundedRect(x, y, size, size, SLOT_RADIUS);
      if (slot === this.drag?.hover) this.showHint(slot, check);
    });
  }

  private showHint(slot: number, check: Exclude<MergeCheck, { kind: 'none' }>): void {
    const [x, y] = this.level.slots[slot];
    this.hint
      .setText(this.hintText(check))
      .setColor(check.kind === 'merge' ? cats.elements[check.cat.element].color : TEXT_COLORS.danger)
      .setPosition(x + levels.slotSize / 2, y - HINT_FEEL.offsetY)
      .setVisible(true);
  }

  private hintText(check: Exclude<MergeCheck, { kind: 'none' }>): string {
    if (check.kind === 'blocked') return this.blockText(check.reason);

    const { element, level } = check.cat;
    // Ещё не открытый гибрид остаётся загадкой до конца ритуала.
    const known = !this.merger.isHybrid(element) || progress.hasCat(element);
    const text = known ? t('merge.preview', { name: t(`cat.${element}`), level }) : t('merge.previewUnknown');
    return check.crystalCost > 0 ? t('merge.crystalCost', { text, cost: check.crystalCost }) : text;
  }

  private blockText(reason: MergeBlock): string {
    return t(BLOCK_TEXT[reason], { level: this.level.maxCatLevel });
  }

  /** Запоминает гибрида, полученного впервые, и сообщает об этом HUD. */
  private discover(element: ElementId): void {
    if (!this.merger.isHybrid(element) || !progress.discover(element)) return;
    this.events.emit(GameEvent.Discovered, element);
  }

  /** Расходящееся кольцо цвета стихии: после слияния (с задержкой, пока коты стягиваются) и в конце ритуала. */
  private playRing(x: number, y: number, color: number, delay = 0): void {
    const ring = this.add.graphics().setDepth(DEPTH.fx);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      delay,
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

  /** Всплывающая надпись над клеткой: почему слияние или перетаскивание не состоялось. */
  private showToast(slot: number, text: string): void {
    if (this.toast) {
      this.tweens.killTweensOf(this.toast);
      this.toast.destroy();
    }

    const [x, y] = this.level.slots[slot];
    const toast = this.add
      .text(x + levels.slotSize / 2, y - TOAST_FEEL.offsetY, text, {
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

  /** Точка поля под указателем или null, если он за краем поля. */
  private boardPoint(pointer: Phaser.Input.Pointer): Point | null {
    const { x, y } = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return x >= 0 && x <= BOARD_W && y >= 0 && y <= BOARD_H ? [x, y] : null;
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
