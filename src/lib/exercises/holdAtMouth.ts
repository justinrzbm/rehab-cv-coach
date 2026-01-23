/**
 * Hold at Mouth Exercise
 * Mirrors backend/exercises/hold_at_mouth_test.py logic
 */

export interface HoldAtMouthConfig {
  requiredSecs?: number; // seconds to hold at mouth
  mouthScale?: number; // distance threshold = mouth_scale * ear_distance
}

export interface HoldAtMouthState {
  startedAt: number | null;
}

export interface HoldAtMouthResult {
  holding: boolean;
  elapsed: number;
  remaining: number;
  passed: boolean;
}

export class HoldAtMouthMetrics {
  private config: Required<HoldAtMouthConfig>;
  private state: HoldAtMouthState;

  constructor(config: HoldAtMouthConfig = {}) {
    this.config = {
      requiredSecs: config.requiredSecs ?? 5.0,
      mouthScale: config.mouthScale ?? 0.80,
    };
    this.state = {
      startedAt: null,
    };
  }

  reset(): void {
    this.state.startedAt = null;
  }

  update(
    currentTime: number, // in seconds
    bottleCenter: { x: number; y: number } | null,
    mouthCenter: { x: number; y: number } | null,
    earDist: number | null
  ): HoldAtMouthResult {
    if (bottleCenter === null || mouthCenter === null || earDist === null) {
      this.state.startedAt = null;
      return {
        holding: false,
        elapsed: 0,
        remaining: this.config.requiredSecs,
        passed: false,
      };
    }

    const threshold = this.config.mouthScale * earDist;
    const distance = Math.hypot(bottleCenter.x - mouthCenter.x, bottleCenter.y - mouthCenter.y);
    const near = distance <= threshold;

    if (near) {
      if (this.state.startedAt === null) {
        this.state.startedAt = currentTime;
      }
      const elapsed = currentTime - this.state.startedAt;
      const remaining = Math.max(0, this.config.requiredSecs - elapsed);
      const passed = elapsed >= this.config.requiredSecs;

      return {
        holding: true,
        elapsed,
        remaining,
        passed,
      };
    } else {
      this.state.startedAt = null;
      return {
        holding: false,
        elapsed: 0,
        remaining: this.config.requiredSecs,
        passed: false,
      };
    }
  }

  // Drawing helpers
  drawOverlay(
    ctx: CanvasRenderingContext2D,
    bottleCenter: { x: number; y: number } | null,
    mouthCenter: { x: number; y: number } | null,
    earDist: number | null,
    result: HoldAtMouthResult
  ): void {
    if (mouthCenter === null || earDist === null) return;

    const threshold = this.config.mouthScale * earDist;

    // Draw proximity circle
    ctx.beginPath();
    ctx.arc(mouthCenter.x, mouthCenter.y, threshold, 0, 2 * Math.PI);
    ctx.strokeStyle = result.holding ? '#00FF00' : '#FF0000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw mouth center
    ctx.beginPath();
    ctx.arc(mouthCenter.x, mouthCenter.y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#FFFF00';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw bottle center if available
    if (bottleCenter !== null) {
      ctx.beginPath();
      ctx.arc(bottleCenter.x, bottleCenter.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = result.holding ? '#00FF00' : '#FF6600';
      ctx.fill();
    }

    // Draw status text
    ctx.fillStyle = result.holding ? '#00FF00' : '#FF6600';
    ctx.font = '14px sans-serif';
    if (result.holding) {
      ctx.fillText(`Holding: ${result.elapsed.toFixed(1)}s / ${this.config.requiredSecs.toFixed(1)}s`, 10, 30);
      ctx.fillText(`Remaining: ${result.remaining.toFixed(1)}s`, 10, 50);
    } else {
      ctx.fillText('Keep bottle at mouth level', 10, 30);
    }
  }
}
