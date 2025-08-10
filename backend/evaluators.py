# backend/evaluators.py
from __future__ import annotations
from typing import Optional, Dict, Any
import time
from ultralytics import YOLO
import mediapipe as mp
import cv2

# Reuse your function that decides if we've reached the mouth
from exercises.lift_to_mouth_test import process_frame, DEFAULT_MOUTH_SCALE

class BaseEval:
    name: str
    def start(self, **kwargs): ...
    def update(self, frame) -> Dict[str, Any]: ...
    def stop(self): ...

class LiftToMouthEval(BaseEval):
    """Passes when the bottle (or index) is near mouth (your reach-to-mouth logic)."""
    name = "lift_cup"
    def __init__(self):
        self.model = YOLO("yolov10b.pt")
        self.hands = mp.solutions.hands.Hands(static_image_mode=False, max_num_hands=2, model_complexity=0,
                                              min_detection_confidence=0.5, min_tracking_confidence=0.5)
        self.pose  = mp.solutions.pose.Pose(static_image_mode=False, model_complexity=0,
                                            enable_segmentation=False, min_detection_confidence=0.5,
                                            min_tracking_confidence=0.5)
        self.face  = mp.solutions.face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=True,
                                                     min_detection_confidence=0.5, min_tracking_confidence=0.5)
        self.mouth_scale = DEFAULT_MOUTH_SCALE

    def start(self, **kwargs):
        # allow overrides if you want to tune sensitivity per task
        self.mouth_scale = kwargs.get("mouth_scale", DEFAULT_MOUTH_SCALE)

    def update(self, frame):
        bottle_pos, reached = process_frame(frame, self.model, self.hands, self.face, self.pose, self.mouth_scale)
        return {"passed": bool(reached), "progress": 1.0 if reached else 0.0, "bottle_pos": bottle_pos}

    def stop(self):
        try:
            self.hands.close(); self.pose.close(); self.face.close()
        except Exception:
            pass

class HoldAtMouthEval(BaseEval):
    """Passes after the bottle stays near the mouth for N seconds (uses the same reach check)."""
    name = "hold_mouth"
    def __init__(self, required_secs: float = 5.0):
        self.required_secs = required_secs
        self.started_at: Optional[float] = None
        self.lift_eval = LiftToMouthEval()

    def start(self, **kwargs):
        self.required_secs = float(kwargs.get("seconds", self.required_secs))
        self.started_at = None
        self.lift_eval.start(**kwargs)

    def update(self, frame):
        r = self.lift_eval.update(frame)
        if r["passed"]:
            if self.started_at is None:
                self.started_at = time.time()
            held = time.time() - self.started_at
            done = held >= self.required_secs
            prog = min(1.0, held / self.required_secs)
            return {"passed": done, "progress": prog, "holding_seconds": held}
        else:
            self.started_at = None
            return {"passed": False, "progress": 0.0}

    def stop(self):
        self.lift_eval.stop()

class TimedPassEval(BaseEval):
    """Temporary stub for steps like 'hold_cup' or 'place_down' until you wire the real metrics."""
    def __init__(self, name: str, seconds: float = 5.0):
        self.name = name; self.seconds = seconds; self.started_at = None
    def start(self, **kwargs):
        self.seconds = float(kwargs.get("seconds", self.seconds))
        self.started_at = time.time()
    def update(self, frame):
        if self.started_at is None: self.started_at = time.time()
        held = time.time() - self.started_at
        return {"passed": held >= self.seconds, "progress": min(1.0, held / self.seconds)}
    def stop(self): pass

# Register the evaluators you want active
TASK_EVALUATORS = {
    "hold_cup":   lambda: TimedPassEval("hold_cup", seconds=5),   # TODO: replace with stability test
    "lift_cup":   LiftToMouthEval,                                # real CV logic
    "hold_mouth": HoldAtMouthEval,                                # real CV logic
    "tip_cup":    lambda: TimedPassEval("tip_cup", seconds=3),    # TODO: wire dump_into_mouth
    "place_down": lambda: TimedPassEval("place_down", seconds=3), # TODO: wire place_cup_down
}
