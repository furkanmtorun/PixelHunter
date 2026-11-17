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

/** Mode presets, mirrored from `backend/app/config.py`. */
export const MODE_OPTIONS = Object.freeze([
  {
    key: 'easy',
    name: 'Easy',
    matrix: [3, 3],
    maxPixels: 4,
    nHitToWin: 4,
    scoresToWin: 600,
    blurb: '3×3 board · hide 4 · 4 hits or 600 pts',
  },
  {
    key: 'medium',
    name: 'Medium',
    matrix: [6, 6],
    maxPixels: 12,
    nHitToWin: 12,
    scoresToWin: 1000,
    blurb: '6×6 board · hide 12 · 12 hits or 1000 pts',
  },
  {
    key: 'hard',
    name: 'Hard',
    matrix: [10, 10],
    maxPixels: 20,
    nHitToWin: 11,
    scoresToWin: 1000,
    blurb: '10×10 board · hide 20 · 11 hits or 1000 pts',
  },
]);

export const DEFAULT_MODE = 'hard';

export function getMode(key) {
  return MODE_OPTIONS.find((mode) => mode.key === key)
    ?? MODE_OPTIONS.find((mode) => mode.key === DEFAULT_MODE);
}

const defaultMode = getMode(DEFAULT_MODE);

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
  GRID_W: defaultMode.matrix[0],
  GRID_H: defaultMode.matrix[1],
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
  // Mode chosen in the lobby, then replaced by the room's authoritative mode.
  selectedMode: DEFAULT_MODE,
  mode: DEFAULT_MODE,
  modeName: defaultMode.name,
  maxPixels: defaultMode.maxPixels,
  nHitToWin: defaultMode.nHitToWin,
  scoresToWin: defaultMode.scoresToWin,
};
