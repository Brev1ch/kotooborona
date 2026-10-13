import Phaser from 'phaser';
import { elementColor, enemies, enemyColor } from '../data';
import { ENEMY_FEEL, STATUS_FEEL } from '../feel';
import { COLORS, DEPTH, FONTS, TEXT_COLORS } from '../layout';
import type { Enemy } from './Enemy';

/** Временный вид врага: мышь сверху, носом по ходу движения, с полоской здоровья. */
export class EnemyView extends Phaser.GameObjects.Container {
  private readonly radius: number;
  /** Поворачивается по ходу движения; полоска здоровья остаётся горизонтальной. */
  private readonly turning: Phaser.GameObjects.Container;
  /** Белый силуэт поверх тела: вспыхивает при попадании. */
  private readonly flash: Phaser.GameObjects.Graphics;
  private readonly shield: Phaser.GameObjects.Container;
  private readonly shieldCount: Phaser.GameObjects.Text;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly marks: Phaser.GameObjects.Graphics;
  private shownHp = -1;
  private shownStatus = '';

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

    this.flash = scene.add.graphics().setAlpha(0);
    this.flash.fillStyle(COLORS.flash);
    this.flash.fillEllipse(0, 0, r * 2.3, r * 1.7);
    this.flash.fillCircle(r * 0.3, -r * 0.7, r * 0.4);
    this.flash.fillCircle(r * 0.3, r * 0.7, r * 0.4);

    const plate = scene.add.graphics();
    plate.fillStyle(COLORS.shield);
    plate.fillEllipse(0, 0, r * 0.7, r * 1.8);
    // Сколько попаданий щит ещё выдержит.
    this.shieldCount = scene.add
      .text(0, 0, '', { fontFamily: FONTS.body, fontSize: '9px', color: TEXT_COLORS.dark })
      .setOrigin(0.5);
    this.shield = scene.add.container(r * 1.3, 0, [plate, this.shieldCount]);

    this.turning = scene.add.container(0, 0, [g, this.flash, this.shield]);
    this.bar = scene.add.graphics();
    this.marks = scene.add.graphics();
    this.add([this.turning, this.marks, this.bar]);
    this.setDepth(DEPTH.enemy);
    scene.add.existing(this);

    this.sync(enemy, x, y, 0);
  }

  /** Ставит врага в точку дороги и обновляет щит и полоску здоровья. `angle` — направление движения в радианах. */
  sync(enemy: Enemy, x: number, y: number, angle: number): void {
    this.setPosition(x, y);
    this.turning.setRotation(angle);
    this.shield.setVisible(enemy.shield > 0);
    this.shieldCount.setText(String(enemy.shield));
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
    const slowed = enemy.slowTime > 0;
    const frozen = slowed && enemy.slowFactor < STATUS_FEEL.frozenBelow;
    const burning = enemy.burnTime > 0;
    const poisoned = enemy.poisonTime > 0;
    const status = `${slowed}${frozen}${burning}${poisoned}`;
    if (status === this.shownStatus) return;
    this.shownStatus = status;

    const r = this.radius;
    const g = this.marks;
    g.clear();
    if (slowed) {
      g.lineStyle(STATUS_FEEL.ringWidth, elementColor(frozen ? 'ice' : 'water'));
      g.strokeCircle(0, 0, r + STATUS_FEEL.ringGap);
    }
    if (burning) {
      g.fillStyle(elementColor('fire'));
      g.fillCircle(-r * 0.6, -r, STATUS_FEEL.dotRadius);
    }
    if (poisoned) {
      g.fillStyle(elementColor('swamp'));
      g.fillCircle(r * 0.6, -r, STATUS_FEEL.dotRadius);
    }
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
    this.pulse(this.shield, ENEMY_FEEL.blockScale, ENEMY_FEEL.blockMs);
  }

  /** Враг убит: сжимается, гаснет и удаляется. */
  playDeath(): void {
    this.bar.setVisible(false);
    this.marks.setVisible(false);
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
