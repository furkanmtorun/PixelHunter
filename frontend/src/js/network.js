import { state } from './config.js';
import { initCanvas, redrawBoard } from './canvas.js';
import { updateUI, showToast } from './ui.js';

export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  state.ws = new WebSocket(`${proto}://${location.host}/ws`);

  state.ws.onopen = () => {
    console.log("Connected to server");
  };

  state.ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);

    if (msg.type === 'lobby_update') {
      // Update online count badges
      document.querySelectorAll('.online-count').forEach(el => {
        if (msg.online !== undefined) el.textContent = msg.online;
      });

      // Update version strings
      document.querySelectorAll('.game-version').forEach(el => {
        if (msg.version) el.textContent = msg.version;
      });

      const listEl = document.getElementById('room-list');
      listEl.innerHTML = '';
      
      if (msg.rooms.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; padding: 20px; color:var(--text-muted);">No open games right now. Create one!</div>`;
      } else {
        msg.rooms.forEach(room => {
          const item = document.createElement('div');
          item.className = 'room-item';
          item.innerHTML = `
            <div class="room-info">
              <div class="room-name">${room.name}</div>
              <div class="room-host">Host: ${room.host}</div>
            </div>
            <button class="join-btn" onclick="window.joinRoom('${room.id}')">Join Game</button>
          `;
          listEl.appendChild(item);
        });
      }
    }

    else if (msg.type === 'game_state') {
      state.gameState = msg.state;
      if (msg.player_num) state.myPlayerNum = msg.player_num;
      if (msg.p1_name) state.p1Name = msg.p1_name;
      if (msg.p2_name) state.p2Name = msg.p2_name;
      if (msg.grid_w) state.GRID_W = msg.grid_w;
      if (msg.grid_h) state.GRID_H = msg.grid_h;
      
      initCanvas();
      updateUI();
      
      document.getElementById('lobby-overlay').classList.add('hidden');
    }
    
    else if (msg.type === 'player_num') {
      state.myPlayerNum = msg.player_num;
      if (msg.grid_w) state.GRID_W = msg.grid_w;
      if (msg.grid_h) state.GRID_H = msg.grid_h;
      initCanvas();
    }

    else if (msg.type === 'start_playing') {
      state.gameState = 'PLAYING';
      state.currentTurn = msg.turn;
      showToast("Game started!");
      redrawBoard();
      updateUI();
    }

    else if (msg.type === 'guess_result') {
      const { guesser_num, index, hit, color, turn, p1_score, p2_score, game_over, winner } = msg;
      
      if (guesser_num === state.myPlayerNum) {
        if (hit) state.opponentHits.set(index, color);
        else state.opponentMisses.add(index);
      } else {
        if (hit) state.myHitsOnMe.add(index);
        else state.myMissesOnMe.add(index);
      }
      
      document.getElementById('p1-score').textContent = p1_score;
      document.getElementById('p2-score').textContent = p2_score;
      
      state.currentTurn = turn;
      redrawBoard();
      updateUI();
      
      if (hit) {
        if (state.currentTurn === state.myPlayerNum) showToast("Hit! Keep going! Combo points awarded!");
        else showToast("Opponent scored a hit!");
      } else {
        if (guesser_num !== state.myPlayerNum) showToast("Opponent missed!");
      }

      if (game_over) {
        state.gameState = 'GAME_OVER';
        updateUI();
        document.getElementById('canvas-container').classList.remove('my-turn');
        
        const goOverlay = document.getElementById('game-over-overlay');
        const winText = document.getElementById('winner-text');
        const scoreText = document.getElementById('final-score-text');
        
        goOverlay.classList.remove('hidden');
        document.getElementById('game-over-content').style.display = 'block';
        
        if (winner === state.myPlayerNum) {
          winText.textContent = "VICTORY!";
          winText.style.color = "var(--accent)";
        } else {
          winText.textContent = "DEFEAT";
          winText.style.color = "#ff5a5a";
        }
        scoreText.textContent = `Final Score - ${state.p1Name}: ${p1_score} | ${state.p2Name}: ${p2_score}`;
      }
    }
    
    else if (msg.type === 'opponent_disconnected') {
      if (state.gameState !== 'GAME_OVER') {
        showToast("Opponent disconnected. You win!");
        setTimeout(() => location.reload(), 3000);
      }
    }
    
    else if (msg.type === 'error') {
      showToast(msg.message);
    }
  };

  state.ws.onclose = () => {
    if (state.gameState !== 'GAME_OVER') {
      showToast("Lost connection to server.");
      setTimeout(() => location.reload(), 2000);
    }
  };
}
