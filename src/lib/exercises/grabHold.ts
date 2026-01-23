/**
 * Grab Hold Exercise
 * Mirrors backend/exercises/grab_hold.py GrabHoldMetrics and ReadyGraspHold
 */

export interface GrabHoldConfig {
  touchDistRatio?: number; // fraction of half bbox max-dim used to detect first touch
  gripRadiusRatio?: number; // fraction of half bbox width for full-grip radius
  fingersRequired?: number; // number of fingertips required inside grip radius
  gripConfirmS?: number; // continuous time with required fingers to confirm full grip
  initialHoldS?: number; // window after full grip to compute stability (seconds)
  stabilityThresholdPx?: number; // max std dev for stability
}

export interface GrabHoldState {
  startSignalTime: number | null;
  firstTouchTime: number | null;
  gripConfirmStartTime: number | null;
  fullGripTime: number | null;
  gripCompletionTime: number | null;
  touched: boolean;
  fullGripConfirming: boolean;
  fullGripAchieved: boolean;
  completed: boolean;
  holdSamplesPx: Array<{ x: number; y: number }>;
  holdStartTime: number | null;
}

export interface GrabHoldResult {
  status: string;
  gripCompletionTime: number | null;
  stabilityStdPx: number | null;
  holdElapsedS: number;
  done: boolean;
  passed: boolean;
}

export class GrabHoldMetrics {
  private config: Required<GrabHoldConfig>;
  private state: GrabHoldState;

  constructor(config: GrabHoldConfig = {}) {
    this.config = {
      touchDistRatio: config.touchDistRatio ?? 0.60,
      gripRadiusRatio: config.gripRadiusRatio ?? 0.65,
      fingersRequired: config.fingersRequired ?? 3,
      gripConfirmS: config.gripConfirmS ?? 0.10,
      initialHoldS: config.initialHoldS ?? 5.00,
      stabilityThresholdPx: config.stabilityThresholdPx ?? 10.0,
    };
    this.state = this.createInitialState();
  }

  private createInitialState(): GrabHoldState {
    return {
      startSignalTime: null,
      firstTouchTime: null,
      gripConfirmStartTime: null,
      fullGripTime: null,
      gripCompletionTime: null,
      touched: false,
      fullGripConfirming: false,
      fullGripAchieved: false,
      completed: false,
      holdSamplesPx: [],
      holdStartTime: null,
    };
  }

  reset(): void {
    this.state = this.createInitialState();
  }

