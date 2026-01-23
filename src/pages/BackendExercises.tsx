import React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Code, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";

const BackendExercises: React.FC = () => {
  useSEO("Backend Exercises", "Move to backend to start exercises");
  const nav = useNavigate();

  return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: "hsl(var(--accent-modules) / 0.06)" }}>
      <AppHeader
        mode="page"
        title="Backend Exercises"
        centerIcon={<Code />}
        onBack={() => nav("/")}
        onHelp={() => {}}
        accentVar="--accent-modules"
      />

      <div className="container mx-auto px-6 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Move to backend now to start exercises
          </h1>
          <p className="text-xl text-muted-foreground">
            Navigate to the backend directory to run Python CV exercises
          </p>
        </div>
      </div>
    </main>
  );
};

export default BackendExercises;
