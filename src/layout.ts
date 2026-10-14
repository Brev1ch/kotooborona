// Логический экран 360×640: полоса HUD, игровое поле, полоса кнопок.
export const GAME_W = 360;
export const GAME_H = 640;

// Полоса HUD выше кнопки паузы; место для неё взято у нижней полосы, поле осталось 540.
export const HUD_H = 48;
export const BOARD_W = 360;
export const BOARD_H = 540;
export const BOARD_Y = HUD_H;
export const CONTROLS_Y = BOARD_Y + BOARD_H;
export const CONTROLS_H = GAME_H - CONTROLS_Y;

/** Взятого кота или строение не опустить ниже: подпись уровня под котом не должна уйти за край экрана. */
export const DRAG_GHOST_MAX_Y = GAME_H - 40;

/** Наименьший размер нажимаемого элемента по каждой стороне: меньше пальцем не попасть. */
export const MIN_TOUCH = 44;

// Меню: рыбки, название игры, сундук и сетка уровней главы.
export const MENU = {
  titleY: 68,
  /** Полоса сундука между названием и уровнями; справа от неё — кнопка сундука за рекламу. */
  chestY: 120,
  chestW: 216,
  chestH: MIN_TOUCH,
  chestPad: 14,
  adChestW: 108,
  /** Пока сундук за рекламу отдыхает, в его плашке две строки: подпись и отсчёт; это сдвиг каждой от середины. */
  adChestLine: 9,
  gridY: 152,
  cols: 2,
  cardW: 160,
  cardH: 66,
  gap: 12,
  /** Внизу — две кнопки рядом: книга котов и бестиарий. */
  bookY: 592,
  bookW: 160,
  bookH: 50,
  bookGap: 12,
  soundPad: 12,
  /** Между кнопками музыки и звука. */
  soundGap: 8,
  /** Счётчик рыбок в левом верхнем углу. */
  fishX: 52,
  fishY: 34,
};

/** Центр полосы сундука в меню. */
export function menuChestCenter(): [number, number] {
  return [MENU.chestPad + MENU.chestW / 2, MENU.chestY];
}

/** Центр кнопки сундука за рекламу: справа от полосы сундука. */
export function menuAdChestCenter(): [number, number] {
  return [GAME_W - MENU.chestPad - MENU.adChestW / 2, MENU.chestY];
}

// Окно открытого сундука поверх меню: заголовок, предмет с редкостью и бонусами, рыбки, шансы редкостей, кнопка «Забрать».
export const CHEST_POPUP = { y: 310, w: 316, h: 340, titleY: -140, itemY: -104, rarityY: -82, bonusY: -64, fishY: 34, chancesY: 62, buttonY: 132, buttonW: 200, buttonH: 50 };

/** Центр кнопки «Забрать» в окне сундука. */
export function chestTakeCenter(): [number, number] {
  return [GAME_W / 2, CHEST_POPUP.y + CHEST_POPUP.buttonY];
}

/** Центр кнопки музыки в меню: слева от кнопки звука. */
export function menuMusicCenter(): [number, number] {
  const [x, y] = menuSoundCenter();
  return [x - MIN_TOUCH - MENU.soundGap, y];
}

/** Центр кнопки звука в правом верхнем углу меню. */
export function menuSoundCenter(): [number, number] {
  return [GAME_W - MENU.soundPad - MIN_TOUCH / 2, MENU.soundPad + MIN_TOUCH / 2];
}

/** Центр кнопки «Книга котов» в меню: левая из двух. */
export function menuBookCenter(): [number, number] {
  return [GAME_W / 2 - (MENU.bookW + MENU.bookGap) / 2, MENU.bookY];
}

/** Центр кнопки «Бестиарий» в меню: правая из двух. */
export function menuBestiaryCenter(): [number, number] {
  return [GAME_W / 2 + (MENU.bookW + MENU.bookGap) / 2, MENU.bookY];
}

/** Центр плитки уровня в меню; `index` — номер в главе с нуля. */
export function menuCardCenter(index: number): [number, number] {
  const { gridY, cols, cardW, cardH, gap } = MENU;
  const left = (GAME_W - cols * cardW - (cols - 1) * gap) / 2;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return [left + col * (cardW + gap) + cardW / 2, gridY + row * (cardH + gap) + cardH / 2];
}

