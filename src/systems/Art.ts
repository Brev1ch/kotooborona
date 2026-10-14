import type { BuildingKind, ElementId, EnemyTypeId, ItemsConfig, StorySpeaker } from '../data/types';
import { mainBonus, type Item } from './Items';

/** Виды фона кнопки: обычная, главная и кнопка наградной рекламы. */
export type ButtonArt = 'normal' | 'primary' | 'ad';
export type IconArt = 'coin' | 'crystal' | 'fish';

/** Имена картинок в манифесте `data/art.json`: по ним отрисовка ищет готовый арт. */
export const artId = {
  cat: (element: ElementId): string => `cat-${element}`,
  enemy: (type: EnemyTypeId): string => `enemy-${type}`,
  hero: 'hero',
  /** `level` — с единицы. */
  building: (kind: BuildingKind, level: number): string => `building-${kind}-${level}`,
  icon: (icon: IconArt): string => `icon-${icon}`,
  button: (kind: ButtonArt): string => `button-${kind}`,
  portrait: (speaker: StorySpeaker): string => `portrait-${speaker}`,
  background: (levelId: string): string => `bg-${levelId}`,
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
