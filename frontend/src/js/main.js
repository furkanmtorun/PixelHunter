import { state, PALETTE, MODE_OPTIONS, getMode, PHASE } from './config.js';
import { initCanvas, redrawBoard, getIndex, hoverAt, clearHover } from './canvas.js';
import { connect, send, joinLobby } from './network.js';
import { showToast, updateLockButton } from './ui.js';
import { byId } from './dom.js';

function inGame() {
  return state.gameState !== PHASE.LOGIN && state.gameState !== PHASE.LOBBY;
}

function refreshModeUI() {
  const mode = getMode(state.selectedMode);
  byId('lobby-mode-badge').textContent = `${mode.name} · ${mode.matrix.join('×')}`;
  byId('create-room-btn').textContent = `Create ${mode.name} Room`;
}

function setupModePicker() {
  const picker = byId('mode-picker');

  for (const mode of MODE_OPTIONS) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'mode-option';
    option.dataset.mode = mode.key;
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', String(mode.key === state.selectedMode));
    if (mode.key === state.selectedMode) option.classList.add('active');

    const dot = document.createElement('span');
    dot.className = 'mode-dot';
    dot.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'mode-text';

    const name = document.createElement('span');
    name.className = 'mode-name';
    name.textContent = mode.name;

    const blurb = document.createElement('span');
    blurb.className = 'mode-blurb';
    blurb.textContent = mode.blurb;

    text.append(name, blurb);

    const goal = document.createElement('span');
    goal.className = 'mode-goal';
    goal.textContent = mode.goal;

    option.append(dot, text, goal);
    option.addEventListener('click', () => {
      state.selectedMode = mode.key;
      for (const el of picker.querySelectorAll('.mode-option')) {
        const active = el === option;
        el.classList.toggle('active', active);
        el.setAttribute('aria-checked', String(active));
      }
      refreshModeUI();
    });
    picker.append(option);
  }

  refreshModeUI();
}

function setupLogin() {
  const colorWrap = byId('user-color-wrap');
  const loginBtn = byId('login-btn');
  const usernameInput = byId('username-input');

  setupModePicker();

  PALETTE.forEach((color, index) => {
    const option = document.createElement('div');
    option.className = 'color-option';
    option.style.background = color;
    option.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.2)';
    option.dataset.color = color;
    if (index === 0) option.classList.add('active');

    option.addEventListener('click', () => {
      for (const el of colorWrap.querySelectorAll('.color-option')) {
        el.classList.remove('active');
      }
      option.classList.add('active');
      state.myColor = color;
      byId('logo').style.background = `linear-gradient(135deg, ${color}, #fff)`;
    });
    colorWrap.append(option);
  });

  usernameInput.addEventListener('input', () => {
    loginBtn.disabled = usernameInput.value.trim().length === 0;
  });

  usernameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !loginBtn.disabled) loginBtn.click();
  });

  loginBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (!username) return;

    state.username = username;
    state.gameState = PHASE.LOBBY;
    byId('login-overlay').classList.add('hidden');
    byId('lobby-overlay').classList.remove('hidden');
    joinLobby(); // queued automatically if the socket is still connecting
  });
}

function setupLobby() {
  byId('create-room-btn').addEventListener('click', () => {
    send({
      type: 'create_room',
      room_name: `${state.username}'s Game`,
      mode: state.selectedMode,
    });
  });

  // One delegated listener survives every lobby re-render.
  byId('room-list').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-room-id]');
    if (!button) return;
    send({ type: 'join_room', room_id: button.dataset.roomId });
  });
}

function setupGameControls() {
  const lockBtn = byId('lock-btn');

  lockBtn.addEventListener('click', () => {
    if (state.myLockedPixels.size !== state.maxPixels) return;

    send({ type: 'lock_pixels', pixels: [...state.myLockedPixels] });
    lockBtn.textContent = 'Waiting for opponent...';
    lockBtn.disabled = true;
    lockBtn.classList.remove('ready');
  });

  const toggleViewBtn = byId('toggle-view-btn');
  toggleViewBtn.addEventListener('click', () => {
    state.viewingMyShips = !state.viewingMyShips;
    toggleViewBtn.textContent = state.viewingMyShips
      ? 'View Target Pixels'
      : 'View My Pixels';
    clearHover();
    redrawBoard();
  });
}

function setupCanvasInput() {
  const canvas = byId('pixelCanvas');
  let lastHover = -1;

  canvas.addEventListener(
    'mousemove',
    (event) => {
      if (state.gameState !== PHASE.PLACEMENT && state.gameState !== PHASE.PLAYING) return;

      const index = getIndex(event);
      if (index === lastHover) return;
      lastHover = index;
      hoverAt(index);
    },
    { passive: true },
  );

  canvas.addEventListener('mouseleave', () => {
    lastHover = -1;
    clearHover();
  });

  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;

    const index = getIndex(event);
    if (index < 0) return;

    if (state.gameState === PHASE.PLACEMENT) {
      if (state.myLockedPixels.has(index)) {
        state.myLockedPixels.delete(index);
      } else if (state.myLockedPixels.size < state.maxPixels) {
        state.myLockedPixels.add(index);
      } else {
        showToast(`You can only select ${state.maxPixels} pixels.`);
        return;
      }

      updateLockButton();
      hoverAt(index);
      redrawBoard();
      return;
    }

    if (state.gameState !== PHASE.PLAYING || state.viewingMyShips) return;

    if (state.currentTurn !== state.myPlayerNum) {
      showToast("It's not your turn!");
      return;
    }
    if (state.opponentHits.has(index) || state.opponentMisses.has(index)) {
      return; // Already guessed
    }

    send({ type: 'guess', index });
    lastHover = -1;
    clearHover();
  });
}

function setupResize() {
  let scheduled = 0;

  window.addEventListener(
    'resize',
    () => {
      if (!inGame() || scheduled) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        initCanvas();
        clearHover();
      });
    },
    { passive: true },
  );
}

function init() {
  setupLogin();
  setupLobby();
  setupGameControls();
  setupCanvasInput();
  setupResize();
  connect();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
