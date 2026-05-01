import json
import os

import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler  # type: ignore[import-untyped]
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address  # type: ignore[import-untyped]

from app.api.analyses import router as analyses_router
from app.api.auth import router as auth_router

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Spektr API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(analyses_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.websocket("/ws/analyses/{analysis_id}")
async def websocket_progress(websocket: WebSocket, analysis_id: int):
    await websocket.accept()
    r = aioredis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))
    pubsub = r.pubsub()
    channel = f"analysis:{analysis_id}:progress"

    try:
        await pubsub.subscribe(channel)
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                await websocket.send_json(data)
                if data.get("stage") == "Done":
                    break
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await pubsub.unsubscribe(channel)
        await r.aclose()