import React, { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;

type Star = {
  x: number;
  y: number;
  size: number;
};

type Bullet = {
  x: number;
  y: number;
  radius: number;
};

const STAR_SPEED = 2;
const BULLET_SPEED = 8;

function createStar(): Star {
  return {
    x: Math.random() * (CANVAS_WIDTH - 80) + 40,
    y: 60,
    size: 28,
  };
}

const StarShooter: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [score, setScore] = useState(0);
  const [star, setStar] = useState<Star>(createStar());
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [playerX, setPlayerX] = useState(CANVAS_WIDTH / 2);
  const [lastShot, setLastShot] = useState(Date.now());

  useEffect(() => {
    let camera: Camera | null = null;
    let hands: Hands | null = null;

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
      ctx.drawImage(results.image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Player position from hand
      let fingerX = playerX;
      if (
        results.multiHandLandmarks &&
        results.multiHandLandmarks.length > 0
      ) {
        const indexTip = results.multiHandLandmarks[0][8];
        fingerX = indexTip.x * CANVAS_WIDTH;
        setPlayerX(fingerX);

        ctx.beginPath();
        ctx.arc(fingerX, CANVAS_HEIGHT - 60, 20, 0, 2 * Math.PI);
        ctx.fillStyle = "#00ff00";
        ctx.fill();
      }

      // Move star
      setStar((prevStar) => {
        let newY = prevStar.y + STAR_SPEED;
        if (newY > CANVAS_HEIGHT) {
          // Missed star, respawn
          setScore((s) => s - 5);
          return createStar();
        }
        return { ...prevStar, y: newY };
      });

      // Draw star
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffd700";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Move bullets
      setBullets((prevBullets) => {
        let newBullets = prevBullets
          .map((b) => ({ ...b, y: b.y - BULLET_SPEED }))
          .filter((b) => b.y > 0);

        // Draw bullets
        newBullets.forEach((b) => {
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, 2 * Math.PI);
          ctx.fillStyle = "#00bfff";
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
        });

        // Collision detection
        newBullets.forEach((b) => {
          const dist = Math.hypot(b.x - star.x, b.y - star.y);
          if (dist < star.size + b.radius) {
            setScore((s) => s + 10);
            setStar(createStar());
            newBullets = newBullets.filter((bullet) => bullet !== b);
          }
        });

        return newBullets;
      });

      // Shooting logic (auto-fire every 1s)
      if (Date.now() - lastShot > 1000) {
        setBullets((prev) => [
          ...prev,
          { x: fingerX, y: CANVAS_HEIGHT - 60, radius: 10 },
        ]);
        setLastShot(Date.now());
      }

      // Draw player
      ctx.beginPath();
      ctx.arc(fingerX, CANVAS_HEIGHT - 60, 20, 0, 2 * Math.PI);
      ctx.fillStyle = "#32cd32";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.stroke();

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
    };
  }, [score, star, bullets, playerX, lastShot]);

  const handleRestart = () => {
    setScore(0);
    setStar(createStar());
    setBullets([]);
    setPlayerX(CANVAS_WIDTH / 2);
    setLastShot(Date.now());
  };

  return (
    <main className="game-root">
      <h1>⭐ Star Shooter</h1>
      <video ref={videoRef} style={{ display: "none" }} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: "2px solid #333" }} />
      <div style={{ marginTop: 16 }}>
        <button onClick={() => navigate("/")}>Back</button>
        <button onClick={handleRestart} style={{ marginLeft: 16 }}>Restart</button>
        <span style={{ marginLeft: 24, fontSize: 24 }}>Score: {score}</span>
      </div>
    </main>
  );
};

export default