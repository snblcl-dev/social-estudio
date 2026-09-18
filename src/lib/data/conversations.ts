import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Conversation, MessageRow } from "@/lib/types";

export async function listConversations(
  userId: string,
  limit = 30,
): Promise<Conversation[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  return (data as Conversation[] | null) ?? [];
}

export async function getConversation(
  userId: string,
  id: string,
): Promise<Conversation | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  return (data as Conversation | null) ?? null;
}

export async function listMessages(
  userId: string,
  conversationId: string,
): Promise<MessageRow[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  return (data as MessageRow[] | null) ?? [];
}