// Экран снаряжения: заголовок, счётчик рыбок, три слота с предметами-плашками и прокачкой, кнопки внизу.
// Экран снаряжения перед уровнем: три надетых предмета в ряд, под ними — инвентарь сеткой, внизу — «Назад» и «В бой».
export const GEAR = {
  titleY: 34,
  subtitleY: 70,
  pad: 14,
  /** Надетые предметы: три плашки на всю ширину. */
  wornY: 92,
  wornW: 104,
  wornH: 76,
  wornGap: 10,
  /** Заголовок инвентаря и сетка под ним. */
  listTitleY: 188,
  gridY: 204,
  cols: 6,
  rows: 5,
  cell: 50,
  cellGap: 6,
  buttonY: 596,
  buttonH: 50,
  backW: 120,
  startW: 200,
  buttonGap: 12,
};

/** Центр плашки надетого предмета; `index` — номер слота с нуля. */
export function gearWornCenter(index: number): [number, number] {
  const { pad, wornW, wornH, wornGap, wornY } = GEAR;
  return [pad + wornW / 2 + index * (wornW + wornGap), wornY + wornH / 2];
}

/** Центр ячейки инвентаря; `index` — номер предмета с нуля, слева направо и сверху вниз. */
export function gearCellCenter(index: number): [number, number] {
  const { pad, cols, cell, cellGap, gridY } = GEAR;
  return [pad + 1 + cell / 2 + (index % cols) * (cell + cellGap), gridY + cell / 2 + Math.floor(index / cols) * (cell + cellGap)];
}

// Карточка предмета поверх экрана снаряжения: название, редкость, бонусы, сравнение с надетым и кнопки.
export const ITEM_CARD = {
  y: 310,
  w: 316,
  h: 444,
  pad: 16,
  titleY: -200,
  rarityY: -176,
  textY: -156,
  lineGap: 4,
  blockGap: 12,
  /** Ряд действий (надеть и разобрать или улучшить) и «Закрыть» под ним. */
  actionY: 142,
  closeY: 194,
  buttonH: 46,
  buttonGap: 8,
};

/** Центр кнопки карточки предмета: `left` и `right` — два действия рядом, `wide` — одно во всю ширину, `close` — «Закрыть». */
export function itemCardButtonCenter(button: 'left' | 'right' | 'wide' | 'close'): [number, number] {
  const { y, w, pad, actionY, closeY, buttonGap } = ITEM_CARD;
  const half = (w - pad * 2 - buttonGap) / 2;
  if (button === 'close') return [GAME_W / 2, y + closeY];
  if (button === 'wide') return [GAME_W / 2, y + actionY];
  return [GAME_W / 2 + (button === 'left' ? -1 : 1) * (half + buttonGap) / 2, y + actionY];
}

/** Центр кнопки внизу экрана снаряжения: «Назад» слева, «В бой» справа. */
export function gearButtonCenter(button: 'back' | 'start'): [number, number] {
  const { pad, backW, startW, buttonGap, buttonY } = GEAR;
  return [button === 'back' ? pad + backW / 2 : pad + backW + buttonGap + startW / 2, buttonY];
}

/** Центр счётчика рыбок на экране снаряжения: справа, на одной строке с подзаголовком. */
export function gearFishCenter(): [number, number] {
  return [GAME_W - GEAR.pad - 40, GEAR.subtitleY];
}

// Сценка: портрет говорящего, его имя, плашка с репликой, подсказка и кнопка «Пропустить» в углу.
export const STORY = {
  portraitY: 210,
  nameY: 336,
  panelY: 430,
  panelW: 328,
  panelH: 140,
  textPad: 16,
  hintY: 540,
  skipW: 132,
  skipH: MIN_TOUCH,
  pad: 12,
};

/** Центр кнопки «Пропустить» в правом верхнем углу сценки. */
export function storySkipCenter(): [number, number] {
  return [GAME_W - STORY.pad - STORY.skipW / 2, STORY.pad + STORY.skipH / 2];
}

// Книга котов: заголовок, счётчик, по строке на кота, кнопка «Назад».
export const BOOK = {
  titleY: 48,
  countY: 78,
  listY: 100,
  rowH: 45,
  iconX: 38,
  iconScale: 0.7,
  textX: 68,
  backY: 592,
  backW: 160,
  backH: 50,
};

export function bookBackCenter(): [number, number] {
  return [GAME_W / 2, BOOK.backY];
}

