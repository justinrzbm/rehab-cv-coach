/**
 * Dump into Mouth Exercise
 * Mirrors backend/exercises/dump_into_mouth_test.py logic
 */

export interface DumpIntoMouthConfig {
  minTiltAngle?: number; // minimum tilt angle in degrees
  maxJerks?: number; // maximum allowed jerks
  jerkAngleThreshDeg?: number; // sudden angle change threshold
  jerkAccelThresh?: number; // sudden movement threshold
  holdTime?: number; // seconds to hold tilt
}

export interface DumpIntoMouthState {
  angles: number[];
  centers: Array<{ x: number; y: number }>;
  jerksCount: number;
  tiltStartTime: number | null;
}

export interface DumpIntoMouthResult {
  tiltAngle: number | null;
  isTilted: boolean;
  totalTilt: number;
  jerksCount: number;
  holdElapsed: number;
  passed: boolean;
}

export class DumpIntoMouthMetrics {
  private config: Required<DumpIntoMouthConfig>;
  private state: DumpIntoMouthState;

  constructor(config: DumpIntoMouthConfig = {}) {
    this.config = {
      minTiltAngle: config.minTiltAngle ?? 50.0,
      maxJerks: config.maxJerks ?? 5,
      jerkAngleThreshDeg: config.jerkAngleThreshDeg ?? 10.0,
      jerkAccelThresh: config.jerkAccelThresh ?? 100.0,
      holdTime: config.holdTime ?? 1.5,
    };
    this.state = this.createInitialState();
  }

  private createInitialState(): DumpIntoMouthState {
    return {
      angles: [],
      centers: [],
      jerksCount: 0,
      tiltStartTime: null,
    };
  }

  reset(): void {
    this.state = this.createInitialState();
  }

  private calculateHandTiltAngle(
    wrist: { x: number; y: number },
    indexTip: { x: number; y: number }
  ): number {
    const dx = indexTip.x - wrist.x;
    const dy = -(indexTip.y - wrist.y); // Flip Y since canvas Y is inverted
    return Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  }

  update(
    currentTime: number, // in seconds
    wrist: { x: number; y: number } | null,
    indexTip: { x: number; y: number } | null
  ): DumpIntoMouthResult {
    if (wrist === null || indexTip === null) {
      return {
        tiltAngle: null,
        isTilted: false,
        totalTilt: 0,
        jerksCount: this.state.jerksCount,
        holdElapsed: 0,
        passed: false,
      };
    }

    const tiltAngle = this.calculateHandTiltAngle(wrist, indexTip);
    // Check if hand is tilted (angle < 30 degrees from horizontal = tilted for pouring)
    const isTilted = tiltAngle < 30 || tiltAngle > 150;

    // Track angles and centers for jerk detection
    this.state.angles.push(tiltAngle);
    this.state.centers.push({ x: indexTip.x, y: indexTip.y });

    // Check for jerks
    if (this.state.angles.length >= 3) {
      // Angle jerk detection
      const d1 = this.state.angles[this.state.angles.length - 1] - this.state.angles[this.state.angles.length - 2];
      const d2 = this.state.angles[this.state.angles.length - 2] - this.state.angles[this.state.angles.length - 3];
      if (Math.abs(d1 - d2) >= this.config.jerkAngleThreshDeg) {
        this.state.jerksCount += 1;
      }

      // Position jerk detection
      const c0 = this.state.centers[this.state.centers.length - 3];
      const c1 = this.state.centers[this.state.centers.length - 2];
      const c2 = this.state.centers[this.state.centers.length - 1];
      const ax = c2.x - 2 * c1.x + c0.x;
      const ay = c2.y - 2 * c1.y + c0.y;
      if (Math.hypot(ax, ay) >= this.config.jerkAccelThresh) {
        this.state.jerksCount += 1;
      }
    }

    let holdElapsed = 0;
    let passed = false;

    if (isTilted) {
      if (this.state.tiltStartTime === null) {
        this.state.tiltStartTime = currentTime;
      }
      holdElapsed = currentTime - this.state.tiltStartTime;
      passed = holdElapsed >= this.config.holdTime && this.state.jerksCount <= this.config.maxJerks;
    } else {
      this.state.tiltStartTime = null;
    }

    const totalTilt =
      this.state.angles.length > 0
        ? Math.max(...this.state.angles) - Math.min(...this.state.angles)
        : 0;

    return {
      tiltAngle,
      isTilted,
      totalTilt,
      jerksCount: this.state.jerksCount,
      holdElapsed,
      passed,
    };
  }

  // Drawing helpers
  drawOverlay(
    ctx: CanvasRenderingContext2D,
    wrist: { x: number; y: number } | null,
    indexTip: { x: number; y: number } | null,
    result: DumpIntoMouthResult
  ): void {
    if (wrist === null || indexTip === null) return;

    // Draw wrist and index tip
    ctx.beginPath();
    ctx.arc(wrist.x, wrist.y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(indexTip.x, indexTip.y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Draw line from wrist to index
    ctx.beginPath();
    ctx.moveTo(wrist.x, wrist.y);
    ctx.lineTo(indexTip.x, indexTip.y);
    ctx.strokeStyle = result.isTilted ? '#00FF00' : '#FF6600';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw status text
    ctx.fillStyle = result.isTilted ? '#00FF00' : '#FF6600';
    ctx.font = '14px sans-serif';
    if (result.tiltAngle !== null) {
      ctx.fillText(
        `Tilt angle: ${Math.round(result.tiltAngle)}° ${result.isTilted ? '(tilted!)' : '(tilt more)'}`,
        10,
        30
      );
    }
    if (result.isTilted) {
      ctx.fillText(`Hold tilt: ${result.holdElapsed.toFixed(1)}s / ${this.config.holdTime.toFixed(1)}s`, 10, 50);
      ctx.fillText(`Jerks: ${result.jerksCount} / ${this.config.maxJerks}`, 10, 70);
    }
  }
}
