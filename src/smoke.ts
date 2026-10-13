import type Phaser from 'phaser';
import type { GameScene } from './scenes/GameScene';
import { SceneKey, type HudState } from './scenes/keys';

// Зонд для смоук-проверки (smoke/game.smoke.ts). Игра — один canvas, поэтому тест
// читает состояние отсюда. Модуль подключается только по параметру ?smoke (см. main.ts).

export interface SmokeState {
  /** Ключи активных сцен. */
  scenes: string[];
  /** null, пока GameScene не запущена. */
  hud: HudState | null;
  cats: number;
  enemies: number;
}

export interface SmokeProbe {
  state(): SmokeState;
}

declare global {
  interface Window {
    __smoke?: SmokeProbe;
  }
}

export function installSmokeProbe(game: Phaser.Game): void {
  window.__smoke = {
    state() {
      const scenes = game.scene.getScenes(true).map((scene) => scene.scene.key);
      if (!scenes.includes(SceneKey.Game)) return { scenes, hud: null, cats: 0, enemies: 0 };
      const gameScene = game.scene.getScene(SceneKey.Game) as GameScene;
      return { scenes, hud: gameScene.hudState(), ...gameScene.fieldCounts() };
    },
  };
}
