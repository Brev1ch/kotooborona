import type { ElementId, EnemyTypeId } from './data/types';

// Длительности (мс) и параметры анимаций: всё, что подкручивается «по ощущениям».

/**
 * Уровень кота на готовой картинке: цифра на плашке под котом, рамка плашки — цвет ступени уровня.
 * Шляп и корон нет: они закрыли бы хохолок, по которому узнаётся стихия.
 * У кота, нарисованного кодом, уровень по-прежнему цифрой посреди силуэта.
 */
export const CAT_LEVEL_FEEL = {
  /** На сколько картинка кота поднята над центром клетки: под ней место для плашки. */
  artLift: 5,
  /** Плашка с цифрой: центр под котом, размер, скругление, прозрачность фона, толщина рамки. */
  plate: { y: 25, width: 22, height: 13, radius: 5, alpha: 0.9, fontSize: 11, border: 1.5 },
  /** Ступени уровня: цвет рамки плашки действует с уровня `from`. */
  tiers: [
    { from: 1, color: 0xe9e4d6 },
    { from: 4, color: 0xe0a948 },
    { from: 7, color: 0xb48cf2 },
  ],
};

/**
 * Заготовки движения персонажей (`entities/motion.ts`). Картинки рисуются в спокойной позе, а движение даёт код:
 * дыхание, походка, полёт, подкоп, выстрел, попадание, гибель, появление и тень под ногами.
 */
export const MOTION_FEEL = {
  /** Дыхание: сжатие и растяжение по вертикали от ног, у каждого своя фаза. `stretch` — доля высоты. */
  breathe: { periodMs: 2600, stretch: 0.035 },
  /**
   * Вперевалку: наклон ±`angle` (радианы) и подскок на `hop` на каждом шаге. Шаг — `stepPx` пути,
   * поэтому быстрый враг семенит чаще; длительность шага зажата в `minStepMs`…`maxStepMs`.
   */
  waddle: { angle: 0.14, hop: 1.6, stepPx: 9, minStepMs: 110, maxStepMs: 420, squash: 0 },
  /** Тяжёлая походка (король): шаги длиннее и реже, наклон и подскок меньше, на каждом шаге приседает на `squash` высоты. */
  heavy: { angle: 0.07, hop: 0.8, stepPx: 15, minStepMs: 260, maxStepMs: 620, squash: 0.05 },
  /** Полёт: качание вверх-вниз на `amp` без наклона. */
  hover: { periodMs: 900, amp: 2.5 },
  /** Подкоп: враг уходит в землю (сжимается до `sink` и гаснет) и выходит из неё за `ms`; холмик растёт и опадает. */
  burrow: { ms: 220, sink: 0.3, ease: 'Quad.easeIn' },
  /** Выстрел кота: кивок к цели на `nodPx` и отдача — фигура на миг крупнее в `recoilScale`. */
  attack: { nodPx: 3, nodMs: 70, recoilScale: 1.12, recoilMs: 80 },
  /** Попадание: белая вспышка, сжатие до `squash` и отскок назад по ходу на `knockPx`. */
  hit: { flashAlpha: 0.85, flashMs: 110, squash: 0.8, squashMs: 70, knockPx: 3, knockMs: 90 },
  /** Лечение (шаман): на кристалле посоха вспыхивает и гаснет зелёный огонёк диаметра `size`, вырастая в `grow` раза. */
  heal: { size: 12, grow: 2.2, alpha: 0.9, ms: 420 },
  /** Гибель: сплющивание в `squashX`×`squashY` и угасание; облачко частиц — `ENEMY_FEEL.puff*`. */
  death: { ms: 200, squashX: 1.5, squashY: 0.25, ease: 'Quad.easeIn' },
  /** Появление: из нуля с перелётом масштаба. */
  spawn: { ms: 280, ease: 'Back.easeOut' },
  /**
   * Тень — овал под ногами, рисуется кодом. У кота размеры в логических точках, стоит она под лапами;
   * у врага, нарисованного кодом, — в долях радиуса, `y` — сдвиг вниз от центра; у врага готовой картинкой стоит под лапами,
   * размеры — `artWidth`, `artHeight` в долях картинки.
   */
  shadow: {
    color: 0x000000,
    alpha: 0.28,
    cat: { width: 40, height: 9 },
    enemy: { width: 2.3, height: 1.2, y: 0.55, artWidth: 0.62, artHeight: 0.16 },
    /** Летучая мышь: тень меньше в `scale` раза и ниже лап на `gap` — видно, что она в воздухе. */
    flying: { scale: 0.6, gap: 7 },
  },
};

