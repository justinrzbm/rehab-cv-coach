import React, { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  
  const handleRestart = () => {
    stopGame();
    gameRef.current = {
      ...gameRef.current,
      score: 0,
      star: createStar(),
      bullets: [],
      playerX: CANVAS_WIDTH / 2,
      lastShot: Date.now(),
      isGameRunning: true,
    };
    setScore(0);
    window.location.reload(); 
  };
  
  const handleBack = () => {
    stopGame();
    navigate("/exercises");
  };

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
    <main className="game-root" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '0.25',
      backgroundColor: '#f5f5f5', // Light gray background for contrast
      position: 'relative', // Added for absolute positioning of buttons
    }}>
      <h1 style={{ fontSize: '1.5rem', color: '#333' }}>⭐ Star Shooter</h1>
      <p style={{ fontSize: '1.5rem', color: '#666', maxWidth: '800px', textAlign: 'center' }}>
        Use your hand to control the green circle and shoot the yellow stars!
      </p>
      <video ref={videoRef} style={{ display: "none",transform: "scaleX(-1)" }} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: "4px solid #333", transform: "scaleX(-1)" }} />
      {/* CHANGED: Moved and styled buttons for top-left position */}
      <div style={{ position: 'absolute', top: '2rem', left: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <button 
          onClick={handleBack} 
          style={{ padding: '0.5rem 1rem', fontSize: '1rem', backgroundColor: '#F44336', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '8px' }}
        >
          Back
        </button>
        <button 
          onClick={handleRestart} 
          style={{ padding: '0.5rem 1rem', fontSize: '1rem', backgroundColor: '#2196F3', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '8px' }}
        >
          Restart
        </button>
        <button 
          onClick={stopGame} 
          style={{ padding: '0.5rem 1rem', fontSize: '1rem', backgroundColor: '#FF9800', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '8px' }}
        >
          Stop Game
        </button>
      </div>
      <span style={{ marginTop: '2rem', fontSize: '2.5rem', fontWeight: 'bold', color: '#333' }}>
        Score: {score}
      </span>
    </main>
  );
};

export default StarShooter;
