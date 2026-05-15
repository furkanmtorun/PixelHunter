import { state, MAX_PIXELS } from './config.js';

export function showToast(msg) {
  const toasts = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  toasts.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

export function updateUI() {
  const stateText = document.getElementById('game-state-text');
  const lockBtn = document.getElementById('lock-btn');
  const toggleViewBtn = document.getElementById('toggle-view-btn');
  const p1Badge = document.getElementById('p1-badge');
  const p2Badge = document.getElementById('p2-badge');
  const container = document.getElementById('canvas-container');

  if (state.gameState === 'WAITING') {
    stateText.textContent = "Waiting for an opponent to join...";
    p1Badge.style.display = 'none';
    p2Badge.style.display = 'none';
    lockBtn.style.display = 'none';
    toggleViewBtn.style.display = 'none';
    container.classList.remove('my-turn');
  } 
  else if (state.gameState === 'PLACEMENT') {
    stateText.textContent = "Place your 20 pixels!";
    p1Badge.style.display = 'flex';
    p2Badge.style.display = 'flex';
    document.getElementById('p1-name').textContent = state.p1Name;
    document.getElementById('p2-name').textContent = state.p2Name;
    
    lockBtn.style.display = 'block';
    lockBtn.textContent = `Lock In (${state.myLockedPixels.size}/${MAX_PIXELS})`;
    
    if (state.myLockedPixels.size === MAX_PIXELS) {
      lockBtn.classList.add('ready');
      lockBtn.disabled = false;
    } else {
      lockBtn.classList.remove('ready');
      lockBtn.disabled = true;
    }
  }
  else if (state.gameState === 'PLAYING') {
    lockBtn.style.display = 'none';
    toggleViewBtn.style.display = 'block';
    p1Badge.style.display = 'flex';
    p2Badge.style.display = 'flex';
    
    const isMyTurn = state.currentTurn === state.myPlayerNum;
    if (isMyTurn) {
      stateText.textContent = "Your Turn! Attack!";
      stateText.style.color = 'var(--accent)';
      container.classList.add('my-turn');
    } else {
      stateText.textContent = "Opponent's Turn...";
      stateText.style.color = 'var(--text-muted)';
      container.classList.remove('my-turn');
    }
    
    if (state.currentTurn === 1) {
      p1Badge.classList.add('active-turn');
      p2Badge.classList.remove('active-turn');
    } else {
      p2Badge.classList.add('active-turn');
      p1Badge.classList.remove('active-turn');
    }
  }
}