/**
 * Поле боя кодом. Трава — пока нет картинки фона уровня: пятна и цветочки поверх однотонной травы.
 * Тропинка — всегда, и поверх готового фона: полоса шириной `width` с мягкими краями (`soft` точек в `softSteps` слоёв,
 * от прозрачного к плотному), пятна и камешки (сколько на 100 точек пути). Клетки — полупрозрачные площадки с ободком.
 * Раскладка узора — `systems/FieldDecor.ts`, своя у каждого уровня.
 */
export const FIELD_FEEL = {
  grass: {
    color: 0x6aa64f,
    patchColors: [0x5e9a45, 0x78b45a, 0x63a24a],
    patchAlpha: 0.55,
    patches: 46,
    patchSize: [14, 44] as [number, number],
    flowerColors: [0xfff6dc, 0xf6c3d6, 0xffe08a, 0xc9d8ff],
    flowers: 42,
    flowerSize: [2, 3.4] as [number, number],
  },
  road: {
    width: 34,
    soft: 7,
    softSteps: 4,
    color: 0xcfae78,
    edgeColor: 0xa98552,
    spotColor: 0xbf9c66,
    spotAlpha: 0.6,
    spotsPer100: 3,
    spotSize: [5, 11] as [number, number],
    pebbleColors: [0x9a8670, 0xb7a58e, 0x847261],
    pebblesPer100: 5,
    pebbleSize: [1.6, 3] as [number, number],
    /** Пятна и камешки не ближе этого к краю тропинки. */
    margin: 4,
  },
  slot: { color: 0x2b4a24, alpha: 0.28, lineColor: 0xe9f2d0, lineAlpha: 0.35, lineWidth: 1.5 },
};

export const CAT_FEEL = {
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

/** Ускорение боя кнопкой в HUD: во сколько раз быстрее идут бой и анимации поля. */
export const SPEED_FEEL = { fast: 2 };

/** Зона продажи на месте нижней полосы: спокойная, пока палец над полем, и яркая, когда он над ней. */
export const SELL_FEEL = {
  overScale: 1.12,
  tweenMs: 110,
  ease: 'Quad.easeOut',
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
  /** Искры цвета стихии разлетаются из клетки. */
  sparkCount: 10,
  sparkMs: 420,
  sparkSpeedMin: 40,
  sparkSpeedMax: 120,
  sparkScale: 0.45,
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
  padX: 6,
  padY: 3,
  /** Цена смешения: значок кристалла и число после текста. */
  iconSize: 10,
  iconGap: 4,
};

/** Уведомление об открытии нового кота. */
export const BANNER_FEEL = {
  slide: 12,
  showMs: 220,
  showEase: 'Cubic.easeOut',
  holdMs: 2400,
  hideMs: 300,
};

/** Счётчик в HUD вздрагивает, когда значение меняется и когда в него прилетает монета или кристалл. */
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
  /**
   * Враг готовой картинкой стоит анфас и не поворачивается: лапы ниже точки дороги на `feet` высоты картинки,
   * счётчик щита — кружок `shieldBadge` (диаметр) на высоте `shieldY` от лап в долях картинки.
   * Идя влево, отражается; `turnBelow` — насколько путь должен уйти влево или вправо (косинус направления), чтобы враг развернулся.
   */
  upright: { feet: 0.3, shieldBadge: 13, shieldY: 0.35, turnBelow: 0.3 },
  /** Враг прошёл в ворота: поле вздрагивает. */
  leakShakeMs: 140,
  leakShakeIntensity: 0.006,
  /** Щит принял удар. */
  blockScale: 1.6,
  blockMs: 110,
  /** Облачко на месте убитого: клубы разлетаются, растут и тают. Чем крупнее враг, тем их больше. */
  puffPerRadius: 0.75,
  puffMs: 380,
  puffSpeedMin: 12,
  puffSpeedMax: 46,
  puffScaleFrom: 0.5,
  puffScaleTo: 1.3,
  puffAlpha: 0.7,
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
  /** Лечение шамана: кольцо расходится до радиуса лечения. */
  healMs: 500,
  healAlpha: 0.7,
  healFrom: 0.25,
  /** Всплывающие «Иммунитет» и «Мимо» над врагом; над одним врагом — не чаще раза в `noteEveryMs`. */
  noteOffsetY: 12,
  noteRise: 16,
  noteMs: 700,
  noteEveryMs: 700,
  noteMargin: 2,
};

/** Выстрелы котов и награда за врага. */
export const SHOT_FEEL = {
  radius: 3.5,
  heavyRadius: 6,
  rewardOffsetY: 14,
  /** Кристаллы в награде: значок и число после монет. */
  rewardIconSize: 11,
  rewardIconGap: 5,
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
  /** Горящая зона после метеора (легендарный посох): круг гаснет, пока она горит. */
  groundAlpha: 0.4,
  flashMs: 220,
  flashAlpha: 0.3,
  shakeMs: 260,
  shakeIntensity: 0.012,
  /** Обводка кнопки в режиме прицеливания. */
  buttonAimStroke: 2,
  /** Заполнение кнопки, пока идёт перезарядка. */
  buttonFillAlpha: 0.35,
};

