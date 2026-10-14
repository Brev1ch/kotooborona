import { describe, expect, it } from 'vitest';
import { enemies, levels, story } from '../data';
import type { EnemiesConfig, LevelConfig, StoryConfig } from '../data';
import { en } from '../i18n/en';
import { ru } from '../i18n/ru';
import { appearsOn, firstAppearance, introBefore, storyAfter, storyBefore } from './Story';

const config: StoryConfig = {
  scenes: [
    { id: 'intro', before: 'first', lines: [{ speaker: 'archmage', text: 'a' }] },
    { id: 'boss', before: 'last', lines: [{ speaker: 'king', text: 'b' }] },
    { id: 'won', after: 'last', lines: [{ speaker: 'mouse', text: 'c' }] },
  ],
};

describe('storyBefore и storyAfter', () => {
  it('перед уровнем со сценкой отдаёт её — всегда, и при повторном прохождении', () => {
    expect(storyBefore(config, 'first')?.id).toBe('intro');
    expect(storyBefore(config, 'last')?.id).toBe('boss');
    expect(storyBefore(config, 'first')?.id).toBe('intro');
  });

  it('перед уровнем без сценки ничего нет', () => {
    expect(storyBefore(config, 'middle')).toBeNull();
  });

  it('сценка «после» — только у своего уровня и не путается со сценкой «перед»', () => {
    expect(storyAfter(config, 'last')?.id).toBe('won');
    expect(storyAfter(config, 'first')).toBeNull();
  });
});

describe('сценки игры', () => {
  const last = levels.levels[levels.levels.length - 1].id;

  it('сценка перед каждым уровнем главы и после победы на 5-м и 10-м, по 3–6 реплик', () => {
    expect(story.scenes.filter((scene) => scene.before).map((scene) => scene.before)).toEqual(levels.levels.map((level) => level.id));
    expect(story.scenes.filter((scene) => scene.after).map((scene) => scene.after)).toEqual([levels.levels[4].id, last]);
    for (const scene of story.scenes) {
      expect(scene.before === undefined, scene.id).not.toBe(scene.after === undefined);
      expect(scene.lines.length, scene.id).toBeGreaterThanOrEqual(3);
      expect(scene.lines.length, scene.id).toBeLessThanOrEqual(6);
    }
    expect(new Set(story.scenes.map((scene) => scene.id)).size).toBe(story.scenes.length);
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

describe('карточка «Новый враг»', () => {
  const types = { types: { mouse: {}, rat: { fromWave: 2 }, boots: {}, ninja: { fromWave: 9 }, boss: {}, king: {} } } as unknown as EnemiesConfig;
  const level = (id: string, overrides: Partial<LevelConfig> = {}): LevelConfig =>
    ({ id, waves: 6, bossWaves: [], enemies: {}, ...overrides }) as LevelConfig;
  const chapter = [
    level('a', { enemies: { rat: 0.2 } }),
    level('b', { enemies: { rat: 0.2, boots: 0.1 }, intro: 'boots', bossWaves: [6] }),
    level('c', { enemies: { boots: 0.1, ninja: 0.2 } }),
    level('d', { enemies: { ninja: 0.2 }, waves: 9, kingWave: 9, intro: 'ninja' }),
  ];

  it('перед уровнем с новым врагом отдаёт его', () => {
    expect(introBefore(chapter[1], false, new Set())).toBe('boots');
  });

  it('перед уровнем без нового врага ничего нет', () => {
    expect(introBefore(chapter[0], false, new Set())).toBeNull();
  });

  it('перед пройденным уровнем карточки нет', () => {
    expect(introBefore(chapter[1], true, new Set())).toBeNull();
  });

  it('за один запуск игры карточка уровня показывается один раз', () => {
    expect(introBefore(chapter[1], false, new Set(['b']))).toBeNull();
    expect(introBefore(chapter[1], false, new Set(['a']))).toBe('boots');
  });

  it('враг выходит там, где у него есть доля и до его волны уровень доживает', () => {
    expect(appearsOn(chapter[1], types, 'boots')).toBe(true);
    expect(appearsOn(chapter[0], types, 'boots')).toBe(false);
    // У ниндзя доля есть, но выходит он с девятой волны, а волн шесть.
    expect(appearsOn(chapter[2], types, 'ninja')).toBe(false);
    expect(appearsOn(chapter[3], types, 'ninja')).toBe(true);
  });

  it('командир выходит на уровне с его волнами, король — с волной короля, мышь — везде', () => {
    expect(appearsOn(chapter[0], types, 'boss')).toBe(false);
    expect(appearsOn(chapter[1], types, 'boss')).toBe(true);
    expect(appearsOn(chapter[2], types, 'king')).toBe(false);
    expect(appearsOn(chapter[3], types, 'king')).toBe(true);
    expect(appearsOn(chapter[2], types, 'mouse')).toBe(true);
  });

  it('первое появление — первый такой уровень по порядку', () => {
    expect(firstAppearance(chapter, types, 'rat')).toBe('a');
    expect(firstAppearance(chapter, types, 'boots')).toBe('b');
    expect(firstAppearance(chapter, types, 'ninja')).toBe('d');
    expect(firstAppearance(chapter.slice(0, 3), types, 'king')).toBeNull();
  });

  it('в данных игры карточка каждого уровня указывает на врага, который впервые выходит именно здесь', () => {
    for (const { id, intro } of levels.levels) {
      if (intro) expect(firstAppearance(levels.levels, enemies, intro), `${id}: ${intro}`).toBe(id);
    }
  });

  it('в данных игры у каждого врага с особенностью, вышедшего в главе, есть карточка', () => {
    const plain = ['mouse', 'rat', 'boss'];
    for (const type of Object.keys(enemies.types) as (keyof typeof enemies.types)[]) {
      const first = firstAppearance(levels.levels, enemies, type);
      if (first === null || plain.includes(type)) continue;
      expect(levels.levels.find((entry) => entry.id === first)?.intro, type).toBe(type);
    }
  });
});
