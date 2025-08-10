import asyncio, json, cv2, math, os, sys, time
from datetime import datetime
from typing import List, Set, Optional, Dict, Any, Tuple
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from models import Event
from db import init_db, save

# Ensure local imports work (e.g., exercises/*)
sys.path.append(os.path.dirname(__file__))

app = FastAPI(title="Rehab CV Coach API")

# -----------------------------------------------------------------------------
# CORS
# -----------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080", "http://127.0.0.1:8080",
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:4173", "http://127.0.0.1:4173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# Camera / WS State
# -----------------------------------------------------------------------------
cap: Optional[cv2.VideoCapture] = None
subscribers: Set[WebSocket] = set()
latest_jpeg: Optional[bytes] = None
SESSION_ID = "local"

# Debug + YOLO params from env
DEBUG_OVERLAY = os.getenv("DEBUG_OVERLAY", "0").strip() in ("1", "true", "True")
YOLO_IMGSZ = int(os.getenv("YOLO_IMGSZ", "512"))  # 512 is friendlier on CPU
YOLO_CONF   = float(os.getenv("YOLO_CONF", "0.25"))

# FPS estimator
_last_ts = None
_fps = 0.0

# -----------------------------------------------------------------------------
# Session Config
# -----------------------------------------------------------------------------
session_cfg: Dict[str, Any] = {"dominant": "right", "target_mode": "fixed"}

# -----------------------------------------------------------------------------
# Live Payload
# -----------------------------------------------------------------------------
class Detection(BaseModel):
    x: int; y: int; w: int; h: int

class LivePayload(BaseModel):
    ts: str
    count: int
    detections: List[Detection] = []
    active_task: Optional[str] = None
    progress: Optional[float] = None
    event: Optional[str] = None
    task: Optional[str] = None

async def broadcast(payload: dict):
    dead = []
    for ws in list(subscribers):
        try:
            await ws.send_text(json.dumps(payload))
        except Exception:
            dead.append(ws)
    for ws in dead:
        subscribers.discard(ws)

# -----------------------------------------------------------------------------
# Models: YOLO + MediaPipe (lazy)
# -----------------------------------------------------------------------------
YOLO_READY = False
MP_READY = False
model = None
mp_hands = mp_pose = mp_face = None
hands = pose = face = None


def _lazy_init_models():
    """Load YOLO + MediaPipe once (CPU by default)."""
    global YOLO_READY, MP_READY, model, mp_hands, mp_pose, mp_face, hands, pose, face
    if not YOLO_READY:
        try:
            from ultralytics import YOLO
            model = YOLO("yolov10b.pt")  # COCO weights (bottle=39)
            YOLO_READY = True
        except Exception as e:
            print(f"[WARN] YOLO init failed: {e}")
            YOLO_READY = False
    if not MP_READY:
        try:
            import mediapipe as mp
            mp_hands = mp.solutions.hands
            mp_pose  = mp.solutions.pose
            mp_face  = mp.solutions.face_mesh
            # light configs for realtime
            hands = mp_hands.Hands(static_image_mode=False, max_num_hands=2, model_complexity=0,
                                   min_detection_confidence=0.4, min_tracking_confidence=0.4)
            pose  = mp_pose.Pose(static_image_mode=False, model_complexity=0, enable_segmentation=False,
                                 min_detection_confidence=0.5, min_tracking_confidence=0.5)
            face  = mp_face.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=True,
                                     min_detection_confidence=0.5, min_tracking_confidence=0.5)
            MP_READY = True
        except Exception as e:
            print(f"[WARN] MediaPipe init failed: {e}")
            MP_READY = False

# ---- YOLO helper: class filtering (bottle-like) ------------------------------
_ALLOWED = ["bottle", "cup", "wine glass"]

def _resolve_class_ids() -> Optional[list]:
    if not YOLO_READY:
        return None
    names = getattr(model, "names", None)
    try:
        if isinstance(names, dict):
            idx = {str(v).lower(): int(k) for k, v in names.items()}
        else:
            idx = {str(v).lower(): i for i, v in enumerate(names)}
        out = [idx.get(n) for n in _ALLOWED]
        out = [i for i in out if i is not None]
        return out or None
    except Exception:
        return None


