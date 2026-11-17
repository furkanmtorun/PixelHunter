"""Connection-bound game state.

One `Player` per WebSocket, two players per `GameSession`. Nothing here
touches the lobby; that lives in `manager.py`.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from typing import Iterable, Optional

from fastapi import WebSocket

from .config import GRID_HEIGHT, GRID_WIDTH, STATE_WAITING


async def send_json(ws: WebSocket, message: dict) -> bool:
    """Send one JSON message. Returns False when the socket is dead."""
    try:
        await ws.send_text(json.dumps(message, separators=(",", ":")))
        return True
    except Exception:
        return False


async def broadcast_sockets(sockets: Iterable[WebSocket], message: dict) -> set[WebSocket]:
    """Fan a message out concurrently and return the sockets that failed."""
    targets = list(sockets)
    if not targets:
        return set()

    results = await asyncio.gather(
        *(send_json(ws, message) for ws in targets),
        return_exceptions=True,
    )
    return {ws for ws, ok in zip(targets, results) if ok is not True}


@dataclass
class Player:
    ws: WebSocket
    username: str
    color: str
    score: int = 0
    combo: int = 0
    locked_pixels: set[int] = field(default_factory=set)
    hits_on_me: set[int] = field(default_factory=set)
    misses_on_me: set[int] = field(default_factory=set)

    async def send(self, message: dict) -> bool:
        return await send_json(self.ws, message)


@dataclass
class GameSession:
    name: str
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    p1: Optional[Player] = None
    p2: Optional[Player] = None
    state: str = STATE_WAITING
    turn: int = 1

    @property
    def players(self) -> list[Player]:
        return [p for p in (self.p1, self.p2) if p is not None]

    def player(self, ws: WebSocket) -> Optional[Player]:
        for player in self.players:
            if player.ws is ws:
                return player
        return None

    def opponent(self, ws: WebSocket) -> Optional[Player]:
        player = self.player(ws)
        if player is None:
            return None
        return self.p2 if player is self.p1 else self.p1

    def player_num(self, ws: WebSocket) -> int:
        player = self.player(ws)
        if player is None:
            return 0
        return 1 if player is self.p1 else 2

    @property
    def room_info(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "host": self.p1.username if self.p1 else "",
        }

    def state_message(self, player_num: int) -> dict:
        """Per-player snapshot: each client only learns its own seat."""
        return {
            "type": "game_state",
            "state": self.state,
            "player_num": player_num,
            "p1_name": self.p1.username if self.p1 else None,
            "p2_name": self.p2.username if self.p2 else None,
            "p1_score": self.p1.score if self.p1 else 0,
            "p2_score": self.p2.score if self.p2 else 0,
            "turn": self.turn,
            "grid_w": GRID_WIDTH,
            "grid_h": GRID_HEIGHT,
        }

    async def send_state(self) -> set[Player]:
        """Send a personalised state message to every seated player."""
        targets = self.players
        if not targets:
            return set()
        results = await asyncio.gather(
            *(p.send(self.state_message(self.player_num(p.ws))) for p in targets),
            return_exceptions=True,
        )
        return {p for p, ok in zip(targets, results) if ok is not True}

    async def broadcast(self, message: dict) -> set[Player]:
        targets = self.players
        if not targets:
            return set()
        results = await asyncio.gather(
            *(p.send(message) for p in targets),
            return_exceptions=True,
        )
        return {p for p, ok in zip(targets, results) if ok is not True}
