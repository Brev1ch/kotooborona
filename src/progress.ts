import { cats, gear } from './data';
import { platform } from './platform';
import { Progress } from './systems/Progress';

/** Прогресс игрока. Загружается в BootScene до первого экрана. */
export const progress = new Progress(platform, { gear, cats });

// Вкладку могут закрыть, не дав отложенной записи уйти.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) progress.flush();
});
