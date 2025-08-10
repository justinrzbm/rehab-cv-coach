import time
import math
from collections import deque


class GrabHoldMetrics:
    def __init__(
        self,
        touch_dist_ratio=0.60,
        grip_radius_ratio=0.65,
        fingers_required=3,
        grip_confirm_s=0.10,
        initial_hold_s=5.00,
        stability_threshold_px=10.0,
    ):
        """
        touch_dist_ratio: fraction of half bbox max-dim used to detect first touch
        grip_radius_ratio: fraction of half bbox width for full-grip radius
        fingers_required: number of fingertips required inside grip radius
        grip_confirm_s: continuous time with required fingers to confirm full grip
        initial_hold_s: window after full grip to compute stability (seconds)
        """
        self.touch_dist_ratio = touch_dist_ratio
        self.grip_radius_ratio = grip_radius_ratio
        self.fingers_required = fingers_required
        self.grip_confirm_s = grip_confirm_s
        self.initial_hold_s = initial_hold_s
        self.stability_threshold_px = stability_threshold_px

        self.reset()

    def reset(self):
        self.start_signal_time = None
        self.first_touch_time = None
        self.grip_confirm_start_time = None
        self.full_grip_time = None
        self.grip_completion_time = None

        self.touched = False
        self.full_grip_confirming = False
        self.full_grip_achieved = False
        self.completed = False

        self.hold_samples_px = deque()
        self.hold_start_time = None

    def start(self):
        self.reset()
        self.start_signal_time = time.time()

    def _distance(self, a, b):
        return math.hypot(a[0] - b[0], a[1] - b[1])

    def update(self, current_time, fingertips_px, bottle_center_px, bottle_w_px, bottle_h_px):
        """
        Update grab/hold state machine and compute metrics.

        fingertips_px: list of (x,y) for visible fingertips (may be empty)
        bottle_center_px: (x,y) or None
        bottle_w_px, bottle_h_px: ints (bbox dimensions) or 0 if unknown

        Returns dict with keys:
          - status: str
          - grip_completion_time: float or None
          - stability_std_px: float or None (std dev of center positions during initial hold)
          - done: bool (True when metrics finalized for this trial)
        """
        if self.start_signal_time is None:
            return {"status": "waiting to start", "grip_completion_time": None, "stability_std_px": None, "done": False}

        if bottle_center_px is None:
            return {"status": "waiting for bottle", "grip_completion_time": None, "stability_std_px": None, "done": False}

        # Derived radii based on current bbox
        half_max_dim = max(bottle_w_px, bottle_h_px) * 0.5 if (bottle_w_px and bottle_h_px) else 1.0
        grip_radius_px = self.grip_radius_ratio * (bottle_w_px * 0.5 if bottle_w_px else half_max_dim)
        touch_radius_px = self.touch_dist_ratio * half_max_dim

        # 1) First touch
        if not self.touched and fingertips_px:
            for tip in fingertips_px:
                if self._distance(tip, bottle_center_px) <= touch_radius_px:
                    self.touched = True
                    self.first_touch_time = current_time
                    break

        # 2) Full grip confirmation (require N fingertips inside smaller radius for some time)
        if self.touched and not self.full_grip_achieved:
            count_inside = 0
            for tip in fingertips_px:
                if self._distance(tip, bottle_center_px) <= grip_radius_px:
                    count_inside += 1

            if count_inside >= self.fingers_required:
                if not self.full_grip_confirming:
                    self.full_grip_confirming = True
                    self.grip_confirm_start_time = current_time
                elif (current_time - self.grip_confirm_start_time) >= self.grip_confirm_s:
                    self.full_grip_achieved = True
                    self.full_grip_time = current_time
                    # Metric: grip completion
                    if self.first_touch_time is not None:
                        self.grip_completion_time = max(0.0, self.full_grip_time - self.first_touch_time)
                    # Start hold window
                    self.hold_start_time = current_time
            else:
                # Lost confirmation continuity
                self.full_grip_confirming = False
                self.grip_confirm_start_time = None

        # 3) Collect bottle centers during hold window (5s)
        stability_std_px = None
        elapsed_hold = 0.0
        if self.full_grip_achieved:
            elapsed_hold = current_time - self.hold_start_time if self.hold_start_time else 0.0
            if not self.completed:
                self.hold_samples_px.append(bottle_center_px)

            # Provisional stability (live) based on samples so far
            if len(self.hold_samples_px) >= 2:
                xs = [p[0] for p in self.hold_samples_px]
                ys = [p[1] for p in self.hold_samples_px]
                mean_x = sum(xs) / len(xs)
                mean_y = sum(ys) / len(ys)
                dists = [math.hypot(px - mean_x, py - mean_y) for px, py in self.hold_samples_px]
                mean_d = sum(dists) / len(dists)
                var = sum((d - mean_d) ** 2 for d in dists) / max(1, (len(dists) - 1))
                stability_std_px = math.sqrt(var)
            else:
                stability_std_px = 0.0

            # Finalize only when window reached (no early exit)
            if not self.completed and elapsed_hold >= self.initial_hold_s:
                self.completed = True

        status = "waiting"
        if not self.touched:
            status = "touch to begin"
        elif self.touched and not self.full_grip_achieved:
            status = "forming grip" if self.full_grip_confirming else "touched"
        elif self.full_grip_achieved and not self.completed:
            status = "holding"
        else:
            status = "done"

        passed = bool(self.completed and stability_std_px is not None and stability_std_px <= self.stability_threshold_px)

        return {
            "status": status,
            "grip_completion_time": self.grip_completion_time,
            "stability_std_px": stability_std_px,
            "hold_elapsed_s": elapsed_hold if self.full_grip_achieved else 0.0,
            "done": self.completed,
            "passed": passed,
        }


