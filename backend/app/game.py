import json
import uuid
from typing import Dict, Set, Optional
from fastapi import WebSocket
from .config import GRID_WIDTH, GRID_HEIGHT, TOTAL_PIXELS, MAX_PIXELS, DEFAULT_COLOR

import subprocess

def get_git_version():
    try:
        # Try to get the latest tag
        tag = subprocess.check_output(['git', 'describe', '--tags', '--always'], stderr=subprocess.STDOUT).decode('utf-8').strip()
        return tag
    except:
        try:
            # Fallback to commit ID
            commit = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], stderr=subprocess.STDOUT).decode('utf-8').strip()
            return f"rev-{commit}"
        except:
            return "v1.0.0-dev"

class Player:
    def __init__(self, ws: WebSocket, username: str, color: str):
        self.ws = ws
        self.username = username
        self.color = color
        self.score = 0
        self.combo = 0
        self.locked_pixels: Set[int] = set()
        self.hits_on_me: Set[int] = set()
        self.misses_on_me: Set[int] = set()
        
class GameSession:
    def __init__(self, room_name: str):
        self.id = str(uuid.uuid4())
        self.name = room_name
        self.p1: Optional[Player] = None
        self.p2: Optional[Player] = None
        self.state = "WAITING"
        self.turn = 1

    async def broadcast(self, message: dict):
        payload = json.dumps(message)
        for p in [self.p1, self.p2]:
            if p and p.ws:
                try:
                    await p.ws.send_text(payload)
                except Exception:
                    pass

    def get_player(self, ws: WebSocket) -> Optional[Player]:
        if self.p1 and self.p1.ws == ws: return self.p1
        if self.p2 and self.p2.ws == ws: return self.p2
        return None

    def get_opponent(self, ws: WebSocket) -> Optional[Player]:
        if self.p1 and self.p1.ws == ws: return self.p2
        if self.p2 and self.p2.ws == ws: return self.p1
        return None
        
    def player_num(self, ws: WebSocket) -> int:
        if self.p1 and self.p1.ws == ws: return 1
        if self.p2 and self.p2.ws == ws: return 2
        return 0

