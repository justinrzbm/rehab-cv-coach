/**
 * Place Cup Down Exercise
 * Mirrors backend/exercises/place_cup_down_test.py logic
 */

export interface PlaceCupDownConfig {
  bottomThreshold?: number; // fraction of frame height (0.7 = lower 30%)
  holdTime?: number; // seconds to hold in place
  smoothnessThreshold?: number; // max allowed jerkiness
  accuracyThresholdCm?: number; // max allowed final position error in cm
  assumedBottleHeightCm?: number; // for px-to-cm conversion
}

export interface PlaceCupDownState {
  startCenter: { x: number; y: number } | null;
  centers: Array<{ x: number; y: number }>;
  placeDownStartTime: number | null;
  cmPerPx: number | null;
}

export interface PlaceCupDownResult {
  isDown: boolean;
  holdElapsed: number;
  smoothnessScore: number;
  accuracyCm: number;
  passed: boolean;
}

export class PlaceCupDownMetrics {
  private config: Required<PlaceCupDownConfig>;
  private state: PlaceCupDownState;

  constructor(config: PlaceCupDownConfig = {}) {
    this.config = {
      bottomThreshold: config.bottomThreshold ?? 0.7,
      holdTime: config.holdTime ?? 1.5,
      smoothnessThreshold: config.smoothnessThreshold ?? 20.0,
      accuracyThresholdCm: config.accuracyThresholdCm ?? 10.0,
      assumedBottleHeightCm: config.assumedBottleHeightCm ?? 24.0,
    };
    this.state = this.createInitialState();
  }

  private createInitialState(): PlaceCupDownState {
    return {
      startCenter: null,
      centers: [],
      placeDownStartTime: null,
      cmPerPx: null,
    };
  }

  reset(): void {
    this.state = this.createInitialState();
  }

  start(bottleCenter: { x: number; y: number }, bottleHeightPx: number): void {
    this.reset();
    this.state.startCenter = { ...bottleCenter };
    if (bottleHeightPx > 0) {
      this.state.cmPerPx = this.config.assumedBottleHeightCm / bottleHeightPx;
    }
  }

  private euclid(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  update(
    currentTime: number, // in seconds
    bottleCenter: { x: number; y: number } | null,
    bottleBottomY: number,
    canvasHeight: number
  ): PlaceCupDownResult {
    if (bottleCenter === null) {
      return {
        isDown: false,
        holdElapsed: 0,
        smoothnessScore: 0,
        accuracyCm: 0,
        passed: false,
      };
    }

    // Check if bottle is in lower portion of frame
    const thresholdY = canvasHeight * this.config.bottomThreshold;
    const isDown = bottleBottomY >= thresholdY;

    // Track centers during movement
    if (this.state.startCenter !== null) {
      this.state.centers.push({ ...bottleCenter });
    }

    let holdElapsed = 0;
    let smoothnessScore = 0;
    let accuracyCm = 0;
    let passed = false;

    if (isDown) {
      if (this.state.placeDownStartTime === null) {
        this.state.placeDownStartTime = currentTime;
      }
      holdElapsed = currentTime - this.state.placeDownStartTime;

      // Calculate smoothness if we have enough points
      if (this.state.centers.length >= 3) {
        const jerkValues: number[] = [];
        for (let i = 2; i < this.state.centers.length; i++) {
          const c0 = this.state.centers[i - 2];
          const c1 = this.state.centers[i - 1];
          const c2 = this.state.centers[i];
          const ax = c2.x - 2 * c1.x + c0.x;
          const ay = c2.y - 2 * c1.y + c0.y;
          jerkValues.push(Math.hypot(ax, ay));
        }
        // Use median for robustness
        const sorted = [...jerkValues].sort((a, b) => a - b);
        smoothnessScore = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
      }

      // Calculate accuracy if we have start position
      if (this.state.startCenter !== null && this.state.cmPerPx !== null) {
        const distPx = this.euclid(bottleCenter, this.state.startCenter);
        accuracyCm = distPx * this.state.cmPerPx;
      }

      // Pass if held long enough, smooth enough, and accurate enough
      passed =
        holdElapsed >= this.config.holdTime &&
        smoothnessScore <= this.config.smoothnessThreshold &&
        accuracyCm <= this.config.accuracyThresholdCm;
    } else {
      this.state.placeDownStartTime = null;
    }

    return {
      isDown,
      holdElapsed,
      smoothnessScore,
      accuracyCm,
      passed,
    };
  }

  // Drawing helpers
  drawOverlay(
    ctx: CanvasRenderingContext2D,
    bottleCenter: { x: number; y: number } | null,
    bottleBottomY: number,
    canvasHeight: number,
    result: PlaceCupDownResult
  ): void {
    // Draw target zone (lower portion of frame)
    const thresholdY = canvasHeight * this.config.bottomThreshold;
    ctx.strokeStyle = result.isDown ? '#00FF00' : '#FF6600';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, thresholdY);
    ctx.lineTo(ctx.canvas.width, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw start position if set
    if (this.state.startCenter !== null) {
      ctx.beginPath();
      ctx.arc(this.state.startCenter.x, this.state.startCenter.y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = '#0000FF';
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '12px sans-serif';
      ctx.fillText('START', this.state.startCenter.x + 10, this.state.startCenter.y - 10);
    }

    // Draw current position
    if (bottleCenter !== null) {
      ctx.beginPath();
      ctx.arc(bottleCenter.x, bottleCenter.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = result.isDown ? '#00FF00' : '#FF6600';
      ctx.fill();
    }

    // Draw path if we have centers
    if (this.state.centers.length > 1) {
      for (let i = 1; i < this.state.centers.length; i++) {
        const intensity = Math.floor(255 * (i / this.state.centers.length));
        ctx.strokeStyle = `rgb(0, ${intensity}, ${255 - intensity})`;
        ctx.lineWidth = Math.max(1, Math.floor(3 * (i / this.state.centers.length)));
        ctx.beginPath();
        ctx.moveTo(this.state.centers[i - 1].x, this.state.centers[i - 1].y);
        ctx.lineTo(this.state.centers[i].x, this.state.centers[i].y);
        ctx.stroke();
      }
    }

    // Draw status text
    ctx.fillStyle = result.isDown ? '#00FF00' : '#FF6600';
    ctx.font = '14px sans-serif';
    ctx.fillText(result.isDown ? 'Cup in place!' : 'Lower the cup to the table area', 10, 30);
    if (result.isDown) {
      ctx.fillText(`Hold: ${result.holdElapsed.toFixed(1)}s / ${this.config.holdTime.toFixed(1)}s`, 10, 50);
      ctx.fillText(`Smoothness: ${result.smoothnessScore.toFixed(1)}`, 10, 70);
      if (this.state.cmPerPx !== null) {
        ctx.fillText(`Accuracy: ${result.accuracyCm.toFixed(1)}cm`, 10, 90);
      }
    }
  }
}
