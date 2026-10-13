import type Phaser from 'phaser';
import type { ElementId, EnemyTypeId } from './data';
import { enemies } from './data';
import { BOARD_Y, COLORS, CONTROLS_Y, FONTS, GAME_W, TEXT_COLORS } from './layout';
import type { GameScene } from './scenes/GameScene';
import { GameEvent } from './scenes/keys';

// Отладочные инструменты. Модуль подключается только под import.meta.env.DEV (см. UIScene)
// и зондом проверок (src/smoke.ts); игрокам он не загружается, поэтому строки и числа живут прямо здесь.

const BUTTON_W = 68;
const BUTTON_H = 18;
const BUTTON_GAP = 4;

// Стресс-проверка производительности: худший случай с запасом.
// Всё поле занято гибридами 5–6 уровня с эффектами по площади, а врагов больше, чем в любой волне уровня:
// крысы и щитоносцы живучие и копятся на дороге, мыши гибнут сразу и дают награды, облачка и всплывающие числа.
const STRESS_ELEMENTS: ElementId[] = ['steam', 'lava', 'storm', 'sand', 'ice', 'swamp'];
const STRESS_LEVELS = [5, 6];
const STRESS_ENEMIES: EnemyTypeId[] = ['mouse', 'rat', 'shield', 'mouse', 'rat'];
const STRESS_ENEMY_COUNT = 40;
const STRESS_ENEMY_HP: Record<EnemyTypeId, number> = { mouse: 40, rat: 3000, shield: 3000, boots: 3000, fire: 3000, shaman: 3000, mole: 3000, ninja: 3000, bat: 3000, boss: 3000, king: 3000 };
const STRESS_SPAWN_MS = 350;
const STRESS_LIVES = 999;

const FPS_EVERY_MS = 500;

/** Худший случай для отрисовки; им же меряет производительность `npm run perf`. */
export function stress(game: GameScene): void {
  // Чтобы проверку не оборвало поражение.
  game.economy.lives = STRESS_LIVES;
  for (let slot = 0; slot < game.slotCount; slot++) {
    game.placeCat(slot, {
      element: STRESS_ELEMENTS[slot % STRESS_ELEMENTS.length],
      level: STRESS_LEVELS[slot % STRESS_LEVELS.length],
      cooldown: 0,
      ritual: 0,
      invested: 0,
    });
  }

  let spawned = 0;
  game.time.addEvent({
    delay: STRESS_SPAWN_MS,
    repeat: STRESS_ENEMY_COUNT - 1,
    callback: () => {
      const type = STRESS_ENEMIES[spawned++ % STRESS_ENEMIES.length];
      const config = enemies.types[type];
      game.addEnemy({
        type,
        distance: 0,
        hp: STRESS_ENEMY_HP[type],
        maxHp: STRESS_ENEMY_HP[type],
        speed: config.speed,
        gold: config.gold,
        shield: config.shield,
        slowFactor: 1,
        slowTime: 0,
        burnDps: 0,
        burnTime: 0,
        poisonDps: 0,
        poisonTime: 0,
      });
    },
  });
}

const BUTTONS: { label: string; color: string; apply: (game: GameScene) => void }[] = [
  { label: '+100 монет', color: TEXT_COLORS.brass, apply: (game) => (game.economy.gold += 100) },
  { label: '+5 кристаллов', color: TEXT_COLORS.crystal, apply: (game) => (game.economy.crystals += 5) },
  { label: 'стресс', color: TEXT_COLORS.danger, apply: stress },
];

/** Маленькие кнопки в ряд над нижней полосой, под дорогой: монеты, кристаллы и стресс-проверка. */
export function addDebugButtons(ui: Phaser.Scene, game: GameScene): void {
  const y = CONTROLS_Y - BUTTON_H / 2 - 2;

  BUTTONS.forEach(({ label, color, apply }, i) => {
    const x = GAME_W - BUTTON_W / 2 - 6 - i * (BUTTON_W + BUTTON_GAP);
    ui.add
      .rectangle(x, y, BUTTON_W, BUTTON_H, COLORS.panel)
      .setStrokeStyle(1, COLORS.line)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        apply(game);
        game.events.emit(GameEvent.Changed);
      });
    ui.add.text(x, y, label, { fontFamily: FONTS.body, fontSize: '9px', color }).setOrigin(0.5);
  });
}

/**
 * Счётчик в левом верхнем углу поля: средний FPS и самый долгий кадр за последние полсекунды.
 * Долгий кадр важнее среднего: рывок виден глазом, даже когда средний FPS высокий.
 */
export function addFpsCounter(ui: Phaser.Scene): void {
  const text = ui.add.text(2, BOARD_Y + 2, '', {
    fontFamily: FONTS.body,
    fontSize: '9px',
    color: TEXT_COLORS.fg,
    backgroundColor: TEXT_COLORS.dark,
    padding: { x: 3, y: 1 },
  });

  // Время между кадрами меряем по часам, а не по delta сцены: Phaser её сглаживает и ограничивает.
  let last = performance.now();
  let worst = 0;
  let frames = 0;
  let since = last;
  const onUpdate = (): void => {
    const now = performance.now();
    worst = Math.max(worst, now - last);
    last = now;
    frames++;
    if (now - since < FPS_EVERY_MS) return;
    text.setText(`${Math.round((frames * 1000) / (now - since))} fps · ${Math.round(worst)} мс`);
    worst = 0;
    frames = 0;
    since = now;
  };
  ui.events.on('update', onUpdate);
  // События сцены переживают её перезапуск: без отписки счётчик прошлого боя писал бы в уничтоженную надпись.
  ui.events.once('shutdown', () => ui.events.off('update', onUpdate));
}
