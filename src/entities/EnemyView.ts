import Phaser from 'phaser';
import { enemies, enemyColor } from '../data';
import { ENEMY_FEEL } from '../feel';
import { COLORS, DEPTH } from '../layout';
import type { Enemy } from './Enemy';

/** Временный вид врага: мышь сверху, носом по ходу движения, с полоской здоровья. */
export class EnemyView extends Phaser.GameObjects.Container {
  private readonly radius: number;
  /** Поворачивается по ходу движения; полоска здоровья остаётся горизонтальной. */
  private readonly turning: Phaser.GameObjects.Container;
  private readonly shield: Phaser.GameObjects.Graphics;
  private readonly bar: Phaser.GameObjects.Graphics;
  private shownHp = -1;

  constructor(scene: Phaser.Scene, x: number, y: number, enemy: Enemy) {
    super(scene, x, y);

    const r = enemies.types[enemy.type].radius;
    const color = enemyColor(enemy.type);
    this.radius = r;

    const g = scene.add.graphics();
    g.lineStyle(2, color);
    g.lineBetween(-r, 0, -r * 1.6, r * 0.35);
    g.lineBetween(-r * 1.6, r * 0.35, -r * 2.2, 0);
    g.fillStyle(color);
    g.fillEllipse(0, 0, r * 2.3, r * 1.7);
    g.fillCircle(r * 0.3, -r * 0.7, r * 0.4);
    g.fillCircle(r * 0.3, r * 0.7, r * 0.4);
    g.fillStyle(COLORS.enemyNose);
    g.fillCircle(r * 1.15, 0, r * 0.18);
    if (enemy.type === 'boss') {
      g.fillStyle(COLORS.brass);
      g.fillRect(-r * 0.3, -r * 0.35, r * 0.6, r * 0.7);
    }

    this.shield = scene.add.graphics();
    this.shield.fillStyle(COLORS.shield);
    this.shield.fillEllipse(r * 1.3, 0, r * 0.7, r * 1.8);

    this.turning = scene.add.container(0, 0, [g, this.shield]);
    this.bar = scene.add.graphics();
    this.add([this.turning, this.bar]);
    this.setDepth(DEPTH.enemy);
    scene.add.existing(this);

    this.sync(enemy, x, y, 0);
  }

  /** Ставит врага в точку дороги и обновляет щит и полоску здоровья. `angle` — направление движения в радианах. */
  sync(enemy: Enemy, x: number, y: number, angle: number): void {
    this.setPosition(x, y);
    this.turning.setRotation(angle);
    this.shield.setVisible(enemy.shield > 0);

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
}
