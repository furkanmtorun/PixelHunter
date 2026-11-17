# PixelHunter Technical Architecture

This document describes the codebase architecture for the **PixelHunter** Battleship game.

## Overview

PixelHunter uses a modular architecture with a **FastAPI/WebSocket backend** and a **Vanilla JS/HTML5 Canvas frontend**. The game runs entirely over WebSockets using JSON message passing.

State is held in memory in a **single process**. Do not scale the service to multiple workers or instances: players in the same room must land on the same process.

---

## Directory Structure

```text
PixelHunter/
├── backend/
│   ├── app/
│   │   ├── config.py          # Board, scoring and phase constants
│   │   ├── rules.py           # Pure scoring / win-condition helpers
│   │   ├── models.py          # Player, GameSession, JSON send helpers
│   │   ├── manager.py         # Lobby, matchmaking, turn handling
│   │   ├── version.py         # Deployed revision (Render/git), cached
│   │   └── main.py            # FastAPI app, static serving, /ws, /healthz
│   ├── tests/                 # Pytest suites (protocol + rules)
│   ├── pytest.ini
│   ├── requirements.txt       # Runtime dependencies (used by Render)
│   └── requirements-dev.txt   # Runtime + pytest/httpx
├── frontend/
│   ├── public/index.html      # Markup, module preloads, non-blocking font
│   ├── src/
│   │   ├── css/style.css
│   │   └── js/
│   │       ├── config.js      # Palette, phases, shared state
│   │       ├── dom.js         # Cached DOM lookups
│   │       ├── canvas.js      # Rendering, hover layer, pointer mapping
│   │       ├── network.js     # WebSocket, message dispatch, reconnect
│   │       ├── ui.js          # DOM updates, lobby list, toasts
│   │       └── main.js        # Bootstrapping and input handling
│   ├── tests/                 # `node --test` suites
│   └── package.json
├── render.yaml                # Optional Render Blueprint
├── run.sh                     # Local setup + tests + dev server
└── TECH_README.md
```

---

## Data Flow

1. **Client → Server:** A canvas/DOM listener in `frontend/src/js/main.js` calls `send()` from `network.js`, which serialises a JSON payload (e.g. `{"type":"guess","index":45}`).
2. **Server:** `backend/app/main.py` parses the frame and calls `GameManager.handle_message()` in `manager.py`.
3. **Game state:** `GameManager` validates the action, updates the `GameSession`, and applies scoring through `rules.py`.
4. **Server → Client:** Results are fanned out to both players concurrently via `GameSession.broadcast()`.
5. **Client UI:** `network.js` dispatches to a handler map, updates local state, and schedules a single canvas repaint via `requestAnimationFrame`.

### Message types

| Direction | Type | Purpose |
|---|---|---|
| C → S | `join_lobby` | Register username/color for matchmaking |
| C → S | `create_room` | Create a waiting room (creator becomes player 1) |
| C → S | `join_room` | Join a waiting room (becomes player 2) |
| C → S | `lock_pixels` | Submit exactly 20 hidden pixels |
| C → S | `guess` | Attack a cell |
| S → C | `lobby_update` | Room list, online count, version (lobby clients) |
| S → C | `presence` | Online count only (in-game clients) |
| S → C | `game_state` | Personalised phase/seat/score snapshot |
| S → C | `start_playing` | Both players locked in |
| S → C | `guess_result` | Hit/miss, scores, turn, game-over info |
| S → C | `opponent_disconnected` | Match abandoned |
| S → C | `error` | Invalid or rejected action |

---

## Performance Notes

The refactor focuses on removing work from the hot paths:

- **Concurrent fan-out.** Broadcasts await all socket writes with `asyncio.gather` instead of sending serially.
- **Coalesced lobby updates.** A burst of connects produces one lobby snapshot, not one per connect, so cost stays O(n) instead of O(n²).
- **Smaller audience.** In-game clients receive `presence` (just the online count) instead of the full room list; only lobby clients get `lobby_update`.
- **One state message.** `game_state` is personalised per player, eliminating the extra `player_num` round-trip and duplicate canvas setup.
- **Cached/compressed assets.** GZip middleware compresses CSS/JS/HTML, static files are served with ETag + `Cache-Control`, and `index.html` uses `FileResponse` (304s for free).
- **Non-blocking font.** Google Fonts loads without blocking first paint; modules are `modulepreload`ed.
- **Cheap rendering.** Board paints are coalesced per animation frame, the hover layer is separate, canvas rects are cached, and the board uses an opaque 2D context with DPR scaling.
- **Robust versioning.** The footer revision prefers Render's `RENDER_GIT_COMMIT` and falls back to `git describe`, so boot does not depend on a git binary. Test-only dependencies are in `requirements-dev.txt`, keeping the Render install lean.
- **Lean runtime deps.** `uvicorn[standard]` brings `uvloop`/`httptools` for faster HTTP and WebSocket handling.

### Measured impact (local loopback)

| Check | Before | After |
|---|---|---|
| `GET /` transfer | 7.8 KB | 2.4 KB (gzip) |
| `GET /src/css/style.css` | 12.0 KB | 2.9 KB (gzip) |
| `GET /src/js/main.js` | 6.6 KB | 1.7 KB (gzip) |
| Lobby fan-out, 200 sockets @ 1 ms simulated send | 232 ms serial | 3.7 ms concurrent |

Gzip trades a little CPU per response for 65–75% less transfer, which is the right trade over the network (the local times above are dominated by per-request overhead, so judge by bytes rather than loopback latency).

---

## Running Locally

```bash
./run.sh                 # install deps, run tests, start on :8000
SKIP_TESTS=1 ./run.sh    # skip the test pass
```

- Backend tests: `cd backend && pytest -q`
- Frontend tests: `cd frontend && npm test` (Node's built-in runner, no dependencies)

---

## Deployment — Render.com

The repo includes a `render.yaml` Blueprint that matches the recommended setup:

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --ws websockets --proxy-headers` |
| Health check path | `/healthz` |
| Workers | **1** (required — state is in memory) |

### One-time Setup

1. Create a Render account at [render.com](https://render.com).
2. Go to **Blueprints** and connect this GitHub repository (or keep your existing Web Service and mirror the settings above).
3. Deploy. Pushes to the connected branch redeploy automatically.

The footer version comes from `RENDER_GIT_COMMIT`, which Render sets for you.

> **Free tier:** services spin down after inactivity, so the first request after a pause can take a few seconds. Keep the instance warm with a scheduled request to `/healthz` if that matters for your demo.