def _detect_bottle_xyxy(frame_bgr):
    """Return (x1,y1,x2,y2,score) of top bottle-like detection or None."""
    if not YOLO_READY:
        return None
    h, w = frame_bgr.shape[:2]
    try:
        classes = _resolve_class_ids()  # prefer bottle/cup/glass
        res = model.predict(source=frame_bgr, imgsz=YOLO_IMGSZ, conf=YOLO_CONF,
                            device="cpu", verbose=False, classes=classes)[0]
        if res.boxes is None:
            return None
        best = None
        for b in res.boxes:
            score = float(b.conf[0])
            x1, y1, x2, y2 = map(int, b.xyxy[0].cpu().numpy())
            x1 = max(0, min(x1, w-1)); x2 = max(0, min(x2, w-1))
            y1 = max(0, min(y1, h-1)); y2 = max(0, min(y2, h-1))
            if x2 <= x1 or y2 <= y1:
                continue
            if (best is None) or (score > best[-1]):
                best = (x1, y1, x2, y2, score)
        return best
    except Exception as e:
        print(f"[WARN] YOLO predict failed: {e}")
        return None

# ---- MediaPipe helpers -------------------------------------------------------

def _mouth_and_ear_metrics(img_rgb):
    """Return ((mx,my), head_width_px) where head_width≈ear distance; values may be None."""
    if not MP_READY:
        return (None, None)
    fr = face.process(img_rgb)
    pr = pose.process(img_rgb)
    mouth_center = None
    head_width = None
    h, w, _ = img_rgb.shape
    if fr.multi_face_landmarks:
        landmarks = fr.multi_face_landmarks[0].landmark
        upper = landmarks[13]; lower = landmarks[14]
        mouth_center = (int((upper.x + lower.x) * w / 2), int((upper.y + lower.y) * h / 2))
    try:
        lms = pr.pose_landmarks.landmark
        l_ear = lms[mp_pose.PoseLandmark.LEFT_EAR]
        r_ear = lms[mp_pose.PoseLandmark.RIGHT_EAR]
        lx, ly = int(l_ear.x * w), int(l_ear.y * h)
        rx, ry = int(r_ear.x * w), int(r_ear.y * h)
        head_width = math.hypot(rx - lx, ry - ly)
    except Exception:
        pass
    return mouth_center, head_width


def _hand_landmarks(img_rgb):
    if not MP_READY:
        return {}
    res = hands.process(img_rgb)
    out = {"left": {}, "right": {}}
    if not res.multi_hand_landmarks or not res.multi_handedness:
        return out
    h, w, _ = img_rgb.shape
    for lm, handed in zip(res.multi_hand_landmarks, res.multi_handedness):
        side = handed.classification[0].label.lower()  # 'left' or 'right'
        dic = out["left" if side == "left" else "right"]
        for i, p in enumerate(lm.landmark):
            dic[i] = (int(p.x * w), int(p.y * h))
    return out

# Choose whichever hand is closest to a target point (fallback to any)
HandTip = Tuple[int, int]

def _choose_hand_near(target: Optional[Tuple[int,int]], hands_xy: Dict[str, Dict[int, HandTip]]) -> Optional[Tuple[str, HandTip]]:
    candidates: list[Tuple[str, HandTip, float]] = []
    for side in ("left", "right"):
        tip = hands_xy.get(side, {}).get(8)  # index fingertip
        if tip is None:
            continue
        d = 0.0 if target is None else math.hypot(tip[0] - target[0], tip[1] - target[1])
        candidates.append((side, tip, d))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[2])
    return (candidates[0][0], candidates[0][1])

# -----------------------------------------------------------------------------
# Evaluators (return overlay elements for drawing)
# -----------------------------------------------------------------------------
class BaseEval:
    name: str
    def start(self, **kwargs): ...
    def update(self, frame) -> Dict[str, Any]: ...
    def stop(self): ...

class TimedEval(BaseEval):
    def __init__(self, seconds=3.0):
        self.seconds = seconds; self.t0 = None
    def start(self, **kwargs):
        self.seconds = float(kwargs.get("seconds", self.seconds))
        self.t0 = time.time()
    def update(self, frame):
        dt = time.time() - (self.t0 or time.time())
        return {"passed": dt >= self.seconds, "progress": min(1.0, dt / self.seconds)}
    def stop(self):
        pass

