import type { CatsConfig, ElementId, EnemiesConfig, Point } from '../data/types';
import type { Cat } from '../entities/Cat';
import type { Enemy } from '../entities/Enemy';
import type { Projectile } from '../entities/Projectile';
import { positionAt, type Path } from './Path';

export function catRange(config: CatsConfig, cat: Cat): number {
  return config.baseRange + config.rangePerLevel * cat.level;
}

/** Урон одной атаки. */
export function catDamage(config: CatsConfig, cat: Cat): number {
  const element = config.elements[cat.element];
  const hybrid = element.from ? config.hybridDamageMult : 1;
  return config.baseDamage * Math.pow(config.levelDamageMult, cat.level - 1) * element.dmg * hybrid;
}

/** Атак в секунду. */
export function catRate(config: CatsConfig, cat: Cat): number {
  return (config.baseRate + config.ratePerLevel * cat.level) * config.elements[cat.element].rate;
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
}

/** Взрыв по площади, не привязанный к коту: умение героя. */
export interface Blast {
  radius: number;
  damage: number;
  /** Урон от огня в секунду для всех задетых. */
  burnDps: number;
  burnTime: number;
}

/** Что произошло за шаг боя; сцена по этим событиям меняет экономику и картинку. */
export type CombatEvent =
  /** Враг дошёл до ворот и снят с поля. */
  | { kind: 'leaked'; enemy: Enemy; lifeDamage: number }
  | { kind: 'shot'; slot: number; projectile: Projectile }
  | { kind: 'hit'; enemy: Enemy; x: number; y: number; element: ElementId }
  /** Щит принял попадание на себя. */
  | { kind: 'blocked'; enemy: Enemy; x: number; y: number }
  | { kind: 'killed'; enemy: Enemy; x: number; y: number; gold: number; crystals: number }
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

  add(enemy: Enemy): void {
    this.alive.push(enemy);
  }

  /** Продвигает бой на `dt` секунд. Кулдауны котов на поле `board` меняются на месте. */
  update(dt: number, board: readonly (Cat | null)[]): CombatEvent[] {
    this.events = [];
    this.moveEnemies(dt);
    board.forEach((cat, slot) => {
      if (cat) this.attack(cat, slot, dt);
    });
    this.moveProjectiles(dt);
    this.alive = this.alive.filter((enemy) => enemy.hp > 0);
    return this.events;
  }

  /**
   * Взрыв в точке: урон мимо щита и поджог всем, кто сейчас в радиусе.
   * Возвращает события так же, как update().
   */
  strike(x: number, y: number, { radius, damage, burnDps, burnTime }: Blast): CombatEvent[] {
    this.events = [];
    for (const enemy of this.near(x, y, radius)) {
      const [ex, ey] = positionAt(this.setup.path, enemy.distance);
      this.events.push({ kind: 'hit', enemy, x: ex, y: ey, element: 'fire' });
      this.damage(enemy, damage, ex, ey);
      this.burn(enemy, burnDps, burnTime);
    }
    this.alive = this.alive.filter((enemy) => enemy.hp > 0);
    return this.events;
  }

  private moveEnemies(dt: number): void {
    const { enemies, path } = this.setup;
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
    }

    this.alive = this.alive.filter((enemy) => {
      if (enemy.hp <= 0) return false;
      if (enemy.distance < path.length) return true;
      this.events.push({ kind: 'leaked', enemy, lifeDamage: enemies.types[enemy.type].lifeDamage });
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
      const targets = this.near(x, y, range).filter((enemy) => this.visible(enemy));
      if (targets.length === 0) return;
      cat.cooldown = 1 / catRate(cats, cat);
      this.events.push({ kind: 'aura', slot, radius: range, element: cat.element });
      for (const enemy of targets) this.hurt(enemy, catDamage(cats, cat), cat.element);
      return;
    }

    const target = this.pickTarget(x, y, range);
    if (!target) return;

    cat.cooldown = 1 / catRate(cats, cat);
    const projectile: Projectile = { x, y, target, damage: catDamage(cats, cat), element: cat.element };
    this.flying.push(projectile);
    this.events.push({ kind: 'shot', slot, projectile });
  }

  /** Враг в радиусе, прошедший по дороге дальше всех. */
  private pickTarget(x: number, y: number, range: number): Enemy | null {
    let best: Enemy | null = null;
    for (const enemy of this.near(x, y, range)) {
      if (!this.visible(enemy)) continue;
      if (!best || enemy.distance > best.distance) best = enemy;
    }
    return best;
  }

  /** Живые враги не дальше `radius` от точки, кроме `except`; в порядке появления. */
  private near(x: number, y: number, radius: number, except?: Enemy): Enemy[] {
    return this.alive.filter((enemy) => {
      if (enemy.hp <= 0 || enemy === except) return false;
      const [ex, ey] = positionAt(this.setup.path, enemy.distance);
      return Math.hypot(ex - x, ey - y) <= radius;
    });
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
      // Цель убита или ушла в ворота — снаряд пропадает.
      if (target.hp <= 0 || !this.alive.includes(target)) return false;

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

    this.hurt(target, damage, element);

    switch (fx) {
      case 'burn':
        this.burn(target, damage * effect.burnDps, effect.burnTime);
        break;

      case 'slow':
      case 'freeze':
        this.slow(target, effect.slowFactor, effect.slowTime);
        break;

      case 'splash_slow':
        this.slow(target, effect.slowFactor, effect.slowTime);
        for (const other of this.near(x, y, effect.splashRadius, target)) {
          this.damage(other, damage * effect.splashDamage, ...positionAt(path, other.distance));
          this.slow(other, effect.slowFactor, effect.slowTime);
        }
        this.events.push({ kind: 'splash', x, y, radius: effect.splashRadius, element });
        break;

      case 'splash_burn':
        this.burn(target, damage * effect.burnDps, effect.burnTime);
        for (const other of this.near(x, y, effect.splashRadius, target)) {
          this.damage(other, damage * effect.splashDamage, ...positionAt(path, other.distance));
          this.burn(other, damage * effect.splashBurnDps, effect.burnTime);
        }
        this.events.push({ kind: 'splash', x, y, radius: effect.splashRadius, element });
        break;

      case 'chain': {
        const struck = new Set([target]);
        let from: Point = [x, y];
        for (let i = 0; i < effect.jumps; i++) {
          const next = this.near(from[0], from[1], effect.jumpRadius).find((enemy) => !struck.has(enemy));
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
        // Яд копится от попадания к попаданию до потолка; более сильный яд слабым не сбивается.
        target.poisonDps = Math.max(
          target.poisonDps,
          Math.min(target.poisonDps + damage * effect.poisonDps, damage * effect.poisonCap),
        );
        target.poisonTime = effect.poisonTime;
        break;

      case 'heavy':
      case 'none':
      case 'aura':
        break;
    }
  }

  /** Замедления не складываются: действует сильнейшее. Командир замедляется слабее. */
  private slow(enemy: Enemy, factor: number, time: number): void {
    const applied = enemy.type === 'boss' ? 1 - (1 - factor) * this.setup.enemies.bossSlowResist : factor;
    enemy.slowFactor = Math.min(enemy.slowTime > 0 ? enemy.slowFactor : 1, applied);
    enemy.slowTime = Math.max(enemy.slowTime, time);
  }

  /** Поджог продлевается каждым попаданием; из двух огней горит сильнейший. */
  private burn(enemy: Enemy, dps: number, time: number): void {
    enemy.burnDps = enemy.burnTime > 0 ? Math.max(enemy.burnDps, dps) : dps;
    enemy.burnTime = time;
  }

  /** Прямое попадание: щит съедает его целиком. */
  private hurt(enemy: Enemy, damage: number, element: ElementId): void {
    if (enemy.hp <= 0) return;
    const [x, y] = positionAt(this.setup.path, enemy.distance);
    if (enemy.shield > 0) {
      enemy.shield--;
      this.events.push({ kind: 'blocked', enemy, x, y });
      return;
    }
    this.events.push({ kind: 'hit', enemy, x, y, element });
    this.damage(enemy, damage, x, y);
  }

  /** Урон мимо щита: осколки взрыва, огонь, яд. */
  private damage(enemy: Enemy, amount: number, x: number, y: number): void {
    if (enemy.hp <= 0) return;
    enemy.hp -= amount;
    if (enemy.hp > 0) return;
    const { crystalChance, crystalDrop } = this.setup.enemies.types[enemy.type];
    const crystals = this.rng() < crystalChance ? crystalDrop : 0;
    this.events.push({ kind: 'killed', enemy, x, y, gold: enemy.gold, crystals });
  }
}
