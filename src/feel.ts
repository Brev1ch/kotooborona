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
  /** Попадание: враг вздрагивает. */
  hitScale: 1.25,
  hitMs: 70,
  /** Щит принял удар. */
  blockScale: 1.6,
  blockMs: 110,
  deathMs: 180,
  deathScale: 0.3,
};

/** Метки эффектов на враге: кольцо замедления, точки огня и яда. */
export const STATUS_FEEL = {
  /** Замедление сильнее этого рисуется как заморозка. */
  frozenBelow: 0.4,
  ringGap: 3,
  ringWidth: 2,
  dotRadius: 2.5,
};

/** Вспышки эффектов стихий. */
export const FX_FEEL = {
  /** Облако и взрыв: круг растёт от доли радиуса до полного и гаснет. */
  splashMs: 350,
  splashAlpha: 0.4,
  splashFrom: 0.5,
  /** Молния между врагами. */
  boltMs: 250,
  boltWidth: 2,
  boltKink: 6,
  /** Буря: кольцо расходится до радиуса кота. */
  auraMs: 450,
  auraAlpha: 0.5,
  auraFrom: 0.7,
  auraWidth: 3,
};

/** Выстрелы котов и награда за врага. */
export const SHOT_FEEL = {
  radius: 3.5,
  heavyRadius: 6,
  /** Отдача кота при выстреле. */
  recoilScale: 1.12,
  recoilMs: 80,
  rewardOffsetY: 14,
  rewardRise: 24,
  rewardMs: 600,
};

/** Объявление следующей волны. */
export const ANNOUNCE_FEEL = {
  showMs: 200,
  hideMs: 200,
  bgAlpha: 0.8,
};

/** Экран победы и поражения. */
export const RESULT_FEEL = {
  dimAlpha: 0.9,
  /** Пауза после последнего события боя, чтобы игрок успел его увидеть. */
  delayMs: 400,
  showMs: 250,
  starDelayMs: 180,
  starMs: 260,
  starEase: 'Back.easeOut',
};

/** Герой у ворот: покачивание и сфера на посохе. */
export const HERO_FEEL = {
  shadowAlpha: 0.3,
  /** Голова со шляпой ходит вверх-вниз. */
  bobY: 1.5,
  bobMs: 1500,
  orbRadius: 6,
  haloScale: 2,
  /** Умение на перезарядке: сфера маленькая и тусклая. */
  orbIdleScale: 0.65,
  orbIdleAlpha: 0.35,
  /** Умение готово: сфера и ореол пульсируют. */
  orbPulseScale: 1.25,
  orbPulseAlphaFrom: 0.6,
  orbPulseAlphaTo: 1,
  haloPulseAlphaFrom: 0.1,
  haloPulseAlphaTo: 0.35,
  orbPulseMs: 520,
  /** Сфера вспыхивает, когда умение перезарядилось. */
  readyPopScale: 2,
  readyPopMs: 260,
  /** Отдача посоха при ударе. */
  castScale: 1.12,
  castMs: 160,
};

/** Умение «Метеор»: прицел, полёт и взрыв. */
export const METEOR_FEEL = {
  /** Подсветка поля, пока игрок выбирает точку. */
  aimFillAlpha: 0.08,
  aimBorderWidth: 3,
  aimBorderAlpha: 0.7,
  aimBorderInset: 3,
  aimPulseAlpha: 0.55,
  aimPulseMs: 500,
  reticleFillAlpha: 0.18,
  reticleLineWidth: 2,
  reticleLineAlpha: 0.9,
  reticleDot: 3,
  /** Полёт короткий: враги не должны успеть выйти из круга. */
  flightMs: 300,
  flightEase: 'Quad.easeIn',
  ballRadius: 9,
  ballFromScale: 0.5,
  /** Хвост: гаснущие следы за шаром. */
  trailEveryMs: 25,
  trailMs: 180,
  trailAlpha: 0.6,
  trailScale: 0.7,
  /** Взрыв: круг растёт от доли радиуса до полного, по краю — кольцо. */
  blastMs: 420,
  blastAlpha: 0.55,
  blastFrom: 0.35,
  blastRingWidth: 4,
  blastCoreMs: 160,
  blastCoreRadius: 0.5,
  flashMs: 220,
  flashAlpha: 0.3,
  shakeMs: 260,
  shakeIntensity: 0.012,
  /** Обводка кнопки в режиме прицеливания. */
  buttonAimStroke: 2,
  /** Заполнение кнопки, пока идёт перезарядка. */
  buttonFillAlpha: 0.35,
};

export const BUTTON_FEEL = {
  pressScale: 0.94,
  pressMs: 70,
};
