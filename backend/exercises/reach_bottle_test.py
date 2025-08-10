# Reach Bottle Test - Standalone Exercise
# pip install ultralytics opencv-python mediapipe

import cv2
import time
import numpy as np
from collections import deque
from ultralytics import YOLO
import mediapipe as mp
import math
from exercises.reach_bottle import ReachBottleMetrics

# ---------- CONFIG ----------
MODEL_PATH   = "../yolov10b.pt"  # or yolov8n/s/m/l/x.pt
CONF         = 0.80           # YOLO confidence
IMG_SIZE     = 768            # try 640 on CPU for more FPS; 832/960 on GPU
DEVICE       = "mps"          # 0 for CUDA, "cpu", or "mps" (Apple)
HALF         = False          # set True on CUDA for FP16
CAM_INDEX    = 0
FRAME_W      = 1280           # camera request (try 1280x720)
FRAME_H      = 720
FLIP_VIEW    = True           # mirror preview to match movement
TARGET_CLASS = "bottle"       # Only detect bottles
ELBOW_VIS_TH = 0.30
# Only used if 0° finds nothing:
SECONDARY_ANGLES = []   # add/remove angles as desired
IOU_NMS      = 0.50
FPS_SMOOTH_N = 20
# Reach Bottle Metrics Configuration
REACH_GRASP_DISTANCE = 80  # pixels to consider hand "within grasp" of bottle
REACH_MOVEMENT_THRESHOLD = 5  # minimum movement (pixels) to detect start of movement
# ----------------------------

# Add constants at top
MAX_REACH_TIME = 10.0  # seconds
MAX_REACTION_TIME = 5.0  # seconds
MAX_JERKS = 30

# --- OpenCV runtime opts ---
cv2.setUseOptimized(True)

# --- MediaPipe setup (lighter) ---
mp_hands  = mp.solutions.hands
mp_pose   = mp.solutions.pose
mp_draw   = mp.solutions.drawing_utils
mp_styles = mp.solutions.drawing_styles
SWAP_HANDS = True  # with mirrored preview, swap labels to match user perspective

def to_pixels(landmark, width, height):
    return int(landmark.x * width), int(landmark.y * height)

def euclid(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])

# ---------- geometry helpers ----------
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

# ---------- rotation helpers (any angle) ----------
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
    out = cv2.transform(pts_np, M)  # (N,1,2)
    return [(int(round(p[0][0])), int(round(p[0][1]))) for p in out]

def map_box_back_arbitrary(x1r, y1r, x2r, y2r, invM, W, H):
    corners_r = [(x1r, y1r), (x2r, y1r), (x2r, y2r), (x1r, y2r)]
    corners_o = apply_affine_to_points(corners_r, invM)
    xs = [x for x,_ in corners_o]; ys = [y for _,y in corners_o]
    bx1, by1, bx2, by2 = int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))
    return clamp_box(bx1, by1, bx2, by2, W, H)

# ---------- detection ----------
def detect_on_frame(model, frame_bgr, conf, imgsz, device, class_filter=None):
    """Returns list of (x1,y1,x2,y2, cls_id, score)."""
    h, w = frame_bgr.shape[:2]
    res = model.predict(
        source=frame_bgr, imgsz=imgsz, conf=conf, device=device,
        verbose=False, classes=class_filter
        )[0]
    out = []
    if res.boxes is None: return out
    for b in res.boxes:
        cls_id = int(b.cls[0]); score = float(b.conf[0])
        x1, y1, x2, y2 = map(int, b.xyxy[0].cpu().numpy())
        x1, y1, x2, y2 = clamp_box(x1, y1, x2, y2, w, h)
        out.append((x1, y1, x2, y2, cls_id, score))
    return out

def detect_conditional_rotations(model, frame_bgr, conf, imgsz, device, angles, iou_merge, class_filter=None):
    """Try 0° first, else fallback angles; map boxes back; NMS merge if needed."""
    H, W = frame_bgr.shape[:2]

    base = detect_on_frame(model, frame_bgr, conf, imgsz, device, class_filter)
    if base:
        return base

    all_boxes, all_scores, all_cls = [], [], []
    for ang in angles:
        rot, M, invM = rotate_with_matrix(frame_bgr, ang)
        res = model.predict(
            source=rot, imgsz=imgsz, conf=conf, device=device,
            verbose=False, classes=class_filter
        )[0]
        if res.boxes is None:
            continue
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

    if not all_boxes:
        return []
    keep = nms(all_boxes, all_scores, iou_merge)
    return [(all_boxes[i][0], all_boxes[i][1], all_boxes[i][2], all_boxes[i][3],
             all_cls[i], float(all_scores[i])) for i in keep]

