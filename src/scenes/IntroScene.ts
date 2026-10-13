import Phaser from 'phaser';
import { getLevel, type EnemyTypeId } from '../data';
import { t } from '../i18n';
import { progress } from '../progress';
import { introBefore } from '../systems/Story';
import { addEnemyCard } from './EnemyCard';
import { SceneKey, type LevelSceneData } from './keys';
import { storyForLevel } from './StoryScene';
import { fadeIn, fadeOut } from './transitions';

/** Уровни, перед которыми карточка уже показана за этот запуск игры. */
const seen = new Set<string>();

/** Враг, чью карточку нужно показать перед уровнем, или null: перед непройденным уровнем и не чаще раза за запуск игры. */
export function introForLevel(levelId: string): EnemyTypeId | null {
  return introBefore(getLevel(levelId), progress.stars(levelId) > 0, seen);
}

/** Экран, который идёт после снаряжения: сценка, затем карточка нового врага, затем бой. */
export function sceneBeforeBattle(levelId: string): string {
  if (storyForLevel(levelId)) return SceneKey.Story;
  return introForLevel(levelId) ? SceneKey.Intro : SceneKey.Game;
}

/** Карточка «Новый враг» перед уровнем, где он впервые выходит: кто это и чем его бить. Кнопка ведёт в бой. */
export class IntroScene extends Phaser.Scene {
  /** Уровень, перед которым показана карточка; читает смоук-проверка (src/smoke.ts). */
  levelId!: string;
  private enemy: EnemyTypeId | null = null;

  constructor() {
    super(SceneKey.Intro);
  }

  init(data: LevelSceneData): void {
    this.levelId = data.levelId;
    this.enemy = introForLevel(data.levelId);
  }

  create(): void {
    const data: LevelSceneData = { levelId: this.levelId };
    if (!this.enemy) {
      this.scene.start(SceneKey.Game, data);
      return;
    }
    seen.add(this.levelId);
    fadeIn(this);
    addEnemyCard(this, this.enemy, {
      heading: t('enemy.new'),
      button: t('gear.start'),
      onClose: () => fadeOut(this, () => this.scene.start(SceneKey.Game, data)),
    });
  }
}
