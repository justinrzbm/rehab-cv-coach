# YOLO + MediaPipe — Dominant-hand only + Click targets + READY (index) + GRASP + 5s PASS
# Controls:
#   R / L : switch dominant hand (Right/Left)
#   T     : toggle target mode (Fixed <-> Head-scaled tolerance)
#   S     : snap Fixed targets from current bottle center + dominant INDEX fingertip
#   Mouse : Left-click -> set bottle target, Right-click -> set hand target
#   Q     : quit
# pip install ultralytics opencv-python mediapipe

import cv2
import time
import numpy as np
from collections import deque
from ultralytics import YOLO
import mediapipe as mp
import math

# ---------- CONFIG ----------
MODEL_PATH   = "yolov10b.pt"
CONF         = 0.80
IMG_SIZE     = 768
DEVICE       = "mps"          # 0 (CUDA), "cpu", "mps"
HALF         = False
CAM_INDEX    = 0
FRAME_W      = 1280
FRAME_H      = 720
FLIP_VIEW    = True           # mirror preview to match movement
TARGET_CLASS = "bottle"       # None = all classes
SECONDARY_ANGLES = []         # fallback rotations if 0° finds nothing
IOU_NMS      = 0.50
FPS_SMOOTH_N = 20

# If your preview is mirrored and MP's "Left/Right" labels feel inverted,
# set SWAP_HANDS=True to interpret the sides inverted.
SWAP_HANDS   = False

# ----- Target mode -----
TARGET_MODE = "fixed"         # "fixed" or "head" (head-scaled tolerance only)
# Fixed targets as fractions of frame (x_frac, y_frac)
FIXED_BOTTLE_FRAC = (0.50, 0.78)
FIXED_HAND_FRAC   = (0.70, 0.85)
# Tolerance (pixels) for fixed mode; if 0 -> derive from head width when available, else 60 px
FIXED_TOLER_PX    = 60

# ----- Head-scaled tolerance (relative to face) -----
INIT_TOLER_FRAC            = 0.15   # tolerance radius = 0.15 * ear_dist
READY_HOLD_FRAMES          = 5
GRASP_HOLD_SECONDS         = 5.0    # hold time after READY

cv2.setUseOptimized(True)

# --- MediaPipe setup ---
mp_hands  = mp.solutions.hands
mp_pose   = mp.solutions.pose
mp_mesh   = mp.solutions.face_mesh
mp_draw   = mp.solutions.drawing_utils
mp_styles = mp.solutions.drawing_styles

def to_pixels(landmark, width, height):
    return int(landmark.x * width), int(landmark.y * height)

def euclid(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])

def clamp_box(x1, y1, x2, y2, w, h):
    x1 = max(0, min(w-1, x1)); y1 = max(0, min(h-1, y1))
    x2 = max(0, min(w-1, x2)); y2 = max(0, min(h-1, y2))
    if x2 < x1: x1, x2 = x2, x1
    if y2 < y1: y1, y2 = y2, y1
    return x1, y1, x2, y2

def iou_xyxy(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    iw = max(0, min(ax2, bx2) - max(ax1, bx1))
    ih = max(0, min(ay2, by2) - max(ay1, by1))
    inter = iw * ih
    if inter <= 0: return 0.0
    area_a = max(0, (ax2 - ax1) * (ay2 - ay1))
    area_b = max(0, (bx2 - bx1) * (by2 - by1))
    return inter / float(area_a + area_b - inter + 1e-6)

def nms(boxes, scores, iou_thresh=0.5):
    if len(boxes) == 0: return []
    boxes = np.array(boxes, dtype=np.float32)
    scores = np.array(scores, dtype=np.float32)
    idxs = np.argsort(scores)[::-1]
    keep = []
    while len(idxs) > 0:
        i = idxs[0]; keep.append(i)
        if len(idxs) == 1: break
        rest = idxs[1:]
        mask = np.array([iou_xyxy(boxes[i], boxes[j]) < iou_thresh for j in rest])
        idxs = rest[mask]
    return keep

def rotate_with_matrix(frame, angle_deg):
    h, w = frame.shape[:2]
    c = (w / 2.0, h / 2.0)
    M = cv2.getRotationMatrix2D(c, angle_deg, 1.0)
    invM = cv2.invertAffineTransform(M)
    rotated = cv2.warpAffine(frame, M, (w, h), flags=cv2.INTER_LINEAR,
                             borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0))
    return rotated, M, invM

