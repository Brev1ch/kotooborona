import type { ArtConfig, ArtImage, BackgroundId, BuildingKind, ElementId, EnemyTypeId, ItemsConfig, StorySpeaker } from '../data/types';
import { mainBonus, type Item } from './Items';

export type IconArt = 'coin' | 'crystal' | 'fish';

/** Имена картинок в манифесте `data/art.json`: по ним отрисовка ищет готовый арт. */
export const artId = {
  cat: (element: ElementId): string => `cat-${element}`,
  enemy: (type: EnemyTypeId): string => `enemy-${type}`,
  /** Щитоносец, у которого щит сломан. */
  shieldBroken: 'enemy-shield-broken',
  hero: 'hero',
  /** `level` — с единицы. */
  building: (kind: BuildingKind, level: number): string => `building-${kind}-${level}`,
  icon: (icon: IconArt): string => `icon-${icon}`,
  portrait: (speaker: StorySpeaker): string => `portrait-${speaker}`,
  background: (background: BackgroundId): string => `bg-${background}`,
};

/**
 * Картинка предмета: своя на каждую пару «слот и характерный для него главный бонус» и одна общая на слот —
 * для предметов, у которых главный бонус не из характерных. Стихию и редкость показывает игра: цветом камня и рамкой.
 */
export function itemArtId(config: ItemsConfig, item: Item): string {
  const main = mainBonus(config, item);
  const typical = main !== null && (config.pool[main.kind]?.main?.includes(item.slot) ?? false);
  return typical ? `item-${item.slot}-${main.kind}` : `item-${item.slot}`;
}

/** Готовая картинка вне атласа или сам атлас: файл в `public/assets/art` и его вес. */
interface ArtFile {
  file: string;
  bytes: number;
}

/**
 * Список готового арта, `public/assets/art/index.json`: его пишет `npm run art`.
 * Кадры атласа записаны так, как их читает Phaser, игра в них не заглядывает.
 */
export interface ArtIndex {
  atlases: Record<string, ArtFile & { frames: Record<string, object> }>;
  images: Record<string, ArtFile>;
}

export const EMPTY_ART_INDEX: ArtIndex = { atlases: {}, images: {} };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function readFile(raw: unknown): ArtFile | null {
  if (!isRecord(raw) || typeof raw.file !== 'string' || raw.file === '') return null;
  return { file: raw.file, bytes: typeof raw.bytes === 'number' ? raw.bytes : 0 };
}

/** Разбирает загруженный список: всё, что записано не так, пропускается — игра остаётся с рисунками кодом. */
export function readArtIndex(raw: unknown): ArtIndex {
  const index: ArtIndex = { atlases: {}, images: {} };
  if (!isRecord(raw)) return index;
  for (const [name, entry] of Object.entries(isRecord(raw.atlases) ? raw.atlases : {})) {
    const file = readFile(entry);
    if (!file || !isRecord(entry) || !isRecord(entry.frames)) continue;
    const frames: Record<string, object> = {};
    for (const [id, frame] of Object.entries(entry.frames)) if (isRecord(frame)) frames[id] = frame;
    index.atlases[name] = { ...file, frames };
  }
  for (const [id, entry] of Object.entries(isRecord(raw.images) ? raw.images : {})) {
    const file = readFile(entry);
    if (file) index.images[id] = file;
  }
  return index;
}

/** Что поставить в очередь загрузки: ключ текстуры, файл и, у атласа, его кадры. */
export interface ArtLoad extends ArtFile {
  key: string;
  frames?: Record<string, object>;
}

/** Где лежит готовая картинка и какого она размера на экране. */
export interface ArtRef {
  /** Ключ текстуры: атлас или отдельная картинка. */
  key: string;
  /** Кадр атласа; у отдельной картинки его нет. */
  frame?: string;
  /** Размер на экране в логических координатах. */
  width: number;
  height: number;
  /** Во сколько раз картинка крупнее, чем на экране. */
  scale: number;
}

const atlasKey = (name: string): string => `art:${name}`;

/** Манифест вместе со списком готового: какая картинка есть, откуда её брать и что когда грузить. */
export class ArtCatalog {
  private readonly byId = new Map<string, ArtImage>();

  constructor(
    private readonly manifest: ArtConfig,
    private readonly index: ArtIndex = EMPTY_ART_INDEX,
  ) {
    for (const image of manifest.images) this.byId.set(image.id, image);
  }

  /** Готовая картинка по имени из манифеста; null — её ещё нет, рисуем кодом. */
  find(id: string): ArtRef | null {
    const image = this.byId.get(id);
    if (!image) return null;
    const { scale } = this.manifest;
    const size = { width: image.width / scale, height: image.height / scale, scale };
    if (image.atlas) return this.index.atlases[image.atlas]?.frames[id] ? { key: atlasKey(image.atlas), frame: id, ...size } : null;
    return this.index.images[id] ? { key: id, ...size } : null;
  }

  /** Загрузка при запуске игры: все атласы и фон первого уровня (`firstBackground`) — то, что нужно меню и первому бою. */
  startupLoads(firstBackground: BackgroundId): ArtLoad[] {
    const atlases = Object.entries(this.index.atlases)
      .filter(([name]) => this.manifest.images.some((image) => image.atlas === name))
      .map(([name, { file, bytes, frames }]) => ({ key: atlasKey(name), file, bytes, frames }));
    return [...atlases, ...this.backgroundLoads(firstBackground)];
  }

  /** Загрузка при входе в уровень: его фон. */
  backgroundLoads(background: BackgroundId): ArtLoad[] {
    return this.manifest.images
      .filter((image) => image.background === background && !image.atlas && this.index.images[image.id])
      .map((image) => ({ key: image.id, ...this.index.images[image.id] }));
  }

  /** Ключи других фонов: при входе в уровень их текстуры освобождаются. */
  otherBackgroundKeys(background: BackgroundId): string[] {
    return this.manifest.images
      .filter((image) => image.background !== undefined && image.background !== background && !image.atlas)
      .map((image) => image.id);
  }
}
