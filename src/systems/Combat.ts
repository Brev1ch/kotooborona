import type { CatsConfig, ElementId, EnemiesConfig, Point, StatusId } from '../data/types';
import { isCat, type Piece } from '../entities/Building';
import type { Cat } from '../entities/Cat';
import type { Enemy } from '../entities/Enemy';
import type { Projectile } from '../entities/Projectile';
import { positionAt, type Path } from './Path';

export function catRange(config: CatsConfig, cat: Cat): number {
  return config.baseRange + config.rangePerLevel * cat.level;
}

/**
 * Урон одной атаки. `bonus` — прибавки от снаряжения по стихиям: прибавка стихии действует на её котов
 * и на гибридов, в которых она есть.
 */
export function catDamage(config: CatsConfig, cat: Cat, bonus: Partial<Record<ElementId, number>> = {}): number {
  const element = config.elements[cat.element];
  const hybrid = element.from ? config.hybridDamageMult : 1;
  const extra = [cat.element, ...(element.from ?? [])].reduce((sum, id) => sum + (bonus[id] ?? 0), 0);
  return config.baseDamage * Math.pow(config.levelDamageMult, cat.level - 1) * element.dmg * hybrid * (1 + extra);
}

/** Атак в секунду. */
export function catRate(config: CatsConfig, cat: Cat): number {
  return (config.baseRate + config.ratePerLevel * cat.level) * config.elements[cat.element].rate;
}

/** Враг сейчас под землёй: идёт по участку подкопа. */
export function isBurrowed(enemies: EnemiesConfig, enemy: Enemy, pathLength: number): boolean {
  const burrow = enemies.types[enemy.type].burrow;
  if (!burrow) return false;
  const progress = enemy.distance / pathLength;
  return progress >= burrow.from && progress < burrow.to;
}

export interface CombatSetup {
  cats: CatsConfig;
  enemies: EnemiesConfig;
  path: Path;
  /** Центры клеток, индексы совпадают с полем. */
  slots: readonly Point[];
  /** Размер игрового поля: врагов за его краем коты не видят. */
  bounds: { width: number; height: number };
  /** Возвращает число в [0, 1); подменяется в тестах. */
  rng?: () => number;
  /** Прибавки к урону котов по стихиям от снаряжения. */
  damageBonus?: Partial<Record<ElementId, number>>;
}

/** Взрыв по площади, не привязанный к коту: умение героя. */
export interface Blast {
  radius: number;
  damage: number;
  /** Урон от огня в секунду для всех задетых. */
  burnDps: number;
  burnTime: number;
  /** Горящая зона на месте удара: `time` секунд поджигает всех, кто в ней, с силой `burnDps` в секунду. */
  ground?: { burnDps: number; time: number };
}

/** Горящая зона после метеора. */
export interface BurningGround {
  x: number;
  y: number;
  radius: number;
  burnDps: number;
  burnTime: number;
  /** Сколько секунд ей осталось гореть. */
  time: number;
}

/** Что произошло за шаг боя; сцена по этим событиям меняет экономику и картинку. */
export type CombatEvent =
  /** Враг дошёл до ворот и снят с поля. */
  | { kind: 'leaked'; enemy: Enemy; livesCost: number }
  | { kind: 'shot'; slot: number; projectile: Projectile }
  | { kind: 'hit'; enemy: Enemy; x: number; y: number; element: ElementId }
  /** Щит принял попадание на себя. */
  | { kind: 'blocked'; enemy: Enemy; x: number; y: number }
  /** Иммунитет: стихия не нанесла урона или её эффект не лёг. Не чаще раза на врага за шаг. */
  | { kind: 'immune'; enemy: Enemy; x: number; y: number }
  | { kind: 'killed'; enemy: Enemy; x: number; y: number; gold: number; crystals: number }
  /** Враг призвал подмогу: `enemy` уже на поле. */
  | { kind: 'spawned'; enemy: Enemy }
  /** Враг уклонился от снаряда. */
  | { kind: 'dodged'; enemy: Enemy; x: number; y: number }
  /** Лекарь подлечил соседей в радиусе. */
  | { kind: 'healed'; enemy: Enemy; x: number; y: number; radius: number }
  /** На месте удара метеора осталась горящая зона. */
  | { kind: 'ground'; x: number; y: number; radius: number; time: number }
  /** Облако или взрыв: задело всех в радиусе. */
  | { kind: 'splash'; x: number; y: number; radius: number; element: ElementId }
  /** Молния перескочила с врага на врага. */
  | { kind: 'chain'; from: Point; to: Point; element: ElementId }
  /** Кот ударил всех вокруг себя. */
  | { kind: 'aura'; slot: number; radius: number; element: ElementId };

