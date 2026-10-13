import type { StoryConfig, StoryScene } from '../data/types';

/**
 * Сценка, которую нужно показать перед уровнем, или null.
 * Сценка идёт перед уровнем, пока он не пройден, и не чаще раза за запуск игры:
 * проигравший и зашедший снова её уже не увидит.
 */
export function storyBefore(
  config: StoryConfig,
  levelId: string,
  passed: boolean,
  seen: ReadonlySet<string>,
): StoryScene | null {
  if (passed) return null;
  return config.scenes.find((scene) => scene.before === levelId && !seen.has(scene.id)) ?? null;
}
