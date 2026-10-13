import { describe, expect, it } from 'vitest';
import { levels, story } from '../data';
import type { StoryConfig } from '../data';
import { en } from '../i18n/en';
import { ru } from '../i18n/ru';
import { storyBefore } from './Story';

const config: StoryConfig = {
  scenes: [
    { id: 'intro', before: 'first', lines: [{ speaker: 'archmage', text: 'a' }] },
    { id: 'boss', before: 'last', lines: [{ speaker: 'king', text: 'b' }] },
  ],
};

describe('storyBefore', () => {
  it('перед уровнем со сценкой отдаёт её', () => {
    expect(storyBefore(config, 'first', false, new Set())?.id).toBe('intro');
    expect(storyBefore(config, 'last', false, new Set())?.id).toBe('boss');
  });

  it('перед уровнем без сценки ничего нет', () => {
    expect(storyBefore(config, 'middle', false, new Set())).toBeNull();
  });

  it('перед уже пройденным уровнем сценка не показывается', () => {
    expect(storyBefore(config, 'first', true, new Set())).toBeNull();
  });

  it('за один запуск игры сценка показывается один раз', () => {
    expect(storyBefore(config, 'first', false, new Set(['intro']))).toBeNull();
    expect(storyBefore(config, 'last', false, new Set(['intro']))?.id).toBe('boss');
  });
});

describe('сценки игры', () => {
  const first = levels.levels[0].id;
  const last = levels.levels[levels.levels.length - 1].id;

  it('есть перед главой и перед королём, по две-три реплики', () => {
    expect(story.scenes.map((scene) => scene.before)).toEqual([first, last]);
    for (const scene of story.scenes) {
      expect(scene.lines.length).toBeGreaterThanOrEqual(2);
      expect(scene.lines.length).toBeLessThanOrEqual(3);
    }
  });

  it('у каждой реплики есть текст и имя говорящего на обоих языках', () => {
    for (const scene of story.scenes) {
      for (const line of scene.lines) {
        for (const strings of [ru, en] as Record<string, string>[]) {
          expect(strings[line.text], line.text).toBeTruthy();
          expect(strings[`story.speaker.${line.speaker}`], line.speaker).toBeTruthy();
        }
      }
    }
  });

  it('реплики короткие: аудитория мобильная', () => {
    for (const scene of story.scenes) {
      for (const line of scene.lines) {
        expect((ru as Record<string, string>)[line.text].length).toBeLessThanOrEqual(110);
        expect((en as Record<string, string>)[line.text].length).toBeLessThanOrEqual(110);
      }
    }
  });
});
