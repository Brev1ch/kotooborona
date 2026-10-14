import { describe, expect, it } from 'vitest';
import { SOUND_FEEL } from '../src/feel';
import table from './sfx.mjs?raw';
import { readSounds } from './soundPicker.mjs';

describe('страница выбора звуков', () => {
  it('читает из таблицы SOUNDS каждое событие игры и его исходник', () => {
    const sounds = readSounds(table);
    expect(Object.keys(sounds).sort()).toEqual(Object.keys(SOUND_FEEL).sort());
    for (const src of Object.values(sounds)) expect(src).toMatch(/^[\w-]+\/.+\.ogg$/);
  });

  it('берёт src и у строк с подрезкой и громкостью', () => {
    const sample = "const SOUNDS = {\n  a: { src: 'p/x.ogg' },\n  b: { src: 'p/y.ogg', trim: 0.2, gain: 6 },\n};\nconst MUSIC = {};";
    expect(readSounds(sample)).toEqual({ a: 'p/x.ogg', b: 'p/y.ogg' });
  });
});
