import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BookOpen, CheckCircle2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CircularTimer } from "@/components/progress/CircularTimer";
import { useTTS } from "@/components/tts/useTTS";
import { useSEO } from "@/hooks/useSEO";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

interface Task {
  name: string;
  instruction: string;
  duration?: number; // seconds for hold tasks
}

const congrats = ["Great job!", "Awesome!", "Well done!", "Fantastic!", "You did it! 🎉"];
const encouragement = ["Keep it up! 💪", "You're on fire! 🔥", "Nice and steady! 😊", "Great focus! 🌟"];

const ModuleRun: React.FC = () => {
  const { slug } = useParams();
  useSEO(`Module Run: ${slug}`, `Guided ${slug} module with camera and voice.`);
  const nav = useNavigate();
  const { speak } = useTTS(true);

  const tasks: Task[] = useMemo(() => (
    slug === "feeding"
      ? [
          { name: "hold_cup", instruction: "Hold the cup steady.", duration: 5 },
          { name: "lift_cup", instruction: "Lift the cup to mouth level." },
          { name: "hold_mouth", instruction: "Hold the cup at mouth level.", duration: 5 },
          { name: "tip_cup", instruction: "Tip the cup as if drinking." },
          { name: "place_down", instruction: "Place the cup down." }
        ]
      : []
  ), [slug]);

  const [idx, setIdx] = useState(0);
  const [showCongrats, setShowCongrats] = useState<string | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [moduleAttemptId, setModuleAttemptId] = useState<string | null>(null);
  const [failMenu, setFailMenu] = useState(false);

  useEffect(() => {
    // Start module attempt (if logged in)
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      setStartTime(Date.now());
      if (user.user) {
        const { data, error } = await supabase.from('module_attempts').insert({ user_id: user.user.id, module_name: slug!, is_completed: false }).select('id').maybeSingle();
        if (!error && data) setModuleAttemptId(data.id);
      }
    })();
  }, [slug]);

  useEffect(() => {
    if (!tasks.length) return;
    const t = tasks[idx];
    speak(t.instruction);
    if (t.duration) setTimerRunning(true); else setTimerRunning(false);

    // Fail if not successful in 20s (placeholder)
    const failId = setTimeout(() => setFailMenu(true), 20000);

    // Auto-success placeholder after 7s if not timed; for timed, complete when timer finishes
    let autoId: any;
    if (!t.duration) {
      autoId = setTimeout(() => onSuccess(), 7000);
    }

    return () => { clearTimeout(failId); if (autoId) clearTimeout(autoId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, tasks]);

  const onTimerComplete = () => onSuccess();

  const onSuccess = async () => {
    setFailMenu(false);
    setTimerRunning(false);
    const msg = congrats[Math.floor(Math.random() * congrats.length)];
    speak(msg);
    setShowCongrats(msg);
    setTimeout(() => setShowCongrats(null), 1000);

    // Save task attempt
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && moduleAttemptId) {
        const t = tasks[idx];
        await supabase.from('module_task_attempts').insert({
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

  const onFailChoice = async (choice: 'retry' | 'skip' | 'finish') => {
    setFailMenu(false);
    if (choice === 'retry') {
      setIdx(idx); // retrigger effects
      return;
    }
    if (choice === 'skip') {
      // record fail but move to next
      await saveTaskPass(false);
      if (idx + 1 < tasks.length) setIdx(idx + 1); else onCompleteModule(false);
      return;
    }
    if (choice === 'finish') {
      await onCompleteModule(false, true);
      return;
    }
  };

  const saveTaskPass = async (pass: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && moduleAttemptId) {
        const t = tasks[idx];
        await supabase.from('module_task_attempts').insert({
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
        await supabase.from('module_attempts').update({ is_completed: completed, duration_seconds: duration }).eq('id', moduleAttemptId);
      }
    } catch {}
    if (goExercises) nav('/exercises'); else nav('/modules');
  };

  // Live encouragement every 6s
  useEffect(() => {
    const id = setInterval(() => speak(encouragement[Math.floor(Math.random() * encouragement.length)]), 6000);
    return () => clearInterval(id);
  }, [speak]);

  const t = tasks[idx];

  return (
    <main className="min-h-screen relative" style={{ background: "hsl(var(--accent-modules) / 0.06)" }}>
      <AppHeader mode="page" title="Modules" centerIcon={<BookOpen />} onBack={() => nav(`/modules/${slug}/info`)} onHelp={() => {}} accentVar="--accent-modules" />

      <div className="absolute inset-0 -z-10 bg-black/40" />

      {/* Camera placeholder area */}
      <div className="container mx-auto p-4">
        <div className="w-full h-[60vh] bg-black/70 rounded-2xl flex items-center justify-center text-white">
          Camera + Hand Tracking Running...
        </div>
      </div>

      {/* Instruction bubble */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-6 py-3 rounded-full text-lg font-semibold shadow">
        {t?.instruction}
      </div>

      {t?.duration ? (
        <CircularTimer seconds={t.duration} running={timerRunning} onComplete={onTimerComplete} />
      ) : null}

      {/* Failure menu */}
      {failMenu && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="bg-card rounded-xl p-6 w-[90%] max-w-md space-y-3">
            <div className="text-xl font-bold">Need a hand?</div>
            <div className="text-muted-foreground">Choose an option:</div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => onFailChoice('retry')}>Try Again</Button>
              <Button variant="secondary" onClick={() => onFailChoice('skip')}>I succeeded (skip)</Button>
              <Button onClick={() => onFailChoice('finish')}>Finish</Button>
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
