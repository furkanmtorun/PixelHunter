import { state, PALETTE, MAX_PIXELS } from './config.js';
import { initCanvas, redrawBoard, getIndex } from './canvas.js';
import { connect } from './network.js';
import { showToast, updateUI } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  // Connect immediately to show online count and version
  connect();

  // Login & Initialization
  const loginOverlay = document.getElementById('login-overlay');
  const userColorWrap = document.getElementById('user-color-wrap');
  const loginBtn = document.getElementById('login-btn');
  const usernameInput = document.getElementById('username-input');

  PALETTE.forEach((color, i) => {
    const opt = document.createElement('div');
    opt.className = 'color-option';
    opt.style.background = color;
    opt.style.boxShadow = `inset 0 0 0 1px rgba(0,0,0,0.2)`;
    if (i === 0) opt.classList.add('active');
    opt.addEventListener('click', () => {
      document.querySelectorAll('.color-option').forEach(el => el.classList.remove('active'));
      opt.classList.add('active');
      state.myColor = color;
      document.getElementById('logo').style.background = `linear-gradient(135deg, ${color}, #fff)`;
      document.getElementById('logo').style.webkitBackgroundClip = 'text';
    });
    userColorWrap.appendChild(opt);
  });

  usernameInput.addEventListener('input', () => {
    loginBtn.disabled = usernameInput.value.trim().length === 0;
  });

  loginBtn.addEventListener('click', () => {
    const val = usernameInput.value.trim();
    if (!val) return;
    state.username = val;
    loginOverlay.classList.add('hidden');
    document.getElementById('lobby-overlay').classList.remove('hidden');
    
    // Send join lobby message now that we have username/color
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: 'join_lobby', username: state.username, color: state.myColor }));
    }
  });

  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !loginBtn.disabled) loginBtn.click();
  });

  // Lobby Handlers
  document.getElementById('create-room-btn').addEventListener('click', () => {
    if (state.ws) {
      state.ws.send(JSON.stringify({ type: 'create_room', room_name: `${state.username}'s Game` }));
    }
  });

  window.joinRoom = function(roomId) {
    if (state.ws) {
      state.ws.send(JSON.stringify({ type: 'join_room', room_id: roomId }));
    }
  };

  window.addEventListener('resize', () => {
    if (state.gameState !== 'LOGIN' && state.gameState !== 'LOBBY') {
      initCanvas();
    }
  });

  // Buttons
  const lockBtn = document.getElementById('lock-btn');
  lockBtn.addEventListener('click', () => {
    if (state.myLockedPixels.size === MAX_PIXELS) {
      state.ws.send(JSON.stringify({ type: 'lock_pixels', pixels: Array.from(state.myLockedPixels) }));
      lockBtn.textContent = "Waiting for opponent...";
      lockBtn.disabled = true;
      lockBtn.classList.remove('ready');
    }
  });

  const toggleViewBtn = document.getElementById('toggle-view-btn');
  toggleViewBtn.addEventListener('click', () => {
    state.viewingMyShips = !state.viewingMyShips;
    toggleViewBtn.textContent = state.viewingMyShips ? "View Target Pixels" : "View My Pixels";
    redrawBoard();
  });

  // Canvas Interactions
  setTimeout(() => {
    const pCanvas = document.getElementById('pixelCanvas');
    if(!pCanvas) return;
    
    let lastHover = -1;
    pCanvas.addEventListener('mousemove', e => {
      if (state.gameState !== 'PLACEMENT' && state.gameState !== 'PLAYING') return;
      
      const idx = getIndex(e);
      if (idx === lastHover) return;
      lastHover = idx;
      
      const hoverCanvas = document.getElementById('hoverCanvas');
      const hCtx = hoverCanvas.getContext('2d');
      hCtx.clearRect(0, 0, hoverCanvas.width, hoverCanvas.height);
      if (idx < 0) return;

      if (state.gameState === 'PLACEMENT') {
        const isSelected = state.myLockedPixels.has(idx);
        hCtx.fillStyle = isSelected ? 'rgba(255,90,90,0.5)' : 'rgba(255,255,255,0.2)';
        const col = idx % state.GRID_W;
        const row = Math.floor(idx / state.GRID_W);
        hCtx.fillRect(col * state.cellSize, row * state.cellSize, state.cellSize, state.cellSize);
      } else if (state.gameState === 'PLAYING') {
        if (state.viewingMyShips) return;
        const isMyTurn = state.currentTurn === state.myPlayerNum;
        if (isMyTurn && !state.opponentMisses.has(idx) && !state.opponentHits.has(idx)) {
          hCtx.fillStyle = 'rgba(255,255,255,0.2)';
        } else {
          hCtx.fillStyle = 'rgba(255,50,50,0.3)';
        }
        const col = idx % state.GRID_W;
        const row = Math.floor(idx / state.GRID_W);
        hCtx.fillRect(col * state.cellSize, row * state.cellSize, state.cellSize, state.cellSize);
      }
    });

    pCanvas.addEventListener('mouseleave', () => {
      lastHover = -1;
      const hoverCanvas = document.getElementById('hoverCanvas');
      const hCtx = hoverCanvas.getContext('2d');
      hCtx.clearRect(0, 0, hoverCanvas.width, hoverCanvas.height);
    });

    pCanvas.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const idx = getIndex(e);
      if (idx < 0) return;

      if (state.gameState === 'PLACEMENT') {
        if (state.myLockedPixels.has(idx)) {
          state.myLockedPixels.delete(idx);
        } else {
          if (state.myLockedPixels.size < MAX_PIXELS) {
            state.myLockedPixels.add(idx);
          } else {
            showToast("You can only select 20 pixels.");
            return;
          }
        }
        
        // Update lock button
        const lockBtn = document.getElementById('lock-btn');
        lockBtn.textContent = `Lock In (${state.myLockedPixels.size}/${MAX_PIXELS})`;
        if (state.myLockedPixels.size === MAX_PIXELS) {
          lockBtn.classList.add('ready');
          lockBtn.disabled = false;
        } else {
          lockBtn.classList.remove('ready');
          lockBtn.disabled = true;
        }
        redrawBoard();
      } 
      else if (state.gameState === 'PLAYING') {
        if (state.viewingMyShips) return;
        if (state.currentTurn !== state.myPlayerNum) {
          showToast("It's not your turn!");
          return;
        }
        if (state.opponentHits.has(idx) || state.opponentMisses.has(idx)) {
          return; // Already guessed
        }
        
        // Send guess
        if (state.ws) {
          state.ws.send(JSON.stringify({ type: 'guess', index: idx }));
        }
      }
    });
  }, 500); // give DOM a moment
});
