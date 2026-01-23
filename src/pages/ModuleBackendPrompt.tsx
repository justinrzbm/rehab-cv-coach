import React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { FolderOpen } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";

const ModuleBackendPrompt: React.FC = () => {
  const { slug = "feeding" } = useParams();
  useSEO("Backend Setup", "Please go to backend folder now");
  const nav = useNavigate();

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: "hsl(var(--accent-modules) / 0.06)" }}
    >
      <AppHeader
        mode="page"
        title="Setup"
        centerIcon={<FolderOpen />}
        onBack={() => nav(`/modules/${slug}/setup`)}
        onHelp={() => {}}
        accentVar="--accent-modules"
      />

      <section className="flex-grow container mx-auto p-4 flex flex-col items-center justify-center gap-6">
        <div className="text-center max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Please go to backend folder now
          </h1>
        </div>

        <div className="flex justify-center w-full pt-4">
          <Button size="lg" onClick={() => nav("/")}>
            Continue
          </Button>
        </div>
      </section>
    </main>
  );
};

export default ModuleBackendPrompt;
