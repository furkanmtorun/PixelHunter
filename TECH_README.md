# PixelHunter Technical Architecture

This document describes the codebase architecture for the **PixelHunter** Battleship game.

## Overview
PixelHunter uses a modular architecture with a **FastAPI/WebSocket backend** and a **Vanilla JS/HTML5 Canvas frontend**. The game runs completely over WebSockets using JSON message passing.

---

## Directory Structure

```text
RealTimeApp/
├── backend/                  # Python backend application
│   ├── app/
│   │   ├── config.py         # Game constants (grid size, limits)
│   │   ├── game.py           # Core game logic (Player, GameSession, GameManager)
│   │   └── main.py           # FastAPI entry point, static serving, WebSocket routing
│   ├── tests/                # Pytest suites
│   └── requirements.txt      # Python dependencies
├── frontend/                 # Static frontend application
│   ├── public/
│   │   └── index.html        # Main HTML skeleton and layout
│   ├── src/
│   │   ├── css/
│   │   │   └── style.css     # UI styles and animations
│   │   └── js/               # Modularized ES6 game logic
│   │       ├── canvas.js     # Grid and pixel rendering
│   │       ├── config.js     # Shared configuration and game state
│   │       ├── main.js       # Bootstrapping and event listeners
│   │       ├── network.js    # WebSocket handlers and parsers
│   │       └── ui.js         # DOM manipulators and Toasts
│   └── package.json          # Frontend dependencies (optional/testing)
├── README.md                 # Game rules and instructions
├── TECH_README.md            # Technical documentation
└── run.sh                    # Setup and run script
```

---

## Data Flow
1. **Client -> Server (WebSocket):** The user clicks the HTML canvas or interacts with a DOM element. The Javascript event listener (`frontend/src/js/main.js`) triggers `state.ws.send()` with a JSON payload (e.g., `{"type": "guess", "index": 45}`).
2. **Server Handling:** `backend/app/main.py` receives the string, parses it into JSON, and hands it off to `GameManager.handle_message()` inside `backend/app/game.py`.
3. **Game State Processing:** The `GameManager` checks the user's game session. It determines if it's the player's turn, validates the guess against the opponent's `locked_pixels` set, calculates score and combo, and modifies the `GameSession` state.
4. **Server -> Client (WebSocket):** The `GameManager` broadcasts a `{"type": "guess_result", ...}` JSON message back to both connected clients via the `GameSession.broadcast()` function.
5. **Client UI Update:** `frontend/src/js/network.js` parses the message. It updates the client's local `state` object, then triggers `redrawBoard()` and `updateUI()` to visually reflect the hits, misses, scores, and turn indicators.

## Versioning
The game version is dynamically retrieved from Git (Tag or Commit ID) and displayed in the global footer. This allows for clear tracking of deployments and updates.

## Running Locally
Use the provided `run.sh` script to install dependencies, run tests, and boot the Uvicorn server automatically.

---

## Deployment — Render.com

The repo is pre-configured for deployment to [Render.com](https://render.com).

### Files Added
| File | Purpose |
|---|---|
| `requirements.txt` | Python dependencies (FastAPI, uvicorn, etc.) |
| `render.yaml` | Render Blueprint: defines the web service, build, and start commands |

### One-time Setup (you must do this once)

**1. Create a Render Account**
Sign up at [render.com](https://render.com).

**2. Connect your GitHub Repository**
- Go to the **Blueprints** section in your Render dashboard.
- Connect your GitHub account and select this repository.
- Set the `uvicorn app.main:app --host 0.0.0.0 --port $PORT` command in the build settings.

**3. Deploy**
- Render will automatically deploy your app every time you push to the `main` branch.
- Your app will be available at `https://pixelhunter.onrender.com` (or similar).

> Note: On the free tier, Render "spins down" services after inactivity. The first request after a spin-down may take a few seconds to boot up.

