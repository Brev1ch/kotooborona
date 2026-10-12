import type { ElementId } from '../data/types';
import type { Enemy } from './Enemy';

export interface Projectile {
  x: number;
  y: number;
  target: Enemy;
  damage: number;
  element: ElementId;
}
