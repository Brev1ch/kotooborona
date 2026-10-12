// Длительности (мс) и параметры анимаций: всё, что подкручивается «по ощущениям».

export const CAT_FEEL = {
  spawnMs: 280,
  spawnEase: 'Back.easeOut',
  /** Кот в руке. */
  liftMs: 90,
  liftScale: 1.15,
  liftEase: 'Quad.easeOut',
  /** Переезд в пустую клетку и посадка взятого кота при обмене. */
  moveMs: 120,
  /** Путь второго кота при обмене местами. */
  swapMs: 180,
  /** Возврат на место, если отпустили мимо. */
  returnMs: 220,
  settleEase: 'Cubic.easeOut',
};

export const DRAG_FEEL = {
  rangeFillAlpha: 0.06,
  rangeLineAlpha: 0.3,
  rangeLineWidth: 1,
  highlightLineWidth: 2.5,
};

export const MERGE_FEEL = {
  /** Сколько коты стягиваются в точку; после этого появляются новый кот и кольцо. */
  absorbMs: 130,
  absorbScale: 0.2,
  absorbEase: 'Cubic.easeIn',
  ringMs: 450,
  ringFrom: 20,
  ringTo: 68,
  ringLineWidth: 3,
  ringEase: 'Cubic.easeOut',
};

/** Всплывающая надпись над клеткой. */
export const TOAST_FEEL = {
  offsetY: 6,
  rise: 18,
  riseMs: 250,
  riseEase: 'Cubic.easeOut',
  holdMs: 700,
  fadeMs: 250,
};

export const BUTTON_FEEL = {
  pressScale: 0.94,
  pressMs: 70,
};
