-- ============================================================================
-- Social Estudio - Esquema de base de datos para Supabase
-- Pega este archivo completo en el SQL Editor de tu proyecto de Supabase.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PERFILES: cada perfil guarda las instrucciones de estilo de guion y de temas
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  script_instructions text not null default '',
  theme_instructions text not null default '',
  image_prompt_instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_user_id_idx on public.profiles (user_id, name);

-- ---------------------------------------------------------------------------
-- SETTINGS: una fila por usuario (proveedor y modelo por defecto)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  default_provider text not null default 'openai',
  default_model text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- API_KEYS: claves de IA cifradas con AES-256-GCM (una por proveedor)
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  encrypted_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists api_keys_user_id_idx on public.api_keys (user_id);

-- ---------------------------------------------------------------------------
-- CONVERSATIONS: hilos de chat
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  title text not null default 'Nueva conversación',
  provider text not null default 'openai',
  model text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_idx on public.conversations (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- MESSAGES: mensajes en formato UIMessage del AI SDK (parts en jsonb)
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id text primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  parts jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, position, created_at);

-- ---------------------------------------------------------------------------
-- SCRIPTS: guiones guardados + prompts de imagen generados
-- ---------------------------------------------------------------------------
create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete set null,
  title text not null,
  content text not null,
  image_prompts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scripts_user_idx on public.scripts (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Trigger para mantener updated_at al día
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: cada usuario solo ve sus propias filas
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.api_keys enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.scripts enable row level security;

drop policy if exists "profiles_owner" on public.profiles;
create policy "profiles_owner" on public.profiles
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "settings_owner" on public.settings;
create policy "settings_owner" on public.settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "api_keys_owner" on public.api_keys;
create policy "api_keys_owner" on public.api_keys
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "conversations_owner" on public.conversations;
create policy "conversations_owner" on public.conversations
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "messages_owner" on public.messages;
create policy "messages_owner" on public.messages
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "scripts_owner" on public.scripts;
create policy "scripts_owner" on public.scripts
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
