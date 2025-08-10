
import React, { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { LineChart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";

interface ModuleBar {
  id: string;
  module_name: string;
  subtasks_succeeded: number;
  subtasks_total: number;
}

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
    <main className="min-h-screen" style={{ background: "hsl(var(--accent-progress) / 0.06)" }}>
      <AppHeader mode="page" title="Progress" centerIcon={<LineChart />} onBack={() => nav("/")} onHelp={() => {}} accentVar="--accent-progress" />

      <section className="container mx-auto p-6 flex flex-col gap-8 items-center">
        {bars.length === 0 ? (
          <div className="text-center text-lg text-muted-foreground">No progress data for test-user.</div>
        ) : (
          bars.map((bar) => (
            <div key={bar.id} className="w-full max-w-xl flex flex-col items-center">
              <div className="mb-2 text-lg font-semibold text-center">{bar.module_name}</div>
              <div className="flex w-full h-10 rounded-lg overflow-hidden border border-gray-300 bg-white">
                {Array.from({ length: bar.subtasks_total }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 h-full"
                    style={{
                      background: i < bar.subtasks_succeeded ? 'hsl(var(--accent-progress))' : '#e5e7eb',
                      transition: 'background 0.3s',
                    }}
                  />
                ))}
              </div>
              <div className="mt-1 text-sm text-gray-500">{bar.subtasks_succeeded} / {bar.subtasks_total} subtasks succeeded</div>
            </div>
          ))
        )}
      </section>
    </main>
  );
};

export default ProgressPage;