class ReachBottleEval(BaseEval):
    name = "reach_bottle"
    def start(self, **kwargs):
        _lazy_init_models()
    def update(self, frame):
        if not (YOLO_READY and MP_READY):
            return {"passed": False, "progress": 0.0}
        img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        det = _detect_bottle_xyxy(frame)
        hands_xy = _hand_landmarks(img_rgb)
        mouth, head_w = _mouth_and_ear_metrics(img_rgb)
        overlay = []
        if det:
            x1, y1, x2, y2, _ = det
            cx, cy = (x1 + x2)//2, (y1 + y2)//2
            overlay.append(("rect", (x1,y1,x2,y2), (0,255,0), 2))
            overlay.append(("circle", (cx,cy), 6, (0,255,0), -1))
        else:
            return {"passed": False, "progress": 0.0, "overlay": overlay}
        sel = _choose_hand_near((cx,cy), hands_xy)
        if sel:
            _, idx = sel
            overlay.append(("circle", idx, 8, (255,255,255), -1))
        else:
            return {"passed": False, "progress": 0.0, "overlay": overlay}
        if not head_w:
            return {"passed": False, "progress": 0.0, "overlay": overlay}
        dist = math.hypot(idx[0]-cx, idx[1]-cy)
        tol = max(20.0, 0.6 * head_w)
        overlay.append(("text", f"dist={int(dist)} tol={int(tol)}", (10, 60), 0.7, (255,255,255), 2))
        return {"passed": dist <= tol, "progress": max(0.0, min(1.0, 1.0 - dist/(tol*2))), "overlay": overlay}
    def stop(self):
        pass

class GrabHoldEval(BaseEval):
    name = "grab_hold"
    def __init__(self):
        self.t_in = None
    def start(self, **kwargs):
        _lazy_init_models(); self.t_in = None
    def update(self, frame):
        if not (YOLO_READY and MP_READY):
            return {"passed": False, "progress": 0.0}
        img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        det = _detect_bottle_xyxy(frame)
        hands_xy = _hand_landmarks(img_rgb)
        overlay = []
        if not det:
            self.t_in = None
            return {"passed": False, "progress": 0.0, "overlay": overlay}
        x1, y1, x2, y2, _ = det
        cx, cy = (x1 + x2)//2, (y1 + y2)//2
        overlay.append(("rect", (x1,y1,x2,y2), (0,255,0), 2))
        sel = _choose_hand_near((cx,cy), hands_xy)
        if sel:
            _, tip = sel
            overlay.append(("circle", tip, 8, (255,255,255), -1))
        else:
            self.t_in = None
            return {"passed": False, "progress": 0.0, "overlay": overlay}
        inside = (x1 <= tip[0] <= x2) and (y1 <= tip[1] <= y2)
        if inside:
            if self.t_in is None:
                self.t_in = time.time()
            held = time.time() - self.t_in
            overlay.append(("text", f"hold={held:.2f}s", (10, 60), 0.7, (255,255,255), 2))
            return {"passed": held >= 1.5, "progress": min(1.0, held / 1.5), "overlay": overlay}
        else:
            self.t_in = None
            return {"passed": False, "progress": 0.0, "overlay": overlay}
    def stop(self):
        pass

# Lift-to-mouth via external helper if present
LiftProcess = None
MOUTH_SCALE_DEFAULT = 0.8
try:
    from exercises.lift_to_mouth_test import (
        process_frame as _lift_process_frame,
        DEFAULT_MOUTH_SCALE as _MOUTH_SCALE_DEFAULT,
    )
    LiftProcess = _lift_process_frame
    MOUTH_SCALE_DEFAULT = _MOUTH_SCALE_DEFAULT
except Exception:
    LiftProcess = None

class LiftToMouthEval(BaseEval):
    name = "lift_to_mouth"
    def __init__(self):
        self.mouth_scale = MOUTH_SCALE_DEFAULT
    def start(self, **kwargs):
        _lazy_init_models()
        self.mouth_scale = float(kwargs.get("mouth_scale", self.mouth_scale))
    def update(self, frame):
        if not (YOLO_READY and MP_READY):
            return {"passed": False, "progress": 0.0}
        overlay = []
        if LiftProcess:
            bottle_pos, reached = LiftProcess(frame, model, hands, face, pose, self.mouth_scale)
            if bottle_pos:
                overlay.append(("circle", bottle_pos, 10, (0,255,0), 2))
            overlay.append(("text", f"reached={bool(reached)}", (10, 60), 0.7, (255,255,255), 2))
            return {"passed": bool(reached), "progress": 1.0 if reached else 0.0, "overlay": overlay}
        # Fallback: approximate
        img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mouth, head_w = _mouth_and_ear_metrics(img_rgb)
        det = _detect_bottle_xyxy(frame)
        if det:
            x1, y1, x2, y2, _ = det
            overlay.append(("rect", (x1,y1,x2,y2), (0,255,0), 2))
        if mouth:
            overlay.append(("circle", mouth, 8, (255,255,255), -1))
        if not det or not mouth or not head_w:
            return {"passed": False, "progress": 0.0, "overlay": overlay}
        cx = (x1 + x2)//2; cy = (y1 + y2)//2
        dist = math.hypot(mouth[0]-cx, mouth[1]-cy)
        tol = max(20.0, 0.5 * head_w)
        overlay.append(("text", f"d={int(dist)} tol={int(tol)}", (10, 60), 0.7, (255,255,255), 2))
        return {"passed": dist <= tol, "progress": 1.0 if dist <= tol else 0.0, "overlay": overlay}
    def stop(self):
        pass

