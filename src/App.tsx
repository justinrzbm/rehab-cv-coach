import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Index from "@/pages/Index";
import ModulesPage from "@/pages/Modules";
import ExercisesPage from "@/pages/Exercises";
import ProgressPage from "@/pages/Progress";
import NotFound from "@/pages/NotFound";
import StarShooter from "./games/StarShooter";
import FruitNinja from "./games/FruitNinja";  
import FlappyBall from "./games/FlappyBall";

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
          <Route path="/exercises" element={<ExercisesPage />} />
          <Route path="/exercises/star-shooter" element={<StarShooter />} />
          <Route path="/exercises/flappy-ball" element={<FlappyBall />} />
          <Route path="/exercises/fruit-ninja" element={<FruitNinja />} />
          <Route path="/progress" element={<ProgressPage />} />
          {/* keep this last */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