  start(): void {
    this.reset();
    this.state.startSignalTime = Date.now() / 1000;
  }

  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  update(
    currentTime: number, // in seconds
    fingertipsPx: Array<{ x: number; y: number }>,
    bottleCenterPx: { x: number; y: number } | null,
    bottleWPx: number,
    bottleHPx: number
  ): GrabHoldResult {
    if (this.state.startSignalTime === null) {
      return {
        status: 'waiting to start',
        gripCompletionTime: null,
        stabilityStdPx: null,
        holdElapsedS: 0,
        done: false,
        passed: false,
      };
    }

    if (bottleCenterPx === null) {
      return {
        status: 'waiting for bottle',
        gripCompletionTime: null,
        stabilityStdPx: null,
        holdElapsedS: 0,
        done: false,
        passed: false,
      };
    }

    // Derived radii based on current bbox
    const halfMaxDim = Math.max(bottleWPx, bottleHPx) * 0.5;
    const gripRadiusPx = this.config.gripRadiusRatio * (bottleWPx * 0.5);
    const touchRadiusPx = this.config.touchDistRatio * halfMaxDim;

    // 1) First touch
    if (!this.state.touched && fingertipsPx.length > 0) {
      for (const tip of fingertipsPx) {
        if (this.distance(tip, bottleCenterPx) <= touchRadiusPx) {
          this.state.touched = true;
          this.state.firstTouchTime = currentTime;
          break;
        }
      }
    }

    // 2) Full grip confirmation (require N fingertips inside smaller radius for some time)
    if (this.state.touched && !this.state.fullGripAchieved) {
      let countInside = 0;
      for (const tip of fingertipsPx) {
        if (this.distance(tip, bottleCenterPx) <= gripRadiusPx) {
          countInside += 1;
        }
      }

      if (countInside >= this.config.fingersRequired) {
        if (!this.state.fullGripConfirming) {
          this.state.fullGripConfirming = true;
          this.state.gripConfirmStartTime = currentTime;
        } else if (
          this.state.gripConfirmStartTime !== null &&
          currentTime - this.state.gripConfirmStartTime >= this.config.gripConfirmS
        ) {
          this.state.fullGripAchieved = true;
          this.state.fullGripTime = currentTime;
          // Metric: grip completion
          if (this.state.firstTouchTime !== null) {
            this.state.gripCompletionTime = Math.max(0.0, this.state.fullGripTime - this.state.firstTouchTime);
          }
          // Start hold window
          this.state.holdStartTime = currentTime;
        }
      } else {
        // Lost confirmation continuity
        this.state.fullGripConfirming = false;
        this.state.gripConfirmStartTime = null;
      }
    }

    // 3) Collect bottle centers during hold window
    let stabilityStdPx: number | null = null;
    let elapsedHold = 0.0;
    if (this.state.fullGripAchieved) {
      elapsedHold = this.state.holdStartTime ? currentTime - this.state.holdStartTime : 0.0;
      if (!this.state.completed) {
        this.state.holdSamplesPx.push({ ...bottleCenterPx });
      }

      // Provisional stability (live) based on samples so far
      if (this.state.holdSamplesPx.length >= 2) {
        const xs = this.state.holdSamplesPx.map((p) => p.x);
        const ys = this.state.holdSamplesPx.map((p) => p.y);
        const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
        const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
        const dists = this.state.holdSamplesPx.map((p) => this.distance(p, { x: meanX, y: meanY }));
        const meanD = dists.reduce((a, b) => a + b, 0) / dists.length;
        const variance = dists.reduce((sum, d) => sum + Math.pow(d - meanD, 2), 0) / Math.max(1, dists.length - 1);
        stabilityStdPx = Math.sqrt(variance);
      } else {
        stabilityStdPx = 0.0;
      }

      // Finalize only when window reached
      if (!this.state.completed && elapsedHold >= this.config.initialHoldS) {
        this.state.completed = true;
      }
    }

    let status = 'waiting';
    if (!this.state.touched) {
      status = 'touch to begin';
    } else if (this.state.touched && !this.state.fullGripAchieved) {
      status = this.state.fullGripConfirming ? 'forming grip' : 'touched';
    } else if (this.state.fullGripAchieved && !this.state.completed) {
      status = 'holding';
    } else {
      status = 'done';
    }

    const passed =
      this.state.completed &&
      stabilityStdPx !== null &&
      stabilityStdPx <= this.config.stabilityThresholdPx;

    return {
      status,
      gripCompletionTime: this.state.gripCompletionTime,
      stabilityStdPx,
      holdElapsedS: this.state.fullGripAchieved ? elapsedHold : 0.0,
      done: this.state.completed,
      passed,
    };
  }

  // Drawing helpers
  drawOverlay(
    ctx: CanvasRenderingContext2D,
    fingertipsPx: Array<{ x: number; y: number }>,
    bottleCenterPx: { x: number; y: number } | null,
    bottleWPx: number,
    bottleHPx: number,
    result: GrabHoldResult
  ): void {
    if (bottleCenterPx === null) return;

    const halfMaxDim = Math.max(bottleWPx, bottleHPx) * 0.5;
    const gripRadiusPx = this.config.gripRadiusRatio * (bottleWPx * 0.5);
    const touchRadiusPx = this.config.touchDistRatio * halfMaxDim;

    // Draw touch radius
    ctx.beginPath();
    ctx.arc(bottleCenterPx.x, bottleCenterPx.y, touchRadiusPx, 0, 2 * Math.PI);
    ctx.strokeStyle = this.state.touched ? '#00FF00' : '#FF6600';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw grip radius
    ctx.beginPath();
    ctx.arc(bottleCenterPx.x, bottleCenterPx.y, gripRadiusPx, 0, 2 * Math.PI);
    ctx.strokeStyle = result.passed ? '#00FF00' : '#FFFF00';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw fingertips
    for (const tip of fingertipsPx) {
      const dist = this.distance(tip, bottleCenterPx);
      const inGrip = dist <= gripRadiusPx;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = inGrip ? '#00FF00' : '#FF6600';
      ctx.fill();
    }

    // Draw status text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px sans-serif';
    ctx.fillText(`Status: ${result.status}`, 10, 30);
    if (result.gripCompletionTime !== null) {
      ctx.fillText(`Grip time: ${(result.gripCompletionTime * 1000).toFixed(0)}ms`, 10, 50);
    }
    if (result.stabilityStdPx !== null) {
      ctx.fillText(`Stability: ${result.stabilityStdPx.toFixed(1)}px`, 10, 70);
    }
    ctx.fillText(`Hold: ${result.holdElapsedS.toFixed(1)}s / ${this.config.initialHoldS.toFixed(1)}s`, 10, 90);
  }
}
