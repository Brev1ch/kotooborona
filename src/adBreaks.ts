import { ads } from './data';
import { platform } from './platform';
import { InterstitialSchedule } from './systems/Ads';

function now(): number {
  return performance.now() / 1000;
}

const schedule = new InterstitialSchedule(ads.interstitial, now());

/** Реклама для сцен: показ идёт через площадку, а частоту полноэкранной держит расписание. */
export const adBreaks = {
  /** Ролик с наградой. Возвращает true, если игрок досмотрел и награду можно выдать. */
  async rewarded(): Promise<boolean> {
    const rewarded = await platform.showRewarded();
    // Только что посмотрел ролик — полноэкранную следом не показываем.
    if (rewarded) schedule.shown(now());
    return rewarded;
  },

  /** Полноэкранная реклама между уровнями; если с прошлой рекламы прошло мало времени, сразу возвращается. */
  async betweenLevels(): Promise<void> {
    if (!schedule.due(now())) return;
    await platform.showInterstitial();
    schedule.shown(now());
  },
};
