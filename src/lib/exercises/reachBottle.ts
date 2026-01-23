/**
 * Reach Bottle Exercise
 * Mirrors backend/exercises/reach_bottle.py ReachBottleMetrics
 */

export interface ReachBottleConfig {
  graspDistanceThreshold?: number; // pixels to consider hand "within grasp" of bottle
  movementThreshold?: number; // minimum movement (pixels) to detect start of movement
}

export interface ReachBottleState {
  startSignalTime: number | null;
  movementStartTime: number | null;
  reachTime: number | null;
  reactionTime: number | null;
  reachCompletionTime: number | null;
  movementStarted: boolean;
  reachAchieved: boolean;
  initialHandPos: { x: number; y: number } | null;
  lastHandPos: { x: number; y: number } | null;
  handPositions: Array<{ x: number; y: number }>;
  directionChanges: number;
  prevVector: { x: number; y: number } | null;
}

export interface ReachBottleResult {
  reactionTime: number | null;
  reachTime: number | null;
  trajectorySmoothness: number;
  status: 'waiting' | 'waiting for detections' | 'waiting for movement' | 'moving toward bottle' | 'reached bottle';
  passed: boolean;
}

export class ReachBottleMetrics {
  private config: Required<ReachBottleConfig>;
  private state: ReachBottleState;

  constructor(config: ReachBottleConfig = {}) {
    this.config = {
      graspDistanceThreshold: config.graspDistanceThreshold ?? 80,
      movementThreshold: config.movementThreshold ?? 5,
    };
    this.state = this.createInitialState();
  }

  private createInitialState(): ReachBottleState {
    return {
      startSignalTime: null,
      movementStartTime: null,
      reachTime: null,
      reactionTime: null,
      reachCompletionTime: null,
      movementStarted: false,
      reachAchieved: false,
      initialHandPos: null,
      lastHandPos: null,
      handPositions: [],
      directionChanges: 0,
      prevVector: null,
    };
  }

  reset(): void {
    this.state = this.createInitialState();
  }

  start(): void {
    this.reset();
    this.state.startSignalTime = Date.now() / 1000; // Convert to seconds
  }

  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  update(
    currentTime: number, // in seconds
    handPos: { x: number; y: number } | null,
    bottlePos: { x: number; y: number } | null
  ): ReachBottleResult {
    if (this.state.startSignalTime === null) {
      return {
        reactionTime: null,
        reachTime: null,
        trajectorySmoothness: 0,
        status: 'waiting',
        passed: false,
      };
    }

    if (handPos === null || bottlePos === null) {
      return {
        reactionTime: this.state.reactionTime,
        reachTime: this.state.reachTime,
        trajectorySmoothness: this.state.directionChanges,
        status: 'waiting for detections',
        passed: false,
      };
    }

    if (this.state.initialHandPos === null) {
      this.state.initialHandPos = { ...handPos };
    }

    // Detect movement start
    const distMoved = this.distance(this.state.initialHandPos, handPos);
    if (!this.state.movementStarted && distMoved > this.config.movementThreshold) {
      this.state.movementStarted = true;
      this.state.movementStartTime = currentTime;
      if (this.state.startSignalTime !== null) {
        this.state.reactionTime = this.state.movementStartTime - this.state.startSignalTime;
      }
    }

    // Check reach
    if (this.state.movementStarted && !this.state.reachAchieved) {
      const distToBottle = this.distance(handPos, bottlePos);
      if (distToBottle <= this.config.graspDistanceThreshold) {
        this.state.reachAchieved = true;
        const reachDuration = Math.max(0.001, currentTime - (this.state.movementStartTime || currentTime));
        this.state.reachTime = reachDuration;
        this.state.reachCompletionTime = currentTime;
      }
    }

    // Trajectory smoothness
    if (this.state.lastHandPos !== null) {
      const vec = {
        x: handPos.x - this.state.lastHandPos.x,
        y: handPos.y - this.state.lastHandPos.y,
      };
      const norm = Math.hypot(vec.x, vec.y);
      if (norm > 1e-6) {
        const vecNorm = { x: vec.x / norm, y: vec.y / norm };
        if (this.state.prevVector !== null) {
          const dot = Math.max(-1, Math.min(1, vecNorm.x * this.state.prevVector.x + vecNorm.y * this.state.prevVector.y));
          const angle = Math.acos(dot);
          if (angle > 0.785) { // ~45 degrees
            this.state.directionChanges += 1;
          }
        }
        this.state.prevVector = vecNorm;
      }
    }

    this.state.lastHandPos = { ...handPos };
    this.state.handPositions.push({ ...handPos });

    let status: ReachBottleResult['status'];
    if (!this.state.movementStarted) {
      status = 'waiting for movement';
    } else if (!this.state.reachAchieved) {
      status = 'moving toward bottle';
    } else {
      status = 'reached bottle';
    }

    return {
      reactionTime: this.state.reactionTime,
      reachTime: this.state.reachTime,
      trajectorySmoothness: this.state.directionChanges,
      status,
      passed: this.state.reachAchieved,
    };
  }

  // Drawing helpers
  drawOverlay(
    ctx: CanvasRenderingContext2D,
    handPos: { x: number; y: number } | null,
    bottlePos: { x: number; y: number } | null,
    result: ReachBottleResult
  ): void {
    if (handPos === null || bottlePos === null) return;

    // Draw line from hand to bottle
    ctx.beginPath();
    ctx.moveTo(handPos.x, handPos.y);
    ctx.lineTo(bottlePos.x, bottlePos.y);
    ctx.strokeStyle = result.passed ? '#00FF00' : '#FF0000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw hand position
    ctx.beginPath();
    ctx.arc(handPos.x, handPos.y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = result.passed ? '#00FF00' : '#FF6600';
    ctx.fill();

    // Draw bottle center
    ctx.beginPath();
    ctx.arc(bottlePos.x, bottlePos.y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#00FF00';
    ctx.fill();

    // Draw status text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px sans-serif';
    ctx.fillText(`Status: ${result.status}`, 10, 30);
    if (result.reactionTime !== null) {
      ctx.fillText(`Reaction: ${(result.reactionTime * 1000).toFixed(0)}ms`, 10, 50);
    }
    if (result.reachTime !== null) {
      ctx.fillText(`Reach: ${(result.reachTime * 1000).toFixed(0)}ms`, 10, 70);
    }
    ctx.fillText(`Smoothness: ${result.trajectorySmoothness}`, 10, 90);
  }
}
