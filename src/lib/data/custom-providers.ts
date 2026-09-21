import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CustomModel, CustomProvider, ProviderKey } from "@/lib/types";

export async function listCustomProviders(userId: string): Promise<CustomProvider[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("custom_providers")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  return (data as CustomProvider[] | null) ?? [];
}

export async function getCustomProvider(
  userId: string,
  id: string,
): Promise<CustomProvider | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("custom_providers")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  return (data as CustomProvider | null) ?? null;
}

export async function listCustomModels(userId: string): Promise<CustomModel[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("custom_models")
    .select("*")
    .eq("user_id", userId)
    .order("provider", { ascending: true })
    .order("model", { ascending: true });

  return (data as CustomModel[] | null) ?? [];
}

export async function listCustomModelsForProvider(
  userId: string,
  provider: ProviderKey,
): Promise<string[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("custom_models")
    .select("model")
    .eq("user_id", userId)
    .eq("provider", provider)
    .order("model", { ascending: true });

  return ((data as { model: string }[] | null) ?? []).map((row) => row.model);
}