# ---------- main ----------
def reach_test(hand = 'r', taggle = 'fixed'):
    print("🎯 REACH BOTTLE TEST - STANDALONE EXERCISE 🎯")
    print("=" * 50)
    print("Instructions:")
    print("1. Place a bottle in view of the camera")
    print("2. Ensure your right hand is visible")
    print("3. Press 's' to start the reach test")
    print("4. Extend your right hand toward the detected bottle")
    print("5. Press 'r' to reset, 'q' to quit")
    print("=" * 50)
    
    import os
    # Optional shared config from env
    env_dom = hand
    selected_hand_label = 'Left' if env_dom not in ("l", "left") else 'Right'
    # Load YOLO
    model = YOLO(MODEL_PATH)
    if HALF and DEVICE != "cpu":
        try:
            model.fuse()
        except Exception:
            pass
    names = model.names
    print("YOLO classes loaded successfully")
    class_filter = None
    if TARGET_CLASS:
        ids = [i for i, n in names.items() if str(n).lower() == TARGET_CLASS]
        if ids:
            class_filter = ids
        else:
            print(f'WARNING: class "{TARGET_CLASS}" not in model; running with all classes.')
            
    # Webcam (low-latency settings)
    cap = cv2.VideoCapture(CAM_INDEX)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_W)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_H)
    cap.set(cv2.CAP_PROP_FPS, 30)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    if not cap.isOpened():
        raise RuntimeError("Cannot open webcam")

    # MediaPipe (lighter configs)
    hands = mp_hands.Hands(
        static_image_mode=False, max_num_hands=2, model_complexity=0,
        min_detection_confidence=0.5, min_tracking_confidence=0.5
    )

    # Initialize Reach Bottle Metrics
    reach_metrics = ReachBottleMetrics(
        grasp_distance_threshold=REACH_GRASP_DISTANCE,
        movement_threshold=REACH_MOVEMENT_THRESHOLD
    )

    # FPS smoother
    fps_deque = deque(maxlen=FPS_SMOOTH_N)
    prev_t = time.time()

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Failed to grab frame"); break

            # Flip first so detections/landmarks align with displayed frame
            if FLIP_VIEW:
                frame = cv2.flip(frame, 1)

            h, w = frame.shape[:2]

            # --- MediaPipe for hand detection ---
            img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            hand_results = hands.process(img_rgb)

            # Draw hands + get a selected-hand index tip (if available)
            chosen_index_px = None
            if hand_results.multi_hand_landmarks:
                for hand_lms, handed in zip(hand_results.multi_hand_landmarks, hand_results.multi_handedness):
                    mp_draw.draw_landmarks(
                        frame, hand_lms, mp_hands.HAND_CONNECTIONS,
                        mp_styles.get_default_hand_landmarks_style(),
                        mp_styles.get_default_hand_connections_style()
                    )
                    side_raw = handed.classification[0].label  # "Left"/"Right"
                    effective_side = ("Right" if side_raw == "Left" else "Left") if SWAP_HANDS else side_raw
                    if effective_side == selected_hand_label:
                        li = hand_lms.landmark[8]  # index fingertip
                        chosen_index_px = to_pixels(li, w, h)

            # --- YOLO: try 0°, else conditional rotations ---
            detections = detect_conditional_rotations(
                model=model,
                frame_bgr=frame,
                conf=CONF,
                imgsz=IMG_SIZE,
                device=DEVICE,
                angles=SECONDARY_ANGLES,
                iou_merge=IOU_NMS,
                class_filter=class_filter
            )

            # Draw YOLO detections; pick top bottle for reach metrics
            top_bottle_center = None
            top_bottle_score = -1.0

            for (x1, y1, x2, y2, cls_id, score) in detections:
                name = names.get(cls_id, str(cls_id))
                color = (0, 255, 255)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                label = f"{name} {score:.2f}"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
                y1t = max(0, y1 - th - 4)
                cv2.rectangle(frame, (x1, y1t), (x1 + tw + 6, y1), color, -1)
                cv2.putText(frame, label, (x1 + 3, y1 - 6),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2, cv2.LINE_AA)

                # Track best bottle for reach metrics
                if name.lower() == 'bottle' and score > 0.3:
                    if top_bottle_center is None or score > top_bottle_score:
                        top_bottle_center = ((x1 + x2)//2, (y1 + y2)//2)
                        top_bottle_score = score

            # --- Reach Bottle Test Controls ---
            key = cv2.waitKey(1) & 0xFF
            if key == ord('s'):  # Start reach test
                reach_metrics.start()
                print("\n🎯 [REACH TEST STARTED] Extend your hand toward the bottle!")
            
            if key == ord('r'):  # Reset reach test
                reach_metrics.reset()
                print("\n🔄 [REACH TEST RESET] Press 's' to start again")

            # --- Update reach metrics ---
            metrics_result = None
            if chosen_index_px and top_bottle_center and reach_metrics.start_signal_time is not None:
                current_time = time.time()
                metrics_result = reach_metrics.update(current_time, chosen_index_px, top_bottle_center)
                
                # Draw reach status on screen (only status, not metrics)
                y_offset = 120
                cv2.putText(frame, f"Reach Status: {metrics_result['status']}", 
                            (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
                
                # Draw line from hand to bottle
                cv2.line(frame, chosen_index_px, top_bottle_center, (255, 255, 0), 2)
                
                # Draw grasp threshold circle around bottle
                cv2.circle(frame, top_bottle_center, REACH_GRASP_DISTANCE, (255, 255, 0), 2)
                
                # Print results when reach is completed
                if metrics_result['status'] == 'reached bottle' and metrics_result['reach_time'] is not None:
                    # Calculate pass/fail
                    reach_passed = (
                        metrics_result['reach_time'] <= MAX_REACH_TIME and
                        metrics_result['reaction_time'] <= MAX_REACTION_TIME and
                        metrics_result['trajectory_smoothness'] <= MAX_JERKS
                    )
                    
                    print(f"\n{'='*60}")
                    print(f"{'✅ PASSED' if reach_passed else '❌ FAILED'} 🎯")
                    print(f"{'='*60}")
                    print(f"📊 FINAL METRICS SUMMARY:")
                    print(f"   ⏱️  Reaction Time: {metrics_result['reaction_time']:.3f}s (max {MAX_REACTION_TIME}s)")
                    print(f"   🚀 Reach Time: {metrics_result['reach_time']:.3f}s (max {MAX_REACH_TIME}s)")
                    print(f"   📈 Trajectory Smoothness: {metrics_result['trajectory_smoothness']} changes (max {MAX_JERKS})")
                    
                    if not reach_passed:
                        print("\nFAILURE REASONS:")
                        if metrics_result['reach_time'] > MAX_REACH_TIME:
                            print("- Reach time too long")
                        if metrics_result['reaction_time'] > MAX_REACTION_TIME:
                            print("- Reaction time too long")
                        if metrics_result['trajectory_smoothness'] > MAX_JERKS:
                            print("- Too many direction changes")
                    
                    print(f"{'='*60}")
                    if reach_passed:
                        return 1
                    else:
                        return 0
                    print(f"Press 's' to start another test or 'q' to quit\n")
                    # Reset for next test
                    reach_metrics.reset()
            elif reach_metrics.start_signal_time is not None:
                # Test started but no bottle detected
                y_offset = 120
                cv2.putText(frame, "Reach Status: Waiting for bottle detection", 
                            (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)
                cv2.putText(frame, "Place a bottle in view", 
                            (10, y_offset + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 1)
            else:
                # No test started
                y_offset = 120
                cv2.putText(frame, "Reach Status: Press 's' to start test", 
                            (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (128, 128, 128), 2)
                cv2.putText(frame, "Ensure bottle and right hand are visible", 
                            (10, y_offset + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (128, 128, 128), 1)

            # FPS (smoothed)
            now = time.time()
            fps = 1.0 / max(1e-6, (now - prev_t))
            prev_t = now
            fps_deque.append(fps)
            fps_avg = sum(fps_deque) / len(fps_deque)
            cv2.putText(frame, f"FPS: {fps_avg:.1f}", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)

            # Display help text
            help_y = h - 100
            cv2.putText(frame, "Controls: 's'=start test, 'r'=reset, 'q'=quit", 
                        (10, help_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
            cv2.putText(frame, "Reach Test: Extend your right hand toward the detected bottle", 
                        (10, help_y + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

            cv2.imshow("Reach Bottle Test - Standalone Exercise", frame)

            # standard quit
            if key == ord('q'):
                break

    finally:
        hands.close()
        cap.release(); cv2.destroyAllWindows()
        print("\n👋 Reach Bottle Test completed. Goodbye!")

# if __name__ == "__main__":
#     result = main()
#     print(result)