# ====================== New interface to mirror main.py ======================

# Settings consistent with exercises/main.py
READY_HOLD_FRAMES = 5
GRASP_HOLD_SECONDS = 5.0
SWAP_HANDS = False


def euclid(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def point_in_box(pt, box):
    if pt is None or box is None:
        return False
    x, y = pt
    x1, y1, x2, y2 = box
    return (x1 <= x <= x2) and (y1 <= y <= y2)


def expand_box(box, margin):
    if box is None:
        return None
    x1, y1, x2, y2 = box
    return (x1 - margin, y1 - margin, x2 + margin, y2 + margin)


def grasp_detect_for_hand(landmarks_px, bottle_box, ear_dist=None):
    """
    Match main.py heuristic: thumb tip (4) and index tip (8) inside an expanded bottle box
    and thumb–index pinch distance small w.r.t. bottle size or ear distance.
    landmarks_px: dict index->(x,y) for 21 hand landmarks
    bottle_box: (x1,y1,x2,y2)
    ear_dist: optional float to scale thresholds
    """
    if bottle_box is None or landmarks_px is None:
        return False
    if 4 not in landmarks_px or 8 not in landmarks_px:
        return False

    x1, y1, x2, y2 = bottle_box
    bw, bh = max(1, x2 - x1), max(1, y2 - y1)
    margin = int(0.15 * max(bw, bh))
    ex_box = expand_box(bottle_box, margin)

    thumb = landmarks_px[4]
    index = landmarks_px[8]
    in_box = point_in_box(thumb, ex_box) and point_in_box(index, ex_box)

    pinch = euclid(thumb, index)
    pinch_thresh = 0.35 * min(bw, bh)
    if ear_dist:
        pinch_thresh = 0.50 * ear_dist

    return in_box and (pinch <= pinch_thresh)


class ReadyGraspHold:
    """
    Encapsulates READY -> GRASP -> 5s PASS logic to mirror main.py behavior
    while allowing selection of dominant hand (right/left).
    """

    def __init__(self, ready_hold_frames=READY_HOLD_FRAMES, grasp_hold_seconds=GRASP_HOLD_SECONDS):
        self.ready_hold_frames = ready_hold_frames
        self.grasp_hold_seconds = grasp_hold_seconds
        self.reset()

    def reset(self):
        self.ready_hold = 0
        self.grasp_start_time = None
        self.dominant = "right"  # default

    def set_dominant_from_input(self, user_input: str):
        user_in = (user_input or "").strip().lower()
        self.dominant = "right" if user_in not in ("l", "left") else "left"
        return self.dominant

    def set_dominant(self, dominant: str):
        dom = (dominant or "right").strip().lower()
        if dom not in ("right", "left"):
            dom = "right"
        self.dominant = dom

    def _effective_side(self, side_raw: str) -> str:
        if not SWAP_HANDS:
            return side_raw
        return "Right" if side_raw == "Left" else "Left"

    def _index_from_landmarks(self, landmarks_px: dict):
        return landmarks_px.get(8) if landmarks_px else None

    def update(self,
               current_time: float,
               left_hand_landmarks_px: dict | None,
               right_hand_landmarks_px: dict | None,
               bottle_box: tuple | None,
               ear_dist: float | None,
               bottle_target_xy: tuple,
               hand_target_xy: tuple,
               toler_px: int) -> dict:
        """
        Returns dict with keys:
          - ready: bool
          - grasped: bool
          - hold_elapsed_s: float
          - passed: bool
          - dominant: 'right' | 'left'
        """
        # OK bottle: target inside bbox
        ok_bottle = False
        if bottle_box is not None and bottle_target_xy is not None:
            x1, y1, x2, y2 = bottle_box
            bx, by = bottle_target_xy
            ok_bottle = (x1 <= bx <= x2) and (y1 <= by <= y2)

        # dominant index proximity to hand target
        dominant_landmarks = right_hand_landmarks_px if self.dominant == "right" else left_hand_landmarks_px
        dominant_index_px = self._index_from_landmarks(dominant_landmarks)
        ok_hand = dominant_index_px is not None and hand_target_xy is not None and \
                  (euclid(dominant_index_px, hand_target_xy) <= max(1, toler_px))

        # READY logic
        if ok_bottle and ok_hand:
            self.ready_hold += 1
        else:
            self.ready_hold = 0
            self.grasp_start_time = None

        ready = (self.ready_hold >= self.ready_hold_frames)

        # GRASP detection for chosen hand only
        grasped = False
        if dominant_landmarks is not None and bottle_box is not None:
            grasped = grasp_detect_for_hand(dominant_landmarks, bottle_box, ear_dist)

        # 5s hold after READY
        hold_elapsed = 0.0
        passed = False
        if ready and grasped:
            if self.grasp_start_time is None:
                self.grasp_start_time = current_time
            hold_elapsed = current_time - self.grasp_start_time
            passed = (hold_elapsed >= self.grasp_hold_seconds)
        else:
            self.grasp_start_time = None

        return {
            "ready": ready,
            "grasped": grasped,
            "hold_elapsed_s": hold_elapsed,
            "passed": passed,
            "dominant": self.dominant,
        }



