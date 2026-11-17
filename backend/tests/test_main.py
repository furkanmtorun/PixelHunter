"""Protocol-level tests for the HTTP and WebSocket surface."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def recv_until(ws, kind: str, limit: int = 30) -> dict:
    """Read messages until one of the wanted type arrives."""
    for _ in range(limit):
        message = ws.receive_json()
        if message["type"] == kind:
            return message
    raise AssertionError(f"Never received a {kind!r} message")


def recv_open_room(ws, limit: int = 30) -> dict:
    for _ in range(limit):
        message = ws.receive_json()
        if message["type"] == "lobby_update" and message["rooms"]:
            return message["rooms"][0]
    raise AssertionError("No open room appeared in the lobby")


def test_index_is_served() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")


def test_health_endpoint() -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "version" in payload


def test_first_message_is_a_lobby_snapshot() -> None:
    with client.websocket_connect("/ws") as ws:
        message = ws.receive_json()
        assert message["type"] == "lobby_update"
        assert message["online"] >= 1
        assert message["rooms"] == []
        assert message["version"]


def test_create_room_publishes_it_to_the_lobby() -> None:
    # The host leaves the lobby socket pool once seated, so a second client
    # is needed to observe what the lobby advertisement looks like.
    with TestClient(app) as lobby:
        with (
            lobby.websocket_connect("/ws") as host,
            lobby.websocket_connect("/ws") as observer,
        ):
            observer.send_json({"type": "join_lobby", "username": "Watcher", "color": "#5ab4ff"})
            host.send_json({"type": "join_lobby", "username": "Host", "color": "#ff5a5a"})
            host.send_json({"type": "create_room", "room_name": "Host's Game"})

            state = recv_until(host, "game_state")
            assert state["state"] == "WAITING"
            assert state["player_num"] == 1
            assert state["p1_name"] == "Host"

            room = recv_open_room(observer)
            assert room["name"] == "Host's Game"
            assert room["host"] == "Host"


def test_join_room_reports_a_missing_room() -> None:
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "join_lobby", "username": "Ghost", "color": "#5ab4ff"})
        ws.send_json({"type": "join_room", "room_id": "does-not-exist"})
        error = recv_until(ws, "error")
        assert "not available" in error["message"]


def test_full_match_turns_wins_and_rejects_bad_input() -> None:
    # One TestClient context = one shared event loop for both sockets.
    with TestClient(app) as lobby:
        with (
            lobby.websocket_connect("/ws") as p1,
            lobby.websocket_connect("/ws") as p2,
        ):
            p1.send_json({"type": "join_lobby", "username": "Alice", "color": "#ff5a5a"})
            p2.send_json({"type": "join_lobby", "username": "Bob", "color": "#5ab4ff"})
            p1.send_json({"type": "create_room", "room_name": "Test Room"})

            created = recv_until(p1, "game_state")
            assert created["player_num"] == 1

            room = recv_open_room(p2)
            p2.send_json({"type": "join_room", "room_id": room["id"]})

            state_p1 = recv_until(p1, "game_state")
            state_p2 = recv_until(p2, "game_state")
            assert state_p1["state"] == "PLACEMENT"
            assert state_p2["state"] == "PLACEMENT"
            assert state_p1["player_num"] == 1
            assert state_p2["player_num"] == 2
            assert state_p1["p2_name"] == "Bob"

            p1.send_json({"type": "lock_pixels", "pixels": [True, 2]})  # invalid
            recv_until(p1, "error")

            p1.send_json({"type": "lock_pixels", "pixels": list(range(20))})
            p2.send_json({"type": "lock_pixels", "pixels": list(range(20, 40))})

            assert recv_until(p1, "start_playing")["turn"] == 1
            assert recv_until(p2, "start_playing")["turn"] == 1

            # p1 misses -> turn passes, score drops.
            p1.send_json({"type": "guess", "index": 50})
            miss = recv_until(p2, "guess_result")
            assert miss["hit"] is False
            assert miss["turn"] == 2
            assert miss["p1_score"] == -1

            # Out-of-turn guesses are ignored: if this leaked through, p2
            # would read Alice's result instead of its own below.
            p1.send_json({"type": "guess", "index": 0})

            # p2 hits and keeps the turn.
            p2.send_json({"type": "guess", "index": 0})
            first_hit = recv_until(p2, "guess_result")
            assert first_hit["hit"] is True
            assert first_hit["guesser_num"] == 2
            assert first_hit["turn"] == 2
            assert first_hit["p2_score"] == 1

            # Re-guessing a used cell is ignored; the next result is index 1.
            p2.send_json({"type": "guess", "index": 0})
            p2.send_json({"type": "guess", "index": 1})
            second_hit = recv_until(p2, "guess_result")
            assert second_hit["index"] == 1
            assert second_hit["p2_score"] == 100  # 1 + 99

            # Three more hits push the combo score to 1 + 99 + 200 + 300 + 400,
            # i.e. the 1000-point win condition, before 11 hits are reached.
            last = second_hit
            for index in range(2, 5):
                p2.send_json({"type": "guess", "index": index})
                last = recv_until(p2, "guess_result")

            assert last["game_over"] is True
            assert last["winner"] == 2
            assert last["p2_score"] == 1000
            assert last["p1_score"] == -1