/** Движение врагов, выбор целей, урон и эффекты стихий. */
export class Combat {
  private alive: Enemy[] = [];
  private flying: Projectile[] = [];
  private grounds: BurningGround[] = [];
  private readonly rng: () => number;
  /** События текущего шага. */
  private events: CombatEvent[] = [];

  constructor(private readonly setup: CombatSetup) {
    this.rng = setup.rng ?? Math.random;
  }

  /** Враги на поле в порядке появления. */
  get enemies(): readonly Enemy[] {
    return this.alive;
  }

  get projectiles(): readonly Projectile[] {
    return this.flying;
  }

  /** Горящие зоны, которые ещё не погасли. */
  get burningGrounds(): readonly BurningGround[] {
    return this.grounds;
  }

  add(enemy: Enemy): void {
    this.alive.push(enemy);
  }

  /** Продвигает бой на `dt` секунд. Кулдауны котов на поле `board` меняются на месте; строения не атакуют. */
  update(dt: number, board: readonly (Piece | null)[]): CombatEvent[] {
    this.events = [];
    this.moveEnemies(dt);
    board.forEach((piece, slot) => {
      if (isCat(piece)) this.attack(piece, slot, dt);
    });
    this.moveProjectiles(dt);
    this.alive = this.alive.filter((enemy) => enemy.hp > 0);
    return this.events;
  }

  /**
   * Взрыв в точке: урон мимо щита и сопротивлений и поджог всем, кто сейчас в радиусе, — летающим тоже, но не тем, кто под землёй.
   * Возвращает события так же, как update().
   */
  strike(x: number, y: number, { radius, damage, burnDps, burnTime, ground }: Blast): CombatEvent[] {
    this.events = [];
    if (ground) {
      this.grounds.push({ x, y, radius, burnDps: ground.burnDps, burnTime, time: ground.time });
      this.events.push({ kind: 'ground', x, y, radius, time: ground.time });
    }
    for (const enemy of this.near(x, y, radius)) {
      const [ex, ey] = positionAt(this.setup.path, enemy.distance);
      this.events.push({ kind: 'hit', enemy, x: ex, y: ey, element: 'fire' });
      this.damage(enemy, damage, ex, ey);
      this.burn(enemy, burnDps, burnTime);
    }
    this.alive = this.alive.filter((enemy) => enemy.hp > 0);
    return this.events;
  }

  /** Горящие зоны поджигают всех, кто в них стоит или вошёл; о невосприимчивых к огню молчат, чтобы не сыпать событиями каждый шаг. */
  private burnGrounds(dt: number): void {
    for (const ground of this.grounds) {
      for (const enemy of this.near(ground.x, ground.y, ground.radius)) {
        if (!this.setup.enemies.types[enemy.type].immune?.includes('burn')) this.burn(enemy, ground.burnDps, ground.burnTime);
      }
      ground.time -= dt;
    }
    this.grounds = this.grounds.filter((ground) => ground.time > 0);
  }

