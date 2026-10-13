import Phaser from 'phaser';
import { COLORS, GAME_H, GAME_W } from './layout';
import { BestiaryScene } from './scenes/BestiaryScene';
import { BookScene } from './scenes/BookScene';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { GearScene } from './scenes/GearScene';
import { IntroScene } from './scenes/IntroScene';
import { MenuScene } from './scenes/MenuScene';
import { StoryScene } from './scenes/StoryScene';
import { UIScene } from './scenes/UIScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_W,
    height: GAME_H,
  },
  scene: [BootScene, MenuScene, BookScene, BestiaryScene, GearScene, StoryScene, IntroScene, GameScene, UIScene],
});

// Долгое касание и правая кнопка не должны открывать меню браузера поверх игры.
window.addEventListener('contextmenu', (event) => event.preventDefault());

// Зонд для смоук-проверки (npm run smoke): отдельный чанк, у игроков не загружается.
if (new URLSearchParams(location.search).has('smoke')) {
  void import('./smoke').then(({ installSmokeProbe }) => installSmokeProbe(game));
}
