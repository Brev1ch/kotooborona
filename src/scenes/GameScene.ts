import Phaser from 'phaser';
import { audio } from '../audio';
import { ads, cats, economy, elementColor, enemies, gear, getLevel, levels, type ElementId, type LevelConfig, type Point } from '../data';
import type { Cat } from '../entities/Cat';
import { CatView } from '../entities/CatView';
import type { Enemy } from '../entities/Enemy';
import type { Projectile } from '../entities/Projectile';
import { EnemyView } from '../entities/EnemyView';
import { HeroView } from '../entities/HeroView';
import { CAT_FEEL, DRAG_FEEL, ENEMY_FEEL, FX_FEEL, HINT_FEEL, MERGE_FEEL, METEOR_FEEL, SHOT_FEEL, TOAST_FEEL, TRASH_FEEL } from '../feel';
import { t, type StringKey } from '../i18n';
import { BOARD_H, BOARD_W, BOARD_Y, COLORS, DEPTH, FONTS, ROAD, SLOT_RADIUS, TEXT_COLORS, TRASH } from '../layout';
import { platform } from '../platform';
import { progress } from '../progress';
import { CoinAd, SecondChance } from '../systems/Ads';
import { catRange, Combat, type Blast, type CombatEvent } from '../systems/Combat';
import { Economy, starsFor } from '../systems/Economy';
import { gearBonuses } from '../systems/Loadout';
import { Merge, type MergeBlock, type MergeCheck } from '../systems/Merge';
import { Meteor } from '../systems/Meteor';
import { Pool } from '../systems/Pool';
import { levelFish } from '../systems/Rewards';
import { buildPath, positionAt, type Path } from '../systems/Path';
import { Summon } from '../systems/Summon';
import { densestPoint, findMergePair, type TutorialState } from '../systems/Tutorial';
import { Waves } from '../systems/Waves';
import {
  GameEvent,
  SceneKey,
  type CoinAdState,
  type HudState,
  type LevelResult,
  type LevelSceneData,
  type MeteorState,
  type RewardDrop,
} from './keys';
import { addBakedShape, bakeTexture, CIRCLE_RADIUS, ensureTextures, Texture } from './textures';
import { fadeIn } from './transitions';
import { addCrystalIcon } from './widgets';

const BLOCK_TEXT: Record<MergeBlock, StringKey> = {
  maxLevel: 'merge.maxLevel',
  noCrystal: 'merge.noCrystal',
};

/** Самый длинный шаг боя, секунды: после подвисания вкладки враги не перескакивают дорогу. */
const MAX_STEP = 0.05;
/** На сколько вперёд по дороге смотрит враг, чтобы повернуться по ходу. */
const LOOK_AHEAD = 2;

/** Всплывающая награда над убитым врагом: монеты и, если выпали, кристаллы. */
interface RewardLabel {
  box: Phaser.GameObjects.Container;
  gold: Phaser.GameObjects.Text;
  icon: Phaser.GameObjects.Image;
  count: Phaser.GameObjects.Text;
  /** Цвет текста сейчас — как у награды с кристаллами. */
  crystal: boolean;
}

const REWARD_STYLE = { fontFamily: FONTS.display, fontSize: '13px' };

