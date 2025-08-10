import { supabase } from "@/integrations/supabase/client";

export async function saveExerciseAttempt(payload: {
  exercise_name: string;
  successful_reps?: number;
  total_reps?: number;
  metrics?: Record<string, any>;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { saved: false, reason: 'unauthenticated' } as const;
  const { error } = await supabase.from('exercise_attempts').insert({
    user_id: user.id,
    exercise_name: payload.exercise_name,
    successful_reps: payload.successful_reps ?? null,
    total_reps: payload.total_reps ?? null,
    metrics: payload.metrics ?? {},
  });
  if (error) return { saved: false, reason: error.message } as const;
  return { saved: true } as const;
}
