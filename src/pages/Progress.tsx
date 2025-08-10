
import React, { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { LineChart, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import rehabImg from "../../assets/img/rehabscreenshot1.png";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ModuleBar {
  id: string;
  module_name: string;
  subtasks_succeeded: number;
  subtasks_total: number;
}

const BarRow: React.FC<{ bar: ModuleBar }> = ({ bar }) => {
  const [pct, setPct] = useState(0);
  const total = 5; // Always show out of 5
  const succeeded = Math.min(bar.subtasks_succeeded ?? 0, total);
  const target = (succeeded / total) * 100;
  useEffect(() => {
    const t = setTimeout(() => setPct(target), 50);
    return () => clearTimeout(t);
  }, [target]);
  const isPerfect = succeeded >= total;
  return (
    <div className="w-full max-w-xl flex flex-col items-center">
      <div className="mb-2 text-lg font-semibold text-center capitalize">{bar.module_name}</div>
      <div className="w-full flex items-center gap-3">
        <div className="relative w-full h-10 rounded-md" style={{ border: "2px solid hsl(0 0% 0%)", background: "hsl(var(--card))", overflow: "visible" }}>
          <div
            className="h-full"
            style={{
              width: pct + "%",
              background: "hsl(var(--accent-progress))",
              transition: "width 2000ms ease",
            }}
          />
          {isPerfect && (
            <div className="absolute inset-y-0 right-1 flex items-center gap-1 text-primary">
              <Star className="text-yellow-500 animate-pulse" size={22} />
              <span className="text-sm font-semibold">congrats!</span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{succeeded} / {total} subtasks succeeded</div>
    </div>
  );
};

const ProgressBars: React.FC<{ bars: ModuleBar[] }> = ({ bars }) => (
  <div className="w-full flex flex-col items-center gap-6">
    {bars.map((b) => (
      <BarRow key={b.id} bar={b} />
    ))}
  </div>
);

const ProgressPage: React.FC = () => {
  useSEO("Rehab Coach – Progress", "See your achievements and trends over time.");
  const nav = useNavigate();
  const [bars, setBars] = useState<ModuleBar[]>([]);

  useEffect(() => {
    (async () => {
      // Get user id for username 'test-user'
      const { data: profiles } = await supabase.from('profiles').select('id').eq('username', 'test-user').single();
      console.log("Loaded profile:", profiles);
      if (!profiles) return;
      const user_id = profiles.id;
      // Get first 3 module_attempts for this user
      const { data: modules } = await supabase
        .from('module_attempts')
        .select('id, module_name, subtasks_succeeded, data')
        .eq('user_id', user_id)
        .order('created_at', { ascending: true })
        .limit(3);
      console.log("Loaded modules:", modules);
      if (!modules) return;
      // Assume data.subtasks_total is stored in the data JSON column
      const bars: ModuleBar[] = modules.map((m: any) => ({
        id: m.id,
        module_name: m.module_name,
        subtasks_succeeded: m.subtasks_succeeded,
        subtasks_total: m.data?.subtasks_total ?? 1,
      }));
      setBars(bars);
    })();
  }, []);

  return (
    <main className="min-h-screen" style={{ background: "hsl(var(--accent-progress) / 0.08)" }}>
      <AppHeader mode="page" title="Progress" centerIcon={<LineChart />} onBack={() => nav("/")} onHelp={() => {}} accentVar="--accent-progress" />

      <section className="container mx-auto p-6 flex flex-col gap-8 items-center">
        {bars.length === 0 ? (
          <div className="text-center text-lg text-muted-foreground">No progress data for test-user.</div>
        ) : (
          <ProgressBars bars={bars} />
        )}

        {/* Last task visualized collapsible */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button className="mt-6 text-sm font-medium text-primary underline">
              Last task visualized (tap to view)
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <figure className="mt-3 flex flex-col items-center">
              <img src={rehabImg} alt="Last task visualized" className="w-full max-w-lg rounded-lg border" loading="lazy" />
              <figcaption className="mt-2 text-sm text-muted-foreground">Last task visualized</figcaption>
            </figure>
          </CollapsibleContent>
        </Collapsible>
      </section>
    </main>
  );
};

export default ProgressPage;
