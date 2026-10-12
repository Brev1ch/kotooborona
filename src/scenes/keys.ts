import type { UpcomingWave } from '../systems/Waves';

export const SceneKey = {
  Boot: 'Boot',
  Menu: 'Menu',
  Game: 'Game',
  UI: 'UI',
} as const;

/** Данные, с которыми запускаются Game и UI. */
export interface LevelSceneData {
  levelId: string;
}

/** События GameScene, на которые подписывается HUD. */
export const GameEvent = {
  Changed: 'changed',
  /** Игрок впервые получил гибрида; аргумент — его стихия. */
  Discovered: 'discovered',
  /** Уровень закончен; аргумент — LevelResult. */
  Finished: 'finished',
} as const;

/** Срез состояния игры для HUD. */
export interface HudState {
  gold: number;
  crystals: number;
  summonCost: number;
  canSummon: boolean;
  lives: number;
  wave: number;
  totalWaves: number;
  /** Волна, до которой идёт пауза; null — волна уже идёт или волны кончились. */
  upcoming: UpcomingWave | null;
}

/** Итог уровня для экрана победы или поражения. */
export interface LevelResult {
  won: boolean;
  /** 0 при поражении. */
  stars: number;
  livesLost: number;
  wave: number;
  totalWaves: number;
}
