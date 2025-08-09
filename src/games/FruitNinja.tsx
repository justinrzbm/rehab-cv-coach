import React, { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// You need to install @mediapipe/hands and @mediapipe/camera_utils
// npm install @mediapipe/hands @mediapipe/camera_utils

import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;

type Fruit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  sliced: boolean;
};

function createFruit(): Fruit {
  return {
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

  const [score, setScore] = useState(0);
  const [fruits, setFruits] = useState<Fruit[]>([createFruit()]);
  const [handPos, setHandPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let camera: Camera | null = null;
    let hands: Hands | null = null;
    let animationFrameId: number;

    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    const ctx = canvasElement?.getContext("2d");

    if (!videoElement || !canvasElement || !ctx) return;

    hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.4,
    });

    hands.onResults((results) => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw video
      ctx.drawImage(results.image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw fruits
      setFruits((prevFruits) => {
        const newFruits = prevFruits.map((fruit) => {
          if (!fruit.sliced) {
            fruit.x += fruit.vx;
            fruit.y += fruit.vy;
            fruit.vy += 0.2;
            // Draw fruit
            ctx.beginPath();
            ctx.arc(fruit.x, fruit.y, fruit.radius, 0, 2 * Math.PI);
            ctx.fillStyle = "#ff9800";
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          return fruit;
        }).filter(fruit => fruit.y < CANVAS_HEIGHT + 40 && !fruit.sliced);

        // Draw hand and check slicing
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          const indexTip = results.multiHandLandmarks[0][8];
          const handX = indexTip.x * CANVAS_WIDTH;
          const handY = indexTip.y * CANVAS_HEIGHT;
          setHandPos({ x: handX, y: handY });

          ctx.beginPath();
          ctx.arc(handX, handY, 15, 0, 2 * Math.PI);
          ctx.fillStyle = "#00ff00";
          ctx.fill();

          // Check for slicing
          newFruits.forEach((fruit) => {
            const dist = Math.hypot(fruit.x - handX, fruit.y - handY);
            if (dist < fruit.radius + 20 && !fruit.sliced) {
              fruit.sliced = true;
              setScore((s) => s + 10);
            }
          });
        }

        // Spawn new fruit occasionally
        if (Math.random() < 0.02) {
          newFruits.push(createFruit());
        }

        return newFruits;
      });

      // Draw score
      ctx.font = "32px Arial";
      ctx.fillStyle = "#fff";
      ctx.fillText(`Score: ${score}`, 20, 40);
    });

    camera = new Camera(videoElement, {
      onFrame: async () => {
        await hands!.send({ image: videoElement });
      },
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    });
    camera.start();

    return () => {
      camera?.stop();
      hands?.close();
      cancelAnimationFrame(animationFrameId);
    };
  }, [score]);

  return (
    <main className="game-root">
      <h1>🥷 Fruit Ninja</h1>
      <video ref={videoRef} style={{ display: "none" }} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: "2px solid #333" }} />
      <div style={{ marginTop: 16 }}>
        <button onClick={() => navigate("/")}>Back</button>
        <span style={{ marginLeft: 24, fontSize: 24 }}>Score: {score}</span>
      </div>
    </main>
  );
};

export default FruitNinja;