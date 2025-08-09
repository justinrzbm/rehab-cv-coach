import React, { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;

type Column = {
  x: number;
  width: number;
  gapY: number;
  gapHeight: number;
};

function createColumn(): Column {
  const gapHeight = 140;
  const gapY = Math.random() * (CANVAS_HEIGHT - gapHeight - 40) + 20;
  return {
    x: CANVAS_WIDTH,
    width: 60,
    gapY,
    gapHeight,
  };
}

const FlappyBall: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [score, setScore] = useState(0);
  const [columns, setColumns] = useState<Column[]>([createColumn()]);
  const [ballY, setBallY] = useState(CANVAS_HEIGHT / 2);
  const [gameOver, setGameOver] = useState(false);

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

      // Ball position from hand
      let fingerY = ballY;
      if (
        results.multiHandLandmarks &&
        results.multiHandLandmarks.length > 0
      ) {
        const indexTip = results.multiHandLandmarks[0][8];
        fingerY = indexTip.y * CANVAS_HEIGHT;
        setBallY(fingerY);

        ctx.beginPath();
        ctx.arc(80, fingerY, 18, 0, 2 * Math.PI);
        ctx.fillStyle = "#00ff00";
        ctx.fill();
      }

      // Move columns
      setColumns((prevCols) => {
        let newCols = prevCols.map((col) => ({
          ...col,
          x: col.x - 3,
        }));

        // Remove off-screen columns and add new ones
        if (newCols.length === 0 || newCols[newCols.length - 1].x < CANVAS_WIDTH - 220) {
          newCols.push(createColumn());
        }
        newCols = newCols.filter((col) => col.x + col.width > 0);

        // Draw columns
        newCols.forEach((col) => {
          ctx.fillStyle = "#4caf50";
          // Top
          ctx.fillRect(col.x, 0, col.width, col.gapY);
          // Bottom
          ctx.fillRect(col.x, col.gapY + col.gapHeight, col.width, CANVAS_HEIGHT - (col.gapY + col.gapHeight));
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 3;
          ctx.strokeRect(col.x, 0, col.width, col.gapY);
          ctx.strokeRect(col.x, col.gapY + col.gapHeight, col.width, CANVAS_HEIGHT - (col.gapY + col.gapHeight));
        });

        // Collision detection
        let collision = false;
        newCols.forEach((col) => {
          if (
            col.x < 80 + 18 &&
            col.x + col.width > 80 - 18
          ) {
            if (
              fingerY - 18 < col.gapY ||
              fingerY + 18 > col.gapY + col.gapHeight
            ) {
              collision = true;
            }
          }
        });

        if (collision && !gameOver) {
          setGameOver(true);
        }

        // Score
        newCols.forEach((col) => {
          if (!gameOver && col.x + col.width < 80 - 18 && !("scored" in col)) {
            setScore((s) => s + 1);
            (col as any).scored = true;
          }
        });

        return newCols;
      });

      // Draw ball
      ctx.beginPath();
      ctx.arc(80, fingerY, 18, 0, 2 * Math.PI);
      ctx.fillStyle = "#ff5252";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw score
      ctx.font = "32px Arial";
      ctx.fillStyle = "#fff";
      ctx.fillText(`Score: ${score}`, 20, 40);

      // Game over
      if (gameOver) {
        ctx.font = "48px Arial";
        ctx.fillStyle = "#f44336";
        ctx.fillText("GAME OVER!", CANVAS_WIDTH / 2 - 140, CANVAS_HEIGHT / 2);
      }
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
  }, [score, ballY, gameOver]);

  const handleRestart = () => {
    setScore(0);
    setColumns([createColumn()]);
    setBallY(CANVAS_HEIGHT / 2);
    setGameOver(false);
  };

  return (
    <main className="game-root">
      <h1>🏐 Flappy Ball</h1>
      <video ref={videoRef} style={{ display: "none" }} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: "2px solid #333" }} />
      <div style={{ marginTop: 16 }}>
        <button onClick={() => navigate("/")}>Back</button>
        <button onClick={handleRestart} style={{ marginLeft: 16 }}>Restart</button>
        <span style={{ marginLeft: 24, fontSize: 24 }}>Score: {score}</span>
      </div>
    </main>
  );