class HoldAtMouthEval(BaseEval):
    name = "hold_at_mouth"
    def __init__(self, seconds=5.0):
        self.seconds = seconds; self.t0 = None
        self.lift = LiftToMouthEval()
    def start(self, **kwargs):
        self.seconds = float(kwargs.get("seconds", self.seconds))
        self.t0 = None; self.lift.start(**kwargs)
    def update(self, frame):
        r = self.lift.update(frame)
        overlay = r.get("overlay", [])
        if r.get("passed"):
            if self.t0 is None:
                self.t0 = time.time()
            held = time.time() - self.t0
            overlay.append(("text", f"hold={held:.2f}s/{self.seconds:.0f}s", (10, 86), 0.7, (255,255,255), 2))
            return {"passed": held >= self.seconds, "progress": min(1.0, held / self.seconds), "overlay": overlay}
        else:
            self.t0 = None
            return {"passed": False, "progress": 0.0, "overlay": overlay}
    def stop(self):
        self.lift.stop()

class DumpIntoMouthEval(BaseEval):
    name = "dump_into_mouth"
    def __init__(self):
        self.t_tilt = None
    def start(self, **kwargs):
        _lazy_init_models(); self.t_tilt = None
    def update(self, frame):
        img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        hands_xy = _hand_landmarks(img_rgb)
        dom = session_cfg.get("dominant", "right")
        lm = hands_xy.get(dom, {})
        wrist = lm.get(0); idx_mcp = lm.get(5); idx_tip = lm.get(8)
        overlay = []
        if wrist and idx_tip:
            overlay.append(("circle", wrist, 6, (255,255,255), -1))
            overlay.append(("circle", idx_tip, 6, (255,255,255), -1))
            overlay.append(("line", wrist, idx_tip, (200,200,255), 2))
        if not (wrist and idx_mcp and idx_tip):
            self.t_tilt = None
            return {"passed": False, "progress": 0.0, "overlay": overlay}
        vx, vy = idx_tip[0] - wrist[0], idx_tip[1] - wrist[1]
        angle = abs(math.degrees(math.atan2(-vy, vx)))  # 0 = right, 90 = up
        is_tilted = angle < 30 or angle > 150
        overlay.append(("text", f"angle={angle:.0f}", (10, 60), 0.7, (255,255,255), 2))
        if is_tilted:
            if self.t_tilt is None:
                self.t_tilt = time.time()
            held = time.time() - self.t_tilt
            overlay.append(("text", f"tilt-hold={held:.2f}s", (10, 86), 0.7, (255,255,255), 2))
            return {"passed": held >= 1.0, "progress": min(1.0, held / 1.0), "overlay": overlay}
        else:
            self.t_tilt = None
            return {"passed": False, "progress": 0.0, "overlay": overlay}
    def stop(self):
        pass

class PlaceCupDownEval(BaseEval):
    name = "place_cup_down"
    def __init__(self):
        self.t_down = None
    def start(self, **kwargs):
        _lazy_init_models(); self.t_down = None
    def update(self, frame):
        det = _detect_bottle_xyxy(frame)
        overlay = []
        if not det:
            self.t_down = None
            return {"passed": False, "progress": 0.0, "overlay": overlay}
        x1, y1, x2, y2, _ = det
        overlay.append(("rect", (x1,y1,x2,y2), (0,255,0), 2))
        h, w = frame.shape[:2]
        cy = (y1 + y2) // 2
        near_bottom = cy >= int(0.8 * h)
        if near_bottom:
            if self.t_down is None:
                self.t_down = time.time()
            held = time.time() - self.t_down
            overlay.append(("text", f"down-hold={held:.2f}s", (10, 60), 0.7, (255,255,255), 2))
            return {"passed": held >= 1.0, "progress": min(1.0, held / 1.0), "overlay": overlay}
        else:
            self.t_down = None
            return {"passed": False, "progress": 0.0, "overlay": overlay}
    def stop(self):
        pass

