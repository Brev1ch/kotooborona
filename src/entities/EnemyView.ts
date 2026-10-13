import Phaser from 'phaser';
import { elementColor, enemies, enemyColor, type EnemyTypeId } from '../data';
import { ENEMY_FEEL, STATUS_FEEL } from '../feel';
import { COLORS, DEPTH, FONTS, TEXT_COLORS } from '../layout';
import { addBakedShape, ensureTextures, Texture } from '../scenes/textures';
import type { Enemy } from './Enemy';

/** Прямоугольник вокруг центра врага, в который помещается всё нарисованное `drawEnemyBody`: ширина и высота. */
export function enemyBodySize(type: EnemyTypeId): [number, number] {
  const r = enemies.types[type].radius;
  // Хвост уходит назад на 2,2 радиуса, уши — в стороны на 1,1; крылья, посох и концы повязки торчат дальше.
  const tall = type === 'bat' ? 5 : type === 'shaman' || type === 'ninja' || type === 'fire' ? 3.4 : 2.6;
  return [r * 4.8, r * tall];
}

function fillShape(g: Phaser.GameObjects.Graphics, points: [number, number][]): void {
  g.fillPoints(points.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
}

/**
 * Тело мыши вокруг начала координат, носом вправо. Им же рисуются портреты в сценках и бестиарии.
 * У каждого врага с особенностью — свой признак, заметный с первого взгляда.
 */
export function drawEnemyBody(g: Phaser.GameObjects.Graphics, type: EnemyTypeId): void {
  const r = enemies.types[type].radius;
  const color = enemyColor(type);
  if (type === 'bat') {
    // Перепончатые крылья в стороны вместо хвоста.
    g.fillStyle(COLORS.wing);
    for (const side of [-1, 1]) {
      fillShape(g, [
        [r * 0.6, side * r * 0.2],
        [r * 0.35, side * r * 2.35],
        [-r * 0.2, side * r * 1.65],
        [-r * 0.55, side * r * 2.15],
        [-r * 0.85, side * r * 1.45],
        [-r * 1.25, side * r * 1.75],
        [-r * 0.9, side * r * 0.2],
      ]);
    }
  } else {
    g.lineStyle(2, color);
    g.lineBetween(-r, 0, -r * 1.6, r * 0.35);
    g.lineBetween(-r * 1.6, r * 0.35, -r * 2.2, 0);
  }
  if (type === 'boots') {
    // Четыре железных сапога по бокам, с блестящими носами.
    for (const [x, side] of [[r * 0.5, -1], [r * 0.5, 1], [-r * 0.6, -1], [-r * 0.6, 1]]) {
      g.fillStyle(COLORS.iron);
      g.fillRect(x - r * 0.4, side * r * 0.98 - r * 0.3, r * 0.8, r * 0.6);
      g.fillStyle(COLORS.ironLight);
      g.fillRect(x + r * 0.12, side * r * 0.98 - r * 0.3, r * 0.28, r * 0.6);
    }
  }
  if (type === 'shaman') {
    // Посох вдоль бока со светящимся навершием впереди.
    g.lineStyle(2.5, COLORS.staff);
    g.lineBetween(-r * 1.1, r * 1.2, r * 1.4, r * 1.2);
    g.fillStyle(COLORS.staffOrb);
    g.fillCircle(r * 1.5, r * 1.2, r * 0.42);
    g.fillStyle(COLORS.flash);
    g.fillCircle(r * 1.42, r * 1.12, r * 0.14);
  }
  if (type === 'ninja') {
    // Концы повязки развеваются за головой.
    g.fillStyle(COLORS.headband);
    g.fillTriangle(r * 0.3, r * 0.6, -r * 0.9, r * 1.1, -r * 0.6, r * 1.55);
    g.fillTriangle(r * 0.3, r * 0.6, -r * 1.2, r * 0.75, -r * 0.9, r * 1.1);
  }
  g.fillStyle(color);
  g.fillEllipse(0, 0, r * 2.3, r * 1.7);
  g.fillCircle(r * 0.3, -r * 0.7, r * 0.4);
  g.fillCircle(r * 0.3, r * 0.7, r * 0.4);
  g.fillStyle(COLORS.enemyNose);
  g.fillCircle(r * 1.15, 0, r * (type === 'mole' ? 0.3 : 0.18));
  if (type === 'fire') {
    // Ведро воды сбоку и красная каска с жёлтым гребнем.
    g.fillStyle(COLORS.bucket);
    g.fillCircle(-r * 0.7, r * 1.05, r * 0.52);
    g.fillStyle(COLORS.bucketWater);
    g.fillCircle(-r * 0.7, r * 1.05, r * 0.34);
    g.fillStyle(COLORS.helmet);
    g.fillCircle(r * 0.4, 0, r * 0.68);
    g.fillStyle(COLORS.helmetCrest);
    g.fillRect(-r * 0.25, -r * 0.13, r * 1.3, r * 0.26);
  }
  if (type === 'shaman') {
    // Три пера на затылке.
    g.fillStyle(COLORS.feather);
    g.fillTriangle(r * 0.1, -r * 0.35, r * 0.1, -r * 0.05, -r * 0.95, -r * 0.5);
    g.fillTriangle(r * 0.1, -r * 0.15, r * 0.1, r * 0.15, -r * 1.05, 0);
    g.fillTriangle(r * 0.1, r * 0.05, r * 0.1, r * 0.35, -r * 0.95, r * 0.5);
    g.fillStyle(COLORS.staffOrb);
    g.fillCircle(r * 0.15, 0, r * 0.2);
  }
  if (type === 'ninja') {
    g.fillStyle(COLORS.headband);
    g.fillRect(r * 0.3, -r * 0.82, r * 0.34, r * 1.64);
  }
  if (type === 'mole') {
    // Большие лапы с когтями впереди.
    for (const side of [-1, 1]) {
      g.fillStyle(COLORS.claw);
      g.fillCircle(r * 0.75, side * r * 0.9, r * 0.3);
      for (const spread of [-0.22, 0, 0.22]) {
        const y = side * r * (0.9 + spread);
        g.fillTriangle(r * 0.85, y - r * 0.09, r * 0.85, y + r * 0.09, r * 1.45, y);
      }
    }
  }
  if (type === 'boss') {
    g.fillStyle(COLORS.brass);
    g.fillRect(-r * 0.3, -r * 0.35, r * 0.6, r * 0.7);
  }
  if (type === 'king') {
    // Корона, вид сверху: обруч с тремя зубцами в сторону носа и красный камень.
    g.fillStyle(COLORS.brass);
    g.fillRect(-r * 0.45, -r * 0.5, r * 0.4, r);
    g.fillTriangle(-r * 0.05, -r * 0.5, -r * 0.05, -r * 0.18, r * 0.4, -r * 0.34);
    g.fillTriangle(-r * 0.05, -r * 0.16, -r * 0.05, r * 0.16, r * 0.45, 0);
    g.fillTriangle(-r * 0.05, r * 0.18, -r * 0.05, r * 0.5, r * 0.4, r * 0.34);
    g.fillStyle(COLORS.danger);
    g.fillCircle(-r * 0.25, 0, r * 0.13);
  }
}

/**
 * Временный вид врага: мышь сверху, носом по ходу движения, с полоской здоровья.
 * Тело, щит и метки эффектов — картинки из запечённых текстур: на поле десятки врагов, и рисовать каждого заново каждый кадр дорого.
 */
export class EnemyView extends Phaser.GameObjects.Container {
  private readonly radius: number;
  /** Поворачивается по ходу движения; полоска здоровья остаётся горизонтальной. */
  private readonly turning: Phaser.GameObjects.Container;
  /** Белый силуэт поверх тела: вспыхивает при попадании. */
  private readonly flash: Phaser.GameObjects.Image;
  /** Щит и число на нём; только у врага, который пришёл со щитом. */
  private readonly shield: Phaser.GameObjects.Container | null = null;
  private readonly shieldCount: Phaser.GameObjects.Text | null = null;
  private readonly bar: Phaser.GameObjects.Graphics;
  /** Кольцо замедления и точки огня и яда; создаются, когда эффект впервые наложен. */
  private slowRing: Phaser.GameObjects.Image | null = null;
  private burnDot: Phaser.GameObjects.Image | null = null;
  private poisonDot: Phaser.GameObjects.Image | null = null;
  private shownHp = -1;
  private shownShield = -1;
  private shownStatus = '';
  /** Холмик на месте врага, ушедшего под землю; только у тех, кто умеет копать. */
  private readonly mound: Phaser.GameObjects.Image | null = null;
  private shownBurrowed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, enemy: Enemy) {
    super(scene, x, y);

    const r = enemies.types[enemy.type].radius;
    this.radius = r;
    ensureTextures(scene);

    const key = `enemy-${enemy.type}`;
    const [width, height] = enemyBodySize(enemy.type);
    const draw = (g: Phaser.GameObjects.Graphics): void => drawEnemyBody(g, enemy.type);
    const body = addBakedShape(scene, key, width, height, draw);
    this.flash = addBakedShape(scene, key, width, height, draw).setTintFill(COLORS.flash).setAlpha(0);
    this.turning = scene.add.container(0, 0, [body, this.flash]);

    if (enemies.types[enemy.type].burrow) {
      this.mound = addBakedShape(scene, `mound-${enemy.type}`, r * 3.2, r * 2.4, (g) => {
        g.fillStyle(COLORS.moundDark);
        g.fillEllipse(0, 0, r * 3, r * 2.2);
        g.fillStyle(COLORS.mound);
        g.fillEllipse(-r * 0.1, -r * 0.1, r * 2.3, r * 1.6);
        g.fillStyle(COLORS.moundDark);
        g.fillCircle(-r * 0.5, -r * 0.2, r * 0.18);
        g.fillCircle(r * 0.4, r * 0.25, r * 0.22);
        g.fillCircle(r * 0.2, -r * 0.4, r * 0.14);
      }).setVisible(false);
    }

    if (enemy.shield > 0) {
      const plate = addBakedShape(scene, `shield-${enemy.type}`, r, r * 2, (g) => {
        g.fillStyle(COLORS.shield);
        g.fillEllipse(0, 0, r * 0.7, r * 1.8);
      });
      // Сколько попаданий щит ещё выдержит.
      this.shieldCount = scene.add
        .text(0, 0, '', { fontFamily: FONTS.body, fontSize: '9px', color: TEXT_COLORS.dark })
        .setOrigin(0.5);
      this.shield = scene.add.container(r * 1.3, 0, [plate, this.shieldCount]);
      this.turning.add(this.shield);
    }

    this.bar = scene.add.graphics();
    this.add(this.mound ? [this.mound, this.turning, this.bar] : [this.turning, this.bar]);
    this.setDepth(DEPTH.enemy);
    scene.add.existing(this);

    this.sync(enemy, x, y, 0);
  }

  /**
   * Ставит врага в точку дороги и обновляет щит и полоску здоровья. `angle` — направление движения в радианах.
   * Под землёй (`burrowed`) от врага виден только ползущий холмик.
   */
  sync(enemy: Enemy, x: number, y: number, angle: number, burrowed = false): void {
    this.setPosition(x, y);
    this.turning.setRotation(angle);
    if (burrowed !== this.shownBurrowed) {
      this.shownBurrowed = burrowed;
      this.turning.setVisible(!burrowed);
      this.bar.setVisible(!burrowed);
      this.mound?.setVisible(burrowed);
    }
    if (enemy.shield !== this.shownShield) {
      this.shownShield = enemy.shield;
      this.shield?.setVisible(enemy.shield > 0);
      this.shieldCount?.setText(String(enemy.shield));
    }
    this.syncStatus(enemy);

    if (enemy.hp === this.shownHp) return;
    this.shownHp = enemy.hp;
    const width = this.radius * 2.4;
    const top = -this.radius - ENEMY_FEEL.hpBarGap - ENEMY_FEEL.hpBarHeight;
    this.bar.clear();
    this.bar.fillStyle(COLORS.hpBack, ENEMY_FEEL.hpBackAlpha);
    this.bar.fillRect(-width / 2, top, width, ENEMY_FEEL.hpBarHeight);
    this.bar.fillStyle(COLORS.hp);
    this.bar.fillRect(-width / 2, top, width * Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1), ENEMY_FEEL.hpBarHeight);
  }

  /** Кольцо замедления или заморозки, точки огня и яда над врагом. */
  private syncStatus(enemy: Enemy): void {
    // Под землёй меток не видно.
    const shown = !this.shownBurrowed;
    const slowed = shown && enemy.slowTime > 0;
    const frozen = slowed && enemy.slowFactor < STATUS_FEEL.frozenBelow;
    const burning = shown && enemy.burnTime > 0;
    const poisoned = shown && enemy.poisonTime > 0;
    const status = `${slowed}${frozen}${burning}${poisoned}`;
    if (status === this.shownStatus) return;
    this.shownStatus = status;

    const r = this.radius;
    if (slowed) {
      this.slowRing ??= this.addMark(Texture.ring, 0, 0, (r + STATUS_FEEL.ringGap) * 2);
      this.slowRing.setTint(elementColor(frozen ? 'ice' : 'water'));
    }
    this.slowRing?.setVisible(slowed);
    if (burning) this.burnDot ??= this.addMark(Texture.dot, -r * 0.6, -r, STATUS_FEEL.dotRadius * 2).setTint(elementColor('fire'));
    this.burnDot?.setVisible(burning);
    if (poisoned) this.poisonDot ??= this.addMark(Texture.dot, r * 0.6, -r, STATUS_FEEL.dotRadius * 2).setTint(elementColor('swamp'));
    this.poisonDot?.setVisible(poisoned);
  }

  /** Метка эффекта диаметром `size`; ложится под полоску здоровья. */
  private addMark(texture: string, x: number, y: number, size: number): Phaser.GameObjects.Image {
    const mark = this.scene.add.image(x, y, texture).setDisplaySize(size, size);
    this.addAt(mark, this.getIndex(this.bar));
    return mark;
  }

  /** Попадание прошло: враг вздрагивает и на миг белеет. */
  playHit(): void {
    this.pulse(this.turning, ENEMY_FEEL.hitScale, ENEMY_FEEL.hitMs);
    this.scene.tweens.killTweensOf(this.flash);
    this.flash.setAlpha(ENEMY_FEEL.flashAlpha);
    this.scene.tweens.add({ targets: this.flash, alpha: 0, duration: ENEMY_FEEL.flashMs });
  }

  /** Щит принял попадание. */
  playBlock(): void {
    if (this.shield) this.pulse(this.shield, ENEMY_FEEL.blockScale, ENEMY_FEEL.blockMs);
  }

  /** Враг убит: сжимается, гаснет и удаляется. */
  playDeath(): void {
    this.bar.setVisible(false);
    this.mound?.setVisible(false);
    this.slowRing?.setVisible(false);
    this.burnDot?.setVisible(false);
    this.poisonDot?.setVisible(false);
    this.scene.tweens.killTweensOf([this.turning, this.flash]);
    this.scene.tweens.add({
      targets: this,
      scale: ENEMY_FEEL.deathScale,
      alpha: 0,
      duration: ENEMY_FEEL.deathMs,
      onComplete: () => this.destroy(),
    });
  }

  private pulse(target: Phaser.GameObjects.Container, scale: number, duration: number): void {
    this.scene.tweens.killTweensOf(target);
    target.setScale(scale);
    this.scene.tweens.add({ targets: target, scale: 1, duration });
  }
}
