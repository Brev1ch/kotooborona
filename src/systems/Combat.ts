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

/** Что произошло за шаг боя; сцена по этим событиям меняет экономику и картинку. */
export type CombatEvent =
  /** Враг дошёл до ворот и снят с поля. */
  | { kind: 'leaked'; enemy: Enemy; lifeDamage: number }
  | { kind: 'shot'; slot: number; projectile: Projectile }
  | { kind: 'hit'; enemy: Enemy; x: number; y: number; element: ElementId }
  /** Щит принял попадание на себя. */
  | { kind: 'blocked'; enemy: Enemy; x: number; y: number }
  | { kind: 'killed'; enemy: Enemy; x: number; y: number; gold: number; crystals: number };

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

  private moveEnemies(dt: number): void {
    const { enemies, path } = this.setup;
    for (const enemy of this.alive) enemy.distance += enemy.speed * dt;

    this.alive = this.alive.filter((enemy) => {
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
    const target = this.pickTarget(x, y, catRange(cats, cat));
    if (!target) return;

    cat.cooldown = 1 / catRate(cats, cat);
    const projectile: Projectile = { x, y, target, damage: catDamage(cats, cat), element: cat.element };
    this.flying.push(projectile);
    this.events.push({ kind: 'shot', slot, projectile });
  }

  /** Враг в радиусе, прошедший по дороге дальше всех. */
  private pickTarget(x: number, y: number, range: number): Enemy | null {
    const { path, bounds, cats } = this.setup;
    const margin = cats.targetMargin;
    let best: Enemy | null = null;
    for (const enemy of this.alive) {
      if (enemy.hp <= 0) continue;
      const [ex, ey] = positionAt(path, enemy.distance);
      if (ex < -margin || ey < -margin || ex > bounds.width + margin || ey > bounds.height + margin) continue;
      if (Math.hypot(ex - x, ey - y) > range) continue;
      if (!best || enemy.distance > best.distance) best = enemy;
    }
    return best;
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

  private applyHit(projectile: Projectile): void {
    this.hurt(projectile.target, projectile.damage, projectile.element);
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

  private damage(enemy: Enemy, amount: number, x: number, y: number): void {
    enemy.hp -= amount;
    if (enemy.hp > 0) return;
    const { crystalChance, crystalDrop } = this.setup.enemies.types[enemy.type];
    const crystals = this.rng() < crystalChance ? crystalDrop : 0;
    this.events.push({ kind: 'killed', enemy, x, y, gold: enemy.gold, crystals });
  }
}
