import type Phaser from 'phaser';
import { COLORS, CONTROLS_Y, FONTS, GAME_W, TEXT_COLORS } from './layout';
import type { GameScene } from './scenes/GameScene';
import { GameEvent } from './scenes/keys';

// Отладочные кнопки. Модуль подключается только под import.meta.env.DEV (см. UIScene)
// и в сборку для игроков не попадает, поэтому строки и числа живут прямо здесь.

const BUTTON_W = 68;
const BUTTON_H = 18;
const BUTTON_GAP = 4;

const GRANTS: { label: string; color: string; apply: (game: GameScene) => void }[] = [
  { label: '+100 монет', color: TEXT_COLORS.brass, apply: (game) => (game.economy.gold += 100) },
  { label: '+5 кристаллов', color: TEXT_COLORS.crystal, apply: (game) => (game.economy.crystals += 5) },
];

/** Маленькие кнопки в ряд над нижней полосой, под дорогой: выдают монеты и кристаллы. */
export function addDebugButtons(ui: Phaser.Scene, game: GameScene): void {
  const y = CONTROLS_Y - BUTTON_H / 2 - 2;

  GRANTS.forEach(({ label, color, apply }, i) => {
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
