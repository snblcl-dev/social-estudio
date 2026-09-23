-- ============================================================================
-- Migración 0005: voz de los guiones con Vibi
-- ============================================================================
-- Añade:
--   * settings.vibi_api_key: clave de api.vibi.pro cifrada (AES-256-GCM).
--   * voiceovers: audios generados a partir de un guion. Guarda el id de la
--     tarea de Vibi, su estado y la URL del audio resultante.
--
-- Pega este archivo completo en el SQL Editor de Supabase y ejecútalo.
-- ============================================================================

alter table public.settings add column if not exists vibi_api_key text;

create table if not exists public.voiceovers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  script_id uuid references public.scripts (id) on delete cascade,
  task_id text not null unique,
  provider text not null default 'elevenlabs',
  voice_id text not null,
  model_id text not null default '',
  language_code text not null default '',
  status text not null default 'pending',
  progress integer not null default 0,
  audio_url text,
  error text,
  text text not null default '',
  voice_settings jsonb not null default '{}'::jsonb,
  characters_used integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists voiceovers_user_idx on public.voiceovers (user_id, created_at desc);
create index if not exists voiceovers_script_idx on public.voiceovers (script_id, created_at desc);

drop trigger if exists voiceovers_set_updated_at on public.voiceovers;
create trigger voiceovers_set_updated_at
  before update on public.voiceovers
  for each row execute function public.set_updated_at();

alter table public.voiceovers enable row level security;

drop policy if exists "voiceovers_owner" on public.voiceovers;
create policy "voiceovers_owner" on public.voiceovers
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
