import { describe, expect, it } from 'vitest';
import { measureCat, placeCats, placeFigures } from './CatFit';

type Box = [left: number, top: number, right: number, bottom: number];

/** Кот из прямоугольников: хохолок, голова, шея и тело, хвост. Края включительно. */
function drawCat(boxes: Box[]): (x: number, y: number) => boolean {
  return (x, y) => boxes.some(([l, t, r, b]) => x >= l && x <= r && y >= t && y <= b);
}

/** Голова 40..59 на строках 30..49, шея и тело уже, лапы на строке 99; ось — x = 50. */
const BODY: Box[] = [
  [30, 30, 69, 49],
  [40, 50, 59, 99],
];

describe('замер кота', () => {
  it('ось у лап, линия щёк — середина самой широкой полосы головы, низ — лапы', () => {
    const m = measureCat(120, 120, drawCat(BODY));
    expect(m).toEqual({ left: 30, right: 69, top: 30, bottom: 99, axis: 50, cheek: 40 });
  });

  it('хохолок и отдельно висящий хвост не меняют ни оси, ни линии щёк', () => {
    const m = measureCat(120, 120, drawCat([...BODY, [45, 0, 54, 29], [80, 40, 110, 70], [70, 90, 80, 95]]));
    expect(m?.axis).toBe(50);
    expect(m?.cheek).toBe(40);
    expect([m?.top, m?.right]).toEqual([0, 110]);
  });

  it('широкий плащ ниже шеи — не голова', () => {
    const m = measureCat(120, 120, drawCat([...BODY, [20, 70, 79, 99]]));
    expect(m?.cheek).toBe(40);
  });

  it('пустая картинка — замера нет', () => {
    expect(measureCat(10, 10, () => false)).toBeNull();
  });
});

describe('общий масштаб котов', () => {
  const plain = measureCat(120, 120, drawCat(BODY))!;
  const tall = measureCat(120, 120, drawCat([...BODY, [45, 0, 54, 29]]))!;

  it('высота от лап до щёк у всех одна, лапы на нижнем краю, ось посередине', () => {
    const [a, b] = placeCats([{ measure: plain }, { measure: tall }], 120);
    for (const p of [a, b]) {
      expect(p.groundY).toBe(120);
      expect(p.groundY - p.cheekY).toBeCloseTo(a.groundY - a.cheekY);
    }
    // Ось x = 50 (середина точки — 50,5) встаёт в середину квадрата.
    expect(a.x + (50.5 - plain.left) * a.factor).toBeCloseTo(60);
  });

  it('самый высокий кот целиком помещается, и по нему подобран масштаб', () => {
    const [, b] = placeCats([{ measure: plain }, { measure: tall }], 120);
    expect(b.y).toBeCloseTo(0);
    expect(b.y + (tall.bottom + 1 - tall.top) * b.factor).toBeCloseTo(120);
  });

  it('ручная поправка меняет только своего кота и не выпускает его за края', () => {
    const [a, b] = placeCats([{ measure: plain }, { measure: plain, scale: 0.9 }], 120);
    expect((b.groundY - b.cheekY) / (a.groundY - a.cheekY)).toBeCloseTo(0.9);
    const [big] = placeCats([{ measure: plain, scale: 1.2 }], 120);
    expect(big.y).toBeGreaterThanOrEqual(-1e-9);
  });
});

describe('общий масштаб фигур разного размера', () => {
  const plain = measureCat(120, 120, drawCat(BODY))!;

  it('фигура вдвое крупнее в квадрате вдвое больше — та же фигура, увеличенная вдвое', () => {
    const [small, big] = placeFigures([
      { measure: plain, frame: 60 },
      { measure: plain, scale: 2, frame: 120 },
    ]);
    expect(big.factor).toBeCloseTo(small.factor * 2);
    expect(big.groundY - big.cheekY).toBeCloseTo((small.groundY - small.cheekY) * 2);
    expect(big.x).toBeCloseTo(small.x * 2);
  });

  it('масштаб подобран по фигуре, которой теснее всего в своём квадрате', () => {
    const tall = measureCat(120, 120, drawCat([...BODY, [45, 0, 54, 29]]))!;
    const [, b] = placeFigures([
      { measure: plain, frame: 60 },
      { measure: tall, scale: 2, frame: 120 },
    ]);
    expect(b.y).toBeCloseTo(0);
  });
});
