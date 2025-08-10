import cv2
import time
import numpy as np
from collections import deque
from ultralytics import YOLO
import mediapipe as mp
import math
from grab_hold import ReadyGraspHold


# ---------- CONFIG ----------
MODEL_PATH   = "../yolov10b.pt"
CONF         = 0.80
IMG_SIZE     = 768
DEVICE       = "mps"
HALF         = False
CAM_INDEX    = 0
FRAME_W      = 1280
FRAME_H      = 720
FLIP_VIEW    = True
TARGET_CLASS = "bottle"
SECONDARY_ANGLES = []
IOU_NMS      = 0.50
FPS_SMOOTH_N = 20

# Targeting & tolerance (mirror main.py)
TARGET_MODE = "fixed"  # "fixed" or "head"
FIXED_BOTTLE_FRAC = (0.50, 0.78)
FIXED_HAND_FRAC   = (0.70, 0.85)
FIXED_TOLER_PX    = 60
INIT_TOLER_FRAC   = 0.15

SWAP_HANDS = False

mp_hands  = mp.solutions.hands
mp_pose   = mp.solutions.pose
mp_draw   = mp.solutions.drawing_utils
mp_styles = mp.solutions.drawing_styles


def clamp_box(x1, y1, x2, y2, w, h):
    x1 = max(0, min(w-1, x1)); y1 = max(0, min(h-1, y1))
    x2 = max(0, min(w-1, x2)); y2 = max(0, min(h-1, y2))
    if x2 < x1: x1, x2 = x2, x1
    if y2 < y1: y1, y2 = y2, y1
    return x1, y1, x2, y2


def detect_on_frame(model, frame_bgr, conf, imgsz, device, class_filter=None):
    res = model.predict(source=frame_bgr, imgsz=imgsz, conf=conf, device=device, verbose=False, classes=class_filter)[0]
    out = []
    if res.boxes is None:
        return out
    h, w = frame_bgr.shape[:2]
    for b in res.boxes:
        cls_id = int(b.cls[0]); score = float(b.conf[0])
        x1, y1, x2, y2 = map(int, b.xyxy[0].cpu().numpy())
        x1, y1, x2, y2 = clamp_box(x1, y1, x2, y2, w, h)
        out.append((x1, y1, x2, y2, cls_id, score))
    return out


def to_pixels(landmark, width, height):
    return int(landmark.x * width), int(landmark.y * height)


def landmarks_dict(hand_lms, w, h):
    return {i: to_pixels(hand_lms.landmark[i], w, h) for i in range(21)}


