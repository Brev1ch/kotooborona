import Phaser from 'phaser';
import { art } from '../art';
import { cats, elementColor, gear, type GearSlot, type Rarity } from '../data';
import { t } from '../i18n';
import { COLORS } from '../layout';
import { itemArtId } from '../systems/Art';
import { shownBonus, type Item } from '../systems/Items';

export { itemTitle } from './itemTitle';

/** Цвет редкости: числом для рамок и строкой для текста. */
const RARITY_FILL: Record<Rarity, number> = {
  common: COLORS.rarityCommon,
  rare: COLORS.rarityRare,
  epic: COLORS.rarityEpic,
  legendary: COLORS.rarityLegendary,
};

export function rarityFill(rarity: Rarity): number {
  return RARITY_FILL[rarity];
}

export function rarityColor(rarity: Rarity): string {
  return `#${RARITY_FILL[rarity].toString(16).padStart(6, '0')}`;
}

/** «Редкость: эпическая · Ур. 2». */
export function itemRarityLine(item: Item): string {
  return `${t('item.rarity', { rarity: t(`rarity.${item.rarity}`) })} · ${t('gear.level', { level: item.level })}`;
}

/** Что даёт предмет на своём уровне, по строке на бонус; уникальное правило легендарного — последней строкой. */
export function itemLines(item: Item): string[] {
  const lines = item.bonuses.map((bonus) => {
    const shown = shownBonus(gear.items, cats, bonus, item.level);
    return t(`item.bonus.${shown.kind}`, { amount: shown.amount, element: shown.element ? t(`cat.${shown.element}`) : '' });
  });
  const unique = gear.items.legendaries.find((rule) => rule.id === item.legendary);
  if (unique) lines.push(t(`item.unique.${unique.unique}`, { time: unique.time ?? 0, every: unique.every ?? 0 }));
  return lines.length > 0 ? lines : [t('item.noBonus')];
}

/** Цвет камня на значке предмета: стихия его бонуса, а без неё — цвет редкости. По нему предметы одного слота различаются в сетке. */
export function itemAccent(item: Item): number {
  const element = item.bonuses.find((bonus) => bonus.element)?.element;
  return element ? elementColor(element) : rarityFill(item.rarity);
}

/** Камень стихии на картинке предмета: доля её размера и сдвиг от центра к правому нижнему углу. */
const GEM = { radius: 0.17, offset: 0.3 };

/**
 * Значок предмета в квадрате `size` с центром в (x, y): готовая картинка по слоту и главному бонусу, а пока её нет — значок слота.
 * Стихию показывает цвет камня: на рисунке кодом это его часть, на готовой картинке — камень в углу.
 * `artSize` — размер готовой картинки, если ей можно занять больше места, чем значку.
 */
export function addItemGlyph(scene: Phaser.Scene, item: Item, x: number, y: number, size: number, artSize = size): Phaser.GameObjects.GameObject {
  const glyph = scene.add.graphics({ x, y });
  const picture = art.addIcon(scene, itemArtId(gear.items, item), 0, 0, artSize);
  if (!picture) {
    drawSlotGlyph(glyph, item.slot, size, rarityFill(item.rarity), itemAccent(item));
    return glyph;
  }
  const element = item.bonuses.find((bonus) => bonus.element)?.element;
  if (element) {
    glyph.fillStyle(COLORS.bg);
    glyph.fillCircle(artSize * GEM.offset, artSize * GEM.offset, artSize * GEM.radius + 1.5);
    glyph.fillStyle(elementColor(element));
    glyph.fillCircle(artSize * GEM.offset, artSize * GEM.offset, artSize * GEM.radius);
  }
  return scene.add.container(x, y, [picture, glyph.setPosition(0, 0)]);
}

/**
 * Значок слота вокруг начала координат, вписанный в квадрат `size`: посох, мантия или амулет.
 * `accent` — цвет камня: навершия посоха, застёжки мантии, подвески амулета.
 */
export function drawSlotGlyph(g: Phaser.GameObjects.Graphics, slot: GearSlot, size: number, color: number, accent = color): void {
  const r = size / 2;
  g.lineStyle(Math.max(2, size * 0.1), color);
  g.fillStyle(color);
  if (slot === 'staff') {
    g.lineBetween(-r * 0.6, r * 0.9, r * 0.35, -r * 0.45);
    g.fillStyle(accent);
    g.fillCircle(r * 0.5, -r * 0.6, r * 0.36);
  } else if (slot === 'mantle') {
    g.fillTriangle(0, -r * 0.9, -r * 0.85, r * 0.9, r * 0.85, r * 0.9);
    g.fillStyle(accent);
    g.fillCircle(0, -r * 0.75, r * 0.3);
  } else {
    g.strokeCircle(0, -r * 0.25, r * 0.6);
    g.fillStyle(accent);
    g.fillCircle(0, r * 0.55, r * 0.38);
  }
}
