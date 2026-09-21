-- ============================================================================
-- Migración 0004: proveedores personalizados y modelos manuales
-- ============================================================================
-- Añade dos tablas:
--   * custom_providers: proveedores definidos por el usuario con endpoint
--     compatible con la API de OpenAI (base_url propia).
--   * custom_models: modelos añadidos a mano a cualquier proveedor, por si el
--     listado automático no los devuelve.
--
-- Los proveedores personalizados se referencian como "custom:<uuid>" en
-- api_keys.provider, conversations.provider, settings.default_provider y
-- custom_models.provider.
--
-- Pega este archivo completo en el SQL Editor de Supabase y ejecútalo.
-- ============================================================================

create table if not exists public.custom_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  base_url text not null,
  default_model text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists custom_providers_user_idx on public.custom_providers (user_id);

create table if not exists public.custom_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  model text not null,
  created_at timestamptz not null default now(),
  unique (user_id, provider, model)
);

create index if not exists custom_models_user_idx on public.custom_models (user_id, provider);

drop trigger if exists custom_providers_set_updated_at on public.custom_providers;
create trigger custom_providers_set_updated_at
  before update on public.custom_providers
  for each row execute function public.set_updated_at();

alter table public.custom_providers enable row level security;
alter table public.custom_models enable row level security;

drop policy if exists "custom_providers_owner" on public.custom_providers;
create policy "custom_providers_owner" on public.custom_providers
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "custom_models_owner" on public.custom_models;
create policy "custom_models_owner" on public.custom_models
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
