import time
import math


class ReachBottleMetrics:
    def __init__(self, grasp_distance_threshold=80, movement_threshold=5):
        """
        grasp_distance_threshold: distance in pixels to consider hand "within grasp" of bottle
        movement_threshold: minimum movement (pixels) to detect start of movement
        """
        self.grasp_distance_threshold = grasp_distance_threshold
        self.movement_threshold = movement_threshold
        self.reset()

    def reset(self):
        self.start_signal_time = None
        self.movement_start_time = None
        self.reach_time = None
        self.reaction_time = None
        self.reach_completion_time = None

        self.movement_started = False
        self.reach_achieved = False

        self.initial_hand_pos = None
        self.last_hand_pos = None

        self.hand_positions = []  # List of (x,y) tuples
        self.direction_changes = 0
        self.prev_vector = None

    def update(self, current_time, hand_pos, bottle_pos):
        """
        Update metrics for the current frame.

        current_time: float, timestamp in seconds
        hand_pos: tuple (x,y) or None if hand not detected
        bottle_pos: tuple (x,y) or None if bottle not detected

        Returns dict with keys:
          - 'reaction_time': float or None
          - 'reach_time': float or None
          - 'trajectory_smoothness': int (direction changes count)
          - 'status': 'waiting' | 'waiting for detections' | 'waiting for movement' | 'moving toward bottle' | 'reached bottle'
        """
        if self.start_signal_time is None:
            return {'reaction_time': None, 'reach_time': None, 'trajectory_smoothness': 0, 'status': 'waiting'}

        if hand_pos is None or bottle_pos is None:
            return {'reaction_time': self.reaction_time, 'reach_time': self.reach_time,
                    'trajectory_smoothness': self.direction_changes,
                    'status': 'waiting for detections'}

        if self.initial_hand_pos is None:
            self.initial_hand_pos = hand_pos

        # Detect movement start
        dist_moved = math.dist(self.initial_hand_pos, hand_pos)
        if not self.movement_started and dist_moved > self.movement_threshold:
            self.movement_started = True
            self.movement_start_time = current_time
            self.reaction_time = self.movement_start_time - self.start_signal_time

        # Check reach
        if self.movement_started and not self.reach_achieved:
            dist_to_bottle = math.dist(hand_pos, bottle_pos)
            if dist_to_bottle <= self.grasp_distance_threshold:
                self.reach_achieved = True
                reach_duration = max(0.001, current_time - self.movement_start_time)
                self.reach_time = reach_duration
                self.reach_completion_time = current_time

        # Trajectory smoothness
        if self.last_hand_pos is not None:
            vec = (hand_pos[0] - self.last_hand_pos[0], hand_pos[1] - self.last_hand_pos[1])
            norm = math.hypot(vec[0], vec[1])
            if norm > 1e-6:
                vec_norm = (vec[0] / norm, vec[1] / norm)
                if self.prev_vector is not None:
                    dot = max(min(vec_norm[0] * self.prev_vector[0] + vec_norm[1] * self.prev_vector[1], 1.0), -1.0)
                    angle = math.acos(dot)
                    if angle > 0.785:  # ~45 degrees
                        self.direction_changes += 1
                self.prev_vector = vec_norm

        self.last_hand_pos = hand_pos
        self.hand_positions.append(hand_pos)

        if not self.movement_started:
            status = 'waiting for movement'
        elif not self.reach_achieved:
            status = 'moving toward bottle'
        else:
            status = 'reached bottle'

        return {
            'reaction_time': self.reaction_time,
            'reach_time': self.reach_time,
            'trajectory_smoothness': self.direction_changes,
            'status': status,
        }

    def start(self):
        self.reset()
        self.start_signal_time = time.time()


