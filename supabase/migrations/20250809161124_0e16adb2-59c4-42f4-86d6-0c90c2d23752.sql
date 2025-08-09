-- Harden functions: set SECURITY DEFINER and search_path
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.calculate_exercise_improvements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_attempt public.exercise_attempts;
begin
  select * into last_attempt
  from public.exercise_attempts ea
  where ea.user_id = new.user_id
    and ea.exercise_name = new.exercise_name
    and ea.id <> new.id
  order by ea.created_at desc
  limit 1;

  if found then
    new.improvement_rom := (new.rom is not null and last_attempt.rom is not null and new.rom > last_attempt.rom);
    new.improvement_speed := (new.duration_seconds is not null and last_attempt.duration_seconds is not null and new.duration_seconds < last_attempt.duration_seconds);
    new.improvement_success_rate := (new.success_rate is not null and last_attempt.success_rate is not null and new.success_rate > last_attempt.success_rate);
  else
    new.improvement_rom := null;
    new.improvement_speed := null;
    new.improvement_success_rate := null;
  end if;
  return new;
end;
$$;