TASK_EVALUATORS = {
    "reach_bottle":       ReachBottleEval,
    "grab_hold":          GrabHoldEval,
    "lift_to_mouth":      LiftToMouthEval,
    "hold_at_mouth":      HoldAtMouthEval,
    "dump_into_mouth":    DumpIntoMouthEval,
    "place_cup_down":     PlaceCupDownEval,
}

active_task: Optional[str] = None
active_eval: Optional[BaseEval] = None
already_passed = False
pass_sticky_frames = 0  # make pass event sticky for a few frames so the frontend can't miss it

# -----------------------------------------------------------------------------
# MJPEG helper (uses real detections)
# -----------------------------------------------------------------------------
def run_models(frame_bgr) -> LivePayload:
    _lazy_init_models()
    dets: list[Detection] = []
    det = _detect_bottle_xyxy(frame_bgr)
    if det:
        x1, y1, x2, y2, score = det
        dets.append(Detection(x=x1, y=y1, w=(x2 - x1), h=(y2 - y1)))
    return LivePayload(ts=datetime.utcnow().isoformat(), count=len(dets), detections=dets)

# -----------------------------------------------------------------------------
# Drawing
# -----------------------------------------------------------------------------
def draw_overlay(vis, overlay):
    for item in overlay or []:
        kind = item[0]
        if kind == "rect":
            (_, (x1,y1,x2,y2), color, thickness) = (item[0], item[1], item[2], item[3])
            cv2.rectangle(vis, (x1,y1), (x2,y2), color, thickness)
        elif kind == "circle":
            (_, center, r, color, thickness) = (item[0], item[1], item[2], item[3], item[4])
            cv2.circle(vis, center, r, color, thickness)
        elif kind == "text":
            (_, text, org, scale, color, thickness) = item
            cv2.putText(vis, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, color, thickness, cv2.LINE_AA)
        elif kind == "line":
            (_, p1, p2, color, thickness) = item
            cv2.line(vis, p1, p2, color, thickness)

# -----------------------------------------------------------------------------
# Capture / Inference Loop
# -----------------------------------------------------------------------------
async def capture_loop():
    global latest_jpeg, already_passed, cap, _last_ts, _fps, pass_sticky_frames
    while True:
        if cap is None:
            await asyncio.sleep(0.05)
            continue
        ok, frame = await asyncio.to_thread(cap.read)
        if not ok:
            await asyncio.sleep(0.05)
            continue

        now = time.time()
        if _last_ts is None:
            _last_ts = now
        dt = max(1e-6, now - _last_ts)
        _fps = 0.9 * _fps + 0.1 * (1.0 / dt)
        _last_ts = now

        # Evaluate active task per frame (CPU-bound → worker thread)
        out: Dict[str, Any] = {}
        if active_eval:
            out = await asyncio.to_thread(active_eval.update, frame)

        # Prepare visualization
        vis = frame.copy()
        overlay = out.get("overlay")
        if overlay:
            draw_overlay(vis, overlay)
        else:
            # Baseline: show bottle if any
            det = _detect_bottle_xyxy(frame)
            if det:
                x1, y1, x2, y2, _ = det
                cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 255, 0), 2)

        # HUD
        hud = f"Task: {active_task or '-'}"
        prog = out.get("progress")
        if prog is not None:
            try:
                hud += f"  •  Progress: {int(float(prog)*100)}%"
            except Exception:
                pass
        if DEBUG_OVERLAY and _fps:
            hud += f"  •  FPS: {int(_fps)}  •  YOLO {YOLO_IMGSZ}px  •  conf≥{YOLO_CONF}"
        cv2.putText(vis, hud, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (30, 255, 200), 2, cv2.LINE_AA)

        # Extra debug overlays
        if DEBUG_OVERLAY:
            _lazy_init_models()
            if MP_READY:
                img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mouth, head_w = _mouth_and_ear_metrics(img_rgb)
                hands_xy = _hand_landmarks(img_rgb)
                if mouth:
                    cv2.circle(vis, mouth, 5, (255,255,255), -1)
                for side in ("left", "right"):
                    lm = hands_xy.get(side, {})
                    for key in (0, 5, 8):
                        if key in lm:
                            cv2.circle(vis, lm[key], 5, (200,200,255), -1)
                    if 0 in lm and 8 in lm:
                        cv2.line(vis, lm[0], lm[8], (200,200,255), 2)
                        vx, vy = lm[8][0]-lm[0][0], lm[8][1]-lm[0][1]
                        ang = abs(math.degrees(math.atan2(-vy, vx)))
                        cv2.putText(vis, f"{side[:1]}-angle={ang:.0f}", (10, 54 if side=='left' else 78),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,255), 2, cv2.LINE_AA)
            det = _detect_bottle_xyxy(frame)
            if det:
                x1, y1, x2, y2, score = det
                cx, cy = (x1+x2)//2, (y1+y2)//2
                cv2.rectangle(vis, (x1,y1), (x2,y2), (0,255,0), 2)
                cv2.circle(vis, (cx,cy), 6, (0,255,0), -1)

        # Encode and publish frame
        _, jpg = cv2.imencode(".jpg", vis)
        latest_jpeg = jpg.tobytes()

        # Detect this-frame pass
        passed_now = bool(out.get("passed"))

        # Emit event on first pass and make it sticky for a few frames
        if passed_now and not already_passed:
            already_passed = True
            pass_sticky_frames = 6  # ~300ms at 20 Hz
            await broadcast({"event": "task_passed", "task": active_task, "active_task": active_task})

        # Save a tiny metric sample
        evt = Event(session_id=SESSION_ID, ts=datetime.utcnow(),
                    type="tick", value_json=json.dumps({"progress": float(out.get("progress") or 0.0)}))
        await asyncio.to_thread(save, evt)

        # Push live payload (incl. progress and pass flag)
        if pass_sticky_frames > 0:
            pass_sticky_frames -= 1
        payload = {
            "ts": datetime.utcnow().isoformat(),
            "count": 1,
            "detections": [],
            "active_task": active_task,
            "progress": out.get("progress"),
            "passed": passed_now,
        }
        if pass_sticky_frames > 0:
            payload.update({"event": "task_passed", "task": active_task})
        await broadcast(payload)

        await asyncio.sleep(0.05)  # ~20 Hz

