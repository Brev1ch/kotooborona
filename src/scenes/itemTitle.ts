import { gear } from '../data';
import { t, type StringKey } from '../i18n';
import { itemName, type Item } from '../systems/Items';

// Отдельно от `itemText.ts`: здесь нет Phaser, поэтому названия проверяются тестами.

/**
 * Название предмета: у легендарного — своё имя, у остальных — по главному бонусу («Огненный посох», «Мантия бережливости»),
 * у эпических и легендарных — с приставкой редкости. Предмет без бонусов называется по слоту.
 * `short` — без приставки: для тесных мест, где редкость и так видна по цвету рамки.
 */
export function itemTitle(item: Item, short = false): string {
  const name = itemName(gear.items, item);
  if (name.legendary) return t(`item.legendary.${name.legendary}` as StringKey);
  if (!name.kind) return t(`gear.slot.${name.slot}`);
  const base = t(`item.name.${name.kind}`, {
    slot: t(`item.slotWord.${name.slot}`),
    element: name.element ? t(`item.element.${name.element}` as StringKey) : '',
    of: name.element ? t(`item.elementOf.${name.element}` as StringKey) : '',
  });
  const title = name.prefix && !short ? `${t(`item.prefix.${name.prefix}.${name.slot}` as StringKey)} ${base}` : base;
  return title.charAt(0).toLocaleUpperCase() + title.slice(1);
}
