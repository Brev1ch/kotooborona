import type { BuildingKind, BuildingLevel } from '../data/types';
import type { Piece } from '../entities/Building';
import type { BuildBlock } from '../systems/Buildings';
import type { UpcomingWave } from '../systems/Waves';

export const SceneKey = {
  Boot: 'Boot',
  Menu: 'Menu',
  Gear: 'Gear',
  Book: 'Book',
  Bestiary: 'Bestiary',
  Story: 'Story',
  Intro: 'Intro',
  Game: 'Game',
  UI: 'UI',
} as const;

/** Данные, с которыми запускаются Gear, Story, Game и UI. */
export interface LevelSceneData {
  levelId: string;
}

/** Данные сценки: без `storyId` показывается та, что положена перед уровнем. */
export interface StorySceneData extends LevelSceneData {
  storyId?: string;
  /** Куда после сценки, если не в бой: сценка после победы ведёт туда, куда игрок нажал на экране итога. */
  then?: { scene: string; data?: object };
}

/** События GameScene, на которые подписывается HUD. */
export const GameEvent = {
  Changed: 'changed',
  /** Игрок впервые получил гибрида; аргумент — его стихия. */
  Discovered: 'discovered',
  /** Уровень закончен; аргумент — LevelResult. */
  Finished: 'finished',
  /** Враг убит, награда уже в экономике; аргумент — RewardDrop. */
  Reward: 'reward',
  /** Игрок взял кота или строение, навёл на зону продажи или отпустил; аргумент — SellOffer или null. */
  SellOffer: 'sellOffer',
  /** Игрок ведёт пальцем взятого кота или строение; аргумент — DragGhost. */
  DragMove: 'dragMove',
  /** Игрок отпустил взятое; аргумент — true, если оно продано. */
  DragEnd: 'dragEnd',
  /** Игрок нажал на строение; аргумент — номер клетки. */
  BuildingTapped: 'buildingTapped',
} as const;

/** Взятый кот или строение и где сейчас палец, в координатах экрана. HUD рисует его поверх всего, включая нижнюю полосу. */
export interface DragGhost {
  piece: Piece;
  x: number;
  y: number;
}

/** Что держит игрок: сколько монет вернёт продажа и над зоной ли продажи палец. */
export interface SellOffer {
  gold: number;
  over: boolean;
}

/** Строение, которое можно поставить. */
export interface BuildOffer {
  kind: BuildingKind;
  cost: number;
  stats: BuildingLevel;
  /** Сколько таких уже стоит и сколько можно. */
  count: number;
  max: number;
  /** Что мешает строить, кроме монет; null — ничего. */
  block: BuildBlock | null;
  affordable: boolean;
}

/** Улучшение строения в клетке `slot`. */
export interface UpgradeOffer {
  slot: number;
  kind: BuildingKind;
  level: number;
  stats: BuildingLevel;
  /** null — строение уже на последнем уровне. */
  next: { cost: number; stats: BuildingLevel } | null;
  affordable: boolean;
}

/** Награда за врага: откуда монеты и кристаллы летят в HUD. Точка — в координатах поля. */
export interface RewardDrop {
  x: number;
  y: number;
  gold: number;
  crystals: number;
}

/** Срез состояния игры для HUD. */
export interface HudState {
  gold: number;
  crystals: number;
  summonCost: number;
  /** Сколько призывов по обычной цене осталось в этой волне и сколько их всего. */
  summonsLeft: number;
  summonLimit: number;
  /** Во сколько раз дороже следующий призыв; 1 — лимит ещё не исчерпан. */
  overLimitMult: number;
  canSummon: boolean;
  lives: number;
  wave: number;
  totalWaves: number;
  /** Скорость боя: 1 — обычная, больше — ускорение. */
  speed: number;
  /** Волна, до которой идёт пауза; null — волна уже идёт или волны кончились. */
  upcoming: UpcomingWave | null;
}

/** Состояние умения героя для кнопки в HUD. */
export interface MeteorState {
  ready: boolean;
  aiming: boolean;
  /** Секунды до готовности. */
  remaining: number;
  /** Доля прошедшей перезарядки от 0 до 1. */
  progress: number;
}

/** Итог уровня для экрана победы или поражения. */
export interface LevelResult {
  won: boolean;
  /** 0 при поражении. */
  stars: number;
  livesLost: number;
  wave: number;
  totalWaves: number;
  /** Рыбки за победу, уже зачисленные игроку; 0 при поражении. */
  fish: number;
  /** Этой победой заработан сундук за первое прохождение уровня на три звезды. */
  perfectChest: boolean;
  /** После победы найден малый сундук. */
  smallChest: boolean;
  /** После поражения доступен «Второй шанс»; `reviveLives` — сколько жизней он вернёт. */
  canRevive: boolean;
  reviveLives: number;
}

/** Кнопка «монеты за рекламу» в бою. */
export interface CoinAdState {
  ready: boolean;
  /** Секунды до следующего показа. */
  remaining: number;
  gold: number;
}