# -----------------------------------------------------------------------------
# FastAPI Hooks & Routes
# -----------------------------------------------------------------------------
@app.on_event("startup")
async def on_start():
    global cap
    init_db()
    cap = cv2.VideoCapture(0)
    asyncio.create_task(capture_loop())

@app.on_event("shutdown")
async def on_shutdown():
    global cap
    try:
        if cap is not None:
            cap.release()
    except Exception:
        pass

@app.post("/session-config")
def set_session_config(payload = Body(...)):
    dom = str(payload.get("dominant", session_cfg["dominant"])).lower()
    mode = str(payload.get("target_mode", session_cfg["target_mode"])).lower()
    if dom in ("left", "right"): session_cfg["dominant"] = dom
    if mode in ("fixed", "head"): session_cfg["target_mode"] = mode
    return {"ok": True, "session": session_cfg}

@app.post("/active-task")
def set_active_task(payload = Body(...)):
    global active_task, active_eval, already_passed, pass_sticky_frames
    name = payload.get("task")
    params = {k: v for k, v in payload.items() if k != "task"}
    if name not in TASK_EVALUATORS:
        return {"ok": False, "error": f"Unknown task {name}"}
    try:
        if active_eval:
            active_eval.stop()
    except Exception:
        pass
    active_task = name
    active_eval = TASK_EVALUATORS[name]()
    active_eval.start(**params)
    already_passed = False
    pass_sticky_frames = 0
    return {"ok": True, "active_task": active_task}

@app.post("/debug-overlay")
def set_debug_overlay(payload = Body(...)):
    global DEBUG_OVERLAY
    enable = bool(payload.get("enable", False))
    DEBUG_OVERLAY = enable
    return {"ok": True, "debug_overlay": DEBUG_OVERLAY}

@app.get("/debug-overlay")
def get_debug_overlay():
    return {"debug_overlay": DEBUG_OVERLAY, "yolo_imgsz": YOLO_IMGSZ, "yolo_conf": YOLO_CONF}

@app.websocket("/ws")
async def ws_live(ws: WebSocket):
    await ws.accept()
    subscribers.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        subscribers.discard(ws)

@app.get("/metrics")
def get_metrics(since: str | None = Query(None, description="ISO8601 timestamp")):
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
                yield boundary + b"Content-Type: image/jpeg\r\r\n" + latest_jpeg + b"\r\n"
            await asyncio.sleep(0.05)
    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame")