/** Кнопка сжимается, пока её держат, и пружинит обратно, когда отпустили. */
export const BUTTON_FEEL = {
  pressScale: 0.94,
  pressMs: 60,
  pressEase: 'Quad.easeOut',
  releaseMs: 180,
  releaseEase: 'Back.easeOut',
};

/** Награда за врага летит из точки гибели в счётчик HUD. Счётчик обновляется сразу, а когда значок долетел — вздрагивает. */
export const COIN_FEEL = {
  /** Одна летящая монета на столько монет награды, но не больше `maxCoins`. */
  goldPerCoin: 2,
  maxCoins: 6,
  size: 9,
  crystalSize: 11,
  /** Сначала монеты разлетаются в стороны от врага… */
  scatter: 16,
  scatterMs: 140,
  scatterEase: 'Cubic.easeOut',
  /** …потом по очереди летят в счётчик. */
  staggerMs: 45,
  flyMs: 380,
  flyEase: 'Cubic.easeIn',
  endScale: 0.6,
};

/** Баннер «Волна N» в момент начала волны. */
export const WAVE_BANNER_FEEL = {
  /** Полупрозрачный: мыши на входе остаются видны. */
  bgAlpha: 0.65,
  slide: 14,
  textFromScale: 1.35,
  showMs: 220,
  showEase: 'Back.easeOut',
  holdMs: 1100,
  hideMs: 280,
};

/** Подсказки обучения. */
export const TUTORIAL_FEEL = {
  bubbleAlpha: 0.92,
  /** Стрелка над кнопкой. */
  arrowW: 18,
  arrowH: 12,
  arrowGap: 4,
  arrowBounce: 8,
  arrowMs: 420,
  /** «Палец», который тащит кота. */
  fingerSize: 24,
  fingerAlpha: 0.85,
  dragMs: 700,
  dragHoldMs: 220,
  /** Кольцо в точке удара метеора. */
  ringPulse: 0.85,
  ringAlpha: 0.5,
};

/** Сценки перед уровнями. */
export const STORY_FEEL = {
  heroScale: 3,
  kingScale: 4,
  mouseScale: 6,
  /** Смена реплики: текст проявляется, портрет выскакивает. */
  lineMs: 180,
  popFrom: 0.85,
  popEase: 'Back.easeOut',
  /** Подсказка «коснись» мерцает. */
  hintAlpha: 0.4,
  hintPulseMs: 700,
};

/** Экран снаряжения. */
export const GEAR_FEEL = {
  lockScale: 0.55,
  /** Отступ замка от правого верхнего угла плашки. */
  lockInset: 10,
  /** После прокачки описание предмета вздрагивает. */
  upgradePulse: 1.12,
  upgradePulseMs: 260,
};

/** Сундук в меню: готовый к открытию покачивается, окно с добычей выскакивает. */
export const CHEST_FEEL = {
  readyPulseScale: 1.03,
  readyPulseMs: 520,
  popupFromScale: 0.8,
  popupMs: 240,
  popupEase: 'Back.easeOut',
  dimAlpha: 0.85,
  /** Как часто отсчёт до сундука за рекламу сверяется с часами. */
  adTickMs: 1000,
};

/** Переход между экранами: старый гаснет в цвет фона, новый проявляется. */
export const TRANSITION_FEEL = {
  outMs: 130,
  inMs: 200,
};

/** Случайный сдвиг высоты повторяющихся звуков: ±8 %, чтобы повторы не звучали одинаково. */
const REPEAT_PITCH = 0.08;

/**
 * Звуки: volume — громкость от 0 до 1; minIntervalMs — не чаще, чем раз в столько мс;
 * voices — сколько копий звука может звучать разом; pitchSpread — случайный сдвиг высоты в долях (0,08 — ±8 %);
 * chance — с какой вероятностью звук вообще звучит (без поля — всегда); variants — группа без своего файла: звучит один из этих звуков наугад.
 */