  private moveEnemies(dt: number): void {
    const { enemies, path } = this.setup;
    this.burnGrounds(dt);
    const summoned: Enemy[] = [];
    for (const enemy of this.alive) {
      const [x, y] = positionAt(path, enemy.distance);
      if (enemy.slowTime > 0) {
        enemy.slowTime -= dt;
        if (enemy.slowTime <= 0) enemy.slowFactor = 1;
      }
      // Огонь и яд жгут мимо щита.
      if (enemy.burnTime > 0) {
        enemy.burnTime -= dt;
        this.damage(enemy, enemy.burnDps * dt, x, y);
      }
      if (enemy.poisonTime > 0) {
        enemy.poisonTime -= dt;
        this.damage(enemy, enemy.poisonDps * dt, x, y);
        if (enemy.poisonTime <= 0) enemy.poisonDps = 0;
      }
      enemy.distance += enemy.speed * enemy.slowFactor * dt;
      this.heal(enemy, dt);

      // Подмога появляется позади призвавшего, и только пока он на поле: за его краем игрок её бы не увидел.
      const { summon } = enemy;
      if (summon && enemy.hp > 0 && this.visible(enemy)) {
        summon.timer -= dt;
        if (summon.timer <= 0) {
          summon.timer += summon.interval;
          for (let i = 1; i <= summon.count; i++) {
            summoned.push({ ...summon.minion, distance: Math.max(0, enemy.distance - i * summon.spread) });
          }
        }
      }
    }
    for (const enemy of summoned) {
      this.alive.push(enemy);
      this.events.push({ kind: 'spawned', enemy });
    }

    this.alive = this.alive.filter((enemy) => {
      if (enemy.hp <= 0) return false;
      if (enemy.distance < path.length) return true;
      this.events.push({ kind: 'leaked', enemy, livesCost: enemies.types[enemy.type].livesCost ?? 1 });
      return false;
    });
  }

  private attack(cat: Cat, slot: number, dt: number): void {
    // Во время ритуала кот не атакует и не перезаряжается.
    if (cat.ritual > 0) return;
    cat.cooldown = Math.max(0, cat.cooldown - dt);
    if (cat.cooldown > 0) return;

    const { cats, slots } = this.setup;
    const [x, y] = slots[slot];
    const range = catRange(cats, cat);

    if (cats.elements[cat.element].fx === 'aura') {
      const targets = this.near(x, y, range).filter((enemy) => this.visible(enemy) && this.reaches(cat.element, enemy));
      if (targets.length === 0) return;
      cat.cooldown = 1 / catRate(cats, cat);
      this.events.push({ kind: 'aura', slot, radius: range, element: cat.element });
      for (const enemy of targets) this.hurt(enemy, catDamage(cats, cat, this.setup.damageBonus), cat.element);
      return;
    }

    const target = this.pickTarget(x, y, range, cat.element);
    if (!target) return;

    cat.cooldown = 1 / catRate(cats, cat);
    const projectile: Projectile = { x, y, target, damage: catDamage(cats, cat, this.setup.damageBonus), element: cat.element };
    this.flying.push(projectile);
    this.events.push({ kind: 'shot', slot, projectile });
  }

  /** Враг в радиусе, прошедший по дороге дальше всех, из тех, кого стихия достаёт. */
  private pickTarget(x: number, y: number, range: number, element: ElementId): Enemy | null {
    let best: Enemy | null = null;
    for (const enemy of this.near(x, y, range)) {
      if (!this.visible(enemy) || !this.reaches(element, enemy)) continue;
      if (!best || enemy.distance > best.distance) best = enemy;
    }
    return best;
  }

  /** Живые враги на поверхности не дальше `radius` от точки, кроме `except`; в порядке появления. */
  private near(x: number, y: number, radius: number, except?: Enemy): Enemy[] {
    return this.alive.filter((enemy) => {
      if (enemy.hp <= 0 || enemy === except || this.burrowed(enemy)) return false;
      const [ex, ey] = positionAt(this.setup.path, enemy.distance);
      return Math.hypot(ex - x, ey - y) <= radius;
    });
  }

  private burrowed(enemy: Enemy): boolean {
    return isBurrowed(this.setup.enemies, enemy, this.setup.path.length);
  }

  /** Достаёт ли стихия врага: по летающим бьют только указанные у них. */
  private reaches(element: ElementId, enemy: Enemy): boolean {
    const flying = this.setup.enemies.types[enemy.type].flying;
    return !flying || flying.hitBy.includes(element);
  }

  /** Лекарь раз в `interval` секунд лечит соседей; себя и других лекарей — нет, иначе двое лечили бы друг друга без конца. */
  private heal(enemy: Enemy, dt: number): void {
    const { types } = this.setup.enemies;
    const heal = types[enemy.type].heal;
    if (!heal || enemy.hp <= 0) return;
    enemy.healTimer = (enemy.healTimer ?? heal.interval) - dt;
    if (enemy.healTimer > 0) return;
    enemy.healTimer += heal.interval;
    if (this.burrowed(enemy)) return;

    const [x, y] = positionAt(this.setup.path, enemy.distance);
    let healed = false;
    for (const other of this.near(x, y, heal.radius, enemy)) {
      if (types[other.type].heal || other.hp >= other.maxHp) continue;
      other.hp = Math.min(other.maxHp, other.hp + other.maxHp * heal.part);
      healed = true;
    }
    if (healed) this.events.push({ kind: 'healed', enemy, x, y, radius: heal.radius });
  }

