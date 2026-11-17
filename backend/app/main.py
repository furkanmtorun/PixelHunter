"""FastAPI entry point: static frontend + the game WebSocket.

Deployment target is Render (`uvicorn app.main:app`), which runs a single
process. Keep it that way - lobby and match state are held in memory.
"""

from __future__ import annotations

import json
import logging
import os
import pathlib

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response

from .manager import manager
from .models import send_json

logger = logging.getLogger("pixelhunter")

BASE_DIR = pathlib.Path(__file__).resolve().parent.parent.parent
FRONTEND_DIR = pathlib.Path(os.environ.get("PIXELHUNTER_FRONTEND_DIR", BASE_DIR / "frontend"))
INDEX_FILE = FRONTEND_DIR / "public" / "index.html"
SRC_DIR = FRONTEND_DIR / "src"


class StaticFilesWithCache(StaticFiles):
    """StaticFiles plus explicit caching so repeat visits skip the body."""

    async def get_response(self, path: str, scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers.setdefault(
                "Cache-Control", "public, max-age=300, stale-while-revalidate=86400"
            )
        return response


app = FastAPI(title="PixelHunter")

# Compress CSS/JS/HTML on the wire. WebSocket frames are not affected.
app.add_middleware(GZipMiddleware, minimum_size=512)

if SRC_DIR.is_dir():
    app.mount("/src", StaticFilesWithCache(directory=SRC_DIR), name="src")


@app.get("/", include_in_schema=False)
async def serve_frontend() -> FileResponse:
    # FileResponse adds ETag/Last-Modified and answers 304 for free.
    return FileResponse(
        INDEX_FILE,
        media_type="text/html",
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/healthz", include_in_schema=False)
async def healthz() -> dict:
    return {"status": "ok", "online": manager.total_users, "version": manager.version}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    try:
        await manager.connect(ws)
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await send_json(ws, {"type": "error", "message": "Invalid message."})
                continue

            try:
                await manager.handle_message(ws, data)
            except Exception:
                # A single malformed action must not take the socket down.
                logger.exception("Failed to handle websocket message")
                await send_json(ws, {"type": "error", "message": "Server error."})
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("WebSocket closed unexpectedly", exc_info=True)
    finally:
        await manager.disconnect(ws)
