// Единый масштаб тела котов для `npm run art`. Рамка картинки — плохая мерка: высокий хохолок или широкий символ на хвосте
// раздувают её, и тело такого кота выходит мельче. Мерка здесь — высота от низа лап до линии щёк (самой широкой строки головы,
// чуть ниже глаз): её не меняют ни хохолок, ни хвост, ни плащ. Глаза искать ненадёжно: у парового они закрыты, у каменного
// сливаются с бровями.

/** Голова — первая широкая часть сверху: уже такой доли высоты фигуры она быть не может (хохолок и уши уже). */
const HEAD_MIN_WIDTH = 0.4;
/** Голова кончилась, когда отрезок строки сузился до этой доли самой широкой строки над ним (шея). */
const NECK_NARROWING = 0.8;
/** Самая широкая полоса головы: строки не уже этой доли самой широкой. */
const PLATEAU = 0.95;
/** Ось кота ищется в этой нижней доле высоты: лапы и низ тела. */
const AXIS_BAND = 0.15;

/** Замер кота на исходнике, в его точках. */
export interface CatMeasure {
  /** Рамка непрозрачной фигуры, края включительно. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Ось тела: середина тела у лап. */
  axis: number;
  /** Линия щёк: середина самой широкой полосы головы (у мышей — уши). */
  cheek: number;
}

/**
 * Замер по маске непрозрачности (`opaque(x, y)`). Ширина строки — отрезок фигуры, проходящий через ось: отдельно висящий хвост
 * в неё не попадает. null — фигуры нет или голова не нашлась.
 */
export function measureCat(width: number, height: number, opaque: (x: number, y: number) => boolean): CatMeasure | null {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) return null;
  const figureH = bottom - top + 1;

  // В каждой нижней строке — середина самого длинного отрезка: тело и плащ длиннее хвоста, касающегося земли.
  let sum = 0;
  let count = 0;
  for (let y = Math.round(bottom - figureH * AXIS_BAND); y <= bottom; y++) {
    let best = 0;
    let middle = 0;
    for (let x = left; x <= right; x++) {
      if (!opaque(x, y)) continue;
      const start = x;
      while (x < right && opaque(x + 1, y)) x++;
      if (x - start + 1 > best) {
        best = x - start + 1;
        middle = (start + x) / 2;
      }
    }
    if (best === 0) continue;
    sum += middle;
    count++;
  }
  const axis = Math.round(sum / count);

  const runs: number[] = [];
  let widest = 0;
  let widestAt = -1;
  for (let y = top; y <= bottom; y++) {
    let run = 0;
    if (opaque(axis, y)) {
      let l = axis;
      let r = axis;
      while (l > left && opaque(l - 1, y)) l--;
      while (r < right && opaque(r + 1, y)) r++;
      run = r - l + 1;
    }
    runs.push(run);
    if (run > widest) {
      widest = run;
      widestAt = y;
    } else if (widest >= figureH * HEAD_MIN_WIDTH && run < widest * NECK_NARROWING) {
      break;
    }
  }
  if (widest < figureH * HEAD_MIN_WIDTH) return null;
  // Линия — середина самой широкой полосы головы: где у щёк или ушей самая широкая строка, зависит от их формы, а середина — нет.
  let from = widestAt;
  let to = widestAt;
  while (from > top && runs[from - 1 - top] >= widest * PLATEAU) from--;
  while (to + 1 - top < runs.length && runs[to + 1 - top] >= widest * PLATEAU) to++;
  const cheek = Math.round((from + to) / 2);
  return { left, right, top, bottom, axis, cheek };
}

/** Где кот встаёт в свою квадратную картинку: во сколько раз уменьшить исходник и куда поставить левый верхний угол фигуры. */
export interface CatPlacement {
  factor: number;
  x: number;
  y: number;
  /** Линия щёк и низ лап на готовой картинке — для превью. */
  cheekY: number;
  groundY: number;
}

/** Высота от лап до щёк: то, что у всех котов должно совпасть. */
const bodyHeight = (m: CatMeasure): number => m.bottom + 1 - m.cheek;

/**
 * Общий масштаб для всех фигур группы: высота от лап до щёк у всех одна, умноженная на `scale` фигуры (размер врага
 * и ручная поправка), ось — посередине квадратной картинки стороной `frame`, лапы — на нижнем краю. Высота выбрана
 * наибольшей, при которой каждая фигура целиком помещается в свой квадрат. Если сторона картинки растёт вместе со `scale`,
 * фигуры разного размера выходят подобными: так стоят враги, у которых крупнее только крыса, командир и король.
 */
export function placeFigures(figures: { measure: CatMeasure; scale?: number; frame: number }[]): CatPlacement[] {
  const limits = figures.map(({ measure: m, scale = 1, frame }) => {
    const half = Math.max(m.axis - m.left + 0.5, m.right + 0.5 - m.axis);
    const fit = Math.min(frame / (m.bottom + 1 - m.top), frame / 2 / half);
    return (bodyHeight(m) * fit) / scale;
  });
  const body = Math.min(...limits);
  return figures.map(({ measure: m, scale = 1, frame }) => {
    const factor = (body * scale) / bodyHeight(m);
    const groundY = frame;
    return {
      factor,
      x: frame / 2 - (m.axis + 0.5 - m.left) * factor,
      y: groundY - (m.bottom + 1 - m.top) * factor,
      cheekY: groundY - bodyHeight(m) * factor,
      groundY,
    };
  });
}

/** Коты: все в квадрате одной стороны `size`, `scale` — ручная поправка кота. */
export function placeCats(cats: { measure: CatMeasure; scale?: number }[], size: number): CatPlacement[] {
  return placeFigures(cats.map((cat) => ({ ...cat, frame: size })));
}
