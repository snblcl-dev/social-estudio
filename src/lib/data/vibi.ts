import "server-only";

import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";
import type { Voiceover } from "@/lib/types";

/** Devuelve la clave de Vibi descifrada o `null` si no hay ninguna guardada. */
export async function getVibiApiKey(userId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("settings")
    .select("vibi_api_key")
    .eq("user_id", userId)
    .maybeSingle();

  const encrypted = (data as { vibi_api_key?: string | null } | null)?.vibi_api_key;
  if (!encrypted) return null;

  try {
    return decryptSecret(encrypted);
  } catch {
    return null;
  }
}

/** Resumen de la clave guardada (enmascarada) para mostrar en Ajustes. */
export async function getVibiKeySummary(
  userId: string,
): Promise<{ masked: string } | null> {
  const apiKey = await getVibiApiKey(userId);
  if (!apiKey) return null;
  return { masked: maskSecret(apiKey) };
}

export async function saveVibiApiKey(userId: string, apiKey: string) {
  const supabase = await createClient();

  return supabase.from("settings").upsert(
    {
      user_id: userId,
      vibi_api_key: encryptSecret(apiKey),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

export async function clearVibiApiKey(userId: string) {
  const supabase = await createClient();

  return supabase
    .from("settings")
    .update({ vibi_api_key: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

export async function listVoiceoversForScript(
  userId: string,
  scriptId: string,
): Promise<Voiceover[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("voiceovers")
    .select("*")
    .eq("user_id", userId)
    .eq("script_id", scriptId)
    .order("created_at", { ascending: false });

  return (data as Voiceover[] | null) ?? [];
}

export async function getVoiceover(
  userId: string,
  id: string,
): Promise<Voiceover | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("voiceovers")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  return (data as Voiceover | null) ?? null;
}

export interface InsertVoiceoverInput {
  userId: string;
  scriptId: string;
  taskId: string;
  provider: string;
  voiceId: string;
  modelId: string;
  languageCode: string;
  status: string;
  text: string;
  voiceSettings: Record<string, unknown>;
}

export async function insertVoiceover(
  input: InsertVoiceoverInput,
): Promise<Voiceover | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("voiceovers")
    .insert({
      user_id: input.userId,
      script_id: input.scriptId,
      task_id: input.taskId,
      provider: input.provider,
      voice_id: input.voiceId,
      model_id: input.modelId,
      language_code: input.languageCode,
      status: input.status,
      text: input.text,
      voice_settings: input.voiceSettings,
    })
    .select("*")
    .single();

  return (data as Voiceover | null) ?? null;
}

export async function updateVoiceover(
  userId: string,
  id: string,
  patch: Partial<
    Pick<
      Voiceover,
      "status" | "progress" | "audio_url" | "error" | "characters_used" | "voice_settings"
    >
  >,
): Promise<Voiceover | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("voiceovers")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();

  return (data as Voiceover | null) ?? null;
}

export async function deleteVoiceover(userId: string, id: string) {
  const supabase = await createClient();

  return supabase.from("voiceovers").delete().eq("id", id).eq("user_id", userId);
}
