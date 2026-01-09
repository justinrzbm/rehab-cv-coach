import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BookOpen, CheckCircle2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CircularTimer } from "@/components/progress/CircularTimer";
import { useTTS } from "@/components/tts/useTTS";
import { useSEO } from "@/hooks/useSEO";
import { supabase } from "@/integrations/supabase/client";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

interface Task {
  name: string;
  instruction: string;
  duration?: number;
}

const congrats = ["Great job!", "Awesome!", "Well done!", "Fantastic!", "You did it! 🎉"];
const encouragement = ["Keep it up! 💪", "You're on fire! 🔥", "Nice and steady! 😊", "Great focus! 🌟"];

const ModuleRun: React.FC = () => {
  const { slug } = useParams();
  useSEO(`Module Run: ${slug}`, `Guided ${slug} module with camera and voice.`);
  const nav = useNavigate();
  const { speak } = useTTS(true);

  // Exact order requested
  const tasks: Task[] = useMemo(
    () =>
      slug === "feeding"
        ? [
            { name: "reach_bottle",   instruction: "Reach your hand toward the bottle." },
            { name: "grab_hold",      instruction: "Grasp the bottle and hold steady for a moment." },
            { name: "lift_to_mouth",  instruction: "Lift the bottle up toward your mouth." },
            { name: "hold_at_mouth",  instruction: "Hold at mouth level.", duration: 5 },
            { name: "dump_into_mouth",instruction: "Tilt the bottle as if pouring." },
            { name: "place_cup_down", instruction: "Place the cup back down smoothly." },
          ]
        : [],
    [slug]
  );

  const [idx, setIdx] = useState(0);
  const [showCongrats, setShowCongrats] = useState<string | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [moduleAttemptId, setModuleAttemptId] = useState<string | null>(null);
  const [failMenu, setFailMenu] = useState(false);

  // Used to force re-run of effects on Retry without changing idx
  const [attempt, setAttempt] = useState(0);

  // MediaPipe refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);

  // Start module attempt (if logged in)
  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      setStartTime(Date.now());
      if (user.user) {
        const { data, error } = await supabase
          .from("module_attempts")
          .insert({ user_id: user.user.id, module_name: slug!, module_is_completed: false, subtasks_total: 5 })
          .select("id")
          .maybeSingle();
        if (!error && data) setModuleAttemptId(data.id);
      }
    })();
  }, [slug]);

  // --- Success helpers -------------------------------------------------------
  const doSuccess = async (message: string) => {
    setFailMenu(false);
    setTimerRunning(false);
    speak(message);
    setShowCongrats(message);
    setTimeout(() => setShowCongrats(null), 1000);

    // Save task attempt (as pass)
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && moduleAttemptId) {
        const t = tasks[idx];
        await supabase.from("module_task_attempts").insert({
          module_attempt_id: moduleAttemptId,
          task_name: t.name,
          is_pass: true,
          duration_seconds: t.duration ?? 7,
          metrics: {},
        });
      }
    } catch {}

    if (idx + 1 < tasks.length) setIdx(idx + 1);
    else onCompleteModule(true);
  };

  const onSuccess = async () => {
    const msg = congrats[Math.floor(Math.random() * congrats.length)];
    await doSuccess(msg);
  };

  // Speak instruction + timers
  useEffect(() => {
    if (!tasks.length) return;
    const t = tasks[idx];
    speak(t.instruction);
    setTimerRunning(Boolean(t.duration));

    // If no duration timer, show fail menu after 25s
    let timerId: number | undefined;
    if (!t.duration) {
      timerId = window.setTimeout(() => setFailMenu(true), 25000);
    }

    return () => {
      if (timerId) window.clearTimeout(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, tasks, attempt]);

  const onTimerComplete = () => onSuccess();

  const onFailChoice = async (choice: "retry" | "skip" | "finish") => {
    setFailMenu(false);
    if (choice === "retry") {
      // Re-run the same step: re-POST /active-task and restart timers/speech
      setAttempt((a) => a + 1);
      return;
    }
    if (choice === "skip") {
      await saveTaskPass(false);
      if (idx + 1 < tasks.length) setIdx(idx + 1);
      else onCompleteModule(false);
      return;
    }
    if (choice === "finish") {
      await onCompleteModule(false, true);
      return;
    }
  };

  const saveTaskPass = async (pass: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const t = tasks[idx];
      if (user && moduleAttemptId) {
        await supabase.from("module_task_attempts").insert({
          module_attempt_id: moduleAttemptId,
          task_name: t.name,
          is_pass: pass,
          duration_seconds: t.duration ?? 20,
          metrics: {},
        });
      }
    } catch {}
  };

  const onCompleteModule = async (completed: boolean, goExercises?: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && moduleAttemptId && startTime) {
        const duration = (Date.now() - startTime) / 1000;
        await supabase
          .from("module_attempts")
          .update({ module_is_completed: completed, duration_seconds: duration, subtasks_total: 5 })
          .eq("id", moduleAttemptId);
      }
    } catch {}
    if (goExercises) nav("/games");
    else nav("/modules");
  };

  // Encouragement every 6s
  useEffect(() => {
    const id = window.setInterval(
      () => speak(encouragement[Math.floor(Math.random() * encouragement.length)]),
      6000
    );
    return () => window.clearInterval(id);
  }, [speak]);

  // MediaPipe setup
  useEffect(() => {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    const ctx = canvasElement?.getContext("2d");

    if (!videoElement || !canvasElement || !ctx) {
      return;
    }

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    handsRef.current = hands;

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results) => {
      ctx.save();
      ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      ctx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
      
      if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
          // Draw hand landmarks
          for (let i = 0; i < landmarks.length; i++) {
            const landmark = landmarks[i];
            ctx.beginPath();
            ctx.arc(landmark.x * canvasElement.width, landmark.y * canvasElement.height, 5, 0, 2 * Math.PI);
            ctx.fillStyle = "#00FF00";
            ctx.fill();
          }
          
          // Draw connections
          const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],
            [0, 5], [5, 6], [6, 7], [7, 8],
            [0, 9], [9, 10], [10, 11], [11, 12],
            [0, 13], [13, 14], [14, 15], [15, 16],
            [0, 17], [17, 18], [18, 19], [19, 20],
            [5, 9], [9, 13], [13, 17]
          ];
          
          ctx.strokeStyle = "#00FF00";
          ctx.lineWidth = 2;
          for (const [start, end] of connections) {
            const startLandmark = landmarks[start];
            const endLandmark = landmarks[end];
            ctx.beginPath();
            ctx.moveTo(startLandmark.x * canvasElement.width, startLandmark.y * canvasElement.height);
            ctx.lineTo(endLandmark.x * canvasElement.width, endLandmark.y * canvasElement.height);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    });

    const camera = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 640,
      height: 480,
    });
    cameraRef.current = camera;
    camera.start();

    return () => {
      camera.stop();
      hands.close();
    };
  }, []);

  const t = tasks[idx];

  return (
    <main className="min-h-screen relative" style={{ background: "hsl(var(--accent-modules) / 0.06)" }}>

      <AppHeader
        mode="page"
        title="Modules"
        centerIcon={<BookOpen />}
        onBack={() => nav(`/modules/${slug}/info`)}
        onHelp={() => {}}
        accentVar="--accent-modules"
      />

      <div className="absolute inset-0 -z-10 bg-black/40" />

      {/* Live camera area */}
      <div className="container mx-auto p-4">
        <div className="relative w-full h-[60vh] bg-black/70 rounded-2xl overflow-hidden flex items-center justify-center">
          <video ref={videoRef} className="hidden" />
          <canvas ref={canvasRef} width={640} height={480} className="max-w-full max-h-full object-contain" />
        </div>
      </div>

      {/* Instruction bubble */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-6 py-3 rounded-full text-lg font-semibold shadow">
        {t?.instruction}
      </div>

      {t?.duration ? <CircularTimer seconds={t.duration} running={timerRunning} onComplete={onTimerComplete} /> : null}

      {/* Failure menu */}
      {failMenu && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="bg-card rounded-xl p-6 w-[90%] max-w-md space-y-3">
            <div className="text-xl font-bold">Need a hand?</div>
            <div className="text-muted-foreground">Choose an option:</div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => onFailChoice("retry")}>Try Again</Button>
              <Button variant="secondary" onClick={() => onFailChoice("skip")}>I succeeded (skip)</Button>
              <Button onClick={() => onFailChoice("finish")}>Finish</Button>
            </div>
          </div>
        </div>
      )}

      {/* Congrats flash */}
      {showCongrats && (
        <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: "hsl(var(--accent-progress))" }}>
          <div className="text-white text-4xl font-extrabold flex items-center gap-3">
            <CheckCircle2 size={44} /> {showCongrats}
          </div>
        </div>
      )}
    </main>
  );
};

export default ModuleRun;
