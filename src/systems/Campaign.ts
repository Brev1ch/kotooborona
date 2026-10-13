/** Плитка уровня в меню кампании. */
export interface CampaignTile {
  /** Номер уровня в главе, с единицы. */
  number: number;
  /** null — уровня ещё нет в игре, плитка только обозначает место в главе. */
  levelId: string | null;
  unlocked: boolean;
  /** Лучший результат; 0 — уровень не пройден. */
  stars: number;
}

/**
 * Плитки главы по порядку. Первый уровень открыт всегда, следующий открывается,
 * когда предыдущий пройден хотя бы на одну звезду.
 */
export function campaignTiles(
  levelIds: readonly string[],
  chapterLevels: number,
  starsOf: (levelId: string) => number,
): CampaignTile[] {
  const tiles: CampaignTile[] = [];
  for (let i = 0; i < Math.max(chapterLevels, levelIds.length); i++) {
    const levelId = levelIds[i] ?? null;
    const unlocked = levelId !== null && (i === 0 || starsOf(levelIds[i - 1]) > 0);
    tiles.push({ number: i + 1, levelId, unlocked, stars: levelId === null ? 0 : starsOf(levelId) });
  }
  return tiles;
}
