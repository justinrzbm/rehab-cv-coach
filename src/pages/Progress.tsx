import React, { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { LineChart, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";

interface Achievement { title: string; count: number; }

const ProgressPage: React.FC = () => {
  useSEO("Rehab Coach – Progress", "See your achievements and trends over time.");
  const nav = useNavigate();
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('exercise_attempts').select('exercise_name, improvement_rom, improvement_speed, improvement_success_rate');
      const map = new Map<string, number>();
      (data || []).forEach((row: any) => {
        const key = row.exercise_name;
        const inc = (row.improvement_rom ? 1 : 0) + (row.improvement_speed ? 1 : 0) + (row.improvement_success_rate ? 1 : 0);
        map.set(key, (map.get(key) || 0) + inc);
      });
      const arr: Achievement[] = Array.from(map.entries()).map(([k, v]) => ({ title: k, count: v })).filter((a) => a.count >= 3);
      setAchievements(arr);
    })();
  }, []);

  return (
    <main className="min-h-screen" style={{ background: "hsl(var(--accent-progress) / 0.06)" }}>
      <AppHeader mode="page" title="Progress" centerIcon={<LineChart />} onBack={() => nav("/")} onHelp={() => {}} accentVar="--accent-progress" />

      <section className="container mx-auto p-6">
        {achievements.length === 0 ? (
          <div className="text-center text-lg text-muted-foreground">Complete exercises to unlock achievements.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {achievements.map((a) => (
              <div key={a.title} className="rounded-2xl p-6 bg-card border hover-scale cursor-pointer" onClick={() => nav(`/progress/${encodeURIComponent(a.title)}`)}>
                <div className="flex items-center gap-3 text-2xl font-bold"><Trophy /> {a.title}</div>
                <div className="text-muted-foreground mt-2">Improvements: {a.count}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};

export default ProgressPage;
