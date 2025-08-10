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

# Test-specific constants
ASSUMED_BOTTLE_HEIGHT_CM = 24.0  # for px-to-cm conversion
ACCURACY_THRESHOLD_CM = 5.0      # maximum allowed final position error
SMOOTHNESS_THRESHOLD = 3.0       # maximum allowed jerkiness

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

def euclid(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])

def main():
    print("📥 Place Cup Down Test")
    print("Place cup down smoothly and accurately")
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
    start_center = None
    centers = []
    cm_per_px = None
    smoothness_score = 0
    
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
            current_center = None
            for (x1, y1, x2, y2, cls_id, score) in detections:
                name = names.get(cls_id, str(cls_id))
                if name.lower() == 'bottle' and score > CONF:
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    current_center = ((x1 + x2)//2, (y1 + y2)//2)
                    
                    # Calculate cm/px scale if needed
                    if cm_per_px is None:
                        bottle_height_px = y2 - y1
                        cm_per_px = ASSUMED_BOTTLE_HEIGHT_CM / float(bottle_height_px)

            # Test logic
            key = cv2.waitKey(1) & 0xFF
            if key == ord('s') and not test_started:
                if current_center:
                    test_started = True
                    start_center = current_center
                    centers = [start_center]
                    print("\nTest started! Place the cup down smoothly.")
                else:
                    print("No bottle detected! Keep bottle in view and try again.")
            elif key == ord('p') and test_started and not test_complete:
                # Complete test and calculate metrics
                if len(centers) > 2:
                    # Calculate placement smoothness
                    jerk_sum = 0.0
                    count = 0
                    for i in range(2, len(centers)):
                        x0, y0 = centers[i-2]
                        x1, y1 = centers[i-1]
                        x2, y2 = centers[i]
                        ax = (x2 - 2*x1 + x0)
                        ay = (y2 - 2*y1 + y0)
                        jerk_sum += math.hypot(ax, ay)
                        count += 1
                    
                    smoothness_score = (jerk_sum / count) if count > 0 else 0.0
                    
                    # Calculate final position accuracy
                    final_center = centers[-1]
                    dist_px = euclid(final_center, start_center)
                    dist_cm = dist_px * cm_per_px
                    
                    # Print results
                    print("\n===== PLACE CUP DOWN METRICS =====")
                    print(f"Placement Smoothness: {smoothness_score:.3f} (lower is better)")
                    print(f"Final Position Accuracy: {dist_cm:.2f} cm (threshold ≤ {ACCURACY_THRESHOLD_CM} cm)")
                    print("--------------------------------")
                    passed = (dist_cm <= ACCURACY_THRESHOLD_CM and 
                            smoothness_score <= SMOOTHNESS_THRESHOLD)
                    if passed:
                        print("✅ TEST PASSED!")
                    else:
                        print("❌ TEST FAILED!")
                    print("--------------------------------")
                    
                    test_complete = True
            elif key == ord('r'):
                test_started = False
                test_complete = False
                start_center = None
                centers = []
                smoothness_score = 0
                print("\nTest reset. Press 's' to start again.")
            elif key == ord('q'):
                break

            # Track movement during test
            if test_started and not test_complete and current_center:
                centers.append(current_center)
                # Draw path
                if len(centers) > 1:
                    for i in range(1, len(centers)):
                        cv2.line(frame, centers[i-1], centers[i], (0, 255, 255), 2)

            # Status display
            if not test_started:
                status = "Press 's' to start test"
            elif test_complete:
                status = "TEST COMPLETE - Press 'r' to retry"
            else:
                status = "Place cup down smoothly - Press 'p' when done"
            
            cv2.putText(frame, status, (10, 60),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 200), 2)

            # Draw start position if set
            if start_center:
                cv2.circle(frame, start_center, 5, (0, 0, 255), -1)
                cv2.putText(frame, "Start", (start_center[0]+10, start_center[1]),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

            cv2.imshow("Place Cup Down Test", frame)

    finally:
        hands.close()
        cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    main()