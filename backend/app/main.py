import json
import pathlib
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from .game import manager

app = FastAPI(title="PixelHunter")

frontend_dir = pathlib.Path(__file__).parent.parent.parent / "frontend"
app.mount("/src", StaticFiles(directory=frontend_dir / "src"), name="src")

@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    html_path = frontend_dir / "public" / "index.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    await manager.connect(ws)
    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            await manager.handle_message(ws, data)
    except WebSocketDisconnect:
        await manager.disconnect(ws)
    except Exception:
        await manager.disconnect(ws)
