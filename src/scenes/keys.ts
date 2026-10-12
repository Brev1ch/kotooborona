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