  /** Враг уже вышел на поле и ещё не ушёл с него. */
  private visible(enemy: Enemy): boolean {
    const { path, bounds, cats } = this.setup;
    const margin = cats.targetMargin;
    const [x, y] = positionAt(path, enemy.distance);
    return x >= -margin && y >= -margin && x <= bounds.width + margin && y <= bounds.height + margin;
  }

  private moveProjectiles(dt: number): void {
    const { cats, enemies, path } = this.setup;
    const step = cats.projectileSpeed * dt;

    this.flying = this.flying.filter((projectile) => {
      const { target } = projectile;
      // Цель убита, ушла в ворота или под землю — снаряд пропадает.
      if (target.hp <= 0 || !this.alive.includes(target) || this.burrowed(target)) return false;

      const [tx, ty] = positionAt(path, target.distance);
      const dx = tx - projectile.x;
      const dy = ty - projectile.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= step + enemies.types[target.type].radius * cats.hitRadiusMult) {
        this.applyHit(projectile);
        return false;
      }
      projectile.x += (dx / distance) * step;
      projectile.y += (dy / distance) * step;
      return true;
    });
  }

  /** Попадание снаряда: прямой урон по цели и эффект стихии. Статусы ложатся и на прикрытого щитом. */
  private applyHit({ target, damage, element }: Projectile): void {
    const { cats, path } = this.setup;
    const fx = cats.elements[element].fx;
    const effect = cats.effects[fx];
    const [x, y] = positionAt(path, target.distance);

    // Уклонение: снаряд пролетает мимо целиком, без урона, эффекта и осколков.
    const dodgeEvery = this.setup.enemies.types[target.type].dodgeEvery;
    if (dodgeEvery) {
      target.shotsTaken = (target.shotsTaken ?? 0) + 1;
      if (target.shotsTaken % dodgeEvery === 0) {
        this.events.push({ kind: 'dodged', enemy: target, x, y });
        return;
      }
    }

    this.hurt(target, damage, element);
    // Огонь и яд слабеют вместе с уроном стихии.
    const dealt = damage * this.resist(target, element);

    switch (fx) {
      case 'burn':
        this.burn(target, dealt * effect.burnDps, effect.burnTime);
        break;

      case 'slow':
      case 'freeze':
        this.slow(target, fx, effect.slowFactor, effect.slowTime);
        break;

      case 'splash_slow':
        this.slow(target, 'slow', effect.slowFactor, effect.slowTime);
        for (const other of this.near(x, y, effect.splashRadius, target)) {
          if (!this.reaches(element, other)) continue;
          this.graze(other, damage * effect.splashDamage, element);
          this.slow(other, 'slow', effect.slowFactor, effect.slowTime);
        }
        this.events.push({ kind: 'splash', x, y, radius: effect.splashRadius, element });
        break;

      case 'splash_burn':
        this.burn(target, dealt * effect.burnDps, effect.burnTime);
        for (const other of this.near(x, y, effect.splashRadius, target)) {
          if (!this.reaches(element, other)) continue;
          this.graze(other, damage * effect.splashDamage, element);
          this.burn(other, damage * this.resist(other, element) * effect.splashBurnDps, effect.burnTime);
        }
        this.events.push({ kind: 'splash', x, y, radius: effect.splashRadius, element });
        break;

      case 'chain': {
        const struck = new Set([target]);
        let from: Point = [x, y];
        for (let i = 0; i < effect.jumps; i++) {
          const next = this.near(from[0], from[1], effect.jumpRadius).find((enemy) => !struck.has(enemy) && this.reaches(element, enemy));
          if (!next) break;
          struck.add(next);
          const to = positionAt(path, next.distance);
          this.events.push({ kind: 'chain', from, to, element });
          this.hurt(next, damage * effect.jumpDamage, element);
          from = to;
        }
        break;
      }

      case 'poison':
        this.poison(target, dealt * effect.poisonDps, dealt * effect.poisonCap, effect.poisonTime);
        break;

      case 'heavy':
      case 'none':
      case 'aura':
        break;
    }
  }

  /** Множитель урона стихии по этому врагу. */
  private resist(enemy: Enemy, element: ElementId): number {
    return this.setup.enemies.types[enemy.type].resist?.[element] ?? 1;
  }

  /** Эффект на этого врага не ложится: об этом сообщает событие. */
  private shrugs(enemy: Enemy, status: StatusId): boolean {
    if (!this.setup.enemies.types[enemy.type].immune?.includes(status)) return false;
    this.refuse(enemy);
    return true;
  }

  private refuse(enemy: Enemy): void {
    if (enemy.hp <= 0 || this.events.some((event) => event.kind === 'immune' && event.enemy === enemy)) return;
    const [x, y] = positionAt(this.setup.path, enemy.distance);
    this.events.push({ kind: 'immune', enemy, x, y });
  }

  /** Замедления не складываются: действует сильнейшее. Командиры и король замедляются слабее. */
  private slow(enemy: Enemy, status: 'slow' | 'freeze', factor: number, time: number): void {
    if (this.shrugs(enemy, status)) return;
    const { bossSlowResist, types } = this.setup.enemies;
    const applied = types[enemy.type].slowResist ? 1 - (1 - factor) * bossSlowResist : factor;
    enemy.slowFactor = Math.min(enemy.slowTime > 0 ? enemy.slowFactor : 1, applied);
    enemy.slowTime = Math.max(enemy.slowTime, time);
  }

  /** Поджог продлевается каждым попаданием; из двух огней горит сильнейший. */
  private burn(enemy: Enemy, dps: number, time: number): void {
    if (this.shrugs(enemy, 'burn') || dps <= 0) return;
    enemy.burnDps = enemy.burnTime > 0 ? Math.max(enemy.burnDps, dps) : dps;
    enemy.burnTime = time;
  }

  /** Яд копится от попадания к попаданию до потолка `cap`; более сильный яд слабым не сбивается. */
  private poison(enemy: Enemy, dps: number, cap: number, time: number): void {
    if (this.shrugs(enemy, 'poison') || dps <= 0) return;
    enemy.poisonDps = Math.max(enemy.poisonDps, Math.min(enemy.poisonDps + dps, cap));
    enemy.poisonTime = time;
  }

  /** Прямое попадание: щит съедает его целиком, сопротивление стихии урезает урон. */
  private hurt(enemy: Enemy, damage: number, element: ElementId): void {
    if (enemy.hp <= 0) return;
    const [x, y] = positionAt(this.setup.path, enemy.distance);
    if (enemy.shield > 0) {
      enemy.shield--;
      this.events.push({ kind: 'blocked', enemy, x, y });
      return;
    }
    const mult = this.resist(enemy, element);
    if (mult <= 0) {
      this.refuse(enemy);
      return;
    }
    this.events.push({ kind: 'hit', enemy, x, y, element });
    this.damage(enemy, damage * mult, x, y);
  }

  /** Осколки взрыва и облако: мимо щита, но с учётом сопротивления стихии. */
  private graze(enemy: Enemy, amount: number, element: ElementId): void {
    const mult = this.resist(enemy, element);
    if (mult <= 0) {
      this.refuse(enemy);
      return;
    }
    this.damage(enemy, amount * mult, ...positionAt(this.setup.path, enemy.distance));
  }

  /** Урон как есть, мимо щита и сопротивлений: метеор, огонь, яд. */
  private damage(enemy: Enemy, amount: number, x: number, y: number): void {
    // Под землёй врага не достаёт ничто, даже уже горящий на нём огонь.
    if (enemy.hp <= 0 || this.burrowed(enemy)) return;
    enemy.hp -= amount;
    if (enemy.hp > 0) return;
    const { crystalChance, crystalDrop } = this.setup.enemies.types[enemy.type];
    const crystals = this.rng() < crystalChance ? crystalDrop : 0;
    this.events.push({ kind: 'killed', enemy, x, y, gold: enemy.gold, crystals });
  }
}
