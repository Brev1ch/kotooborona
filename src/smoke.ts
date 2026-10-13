import type Phaser from 'phaser';
import { progress } from './progress';
import type { GameScene } from './scenes/GameScene';
import { SceneKey, type HudState } from './scenes/keys';
import type { GearSelection } from './systems/Progress';

// Зонд для смоук-проверки (smoke/game.smoke.ts). Игра — один canvas, поэтому тест
// читает состояние отсюда. Модуль подключается только по параметру ?smoke (см. main.ts).

/** Нажимаемый элемент: имя объекта (пустое, если не задано) и видимый прямоугольник в логических координатах. */
export interface SmokeTarget {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SmokeState {
  /** Ключи активных сцен. */
  scenes: string[];
  /** Всё, что сейчас реагирует на нажатие, во всех активных сценах. */
  targets: SmokeTarget[];
  /** Надетое снаряжение. */
  gear: GearSelection;
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

type Bounded = Phaser.GameObjects.GameObject & { getBounds?: () => Phaser.Geom.Rectangle };

/** Собирает нажимаемые объекты сцены, заходя внутрь контейнеров. */
function collectTargets(objects: Phaser.GameObjects.GameObject[], out: SmokeTarget[]): void {
  for (const object of objects as Bounded[]) {
    if (object.input?.enabled && object.getBounds) {
      const { x, y, width, height } = object.getBounds();
      out.push({ name: object.name, x, y, width, height });
    }
    if ('list' in object) collectTargets(object.list as Phaser.GameObjects.GameObject[], out);
  }
}

export function installSmokeProbe(game: Phaser.Game): void {
  window.__smoke = {
    state() {
      const active = game.scene.getScenes(true);
      const scenes = active.map((scene) => scene.scene.key);
      const targets: SmokeTarget[] = [];
      for (const scene of active) collectTargets(scene.children.list, targets);
      const common = { scenes, targets, gear: { ...progress.gear } };

      if (!scenes.includes(SceneKey.Game)) return { ...common, hud: null, cats: 0, enemies: 0 };
      const gameScene = game.scene.getScene(SceneKey.Game) as GameScene;
      return { ...common, hud: gameScene.hudState(), ...gameScene.fieldCounts() };
    },
  };
}
