import { describe, expect, it } from 'vitest';
import saved from '../../docs/ART_LIST.md?raw';
import indexJson from '../../public/assets/art/index.json';
import { art } from '../data';
import type { ArtConfig } from '../data/types';
import { ArtCatalog, readArtIndex } from './Art';
import { artList } from './ArtList';

const manifest: ArtConfig = {
  scale: 2,
  enemyFrame: 64,
  images: [
    { id: 'cat-fire', file: 'cats/fire.png', width: 96, height: 116, group: 'cats', use: 'Огненный кот', atlas: 'units' },
    { id: 'cat-water', file: 'cats/water.png', width: 96, height: 116, group: 'cats', use: 'Водный кот', atlas: 'units' },
    { id: 'bg-forest', file: 'backgrounds/forest.png', width: 720, height: 1080, group: 'backgrounds', use: 'Фон', background: 'forest' },
  ],
};

describe('список арта', () => {
  it('таблица по группам: файл, размер, назначение и отметка готовности', () => {
    const list = artList(manifest, new Set(['cat-water']));
    expect(list).toContain('Готово картинок: 1 из 3.');
    expect(list).toContain('## Коты (1 из 2)');
    expect(list).toContain('| `cats/fire.png` | 96×116 | Огненный кот | нет |');
    expect(list).toContain('| `cats/water.png` | 96×116 | Водный кот | да |');
    expect(list).toContain('## Фоны уровней (0 из 1)');
    expect(list).toContain('| `backgrounds/forest.png` | 720×1080 | Фон | нет |');
  });

  it('групп без картинок в списке нет, порядок групп постоянный', () => {
    const list = artList(manifest, new Set());
    expect(list).not.toContain('## Враги');
    expect(list.indexOf('## Коты')).toBeLessThan(list.indexOf('## Фоны уровней'));
  });

  it('в списке каждая картинка манифеста игры', () => {
    const list = artList(art, new Set());
    for (const image of art.images) expect(list).toContain(`| \`${image.file}\` | ${image.width}×${image.height} |`);
  });

  it('docs/ART_LIST.md не отстал от манифеста и готового арта: иначе запустить npm run art', () => {
    const catalog = new ArtCatalog(art, readArtIndex(indexJson));
    const ready = new Set(art.images.filter((image) => catalog.find(image.id)).map((image) => image.id));
    expect(saved).toBe(artList(art, ready));
  });
});
