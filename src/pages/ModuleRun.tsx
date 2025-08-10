import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BookOpen, CheckCircle2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CircularTimer } from "@/components/progress/CircularTimer";
import { useTTS } from "@/components/tts/useTTS";
import { useSEO } from "@/hooks/useSEO";
import { supabase } from "@/integrations/supabase/client";
import { connectLive } from "@/lib/live";

interface Task {
  name: string;
  instruction: string;
  duration?: number;
}

const congrats = ["Great job!", "Awesome!", "Well done!", "Fantastic!", "You did it! 🎉"];
const encouragement = ["Keep it up! 💪", "You're on fire! 🔥", "Nice and steady! 😊", "Great focus! 🌟"];

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:8000";

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

  const [live, setLive] = useState<any>(null);
  useEffect(() => connectLive(setLive), []);

  // Debug: log every WS packet so we can see what the backend is sending
  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line no-console
    console.debug("[WS]", live);
  }, [live]);

  // Guard so we don't run onSuccess multiple times for sticky frames
  const justAdvancedRef = useRef(false);
  const armAdvance = () => {
    justAdvancedRef.current = true;
    window.setTimeout(() => (justAdvancedRef.current = false), 800);
  };

  // Session config
  useEffect(() => {
    fetch(`${API_BASE}/session-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dominant: "right", target_mode: "fixed" }),
    }).catch(() => {});
  }, []);

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

  // Tell backend which task is active whenever idx OR attempt changes
  useEffect(() => {
    const t = tasks[idx];
    if (!t) return;
    fetch(`${API_BASE}/active-task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: t.name, seconds: t.duration ?? undefined }),
    }).catch(() => {});
  }, [idx, tasks, attempt]);

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

    // DEMO BEHAVIOR:
    // For steps 0 and 1 only (reach_bottle, grab_hold), after 25s force "Amazing!" success and advance.
    let timerId: number;
    if (idx === 0 || idx === 1) {
      timerId = window.setTimeout(() => {
        // Avoid double-advance if backend already passed
        if (!justAdvancedRef.current) {
          armAdvance();
          void doSuccess("Amazing!");
        }
      }, 25000);
    } else {
      // Normal: if not successful in 25s, show fail menu
      timerId = window.setTimeout(() => setFailMenu(true), 25000);
    }

    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, tasks, attempt]);

  // Advance when backend signals pass for the current task
  useEffect(() => {
    if (!live) return;
    const current = tasks[idx]?.name;
    if (!current) return;
    if (justAdvancedRef.current) return;

    const isForMe = (live.task === current || live.active_task === current);

    // Prefer explicit event (now sticky for a few frames)
    if (live.event === "task_passed" && isForMe) {
      armAdvance();
      onSuccess();
      return;
    }

    // Fallback: trust the boolean from the live payload
    if (isForMe && (live.passed === true || live.passed === "true")) {
      armAdvance();
      onSuccess();
      return;
    }

    // Last-resort safety: if backend reports progress ~= 100% for this task, treat as success
    if (isForMe && typeof live.progress === "number" && live.progress >= 0.999) {
      armAdvance();
      onSuccess();
      return;
    }
  }, [live, idx, tasks]);

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
    if (goExercises) nav("/exercises");
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

  const t = tasks[idx];

  // Progress from backend for the active task
  const progress =
    live?.active_task === t?.name && typeof live?.progress === "number"
      ? Math.max(0, Math.min(1, live.progress))
      : null;

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
        <div className="relative w-full h-[60vh] bg-black/70 rounded-2xl overflow-hidden">
          <img src={`${API_BASE}/mjpeg`} alt="preview" className="w-full h-full object-contain" />
          <div className="absolute top-2 left-2 bg-black/60 text-white text-sm rounded px-2 py-1">
            Task: {t?.name ?? "-"} • Detections: {live?.count ?? 0}
          </div>
          {progress !== null && (
            <div className="absolute bottom-2 left-2 right-2 bg-black/40 rounded">
              <div className="h-2 rounded" style={{ width: `${Math.round(progress * 100)}%`, background: "rgba(255,255,255,0.9)" }} />
            </div>
          )}
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
