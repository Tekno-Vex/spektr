import json
import logging
import os
import sys

import redis.asyncio as aioredis
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler  # type: ignore[import-untyped]
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address  # type: ignore[import-untyped]

from app.api.analyses import router as analyses_router
from app.api.auth import router as auth_router

# Structured JSON logging — every log line is a valid JSON object
logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","name":"%(name)s","msg":%(message)s}',
)
logger = logging.getLogger("spektr")

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Spektr API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error('"unhandled_error: %s %s - %s"', request.method, request.url.path, str(exc))
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


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
