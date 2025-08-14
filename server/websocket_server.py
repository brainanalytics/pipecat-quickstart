import os
import threading
import asyncio
from typing import Optional, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from loguru import logger


app = FastAPI(title="Pipecat Companion WS")

# Allow local dev from the Next.js client
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


class PingSubscriptionManager:
    def __init__(self) -> None:
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._counter: int = 0
        self._task: Optional[asyncio.Task] = None

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            try:
                self._connections.discard(websocket)
            except Exception:
                pass

    async def _broadcast(self, payload: dict) -> None:
        dead: list[WebSocket] = []
        async with self._lock:
            for ws in list(self._connections):
                try:
                    await ws.send_json(payload)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                try:
                    self._connections.discard(ws)
                except Exception:
                    pass

    async def _run_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(1.0)
                self._counter += 1
                await self._broadcast({"type": "ping", "count": self._counter})
        except asyncio.CancelledError:
            logger.info("Ping loop cancelled")

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        loop = asyncio.get_event_loop()
        self._task = loop.create_task(self._run_loop())

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass


ping_manager = PingSubscriptionManager()

# Capture uvicorn loop and create a queue for cross-loop reasoning broadcasts
_uvicorn_loop: Optional[asyncio.AbstractEventLoop] = None
_reasoning_queue: Optional[asyncio.Queue] = None
_reasoning_worker_task: Optional[asyncio.Task] = None


@app.on_event("startup")
async def on_startup() -> None:
    ping_manager.start()
    global _uvicorn_loop, _reasoning_queue, _reasoning_worker_task
    _uvicorn_loop = asyncio.get_running_loop()
    _reasoning_queue = asyncio.Queue()

    async def _reasoning_worker() -> None:
        while True:
            payload = await _reasoning_queue.get()
            try:
                await reasoning_manager.broadcast(payload)
            except Exception as exc:
                logger.exception(f"Reasoning broadcast failed: {exc}")

    _reasoning_worker_task = _uvicorn_loop.create_task(_reasoning_worker())


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await ping_manager.stop()
    global _reasoning_worker_task
    if _reasoning_worker_task and not _reasoning_worker_task.done():
        _reasoning_worker_task.cancel()
        try:
            await _reasoning_worker_task
        except asyncio.CancelledError:
            pass


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        await websocket.send_json({"type": "welcome", "message": "connected"})
        while True:
            message = await websocket.receive_text()
            if message.lower().strip() == "ping":
                await websocket.send_text("pong")
            else:
                # Simple echo for now
                await websocket.send_text(f"echo: {message}")
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as exc:
        logger.exception(f"WebSocket error: {exc}")


@app.websocket("/ws/ping")
async def websocket_ping_subscription(websocket: WebSocket):
    await ping_manager.connect(websocket)
    try:
        # Optional: allow client messages but ignore them
        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    finally:
        await ping_manager.disconnect(websocket)


class ReasoningSubscriptionManager:
    def __init__(self) -> None:
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            try:
                self._connections.discard(websocket)
            except Exception:
                pass

    async def broadcast(self, payload: dict) -> None:
        dead: list[WebSocket] = []
        async with self._lock:
            for ws in list(self._connections):
                try:
                    await ws.send_json(payload)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                try:
                    self._connections.discard(ws)
                except Exception:
                    pass


reasoning_manager = ReasoningSubscriptionManager()


@app.websocket("/ws/reasoning")
async def websocket_reasoning_subscription(websocket: WebSocket):
    await reasoning_manager.connect(websocket)
    try:
        # Keep the connection open; ignore client messages
        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    finally:
        await reasoning_manager.disconnect(websocket)


def enqueue_reasoning(payload: dict) -> None:
    """Thread-safe enqueue of reasoning payload for broadcast on the uvicorn loop."""
    if _uvicorn_loop is None or _reasoning_queue is None:
        # Server not yet ready
        return
    try:
        asyncio.run_coroutine_threadsafe(_reasoning_queue.put(payload), _uvicorn_loop)
    except Exception as exc:
        logger.exception(f"Failed to enqueue reasoning payload: {exc}")


_server_thread: Optional[threading.Thread] = None


def _run_uvicorn_server() -> None:
    host = os.getenv("WS_HOST", os.getenv("HOST", "0.0.0.0"))
    port = int(os.getenv("WS_PORT", "7870"))
    logger.info(f"Starting companion WebSocket server on {host}:{port}")
    config = uvicorn.Config(app, host=host, port=port, log_level="info")
    server = uvicorn.Server(config)
    server.run()


def start_websocket_server_in_background() -> None:
    global _server_thread
    if _server_thread and _server_thread.is_alive():
        return
    _server_thread = threading.Thread(target=_run_uvicorn_server, daemon=True)
    _server_thread.start()
