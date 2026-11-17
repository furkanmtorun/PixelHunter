import { state, MAX_PIXELS, PHASE } from './config.js';
import { byId } from './dom.js';

const onlineNodes = [];
let versionNodes = null;

export function showToast(message) {
  const toasts = byId('toasts');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toasts.append(toast);
  setTimeout(() => toast.remove(), 4000);
}

export function setOnline(count) {
  if (count === undefined) return;
  if (onlineNodes.length === 0) {
    onlineNodes.push(...document.querySelectorAll('.online-count'));
  }
  const text = String(count);
  for (const node of onlineNodes) {
    if (node.textContent !== text) node.textContent = text;
  }
}

export function setVersion(version) {
  if (!version) return;
  if (versionNodes === null) versionNodes = [...document.querySelectorAll('.game-version')];
  for (const node of versionNodes) {
    if (node.textContent !== version) node.textContent = version;
  }
}

export function setScores(p1Score, p2Score) {
  const p1 = byId('p1-score');
  const p2 = byId('p2-score');
  if (p1Score !== undefined) p1.textContent = p1Score;
  if (p2Score !== undefined) p2.textContent = p2Score;
}

export function updateLockButton() {
  const lockBtn = byId('lock-btn');
  const count = state.myLockedPixels.size;
  const ready = count === MAX_PIXELS;
  lockBtn.textContent = `Lock In (${count}/${MAX_PIXELS})`;
  lockBtn.classList.toggle('ready', ready);
  lockBtn.disabled = !ready;
}

export function updateUI() {
  const stateText = byId('game-state-text');
  const lockBtn = byId('lock-btn');
  const toggleViewBtn = byId('toggle-view-btn');
  const p1Badge = byId('p1-badge');
  const p2Badge = byId('p2-badge');
  const container = byId('canvas-container');

  if (state.gameState === PHASE.WAITING) {
    stateText.textContent = 'Waiting for an opponent to join...';
    p1Badge.style.display = 'none';
    p2Badge.style.display = 'none';
    lockBtn.style.display = 'none';
    toggleViewBtn.style.display = 'none';
    container.classList.remove('my-turn');
  } else if (state.gameState === PHASE.PLACEMENT) {
    stateText.textContent = 'Place your 20 pixels!';
    p1Badge.style.display = 'flex';
    p2Badge.style.display = 'flex';
    byId('p1-name').textContent = state.p1Name;
    byId('p2-name').textContent = state.p2Name;

    lockBtn.style.display = 'block';
    updateLockButton();
  } else if (state.gameState === PHASE.PLAYING) {
    lockBtn.style.display = 'none';
    toggleViewBtn.style.display = 'block';
    p1Badge.style.display = 'flex';
    p2Badge.style.display = 'flex';
    byId('p1-name').textContent = state.p1Name;
    byId('p2-name').textContent = state.p2Name;

    const isMyTurn = state.currentTurn === state.myPlayerNum;
    if (isMyTurn) {
      stateText.textContent = 'Your Turn! Attack!';
      stateText.style.color = 'var(--accent)';
      container.classList.add('my-turn');
    } else {
      stateText.textContent = "Opponent's Turn...";
      stateText.style.color = 'var(--text-muted)';
      container.classList.remove('my-turn');
    }

    const p1Turn = state.currentTurn === 1;
    p1Badge.classList.toggle('active-turn', p1Turn);
    p2Badge.classList.toggle('active-turn', !p1Turn);
  } else if (state.gameState === PHASE.GAME_OVER) {
    stateText.textContent = 'Game Over';
    stateText.style.color = 'var(--text-muted)';
    lockBtn.style.display = 'none';
    toggleViewBtn.style.display = 'none';
    container.classList.remove('my-turn');
  }
}

export function renderLobby(rooms) {
  const list = byId('room-list');
  list.replaceChildren();

  if (!rooms || rooms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'room-empty';
    empty.textContent = 'No open games right now. Create one!';
    list.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const room of rooms) {
    const item = document.createElement('div');
    item.className = 'room-item';

    const info = document.createElement('div');
    info.className = 'room-info';

    const name = document.createElement('div');
    name.className = 'room-name';
    name.textContent = room.name;

    const host = document.createElement('div');
    host.className = 'room-host';
    host.textContent = `Host: ${room.host}`;

    info.append(name, host);

    const join = document.createElement('button');
    join.className = 'join-btn';
    join.dataset.roomId = room.id;
    join.textContent = 'Join Game';

    item.append(info, join);
    fragment.append(item);
  }
  list.append(fragment);
}

export function showGameOver({ winner, myPlayerNum, p1Name, p2Name, p1Score, p2Score }) {
  const isWinner = winner === myPlayerNum;
  const title = byId('winner-text');
  title.textContent = isWinner ? 'VICTORY!' : 'DEFEAT';
  title.style.color = isWinner ? 'var(--accent)' : '#ff5a5a';

  byId('final-score-text').textContent =
    `Final Score - ${p1Name}: ${p1Score} | ${p2Name}: ${p2Score}`;

  byId('game-over-overlay').classList.remove('hidden');
  byId('game-over-content').style.display = 'block';
}