// Бестиарий: список врагов во всю высоту экрана, строка открытого врага нажимается и показывает карточку.
export const BESTIARY = {
  titleY: 36,
  countY: 62,
  listY: 80,
  rowW: 332,
  rowH: MIN_TOUCH,
  /** Портрет и текст — от левого края строки. */
  iconX: 26,
  iconSize: 30,
  textX: 52,
  backY: 604,
  backW: 160,
  backH: MIN_TOUCH,
};

/** Центр строки бестиария; `index` — номер врага с нуля. */
export function bestiaryRowCenter(index: number): [number, number] {
  return [GAME_W / 2, BESTIARY.listY + index * BESTIARY.rowH + BESTIARY.rowH / 2];
}

export function bestiaryBackCenter(): [number, number] {
  return [GAME_W / 2, BESTIARY.backY];
}

// Карточка врага поверх экрана: портрет, имя, описание, особенность, подсказка и кнопка.
export const ENEMY_CARD = {
  y: 320,
  w: 316,
  h: 432,
  pad: 18,
  headingY: -194,
  portraitY: -142,
  portraitSize: 84,
  nameY: -84,
  textY: -60,
  /** Между абзацами и между подписью и её текстом. */
  blockGap: 12,
  labelGap: 3,
  buttonY: 178,
  buttonW: 200,
  buttonH: 50,
};

/** Центр кнопки карточки врага. */
export function enemyCardButtonCenter(): [number, number] {
  return [GAME_W / 2, ENEMY_CARD.y + ENEMY_CARD.buttonY];
}

// Верхняя полоса: четыре показателя, справа — кнопки скорости боя и паузы.
export const HUD_PAD = 6;
export const HUD_GAP = 6;
/** Между кнопками скорости и паузы зазор больше: промах по одной не должен нажимать другую. */
export const HUD_BUTTON_GAP = 12;

/** Центр кнопки скорости боя в HUD: слева от паузы. */
export function speedButtonCenter(): [number, number] {
  return [GAME_W - HUD_PAD - MIN_TOUCH - HUD_BUTTON_GAP - MIN_TOUCH / 2, HUD_H / 2];
}

/** Центр кнопки паузы в HUD. */
export function pauseButtonCenter(): [number, number] {
  return [GAME_W - HUD_PAD - MIN_TOUCH / 2, HUD_H / 2];
}

// Меню паузы: заголовок и кнопки столбиком — «Продолжить», звук, музыка, «В меню».
export const PAUSE_MENU = { titleY: 186, firstY: 260, buttonW: 220, buttonH: 50, gap: 12 };

/** Центр кнопки меню паузы; `index` — номер сверху с нуля. */
export function pauseMenuButtonCenter(index: number): [number, number] {
  const { firstY, buttonH, gap } = PAUSE_MENU;
  return [GAME_W / 2, firstY + index * (buttonH + gap)];
}

// Нижняя полоса слева направо: «Призвать», «Строить», «Метеор», монеты за рекламу.
// Пока игрок держит кота или строение, вся полоса — зона продажи.
export const CONTROLS_PAD = 8;
export const CONTROLS_GAP = 8;
export const BUILD_W = 48;
export const METEOR_W = 84;
export const COIN_AD_W = 72;
export const SUMMON_W = GAME_W - CONTROLS_PAD * 2 - CONTROLS_GAP * 3 - BUILD_W - METEOR_W - COIN_AD_W;
export const SUMMON_X = CONTROLS_PAD + SUMMON_W / 2;
export const BUILD_X = CONTROLS_PAD + SUMMON_W + CONTROLS_GAP + BUILD_W / 2;
export const METEOR_X = BUILD_X + BUILD_W / 2 + CONTROLS_GAP + METEOR_W / 2;
export const COIN_AD_X = GAME_W - CONTROLS_PAD - COIN_AD_W / 2;
export const CONTROLS_CENTER_Y = CONTROLS_Y + CONTROLS_H / 2;

// Окно стройки и улучшения над нижней полосой: заголовок и строки-кнопки.
export const BUILD_PANEL = { w: 344, pad: 8, titleH: 30, rowH: 52, rowGap: 6, bottomGap: 8, iconX: 30, textX: 60, iconScale: 0.72 };

