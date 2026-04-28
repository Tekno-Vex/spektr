import json
import os

import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.analyses import router

app = FastAPI(title="Spektr API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


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
