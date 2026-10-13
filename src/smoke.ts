import type Phaser from 'phaser';
import { audio } from './audio';
import { levels } from './data';
import { stress } from './debug';
import { progress } from './progress';
import type { GameScene } from './scenes/GameScene';
import { SceneKey, type HudState, type LevelSceneData } from './scenes/keys';
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
  /** Идёт переход между экранами: экран гаснет или проявляется. */
  fading: boolean;
  /** Всё, что сейчас реагирует на нажатие, во всех активных сценах. */
  targets: SmokeTarget[];
  /** Звук включён игроком. */
  sound: boolean;
  /** Надетое снаряжение. */
  gear: GearSelection;
  /** null, пока GameScene не запущена. */
  hud: HudState | null;
  cats: number;
  enemies: number;
  /** Сколько враги прошли в сумме: на паузе не растёт. */
  march: number;
  /** Бой стоит на паузе. */
  paused: boolean;
}

/** Стоимость кадра для процессора: обновление и отправка отрисовки, без работы видеокарты. Время — в мс. */
export interface FrameProfile {
  frames: number;
  median: number;
  p95: number;
  worst: number;
  /** Больше всего врагов и объектов на поле за время записи. */
  enemiesPeak: number;
  objectsPeak: number;
}

export interface SmokeProbe {
  state(): SmokeState;
  /** Сразу запускает бой, минуя меню и снаряжение; без id — на первом уровне. */
  startLevel(levelId?: string): void;
  /** Стресс-проверка из src/debug.ts: поле гибридов и толпа врагов. */
  stress(): void;
  /** Начинает запись стоимости кадров; `stopProfile` возвращает итог. */
  startProfile(): void;
  stopProfile(): FrameProfile;
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
  const steps: number[] = [];
  let stepStart = 0;
  let enemiesPeak = 0;
  let objectsPeak = 0;
  const onPreStep = (): void => {
    stepStart = performance.now();
  };
  const onPostRender = (): void => {
    steps.push(performance.now() - stepStart);
    const scene = game.scene.getScene(SceneKey.Game) as GameScene;
    enemiesPeak = Math.max(enemiesPeak, scene.fieldCounts().enemies);
    objectsPeak = Math.max(objectsPeak, scene.children.length);
  };

  window.__smoke = {
    startProfile() {
      steps.length = 0;
      enemiesPeak = 0;
      objectsPeak = 0;
      game.events.on('prestep', onPreStep);
      game.events.on('postrender', onPostRender);
    },
    stopProfile() {
      game.events.off('prestep', onPreStep);
      game.events.off('postrender', onPostRender);
      const sorted = [...steps].sort((a, b) => a - b);
      const at = (share: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
      return { frames: sorted.length, median: at(0.5), p95: at(0.95), worst: at(1), enemiesPeak, objectsPeak };
    },
    startLevel(levelId = levels.levels[0].id) {
      for (const scene of game.scene.getScenes(true)) scene.scene.stop();
      const data: LevelSceneData = { levelId };
      game.scene.start(SceneKey.Game, data);
    },
    stress() {
      stress(game.scene.getScene(SceneKey.Game) as GameScene);
    },
    state() {
      const active = game.scene.getScenes(true);
      const scenes = active.map((scene) => scene.scene.key);
      const targets: SmokeTarget[] = [];
      for (const scene of active) collectTargets(scene.children.list, targets);
      const fading = active.some((scene) => scene.cameras.main?.fadeEffect.isRunning);
      const common = { scenes, fading, targets, sound: audio.on, gear: { ...progress.gear } };

      // Сцена боя на паузе не числится среди активных, но она есть.
      const paused = game.scene.isPaused(SceneKey.Game);
      if (!paused && !scenes.includes(SceneKey.Game)) {
        return { ...common, hud: null, cats: 0, enemies: 0, march: 0, paused: false };
      }
      const gameScene = game.scene.getScene(SceneKey.Game) as GameScene;
      return { ...common, hud: gameScene.hudState(), ...gameScene.fieldCounts(), paused };
    },
  };
}
