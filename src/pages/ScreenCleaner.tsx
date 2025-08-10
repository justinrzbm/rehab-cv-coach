import React, { useRef, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Dumbbell } from "lucide-react";
import { Hands, HAND_CONNECTIONS } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 550;
const WAX_CLOTH_WIDTH = 90;
const WAX_CLOTH_HEIGHT = 90;
const WAXING_THRESHOLD = 80; // Sensitivity for the pinch gesture.

// Type definition for a scuff mark
type ScuffMark = {
  id: string;
  x: number;
  y: number;
  radius: number;
  health: number; // How many "wipes" it needs
  cleaned: boolean;
};

// Function to create a new scuff mark on the floor
function createScuffMark(): ScuffMark {
  const floorPadding = 50;
  return {
    id: Math.random().toString(36).substr(2, 9),
    x: Math.random() * (CANVAS_WIDTH - floorPadding * 2) + floorPadding,
    y: Math.random() * (CANVAS_HEIGHT - floorPadding * 2) + floorPadding,
    radius: Math.random() * 20 + 15,
    health: 5, // Requires 5 wipes to clean
    cleaned: false,
  };
}

const ScreenCleaner: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const scoreRef = useRef(0);
  const scuffsRef = useRef<ScuffMark[]>(Array.from({ length: 15 }, createScuffMark));
  const [displayedScore, setDisplayedScore] = useState(0);
  const [isClean, setIsClean] = useState(false);
  const [showGoodJob, setShowGoodJob] = useState(false);
  // To prevent wiping a spot too fast, we add a small cooldown
  const lastWipeTimeRef = useRef(0);

  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);

  const startNewGame = useCallback(() => {
    scoreRef.current = 0;
    setDisplayedScore(0);
    scuffsRef.current = Array.from({ length: 15 }, createScuffMark);
    setIsClean(false);
    setShowGoodJob(false);
  }, []);

  const updateScore = useCallback(() => {
    const newScore = scuffsRef.current.filter(s => s.cleaned).length * 10;
    scoreRef.current = newScore;
    setDisplayedScore(newScore);
    if (scuffsRef.current.every(s => s.cleaned)) {
      setIsClean(true);
      setShowGoodJob(true);
      
      // After 5 seconds, start a new game
      setTimeout(() => {
        startNewGame();
      }, 5000);
    }
  }, [startNewGame]);

  const handleRestart = () => {
    scoreRef.current = 0;
    setDisplayedScore(0);
    scuffsRef.current = Array.from({ length: 15 }, createScuffMark);
    setIsClean(false);
    setShowGoodJob(false);
    window.location.reload();
  };

  const handleBack = useCallback(() => {
    // Ensure complete cleanup before navigation
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    if (handsRef.current) {
      handsRef.current.close();
      handsRef.current = null;
    }
    
    // Small delay to ensure cleanup completes
    setTimeout(() => {
      navigate("/exercises");
    }, 100);
  }, [navigate]);

  useEffect(() => {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    const ctx = canvasElement?.getContext("2d");

    if (!videoElement || !canvasElement || !ctx) {
      return;
    }

    handsRef.current = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    handsRef.current.setOptions({
      maxNumHands: 1,
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.4,
    });

    handsRef.current.onResults((results) => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.drawImage(results.image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // --- Game Scene Drawing ---
      // 1. Draw the wooden floor background
      ctx.fillStyle = "#A0522D"; // Sienna color for wood
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      // Draw wood grain for texture
      ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
      ctx.lineWidth = 2;
      for (let i = 0; i < CANVAS_WIDTH; i += 20) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, CANVAS_HEIGHT);
          ctx.stroke();
      }

      // 2. Draw the scuff marks
      scuffsRef.current.forEach(scuff => {
        if (!scuff.cleaned) {
          ctx.beginPath();
          ctx.arc(scuff.x, scuff.y, scuff.radius, 0, 2 * Math.PI);
          // Opacity depends on health
          ctx.fillStyle = `rgba(0, 0, 0, ${scuff.health * 0.2})`;
          ctx.fill();
        }
      });

      // --- Hand Tracking and Game Logic ---
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0 && !isClean) {
        const landmarks = results.multiHandLandmarks[0];
        
        // --- Gesture Detection ("Italian gesture") ---
        const FINGER_TIPS = [4, 8, 12, 16, 20];
        const fingerTipsCoords = FINGER_TIPS.map(tipIndex => ({
            x: landmarks[tipIndex].x * CANVAS_WIDTH,
            y: landmarks[tipIndex].y * CANVAS_HEIGHT
        }));

        const handPos = fingerTipsCoords.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
        handPos.x /= fingerTipsCoords.length;
        handPos.y /= fingerTipsCoords.length;

        let maxDist = 0;
        for (let i = 0; i < fingerTipsCoords.length; i++) {
            for (let j = i + 1; j < fingerTipsCoords.length; j++) {
                const dist = Math.hypot(fingerTipsCoords[i].x - fingerTipsCoords[j].x, fingerTipsCoords[i].y - fingerTipsCoords[j].y);
                if (dist > maxDist) maxDist = dist;
            }
        }
        const isWaxing = maxDist < WAXING_THRESHOLD;

        // --- Waxing Logic ---
        if (isWaxing) {
          const now = Date.now();
          // Add a cooldown to prevent cleaning too fast
          if (now - lastWipeTimeRef.current > 100) {
            scuffsRef.current.forEach(scuff => {
              if (!scuff.cleaned) {
                const dist = Math.hypot(scuff.x - handPos.x, scuff.y - handPos.y);
                if (dist < scuff.radius + WAX_CLOTH_WIDTH / 4) {
                  scuff.health -= 1;
                  lastWipeTimeRef.current = now;
                  if (scuff.health <= 0) {
                    scuff.cleaned = true;
                    updateScore();
                  }
                }
              }
            });
          }

          // Draw the waxing cloth
          ctx.beginPath();
          ctx.arc(handPos.x, handPos.y, WAX_CLOTH_WIDTH / 2, 0, 2 * Math.PI);
          ctx.fillStyle = "rgba(255, 255, 240, 0.8)"; // Ivory cloth color
          ctx.fill();
          ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Draw the hand skeleton overlay
        ctx.save();
        ctx.globalAlpha = 0.6;
        const handColor = isWaxing ? '#4CAF50' : '#FFFFFF';
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: handColor, lineWidth: 3 });
        drawLandmarks(ctx, landmarks, { color: handColor, lineWidth: 2, radius: 5 });
        ctx.restore();
      }

      // Display "Good job!" message for 5 seconds, then "All Clean!" message
      if (isClean) {
          ctx.setTransform(-1, 0, 0, 1, CANVAS_WIDTH, 0);
          ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.font = "bold 80px 'Brush Script MT', cursive";
          ctx.fillStyle = "#FFD700"; // Gold
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("Good job!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
          ctx.font = "30px Arial, sans-serif";
          ctx.fillStyle = "white";
          ctx.fillText("Goodjob, Daniel-san. Starting new game in 5...", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
      }

      // Score display is now handled in the UI, not canvas
    });

    cameraRef.current = new Camera(videoElement, {
      onFrame: async () => {
        if (handsRef.current) {
          await handsRef.current.send({ image: videoElement });
        }
      },
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    });
    cameraRef.current.start();

    return () => {
      cameraRef.current?.stop();
      handsRef.current?.close();
    };
  }, [updateScore, isClean, showGoodJob]);

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: "hsl(var(--accent-exercises) / 0.06)" }}
    >
      <AppHeader
        mode="page"
        title="Screen Cleaner"
        centerIcon={<Dumbbell />}
        onBack={handleBack}
        accentVar="--accent-exercises"
      />
      
      {/* Title and score */}
      <header className="w-full flex items-center justify-center px-8 py-4">
        <div className="absolute right-8 text-xl font-bold text-gray-800 bg-white px-4 py-2 rounded-lg shadow">
          Score: {displayedScore}
        </div>
      </header>

      <section className="flex flex-col items-center justify-center gap-6 w-full">
        <div className="rounded-xl overflow-hidden bg-card aspect-video flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="rounded-lg shadow-lg border border-gray-300"
            style={{ transform: "scaleX(-1)" }}
          />
          <video
            ref={videoRef}
            style={{ display: "none", transform: "scaleX(-1)" }}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            playsInline
          />
        </div>
      </section>
      <footer className="mt-8 text-sm text-gray-500 text-center">
        Powered by Mediapipe Hands
      </footer>
    </main>
  );
};

export default ScreenCleaner;