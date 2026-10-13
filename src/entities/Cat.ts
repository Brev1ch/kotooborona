import type { ElementId } from '../data/types';

export interface Cat {
  element: ElementId;
  level: number;
  /** Секунды до следующей атаки. */
  cooldown: number;
  /** Секунды до конца ритуала смешения; 0 — кот в строю. */
  ritual: number;
  /** Монеты, заплаченные за все призывы, из которых кот собран: от них считается цена продажи. */
  invested: number;
}
