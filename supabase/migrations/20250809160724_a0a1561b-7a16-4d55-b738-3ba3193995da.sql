-- Enable pgcrypto for gen_random_uuid
create extension if not exists pgcrypto;

-- Profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  username text unique,
  full_name text,
  avatar_url text
);

alter table public.profiles enable row level security;

create policy if not exists "Profiles are viewable by owner" on public.profiles
for select using (auth.uid() = id);
create policy if not exists "Profiles are updatable by owner" on public.profiles
for update using (auth.uid() = id);
create policy if not exists "Profiles can be inserted by owner" on public.profiles
for insert with check (auth.uid() = id);

-- Updated_at trigger function
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger for profiles updated_at
create trigger if not exists update_profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

-- Exercise attempts table
create table if not exists public.exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_name text not null,
  duration_seconds real,
  rom real,
  successful_reps integer,
  total_reps integer,
  success_rate real generated always as (case when total_reps > 0 then successful_reps::real / total_reps else null end) stored,
  metrics jsonb,
  improvement_rom boolean,
  improvement_speed boolean,
  improvement_success_rate boolean,
  data jsonb
);

alter table public.exercise_attempts enable row level security;

create policy if not exists "Users can view their exercise attempts" on public.exercise_attempts
for select using (auth.uid() = user_id);
create policy if not exists "Users can insert their exercise attempts" on public.exercise_attempts
for insert with check (auth.uid() = user_id);

-- Module attempts table
create table if not exists public.module_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_name text not null,
  is_completed boolean not null default false,
  duration_seconds real,
  metrics jsonb,
  data jsonb
);

alter table public.module_attempts enable row level security;

create policy if not exists "Users can view their module attempts" on public.module_attempts
for select using (auth.uid() = user_id);
create policy if not exists "Users can insert their module attempts" on public.module_attempts
for insert with check (auth.uid() = user_id);

-- Module task attempts table
create table if not exists public.module_task_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  module_attempt_id uuid not null references public.module_attempts(id) on delete cascade,
  task_name text not null,
  is_pass boolean not null,
  duration_seconds real,
  metrics jsonb,
  data jsonb
);

alter table public.module_task_attempts enable row level security;

-- RLS for module_task_attempts uses parent module_attempts.user_id
create policy if not exists "Users can view their module task attempts" on public.module_task_attempts
for select using (
  exists (
    select 1 from public.module_attempts ma
    where ma.id = module_task_attempts.module_attempt_id
      and ma.user_id = auth.uid()
  )
);
create policy if not exists "Users can insert their module task attempts" on public.module_task_attempts
for insert with check (
  exists (
    select 1 from public.module_attempts ma
    where ma.id = module_task_attempts.module_attempt_id
      and ma.user_id = auth.uid()
  )
);

-- Improvement calculation function & trigger for exercise_attempts
create or replace function public.calculate_exercise_improvements()
returns trigger as $$
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
$$ language plpgsql;

create trigger if not exists trigger_calculate_exercise_improvements
before insert on public.exercise_attempts
for each row execute function public.calculate_exercise_improvements();