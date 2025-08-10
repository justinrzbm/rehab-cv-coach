import cv2
import time
import math
import numpy as np
from collections import deque
from ultralytics import YOLO
import mediapipe as mp

# -------- CONFIG --------
MODEL_PATH   = "yolov10b.pt"
CONF         = 0.50
IMG_SIZE     = 768
DEVICE       = "mps"           # 0 (CUDA), "cpu", "mps"
HALF         = False
CAM_INDEX    = 0
FRAME_W      = 1280
FRAME_H      = 720
FLIP_VIEW    = True
TARGET_CLASS = "bottle"
IOU_NMS      = 0.50
FPS_SMOOTH_N = 20
HOLD_TIME_REQUIRED = 5

DEFAULT_MOUTH_SCALE = 0.80
MIN_SCALE, MAX_SCALE = 0.10, 2.50

REF_MODE = "auto"

# MediaPipe
mp_hands  = mp.solutions.hands
mp_pose   = mp.solutions.pose
mp_mesh   = mp.solutions.face_mesh
mp_draw   = mp.solutions.drawing_utils
mp_styles = mp.solutions.drawing_styles

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

def detect_on_frame(model, frame_bgr, class_filter, conf, imgsz, device):
    """Returns list of (x1,y1,x2,y2, cls_id, score)."""
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

