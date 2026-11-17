export const PALETTE = [
  '#ff5a5a', '#ff9a3c', '#f7e84e', '#5aff7e', '#5ab4ff',
  '#c084fc', '#f76aaa', '#6af7d3', '#f7c86a', '#7c6af7',
];

export const BG_COLOR = '#111122';
export const GRID_COLOR = 'rgba(255,255,255,0.1)';
export const MISS_COLOR = 'rgba(255,255,255,0.05)';
export const SELF_HIT_COLOR = 'rgba(255, 90, 90, 0.6)';
export const HOVER_VALID = 'rgba(255,255,255,0.2)';
export const HOVER_INVALID = 'rgba(255,50,50,0.3)';

export const MAX_PIXELS = 20;

/** Game phases, mirrored from `backend/app/config.py`. */
export const PHASE = Object.freeze({
  LOGIN: 'LOGIN',
  LOBBY: 'LOBBY',
  WAITING: 'WAITING',
  PLACEMENT: 'PLACEMENT',
  PLAYING: 'PLAYING',
  GAME_OVER: 'GAME_OVER',
});

export const state = {
  GRID_W: 10,
  GRID_H: 10,
  username: '',
  myColor: PALETTE[0],
  ws: null,
  gameState: PHASE.LOGIN,
  myPlayerNum: 0,
  currentTurn: 1,
  p1Name: 'Player 1',
  p2Name: 'Player 2',
  myLockedPixels: new Set(),
  opponentHits: new Map(),
  opponentMisses: new Set(),
  myHitsOnMe: new Set(),
  myMissesOnMe: new Set(),
  viewingMyShips: false,
  cellSize: 1,
  joinedLobby: false,
};
