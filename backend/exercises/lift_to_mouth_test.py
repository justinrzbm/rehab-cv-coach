# Reach-to-Mouth with Calibration (YOLO + MediaPipe)
# Provides process_frame(...) used by FastAPI evaluator.
# pip install ultralytics opencv-python mediapipe

import cv2
import math
import numpy as np
from ultralytics import YOLO
import mediapipe as mp

# -------- CONFIG --------
MODEL_PATH   = "yolov10b.pt"   # or any YOLO model with "bottle" class
CONF         = 0.50            # YOLO confidence
IMG_SIZE     = 768
DEVICE       = "cpu"           # 0 (CUDA index), "cpu", or "mps"
HALF         = False
TARGET_CLASS = "bottle"        # can be name or class id(s)

# Calibration: distance threshold = mouth_scale * ear_distance
DEFAULT_MOUTH_SCALE = 0.80     # used by app.py if not overridden

# --- MediaPipe ---
mp_pose   = mp.solutions.pose
mp_mesh   = mp.solutions.face_mesh

# --- helpers ---
def to_pixels(landmark, width, height):
    return int(landmark.x * width), int(landmark.y * height)

def euclid(a, b):
    return math.hypot(a[0]-b[0], a[1]-b[1])

def clamp_box(x1, y1, x2, y2, w, h):
    x1 = max(0, min(w-1, x1)); y1 = max(0, min(h-1, y1))
    x2 = max(0, min(w-1, x2)); y2 = max(0, min(h-1, y2))
    if x2 < x1: x1, x2 = x2, x1
    if y2 < y1: y1, y2 = y2, y1
    return x1, y1, x2, y2

# --- robust class mapping for Ultralytics ---
def _coerce_classes_arg(model, class_filter):
    """Return None or a list[int] that Ultralytics expects for `classes`.
    Accepts: None | str (e.g., "bottle") | list[str] | list[int].
    """
    if class_filter is None:
        return None
    try:
        names = model.names  # dict or list depending on model
        if isinstance(names, dict):
            name_to_id = {str(v).lower(): int(k) for k, v in names.items()}
        else:
            name_to_id = {str(v).lower(): i for i, v in enumerate(names)}

        if isinstance(class_filter, str):
            cid = name_to_id.get(class_filter.lower())
            return [cid] if cid is not None else None
        if isinstance(class_filter, (list, tuple)):
            if not class_filter:
                return None
            if isinstance(class_filter[0], str):
                ids = [name_to_id.get(str(s).lower()) for s in class_filter]
                ids = [i for i in ids if i is not None]
                return ids or None
            else:  # assume ints
                return [int(i) for i in class_filter]
    except Exception:
        pass
    return None

def detect_on_frame(model, frame_bgr, class_filter, conf, imgsz, device):
    """Returns list of (x1,y1,x2,y2, cls_id, score)."""
    h, w = frame_bgr.shape[:2]
    classes_arg = _coerce_classes_arg(model, class_filter)
    res = model.predict(
        source=frame_bgr,
        imgsz=imgsz,
        conf=conf,
        device=device,
        verbose=False,
        classes=classes_arg,
    )[0]
    out = []
    if res.boxes is None:
        return out
    for b in res.boxes:
        cls_id = int(b.cls[0]); score = float(b.conf[0])
        x1, y1, x2, y2 = map(int, b.xyxy[0].cpu().numpy())
        x1, y1, x2, y2 = clamp_box(x1, y1, x2, y2, w, h)
        out.append((x1, y1, x2, y2, cls_id, score))
    return out

# --- main per-frame API used by FastAPI ---
def process_frame(frame, model, hands, face, pose, mouth_scale=DEFAULT_MOUTH_SCALE):
    """Process a single frame and return (bottle_pos, reached_near_mouth).
    - bottle_pos: (cx, cy) or None
    - reached_near_mouth: bool
    The mouth proximity threshold is mouth_scale × ear_distance.
    """
    h, w = frame.shape[:2]
    img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    # Face (mouth center)
    face_results = face.process(img_rgb) if face else None
    mouth_center = None
    if face_results and face_results.multi_face_landmarks:
        lmsf = face_results.multi_face_landmarks[0].landmark
        try:
            ux, uy = to_pixels(lmsf[13], w, h)  # upper inner lip
            lx, ly = to_pixels(lmsf[14], w, h)  # lower inner lip
            mouth_center = ((ux + lx)//2, (uy + ly)//2)
        except IndexError:
            mouth_center = None

    # Pose (ear distance for scale)
    pose_results = pose.process(img_rgb) if pose else None
    ear_dist = None
    if pose_results and pose_results.pose_landmarks:
        lms = pose_results.pose_landmarks.landmark
        le = lms[mp_pose.PoseLandmark.LEFT_EAR]
        re = lms[mp_pose.PoseLandmark.RIGHT_EAR]
        lpx, lpy = to_pixels(le, w, h)
        rpx, rpy = to_pixels(re, w, h)
        ear_dist = euclid((lpx, lpy), (rpx, rpy))

    # YOLO bottle detection
    detections = detect_on_frame(model, frame, TARGET_CLASS, CONF, IMG_SIZE, DEVICE)
    bottle_pos = None
    reached = False
    for (x1, y1, x2, y2, cls_id, score) in detections:
        bottle_pos = ((x1 + x2)//2, (y1 + y2)//2)
        if mouth_center and ear_dist:
            thresh = float(mouth_scale) * float(ear_dist)
            dist = euclid(bottle_pos, mouth_center)
            reached = dist <= thresh
            break  # use top detection only
    return bottle_pos, reached