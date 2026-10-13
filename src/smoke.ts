import type Phaser from 'phaser';
import { audio } from './audio';
import { enemies, levels, type ElementId } from './data';
import type { Enemy } from './entities/Enemy';
import { BOARD_Y, GAME_H, GAME_W } from './layout';
import { stress } from './debug';
import { progress } from './progress';
import type { GameScene } from './scenes/GameScene';
import type { StoryScene } from './scenes/StoryScene';
import type { UIScene } from './scenes/UIScene';
import { GameEvent, SceneKey, type HudState, type LevelSceneData, type StorySceneData } from './scenes/keys';
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
  /** id уровня идущего боя. */
  level: string | null;
  cats: number;
  buildings: number;
  /** Сколько строк в открытом окне стройки или улучшения; 0 — окно закрыто. */
  buildRows: number;
  /** Надпись на зоне продажи, пока игрок держит кота или строение. */
  sellZone: string | null;
  /** Взятый кот или строение нарисован поверх экрана. */
  ghost: boolean;
  enemies: number;
  /** Сколько враги прошли в сумме: на паузе не растёт. */
  march: number;
  /** Бой стоит на паузе. */
  paused: boolean;
  /** Шаг обучения, подсказка о котором сейчас на экране. */
  tutorial: string | null;
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
  /**
   * Проблемы с текстом на экране, по строке на каждую: надпись не помещается в свою кнопку,
   * выходит за край экрана или наезжает на другую надпись. Пустой список — всё в порядке.
   */
  textIssues(): string[];
  /** Центры клеток идущего боя в координатах экрана. */
  slotCenters(): [number, number][];
  /** Клетки идущего боя, в которых стоят коты. */
  catSlots(): number[];
  /** Клетки идущего боя, в которых стоят строения. */
  buildingSlots(): number[];
  /** Добавляет монеты в идущий бой. */
  addGold(gold: number): void;
  /** Ставит кота в клетку идущего боя. */
  placeCat(slot: number, element: ElementId, level: number): void;
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

/** Запас на дробные координаты, пиксели. */
const TEXT_TOLERANCE = 1;
/** Надписи наезжают друг на друга, если пересеклись больше чем на столько пикселей по обеим осям: поля строк не в счёт. */
const TEXT_OVERLAP = 4;

type Listed = Phaser.GameObjects.GameObject & {
  list?: Phaser.GameObjects.GameObject[];
  visible?: boolean;
  alpha?: number;
};

/**
 * Собирает видимые надписи, заходя внутрь контейнеров, и попутно проверяет кнопки:
 * надпись в контейнере с нажимаемой плашкой должна помещаться в эту плашку.
 */
function collectTexts(
  objects: Phaser.GameObjects.GameObject[],
  out: Phaser.GameObjects.Text[],
  issues: string[],
  /** Слой каждой надписи: сколько затемнений нарисовано до неё. */
  layers: Map<Phaser.GameObjects.Text, number>,
  depth: { layer: number },
): void {
  for (const object of objects as Listed[]) {
    if (object.visible === false || object.alpha === 0) continue;
    if (object.type === 'Text') {
      const text = object as Phaser.GameObjects.Text;
      if (text.text.trim() === '') continue;
      out.push(text);
      layers.set(text, depth.layer);
      continue;
    }
    // Затемнение окна: нажимаемый прямоугольник во весь экран или во всё поле. Всё нарисованное после него — новый слой.
    if (object.type === 'Rectangle' && object.input?.enabled) {
      const { width, height } = (object as Phaser.GameObjects.Rectangle).getBounds();
      if (width >= GAME_W && height >= GAME_H / 2) depth.layer++;
    }
    if (!object.list) continue;

    const inside: Phaser.GameObjects.Text[] = [];
    collectTexts(object.list, inside, issues, layers, depth);
    out.push(...inside);
    const hit = (object.list as Bounded[]).find((child) => child.input?.enabled && child.getBounds);
    const frame = hit?.getBounds?.();
    if (!hit || !frame) continue;
    for (const text of inside) {
      const { left, right, top, bottom } = text.getBounds();
      const fits =
        left >= frame.left - TEXT_TOLERANCE &&
        right <= frame.right + TEXT_TOLERANCE &&
        top >= frame.top - TEXT_TOLERANCE &&
        bottom <= frame.bottom + TEXT_TOLERANCE;
      if (!fits) {
        issues.push(
          `«${text.text}» (${Math.round(right - left)}×${Math.round(bottom - top)}) не помещается в кнопку ` +
            `«${hit.name || 'без имени'}» (${Math.round(frame.width)}×${Math.round(frame.height)})`,
        );
      }
    }
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
    textIssues() {
      const issues: string[] = [];
      for (const scene of game.scene.getScenes(true)) {
        const texts: Phaser.GameObjects.Text[] = [];
        const layers = new Map<Phaser.GameObjects.Text, number>();
        collectTexts(scene.children.list, texts, issues, layers, { layer: 0 });
        for (const text of texts) {
          const { left, right, top, bottom } = text.getBounds();
          if (left < -TEXT_TOLERANCE || right > GAME_W + TEXT_TOLERANCE || top < -TEXT_TOLERANCE || bottom > GAME_H + TEXT_TOLERANCE) {
            issues.push(`«${text.text}» выходит за край экрана (${scene.scene.key})`);
          }
        }
        for (let i = 0; i < texts.length; i++) {
          for (let j = i + 1; j < texts.length; j++) {
            const a = texts[i].getBounds();
            const b = texts[j].getBounds();
            const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            // Надпись под затемнением окна (пауза, итог боя, сундук) и надпись в самом окне друг другу не мешают.
            if (layers.get(texts[i]) !== layers.get(texts[j])) continue;
            if (overlapX > TEXT_OVERLAP && overlapY > TEXT_OVERLAP) {
              issues.push(`«${texts[i].text}» наезжает на «${texts[j].text}» (${scene.scene.key})`);
            }
          }
        }
      }
      return issues;
    },
    slotCenters() {
      const scene = game.scene.getScene(SceneKey.Game) as GameScene;
      return scene.slotCenters().map(([x, y]) => [x, y + BOARD_Y]);
    },
    catSlots() {
      return (game.scene.getScene(SceneKey.Game) as GameScene).catSlots();
    },
    buildingSlots() {
      return (game.scene.getScene(SceneKey.Game) as GameScene).buildingSlots();
    },
    addGold(gold) {
      const scene = game.scene.getScene(SceneKey.Game) as GameScene;
      scene.economy.gold += gold;
      scene.events.emit(GameEvent.Changed);
    },
    placeCat(slot, element, level) {
      const scene = game.scene.getScene(SceneKey.Game) as GameScene;
      scene.placeCat(slot, { element, level, cooldown: 0, ritual: 0, invested: 0 });
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
        return { ...common, hud: null, level: null, cats: 0, buildings: 0, buildRows: 0, sellZone: null, ghost: false, enemies: 0, march: 0, paused: false, result: null, tutorial: null };
      }
      const gameScene = game.scene.getScene(SceneKey.Game) as GameScene;
      const ui = game.scene.getScene(SceneKey.UI) as UIScene;
      const hud = gameScene.hudState();
      return { ...common, hud, level: gameScene.levelId, ...gameScene.fieldCounts(), buildRows: ui.buildPanelRows(), sellZone: ui.sellZoneText(), ghost: ui.holdingGhost(), paused, result: ui.resultShown(), tutorial: ui.tutorialStep() };
    },
  };
}
