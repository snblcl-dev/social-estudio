import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Script } from "@/lib/types";

export async function listScripts(userId: string, limit = 50): Promise<Script[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("scripts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data as Script[] | null) ?? [];
}

export async function getScript(userId: string, id: string): Promise<Script | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("scripts")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  return (data as Script | null) ?? null;
}