def main():
    global TARGET_MODE
    print("✊ GRAB/HOLD TEST (main.py-style)")
    print("- L/R: switch dominant hand")
    print("- T: toggle target mode (Fixed / Head-scaled)")
    print("- S: snap Fixed targets from current bottle center + dominant index tip")
    print("- Mouse: Left= set bottle target, Right= set hand target")
    print("- Q: quit")

    import os
    # Ask handedness initially (or read from env)
    rh = ReadyGraspHold()
    env_dom = os.environ.get("DEX_DOMINANT", "").strip().lower()
    if env_dom in ("left", "l"):
        rh.set_dominant("left")
    elif env_dom in ("right", "r"):
        rh.set_dominant("right")
    else:
        user_in = input("Are you right- or left-handed? [r/l] (Enter for Right): ").strip().lower()
        rh.set_dominant_from_input(user_in)

    # Optional env-driven target mode
    env_mode = os.environ.get("DEX_TARGET_MODE", "").strip().lower()
    if env_mode in ("fixed", "head"):
        TARGET_MODE = env_mode

    # Load YOLO
    model = YOLO(MODEL_PATH)
    names = model.names
    class_filter = None
    if TARGET_CLASS:
        ids = [i for i, n in names.items() if str(n).lower() == TARGET_CLASS]
        if ids:
            class_filter = ids

    # Webcam
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

    fps_deque = deque(maxlen=FPS_SMOOTH_N)
    prev_t = time.time()

    fixed_bottle_px = None
    fixed_hand_px   = None
    mouse_last = None

    def on_mouse(event, x, y, flags, param):
        nonlocal fixed_bottle_px, fixed_hand_px, mouse_last
        if event == cv2.EVENT_LBUTTONDOWN:
            fixed_bottle_px = (x, y); mouse_last = f"Fixed bottle: {fixed_bottle_px}"
        elif event == cv2.EVENT_RBUTTONDOWN:
            fixed_hand_px = (x, y); mouse_last = f"Fixed hand: {fixed_hand_px}"

    win_name = "Grab/Hold (main.py-style)"
    cv2.namedWindow(win_name, cv2.WINDOW_NORMAL)
    cv2.setMouseCallback(win_name, on_mouse)

    grab_announced = False
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Failed to grab frame"); break
            if FLIP_VIEW:
                frame = cv2.flip(frame, 1)

            h, w = frame.shape[:2]

            img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            hand_results = hands.process(img_rgb)
            pose_results = pose.process(img_rgb)

            # Hands → draw landmarks and collect full 21-landmark dicts for left/right
            left_landmarks_px = None
            right_landmarks_px = None
            if hand_results.multi_hand_landmarks:
                for lms, handed in zip(hand_results.multi_hand_landmarks, hand_results.multi_handedness):
                    # Draw MediaPipe hand landmarks overlay
                    mp_draw.draw_landmarks(
                        frame, lms, mp_hands.HAND_CONNECTIONS,
                        mp_styles.get_default_hand_landmarks_style(),
                        mp_styles.get_default_hand_connections_style()
                    )
                    side_raw = handed.classification[0].label
                    effective_side = ("Right" if side_raw == "Left" else "Left") if SWAP_HANDS else side_raw
                    if effective_side == "Left":
                        left_landmarks_px = landmarks_dict(lms, w, h)
                    else:
                        right_landmarks_px = landmarks_dict(lms, w, h)

            # Overlay hand labels and index tip markers for clarity
            if left_landmarks_px:
                if 0 in left_landmarks_px:
                    lx, ly = left_landmarks_px[0]
                    cv2.putText(frame, "Left", (lx - 20, ly - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (80, 160, 255), 2)
                if 8 in left_landmarks_px:
                    cv2.circle(frame, left_landmarks_px[8], 6, (80, 160, 255), -1)
            if right_landmarks_px:
                if 0 in right_landmarks_px:
                    rx, ry = right_landmarks_px[0]
                    cv2.putText(frame, "Right", (rx - 20, ry - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 210, 80), 2)
                if 8 in right_landmarks_px:
                    cv2.circle(frame, right_landmarks_px[8], 6, (0, 210, 80), -1)

            # Emphasize dominant index tip
            dom_landmarks = right_landmarks_px if rh.dominant == 'right' else left_landmarks_px
            if dom_landmarks and 8 in dom_landmarks:
                cv2.circle(frame, dom_landmarks[8], 9, (0, 255, 255), 2)

            # Ears for head width
            left_ear_px = right_ear_px = None
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
                ear_dist = math.hypot(left_ear_px[0]-right_ear_px[0], left_ear_px[1]-right_ear_px[1])

            # YOLO bottle detection
            detections = detect_on_frame(model, frame, CONF, IMG_SIZE, DEVICE, class_filter)
            top_bottle_center = None
            top_bottle_box = None
            top_score = -1.0
            for (x1, y1, x2, y2, cls_id, score) in detections:
                name = names.get(cls_id, str(cls_id))
                color = (0, 255, 255)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                label = f"{name} {score:.2f}"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                y1t = max(0, y1 - th - 6)
                cv2.rectangle(frame, (x1, y1t), (x1 + tw + 8, y1), color, -1)
                cv2.putText(frame, label, (x1 + 4, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,0), 2, cv2.LINE_AA)
                if name.lower() == 'bottle' and score > top_score:
                    top_score = score
                    top_bottle_center = ((x1 + x2)//2, (y1 + y2)//2)
                    top_bottle_box = (x1, y1, x2, y2)

            # Keyboard controls
            key = cv2.waitKey(1) & 0xFF
            if key in (ord('l'), ord('L')): rh.set_dominant('left')
            elif key in (ord('r'), ord('R')): rh.set_dominant('right')
            elif key in (ord('t'), ord('T')): TARGET_MODE = 'head' if TARGET_MODE == 'fixed' else 'fixed'
            elif key in (ord('s'), ord('S')):
                if top_bottle_center: fixed_bottle_px = top_bottle_center
                dom = right_landmarks_px if rh.dominant == 'right' else left_landmarks_px
                if dom and 8 in dom: fixed_hand_px = dom[8]
            elif key == ord('q'): break

            # Targets & tolerance
            if TARGET_MODE == 'fixed':
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
            hand_ring_color   = (0, 210, 80) if rh.dominant == 'right' else (80, 160, 255)
            if bottle_target: cv2.circle(frame, bottle_target, toler_px, bottle_ring_color, 2)
            if hand_target:   cv2.circle(frame, hand_target,   toler_px, hand_ring_color, 2)
            if bottle_target: cv2.circle(frame, bottle_target, 5, bottle_ring_color, -1)
            if hand_target:   cv2.circle(frame, hand_target,   5, hand_ring_color, -1)

            # Update READY/GRASP logic
            result = rh.update(
                current_time=time.time(),
                left_hand_landmarks_px=left_landmarks_px,
                right_hand_landmarks_px=right_landmarks_px,
                bottle_box=top_bottle_box,
                ear_dist=ear_dist,
                bottle_target_xy=bottle_target,
                hand_target_xy=hand_target,
                toler_px=toler_px,
            )

            # Visuals: READY and GRABBED
            if result['ready']:
                cv2.putText(frame, "READY", (w//2 - 90, 90), cv2.FONT_HERSHEY_TRIPLEX, 1.7, (0, 255, 0), 3)
            if top_bottle_box is not None and result['grasped']:
                x1, y1, x2, y2 = top_bottle_box
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 230, 0), 3)
                cv2.putText(frame, "GRABBED", (x1, max(22, y1 - 10)), cv2.FONT_HERSHEY_TRIPLEX, 0.9, (0, 230, 0), 2)

            # Immediate completion on GRAB detection (show grabbed box, pause 2s)
            if result['grasped']:
                if top_bottle_box is not None:
                    x1, y1, x2, y2 = top_bottle_box
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 230, 0), 3)
                cv2.putText(frame, "GRABBED", (w//2 - 100, 120), cv2.FONT_HERSHEY_TRIPLEX, 1.3, (0, 230, 0), 3)
                cv2.imshow(win_name, frame)
                if not grab_announced:
                    print("grabbed successful")
                    grab_announced = True

            # HUD
            hud1 = f"Dominant: {rh.dominant.capitalize()}   {mode_label}   (S: snap, L/R: switch hand)   READY uses INDEX"
            cv2.putText(frame, hud1, (10, 32), cv2.FONT_HERSHEY_DUPLEX, 0.8, (220, 255, 220), 2)
            if mouse_last:
                cv2.putText(frame, mouse_last, (10, 60), cv2.FONT_HERSHEY_DUPLEX, 0.7, (220, 220, 255), 2)

            # FPS
            now_t = time.time()
            fps = 1.0 / max(1e-6, (now_t - prev_t))
            prev_t = now_t
            fps_deque.append(fps)
            fps_avg = sum(fps_deque) / len(fps_deque)
            cv2.putText(frame, f"FPS: {fps_avg:.1f}", (w-180, 32), cv2.FONT_HERSHEY_DUPLEX, 0.8, (0, 255, 0), 2)

            cv2.imshow(win_name, frame)
            if key == ord('q'):
                break

    finally:
        hands.close(); pose.close()
        cap.release(); cv2.destroyAllWindows()


if __name__ == "__main__":
    main()


