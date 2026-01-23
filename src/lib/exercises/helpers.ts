/**
 * Helper functions for extracting data from MediaPipe results
 */

import type { Results as HandResults } from '@mediapipe/hands';
import type { Results as PoseResults } from '@mediapipe/pose';
import type { Results as FaceMeshResults } from '@mediapipe/face_mesh';

export interface BottleDetection {
  x: number;
  y: number;
  w: number;
  h: number;
  center: { x: number; y: number };
}

export function getIndexFingerTip(
  handLandmarks: HandResults['multiHandLandmarks'] | undefined,
  width: number,
  height: number
): { x: number; y: number } | null {
  if (!handLandmarks || handLandmarks.length === 0) return null;
  const tip = handLandmarks[0][8]; // INDEX_FINGER_TIP
  return { x: tip.x * width, y: tip.y * height };
}

export function getWrist(
  handLandmarks: HandResults['multiHandLandmarks'] | undefined,
  width: number,
  height: number
): { x: number; y: number } | null {
  if (!handLandmarks || handLandmarks.length === 0) return null;
  const wrist = handLandmarks[0][0]; // WRIST
  return { x: wrist.x * width, y: wrist.y * height };
}

export function getFingertips(
  handLandmarks: HandResults['multiHandLandmarks'] | undefined,
  width: number,
  height: number
): Array<{ x: number; y: number }> {
  if (!handLandmarks || handLandmarks.length === 0) return [];
  const landmarks = handLandmarks[0];
  // Fingertip indices: thumb=4, index=8, middle=12, ring=16, pinky=20
  const fingertipIndices = [4, 8, 12, 16, 20];
  return fingertipIndices.map((i) => ({
    x: landmarks[i].x * width,
    y: landmarks[i].y * height,
  }));
}

export function getMouthCenter(
  faceLandmarks: FaceMeshResults['multiFaceLandmarks'] | undefined,
  width: number,
  height: number
): { x: number; y: number } | null {
  if (!faceLandmarks || faceLandmarks.length === 0) return null;
  const landmarks = faceLandmarks[0].landmark;
  if (!landmarks || landmarks.length < 15) return null;
  // Indices 13 (upper lip) and 14 (lower lip)
  const upper = landmarks[13];
  const lower = landmarks[14];
  return {
    x: ((upper.x + lower.x) / 2) * width,
    y: ((upper.y + lower.y) / 2) * height,
  };
}

export function getEarDistance(
  poseLandmarks: PoseResults['poseLandmarks'] | undefined,
  width: number,
  height: number
): number | null {
  if (!poseLandmarks || !poseLandmarks.landmark) return null;
  const leftEar = poseLandmarks.landmark[7]; // LEFT_EAR
  const rightEar = poseLandmarks.landmark[8]; // RIGHT_EAR
  if (!leftEar || !rightEar || leftEar.visibility < 0.5 || rightEar.visibility < 0.5) return null;
  return Math.hypot(
    (rightEar.x - leftEar.x) * width,
    (rightEar.y - leftEar.y) * height
  );
}

export function getHandLandmarksDict(
  handLandmarks: HandResults['multiHandLandmarks'] | undefined,
  width: number,
  height: number
): Record<number, { x: number; y: number }> | null {
  if (!handLandmarks || handLandmarks.length === 0) return null;
  const landmarks = handLandmarks[0];
  const dict: Record<number, { x: number; y: number }> = {};
  for (let i = 0; i < landmarks.length; i++) {
    dict[i] = { x: landmarks[i].x * width, y: landmarks[i].y * height };
  }
  return dict;
}
