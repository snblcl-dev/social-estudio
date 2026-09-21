import "server-only";

import { decryptSecret, maskSecret } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";
import type { ApiKeyRow, ApiKeySummary, ProviderKey, UserSettings } from "@/lib/types";

export async function getSettings(userId: string): Promise<UserSettings> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (data) {
    return data as UserSettings;
  }

  return {
    user_id: userId,
    default_provider: "openai",
    default_model: "",
    updated_at: new Date().toISOString(),
  };
}

export async function getApiKeyRow(
  userId: string,
  provider: ProviderKey,
): Promise<ApiKeyRow | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("api_keys")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  return (data as ApiKeyRow | null) ?? null;
}

export async function listApiKeyRows(userId: string): Promise<ApiKeyRow[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("api_keys")
    .select("*")
    .eq("user_id", userId)
    .order("provider", { ascending: true });

  return (data as ApiKeyRow[] | null) ?? [];
}

export async function listConfiguredProviders(userId: string): Promise<ProviderKey[]> {
  const rows = await listApiKeyRows(userId);
  return rows.map((row) => row.provider);
}

/** Resumen de claves configuradas con la clave enmascarada (nunca completa). */
export async function listApiKeySummaries(userId: string): Promise<ApiKeySummary[]> {
  const rows = await listApiKeyRows(userId);

  return rows
    .map((row) => {
      let masked = "••••••••";

      try {
        masked = maskSecret(decryptSecret(row.encrypted_key));
      } catch {
        // Si el secreto de cifrado cambió, no podemos mostrarla.
      }

      return { provider: row.provider, masked, updated_at: row.updated_at };
    })
    .sort((a, b) => a.provider.localeCompare(b.provider));
}
