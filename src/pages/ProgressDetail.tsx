import React, { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { LineChart } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";

interface Point { t: string; value: number }

const ProgressDetail: React.FC = () => {
  const { activity } = useParams();
  useSEO(`Progress: ${activity}`, `Trend line for ${activity} over time.`);
  const nav = useNavigate();
  const [points, setPoints] = useState<Point[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('exercise_attempts').select('created_at, success_rate').eq('exercise_name', activity);
      const pts = (data || []).map((r: any) => ({ t: r.created_at, value: r.success_rate ?? 0 }));
      setPoints(pts);
    })();
  }, [activity]);

  return (
    <main className="min-h-screen" style={{ background: "hsl(var(--accent-progress) / 0.06)" }}>
      <AppHeader mode="page" title="Progress" centerIcon={<LineChart />} onBack={() => nav('/progress')} onHelp={() => {}} accentVar="--accent-progress" />

      <section className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-4">{activity}</h1>
        <div className="rounded-2xl p-6 bg-card border">
          <div className="text-muted-foreground">Trend over time (keep it simple):</div>
          <div className="h-48 flex items-end gap-2">
            {points.map((p, i) => (
              <div key={i} className="flex-1 bg-primary/10" style={{ height: `${Math.round((p.value || 0) * 100)}%` }} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};

export default ProgressDetail;
