import { state, PHASE } from './config.js';
import { initCanvas, redrawBoard, clearHover } from './canvas.js';
import { byId } from './dom.js';
import {
  updateUI,
  showToast,
  renderLobby,
  setOnline,
  setVersion,
  setScores,
  showGameOver,
} from './ui.js';

let reconnectTimer = 0;
let reconnectAttempts = 0;

const handlers = {
  lobby_update(msg) {
    setOnline(msg.online);
    setVersion(msg.version);
    renderLobby(msg.rooms);
  },

  presence(msg) {
    setOnline(msg.online);
  },

  game_state(msg) {
    state.gameState = msg.state;
    state.myPlayerNum = msg.player_num ?? 0;
    state.p1Name = msg.p1_name || 'Player 1';
    state.p2Name = msg.p2_name || 'Player 2';

    if (msg.mode) {
      state.mode = msg.mode;
      state.selectedMode = msg.mode;
      state.modeName = msg.mode_name || msg.mode;
    }
    if (Array.isArray(msg.matrix) && msg.matrix.length === 2) {
      state.GRID_W = msg.matrix[0];
      state.GRID_H = msg.matrix[1];
    } else {
      if (msg.grid_w) state.GRID_W = msg.grid_w;
      if (msg.grid_h) state.GRID_H = msg.grid_h;
    }
    if (typeof msg.max_pixels === 'number') state.maxPixels = msg.max_pixels;
    if (typeof msg.n_hit_to_win === 'number') state.nHitToWin = msg.n_hit_to_win;
    if (typeof msg.scores_to_win === 'number') state.scoresToWin = msg.scores_to_win;
    if (typeof msg.turn === 'number') state.currentTurn = msg.turn;

    setScores(msg.p1_score, msg.p2_score);
    byId('lobby-overlay').classList.add('hidden');
    initCanvas();
    updateUI();
  },

  start_playing(msg) {
    state.gameState = PHASE.PLAYING;
    state.currentTurn = msg.turn;
    showToast('Game started!');
    clearHover();
    redrawBoard();
    updateUI();
  },

  guess_result(msg) {
    const { guesser_num, index, hit, color, turn, p1_score, p2_score } = msg;
    const mine = guesser_num === state.myPlayerNum;

    if (mine) {
      if (hit) state.opponentHits.set(index, color);
      else state.opponentMisses.add(index);
    } else if (hit) {
      state.myHitsOnMe.add(index);
    } else {
      state.myMissesOnMe.add(index);
    }

    setScores(p1_score, p2_score);
    state.currentTurn = turn;
    redrawBoard();
    updateUI();

    if (hit) {
      showToast(mine ? 'Hit! Keep going! Combo points awarded!' : 'Opponent scored a hit!');
    } else if (!mine) {
      showToast('Opponent missed!');
    }

    if (msg.game_over) {
      state.gameState = PHASE.GAME_OVER;
      updateUI();
      showGameOver({
        winner: msg.winner,
        myPlayerNum: state.myPlayerNum,
        p1Name: state.p1Name,
        p2Name: state.p2Name,
        p1Score: p1_score,
        p2Score: p2_score,
      });
    }
  },

  opponent_disconnected() {
    if (state.gameState !== PHASE.GAME_OVER) {
      showToast('Opponent disconnected. You win!');
      setTimeout(() => location.reload(), 3000);
    }
  },

  error(msg) {
    showToast(msg.message);
  },
};

export function send(message) {
  const ws = state.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(message));
  return true;
}

export function joinLobby() {
  if (!state.username) return;
  if (send({ type: 'join_lobby', username: state.username, color: state.myColor })) {
    state.joinedLobby = true;
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;

  const delay = Math.min(30000, 1000 * 2 ** reconnectAttempts);
  reconnectAttempts += 1;
  showToast(`Reconnecting in ${Math.round(delay / 1000)}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = 0;
    connect();
  }, delay);
}

function handleClose() {
  state.ws = null;
  state.joinedLobby = false;

  if (state.gameState === PHASE.GAME_OVER) return;

  if (
    state.gameState === PHASE.WAITING ||
    state.gameState === PHASE.PLACEMENT ||
    state.gameState === PHASE.PLAYING
  ) {
    // A match lives in server memory only; reload to start fresh.
    showToast('Lost connection to the server. Reloading...');
    setTimeout(() => location.reload(), 2000);
    return;
  }

  scheduleReconnect();
}

export function connect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
  }

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  let ws;
  try {
    ws = new WebSocket(`${proto}://${location.host}/ws`);
  } catch {
    scheduleReconnect();
    return;
  }

  state.ws = ws;

  ws.onopen = () => {
    reconnectAttempts = 0;
    // Re-register after a reconnect (or if the user logged in while offline).
    if (state.username && (state.gameState === PHASE.LOGIN || state.gameState === PHASE.LOBBY)) {
      joinLobby();
    }
  };

  ws.onmessage = ({ data }) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    handlers[msg.type]?.(msg);
  };

  ws.onclose = handleClose;
  ws.onerror = () => ws.close();
}
