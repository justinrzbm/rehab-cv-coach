import React, { useRef, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Dumbbell } from "lucide-react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

// Canvas dimensions
const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;

// Column type for type safety
type Column = {
  x: number;
  width: number;
  gapY: number;
  gapHeight: number;
  scored: boolean;
};

// Helper function to create a new column
const createColumn = (): Column => {
  const gapHeight = 140;
  const gapY = Math.random() * (CANVAS_HEIGHT - gapHeight - 40) + 20;
  return {
    x: CANVAS_WIDTH,
    width: 60,
    gapY,
    gapHeight,
    scored: false,
  };
};

const FlappyBall: React.FC = () => {
  const navigate = useNavigate();
  
  // Use useRef for DOM elements and game state that should not trigger re-renders
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  
  const columnsRef = useRef<Column[]>([createColumn()]);
  const gameOverRef = useRef(false);
  const scoreRef = useRef(0);
  const ballYRef = useRef(CANVAS_HEIGHT / 2);

  // Use useState only for UI elements that need to trigger re-renders
  const [displayScore, setDisplayScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  // Remove restart button for unified UI

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
      console.error("Video or Canvas elements not found.");
      return;
    }

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    handsRef.current = hands;

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.4,
    });

    hands.onResults((results) => {
      if (gameOverRef.current) return;

      // Clear the canvas and draw the video frame
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.drawImage(results.image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Update ball position from hand landmarks
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const indexTip = results.multiHandLandmarks[0][8];
        ballYRef.current = indexTip.y * CANVAS_HEIGHT;
      }

      // Update and draw columns
      let newColumns = columnsRef.current.map((col) => ({
        ...col,
        x: col.x - 3, // Move columns to the left
      }));

      // Add a new column if the last one is far enough
      if (newColumns.length === 0 || newColumns[newColumns.length - 1].x < CANVAS_WIDTH - 220) {
        newColumns.push(createColumn());
      }
      
      // Remove columns that are off-screen
      newColumns = newColumns.filter((col) => col.x + col.width > 0);
      columnsRef.current = newColumns;
      
      // Draw the columns and check for scoring
      newColumns.forEach((col) => {
        ctx.fillStyle = "#4caf50";
        ctx.strokeStyle = "#2e7d32";
        ctx.lineWidth = 3;

        // Top pipe
        ctx.fillRect(col.x, 0, col.width, col.gapY);
        ctx.strokeRect(col.x, 0, col.width, col.gapY);
        
        // Bottom pipe
        ctx.fillRect(col.x, col.gapY + col.gapHeight, col.width, CANVAS_HEIGHT - (col.gapY + col.gapHeight));
        ctx.strokeRect(col.x, col.gapY + col.gapHeight, col.width, CANVAS_HEIGHT - (col.gapY + col.gapHeight));

        // Check for scoring
        if (!col.scored && col.x + col.width < 80 - 18) {
          col.scored = true; // Mark as scored
          scoreRef.current += 1;
          setDisplayScore(scoreRef.current);
        }
      });

      // Collision detection
      let collision = false;
      for (const col of newColumns) {
        if (80 + 18 > col.x && 80 - 18 < col.x + col.width) {
          if (ballYRef.current - 18 < col.gapY || ballYRef.current + 18 > col.gapY + col.gapHeight) {
            collision = true;
            break;
          }
        }
      }

      if (collision) {
        gameOverRef.current = true;
        setGameOver(true);
      }
      
      // Draw the ball
      ctx.beginPath();
      ctx.arc(80, ballYRef.current, 18, 0, 2 * Math.PI);
      ctx.fillStyle = "#f44336";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw the score text
      ctx.font = "32px Inter, sans-serif";
      ctx.fillStyle = "#333";
      ctx.fillText(`Score: ${scoreRef.current}`, 20, 40);
    });

    const camera = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    });
    cameraRef.current = camera;
    camera.start();

    // Cleanup function for useEffect
    return () => {
      camera.stop();
      hands.close();
    };
  }, []); // Empty dependency array ensures this effect runs only once

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-gray-800 p-4 font-sans">
      <AppHeader
        mode="page"
        title="Flappy Ball"
        centerIcon={<Dumbbell />}
        onBack={handleBack}
        accentVar="--accent-exercises"
      />
      <div className="w-full flex flex-col items-center mt-2">
        <div className="text-2xl font-bold text-orange-600 mb-2">Score: {displayScore}</div>
        <div className="relative">
          <video ref={videoRef} className="hidden" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="rounded-lg shadow-inner border-4 border-gray-400"
          />
          {gameOver && (
            <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center rounded-lg">
              <p className="text-5xl md:text-7xl font-extrabold text-red-500 mb-4 animate-bounce">GAME OVER</p>
              <p className="text-3xl font-semibold mb-6 text-white">Final Score: {displayScore}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default FlappyBall;