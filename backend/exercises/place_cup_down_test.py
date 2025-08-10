import cv2
import time
import numpy as np
from collections import deque
from ultralytics import YOLO
import mediapipe as mp
import math

# ---------- CONFIG ----------
MODEL_PATH   = "../yolov10b.pt"
CONF         = 0.50  # Lower confidence for better detection
IMG_SIZE     = 640   # Standard YOLO input size for better performance
DEVICE       = "mps"
CAM_INDEX    = 0
FRAME_W      = 1280
FRAME_H      = 720
FLIP_VIEW    = True
TARGET_CLASS = "bottle"
FPS_SMOOTH_N = 20

# Test-specific constants
ASSUMED_BOTTLE_HEIGHT_CM = 24.0  # for px-to-cm conversion
ACCURACY_THRESHOLD_CM = 10.0      # maximum allowed final position error
SMOOTHNESS_THRESHOLD = 20.0       # maximum allowed jerkiness (lower is stricter)
MIN_MOVEMENT_DISTANCE = 50        # minimum pixels to move for valid test

def detect_on_frame(model, frame_bgr, conf, imgsz, device, class_filter=None):
    res = model.predict(source=frame_bgr, imgsz=imgsz, conf=conf, device=device, verbose=False, classes=class_filter)[0]
    out = []
    if res.boxes is None:
        return out
    h, w = frame_bgr.shape[:2]
    for b in res.boxes:
        cls_id = int(b.cls[0])
        score = float(b.conf[0])
        x1, y1, x2, y2 = map(int, b.xyxy[0].cpu().numpy())
        # Clamp coordinates to frame bounds
        x1 = max(0, min(w-1, x1))
        y1 = max(0, min(h-1, y1))
        x2 = max(0, min(w-1, x2))  
        y2 = max(0, min(h-1, y2))
        # Ensure valid box
        if x2 > x1 and y2 > y1:
            out.append((x1, y1, x2, y2, cls_id, score))
    return out

def euclid(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])