/** Центр строки окна стройки; `index` — номер сверху с нуля, `rows` — сколько строк в окне. */
export function buildRowCenter(index: number, rows: number): [number, number] {
  const { rowH, rowGap, bottomGap, pad } = BUILD_PANEL;
  const bottom = CONTROLS_Y - bottomGap - pad;
  return [GAME_W / 2, bottom - (rows - 1 - index) * (rowH + rowGap) - rowH / 2];
}

// Экран победы и поражения поверх поля: заголовок, звёзды, пояснение, награда, кнопка рекламы, кнопки перехода.
export const RESULT = {
  titleY: -128,
  starsY: -78,
  detailY: -26,
  rewardY: 16,
  adY: 64,
  adW: 272,
  buttonsY: 124,
  buttonW: 130,
  buttonH: 46,
  buttonGap: 12,
  textW: 280,
};

/** Середина экрана итога по вертикали. */
export const RESULT_Y = BOARD_Y + BOARD_H / 2;

/** Центр кнопки рекламы на экране итога. */
export function resultAdCenter(): [number, number] {
  return [GAME_W / 2, RESULT_Y + RESULT.adY];
}

/** Центр кнопки перехода на экране итога: левая или правая. */
export function resultButtonCenter(side: 'left' | 'right'): [number, number] {
  const offset = (RESULT.buttonW + RESULT.buttonGap) / 2;
  return [GAME_W / 2 + (side === 'left' ? -offset : offset), RESULT_Y + RESULT.buttonsY];
}

export const ROAD = { outerWidth: 38, innerWidth: 30, dash: 6, gap: 10 };
export const SLOT_RADIUS = 14;

/** Порядок отрисовки на игровом поле. */
export const DEPTH = { highlight: 1, enemy: 2, cat: 3, projectile: 4, fx: 5, dragged: 6, toast: 7 };

export const COLORS = {
  bg: 0x1b2233,
  board: 0x202a40,
  panel: 0x252f46,
  line: 0x3a4766,
  roadEdge: 0x3b3426,
  road: 0x4b4230,
  slot: 0x28324b,
  slotHover: 0x34405d,
  range: 0xe9e4d6,
  brass: 0xe0a948,
  gateWall: 0x5b4a6e,
  gateDoor: 0x2b2238,
  danger: 0xe2604f,
  crystal: 0xb48cf2,
  crystalLight: 0xd9c6ff,
  coinEdge: 0xa9762a,
  coinShine: 0xf7dc9a,
  puff: 0xd8d2c4,
  flash: 0xffffff,
  enemyNose: 0xf0a3a3,
  hpBack: 0x000000,
  hp: 0x7cc48a,
  shield: 0x8fa3c4,
  meteor: 0xff7a3c,
  shadow: 0x000000,
  heroFur: 0xf2efe6,
  heroMantle: 0x4b3f7a,
  heroHat: 0x3b3a6b,
  heroStaff: 0xa07c4c,
  fish: 0x7fd1e8,
  fishDark: 0x3f8fb0,
  /** Кнопки наградной рекламы. */
  reward: 0x3f8f5f,
  /** Отличительные признаки врагов: сапоги, каска с ведром, посох, повязка, крылья, когти и холмик крота. */
  iron: 0x4a5462,
  ironLight: 0xaeb9c8,
  helmet: 0xd9382c,
  helmetCrest: 0xf2c94c,
  bucket: 0xc9d3dc,
  bucketWater: 0x4aa3df,
  staff: 0x9a6a36,
  staffOrb: 0x7cf2a0,
  feather: 0xf2efe6,
  headband: 0xe2384a,
  wing: 0x3a2d4d,
  claw: 0xf2e6d0,
  mound: 0x7a5c3a,
  moundDark: 0x4f3b26,
  /** Редкости предметов. */
  rarityCommon: 0x9aa3b8,
  rarityRare: 0x4aa3df,
  rarityEpic: 0xb48cf2,
  rarityLegendary: 0xe0a948,
};

export const TEXT_COLORS = {
  fg: '#e9e4d6',
  muted: '#9aa3b8',
  dark: '#1b2233',
  brass: '#e0a948',
  danger: '#e2604f',
  crystal: '#b48cf2',
  fish: '#7fd1e8',
};

export const FONTS = {
  display: '"Russo One", "Arial Black", system-ui, sans-serif',
  body: 'Rubik, system-ui, -apple-system, "Segoe UI", sans-serif',
};
