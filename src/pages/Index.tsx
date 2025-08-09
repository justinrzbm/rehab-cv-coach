import React, { useState } from "react";
import { HandExercise, type AttemptMetrics } from "@/components/exercise/HandExercise";
import { MetricsCharts } from "@/components/charts/MetricsCharts";
import { Button } from "@/components/ui/button";

const Index = () => {
  const [attempts, setAttempts] = useState<AttemptMetrics[]>([]);

  return (
    <main className="min-h-screen bg-background">
      <section className="container py-10 md:py-16">
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Senior-friendly Rehabilitation Exercise App</h1>
          <p className="text-xl text-muted-foreground">Hand-tracking exercises with voice guidance and clear progress charts.</p>
          <div className="flex items-center justify-center gap-3">
            <Button size="lg" asChild>
              <a href="#exercise">Start Exercise</a>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <a href="#progress">View Progress</a>
            </Button>
          </div>
        </div>
      </section>

      <section id="exercise" className="container pb-12">
        <HandExercise onAttemptComplete={(m) => setAttempts((a) => [...a, m])} />
      </section>

      <section id="progress" className="container pb-24">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">Your Progress</h2>
          <Button
            variant="secondary"
            onClick={() => {
              alert("To save metrics across sessions, connect Supabase (free). Click the green Supabase button in the top-right, then we can enable saving.");
            }}
          >
            Connect Supabase to Save
          </Button>
        </div>
        {attempts.length === 0 ? (
          <div className="text-muted-foreground">No attempts yet. Start an exercise to see your metrics here.</div>
        ) : (
          <MetricsCharts data={attempts} />
        )}
      </section>
    </main>
  );
};

export default Index;
