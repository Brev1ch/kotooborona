import type { BonusKind, CatsConfig, ElementId, GearConfig, GearSlot, ItemsConfig, LegendaryRule, Rarity } from '../data/types';
import { findGear, gearAtLevel, GEAR_SLOTS } from './Gear';
import { noBonuses, type GearBonuses } from './Loadout';

/** Редкости от простой к лучшей. */
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** Один бонус предмета; `value` — сила на первом уровне предмета (см. `BonusRule`). */
export interface ItemBonus {
  kind: BonusKind;
  value: number;
  /** Стихия у бонусов, привязанных к стихии. */
  element?: ElementId;
}

/** Предмет в инвентаре игрока. */
export interface Item {
  /** Уникален в пределах сохранения. */
  id: string;
  slot: GearSlot;
  rarity: Rarity;
  bonuses: ItemBonus[];
  /** id легендарного предмета из `legendaries`: его уникальное правило. */
  legendary?: string;
  level: number;
}

/** Убирает двоичную пыль вроде 0.30000000000000004. */
function tidy(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Случайный элемент списка по броску из [0, 1). */
function pick<T>(list: readonly T[], roll: number): T {
  return list[Math.min(Math.floor(roll * list.length), list.length - 1)];
}

/** Шансы редкостей обычного сундука: из правил редкостей. */
export function rarityChances(config: ItemsConfig): Record<Rarity, number> {
  const { common, rare, epic, legendary } = config.rarities;
  return { common: common.chance, rare: rare.chance, epic: epic.chance, legendary: legendary.chance };
}

/** Редкость по шансам из конфига; `chances` — свои шансы (у малого сундука). */
export function rollRarity(config: ItemsConfig, rng: () => number, chances: Record<Rarity, number> = rarityChances(config)): Rarity {
  let roll = rng();
  for (const rarity of RARITIES) {
    roll -= chances[rarity];
    if (roll < 0) return rarity;
  }
  return RARITIES[0];
}

/** Виды бонусов, которые могут выпасть в слоте у предмета этой редкости. */
export function bonusKinds(config: ItemsConfig, slot: GearSlot, rarity: Rarity): BonusKind[] {
  return (Object.keys(config.pool) as BonusKind[]).filter((kind) => {
    const rule = config.pool[kind];
    return rule.slots.includes(slot) && (!rule.rarities || rule.rarities.includes(rarity));
  });
}

/**
 * Новый предмет. Всё случайное берётся из `rng` в одном и том же порядке: редкость, слот (или легендарный предмет),
 * затем для каждого бонуса вид, значение и стихия — поэтому одно зерно даёт один и тот же предмет.
 * `fixed` задаёт редкость или слот заранее; тогда их бросок не делается.
 */
export function rollItem(
  config: ItemsConfig,
  cats: CatsConfig,
  rng: () => number,
  id: string,
  fixed: { rarity?: Rarity; slot?: GearSlot } = {},
): Item {
  const rarity = fixed.rarity ?? rollRarity(config, rng);
  let legendary: LegendaryRule | undefined;
  if (rarity === 'legendary') {
    const fitting = config.legendaries.filter((rule) => !fixed.slot || rule.slot === fixed.slot);
    if (fitting.length > 0) legendary = pick(fitting, rng());
  }
  const slot = legendary?.slot ?? fixed.slot ?? pick(GEAR_SLOTS, rng());

  const rule = config.rarities[rarity];
  const kinds = bonusKinds(config, slot, rarity);
  const elements = (Object.keys(cats.elements) as ElementId[]).filter((element) => !cats.elements[element].from);
  const bonuses: ItemBonus[] = [];
  // Один вид бонуса на предмете не повторяется.
  for (let i = 0; i < rule.bonuses && kinds.length > 0; i++) {
    const kind = kinds.splice(Math.min(Math.floor(rng() * kinds.length), kinds.length - 1), 1)[0];
    const { min, max, step, element } = config.pool[kind];
    const part = rule.roll[0] + rng() * (rule.roll[1] - rule.roll[0]);
    const value = tidy(Math.min(max, min + Math.round(((max - min) * part) / step) * step));
    bonuses.push(element ? { kind, value, element: pick(elements, rng()) } : { kind, value });
  }
  return { id, slot, rarity, bonuses, ...(legendary ? { legendary: legendary.id } : {}), level: 1 };
}

/** Сила бонуса на уровне предмета: растущие бонусы прибавляют долю `power` за уровень, но не выше потолка. */
export function bonusValue(config: ItemsConfig, bonus: ItemBonus, level: number): number {
  const rule = config.pool[bonus.kind];
  if (!rule.scales) return bonus.value;
  const growth = 1 + config.upgrade.power * (Math.max(1, Math.min(config.upgrade.maxLevel, level)) - 1);
  // У веса стихии растёт прибавка над единицей, а не сам вес.
  const grown = bonus.kind === 'summonChance' ? 1 + (bonus.value - 1) * growth : bonus.value * growth;
  const capped = rule.cap === undefined ? grown : Math.min(rule.cap, grown);
  return bonus.kind === 'gold' ? Math.round(capped) : tidy(capped);
}

/** Суммарный эффект надетых предметов на бой. Множители перемножаются, прибавки складываются. */
export function itemsBonuses(config: ItemsConfig, items: readonly Item[]): GearBonuses {
  const total = noBonuses();
  for (const item of items) {
    for (const bonus of item.bonuses) {
      const value = bonusValue(config, bonus, item.level);
      const { element } = bonus;
      switch (bonus.kind) {
        case 'summonChance':
          if (element) total.summonWeights[element] = (total.summonWeights[element] ?? 1) * value;
          break;
        case 'summonLimit':
          total.summonLimitBonus += value;
          break;
        case 'overLimitCost':
          total.overLimitCostMult *= 1 - value;
          break;
        case 'elementDamage':
          if (element) total.elementDamage[element] = (total.elementDamage[element] ?? 0) + value;
          break;
        case 'meteorCooldown':
          total.meteorCooldownMult *= 1 - value;
          break;
        case 'ritualTime':
          total.ritualTimeMult *= 1 - value;
          break;
        case 'gold':
          total.bonusGold += value;
          break;
        case 'crystals':
          total.bonusCrystals += value;
          break;
        case 'buildingIncome':
          total.buildingIncomeMult += value;
          break;
        case 'level2Chance':
          total.level2Chance += value;
          break;
      }
    }
    const unique = config.legendaries.find((rule) => rule.id === item.legendary);
    if (unique?.unique === 'freeSummon' && unique.every) {
      // Две такие мантии надеть нельзя, но на всякий случай действует более частое правило.
      total.freeSummonEvery = total.freeSummonEvery > 0 ? Math.min(total.freeSummonEvery, unique.every) : unique.every;
    }
    if (unique?.unique === 'burningGround' && unique.burnDps && unique.time) {
      total.meteorGround = { burnDps: unique.burnDps, time: unique.time };
    }
  }
  return total;
}

/** Сколько осколков даёт разбор предмета. */
export function salvageShards(config: ItemsConfig, item: Item): number {
  return config.rarities[item.rarity].shards;
}

/** Цена следующего уровня предмета в осколках и рыбках; null — прокачивать дальше некуда. */
export function upgradePrice(config: ItemsConfig, item: Item): { shards: number; fish: number } | null {
  const { maxLevel, shards, fish } = config.upgrade;
  if (item.level >= maxLevel) return null;
  // Уровней больше, чем цен в списке, — дальше действует последняя цена.
  const at = (list: number[]): number => list[Math.min(item.level, list.length) - 1] ?? 0;
  return { shards: at(shards), fish: at(fish) };
}

/** Редкость предмета, пришедшего из старого снаряжения: чем выше он был прокачан, тем она выше. */
const LEGACY_RARITY: readonly Rarity[] = ['common', 'rare', 'epic'];

/**
 * Предмет старого снаряжения (до инвентаря) в новом виде: те же бонусы той же силы, какой они были на его уровне.
 * Уровень нового предмета — первый: прежняя прокачка уже учтена в значениях и в редкости. null — такого предмета не было.
 */
export function legacyItem(gear: GearConfig, slot: GearSlot, legacyId: string, level: number, id: string): Item | null {
  const base = findGear(gear, slot, legacyId);
  if (!base) return null;
  const stats = gearAtLevel(base, level);
  const bonuses: ItemBonus[] = [];
  if (base.element && stats.summonWeight !== undefined && stats.summonWeight !== 1) {
    bonuses.push({ kind: 'summonChance', value: stats.summonWeight, element: base.element });
  }
  if (stats.overLimitCostMult !== undefined) bonuses.push({ kind: 'overLimitCost', value: tidy(1 - stats.overLimitCostMult) });
  if (stats.meteorCooldownMult !== undefined) bonuses.push({ kind: 'meteorCooldown', value: tidy(1 - stats.meteorCooldownMult) });
  if (stats.ritualTimeMult !== undefined) bonuses.push({ kind: 'ritualTime', value: tidy(1 - stats.ritualTimeMult) });
  if (stats.bonusCrystals) bonuses.push({ kind: 'crystals', value: stats.bonusCrystals });
  if (stats.bonusGold) bonuses.push({ kind: 'gold', value: stats.bonusGold });
  const rarity = LEGACY_RARITY[Math.min(Math.max(1, Math.floor(level)), LEGACY_RARITY.length) - 1];
  return { id, slot, rarity, bonuses, level: 1 };
}

/** Бонус в виде, готовом для описания игроку: доли переведены в целые проценты. */
export interface ShownBonus {
  kind: BonusKind;
  /** Проценты у долей и шансов, штуки у монет, кристаллов и лимита. */
  amount: number;
  element?: ElementId;
}

/** Что бонус даёт на уровне предмета, числом для игрока. У шанса стихии — шанс призвать её кота в процентах. */
export function shownBonus(config: ItemsConfig, cats: CatsConfig, bonus: ItemBonus, level: number): ShownBonus {
  const value = bonusValue(config, bonus, level);
  const element = bonus.element ? { element: bonus.element } : {};
  switch (bonus.kind) {
    case 'summonChance': {
      // Призываются только базовые стихии; у всех, кроме стихии предмета, вес 1.
      const others = Object.values(cats.elements).filter((entry) => !entry.from).length - 1;
      return { kind: bonus.kind, amount: Math.round((value / (value + others)) * 100), ...element };
    }
    case 'summonLimit':
    case 'gold':
    case 'crystals':
      return { kind: bonus.kind, amount: value };
    default:
      return { kind: bonus.kind, amount: Math.round(value * 100), ...element };
  }
}
