import type Phaser from 'phaser';
import { COLORS, CONTROLS_H, CONTROLS_Y, FONTS, GAME_W, TEXT_COLORS } from './layout';
import type { GameScene } from './scenes/GameScene';
import { GameEvent } from './scenes/keys';

// Отладочные кнопки. Модуль подключается только под import.meta.env.DEV (см. UIScene)
// и в сборку для игроков не попадает, поэтому строки и числа живут прямо здесь.

const BUTTON_W = 68;
const BUTTON_H = 22;
const BUTTON_GAP = 4;

const GRANTS: { label: string; color: string; apply: (game: GameScene) => void }[] = [
  { label: '+100 монет', color: TEXT_COLORS.brass, apply: (game) => (game.economy.gold += 100) },
  { label: '+5 кристаллов', color: TEXT_COLORS.crystal, apply: (game) => (game.economy.crystals += 5) },
];

/** Маленькие кнопки справа от «Призвать»: выдают монеты и кристаллы. */
export function addDebugButtons(ui: Phaser.Scene, game: GameScene): void {
  const x = GAME_W - BUTTON_W / 2 - 6;
  const top = CONTROLS_Y + (CONTROLS_H - GRANTS.length * BUTTON_H - (GRANTS.length - 1) * BUTTON_GAP) / 2;

  GRANTS.forEach(({ label, color, apply }, i) => {
    const y = top + BUTTON_H / 2 + i * (BUTTON_H + BUTTON_GAP);
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
