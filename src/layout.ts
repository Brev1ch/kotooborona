// Логический экран 360×640: полоса HUD, игровое поле, полоса кнопок.
export const GAME_W = 360;
export const GAME_H = 640;

export const HUD_H = 40;
export const BOARD_W = 360;
export const BOARD_H = 540;
export const BOARD_Y = HUD_H;
export const CONTROLS_Y = BOARD_Y + BOARD_H;
export const CONTROLS_H = GAME_H - CONTROLS_Y;

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
};

export const TEXT_COLORS = {
  fg: '#e9e4d6',
  muted: '#9aa3b8',
  dark: '#1b2233',
  brass: '#e0a948',
  danger: '#e2604f',
  crystal: '#b48cf2',
};

export const FONTS = {
  display: '"Arial Black", system-ui, sans-serif',
  body: 'system-ui, -apple-system, "Segoe UI", sans-serif',
};