interface Drag {
  pointerId: number;
  slot: number;
  view: CatView;
  /** Клетка под пальцем, кроме исходной. */
  hover: number | null;
  /** Кот над корзиной: отпустить — значит продать. */
  overTrash: boolean;
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
  private trash!: Phaser.GameObjects.Image;
  private toast: Phaser.GameObjects.Text | null = null;
  /** Подпись над клеткой под пальцем: кто получится при слиянии и сколько кристаллов это стоит. */
  private hint!: Phaser.GameObjects.Container;
  private hintBg!: Phaser.GameObjects.Rectangle;
  private hintLabel!: Phaser.GameObjects.Text;
  private hintIcon!: Phaser.GameObjects.Image;
  private hintCost!: Phaser.GameObjects.Text;
  private path!: Path;
  private waves!: Waves;
  private combat!: Combat;
  private enemyViews = new Map<Enemy, EnemyView>();
  private projectileViews = new Map<Projectile, Phaser.GameObjects.Image>();
  // Пулы: то, что в бою появляется и исчезает десятки раз в секунду, не создаётся заново, а берётся отсюда.
  private shots!: Pool<Phaser.GameObjects.Image>;
  /** Круги вспышек по площади. */
  private discs!: Pool<Phaser.GameObjects.Image>;
  /** Расходящиеся кольца: буря, слияние. */
  private rings!: Pool<Phaser.GameObjects.Image>;
  /** Холсты для молний и взрыва метеора. */
  private canvases!: Pool<Phaser.GameObjects.Graphics>;
  private rewards!: Pool<RewardLabel>;
  /** Номер волны и объявление, уже показанные в HUD. */
  private shownWave = '';
  /** Бой окончен: поле замирает, призыв и перетаскивание отключены. */
  private finished = false;
  private meteor!: Meteor;
  private coinAd!: CoinAd;
  private secondChance!: SecondChance;
  /** Что игрок уже сделал в этом бою; по этому обучение понимает, какие подсказки больше не нужны. */
  private actions = { summons: 0, merges: 0, hybrids: 0, meteors: 0, sales: 0 };
  /** Масштаб картинки корзины в покое: запечённая фигура крупнее экранной. */
  private trashScale = 1;
  private hero!: HeroView;
  /** Подсветка поля, пока игрок выбирает точку удара. */
  private aimGlow!: Phaser.GameObjects.Graphics;
  /** Круг радиуса удара под пальцем. */
  private reticle!: Phaser.GameObjects.Graphics;
  /** Облачка на месте убитых врагов. */
  private puffs!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Искры слияния; цвет стихии задаётся перед каждой вспышкой. */
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
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
    fadeIn(this);

    // Дорога, ворота и клетки не меняются — запекаются в одну картинку.
    const boardKey = `board-${this.level.id}`;
    bakeTexture(this, boardKey, BOARD_W, BOARD_H, (g) => {
      this.drawRoad(g, this.level.path);
      this.drawGate(g, this.level.path[this.level.path.length - 1]);
      this.drawSlots(g, this.level.slots);
    });
    this.add.image(0, 0, boardKey).setOrigin(0);

