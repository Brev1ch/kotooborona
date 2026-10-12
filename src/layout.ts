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

export const COLORS = {
  bg: 0x1b2233,
  board: 0x202a40,
  panel: 0x252f46,
  line: 0x3a4766,
  roadEdge: 0x3b3426,
  road: 0x4b4230,
  slot: 0x28324b,
  brass: 0xe0a948,
  gateWall: 0x5b4a6e,
  gateDoor: 0x2b2238,
  danger: 0xe2604f,
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
