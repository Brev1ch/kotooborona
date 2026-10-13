import { cats, type GearItem, type GearSlot } from '../data';
import { t, type StringKey } from '../i18n';
import { itemBonuses, type BonusLine } from '../systems/Loadout';

function bonusText(line: BonusLine): string {
  if (line.kind === 'summonChance') {
    return t('gear.bonus.summonChance', { ...line, element: t(`cat.${line.element}`) });
  }
  return t(`gear.bonus.${line.kind}`, { ...line });
}

/** Что даёт предмет, словами для игрока; у предмета без бонусов — «Без бонуса». */
export function describeGear(item: GearItem): string {
  const lines = itemBonuses(item, cats).map(bonusText);
  return lines.length > 0 ? lines.join(' · ') : t('gear.bonus.none');
}

/** Название предмета вместе со слотом: «Посох: Огненный». */
export function gearName(slot: GearSlot, id: string): string {
  return t('chest.item', { slot: t(`gear.slot.${slot}`), name: t(`gear.${slot}.${id}` as StringKey) });
}
