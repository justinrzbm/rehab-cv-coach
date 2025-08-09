import React, { useEffect, useState } from "react";

interface CircularTimerProps {
  seconds: number;
  running: boolean;
  onComplete?: () => void;
}

export const CircularTimer: React.FC<CircularTimerProps> = ({ seconds, running, onComplete }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    setElapsed(0);
    const start = Date.now();
    const id = setInterval(() => {
      const diff = (Date.now() - start) / 1000;
      if (diff >= seconds) {
        setElapsed(seconds);
        clearInterval(id);
        onComplete?.();
      } else setElapsed(diff);
    }, 100);
    return () => clearInterval(id);
  }, [running, seconds, onComplete]);

  const pct = Math.min(100, (elapsed / seconds) * 100);
  const size = 96;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div className="fixed bottom-4 right-4 z-30">
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--muted-foreground))" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="hsl(var(--accent-progress))"
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
    </div>
  );
};
