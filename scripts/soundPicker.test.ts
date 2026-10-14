import { describe, expect, it } from 'vitest';
import { SOUND_FEEL } from '../src/feel';
import table from './sfx.mjs?raw';
import { readSounds } from './soundPicker.mjs';

describe('страница выбора звуков', () => {
  it('читает из таблицы SOUNDS каждое событие игры и его исходник', () => {
    const sounds = readSounds(table);
    const withFile = Object.entries(SOUND_FEEL).filter(([, rule]) => !('variants' in rule));
    expect(Object.keys(sounds).sort()).toEqual(withFile.map(([id]) => id).sort());
    for (const src of Object.values(sounds)) expect(src).toMatch(/^[\w-]+\/.+\.(ogg|wav)$/);
  });

  it('берёт src и у строк с подрезкой и громкостью', () => {
    const sample = "const SOUNDS = {\n  a: { src: 'p/x.ogg' },\n  b: { src: 'p/y.ogg', trim: 0.2, gain: 6 },\n};\nconst MUSIC = {};";
    expect(readSounds(sample)).toEqual({ a: 'p/x.ogg', b: 'p/y.ogg' });
  });
});
