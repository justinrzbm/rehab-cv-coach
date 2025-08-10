import React, { useRef, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Dumbbell } from "lucide-react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

// Increased canvas size for a bigger playing area
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 550;

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

// Slower speeds for easier tracking
const STAR_SPEED = 1.5;
const BULLET_SPEED = 6;
// CHANGED: Halved the interval to double the bullet rate
const SHOOT_INTERVAL_MS = 750;

function createStar(): Star {
  return {
    x: Math.random() * (CANVAS_WIDTH - 80) + 40,
    y: 60,
    size: 40, // Much larger star
  };
}

const StarShooter: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef({
    score: 0,
    star: createStar(),
    bullets: [] as Bullet[],
    playerX: CANVAS_WIDTH / 2,
    lastShot: Date.now(),
    animationFrameId: 0,
    hands: null as Hands | null,
    camera: null as Camera | null,
    isGameRunning: true,
  });

  const [score, setScore] = useState(0);

  const stopGame = () => {
    cancelAnimationFrame(gameRef.current.animationFrameId);
    gameRef.current.camera?.stop();
    gameRef.current.hands?.close();
    gameRef.current.isGameRunning = false;
  };
  const handleBack = useCallback(() => {
  
        // Ensure complete cleanup before navigation
    if (gameRef.current.camera) {
      gameRef.current.camera.stop();
      gameRef.current.camera = null;
    }
    if (gameRef.current.hands) {
      gameRef.current.hands.close();
      gameRef.current.hands = null;
    }
        
      // Small delay to ensure cleanup completes
    setTimeout(() => {
      navigate("/exercises");
    }, 100);
  }, [navigate]);
  
  // const handleRestart = () => {
  //   stopGame();
  //   gameRef.current = {
  //     ...gameRef.current,
  //     score: 0,
  //     star: createStar(),
  //     bullets: [],
  //     playerX: CANVAS_WIDTH / 2,
  //     lastShot: Date.now(),
  //     isGameRunning: true,
  //   };
  //   setScore(0);
  //   window.location.reload(); 
  // };

  // const handleBack = () => {
  //   stopGame();
  //   navigate("/exercises");
  // };

  useEffect(() => {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    const ctx = canvasElement?.getContext("2d");

    if (!videoElement || !canvasElement || !ctx) return;
    
    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.4,
    });
    
    gameRef.current.hands = hands;

    hands.onResults((results) => {
      if (
        results.multiHandLandmarks &&
        results.multiHandLandmarks.length > 0
      ) {
        const indexTip = results.multiHandLandmarks[0][8];
        gameRef.current.playerX = indexTip.x * CANVAS_WIDTH;
      }
    });

    const animate = () => {
      if (!gameRef.current.isGameRunning) return;

      const game = gameRef.current;
      
      // Clear canvas with a solid, high-contrast color
      ctx.fillStyle = "#222"; 
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      // Draw video feed as a background
      ctx.drawImage(videoElement, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // --- Game Logic ---
      
      // Move star
      game.star.y += STAR_SPEED;
      if (game.star.y > CANVAS_HEIGHT) {
        game.score -= 5;
        game.star = createStar();
        setScore(game.score);
      }

      // Move and draw bullets
      game.bullets = game.bullets
        .map((b) => ({ ...b, y: b.y - BULLET_SPEED }))
        .filter((b) => b.y > 0);

      // Collision detection
      game.bullets.forEach((b) => {
        const dist = Math.hypot(b.x - game.star.x, b.y - game.star.y);
        if (dist < game.star.size + b.radius) {
          game.score += 10;
          game.star = createStar();
          game.bullets = game.bullets.filter((bullet) => bullet !== b);
          setScore(game.score);
        }
      });
      
      // Shooting logic
      if (Date.now() - game.lastShot > SHOOT_INTERVAL_MS) {
        game.bullets.push({
          x: game.playerX,
          y: CANVAS_HEIGHT - 60,
          radius: 15, // Larger bullet radius
        });
        game.lastShot = Date.now();
      }

      // --- Drawing Logic ---
      
      // Draw star with bold contrast
      ctx.beginPath();
      ctx.arc(game.star.x, game.star.y, game.star.size, 0, 2 * Math.PI);
      ctx.fillStyle = "#FFC107"; // Brighter, more visible color
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 5;
      ctx.stroke();

      // Draw player with bold contrast
      ctx.beginPath();
      ctx.arc(game.playerX, CANVAS_HEIGHT - 60, 30, 0, 2 * Math.PI); // Larger player icon
      ctx.fillStyle = "#4CAF50"; // Accessible green
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 5;
      ctx.stroke();
      
      // Draw bullets
      game.bullets.forEach((b) => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, 2 * Math.PI);
        ctx.fillStyle = "#2196F3"; // Accessible blue
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 4;
        ctx.stroke();
      });

      // Draw score with a larger, more legible font
      ctx.font = "48px Arial"; 
      ctx.fillStyle = "#fff";
      ctx.fillText(`Score: ${game.score}`, 40, 60);

      gameRef.current.animationFrameId = requestAnimationFrame(animate);
    };

    const camera = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    });
    
    gameRef.current.camera = camera;
    camera.start();
    
    animate();

    return () => {
      stopGame();
    };
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-gray-800 p-4 font-sans">
      <AppHeader
        mode="page"
        title="Star Shooter"
        centerIcon={<Dumbbell />}
        onBack={handleBack}
        accentVar="--accent-exercises"
      />
      <div className="w-full flex flex-col items-center mt-2">
        <div className="text-2xl font-bold text-orange-600 mb-2">Score: {score}</div>
        <div className="relative">
          <video ref={videoRef} style={{ display: "none" }} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: "4px solid #333" }} />
        </div>
      </div>
    </main>
  );
};

export default StarShooter;
