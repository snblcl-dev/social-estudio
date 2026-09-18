import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function listProfiles(userId: string): Promise<Profile[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  return (data as Profile[] | null) ?? [];
}

export async function getProfile(userId: string, id: string): Promise<Profile | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  return (data as Profile | null) ?? null;
}
