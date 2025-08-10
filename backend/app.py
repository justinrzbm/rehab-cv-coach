import asyncio, json, cv2
from datetime import datetime
from typing import List, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from models import Event
from db import init_db, save

app = FastAPI(title="Rehab CV Coach API")

# Allow your Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

cap = cv2.VideoCapture(0)       # Python owns the webcam (desktop/laptop)
subscribers: Set[WebSocket] = set()
latest_jpeg = None
SESSION_ID = "local"

class Detection(BaseModel):
    x: int; y: int; w: int; h: int

class LivePayload(BaseModel):
    ts: str
    count: int
    detections: List[Detection] = []

async def broadcast(payload: dict):
    dead = []
    for ws in list(subscribers):
        try:
            await ws.send_text(json.dumps(payload))
        except Exception:
            dead.append(ws)
    for ws in dead:
        subscribers.discard(ws)

def run_models(frame_bgr) -> LivePayload:
    # TODO: replace with your MediaPipe/YOLO code
    h, w, _ = frame_bgr.shape
    box = Detection(x=w//4, y=h//4, w=w//3, h=h//3)
    return LivePayload(ts=datetime.utcnow().isoformat(), count=1, detections=[box])

async def capture_loop():
    global latest_jpeg
    while True:
        ok, frame = await asyncio.to_thread(cap.read)
        if not ok:
            await asyncio.sleep(0.05); continue
        results = run_models(frame)

        # Draw for preview
        vis = frame.copy()
        for d in results.detections:
            cv2.rectangle(vis, (d.x, d.y), (d.x + d.w, d.y + d.h), (0, 255, 0), 2)
        _, jpg = cv2.imencode(".jpg", vis)
        latest_jpeg = jpg.tobytes()

        # Log a tiny metric
        evt = Event(session_id=SESSION_ID, ts=datetime.utcnow(),
                    type="count", value_json=json.dumps({"count": results.count}))
        await asyncio.to_thread(save, evt)

        # Push to clients
        await broadcast(results.model_dump())
        await asyncio.sleep(0.05)  # ~20 Hz

@app.on_event("startup")
async def on_start():
    init_db()
    asyncio.create_task(capture_loop())

@app.websocket("/ws")
async def ws_live(ws: WebSocket):
    await ws.accept()
    subscribers.add(ws)
    try:
        while True:
            await ws.receive_text()   # keepalive
    except WebSocketDisconnect:
        pass
    finally:
        subscribers.discard(ws)

@app.get("/metrics")
def get_metrics(since: str | None = Query(None)):
    from sqlmodel import Session, select
    from db import engine
    with Session(engine) as s:
        stmt = select(Event).order_by(Event.ts.desc()).limit(500)
        rows = s.exec(stmt).all()
        return [
            {"id": r.id, "session_id": r.session_id, "ts": r.ts.isoformat(),
             "type": r.type, "value": json.loads(r.value_json)}
            for r in rows
        ]

@app.get("/mjpeg")
async def mjpeg():
    async def gen():
        boundary = b"--frame\r\n"
        while True:
            if latest_jpeg:
                yield boundary + b"Content-Type: image/jpeg\r\n\r\n" + latest_jpeg + b"\r\n"
            await asyncio.sleep(0.05)
    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame")
