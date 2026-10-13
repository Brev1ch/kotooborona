import type Phaser from 'phaser';
import { audio } from './audio';
import { enemies, levels } from './data';
import type { Enemy } from './entities/Enemy';
import { stress } from './debug';
import { progress } from './progress';
import type { GameScene } from './scenes/GameScene';
import type { StoryScene } from './scenes/StoryScene';
import type { UIScene } from './scenes/UIScene';
import { SceneKey, type HudState, type LevelSceneData, type StorySceneData } from './scenes/keys';
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
  /** Открытый экран итога боя. */
  result: 'win' | 'lose' | null;
  /** Сценка на экране: номер реплики и сколько их всего. */
  story: { line: number; total: number } | null;
  /** Рыбки игрока. */
  fish: number;
  /** Уровни прокачки надетых предметов. */
  gearLevels: GearSelectionLevels;
  /** Сколько сундуков открыто. */
  chests: number;
}

type GearSelectionLevels = Record<keyof GearSelection, number>;

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
  /** Показывает сценку `storyId`, даже если она уже была; после неё начнётся бой на уровне `levelId`. */
  startStory(levelId: string, storyId: string): void;
  /** id всех уровней по порядку. */
  levelIds(): string[];
  /** Выпускает на дорогу Крысиного короля, уже прошедшего часть пути. */
  spawnKing(): void;
  /** Обнуляет жизни: бой заканчивается поражением. */
  lose(): void;
  /** Заканчивает бой победой с теми жизнями, что есть. */
  win(): void;
  /** Стресс-проверка из src/debug.ts: поле гибридов и толпа врагов. */
  stress(): void;
  /** Вся игра остановлена площадкой: идёт реклама или игру свернули. */
  frozen(): boolean;
  toggleSound(): void;
  /** Начинает запись стоимости кадров; `stopProfile` возвращает итог. */
  startProfile(): void;
  stopProfile(): FrameProfile;
}

declare global {
  interface Window {
    __smoke?: SmokeProbe;
  }
}

/** Враг без эффектов и наград: основа для врагов, которых проверка ставит на поле сама. */
const BLANK_ENEMY: Enemy = {
  type: 'mouse',
  distance: 0,
  hp: 1,
  maxHp: 1,
  speed: 0,
  gold: 0,
  shield: 0,
  slowFactor: 1,
  slowTime: 0,
  burnDps: 0,
  burnTime: 0,
  poisonDps: 0,
  poisonTime: 0,
};

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
      // Идущий бой менеджер сцен перезапустит сам; остальные экраны останавливаем.
      for (const scene of game.scene.getScenes(true)) {
        if (scene.scene.key !== SceneKey.Game) scene.scene.stop();
      }
      const data: LevelSceneData = { levelId };
      game.scene.start(SceneKey.Game, data);
    },
    startStory(levelId, storyId) {
      for (const scene of game.scene.getScenes(true)) scene.scene.stop();
      const data: StorySceneData = { levelId, storyId };
      game.scene.start(SceneKey.Story, data);
    },
    levelIds() {
      return levels.levels.map((level) => level.id);
    },
    spawnKing() {
      const scene = game.scene.getScene(SceneKey.Game) as GameScene;
      const type = enemies.types.king;
      const minion = { ...BLANK_ENEMY, type: 'mouse' as const, hp: 20, maxHp: 20, speed: enemies.types.mouse.speed };
      scene.addEnemy({
        ...BLANK_ENEMY,
        type: 'king',
        distance: 260,
        hp: 5000,
        maxHp: 5000,
        speed: type.speed,
        summon: { timer: 0.5, interval: 2, count: 2, spread: 14, minion },
      });
    },
    lose() {
      (game.scene.getScene(SceneKey.Game) as GameScene).economy.loseLives(Infinity);
    },
    win() {
      (game.scene.getScene(SceneKey.Game) as GameScene).finish(true);
    },
    frozen() {
      return game.isPaused;
    },
    toggleSound() {
      audio.toggle();
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
      const gear = { ...progress.gear };
      const gearLevels = {
        staff: progress.gearLevel('staff', gear.staff),
        mantle: progress.gearLevel('mantle', gear.mantle),
        amulet: progress.gearLevel('amulet', gear.amulet),
      };
      const story = scenes.includes(SceneKey.Story)
        ? (game.scene.getScene(SceneKey.Story) as StoryScene).progressState()
        : null;
      const common = { scenes, fading, targets, sound: audio.on, gear, gearLevels, story, fish: progress.fish, chests: progress.chestsOpened };

      // Сцена боя на паузе не числится среди активных, но она есть.
      const paused = game.scene.isPaused(SceneKey.Game);
      if (!paused && !scenes.includes(SceneKey.Game)) {
        return { ...common, hud: null, cats: 0, enemies: 0, march: 0, paused: false, result: null };
      }
      const gameScene = game.scene.getScene(SceneKey.Game) as GameScene;
      const result = (game.scene.getScene(SceneKey.UI) as UIScene).resultShown();
      return { ...common, hud: gameScene.hudState(), ...gameScene.fieldCounts(), paused, result };
    },
  };
}
