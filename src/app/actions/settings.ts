"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { encryptSecret } from "@/lib/crypto";
import { isProviderKey } from "@/lib/providers";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

const settingsSchema = z.object({
  default_provider: z.string(),
  default_model: z.string().trim().max(200),
});

export interface SettingsInput {
  default_provider: string;
  default_model: string;
}

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

function revalidateSettings() {
  revalidatePath("/ajustes");
  revalidatePath("/");
}

export async function saveSettings(input: SettingsInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  if (!isProviderKey(parsed.data.default_provider)) {
    return { error: "Proveedor por defecto inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert(
    {
      user_id: user.id,
      default_provider: parsed.data.default_provider,
      default_model: parsed.data.default_model,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) return { error: error.message };

  revalidateSettings();
  return { ok: true };
}

export async function saveApiKey(input: {
  provider: string;
  apiKey: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  if (!isProviderKey(input.provider)) {
    return { error: "Proveedor inválido." };
  }

  const rawKey = input.apiKey.trim();
  if (rawKey.length < 8) {
    return { error: "Esa clave parece demasiado corta." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("api_keys").upsert(
    {
      user_id: user.id,
      provider: input.provider,
      encrypted_key: encryptSecret(rawKey),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );

  if (error) return { error: error.message };

  revalidateSettings();
  return { ok: true };
}

export async function deleteApiKey(provider: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  if (!isProviderKey(provider)) {
    return { error: "Proveedor inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("api_keys")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", provider);

  if (error) return { error: error.message };

  revalidateSettings();
  return { ok: true };
}
