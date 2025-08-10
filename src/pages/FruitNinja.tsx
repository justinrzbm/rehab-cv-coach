import React, { useRef, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Dumbbell } from "lucide-react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 550;

type Fruit = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  sliced: boolean;
};

function createFruit(): Fruit {
  return {
    id: Math.random().toString(36).substr(2, 9),
    x: Math.random() * (CANVAS_WIDTH - 80) + 40,
    y: CANVAS_HEIGHT - 40,
    vx: (Math.random() - 0.5) * 4,
    vy: -Math.random() * 6 - 4,
    radius: 30,
    sliced: false,
  };
}

const FruitNinja: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const scoreRef = useRef(0);
  const fruitsRef = useRef<Fruit[]>([createFruit()]);
  const [displayedScore, setDisplayedScore] = useState(0);

  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);

  const updateScore = useCallback(() => {
    setDisplayedScore(scoreRef.current);
  }, []);

  const handleRestart = () => {
    scoreRef.current = 0;
    setDisplayedScore(0);
    fruitsRef.current = [createFruit()];
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

      const fruits = fruitsRef.current;

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const indexTip = results.multiHandLandmarks[0][8];
        const handX = indexTip.x * CANVAS_WIDTH;
        const handY = indexTip.y * CANVAS_HEIGHT;

        ctx.beginPath();
        ctx.arc(handX, handY, 15, 0, 2 * Math.PI);
        ctx.fillStyle = "#00ff00";
        ctx.fill();

        for (const fruit of fruits) {
          if (!fruit.sliced) {
            const dist = Math.hypot(fruit.x - handX, fruit.y - handY);
            if (dist < fruit.radius + 20) {
              fruit.sliced = true;
              scoreRef.current += 10;
              updateScore();
            }
          }
        }
      }

      const nextFruits: Fruit[] = [];
      for (const fruit of fruits) {
        if (!fruit.sliced) {
          fruit.x += fruit.vx;
          fruit.y += fruit.vy;
          fruit.vy += 0.2;

          ctx.beginPath();
          ctx.arc(fruit.x, fruit.y, fruit.radius, 0, 2 * Math.PI);
          ctx.fillStyle = "#ff9800";
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 3;
          ctx.stroke();

          if (fruit.y < CANVAS_HEIGHT + 40) {
            nextFruits.push(fruit);
          }
        }
      }

      if (Math.random() < 0.02) {
        nextFruits.push(createFruit());
      }
      fruitsRef.current = nextFruits;

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
  }, [updateScore]);

  // ...existing code...
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: "hsl(var(--accent-exercises) / 0.06)" }}
    >
      <AppHeader
        mode="page"
        title="Fruit Ninja"
        centerIcon={<Dumbbell />}
        onBack={handleBack}
        accentVar="--accent-exercises"
      />
      {/* <div style={{ position: "fixed", top: 80, left: 24, zIndex: 10 }}>
        <button
          onClick={handleRestart}
          className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow"
        >
          Restart
        </button>
      </div> */}

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
            style={{ transform: "scaleX(-1)" }} // <-- Add this line
          />
          <video
            ref={videoRef}
            style={{ display: "none", transform: "scaleX(-1)" }} // <-- Add this line
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

export default FruitNinja;