"""In-memory lobby and matchmaking.

The service is intentionally single-process: all state lives in these dicts.
Run exactly one uvicorn worker (Render's default) so both players land on the
same process.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

from fastapi import WebSocket

from .config import (
    DEFAULT_COLOR,
    MAX_PIXELS,
    ROOM_NAME_MAX_LENGTH,
    STATE_GAME_OVER,
    STATE_PLACEMENT,
    STATE_PLAYING,
    STATE_WAITING,
    TOTAL_PIXELS,
    USERNAME_MAX_LENGTH,
)
from .models import GameSession, Player, broadcast_sockets, send_json
from .rules import has_won, register_hit, register_miss
from .version import get_version

_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

LobbyHandler = Callable[[WebSocket, dict], Awaitable[None]]
GameHandler = Callable[[WebSocket, GameSession, Player, dict], Awaitable[None]]


@dataclass(frozen=True)
class Profile:
    username: str
    color: str


def clean_username(raw: object) -> str:
    name = str(raw or "").strip()[:USERNAME_MAX_LENGTH]
    return name or "Anon"


def clean_color(raw: object) -> str:
    color = str(raw or "").strip()
    return color if _COLOR_RE.match(color) else DEFAULT_COLOR


def clean_room_name(raw: object) -> str:
    name = str(raw or "").strip()[:ROOM_NAME_MAX_LENGTH]
    return name or "Battle Room"


class GameManager:
    def __init__(self) -> None:
        self.games: dict[str, GameSession] = {}
        self.ws_to_game: dict[WebSocket, GameSession] = {}
        self.profiles: dict[WebSocket, Profile] = {}
        self.connected: set[WebSocket] = set()
        self.version = get_version()

        # Concurrent lobby broadcasts are collapsed into a single fan-out.
        # A burst of connects therefore costs O(n), not O(n^2). All of this
        # runs on one event loop, so a plain flag is enough (and unlike an
        # asyncio.Lock it stays usable if the loop is recycled, e.g. in tests).
        self._lobby_running = False
        self._lobby_pending = 0

        self._lobby_actions: dict[str, LobbyHandler] = {
            "join_lobby": self.join_lobby,
            "create_room": self.create_room,
            "join_room": self.join_room,
        }
        self._game_actions: dict[str, GameHandler] = {
            "lock_pixels": self.lock_pixels,
            "guess": self.submit_guess,
        }

    @property
    def total_users(self) -> int:
        return len(self.connected)

    # ── Connection lifecycle ──────────────────────────────────────────

    async def connect(self, ws: WebSocket) -> None:
        self.connected.add(ws)
        await self.broadcast_lobby()

    async def disconnect(self, ws: WebSocket) -> None:
        self.connected.discard(ws)
        self.profiles.pop(ws, None)

        game = self.ws_to_game.pop(ws, None)
        if game is not None:
            opponent = game.opponent(ws)
            if opponent is not None:
                # The match cannot continue with one player, so release the
                # opponent instead of leaving them pinned to a dead session.
                self.ws_to_game.pop(opponent.ws, None)
                game.state = STATE_GAME_OVER
                await opponent.send({"type": "opponent_disconnected"})
            self.games.pop(game.id, None)

        await self.broadcast_lobby()

    # ── Lobby ─────────────────────────────────────────────────────────

    def room_list(self) -> list[dict]:
        return [
            game.room_info
            for game in self.games.values()
            if game.state == STATE_WAITING and game.p1 is not None
        ]

    async def broadcast_lobby(self) -> None:
        self._lobby_pending += 1

        # Nobody is pushing right now: this coroutine takes over. While it
        # awaits the fan-out, later callers only bump the pending counter.
        if self._lobby_running:
            return

        self._lobby_running = True
        try:
            while self._lobby_pending:
                self._lobby_pending = 0
                await self._push_lobby()
        finally:
            self._lobby_running = False

    async def _push_lobby(self) -> None:
        online = self.total_users
        lobby_sockets = [ws for ws in self.connected if ws not in self.ws_to_game]

        results = await asyncio.gather(
            *(
                broadcast_sockets(
                    lobby_sockets,
                    {
                        "type": "lobby_update",
                        "rooms": self.room_list(),
                        "online": online,
                        "version": self.version,
                    },
                ),
                broadcast_sockets(
                    [ws for ws in self.connected if ws in self.ws_to_game],
                    {"type": "presence", "online": online},
                ),
            ),
            return_exceptions=True,
        )

        dead: set[WebSocket] = set()
        for result in results:
            if isinstance(result, set):
                dead |= result
        for ws in dead:
            self.connected.discard(ws)
            self.profiles.pop(ws, None)

    async def join_lobby(self, ws: WebSocket, data: dict) -> None:
        self.profiles[ws] = Profile(
            username=clean_username(data.get("username")),
            color=clean_color(data.get("color")),
        )
        await self.broadcast_lobby()

    async def create_room(self, ws: WebSocket, data: dict) -> None:
        if ws in self.ws_to_game:
            return
        profile = self.profiles.get(ws)
        if profile is None:
            await send_json(ws, {"type": "error", "message": "Join the lobby first."})
            return

        game = GameSession(clean_room_name(data.get("room_name")))
        game.p1 = Player(ws, profile.username, profile.color)
        self.games[game.id] = game
        self.ws_to_game[ws] = game

        await send_json(ws, game.state_message(1))
        await self.broadcast_lobby()

    async def join_room(self, ws: WebSocket, data: dict) -> None:
        if ws in self.ws_to_game:
            return
        profile = self.profiles.get(ws)
        if profile is None:
            await send_json(ws, {"type": "error", "message": "Join the lobby first."})
            return

        room_id = data.get("room_id")
        game = self.games.get(room_id) if isinstance(room_id, str) else None
        if game is None or game.state != STATE_WAITING or game.p1 is None:
            await send_json(ws, {"type": "error", "message": "Room not available."})
            return
        if game.p1.ws is ws:
            await send_json(ws, {"type": "error", "message": "That is your own room."})
            return

        game.p2 = Player(ws, profile.username, profile.color)
        self.ws_to_game[ws] = game
        game.state = STATE_PLACEMENT

        await game.send_state()
        await self.broadcast_lobby()

    # ── Placement ─────────────────────────────────────────────────────

    async def lock_pixels(self, ws: WebSocket, game: GameSession, player: Player, data: dict) -> None:
        if game.state != STATE_PLACEMENT or player.locked_pixels:
            return

        raw = data.get("pixels")
        if not isinstance(raw, list):
            await send_json(ws, {"type": "error", "message": f"Select exactly {MAX_PIXELS} pixels."})
            return
        try:
            pixels = {int(value) for value in raw}
        except (TypeError, ValueError):
            await send_json(ws, {"type": "error", "message": "Invalid pixel selection."})
            return

        if len(pixels) != MAX_PIXELS or any(p < 0 or p >= TOTAL_PIXELS for p in pixels):
            await send_json(ws, {"type": "error", "message": f"Select exactly {MAX_PIXELS} pixels."})
            return

        player.locked_pixels = pixels

        if game.p1 and game.p2 and game.p1.locked_pixels and game.p2.locked_pixels:
            game.state = STATE_PLAYING
            game.turn = 1
            await game.broadcast({"type": "start_playing", "turn": game.turn})

    # ── Turns ─────────────────────────────────────────────────────────

    async def submit_guess(self, ws: WebSocket, game: GameSession, player: Player, data: dict) -> None:
        if game.state != STATE_PLAYING:
            return
        guesser_num = game.player_num(ws)
        if guesser_num != game.turn:
            return

        try:
            index = int(data.get("index", -1))
        except (TypeError, ValueError):
            return

        opponent = game.opponent(ws)
        if opponent is None:
            return
        if index < 0 or index >= TOTAL_PIXELS:
            return
        if index in opponent.hits_on_me or index in opponent.misses_on_me:
            return

        hit = index in opponent.locked_pixels
        if hit:
            register_hit(player, opponent, index)
        else:
            register_miss(player, opponent, index)
            game.turn = 2 if game.turn == 1 else 1

        game_over = has_won(player, opponent)
        winner = 0
        if game_over:
            game.state = STATE_GAME_OVER
            winner = guesser_num

        await game.broadcast(
            {
                "type": "guess_result",
                "guesser_num": guesser_num,
                "index": index,
                "hit": hit,
                "color": opponent.color if hit else None,
                "turn": game.turn,
                "p1_score": game.p1.score if game.p1 else 0,
                "p2_score": game.p2.score if game.p2 else 0,
                "game_over": game_over,
                "winner": winner,
            }
        )

    # ── Dispatch ──────────────────────────────────────────────────────

    async def handle_message(self, ws: WebSocket, data: Optional[dict]) -> None:
        if not isinstance(data, dict):
            return

        action = data.get("type")
        if not isinstance(action, str):
            return

        lobby_handler = self._lobby_actions.get(action)
        if lobby_handler is not None:
            await lobby_handler(ws, data)
            return

        game = self.ws_to_game.get(ws)
        if game is None:
            return
        player = game.player(ws)
        if player is None:
            return

        game_handler = self._game_actions.get(action)
        if game_handler is not None:
            await game_handler(ws, game, player, data)


manager = GameManager()