def apply_affine_to_points(pts, M):
    pts_np = np.array(pts, dtype=np.float32).reshape(-1,1,2)
    out = cv2.transform(pts_np, M)
    return [(int(round(p[0][0])), int(round(p[0][1]))) for p in out]

def map_box_back_arbitrary(x1r, y1r, x2r, y2r, invM, W, H):
    corners_r = [(x1r, y1r), (x2r, y1r), (x2r, y2r), (x1r, y2r)]
    corners_o = apply_affine_to_points(corners_r, invM)
    xs = [x for x,_ in corners_o]; ys = [y for _,y in corners_o]
    bx1, by1, bx2, by2 = int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))
    return clamp_box(bx1, by1, bx2, by2, W, H)

def detect_on_frame(model, frame_bgr, class_filter, conf, imgsz, device):
    h, w = frame_bgr.shape[:2]
    res = model.predict(source=frame_bgr, imgsz=imgsz, conf=conf, device=device,
                        verbose=False, classes=class_filter)[0]
    out = []
    if res.boxes is None: return out
    for b in res.boxes:
        cls_id = int(b.cls[0]); score = float(b.conf[0])
        x1, y1, x2, y2 = map(int, b.xyxy[0].cpu().numpy())
        x1, y1, x2, y2 = clamp_box(x1, y1, x2, y2, w, h)
        out.append((x1, y1, x2, y2, cls_id, score))
    return out

def detect_conditional_rotations(model, frame_bgr, class_filter, conf, imgsz, device, angles, iou_merge):
    base = detect_on_frame(model, frame_bgr, class_filter, conf, imgsz, device)
    if base: return base
    H, W = frame_bgr.shape[:2]
    all_boxes, all_scores, all_cls = [], [], []
    for ang in angles:
        rot, M, invM = rotate_with_matrix(frame_bgr, ang)
        res = model.predict(source=rot, imgsz=imgsz, conf=conf, device=device,
                            verbose=False, classes=class_filter)[0]
        if res.boxes is None: continue
        Hr, Wr = rot.shape[:2]
        for b in res.boxes:
            cls_id = int(b.cls[0]); score = float(b.conf[0])
            xr1, yr1, xr2, yr2 = map(int, b.xyxy[0].cpu().numpy())
            xr1, yr1, xr2, yr2 = clamp_box(xr1, yr1, xr2, yr2, Wr, Hr)
            bx1, by1, bx2, by2 = map_box_back_arbitrary(xr1, yr1, xr2, yr2, invM, W, H)
            all_boxes.append([bx1, by1, bx2, by2])
            all_scores.append(score)
            all_cls.append(cls_id)
        if len(all_boxes) > 0:
            break
    if not all_boxes: return []
    keep = nms(all_boxes, all_scores, iou_merge)
    return [(all_boxes[i][0], all_boxes[i][1], all_boxes[i][2], all_boxes[i][3],
             all_cls[i], float(all_scores[i])) for i in keep]

# -------- mouse: click to set fixed targets --------
fixed_bottle_px = None
fixed_hand_px   = None
mouse_last = None
def on_mouse(event, x, y, flags, param):
    global fixed_bottle_px, fixed_hand_px, mouse_last
    if event == cv2.EVENT_LBUTTONDOWN:
        fixed_bottle_px = (x, y)
        mouse_last = f"Fixed bottle target set: {fixed_bottle_px}"
    elif event == cv2.EVENT_RBUTTONDOWN:
        fixed_hand_px = (x, y)
        mouse_last = f"Fixed hand (index) target set: {fixed_hand_px}"

# ----- GRASP detection helpers -----
def point_in_box(pt, box):
    if pt is None or box is None: return False
    x, y = pt
    x1, y1, x2, y2 = box
    return (x1 <= x <= x2) and (y1 <= y <= y2)