def hold(hand = "r"):
    global REF_MODE

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

    mouth_scale = DEFAULT_MOUTH_SCALE
    fps_deque   = deque(maxlen=FPS_SMOOTH_N)
    prev_t      = time.time()

    MAX_RETRIES = 3
    retry_count = 0
    hold_start_time = None
    was_holding = False
    test_completed = False

    win = "Reach-to-Mouth (C to calibrate • 1/2/3 to pick ref)"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)

    try:
        while True:
            ok, frame = cap.read()
            if not ok: break
            if FLIP_VIEW:
                frame = cv2.flip(frame, 1)

            h, w = frame.shape[:2]
            img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            hand_results = hands.process(img_rgb)
            pose_results = pose.process(img_rgb)
            face_results = face.process(img_rgb)

            right_index_px = left_index_px = None
            if hand_results.multi_hand_landmarks:
                for lms, handed in zip(hand_results.multi_hand_landmarks, hand_results.multi_handedness):
                    mp_draw.draw_landmarks(
                        frame, lms, mp_hands.HAND_CONNECTIONS,
                        mp_styles.get_default_hand_landmarks_style(),
                        mp_styles.get_default_hand_connections_style()
                    )
                    idx_tip = lms.landmark[8]
                    idx_px  = to_pixels(idx_tip, w, h)
                    if handed.classification[0].label == "Right":
                        right_index_px = idx_px
                    else:
                        left_index_px  = idx_px

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
                ear_dist = euclid(left_ear_px, right_ear_px)
                cv2.putText(frame, f"HeadW: {ear_dist:.0f}px  Scale: {mouth_scale:.2f}",
                            (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (220, 255, 220), 2)

            mouth_center_px = None
            if face_results and face_results.multi_face_landmarks:
                mp_draw.draw_landmarks(
                    image=frame,
                    landmark_list=face_results.multi_face_landmarks[0],
                    connections=mp_mesh.FACEMESH_LIPS,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_draw.DrawingSpec(thickness=2, circle_radius=1)
                )
                lmsf = face_results.multi_face_landmarks[0].landmark
                try:
                    ux, uy = to_pixels(lmsf[13], w, h)
                    lx, ly = to_pixels(lmsf[14], w, h)
                    mouth_center_px = ((ux + lx)//2, (uy + ly)//2)
                    cv2.circle(frame, mouth_center_px, 5, (0, 255, 255), -1)
                except IndexError:
                    pass

            detections = detect_on_frame(model, frame, class_filter, CONF, IMG_SIZE, DEVICE)
            top_bottle_center = None
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

            ref_pt = None
            ref_label = None
            if REF_MODE == "bottle" and top_bottle_center:
                ref_pt = top_bottle_center; ref_label = "Bottle center"
            elif REF_MODE == "right_index" and right_index_px:
                ref_pt = right_index_px; ref_label = "Right index"
            elif REF_MODE == "left_index" and left_index_px:
                ref_pt = left_index_px; ref_label = "Left index"
            else:
                if top_bottle_center:
                    ref_pt = top_bottle_center; ref_label = "Bottle center"
                elif right_index_px:
                    ref_pt = right_index_px; ref_label = "Right index"
                elif left_index_px:
                    ref_pt = left_index_px; ref_label = "Left index"

            key = cv2.waitKey(1) & 0xFF
            if key == ord('1'): REF_MODE = "bottle"
            elif key == ord('2'): REF_MODE = "right_index"
            elif key == ord('3'): REF_MODE = "left_index"
            elif key in (ord('a'), ord('A')): REF_MODE = "auto"
            elif key in (ord('c'), ord('C')):
                if ear_dist and mouth_center_px and ref_pt:
                    d = euclid(ref_pt, mouth_center_px)
                    mouth_scale = max(MIN_SCALE, min(MAX_SCALE, d / ear_dist))
                    print(f"[Calibrated] mouth_scale = {mouth_scale:.3f} (threshold = {mouth_scale:.3f} × head width)")
                else:
                    print("Calibration needs ears, mouth, and a reference point.")
            elif key == ord('q'):
                break

            if ear_dist and mouth_center_px and ref_pt:
                thresh = mouth_scale * ear_dist
                d_ref = euclid(ref_pt, mouth_center_px)
                near = d_ref <= thresh

                cv2.circle(frame, mouth_center_px, int(thresh), (0, 200, 255), 2)
                cv2.line(frame, mouth_center_px, ref_pt, (0, 200, 255), 2)
                cv2.putText(frame, f"{ref_label or 'Ref'}→Mouth: {d_ref:.0f}/{thresh:.0f}px",
                            (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 255), 2)

                if near:
                    current_time = time.time()
                    if hold_start_time is None:
                        hold_start_time = current_time

                    elapsed = current_time - hold_start_time
                    remaining = max(0, HOLD_TIME_REQUIRED - elapsed)

                    if remaining > 0:
                        cv2.putText(frame, f"HOLD: {remaining:.1f}s", (w//2 - 170, 100),
                                    cv2.FONT_HERSHEY_TRIPLEX, 1.1, (0, 255, 0), 3)
                    else:
                        cv2.putText(frame, "TASK COMPLETE!", (w//2 - 170, 100),
                                    cv2.FONT_HERSHEY_TRIPLEX, 1.1, (0, 255, 0), 3)
                        if not test_completed:
                            hold_passed = retry_count <= MAX_RETRIES
                            # print(f"\n{'='*60}")
                            print(f"{'✅ PASSED' if hold_passed else '❌ FAILED'} 🎯")
                            print(f"{'='*60}")
                            print(f"Hold Duration: {HOLD_TIME_REQUIRED}s")
                            print(f"Number of Retries: {retry_count} (max {MAX_RETRIES})")
                            print(f"{'='*60}")
                            test_completed = True
                        if hold_passed:
                            return 1
                        else:
                            return 0
                    was_holding = True
                else:
                    if was_holding:
                        retry_count += 1
                    was_holding = False
                    hold_start_time = None
                    test_completed = False

            mode_text = f"Ref: {REF_MODE.upper()}  (1/2/3 or A=auto)   C=calibrate   Q=quit"
            cv2.putText(frame, mode_text, (10, 30), cv2.FONT_HERSHEY_DUPLEX, 0.75, (220, 255, 220), 2)

            now = time.time()
            fps = 1.0 / max(1e-6, (now - prev_t))
            prev_t = now
            fps_deque.append(fps)
            fps_avg = sum(fps_deque) / len(fps_deque)
            cv2.putText(frame, f"{fps_avg:.1f} FPS", (w-150, 30),
                        cv2.FONT_HERSHEY_DUPLEX, 0.75, (0, 255, 180), 2)

            cv2.imshow(win, frame)

    finally:
        try:
            hands.close(); pose.close(); face.close()
        except Exception:
            pass
        cap.release(); cv2.destroyAllWindows()

