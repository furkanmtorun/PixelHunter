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
│   │   ├── config.py          # Mode presets, scoring and phase constants
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
| C → S | `create_room` | Create a waiting room (creator becomes player 1); optional `mode` (`easy`/`medium`/`hard`, default `hard`) |
| C → S | `join_room` | Join a waiting room (becomes player 2 and inherits its mode) |
| C → S | `lock_pixels` | Submit the mode's required number of hidden pixels |
| C → S | `guess` | Attack a cell |
| S → C | `lobby_update` | Room list (with mode metadata), online count, version (lobby clients) |
| S → C | `presence` | Online count only (in-game clients) |
| S → C | `game_state` | Personalised phase/seat/score snapshot plus mode, matrix, `max_pixels` and win targets |
| S → C | `start_playing` | Both players locked in |
| S → C | `guess_result` | Hit/miss, scores, turn, game-over info |
| S → C | `opponent_disconnected` | Match abandoned |
| S → C | `error` | Invalid or rejected action |

---

## Game Modes

Modes live in `backend/app/config.py` as the `MODES` dict; the server is the
single source of truth. The host picks a mode on the main screen before
entering the lobby; the room advertises it and the joining player inherits it.
`matrix` is `(columns, rows)`.

| Mode | Matrix | Hidden pixels (`max_pixels`) | Hits to win | Score to win |
|---|---|---|---|---|
| Easy | 3×3 | 4 | 4 | 600 |
| Medium | 6×6 | 12 | 12 | 1000 |
| Hard (default) | 10×10 | 20 | 11 | 1000 |

Scoring is shared by every mode: 1st consecutive hit `+1`, 2nd `+99`, 3rd and
later `min(500, (combo - 1) × 100)`. A miss costs `-1`, resets the combo, and
passes the turn. `rules.has_won()` compares the guesser's score and the
target's hit count against the room's mode.

The frontend mirrors the presets in `frontend/src/js/config.js`
(`MODE_OPTIONS`), but always overwrites them from the authoritative
`game_state` payload (`mode`, `mode_name`, `matrix`, `max_pixels`,
`n_hit_to_win`, `scores_to_win`).

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

The repo includes a `render.yaml` Blueprint using Render's projects/environments
format with two isolated environments:

| Setting | PROD | STAGING |
|---|---|---|
| Environment | `PROD` | `STAGING` |
| Service name | `PixelHunter` | `PixelHunter Staging` |
| Branch | `main` | `staging` |
| Build command | `pip install -r backend/requirements.txt` | same |
| Start command | `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT --ws websockets --proxy-headers` | same |
| Health check path | `/healthz` | `/healthz` |
| Workers | **1** (state is in memory) | **1** |

`main` deploys production and `staging` deploys staging; both auto-deploy on
commit. Root directory is the repo root for both services.

### One-time Setup

1. Create a Render account at [render.com](https://render.com).
2. Go to **Blueprints** and connect this GitHub repository, or import the
   exported `render.yaml` into the existing project.
3. Sync the Blueprint. It creates `PixelHunter Staging` in `STAGING` and keeps
   the existing `PixelHunter` service in `PROD`.
4. Push to `main` to deploy production and to `staging` to deploy staging.

The footer version comes from `RENDER_GIT_COMMIT`, which Render sets for you.

> **Free tier:** services spin down after inactivity, so the first request after a pause can take a few seconds. Keep the instance warm with a scheduled request to `/healthz` if that matters for your demo.