def expand_box(box, margin):
    if box is None: return None
    x1, y1, x2, y2 = box
    return (x1 - margin, y1 - margin, x2 + margin, y2 + margin)

def grasp_detect_for_hand(landmarks_px, bottle_box, ear_dist=None):
    """
    Dominant-hand grasp heuristic:
      - Thumb tip (4) & index tip (8) inside an expanded bottle box
      - Thumb–index distance small (pinch)
    """
    if bottle_box is None or landmarks_px is None: return False
    if 4 not in landmarks_px or 8 not in landmarks_px: return False

    x1, y1, x2, y2 = bottle_box
    bw, bh = max(1, x2 - x1), max(1, y2 - y1)
    margin = int(0.15 * max(bw, bh))  # allow slightly outside
    ex_box = expand_box(bottle_box, margin)

    thumb = landmarks_px[4]
    index = landmarks_px[8]
    in_box = point_in_box(thumb, ex_box) and point_in_box(index, ex_box)

    pinch = euclid(thumb, index)
    pinch_thresh = 0.35 * min(bw, bh)
    if ear_dist:
        pinch_thresh = 0.50 * ear_dist  # stabilize threshold

    return in_box and (pinch <= pinch_thresh)

# ---------- main ----------
def main():
    global TARGET_MODE, fixed_bottle_px, fixed_hand_px, mouse_last

    # Ask handedness initially
    user_in = input("Are you right- or left-handed? [r/l] (Enter for Right): ").strip().lower()
    dominant = "right" if user_in not in ("l", "left") else "left"

    model = YOLO(MODEL_PATH)
    if HALF and DEVICE != "cpu":
        try: model.fuse()
        except Exception: pass
    names = model.names

    class_filter = None
    if TARGET_CLASS:
        ids = [i for i, n in names.items() if str(n).lower() == TARGET_CLASS]
        if ids: class_filter = ids
        else:   print(f'WARNING: class "{TARGET_CLASS}" not in model; running with all classes.')

    cap = cv2.VideoCapture(CAM_INDEX)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_W)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_H)
    cap.set(cv2.CAP_PROP_FPS, 30)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    if not cap.isOpened():
        raise RuntimeError("Cannot open webcam")

    hands = mp_hands.Hands(static_image_mode=False, max_num_hands=2, model_complexity=0,
                           min_detection_confidence=0.5, min_tracking_confidence=0.5)
    pose  = mp_pose.Pose(static_image_mode=False, model_complexity=0, enable_segmentation=False,
                         min_detection_confidence=0.5, min_tracking_confidence=0.5)
    face  = mp_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=True,
                             min_detection_confidence=0.5, min_tracking_confidence=0.5)

    ready_hold  = 0
    grasp_start_time = None  # track continuous grasp after READY

    fps_deque = deque(maxlen=FPS_SMOOTH_N)
    prev_t = time.time()

    win_name = "YOLO + MediaPipe — Dominant-hand only • READY(Idx) • GRABBED • TEST PASSED"
    cv2.namedWindow(win_name, cv2.WINDOW_NORMAL)
    cv2.setMouseCallback(win_name, on_mouse)

    try:
        while True:
            ok, frame = cap.read()
            if not ok: break
            if FLIP_VIEW:
                frame = cv2.flip(frame, 1)

            h, w = frame.shape[:2]
            img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # --- MediaPipe Hands: keep ONLY the dominant hand ---
            dominant_hand_landmarks_px = None
            dominant_index_px = None
            hand_results = hands.process(img_rgb)
            if hand_results.multi_hand_landmarks:
                for lms, handed in zip(hand_results.multi_hand_landmarks, hand_results.multi_handedness):
                    side_raw = handed.classification[0].label  # "Left" / "Right"
                    effective_side = ("Right" if side_raw == "Left" else "Left") if SWAP_HANDS else side_raw
                    if (dominant == "right" and effective_side == "Right") or \
                       (dominant == "left"  and effective_side == "Left"):
                        mp_draw.draw_landmarks(
                            frame, lms, mp_hands.HAND_CONNECTIONS,
                            mp_styles.get_default_hand_landmarks_style(),
                            mp_styles.get_default_hand_connections_style()
                        )
                        dominant_hand_landmarks_px = {i: to_pixels(lms.landmark[i], w, h) for i in range(21)}
                        if 8 in dominant_hand_landmarks_px:
                            dominant_index_px = dominant_hand_landmarks_px[8]
                            cv2.circle(frame, dominant_index_px, 7, (0, 210, 80), -1)  # index tip marker
                        break  # ignore other hands

            # --- Pose: ears only (wrist not needed for READY now) ---
            left_ear_px = right_ear_px = None
            pose_results = pose.process(img_rgb)
            if pose_results.pose_landmarks:
                lms = pose_results.pose_landmarks.landmark
                le_ar = lms[mp_pose.PoseLandmark.LEFT_EAR]
                re_ar = lms[mp_pose.PoseLandmark.RIGHT_EAR]
                if le_ar.visibility > 0.3 and re_ar.visibility > 0.3:
                    left_ear_px  = to_pixels(le_ar, w, h)
                    right_ear_px = to_pixels(re_ar, w, h)
                    cv2.circle(frame, left_ear_px, 4, (255, 255, 0), -1)
                    cv2.circle(frame, right_ear_px, 4, (255, 255, 0), -1)
                    cv2.line(frame, left_ear_px, right_ear_px, (255, 255, 0), 2)

            ear_dist = None
            if left_ear_px and right_ear_px:
                ear_dist = euclid(left_ear_px, right_ear_px)

            # --- YOLO: bottle detection ---
            detections = detect_conditional_rotations(
                model=model, frame_bgr=frame, class_filter=class_filter, conf=CONF,
                imgsz=IMG_SIZE, device=DEVICE, angles=SECONDARY_ANGLES, iou_merge=IOU_NMS
            )

            top_bottle_center = None
            top_bottle_box = None
            top_bottle_score = -1.0
            for (x1, y1, x2, y2, cls_id, score) in detections:
                name = names.get(cls_id, str(cls_id))
                color = (0, 255, 255)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                label = f"{name} {score:.2f}"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_DUPLEX, 0.6, 2)
                y1t = max(0, y1 - th - 6)
                cv2.rectangle(frame, (x1, y1t), (x1 + tw + 8, y1), color, -1)
                cv2.putText(frame, label, (x1 + 4, y1 - 6),
                            cv2.FONT_HERSHEY_DUPLEX, 0.6, (0, 0, 0), 2, cv2.LINE_AA)
                if score > top_bottle_score:
                    top_bottle_score = score
                    top_bottle_center = ((x1 + x2)//2, (y1 + y2)//2)
                    top_bottle_box = (x1, y1, x2, y2)

            # --- Keyboard input ---
            key = cv2.waitKey(1) & 0xFF
            if key in (ord('l'), ord('L')): dominant = "left"
            elif key in (ord('r'), ord('R')): dominant = "right"
            elif key in (ord('t'), ord('T')):
                TARGET_MODE = "head" if TARGET_MODE == "fixed" else "fixed"
            elif key in (ord('s'), ord('S')):
                if top_bottle_center: fixed_bottle_px = top_bottle_center
                if dominant_index_px: fixed_hand_px = dominant_index_px
            elif key == ord('q'):
                break

            # ---- Targets & tolerance ----
            if TARGET_MODE == "fixed":
                bottle_target = fixed_bottle_px or (int(FIXED_BOTTLE_FRAC[0]*w), int(FIXED_BOTTLE_FRAC[1]*h))
                hand_target   = fixed_hand_px   or (int(FIXED_HAND_FRAC[0]*w),   int(FIXED_HAND_FRAC[1]*h))
                toler_px = FIXED_TOLER_PX if FIXED_TOLER_PX > 0 else max(12, int(INIT_TOLER_FRAC * (ear_dist or 400)))
                mode_label = "Mode: FIXED (T to toggle)"
            else:
                bottle_target = fixed_bottle_px or (int(FIXED_BOTTLE_FRAC[0]*w), int(FIXED_BOTTLE_FRAC[1]*h))
                hand_target   = fixed_hand_px   or (int(FIXED_HAND_FRAC[0]*w),   int(FIXED_HAND_FRAC[1]*h))
                toler_px = max(12, int(INIT_TOLER_FRAC * (ear_dist or 400)))
                mode_label = "Mode: HEAD-SCALED (T to toggle)"

            # Draw targets
            bottle_ring_color = (0, 180, 255)
            hand_ring_color   = (0, 210, 80) if dominant == "right" else (80, 160, 255)
            cv2.circle(frame, bottle_target, toler_px, bottle_ring_color, 2)
            cv2.circle(frame, hand_target,   toler_px, hand_ring_color, 2)
            cv2.circle(frame, bottle_target, 5, bottle_ring_color, -1)
            cv2.circle(frame, hand_target,   5, hand_ring_color, -1)

            # Bottle OK: target point inside bbox
            ok_bottle = False
            if top_bottle_box is not None:
                x1, y1, x2, y2 = top_bottle_box
                ok_bottle = (x1 <= bottle_target[0] <= x2) and (y1 <= bottle_target[1] <= y2)

            # Hand OK: **dominant index tip** near hand_target
            ok_hand = dominant_index_px is not None and euclid(dominant_index_px, hand_target) <= toler_px

            # READY logic (both must be true)
            if ok_bottle and ok_hand:
                ready_hold += 1
            else:
                ready_hold = 0
                grasp_start_time = None

            ready = (ready_hold >= READY_HOLD_FRAMES)
            if ready:
                cv2.putText(frame, "READY", (w//2 - 90, 90),
                            cv2.FONT_HERSHEY_TRIPLEX, 1.7, (0, 255, 0), 3)

            # -------- GRASP detection (dominant hand only) --------
            grasped = False
            if dominant_hand_landmarks_px is not None and top_bottle_box is not None:
                grasped = grasp_detect_for_hand(dominant_hand_landmarks_px, top_bottle_box, ear_dist)

            # Visualize GRABBED overlay
            if top_bottle_box is not None and grasped:
                x1, y1, x2, y2 = top_bottle_box
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 230, 0), 3)
                cv2.putText(frame, "GRABBED", (x1, max(22, y1 - 10)),
                            cv2.FONT_HERSHEY_TRIPLEX, 0.9, (0, 230, 0), 2, cv2.LINE_AA)

            # ---- 5s test pass AFTER READY ----
            if ready and grasped:
                if grasp_start_time is None:
                    grasp_start_time = time.time()
                elapsed = time.time() - grasp_start_time
                cv2.putText(frame, f"Holding: {elapsed:0.1f}/{GRASP_HOLD_SECONDS:.0f}s",
                            (10, h - 18), cv2.FONT_HERSHEY_DUPLEX, 0.8, (0, 255, 200), 2)
                if elapsed >= GRASP_HOLD_SECONDS:
                    cv2.putText(frame, "TEST PASSED", (w//2 - 140, 140),
                                cv2.FONT_HERSHEY_TRIPLEX, 1.6, (0, 255, 255), 3)
            else:
                grasp_start_time = None

            # HUD
            hud1 = f"Dominant: {dominant.capitalize()}   {mode_label}   (S: snap, L/R: switch hand)   READY uses INDEX"
            cv2.putText(frame, hud1, (10, 32), cv2.FONT_HERSHEY_DUPLEX, 0.8, (220, 255, 220), 2)
            if mouse_last:
                cv2.putText(frame, mouse_last, (10, 60), cv2.FONT_HERSHEY_DUPLEX, 0.7, (220, 220, 255), 2)

            # FPS
            now = time.time()
            fps = 1.0 / max(1e-6, (now - prev_t))
            prev_t = now
            fps_deque.append(fps)
            fps_avg = sum(fps_deque) / len(fps_deque)
            cv2.putText(frame, f"{fps_avg:.1f} FPS", (w-160, 32),
                        cv2.FONT_HERSHEY_DUPLEX, 0.8, (0, 255, 180), 2)

            cv2.imshow(win_name, frame)

    finally:
        try:
            hands.close(); pose.close(); face.close()
        except Exception:
            pass
        cap.release(); cv2.destroyAllWindows()

if __name__ == "__main__":
    main()