class GameManager:
    def __init__(self):
        self.games: Dict[str, GameSession] = {}
        self.ws_to_game: Dict[WebSocket, GameSession] = {}
        self.lobby_players: Dict[WebSocket, dict] = {}
        self.all_connected: set = set()  # every WebSocket, home + lobby + in-game
        self.version = get_git_version()

    @property
    def total_users(self) -> int:
        return len(self.all_connected)

    async def connect(self, ws: WebSocket):
        self.all_connected.add(ws)
        # Initial push of count and version to new connection
        await ws.send_text(json.dumps({
            "type": "lobby_update", 
            "rooms": self.get_lobby_info(), 
            "online": self.total_users,
            "version": self.version
        }))
        await self.broadcast_lobby()

    def get_lobby_info(self):
        rooms = []
        for g_id, game in self.games.items():
            if game.state == "WAITING" and game.p1:
                rooms.append({
                    "id": game.id,
                    "name": game.name,
                    "host": game.p1.username
                })
        return rooms

    async def broadcast_lobby(self):
        payload = json.dumps({"type": "lobby_update", "rooms": self.get_lobby_info(), "online": self.total_users, "version": self.version})
        dead = []
        # Broadcast to EVERYONE connected, not just lobby players
        for ws in self.all_connected:
            try:
                await ws.send_text(payload)
            except:
                dead.append(ws)
        for ws in dead:
            self.all_connected.discard(ws)
            if ws in self.lobby_players:
                del self.lobby_players[ws]

    async def join_lobby(self, ws: WebSocket, username: str, color: str):
        self.lobby_players[ws] = {"username": username, "color": color}
        await self.broadcast_lobby()

    async def create_room(self, ws: WebSocket, room_name: str):
        if ws not in self.lobby_players: return
        user_info = self.lobby_players[ws]
        
        game = GameSession(room_name)
        game.p1 = Player(ws, user_info["username"], user_info["color"])
        
        self.games[game.id] = game
        self.ws_to_game[ws] = game
        del self.lobby_players[ws]
        
        await ws.send_text(json.dumps({
            "type": "game_state", 
            "state": game.state, 
            "player_num": 1,
            "p1_name": user_info["username"], 
            "p2_name": None,
            "p1_score": 0, "p2_score": 0,
            "grid_w": GRID_WIDTH, "grid_h": GRID_HEIGHT
        }))
        
        await self.broadcast_lobby()

    async def join_room(self, ws: WebSocket, room_id: str):
        if ws not in self.lobby_players: return
        user_info = self.lobby_players[ws]
        
        game = self.games.get(room_id)
        if not game or game.state != "WAITING":
            await ws.send_text(json.dumps({"type": "error", "message": "Room not available."}))
            return
            
        game.p2 = Player(ws, user_info["username"], user_info["color"])
        self.ws_to_game[ws] = game
        del self.lobby_players[ws]
        
        game.state = "PLACEMENT"
        await game.broadcast({
            "type": "game_state", 
            "state": game.state,
            "p1_name": game.p1.username, 
            "p2_name": game.p2.username,
            "p1_score": 0, "p2_score": 0
        })
        await ws.send_text(json.dumps({"type": "player_num", "player_num": 2, "grid_w": GRID_WIDTH, "grid_h": GRID_HEIGHT}))
        
        await self.broadcast_lobby()

    async def disconnect(self, ws: WebSocket):
        self.all_connected.discard(ws)
        if ws in self.lobby_players:
            del self.lobby_players[ws]
            
        game = self.ws_to_game.get(ws)
        if not game: return
        
        opp = game.get_opponent(ws)
        if opp and opp.ws:
            game.state = "GAME_OVER"
            try:
                await opp.ws.send_text(json.dumps({"type": "opponent_disconnected"}))
            except Exception:
                pass
                
        if game.id in self.games:
            del self.games[game.id]
        if ws in self.ws_to_game:
            del self.ws_to_game[ws]
        await self.broadcast_lobby()

    async def handle_message(self, ws: WebSocket, data: dict):
        msg_type = data.get("type")
        
        if msg_type == "join_lobby":
            await self.join_lobby(ws, data.get("username", "Anon"), data.get("color", DEFAULT_COLOR))
            return
            
        if msg_type == "create_room":
            room_name = data.get("room_name", "Battle Room")
            await self.create_room(ws, room_name)
            return
            
        if msg_type == "join_room":
            room_id = data.get("room_id")
            await self.join_room(ws, room_id)
            return

        game = self.ws_to_game.get(ws)
        if not game: return
        player = game.get_player(ws)
        if not player: return

        if msg_type == "lock_pixels" and game.state == "PLACEMENT":
            pixels = data.get("pixels", [])
            if len(pixels) == MAX_PIXELS:
                player.locked_pixels = set(pixels)
                
            if game.p1 and game.p2 and game.p1.locked_pixels and game.p2.locked_pixels:
                game.state = "PLAYING"
                game.turn = 1
                await game.broadcast({
                    "type": "start_playing",
                    "turn": game.turn
                })

        elif msg_type == "guess" and game.state == "PLAYING":
            if game.player_num(ws) != game.turn:
                return
                
            index = int(data.get("index", -1))
            opp = game.get_opponent(ws)
            if not opp:
                return
            if index < 0 or index >= TOTAL_PIXELS or index in opp.hits_on_me or index in opp.misses_on_me:
                return
                
            hit = index in opp.locked_pixels
            if hit:
                opp.hits_on_me.add(index)
                player.combo += 1
                if player.combo == 1:
                    player.score += 1
                elif player.combo == 2:
                    player.score += 99
                else:
                    pts = min(500, (player.combo - 1) * 100)
                    player.score += pts
            else:
                opp.misses_on_me.add(index)
                player.combo = 0
                player.score -= 1
                game.turn = 2 if game.turn == 1 else 1

            game_over = False
            winner = 0
            if len(opp.hits_on_me) >= 11 or player.score >= 1000:
                game_over = True
                game.state = "GAME_OVER"
                winner = game.player_num(ws)

            await game.broadcast({
                "type": "guess_result",
                "guesser_num": game.player_num(ws),
                "index": index,
                "hit": hit,
                "color": opp.color if hit else None,
                "turn": game.turn,
                "p1_score": game.p1.score,
                "p2_score": game.p2.score,
                "game_over": game_over,
                "winner": winner
            })

manager = GameManager()
