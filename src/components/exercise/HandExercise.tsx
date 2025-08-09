import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTTS } from "@/components/tts/useTTS";

export type AttemptMetrics = {
  id: string;
  timestamp: number;
  romPercent: number; // 0-100
  avgSpeed: number; // normalized units/sec
  percentInRange: number; // 0-100
  successRate: number; // 0-100
  reps: number;
};

export type HandExerciseProps = {
  onAttemptComplete: (metrics: AttemptMetrics) => void;
};

const LOWER = 0.35;
const UPPER = 0.65;
const MIN_AMPLITUDE = 0.3; // minimum normalized amplitude for a rep to count as success

export const HandExercise: React.FC<HandExerciseProps> = ({ onAttemptComplete }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [landmarker, setLandmarker] = useState<HandLandmarker | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fps, setFps] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const lastYRef = useRef<number | null>(null);
  const framesRef = useRef(0);
  const inRangeFramesRef = useRef(0);
  const speedSumRef = useRef(0);
  const minYRef = useRef(1);
  const maxYRef = useRef(0);

  // Rep tracking
  const repStateRef = useRef<'idle' | 'goingUp' | 'goingDown'>('idle');
  const repMinYRef = useRef(1);
  const repMaxYRef = useRef(0);
  const repsRef = useRef(0);
  const successfulRepsRef = useRef(0);

  const { enabled: ttsEnabled, setEnabled: setTtsEnabled, speak, stop: stopSpeak } = useTTS(true);

  // Load mediapipe
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          // wasm files served via jsDelivr CDN
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm"
        );
        const lm = await HandLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          },
          numHands: 1,
          runningMode: "VIDEO",
        });
        if (!cancelled) setLandmarker(lm);
      } catch (e) {
        console.error("Failed to load MediaPipe HandLandmarker", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetAccumulators = useCallback(() => {
    framesRef.current = 0;
    inRangeFramesRef.current = 0;
    speedSumRef.current = 0;
    minYRef.current = 1;
    maxYRef.current = 0;
    lastTsRef.current = null;
    lastYRef.current = null;
    repStateRef.current = 'idle';
    repMinYRef.current = 1;
    repMaxYRef.current = 0;
    repsRef.current = 0;
    successfulRepsRef.current = 0;
  }, []);

  const start = useCallback(async () => {
    if (!landmarker) return;
    resetAccumulators();

    // get media
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play();

    // Resize canvas
    const canvas = canvasRef.current!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    setIsRunning(true);
    speak("Exercise started. Move your hand up and down. Stay within the highlighted range.");

    const ctx = canvas.getContext('2d')!;
    const drawer = new DrawingUtils(ctx as unknown as CanvasRenderingContext2D);

    let lastFpsTime = performance.now();
    let frameCount = 0;

    const loop = () => {
      if (!isRunning) return;
      const now = performance.now();

      const result = landmarker.detectForVideo(video, now);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw acceptable band
      ctx.save();
      const ring = getComputedStyle(canvas).getPropertyValue('--ring').trim() || '222.2 84% 4.9%';
      ctx.fillStyle = `hsl(${ring} / 0.12)`;
      const yLower = LOWER * canvas.height;
      const yUpper = UPPER * canvas.height;
      ctx.fillRect(0, yLower, canvas.width, yUpper - yLower);
      ctx.restore();

      let yNorm: number | null = null;

      if (result.landmarks && result.landmarks[0]) {
        const lm = result.landmarks[0];
        // wrist is index 0
        const wrist = lm[0];
        yNorm = wrist.y; // already normalized 0..1

        // draw landmarks
        const primaryHsl = getComputedStyle(canvas).getPropertyValue('--primary').trim() || '222.2 47.4% 11.2%';
        const sidebarPrimaryHsl = getComputedStyle(canvas).getPropertyValue('--sidebar-primary').trim() || primaryHsl;
        drawer.drawLandmarks(lm, { color: `hsl(${sidebarPrimaryHsl})`, lineWidth: 2, radius: 3 });
        drawer.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, { color: `hsl(${primaryHsl})`, lineWidth: 2 });
      }

      if (yNorm != null) {
        framesRef.current += 1;
        const inRange = yNorm >= LOWER && yNorm <= UPPER;
        if (inRange) inRangeFramesRef.current += 1;

        // Global min/max
        minYRef.current = Math.min(minYRef.current, yNorm);
        maxYRef.current = Math.max(maxYRef.current, yNorm);

        // Speed
        const lastTs = lastTsRef.current;
        const lastY = lastYRef.current;
        if (lastTs != null && lastY != null) {
          const dt = (now - lastTs) / 1000; // seconds
          if (dt > 0) {
            const v = Math.abs((yNorm - lastY) / dt);
            speedSumRef.current += v;
          }
        }
        lastTsRef.current = now;
        lastYRef.current = yNorm;

        // Rep FSM
        if (repStateRef.current === 'idle') {
          if (yNorm < LOWER) {
            repStateRef.current = 'goingUp';
            repMinYRef.current = yNorm;
            repMaxYRef.current = yNorm;
          }
        } else if (repStateRef.current === 'goingUp') {
          repMinYRef.current = Math.min(repMinYRef.current, yNorm);
          repMaxYRef.current = Math.max(repMaxYRef.current, yNorm);
          if (yNorm > UPPER) {
            repStateRef.current = 'goingDown';
          }
        } else if (repStateRef.current === 'goingDown') {
          repMinYRef.current = Math.min(repMinYRef.current, yNorm);
          repMaxYRef.current = Math.max(repMaxYRef.current, yNorm);
          if (yNorm < LOWER) {
            // complete a rep
            repsRef.current += 1;
            const amp = repMaxYRef.current - repMinYRef.current;
            if (amp >= MIN_AMPLITUDE) {
              successfulRepsRef.current += 1;
            }
            speak(String(repsRef.current));
            // start next cycle
            repStateRef.current = 'goingUp';
            repMinYRef.current = yNorm;
            repMaxYRef.current = yNorm;
          }
        }
      }

      // FPS
      frameCount++;
      if (now - lastFpsTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsTime = now;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [landmarker, speak, isRunning, resetAccumulators]);

  const stop = useCallback(() => {
    setIsRunning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const video = videoRef.current!;
    const stream = video.srcObject as MediaStream | null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;

    const frames = Math.max(framesRef.current, 1);
    const romPercent = Math.max(0, Math.min(1, maxYRef.current - minYRef.current)) * 100;
    const avgSpeed = speedSumRef.current / Math.max(frames - 1, 1);
    const percentInRange = (inRangeFramesRef.current / frames) * 100;
    const reps = repsRef.current;
    const successRate = reps > 0 ? (successfulRepsRef.current / reps) * 100 : 0;

    const metrics = {
      id: String(Date.now()),
      timestamp: Date.now(),
      romPercent: Number(romPercent.toFixed(1)),
      avgSpeed: Number(avgSpeed.toFixed(2)),
      percentInRange: Number(percentInRange.toFixed(1)),
      successRate: Number(successRate.toFixed(1)),
      reps,
    } satisfies AttemptMetrics;

    onAttemptComplete(metrics);
    speak("Exercise stopped. Metrics recorded.");
  }, [onAttemptComplete, speak]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const video = videoRef.current;
      if (video?.srcObject) (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      stopSpeak();
    };
  }, [stopSpeak]);

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Hand Range-of-Motion Exercise</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">{loading ? 'Loading hand tracker…' : landmarker ? `Ready • ${fps} FPS` : 'Initializing…'}</div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={ttsEnabled}
                  onChange={(e) => setTtsEnabled(e.target.checked)}
                />
                <span className="text-sm">Voice guidance</span>
              </label>
              {!isRunning ? (
                <Button size="lg" onClick={start} disabled={!landmarker || loading}>
                  Start
                </Button>
              ) : (
                <Button size="lg" variant="secondary" onClick={stop}>
                  Stop & Save
                </Button>
              )}
            </div>
          </div>

          <div className="relative w-full rounded-md overflow-hidden border">
            <video ref={videoRef} className="w-full h-auto" playsInline muted />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
          </div>

          <div className="text-sm text-muted-foreground">
            Tip: Keep your wrist moving smoothly up and down. Aim to stay inside the highlighted band.
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
