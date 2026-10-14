import Phaser from 'phaser';
import { addArtOrShape, art } from '../art';
import { elementColor, enemies, enemyColor, type EnemyTypeId } from '../data';
import { ENEMY_FEEL, MOTION_FEEL, STATUS_FEEL } from '../feel';
import { COLORS, DEPTH, FONTS, TEXT_COLORS } from '../layout';
import { addBakedShape, ensureTextures, Texture } from '../scenes/textures';
import { artId } from '../systems/Art';
import type { Enemy } from './Enemy';
import { addShadow, burrow, death, heal, hit, hover, spawn, stopAll, waddle } from './motion';

/** Прямоугольник вокруг центра врага, в который помещается всё нарисованное `drawEnemyBody`: ширина и высота. */
export function enemyBodySize(type: EnemyTypeId): [number, number] {
  const r = enemies.types[type].radius;
  // Хвост уходит назад на 2,2 радиуса, уши — в стороны на 1,1; крылья, посох и концы повязки торчат дальше.
  const tall = type === 'bat' ? 5 : type === 'shaman' || type === 'ninja' || type === 'fire' ? 3.4 : 2.6;
  return [r * 4.8, r * tall];
}

/** Щит перед носом врага: вытянутая пластина с центром в `x`. */
function drawShieldPlate(g: Phaser.GameObjects.Graphics, x: number, r: number): void {
  g.fillStyle(COLORS.shield);
  g.fillEllipse(x, 0, r * 0.7, r * 1.8);
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

/** Тело врага носом вправо: готовый арт, а пока его нет — рисунок кодом, запечённый в текстуру. Щит в картинку не входит. */
function addEnemyBody(scene: Phaser.Scene, type: EnemyTypeId): Phaser.GameObjects.Image {
  const [width, height] = enemyBodySize(type);
  return addArtOrShape(scene, artId.enemy(type), `enemy-${type}`, width, height, (g) => drawEnemyBody(g, type));
}

/**
 * Портрет врага для бестиария и карточек: та же картинка, что на поле, вписанная в квадрат `size`.
 * Неизвестный враг (`known = false`) — силуэт.
 */
export function addEnemyPortrait(
  scene: Phaser.Scene,
  type: EnemyTypeId,
  x: number,
  y: number,
  size: number,
  known = true,
): Phaser.GameObjects.Image {
  const [width, height] = enemyBodySize(type);
  const { radius: r, shield } = enemies.types[type];
  // У рисунка кодом щит на поле — отдельная картинка, которая пропадает, когда он сломан; на портрете он нарисован вместе с телом.
  // На готовой картинке щит уже есть.
  const ref = art.find(scene, artId.enemy(type));
  const image =
    shield > 0 && !ref
      ? addBakedShape(scene, `portrait-${type}`, width, height, (g) => {
          drawEnemyBody(g, type);
          drawShieldPlate(g, r * 1.3, r);
        })
      : addEnemyBody(scene, type);
  image.setPosition(x, y);
  const [shownW, shownH] = ref ? [ref.width, ref.height] : [width, height];
  image.setScale(image.scale * Math.min(size / shownW, size / shownH));
  return known ? image : image.setTintFill(COLORS.line);
}

/**
 * Вид врага: мышь сверху, носом по ходу движения, с полоской здоровья и тенью.
 * Тело, щит и метки эффектов — картинки из арта и запечённых текстур: на поле десятки врагов, и рисовать каждого заново каждый кадр дорого.
 * Слои движения (`entities/motion.ts`), снаружи внутрь: походка (наклон и подскок или качание полёта) → реакция
 * (отскок и сжатие от попадания, появление, сплющивание при гибели) → поворот по ходу (уход под землю).
 */
export class EnemyView extends Phaser.GameObjects.Container {
  private readonly radius: number;
  /**
   * Где фигура относительно точки дороги: лапы, верх и середина по высоте, полуширина. Готовая картинка стоит анфас
   * лапами на земле (`upright`); рисунок кодом — мышь сверху вокруг точки дороги.
   */
  private readonly figure: { upright: boolean; feetY: number; top: number; centerY: number; half: number };
  /** Поворачивается по ходу движения (только рисунок кодом); полоска здоровья остаётся горизонтальной. */
  private readonly turning: Phaser.GameObjects.Container;
  private readonly gait: Phaser.GameObjects.Container;
  private readonly react: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Image;
  /** Бесконечные твины походки; замедленный враг шагает медленнее. */
  private readonly steps: Phaser.Tweens.Tween[];
  private shownPace = 1;
  /** Направление движения, радианы: попадание отбрасывает назад по нему. */
  private heading = 0;
  /** Белый силуэт поверх тела: вспыхивает при попадании. */
  private readonly flash: Phaser.GameObjects.Image;
  /** Тело врага: у картинки анфас отражается по горизонтали, когда враг идёт влево. */
  private readonly figureImage: Phaser.GameObjects.Image;
  private facingLeft = false;
  /** Зелёный огонёк на кристалле посоха; только у лекаря. */
  private healGlow: Phaser.GameObjects.Image | null = null;
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
  private readonly mound: Phaser.GameObjects.Container | null = null;
  private shownBurrowed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, enemy: Enemy) {
    super(scene, x, y);

    const r = enemies.types[enemy.type].radius;
    this.radius = r;
    ensureTextures(scene);

    const ref = art.find(scene, artId.enemy(enemy.type));
    const { feet, shieldBadge, shieldY } = ENEMY_FEEL.upright;
    // Слои движения вращаются и сжимаются вокруг лап: у картинки анфас они ниже точки дороги, у мыши сверху — в ней.
    // Фигура стоит в своей картинке по нижнему краю, сверху и с боков — прозрачное поле: её рост — по обрезанному кадру атласа.
    const frame = ref ? scene.textures.getFrame(ref.key, ref.frame) : null;
    const tall = ref && frame ? (ref.height * frame.height) / frame.realHeight : 0;
    const wide = ref && frame ? (ref.width * frame.width) / frame.realWidth : 0;
    this.figure = ref
      ? { upright: true, feetY: ref.height * feet, top: ref.height * feet - tall, centerY: ref.height * feet - tall / 2, half: wide / 2 }
      : { upright: false, feetY: 0, top: -r, centerY: 0, half: r };
    const { feetY } = this.figure;
    const bodyY = ref ? -ref.height / 2 : 0;
    const body = addEnemyBody(scene, enemy.type).setY(bodyY);
    this.figureImage = body;
    this.flash = addEnemyBody(scene, enemy.type).setY(bodyY).setTintFill(COLORS.flash).setAlpha(0);
    this.turning = scene.add.container(0, 0, [body, this.flash]);
    this.react = scene.add.container(0, 0, [this.turning]);
    this.gait = scene.add.container(0, feetY, [this.react]);
    const config = enemies.types[enemy.type];
    const shadow = MOTION_FEEL.shadow.enemy;
    // Летучая мышь в воздухе: тень меньше и ниже.
    const flying = config.motion === 'hover' ? MOTION_FEEL.shadow.flying : { scale: 1, gap: 0 };
    this.shadow = ref
      ? addShadow(scene, 0, feetY + flying.gap, ref.width * shadow.artWidth * flying.scale, ref.height * shadow.artHeight * flying.scale)
      : addShadow(scene, 0, r * shadow.y + flying.gap, r * shadow.width * flying.scale, r * shadow.height * flying.scale);
    this.steps = [
      config.motion === 'hover'
        ? hover(scene, this.gait)
        : waddle(scene, this.gait, config.speed, config.motion === 'heavy' ? MOTION_FEEL.heavy : MOTION_FEEL.waddle),
    ];
    if (config.heal) {
      // Огонёк лечения — на кристалле посоха: на картинке — точка из манифеста, у рисунка кодом — навершие посоха.
      const anchor = ref ? art.anchor(artId.enemy(enemy.type), 'crystal') : null;
      const [gx, gy] = ref && anchor ? [(anchor[0] - 0.5) * ref.width, (anchor[1] - 1) * ref.height] : [r * 1.5, r * 1.2];
      this.healGlow = scene.add.image(gx, gy, Texture.disc).setTint(COLORS.hp).setVisible(false);
      (ref ? this.react : this.turning).add(this.healGlow);
    }
    spawn(scene, this.react);

    if (enemies.types[enemy.type].burrow) {
      const mound = addBakedShape(scene, `mound-${enemy.type}`, r * 3.2, r * 2.4, (g) => {
        g.fillStyle(COLORS.moundDark);
        g.fillEllipse(0, 0, r * 3, r * 2.2);
        g.fillStyle(COLORS.mound);
        g.fillEllipse(-r * 0.1, -r * 0.1, r * 2.3, r * 1.6);
        g.fillStyle(COLORS.moundDark);
        g.fillCircle(-r * 0.5, -r * 0.2, r * 0.18);
        g.fillCircle(r * 0.4, r * 0.25, r * 0.22);
        g.fillCircle(r * 0.2, -r * 0.4, r * 0.14);
      });
      // В контейнере: подкоп меняет масштаб холмика от 0 до 1, а у запечённой картинки свой масштаб.
      this.mound = scene.add.container(0, feetY, [mound]).setVisible(false);
    }

    if (enemy.shield > 0) {
      // Сколько попаданий щит ещё выдержит. На готовой картинке щит уже нарисован — поверх него только кружок со счётом.
      const plate = ref
        ? scene.add.image(0, 0, Texture.dot).setDisplaySize(shieldBadge, shieldBadge).setTint(COLORS.shield)
        : addBakedShape(scene, `shield-${enemy.type}`, r, r * 2, (g) => drawShieldPlate(g, 0, r));
      this.shieldCount = scene.add
        .text(0, 0, '', { fontFamily: FONTS.body, fontSize: '9px', color: TEXT_COLORS.dark })
        .setOrigin(0.5);
      this.shield = ref
        ? scene.add.container(0, -ref.height * shieldY, [plate, this.shieldCount])
        : scene.add.container(r * 1.3, 0, [plate, this.shieldCount]);
      (ref ? this.react : this.turning).add(this.shield);
    }

    this.bar = scene.add.graphics();
    this.add(this.mound ? [this.shadow, this.mound, this.gait, this.bar] : [this.shadow, this.gait, this.bar]);
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
    // Картинка анфас смотрит на зрителя и по ходу не поворачивается.
    if (!this.figure.upright) this.turning.setRotation(angle);
    else this.face(angle);
    this.heading = angle;
    if (burrowed !== this.shownBurrowed) {
      this.shownBurrowed = burrowed;
      burrow(this.scene, this.turning, this.mound, this.shadow, burrowed);
      this.bar.setVisible(!burrowed);
    }
    const pace = enemy.slowTime > 0 ? enemy.slowFactor : 1;
    if (pace !== this.shownPace) {
      this.shownPace = pace;
      for (const step of this.steps) step.timeScale = pace;
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
    const top = this.figure.top - ENEMY_FEEL.hpBarGap - ENEMY_FEEL.hpBarHeight;
    this.bar.clear();
    this.bar.fillStyle(COLORS.hpBack, ENEMY_FEEL.hpBackAlpha);
    this.bar.fillRect(-width / 2, top, width, ENEMY_FEEL.hpBarHeight);
    this.bar.fillStyle(COLORS.hp);
    this.bar.fillRect(-width / 2, top, width * Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1), ENEMY_FEEL.hpBarHeight);
  }

  /**
   * Картинка анфас смотрит на зрителя и не поворачивается, а идя влево — отражается. На подъёме и спуске (путь почти
   * вертикален) сохраняет прежнее направление: иначе дрожала бы на каждом изгибе.
   */
  private face(angle: number): void {
    const dx = Math.cos(angle);
    const left = dx < -ENEMY_FEEL.upright.turnBelow ? true : dx > ENEMY_FEEL.upright.turnBelow ? false : this.facingLeft;
    if (left === this.facingLeft) return;
    this.facingLeft = left;
    this.figureImage.setFlipX(left);
    this.flash.setFlipX(left);
    if (this.healGlow) this.healGlow.setX(-this.healGlow.x);
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

    const { top, centerY, half } = this.figure;
    const r = Math.max(this.radius, half * 0.8);
    if (slowed) {
      this.slowRing ??= this.addMark(Texture.ring, 0, centerY, (r + STATUS_FEEL.ringGap) * 2);
      this.slowRing.setTint(elementColor(frozen ? 'ice' : 'water'));
    }
    this.slowRing?.setVisible(slowed);
    if (burning) this.burnDot ??= this.addMark(Texture.dot, -r * 0.6, top, STATUS_FEEL.dotRadius * 2).setTint(elementColor('fire'));
    this.burnDot?.setVisible(burning);
    if (poisoned) this.poisonDot ??= this.addMark(Texture.dot, r * 0.6, top, STATUS_FEEL.dotRadius * 2).setTint(elementColor('swamp'));
    this.poisonDot?.setVisible(poisoned);
  }

  /** Метка эффекта диаметром `size`; ложится под полоску здоровья. */
  private addMark(texture: string, x: number, y: number, size: number): Phaser.GameObjects.Image {
    const mark = this.scene.add.image(x, y, texture).setDisplaySize(size, size);
    this.addAt(mark, this.getIndex(this.bar));
    return mark;
  }

  /** Попадание прошло: враг на миг белеет, сжимается и отскакивает назад. */
  playHit(): void {
    hit(this.scene, this.react, this.flash, this.heading);
  }

  /** Лекарь вылечил соседей: на кристалле посоха вспыхивает зелёный огонёк. */
  playHeal(): void {
    if (this.healGlow) heal(this.scene, this.healGlow);
  }

  /** Щит принял попадание. */
  playBlock(): void {
    if (this.shield) this.pulse(this.shield, ENEMY_FEEL.blockScale, ENEMY_FEEL.blockMs);
  }

  /** Враг убит: сплющивается, гаснет и удаляется; облачко пускает сцена. */
  playDeath(): void {
    this.bar.setVisible(false);
    this.mound?.setVisible(false);
    this.slowRing?.setVisible(false);
    this.burnDot?.setVisible(false);
    this.poisonDot?.setVisible(false);
    this.shadow.setVisible(false);
    this.scene.tweens.killTweensOf(this.flash);
    death(this.scene, this.react, this, () => this.destroy());
  }

  override destroy(fromScene?: boolean): void {
    for (const step of this.steps) step.stop();
    stopAll(this.scene, [this, this.gait, this.react, this.turning, this.flash, ...(this.mound ? [this.mound] : []), ...(this.shield ? [this.shield] : []), ...(this.healGlow ? [this.healGlow] : [])]);
    super.destroy(fromScene);
  }

  private pulse(target: Phaser.GameObjects.Container, scale: number, duration: number): void {
    this.scene.tweens.killTweensOf(target);
    target.setScale(scale);
    this.scene.tweens.add({ targets: target, scale: 1, duration });
  }
}
