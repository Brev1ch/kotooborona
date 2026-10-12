import type { ElementId } from '../data/types';

export interface Cat {
  element: ElementId;
  level: number;
  /** Секунды до следующей атаки. */
  cooldown: number;
  /** Секунды до конца ритуала смешения; 0 — кот в строю. */
  ritual: number;
}
