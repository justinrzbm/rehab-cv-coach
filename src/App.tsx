import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Index from "@/pages/Index";
import ModulesPage from "@/pages/Modules";
import ExercisesPage from "@/pages/Exercises";
import ProgressPage from "@/pages/Progress";
import ModuleInfo from "@/pages/ModuleInfo";      // NEW
import ModuleSetup from "@/pages/ModuleSetup";    // UPDATED (tutorial)
import ModuleReady from "@/pages/ModuleReady";    // NEW
import ModuleRun from "@/pages/ModuleRun";        // EXISTING
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/modules" element={<ModulesPage />} />
          <Route path="/modules/:slug/info" element={<ModuleInfo />} />
          <Route path="/modules/:slug/setup" element={<ModuleSetup />} />
          <Route path="/modules/:slug/ready" element={<ModuleReady />} />
          <Route path="/modules/:slug/run" element={<ModuleRun />} />
          <Route path="/exercises" element={<ExercisesPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
