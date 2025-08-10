import cv2
import time
import numpy as np
from collections import deque
from ultralytics import YOLO
import mediapipe as mp
import math

# ---------- CONFIG ----------
MODEL_PATH   = "../yolov10b.pt"
CONF         = 0.80
IMG_SIZE     = 768
DEVICE       = "mps"
CAM_INDEX    = 0
FRAME_W      = 1280
FRAME_H      = 720
FLIP_VIEW    = True
TARGET_CLASS = "bottle"
FPS_SMOOTH_N = 20

# Test-specific thresholds
MIN_TILT_ANGLE = 50.0  # degrees
MAX_JERKS = 5
JERK_ANGLE_THRESH_DEG = 10.0  # sudden angle change threshold
JERK_ACCEL_THRESH = 100.0  # sudden movement threshold

def detect_on_frame(model, frame_bgr, conf, imgsz, device, class_filter=None):
    res = model.predict(source=frame_bgr, imgsz=imgsz, conf=conf, device=device, verbose=False, classes=class_filter)[0]
    out = []
    if res.boxes is None:
        return out
    h, w = frame_bgr.shape[:2]
    for b in res.boxes:
        cls_id = int(b.cls[0]); score = float(b.conf[0])
        x1, y1, x2, y2 = map(int, b.xyxy[0].cpu().numpy())
        out.append((x1, y1, x2, y2, cls_id, score))
    return out

def calculate_bottle_angle(bbox):
    """Calculate bottle tilt angle from bounding box"""
    x1, y1, x2, y2 = bbox
    width = x2 - x1
    height = y2 - y1
    return math.degrees(math.atan2(width, height))

def dump():
    print("🧪 Dump into Mouth Test")
    print("Tilt bottle smoothly to simulate pouring")
    print("Press 's' to start when ready")

    model = YOLO(MODEL_PATH)
    names = model.names
    class_filter = None
    if TARGET_CLASS:
        ids = [i for i, n in names.items() if str(n).lower() == TARGET_CLASS]
        if ids:
            class_filter = ids

    cap = cv2.VideoCapture(CAM_INDEX)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_W)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_H)

    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands(static_image_mode=False, max_num_hands=2)

    # Test state
    test_started = False
    test_complete = False
    angles = []
    centers = []
    jerks_count = 0
    start_time = None

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if FLIP_VIEW:
                frame = cv2.flip(frame, 1)

            h, w = frame.shape[:2]
            img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Process hands
            hand_results = hands.process(img_rgb)
            
            # Detect bottle
            detections = detect_on_frame(model, frame, CONF, IMG_SIZE, DEVICE, class_filter)
            bottle_box = None
            for (x1, y1, x2, y2, cls_id, score) in detections:
                name = names.get(cls_id, str(cls_id))
                if name.lower() == 'bottle' and score > CONF:
                    bottle_box = (x1, y1, x2, y2)
                    center = ((x1 + x2)//2, (y1 + y2)//2)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    
                    if test_started and not test_complete:
                        # Track angle and position
                        angle = calculate_bottle_angle(bottle_box)
                        angles.append(angle)
                        centers.append(center)
                        
                        # Check for jerks
                        if len(angles) >= 3:
                            # Angle jerk detection
                            d1 = angles[-1] - angles[-2]
                            d2 = angles[-2] - angles[-3]
                            if abs(d1 - d2) >= JERK_ANGLE_THRESH_DEG:
                                jerks_count += 1
                            
                            # Position jerk detection
                            x0,y0 = centers[-3]
                            x1,y1 = centers[-2]
                            x2,y2 = centers[-1]
                            ax = (x2 - 2*x1 + x0)
                            ay = (y2 - 2*y1 + y0)
                            if math.hypot(ax, ay) >= JERK_ACCEL_THRESH:
                                jerks_count += 1
                        
                        # Show current angle
                        cv2.putText(frame, f"Angle: {angle:.1f}°", (10, 90),
                                  cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                        
                        # Check completion criteria
                        if len(angles) > 10:  # Need some minimum data
                            total_tilt = max(angles) - min(angles)
                            if total_tilt >= MIN_TILT_ANGLE:
                                test_complete = True
                                
                                # Print results
                                # print("\n===== DUMP-INTO-MOUTH METRICS =====")
                                # print(f"Tilt Angle: {total_tilt:.1f}° (threshold ≥ {MIN_TILT_ANGLE}°)")
                                # print(f"Pour Smoothness: {jerks_count} jerks (threshold ≤ {MAX_JERKS})")
                                # print("--------------------------------")
                                passed = (total_tilt >= MIN_TILT_ANGLE and 
                                        jerks_count <= MAX_JERKS)
                                if passed:
                                    print("✅PASSED!")
                                    return 1
                                else:
                                    print("❌FAILED!")
                                    return 0
                                print("--------------------------------")

            # Test controls
            key = cv2.waitKey(1) & 0xFF
            if key == ord('s') and not test_started:
                test_started = True
                start_time = time.time()
                angles = []
                centers = []
                jerks_count = 0
                print("\nTest started! Tilt the bottle smoothly.")
            elif key == ord('r'):
                test_started = False
                test_complete = False
                angles = []
                centers = []
                jerks_count = 0
                print("\nTest reset. Press 's' to start again.")
            elif key == ord('q'):
                break

            # Status display
            if test_started and not test_complete:
                status = "POURING - Tilt bottle smoothly"
            elif test_complete:
                status = "TEST COMPLETE - Press 'r' to retry"
            else:
                status = "Press 's' to start test"
            
            cv2.putText(frame, status, (10, 60),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 200), 2)

            cv2.imshow("Dump into Mouth Test", frame)

    finally:
        hands.close()
        cap.release()
        cv2.destroyAllWindows()