export const SOUND_FEEL = {
  click: { volume: 0.5, minIntervalMs: 40, voices: 1, pitchSpread: 0 },
  summon: { volume: 0.6, minIntervalMs: 60, voices: 2, pitchSpread: REPEAT_PITCH },
  merge: { volume: 0.7, minIntervalMs: 0, voices: 2, pitchSpread: REPEAT_PITCH },
  hybrid: { volume: 0.8, minIntervalMs: 0, voices: 2, pitchSpread: 0 },
  /** Тихий и редкий: поле из двенадцати котов не должно трещать. */
  shot: { volume: 0.12, minIntervalMs: 110, voices: 3, pitchSpread: REPEAT_PITCH },
  /** Выстрелы базовых стихий: у каждой свой звук, так же тихо и редко, как общий. */
  shotFire: { volume: 0.14, minIntervalMs: 110, voices: 2, pitchSpread: REPEAT_PITCH },
  shotWater: { volume: 0.14, minIntervalMs: 110, voices: 2, pitchSpread: REPEAT_PITCH },
  shotEarth: { volume: 0.1, minIntervalMs: 140, voices: 2, pitchSpread: REPEAT_PITCH },
  shotAir: { volume: 0.12, minIntervalMs: 90, voices: 2, pitchSpread: REPEAT_PITCH },
  hit: { volume: 0.2, minIntervalMs: 70, voices: 3, pitchSpread: REPEAT_PITCH },
  enemyDeath: { volume: 0.4, minIntervalMs: 80, voices: 3, pitchSpread: REPEAT_PITCH },
  coins: { volume: 0.45, minIntervalMs: 120, voices: 2, pitchSpread: REPEAT_PITCH },
  lifeLost: { volume: 0.7, minIntervalMs: 150, voices: 1, pitchSpread: 0 },
  meteor: { volume: 0.9, minIntervalMs: 0, voices: 1, pitchSpread: 0 },
  win: { volume: 0.7, minIntervalMs: 0, voices: 1, pitchSpread: 0 },
  lose: { volume: 0.7, minIntervalMs: 0, voices: 1, pitchSpread: 0 },
  chest: { volume: 0.7, minIntervalMs: 0, voices: 1, pitchSpread: 0 },
  /** Мурлыканье при слиянии котов: с вероятностью 50 % и не чаще раза в 3 с; когда молчит, звучит обычный `merge`. */
  purrMerge: { volume: 0.6, minIntervalMs: 3000, voices: 1, pitchSpread: REPEAT_PITCH, chance: 0.5 },
  /** Довольное мурлыканье после победного джингла, тише него. */
  purrWin: { volume: 0.45, minIntervalMs: 0, voices: 1, pitchSpread: 0 },
  /** Шипение, когда мышь дошла до замка: всегда, но не чаще раза в 1,5 с. */
  hiss: { volume: 0.6, minIntervalMs: 1500, voices: 1, pitchSpread: REPEAT_PITCH },
  /** Писк погибшей мыши; у командиров (`lowFor`) — тот же писк ниже в `lowRate` раза. */
  mouseSqueak: { volume: 0.4, minIntervalMs: 120, voices: 3, pitchSpread: REPEAT_PITCH, lowRate: 0.7, lowFor: ['boss', 'king'] as EnemyTypeId[] },
  /**
   * Мяуканье при призыве: с вероятностью 25 % и не чаще раза в 6 с — один из `variants` наугад; своего файла у группы нет,
   * громкость и сдвиг высоты — её, а не вариантов.
   */
  meow: { volume: 0.6, minIntervalMs: 6000, voices: 1, pitchSpread: REPEAT_PITCH, chance: 0.25, variants: ['meow1', 'meow2', 'meow3', 'meow4'] as string[] },
  meow1: { volume: 0.6, minIntervalMs: 0, voices: 1, pitchSpread: REPEAT_PITCH },
  meow2: { volume: 0.6, minIntervalMs: 0, voices: 1, pitchSpread: REPEAT_PITCH },
  meow3: { volume: 0.6, minIntervalMs: 0, voices: 1, pitchSpread: REPEAT_PITCH },
  meow4: { volume: 0.6, minIntervalMs: 0, voices: 1, pitchSpread: REPEAT_PITCH },
  /** Долгое мяуканье: всегда при первом открытии гибрида. */
  meowLong: { volume: 0.7, minIntervalMs: 0, voices: 1, pitchSpread: 0 },
  /** Грустное мяуканье после проигрышного джингла. */
  meowSad: { volume: 0.55, minIntervalMs: 0, voices: 1, pitchSpread: 0 },
};

export type SoundId = keyof typeof SOUND_FEEL;

/** Звук выстрела кота по стихии; у стихий, которых здесь нет (гибриды), — общий `shot`. */
export const SHOT_SOUND: Partial<Record<ElementId, SoundId>> = {
  fire: 'shotFire',
  water: 'shotWater',
  earth: 'shotEarth',
  air: 'shotAir',
};

/**
 * Фоновая музыка: громкость каждого трека от 0 до 1 (тише звуков: она идёт всё время) и за сколько мс один трек сменяет другой.
 * Какой трек где играет, решают сцены: `audio.music(scene, id)`. Файлы собирает `npm run sfx` (таблица `MUSIC`); пока трека нет, игра молчит.
 */
export const MUSIC_FEEL = {
  fadeMs: 900,
  tracks: {
    menu: { volume: 0.35 },
    battle: { volume: 0.3 },
  },
};

export type MusicId = keyof typeof MUSIC_FEEL.tracks;