    const worn = progress.gear;
    const bonuses = gearBonuses(gear, worn, (slot, id) => progress.gearLevel(slot, id));
    this.economy = new Economy(this.level, economy, bonuses);
    this.summoner = new Summon(cats, bonuses.summonWeights);
    this.meteor = new Meteor(gear.meteor, bonuses.meteorCooldownMult);
    this.coinAd = new CoinAd(ads.coins);
    this.secondChance = new SecondChance(ads.secondChance);
    const staff = gear.staff.find((item) => item.id === worn.staff);
    this.hero = new HeroView(this, ...this.level.hero, staff?.element ? elementColor(staff.element) : COLORS.meteor);
    this.merger = new Merge(cats, {
      maxCatLevel: this.level.maxCatLevel,
      ritualTime: gear.ritual.time * bonuses.ritualTimeMult,
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
    this.actions = { summons: 0, merges: 0, hybrids: 0, meteors: 0, sales: 0 };
    this.finished = false;
    this.board = this.level.slots.map(() => null);
    this.views = this.level.slots.map(() => null);
    this.drag = null;
    this.toast = null;

    const hintStyle = { fontFamily: FONTS.body, fontSize: '11px' };
    this.hintBg = this.add.rectangle(0, 0, 1, 1, COLORS.bg).setOrigin(0.5, 1);
    this.hintLabel = this.add.text(0, 0, '', hintStyle).setOrigin(0, 0.5);
    this.hintIcon = addCrystalIcon(this, 0, 0, HINT_FEEL.iconSize);
    this.hintCost = this.add.text(0, 0, '', hintStyle).setOrigin(0, 0.5);
    this.hint = this.add
      .container(0, 0, [this.hintBg, this.hintLabel, this.hintIcon, this.hintCost])
      .setDepth(DEPTH.toast)
      .setVisible(false);

    this.trash = addBakedShape(this, 'trash', TRASH.size, TRASH.size, drawTrash)
      .setPosition(...this.level.trash)
      .setDepth(DEPTH.highlight)
      .setAlpha(TRASH_FEEL.idleAlpha);
    this.trashScale = this.trash.scale;

    this.highlights = this.add.graphics().setDepth(DEPTH.highlight);
    this.rangeRing = this.add.graphics().setDepth(DEPTH.fx).setVisible(false);
    this.addAimLayers();
    this.addParticles();
    this.addPools();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);

    const data: LevelSceneData = { levelId: this.level.id };
    this.scene.launch(SceneKey.UI, data);

    // Площадке нужно знать, когда игрок играет: бой начался; пауза, конец боя и выход его останавливают.
    platform.gameplayStart();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => platform.gameplayStop());
  }

  update(_time: number, delta: number): void {
    if (this.finished) return;
    const dt = Math.min(MAX_STEP, delta / 1000);
    this.meteor.update(dt);
    this.coinAd.update(dt);
    this.hero.setReady(this.meteor.ready);
    this.updateRituals(dt);
    this.updateBattle(dt);

    if (this.economy.lives <= 0) this.finish(false);
    else if (this.waves.finished && this.combat.enemies.length === 0) this.finish(true);
  }

  /**
   * Пауза игрока: бой, волны, перезарядки и анимации поля стоят до `resumeBattle`.
   * Возвращает false, если ставить на паузу нечего: бой окончен или уже стоит.
   */
  pauseBattle(): boolean {
    if (this.finished || this.scene.isPaused()) return false;
    // Взятый кот возвращается на место: палец отпустят уже над меню паузы.
    this.cancelDrag();
    this.aimPointerId = null;
    this.reticle.setVisible(false);
    this.scene.pause();
    platform.gameplayStop();
    return true;
  }

  resumeBattle(): void {
    this.scene.resume();
    platform.gameplayStart();
  }

  /** Заканчивает бой. Открыт наружу для смоук-проверки (src/smoke.ts). */
  finish(won: boolean): void {
    if (this.finished) return;
    this.finished = true;
    platform.gameplayStop();
    this.cancelDrag();
    this.meteor.cancelAim();
    this.syncAim();

    const { livesLost } = this.economy;
    const stars = won ? starsFor(livesLost, levels.stars) : 0;
    const firstClear = progress.stars(this.level.id) === 0;
    const result: LevelResult = {
      won,
      stars,
      livesLost,
      wave: this.waves.wave,
      totalWaves: this.level.waves,
      fish: won ? levelFish(this.level.fish, stars, firstClear, levels.rewards) : 0,
      canRevive: !won && this.secondChance.available,
      reviveLives: this.secondChance.lives,
    };
    if (won) {
      progress.recordStars(this.level.id, stars);
      progress.addFish(result.fish);
      progress.flush();
    }
    this.events.emit(GameEvent.Changed);
    this.events.emit(GameEvent.Finished, result);
  }

  /**
   * «Второй шанс»: бой продолжается с того же места, жизни возвращаются, метеор готов.
   * Возвращает false, если шанс уже потрачен или бой не проигран.
   */
  revive(): boolean {
    if (!this.finished || this.economy.lives > 0 || !this.secondChance.available) return false;
    this.economy.revive(this.secondChance.use());
    this.meteor.recharge();
    this.finished = false;
    platform.gameplayStart();
    this.events.emit(GameEvent.Changed);
    return true;
  }

  /** Срез боя для обучения (systems/Tutorial). */
  tutorialState(): TutorialState {
    const points = this.combat.enemies
      .map((enemy) => positionAt(this.path, enemy.distance))
      .filter(([x, y]) => x >= 0 && y >= 0 && x <= BOARD_W && y <= BOARD_H);
    const { crystals } = this.economy;
    return {
      finished: this.finished,
      ...this.actions,
      canSummon: !this.finished && this.economy.canAffordSummon() && this.board.includes(null),
      mergePair: findMergePair(this.board, this.merger, crystals, false),
      hybridPair: findMergePair(this.board, this.merger, crystals, true),
      meteorReady: this.meteor.ready,
      aiming: this.meteor.aiming,
      enemies: points.length,
      cluster: densestPoint(points, gear.meteor.radius),
    };
  }

  coinAdState(): CoinAdState {
    return { ready: !this.finished && this.coinAd.ready, remaining: this.coinAd.remaining, gold: ads.coins.gold };
  }

  /** Игрок досмотрел ролик: монеты в бой. Возвращает, сколько выдано. */
  claimCoinAd(): number {
    if (this.finished) return 0;
    const gold = this.coinAd.claim();
    if (gold > 0) {
      this.economy.gold += gold;
      this.events.emit(GameEvent.Changed);
    }
    return gold;
  }

  private updateRituals(dt: number): void {
    this.board.forEach((cat, slot) => {
      if (!cat || cat.ritual <= 0) return;
      const view = this.views[slot];
      if (!this.merger.advanceRitual(cat, dt)) {
        view?.setRitualProgress(1 - cat.ritual / this.merger.ritualTime);
        return;
      }
      view?.finishRitual();
      audio.play('hybrid');
      this.playRing(...this.slotCenter(slot), elementColor(cat.element));
      this.discover(cat.element);
      // Кот вышел из ритуала и мог стать парой для того, которого сейчас держат.
      if (this.drag) this.drawHighlights();
    });
  }

  private updateBattle(dt: number): void {
    let changed = false;

    const before = this.waves.wave;
    for (const enemy of this.waves.update(dt, this.combat.enemies.length === 0)) this.addEnemy(enemy);
    if (this.waves.wave !== before) this.economy.startWave();

    for (const event of this.combat.update(dt, this.board)) {
      if (this.handleCombatEvent(event)) changed = true;
    }

    const flying = new Set(this.combat.projectiles);
    for (const [projectile, view] of this.projectileViews) {
      if (flying.has(projectile)) {
        view.setPosition(projectile.x, projectile.y);
      } else {
        view.setVisible(false);
        this.shots.release(view);
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

  /** Выпускает врага на дорогу. Открыт наружу для отладочных кнопок (src/debug.ts). */
  addEnemy(enemy: Enemy): void {
    this.combat.add(enemy);
    this.addEnemyView(enemy);
  }

  private addEnemyView(enemy: Enemy): void {
    this.enemyViews.set(enemy, new EnemyView(this, ...positionAt(this.path, enemy.distance), enemy));
  }

  /** Ставит кота в клетку, заменяя прежнего. Открыт наружу для отладочных кнопок (src/debug.ts). */
  placeCat(slot: number, cat: Cat): CatView {
    this.views[slot]?.destroy();
    const view = new CatView(this, ...this.slotCenter(slot), cat);
    this.board[slot] = cat;
    this.views[slot] = view;
    return view;
  }

  get levelId(): string {
    return this.level.id;
  }

  get slotCount(): number {
    return this.level.slots.length;
  }

  /** Центры клеток в координатах поля; читает смоук-проверка (src/smoke.ts). */
  slotCenters(): Point[] {
    return this.level.slots.map((_, slot) => this.slotCenter(slot));
  }

  /** Меняет экономику и картинку по событию боя. Возвращает true, если HUD пора обновить. */
  /** Клетки, в которых стоят коты. */
  catSlots(): number[] {
    return this.board.flatMap((cat, slot) => (cat ? [slot] : []));
  }

  /** Центр корзины в координатах поля. */
  get trashCenter(): Point {
    return this.level.trash;
  }

  private handleCombatEvent(event: CombatEvent): boolean {
    switch (event.kind) {
      case 'leaked':
        this.economy.loseLives(event.lifeDamage);
        this.enemyViews.get(event.enemy)?.destroy();
        this.enemyViews.delete(event.enemy);
        this.cameras.main.shake(ENEMY_FEEL.leakShakeMs, ENEMY_FEEL.leakShakeIntensity);
        audio.play('lifeLost');
        return true;

      case 'shot':
        this.views[event.slot]?.playShot();
        this.addProjectileView(event.projectile);
        audio.play('shot');
        break;

      case 'hit':
        this.enemyViews.get(event.enemy)?.playHit();
        audio.play('hit');
        break;

      case 'splash': {
        const { x, y, radius } = event;
        const { splashFrom, splashAlpha, splashMs } = FX_FEEL;
        this.playCircle(this.discs, x, y, elementColor(event.element), radius * splashFrom, radius, splashAlpha, splashMs);
        break;
      }

      case 'chain': {
        const [fromX, fromY] = event.from;
        const [toX, toY] = event.to;
        const color = elementColor(event.element);
        // Молния рисуется один раз и гаснет целиком.
        const bolt = this.canvases.acquire().setAlpha(1).setVisible(true);
        bolt.lineStyle(FX_FEEL.boltWidth, color);
        bolt.beginPath();
        bolt.moveTo(fromX, fromY);
        bolt.lineTo((fromX + toX) / 2 + FX_FEEL.boltKink, (fromY + toY) / 2 - FX_FEEL.boltKink);
        bolt.lineTo(toX, toY);
        bolt.strokePath();
        this.tweens.add({
          targets: bolt,
          alpha: 0,
          duration: FX_FEEL.boltMs,
          onComplete: () => {
            bolt.clear().setAlpha(1).setVisible(false);
            this.canvases.release(bolt);
          },
        });
        break;
      }

      case 'aura': {
        const [x, y] = this.slotCenter(event.slot);
        const { radius } = event;
        const { auraFrom, auraAlpha, auraMs } = FX_FEEL;
        this.views[event.slot]?.playShot();
        audio.play('shot');
        this.playCircle(this.rings, x, y, elementColor(event.element), radius * auraFrom, radius, auraAlpha, auraMs);
        break;
      }

      case 'blocked':
        this.enemyViews.get(event.enemy)?.playBlock();
        break;

      case 'spawned':
        // Подмога короля уже в бою — ей нужна только картинка.
        this.addEnemyView(event.enemy);
        break;

      case 'killed':
        this.economy.reward(event.gold, event.crystals);
        this.enemyViews.get(event.enemy)?.playDeath();
        this.enemyViews.delete(event.enemy);
        this.showReward(event.x, event.y, event.gold, event.crystals);
        this.puffs.emitParticleAt(event.x, event.y, Math.round(enemies.types[event.enemy.type].radius * ENEMY_FEEL.puffPerRadius));
        audio.play('enemyDeath');
        // Монеты и кристаллы летят в счётчики HUD.
        this.events.emit(GameEvent.Reward, {
          x: event.x,
          y: event.y,
          gold: event.gold,
          crystals: event.crystals,
        } satisfies RewardDrop);
        // С новым кристаллом заблокированное смешение могло стать доступным.
        if (this.drag && event.crystals > 0) this.drawHighlights();
        return true;
    }
    return false;
  }

  private addProjectileView(projectile: Projectile): void {
    const heavy = cats.elements[projectile.element].fx === 'heavy';
    const size = (heavy ? SHOT_FEEL.heavyRadius : SHOT_FEEL.radius) * 2;
    const view = this.shots
      .acquire()
      .setPosition(projectile.x, projectile.y)
      .setDisplaySize(size, size)
      .setTint(elementColor(projectile.element))
      .setVisible(true);
    this.projectileViews.set(projectile, view);
  }

  /**
   * Круг или кольцо из пула растёт от радиуса `from` до `to` и гаснет от `alpha` до нуля.
   * Картинка вместо Graphics: её не нужно перерисовывать каждый кадр.
   */
  private playCircle(
    pool: Pool<Phaser.GameObjects.Image>,
    x: number,
    y: number,
    color: number,
    from: number,
    to: number,
    alpha: number,
    duration: number,
    ease = 'Linear',
    delay = 0,
  ): void {
    const circle = pool.acquire().setPosition(x, y).setTint(color).setAlpha(0).setVisible(true);
    this.tweens.add({
      targets: circle,
      scale: { from: from / CIRCLE_RADIUS, to: to / CIRCLE_RADIUS },
      alpha: { from: alpha, to: 0 },
      delay,
      duration,
      ease,
      onComplete: () => {
        circle.setVisible(false);
        pool.release(circle);
      },
    });
  }

  /** Короткая вспышка эффекта: `draw` перерисовывает её, пока `k` идёт от 0 до 1. */
  private playFx(duration: number, draw: (g: Phaser.GameObjects.Graphics, k: number) => void): void {
    const g = this.canvases.acquire().setVisible(true);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      onUpdate: (tween) => {
        g.clear();
        draw(g, tween.getValue() ?? 0);
      },
      onComplete: () => {
        g.clear().setVisible(false);
        this.canvases.release(g);
      },
    });
  }

  /** Всплывающая награда над убитым врагом. */
  private showReward(x: number, y: number, gold: number, crystals: number): void {
    const label = this.rewards.acquire();
    const withCrystals = crystals > 0;
    // Смена цвета перерисовывает текст — делаем это, только когда цвет и правда другой.
    if (label.crystal !== withCrystals) {
      label.crystal = withCrystals;
      label.gold.setColor(withCrystals ? TEXT_COLORS.crystal : TEXT_COLORS.brass);
    }
    label.gold.setText(t('reward.gold', { gold }));
    label.icon.setVisible(withCrystals);
    label.count.setVisible(withCrystals);

    let width = label.gold.width;
    if (withCrystals) {
      const { rewardIconSize: size, rewardIconGap: gap } = SHOT_FEEL;
      label.icon.setX(width + gap + size / 2);
      label.count.setText(String(crystals)).setX(label.icon.x + size / 2 + gap / 2);
      width = label.count.x + label.count.width;
    }

    const top = y - SHOT_FEEL.rewardOffsetY - label.gold.height / 2;
    label.box.setPosition(x - width / 2, top).setAlpha(1).setVisible(true);
    this.tweens.add({
      targets: label.box,
      y: top - SHOT_FEEL.rewardRise,
      alpha: 0,
      duration: SHOT_FEEL.rewardMs,
      onComplete: () => {
        label.box.setVisible(false);
        this.rewards.release(label);
      },
    });
  }

  hudState(): HudState {
    return {
      gold: this.economy.gold,
      crystals: this.economy.crystals,
      summonCost: this.economy.summonCost,
      summonsLeft: this.economy.summonsLeft,
      summonLimit: this.economy.summonLimit,
      overLimitMult: this.economy.overLimitMult,
      canSummon: !this.finished && this.economy.canAffordSummon() && this.board.includes(null),
      lives: this.economy.lives,
      wave: this.waves.wave,
      totalWaves: this.level.waves,
      upcoming: this.waves.upcoming,
    };
  }

  /** Сколько котов и врагов на поле и сколько враги прошли в сумме; читает смоук-проверка (src/smoke.ts). */
  fieldCounts(): { cats: number; enemies: number; march: number } {
    return {
      cats: this.board.filter((cat) => cat !== null).length,
      enemies: this.combat.enemies.length,
      march: this.combat.enemies.reduce((sum, enemy) => sum + enemy.distance, 0),
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

  /** Объекты пулов живут до конца сцены: отработавший прячется и ждёт следующего раза. */
  private addPools(): void {
    const image = (texture: string, depth: number) => () => this.add.image(0, 0, texture).setDepth(depth);
    this.shots = new Pool(image(Texture.dot, DEPTH.projectile));
    this.discs = new Pool(image(Texture.disc, DEPTH.fx));
    this.rings = new Pool(image(Texture.ring, DEPTH.fx));
    this.canvases = new Pool(() => this.add.graphics().setDepth(DEPTH.fx));
    this.rewards = new Pool(() => {
      const gold = this.add.text(0, 0, '', { ...REWARD_STYLE, color: TEXT_COLORS.brass }).setOrigin(0, 0.5);
      const icon = addCrystalIcon(this, 0, 0, SHOT_FEEL.rewardIconSize);
      const count = this.add.text(0, 0, '', { ...REWARD_STYLE, color: TEXT_COLORS.crystal }).setOrigin(0, 0.5);
      const box = this.add.container(0, 0, [gold, icon, count]).setDepth(DEPTH.fx);
      return { box, gold, icon, count, crystal: false };
    });
  }

  private addParticles(): void {
    ensureTextures(this);
    this.puffs = this.add
      .particles(0, 0, Texture.dot, {
        emitting: false,
        lifespan: ENEMY_FEEL.puffMs,
        speed: { min: ENEMY_FEEL.puffSpeedMin, max: ENEMY_FEEL.puffSpeedMax },
        scale: { start: ENEMY_FEEL.puffScaleFrom, end: ENEMY_FEEL.puffScaleTo },
        alpha: { start: ENEMY_FEEL.puffAlpha, end: 0 },
        tint: COLORS.puff,
      })
      .setDepth(DEPTH.fx);
    this.sparks = this.add
      .particles(0, 0, Texture.dot, {
        emitting: false,
        lifespan: MERGE_FEEL.sparkMs,
        speed: { min: MERGE_FEEL.sparkSpeedMin, max: MERGE_FEEL.sparkSpeedMax },
        scale: { start: MERGE_FEEL.sparkScale, end: 0 },
      })
      .setDepth(DEPTH.fx);
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
    this.actions.meteors++;

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
    audio.play('meteor');
  }

  summon(): void {
    if (this.finished || !this.economy.canAffordSummon()) return;
    const result = this.summoner.summon(this.board, this.economy.summonCost);
    if (!result) return;

    this.economy.paySummon();
    this.actions.summons++;
    this.placeCat(result.slot, result.cat).playSpawn();
    audio.play('summon');

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

    this.drag = { pointerId: pointer.id, slot, view, hover: null, overTrash: false };
    view.lift();
    this.trash.setAlpha(TRASH_FEEL.activeAlpha);

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
    const overTrash = this.overTrash(pointer);
    if (hover !== this.drag.hover || overTrash !== this.drag.overTrash) {
      this.drag.hover = hover;
      this.drag.overTrash = overTrash;
      this.scaleTrash(overTrash);
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
    this.restTrash();

    if (this.overTrash(pointer)) {
      this.sell(from, view);
      return;
    }

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
        if (result.crystalCost > 0) this.actions.hybrids++;
        else this.actions.merges++;
        this.board[to] = result.cat;
        this.board[from] = null;
        const merged = new CatView(this, x, y, result.cat);
        merged.playSpawn(MERGE_FEEL.absorbMs);
        this.views[to] = merged;
        this.views[from] = null;
        audio.play('merge');

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
    this.restTrash();
  }

  /** Продаёт кота из клетки: он улетает в корзину, монеты — в счётчик. */
  private sell(slot: number, view: CatView): void {
    const cat = this.board[slot];
    if (!cat) return;
    const [x, y] = this.level.trash;
    const gold = this.economy.sell(cat.invested);
    this.board[slot] = null;
    this.views[slot] = null;
    view.absorb(x, y);
    this.actions.sales++;
    audio.play('coins');
    if (gold > 0) {
      this.showReward(x, y, gold, 0);
      this.events.emit(GameEvent.Reward, { x, y, gold, crystals: 0 });
    }
    this.events.emit(GameEvent.Changed);
  }

  /** Указатель над корзиной. */
  private overTrash(pointer: Phaser.Input.Pointer): boolean {
    const { x, y } = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const [trashX, trashY] = this.level.trash;
    const half = TRASH.size / 2;
    return Math.abs(x - trashX) <= half && Math.abs(y - trashY) <= half;
  }

  private scaleTrash(hover: boolean): void {
    this.tweens.killTweensOf(this.trash);
    this.tweens.add({
      targets: this.trash,
      scale: (hover ? TRASH_FEEL.hoverScale : 1) * this.trashScale,
      duration: TRASH_FEEL.tweenMs,
      ease: TRASH_FEEL.ease,
    });
  }

  /** Корзина без кота в руке: обычного размера и тусклая. */
  private restTrash(): void {
    this.scaleTrash(false);
    this.trash.setAlpha(TRASH_FEEL.idleAlpha);
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
    if (this.drag.overTrash) this.showSellHint(this.economy.sellValue(dragged.invested));

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
    const cost = check.kind === 'merge' ? check.crystalCost : 0;
    const color = check.kind === 'merge' ? cats.elements[check.cat.element].color : TEXT_COLORS.danger;
    const { padX, padY, iconSize, iconGap } = HINT_FEEL;

    this.hintLabel.setText(this.hintText(check)).setColor(color);
    this.hintIcon.setVisible(cost > 0);
    this.hintCost.setVisible(cost > 0).setText(String(cost)).setColor(color);

    // Раскладка слева направо: текст, значок кристалла, цена; всё вместе — по центру над клеткой.
    const iconX = this.hintLabel.width + iconGap + iconSize / 2;
    const costX = iconX + iconSize / 2 + iconGap / 2;
    const width = cost > 0 ? costX + this.hintCost.width : this.hintLabel.width;
    const height = this.hintLabel.height + padY * 2;
    const left = -width / 2;
    this.hintBg.setSize(width + padX * 2, height);
    this.hintLabel.setPosition(left, -height / 2);
    this.hintIcon.setPosition(left + iconX, -height / 2);
    this.hintCost.setPosition(left + costX, -height / 2);
    this.hint.setPosition(x + levels.slotSize / 2, y - HINT_FEEL.offsetY).setVisible(true);
  }

  /** Над корзиной: сколько монет вернёт продажа. У края поля подпись сдвигается, чтобы не обрезаться. */
  private showSellHint(gold: number): void {
    const [x, y] = this.level.trash;
    const { padX, padY, offsetY } = HINT_FEEL;
    this.hintLabel.setText(t('sell.hint', { gold })).setColor(TEXT_COLORS.brass);
    this.hintIcon.setVisible(false);
    this.hintCost.setVisible(false);

    const width = this.hintLabel.width;
    const height = this.hintLabel.height + padY * 2;
    const half = width / 2 + padX;
    this.hintBg.setSize(width + padX * 2, height);
    this.hintLabel.setPosition(-width / 2, -height / 2);
    this.hint.setPosition(Phaser.Math.Clamp(x, half, BOARD_W - half), y - TRASH.size / 2 - offsetY).setVisible(true);
  }

  private hintText(check: Exclude<MergeCheck, { kind: 'none' }>): string {
    if (check.kind === 'blocked') return this.blockText(check.reason);

    const { element, level } = check.cat;
    // Ещё не открытый гибрид остаётся загадкой до конца ритуала.
    const known = !this.merger.isHybrid(element) || progress.hasCat(element);
    const text = known ? t('merge.preview', { name: t(`cat.${element}`), level }) : t('merge.previewUnknown');
    return check.crystalCost > 0 ? t('merge.withCost', { text }) : text;
  }

  private blockText(reason: MergeBlock): string {
    return t(BLOCK_TEXT[reason], { level: this.level.maxCatLevel });
  }

  /** Запоминает гибрида, полученного впервые, и сообщает об этом HUD. */
  private discover(element: ElementId): void {
    if (!this.merger.isHybrid(element) || !progress.discover(element)) return;
    this.events.emit(GameEvent.Discovered, element);
  }

  /** Расходящееся кольцо и искры цвета стихии: после слияния (с задержкой, пока коты стягиваются) и в конце ритуала. */
  private playRing(x: number, y: number, color: number, delay = 0): void {
    this.time.delayedCall(delay, () => {
      this.sparks.setParticleTint(color);
      this.sparks.emitParticleAt(x, y, MERGE_FEEL.sparkCount);
    });

    const { ringFrom, ringTo, ringMs, ringEase } = MERGE_FEEL;
    this.playCircle(this.rings, x, y, color, ringFrom, ringTo, 1, ringMs, ringEase, delay);
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

/** Корзина: плашка и ведро с крышкой. Рисуется вокруг начала координат. */
function drawTrash(g: Phaser.GameObjects.Graphics): void {
  const half = TRASH.size / 2;
  g.fillStyle(COLORS.panel);
  g.fillRoundedRect(-half, -half, TRASH.size, TRASH.size, TRASH.radius);
  g.lineStyle(1.5, COLORS.line);
  g.strokeRoundedRect(-half + 1, -half + 1, TRASH.size - 2, TRASH.size - 2, TRASH.radius);

  g.fillStyle(COLORS.range);
  // Крышка с ручкой.
  g.fillRoundedRect(-12, -12, 24, 4, 2);
  g.fillRoundedRect(-4, -16, 8, 4, 2);
  // Ведро сужается книзу.
  g.fillPoints(
    [new Phaser.Math.Vector2(-10, -6), new Phaser.Math.Vector2(10, -6), new Phaser.Math.Vector2(8, 15), new Phaser.Math.Vector2(-8, 15)],
    true,
  );
  g.fillStyle(COLORS.panel);
  for (const x of [-4.5, 0, 4.5]) g.fillRoundedRect(x - 1, -2, 2, 13, 1);
}
