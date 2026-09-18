-- ============================================================================
-- Migración 0003: orden explícito de los mensajes
-- ============================================================================
-- Los mensajes de una misma tanda comparten `created_at`, así que el orden al
-- recargar la conversación no estaba garantizado. Se añade una columna
-- `position` que guarda el índice del mensaje dentro de la conversación.
--
-- Pega este archivo completo en el SQL Editor de Supabase y ejecútalo.
-- ============================================================================

alter table public.messages
  add column if not exists position integer not null default 0;

drop index if exists public.messages_conversation_idx;

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, position, created_at);
