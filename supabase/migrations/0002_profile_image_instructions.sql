-- ============================================================================
-- Migración 0002: instrucciones de prompts de imagen por perfil
-- ============================================================================
-- Mueve las instrucciones de prompts de imagen de `settings` (globales) a
-- `profiles` (una por perfil), y elimina la columna global.
--
-- Pega este archivo completo en el SQL Editor de Supabase y ejecútalo.
-- ============================================================================

-- 1. Añadir la columna a los perfiles.
alter table public.profiles
  add column if not exists image_prompt_instructions text not null default '';

-- 2. Conservar lo que ya tenías: copiar las instrucciones globales a todos los
--    perfiles que aún no tengan las suyas.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'settings'
      and column_name = 'image_prompt_instructions'
  ) then
    execute $sql$
      update public.profiles
      set image_prompt_instructions = coalesce(
        (select s.image_prompt_instructions from public.settings s where s.user_id = profiles.user_id),
        ''
      )
      where coalesce(image_prompt_instructions, '') = ''
    $sql$;

    -- 3. Eliminar la columna global, ya no se usa.
    execute 'alter table public.settings drop column image_prompt_instructions';
  end if;
end;
$$;
