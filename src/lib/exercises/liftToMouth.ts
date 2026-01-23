/**
 * Lift to Mouth Exercise
 * Mirrors backend/exercises/lift_to_mouth_test.py process_frame logic
 */

export interface LiftToMouthConfig {
  mouthScale?: number; // distance threshold = mouth_scale * ear_distance
}

export interface LiftToMouthResult {
  bottlePos: { x: number; y: number } | null;
  reached: boolean;
  distance: number | null;
  threshold: number | null;
}

export class LiftToMouthMetrics {
  private config: Required<LiftToMouthConfig>;

  constructor(config: LiftToMouthConfig = {}) {
    this.config = {
      mouthScale: config.mouthScale ?? 0.80,
    };
  }

  private euclid(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  update(
    bottleCenter: { x: number; y: number } | null,
    mouthCenter: { x: number; y: number } | null,
    earDist: number | null
  ): LiftToMouthResult {
    if (bottleCenter === null || mouthCenter === null || earDist === null) {
      return {
        bottlePos: bottleCenter,
        reached: false,
        distance: null,
        threshold: null,
      };
    }

    const threshold = this.config.mouthScale * earDist;
    const distance = this.euclid(bottleCenter, mouthCenter);
    const reached = distance <= threshold;

    return {
      bottlePos: bottleCenter,
      reached,
      distance,
      threshold,
    };
  }

  // Drawing helpers
  drawOverlay(
    ctx: CanvasRenderingContext2D,
    bottleCenter: { x: number; y: number } | null,
    mouthCenter: { x: number; y: number } | null,
    earDist: number | null,
    result: LiftToMouthResult
  ): void {
    if (mouthCenter === null || earDist === null) return;

    // Draw proximity circle around mouth
    const threshold = this.config.mouthScale * earDist;
    ctx.beginPath();
    ctx.arc(mouthCenter.x, mouthCenter.y, threshold, 0, 2 * Math.PI);
    ctx.strokeStyle = result.reached ? '#00FF00' : '#FF0000';
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
      ctx.fillStyle = result.reached ? '#00FF00' : '#FF6600';
      ctx.fill();

      // Draw line from bottle to mouth
      ctx.beginPath();
      ctx.moveTo(bottleCenter.x, bottleCenter.y);
      ctx.lineTo(mouthCenter.x, mouthCenter.y);
      ctx.strokeStyle = result.reached ? '#00FF00' : '#FF0000';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw status text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px sans-serif';
    ctx.fillText(result.reached ? 'Bottle at mouth!' : 'Lift bottle to mouth', 10, 30);
    if (result.distance !== null && result.threshold !== null) {
      ctx.fillText(`Distance: ${Math.round(result.distance)}px / ${Math.round(result.threshold)}px`, 10, 50);
    }
  }
}
