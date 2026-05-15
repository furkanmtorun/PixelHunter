import { state, BG_COLOR, GRID_COLOR, MISS_COLOR, HOVER_VALID, HOVER_INVALID } from './config.js';

export let pixelCanvas, gridCanvas, hoverCanvas, ctx, gCtx, hCtx, container;

export function initDOMCanvas() {
  container = document.getElementById('canvas-container');
  pixelCanvas = document.getElementById('pixelCanvas');
  gridCanvas = document.getElementById('gridCanvas');
  hoverCanvas = document.getElementById('hoverCanvas');
  ctx = pixelCanvas.getContext('2d');
  gCtx = gridCanvas.getContext('2d');
  hCtx = hoverCanvas.getContext('2d');
}

export function computeCellSize() {
  const maxW = window.innerWidth - 40;
  const maxH = window.innerHeight - 70 - 40;
  return Math.floor(Math.min(maxW / state.GRID_W, maxH / state.GRID_H));
}

export function initCanvas() {
  if (!container) initDOMCanvas();
  state.cellSize = computeCellSize();
  const sizeW = state.cellSize * state.GRID_W;
  const sizeH = state.cellSize * state.GRID_H;

  [pixelCanvas, gridCanvas, hoverCanvas].forEach(c => {
    c.width = sizeW;
    c.height = sizeH;
  });

  container.style.width = sizeW + 'px';
  container.style.height = sizeH + 'px';

  drawGrid();
  redrawBoard();
}

export function drawGrid() {
  gCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
  gCtx.strokeStyle = GRID_COLOR;
  gCtx.lineWidth = 1;
  for (let i = 0; i <= state.GRID_W; i++) {
    const p = i * state.cellSize;
    gCtx.beginPath(); gCtx.moveTo(p, 0); gCtx.lineTo(p, gridCanvas.height); gCtx.stroke();
  }
  for (let i = 0; i <= state.GRID_H; i++) {
    const p = i * state.cellSize;
    gCtx.beginPath(); gCtx.moveTo(0, p); gCtx.lineTo(gridCanvas.width, p); gCtx.stroke();
  }
}

export function fillRect(ctxTarget, index, color) {
  const col = index % state.GRID_W;
  const row = Math.floor(index / state.GRID_W);
  ctxTarget.fillStyle = color;
  ctxTarget.fillRect(col * state.cellSize, row * state.cellSize, state.cellSize, state.cellSize);
}

export function drawCross(ctxTarget, index) {
  const col = index % state.GRID_W;
  const row = Math.floor(index / state.GRID_W);
  const x = col * state.cellSize;
  const y = row * state.cellSize;
  const pad = state.cellSize * 0.3;
  
  ctxTarget.strokeStyle = 'rgba(255,255,255,0.3)';
  ctxTarget.lineWidth = 2;
  ctxTarget.lineCap = 'round';
  
  ctxTarget.beginPath();
  ctxTarget.moveTo(x + pad, y + pad);
  ctxTarget.lineTo(x + state.cellSize - pad, y + state.cellSize - pad);
  ctxTarget.stroke();
  
  ctxTarget.beginPath();
  ctxTarget.moveTo(x + state.cellSize - pad, y + pad);
  ctxTarget.lineTo(x + pad, y + state.cellSize - pad);
  ctxTarget.stroke();
}

export function redrawBoard() {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, pixelCanvas.width, pixelCanvas.height);

  if (state.gameState === 'PLACEMENT') {
    state.myLockedPixels.forEach(idx => {
      fillRect(ctx, idx, state.myColor);
    });
  } else if (state.gameState === 'PLAYING' || state.gameState === 'GAME_OVER') {
    if (state.viewingMyShips) {
      state.myLockedPixels.forEach(idx => fillRect(ctx, idx, state.myColor));
      state.myMissesOnMe.forEach(idx => {
        fillRect(ctx, idx, MISS_COLOR);
        drawCross(ctx, idx);
      });
      state.myHitsOnMe.forEach(idx => {
        fillRect(ctx, idx, 'rgba(255, 90, 90, 0.6)');
        drawCross(ctx, idx);
      });
    } else {
      state.opponentMisses.forEach(idx => {
        fillRect(ctx, idx, MISS_COLOR);
        drawCross(ctx, idx);
      });
      state.opponentHits.forEach((color, idx) => {
        fillRect(ctx, idx, color);
      });
    }
  }
}

export function getIndex(e) {
  const rect = pixelCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const col = Math.floor(x / state.cellSize);
  const row = Math.floor(y / state.cellSize);
  if (col < 0 || col >= state.GRID_W || row < 0 || row >= state.GRID_H) return -1;
  return row * state.GRID_W + col;
}
