"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { encryptSecret } from "@/lib/crypto";
import { getCustomProvider } from "@/lib/data/custom-providers";
import { isProviderKey, normalizeBaseUrl, toCustomProviderKey } from "@/lib/providers";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export interface CustomActionResult {
  error?: string;
  ok?: boolean;
  id?: string;
}

function revalidateProviders() {
  revalidatePath("/ajustes");
  revalidatePath("/");
}

const providerSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre al proveedor.").max(80),
  baseUrl: z.string().trim().url("La URL base no es válida."),
  defaultModel: z.string().trim().max(200).optional(),
  apiKey: z.string().optional(),
});

export type SaveCustomProviderInput = z.input<typeof providerSchema> & { id?: string };

export async function saveCustomProvider(
  input: SaveCustomProviderInput,
): Promise<CustomActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = providerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const baseUrl = normalizeBaseUrl(parsed.data.baseUrl);
  const defaultModel = parsed.data.defaultModel?.trim() ?? "";
  const rawKey = parsed.data.apiKey?.trim() ?? "";

  const supabase = await createClient();

  let providerId = input.id?.trim() || "";

  if (providerId) {
    const existing = await getCustomProvider(user.id, providerId);
    if (!existing) return { error: "El proveedor no existe." };

    const { error } = await supabase
      .from("custom_providers")
      .update({ name: parsed.data.name, base_url: baseUrl, default_model: defaultModel })
      .eq("id", providerId)
      .eq("user_id", user.id);

    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("custom_providers")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        base_url: baseUrl,
        default_model: defaultModel,
      })
      .select("id")
      .single();

    if (error) return { error: error.message };
    providerId = data?.id as string;
  }

  if (rawKey) {
    if (rawKey.length < 8) {
      return { error: "Esa clave parece demasiado corta." };
    }

    const { error: keyError } = await supabase.from("api_keys").upsert(
      {
        user_id: user.id,
        provider: toCustomProviderKey(providerId),
        encrypted_key: encryptSecret(rawKey),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );

    if (keyError) return { error: keyError.message };
  }

  revalidateProviders();
  return { ok: true, id: providerId };
}

export async function deleteCustomProvider(id: string): Promise<CustomActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const existing = await getCustomProvider(user.id, id);
  if (!existing) return { error: "El proveedor no existe." };

  const providerKey = toCustomProviderKey(id);
  const supabase = await createClient();

  const { error: modelsError } = await supabase
    .from("custom_models")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", providerKey);

  if (modelsError) return { error: modelsError.message };

  const { error: keyError } = await supabase
    .from("api_keys")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", providerKey);

  if (keyError) return { error: keyError.message };

  const { error } = await supabase
    .from("custom_providers")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidateProviders();
  return { ok: true };
}

const modelSchema = z.object({
  provider: z.string(),
  model: z.string().trim().min(1, "Escribe el identificador del modelo.").max(200),
});

export type SaveCustomModelInput = z.input<typeof modelSchema>;

export async function saveCustomModel(
  input: SaveCustomModelInput,
): Promise<CustomActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = modelSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  if (!isProviderKey(parsed.data.provider)) {
    return { error: "Proveedor inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("custom_models").upsert(
    {
      user_id: user.id,
      provider: parsed.data.provider,
      model: parsed.data.model,
    },
    { onConflict: "user_id,provider,model" },
  );

  if (error) return { error: error.message };

  revalidateProviders();
  return { ok: true };
}

export async function deleteCustomModel(id: string): Promise<CustomActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("custom_models")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidateProviders();
  return { ok: true };
}