def down():
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
    
    if not cap.isOpened():
        raise RuntimeError("Cannot open webcam")

    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands(static_image_mode=False, max_num_hands=2)

    # Test state
    test_started = False
    test_complete = False
    start_center = None
    centers = []
    cm_per_px = None
    smoothness_score = 0
    last_detection_time = time.time()
    detection_timeout = 2.0  # seconds to wait for bottle detection
    
    win = "Place Cup Down Test"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    
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
            
            # Detect bottle - find best bottle detection
            detections = detect_on_frame(model, frame, CONF, IMG_SIZE, DEVICE, class_filter)
            current_center = None
            best_bottle = None
            best_score = 0
            
            for (x1, y1, x2, y2, cls_id, score) in detections:
                name = names.get(cls_id, str(cls_id))
                if name.lower() == 'bottle':
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    cv2.putText(frame, f"{name} {score:.2f}", (x1, y1-10),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                    
                    if score > best_score:
                        best_score = score
                        best_bottle = (x1, y1, x2, y2)
                        current_center = ((x1 + x2)//2, (y1 + y2)//2)
            
            # Update detection time if bottle found
            if current_center:
                last_detection_time = time.time()
                # Calculate cm/px scale if needed
                if cm_per_px is None and best_bottle:
                    x1, y1, x2, y2 = best_bottle
                    bottle_height_px = y2 - y1
                    if bottle_height_px > 0:
                        cm_per_px = ASSUMED_BOTTLE_HEIGHT_CM / float(bottle_height_px)
            else:
                # Check if we've lost the bottle for too long
                if test_started and (time.time() - last_detection_time) > detection_timeout:
                    print("⚠️  Bottle lost! Keep bottle in view. Press 'r' to restart.")
                    cv2.putText(frame, "BOTTLE LOST - Keep in view!", (10, 120),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

            # Test logic
            key = cv2.waitKey(1) & 0xFF
            if key == ord('s') and not test_started and not test_complete:
                if current_center and cm_per_px is not None:
                    test_started = True
                    start_center = current_center
                    centers = [start_center]
                    print("\nTest started! Place the cup down smoothly.")
                else:
                    print("No bottle detected! Keep bottle in view and try again.")
            elif key == ord('p') and test_started and not test_complete:
                # Complete test and calculate metrics
                if len(centers) > 5 and cm_per_px is not None:  # Need more points for accurate measurement
                    # Check if bottle actually moved significantly
                    total_distance = 0
                    for i in range(1, len(centers)):
                        total_distance += euclid(centers[i-1], centers[i])
                    
                    if total_distance < MIN_MOVEMENT_DISTANCE:
                        print("⚠️  Not enough movement detected! Move the bottle more during the test.")
                        continue
                    
                    # Calculate placement smoothness using moving average for stability
                    jerk_values = []
                    for i in range(2, len(centers)):
                        x0, y0 = centers[i-2]
                        x1, y1 = centers[i-1]
                        x2, y2 = centers[i]
                        ax = (x2 - 2*x1 + x0)
                        ay = (y2 - 2*y1 + y0)
                        jerk_values.append(math.hypot(ax, ay))
                    
                    # Use median instead of mean for more robust smoothness measurement
                    smoothness_score = np.median(jerk_values) if jerk_values else 0.0
                    
                    # Calculate final position accuracy
                    final_center = centers[-1]
                    dist_px = euclid(final_center, start_center)
                    dist_cm = dist_px * cm_per_px
                    
                    # Print results
                    print("\n===== PLACE CUP DOWN METRICS =====")
                    print(f"Total movement: {total_distance:.1f} pixels")
                    print(f"Data points collected: {len(centers)}")
                    print(f"Placement Smoothness: {smoothness_score:.3f} (lower is better, threshold: {SMOOTHNESS_THRESHOLD})")
                    print(f"Final Position Accuracy: {dist_cm:.2f} cm (threshold ≤ {ACCURACY_THRESHOLD_CM} cm)")
                    print("--------------------------------")
                    
                    # Check pass/fail criteria
                    smoothness_passed = smoothness_score <= SMOOTHNESS_THRESHOLD
                    accuracy_passed = dist_cm <= ACCURACY_THRESHOLD_CM
                    passed = smoothness_passed and accuracy_passed
                    
                    print(f"Smoothness: {'✅ PASSED' if smoothness_passed else '❌ FAILED'}")
                    print(f"Accuracy: {'✅ PASSED' if accuracy_passed else '❌ FAILED'}")
                    print(f"Overall: {'✅ PASSED' if passed else '❌ FAILED'}")
                    print("--------------------------------")
                    
                    test_complete = True
                    # Clean up and return
                    hands.close()
                    cap.release()
                    cv2.destroyAllWindows()
                    return 1 if passed else 0
                else:
                    needed_points = 5 - len(centers) if len(centers) < 5 else 0
                    print(f"⚠️  Need more data points! Move the bottle more. (Need {needed_points} more points)")
                    if cm_per_px is None:
                        print("⚠️  Bottle size not calibrated! Ensure bottle is clearly visible.")
            elif key == ord('r'):
                test_started = False
                test_complete = False
                start_center = None
                centers = []
                smoothness_score = 0
                cm_per_px = None
                last_detection_time = time.time()
                print("\nTest reset. Press 's' to start again.")
            elif key == ord('q'):
                break

            # Track movement during test with smoothing
            if test_started and not test_complete and current_center:
                centers.append(current_center)
                # Draw path with gradient colors (older = darker)
                if len(centers) > 1:
                    for i in range(1, len(centers)):
                        # Color gradient from yellow to red
                        intensity = int(255 * (i / len(centers)))
                        color = (0, intensity, 255 - intensity)
                        thickness = max(1, int(3 * (i / len(centers))))
                        cv2.line(frame, centers[i-1], centers[i], color, thickness)

            # Status display
            if not test_started and not test_complete:
                status = "Press 's' to start test"
                color = (0, 200, 200)
            elif test_complete:
                status = "TEST COMPLETE - Press 'r' to retry or 'q' to quit"
                color = (0, 255, 0) if smoothness_score <= SMOOTHNESS_THRESHOLD else (0, 0, 255)
            else:
                status = "Place cup down smoothly - Press 'p' when done"
                color = (255, 200, 0)
            
            cv2.putText(frame, status, (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            
            # Show current metrics during test
            if test_started and len(centers) > 1 and cm_per_px is not None:
                current_dist_px = euclid(centers[-1], start_center)
                current_dist_cm = current_dist_px * cm_per_px
                cv2.putText(frame, f"Distance from start: {current_dist_cm:.1f} cm", 
                           (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 255), 2)
                cv2.putText(frame, f"Points collected: {len(centers)}", 
                           (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 255), 2)
                
                # Show bottle detection confidence
                if current_center and best_score > 0:
                    cv2.putText(frame, f"Bottle confidence: {best_score:.2f}", 
                               (10, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 255, 200), 2)

            # Draw start position if set
            if start_center:
                cv2.circle(frame, start_center, 8, (0, 0, 255), -1)
                cv2.putText(frame, "START", (start_center[0]+10, start_center[1]-10),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            
            # Draw current position
            if current_center:
                cv2.circle(frame, current_center, 5, (255, 0, 0), -1)

            # Controls help
            cv2.putText(frame, "Controls: S=start, P=finish test, R=reset, Q=quit", 
                       (10, h-20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

            cv2.imshow(win, frame)

    finally:
        hands.close()
        cap.release()
        cv2.destroyAllWindows()
    
    # Return 0 if user quit without completing test
    return 0