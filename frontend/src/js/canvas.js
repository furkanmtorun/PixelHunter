import {
  state,
  BG_COLOR,
  GRID_COLOR,
  MISS_COLOR,
  SELF_HIT_COLOR,
  HOVER_VALID,
  HOVER_INVALID,
  PHASE,
} from './config.js';

let container = null;
let pixelCanvas = null;
let gridCanvas = null;
let hoverCanvas = null;
let ctx = null;
let gCtx = null;
let hCtx = null;

let scale = 1;
let bounds = null;
let frame = 0;

function initDOMCanvas() {
  if (container) return;

  container = document.getElementById('canvas-container');
  pixelCanvas = document.getElementById('pixelCanvas');
  gridCanvas = document.getElementById('gridCanvas');
  hoverCanvas = document.getElementById('hoverCanvas');

  // The board is opaque, so skip per-pixel alpha blending.
  ctx = pixelCanvas.getContext('2d', { alpha: false });
  gCtx = gridCanvas.getContext('2d');
  hCtx = hoverCanvas.getContext('2d');

  // The canvas sits in a fixed layout; only scrolling can move it.
  window.addEventListener('scroll', () => { bounds = null; }, { passive: true });
}

function computeCellSize() {
  const maxW = window.innerWidth - 40;
  const maxH = window.innerHeight - 70 - 40;
  return Math.max(4, Math.floor(Math.min(maxW / state.GRID_W, maxH / state.GRID_H)));
}

function sizeCanvas(canvas, context, width, height) {
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(scale, 0, 0, scale, 0, 0);
}

export function initCanvas() {
  if (!container) initDOMCanvas();

  state.cellSize = computeCellSize();
  scale = Math.min(window.devicePixelRatio || 1, 2);

  const width = state.cellSize * state.GRID_W;
  const height = state.cellSize * state.GRID_H;

  sizeCanvas(pixelCanvas, ctx, width, height);
  sizeCanvas(gridCanvas, gCtx, width, height);
  sizeCanvas(hoverCanvas, hCtx, width, height);

  container.style.width = `${width}px`;
  container.style.height = `${height}px`;

  bounds = null;
  drawGrid();
  redrawBoard();
}

export function drawGrid() {
  const width = state.cellSize * state.GRID_W;
  const height = state.cellSize * state.GRID_H;

  gCtx.clearRect(0, 0, width, height);
  gCtx.strokeStyle = GRID_COLOR;
  gCtx.lineWidth = 1;
  gCtx.beginPath();
  for (let i = 0; i <= state.GRID_W; i++) {
    const p = i * state.cellSize;
    gCtx.moveTo(p, 0);
    gCtx.lineTo(p, height);
  }
  for (let i = 0; i <= state.GRID_H; i++) {
    const p = i * state.cellSize;
    gCtx.moveTo(0, p);
    gCtx.lineTo(width, p);
  }
  gCtx.stroke();
}

function cellOrigin(index) {
  return [
    (index % state.GRID_W) * state.cellSize,
    Math.floor(index / state.GRID_W) * state.cellSize,
  ];
}

function fillCell(context, index, color) {
  const [x, y] = cellOrigin(index);
  context.fillStyle = color;
  context.fillRect(x, y, state.cellSize, state.cellSize);
}

function drawCross(index) {
  const [x, y] = cellOrigin(index);
  const pad = state.cellSize * 0.3;
  const edge = state.cellSize - pad;

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(x + pad, y + pad);
  ctx.lineTo(x + edge, y + edge);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + edge, y + pad);
  ctx.lineTo(x + pad, y + edge);
  ctx.stroke();
}

function paintBoard() {
  const width = state.cellSize * state.GRID_W;
  const height = state.cellSize * state.GRID_H;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, width, height);

  if (state.gameState === PHASE.PLACEMENT) {
    for (const index of state.myLockedPixels) {
      fillCell(ctx, index, state.myColor);
    }
    return;
  }

  if (state.gameState !== PHASE.PLAYING && state.gameState !== PHASE.GAME_OVER) {
    return;
  }

  if (state.viewingMyShips) {
    for (const index of state.myLockedPixels) fillCell(ctx, index, state.myColor);
    for (const index of state.myMissesOnMe) {
      fillCell(ctx, index, MISS_COLOR);
      drawCross(index);
    }
    for (const index of state.myHitsOnMe) {
      fillCell(ctx, index, SELF_HIT_COLOR);
      drawCross(index);
    }
    return;
  }

  for (const index of state.opponentMisses) {
    fillCell(ctx, index, MISS_COLOR);
    drawCross(index);
  }
  for (const [index, color] of state.opponentHits) {
    fillCell(ctx, index, color);
  }
}

/** Coalesce multiple state changes into a single paint per frame. */
export function redrawBoard() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    paintBoard();
  });
}

export function clearHover() {
  if (!hCtx) return;
  hCtx.clearRect(
    0,
    0,
    state.cellSize * state.GRID_W,
    state.cellSize * state.GRID_H,
  );
}

function hoverCell(index, color) {
  const [x, y] = cellOrigin(index);
  hCtx.fillStyle = color;
  hCtx.fillRect(x, y, state.cellSize, state.cellSize);
}

export function hoverAt(index) {
  if (!hCtx) return;
  clearHover();
  if (index < 0) return;

  if (state.gameState === PHASE.PLACEMENT) {
    hoverCell(index, state.myLockedPixels.has(index) ? HOVER_INVALID : HOVER_VALID);
    return;
  }

  if (state.gameState === PHASE.PLAYING && !state.viewingMyShips) {
    const isMyTurn = state.currentTurn === state.myPlayerNum;
    const used = state.opponentMisses.has(index) || state.opponentHits.has(index);
    hoverCell(index, isMyTurn && !used ? HOVER_VALID : HOVER_INVALID);
  }
}

export function getIndex(event) {
  if (!bounds) bounds = pixelCanvas.getBoundingClientRect();

  const col = Math.floor((event.clientX - bounds.left) / state.cellSize);
  const row = Math.floor((event.clientY - bounds.top) / state.cellSize);
  if (col < 0 || col >= state.GRID_W || row < 0 || row >= state.GRID_H) return -1;
  return row * state.GRID_W + col;
}
