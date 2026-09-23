"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getScript } from "@/lib/data/scripts";
import {
  clearVibiApiKey,
  deleteVoiceover as deleteVoiceoverRow,
  getVibiApiKey,
  getVoiceover,
  insertVoiceover,
  listVoiceoversForScript,
  saveVibiApiKey,
  updateVoiceover,
} from "@/lib/data/vibi";
import { getCurrentUser } from "@/lib/supabase/server";
import type { Voiceover } from "@/lib/types";
import {
  VibiApiError,
  vibiCreateTts,
  vibiGetMe,
  vibiGetTask,
  type VibiTtsBody,
} from "@/lib/vibi";

export interface VibiActionResult {
  error?: string;
  ok?: boolean;
}

const VIBI_PROVIDERS = ["elevenlabs", "minimax", "capcut"] as const;

// ---------------------------------------------------------------------------
// Clave de API
// ---------------------------------------------------------------------------

export async function saveVibiKey(input: { apiKey: string }): Promise<VibiActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const rawKey = input.apiKey?.trim() ?? "";
  if (rawKey.length < 8) {
    return { error: "Esa clave parece demasiado corta." };
  }

  const { error } = await saveVibiApiKey(user.id, rawKey);
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}

export async function deleteVibiKey(): Promise<VibiActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const { error } = await clearVibiApiKey(user.id);
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}

export async function getVibiAccount(): Promise<{ error?: string; credits?: number }> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const apiKey = await getVibiApiKey(user.id);
  if (!apiKey) return { error: "No hay una clave de Vibi guardada." };

  try {
    const me = await vibiGetMe(apiKey);
    return { credits: me.credit_balance };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo consultar Vibi." };
  }
}

// ---------------------------------------------------------------------------
// Generación de voz
// ---------------------------------------------------------------------------

const startSchema = z.object({
  scriptId: z.string().uuid("Guion inválido."),
  provider: z.enum(VIBI_PROVIDERS),
  voiceId: z.string().trim().min(1, "Elige una voz."),
  modelId: z.string().trim().max(200).optional(),
  languageCode: z.string().trim().min(1, "Elige un idioma.").max(80),
  speed: z.number().min(0.5).max(2).optional(),
});

export type StartVoiceoverInput = z.input<typeof startSchema>;

export async function startVoiceover(
  input: StartVoiceoverInput,
): Promise<VibiActionResult & { id?: string; voiceover?: Voiceover }> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { scriptId, provider, voiceId, modelId, languageCode } = parsed.data;
  const speed = parsed.data.speed ?? 1;

  const apiKey = await getVibiApiKey(user.id);
  if (!apiKey) {
    return { error: "Configura tu clave de Vibi en Ajustes para generar voz." };
  }

  const script = await getScript(user.id, scriptId);
  if (!script) return { error: "El guion no existe." };

  const text = script.content.trim();
  if (!text) return { error: "El guion está vacío." };

  const voiceSettings: Record<string, unknown> =
    provider === "elevenlabs"
      ? { stability: 0.5, similarity_boost: 0.75, speed }
      : provider === "minimax"
        ? { speed, pitch: 0, vol: 1 }
        : { speed, pitch: 0 };

  const body: VibiTtsBody = {
    text,
    provider,
    language_code: languageCode,
    voice_settings: voiceSettings,
  };

  if (provider !== "capcut" && modelId) {
    body.model_id = modelId;
  }

  try {
    const task = await vibiCreateTts(apiKey, voiceId, body);

    const voiceover = await insertVoiceover({
      userId: user.id,
      scriptId,
      taskId: task.id,
      provider,
      voiceId,
      modelId: modelId ?? "",
      languageCode,
      status: task.status ?? "pending",
      text,
      voiceSettings,
    });

    if (!voiceover) {
      return { error: "No se pudo guardar el audio generado." };
    }

    revalidatePath("/historial");
    return { ok: true, id: voiceover.id, voiceover };
  } catch (error) {
    if (error instanceof VibiApiError) return { error: error.message };
    console.error("[vibi] error al crear la tarea", error);
    return { error: "No se pudo iniciar la generación de voz." };
  }
}

export async function refreshVoiceover(
  id: string,
): Promise<VibiActionResult & { voiceover?: Voiceover }> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const voiceover = await getVoiceover(user.id, id);
  if (!voiceover) return { error: "El audio no existe." };

  if (voiceover.status === "completed" || voiceover.status === "failed") {
    return { ok: true, voiceover };
  }

  const apiKey = await getVibiApiKey(user.id);
  if (!apiKey) return { error: "No hay una clave de Vibi guardada." };

  try {
    const task = await vibiGetTask(apiKey, voiceover.task_id);
    const status = task.status ?? voiceover.status;

    const updated = await updateVoiceover(user.id, id, {
      status,
      progress: task.progress ?? (status === "completed" ? 100 : voiceover.progress),
      audio_url: task.result?.audio_url ?? voiceover.audio_url,
      error: task.error ?? null,
      characters_used: task.characters_used ?? voiceover.characters_used,
    });

    if (status === "completed" || status === "failed") {
      revalidatePath("/historial");
    }

    return { ok: true, voiceover: updated ?? voiceover };
  } catch (error) {
    if (error instanceof VibiApiError) return { error: error.message };
    console.error("[vibi] error al consultar la tarea", error);
    return { error: "No se pudo consultar el estado del audio." };
  }
}

export async function listVoiceovers(scriptId: string): Promise<Voiceover[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return listVoiceoversForScript(user.id, scriptId);
}

export async function deleteVoiceover(id: string): Promise<VibiActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const { error } = await deleteVoiceoverRow(user.id, id);
  if (error) return { error: error.message };

  revalidatePath("/historial");
  return { ok: true };
}
