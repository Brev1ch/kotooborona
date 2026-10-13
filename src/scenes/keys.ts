import type { UpcomingWave } from '../systems/Waves';

export const SceneKey = {
  Boot: 'Boot',
  Menu: 'Menu',
  Gear: 'Gear',
  Book: 'Book',
  Story: 'Story',
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
} as const;

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
