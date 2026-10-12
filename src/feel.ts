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

/** Ритуал смешения: полупрозрачный кот, кольцо прогресса и вспышка в конце. */
export const RITUAL_FEEL = {
  catAlpha: 0.55,
  ringRadius: 30,
  ringLineWidth: 3,
  ringTrackAlpha: 0.25,
  revealMs: 160,
  flashRadius: 30,
  flashAlpha: 0.9,
  flashScale: 1.4,
  flashMs: 320,
  popScale: 1.25,
  popMs: 260,
  popEase: 'Back.easeOut',
};

/** Подпись над клеткой: кто получится при слиянии. */
export const HINT_FEEL = {
  offsetY: 3,
};

/** Уведомление об открытии нового кота. */
export const BANNER_FEEL = {
  slide: 12,
  showMs: 220,
  showEase: 'Cubic.easeOut',
  holdMs: 2400,
  hideMs: 300,
};

/** Счётчик в HUD вздрагивает, когда значение меняется. */
export const STAT_FEEL = {
  pulseScale: 1.3,
  pulseMs: 110,
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

/** Враги на дороге. */
export const ENEMY_FEEL = {
  hpBarHeight: 4,
  hpBarGap: 5,
  hpBackAlpha: 0.5,
  /** Враг прошёл в ворота: поле вздрагивает. */
  leakShakeMs: 140,
  leakShakeIntensity: 0.006,
};

/** Объявление следующей волны. */
export const ANNOUNCE_FEEL = {
  showMs: 200,
  hideMs: 200,
  bgAlpha: 0.8,
};

export const BUTTON_FEEL = {
  pressScale: 0.94,
  pressMs: 70,
};
