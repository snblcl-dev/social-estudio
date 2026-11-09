"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { getFishApiKey } from "@/lib/data/fish";
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
import { FISH_DEFAULT_MODEL, FishApiError, fishCreateTts } from "@/lib/fish";
import { getCurrentUser } from "@/lib/session";
import type { Voiceover } from "@/lib/types";
import {
  VibiApiError,
  vibiCreateTts,
  vibiGetMe,
  vibiGetTask,
  type VibiTtsBody,
} from "@/lib/vibi";
import { deleteVoiceAudio, saveVoiceAudio, voiceAudioUrl } from "@/lib/voice-storage";

export interface VibiActionResult {
  error?: string;
  ok?: boolean;
}

const VOICE_PROVIDERS = ["elevenlabs", "minimax", "capcut", "fishaudio"] as const;

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

  try {
    await saveVibiApiKey(user.id, rawKey);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar la clave." };
  }

  revalidatePath("/ajustes");
  return { ok: true };
}

export async function deleteVibiKey(): Promise<VibiActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  try {
    await clearVibiApiKey(user.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo borrar la clave." };
  }

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
  provider: z.enum(VOICE_PROVIDERS),
  voiceId: z.string().trim().min(1, "Elige una voz."),
  modelId: z.string().trim().max(200).optional(),
  languageCode: z.string().trim().min(1, "Elige un idioma.").max(80),
  speed: z.number().min(0.5).max(2).optional(),
});

export type StartVoiceoverInput = z.input<typeof startSchema>;

interface FishVoiceoverInput {
  userId: string;
  scriptId: string;
  text: string;
  voiceId: string;
  languageCode: string;
  modelId?: string;
  speed: number;
}

async function startFishVoiceover(
  input: FishVoiceoverInput,
): Promise<VibiActionResult & { id?: string; voiceover?: Voiceover }> {
  const apiKey = await getFishApiKey(input.userId);
  if (!apiKey) {
    return { error: "Configura tu clave de Fish Audio en Ajustes para generar voz." };
  }

  const ttsModel = input.modelId?.trim() || FISH_DEFAULT_MODEL;
  const voiceSettings: Record<string, unknown> = { speed: input.speed };

  let voiceover: Voiceover | null = null;
  try {
    voiceover = await insertVoiceover({
      userId: input.userId,
      scriptId: input.scriptId,
      taskId: `fish:${randomUUID()}`,
      provider: "fishaudio",
      voiceId: input.voiceId,
      modelId: ttsModel,
      languageCode: input.languageCode,
      status: "processing",
      text: input.text,
      voiceSettings,
    });
  } catch (error) {
    console.error("[fish] error al guardar el audio", error);
    return { error: "No se pudo guardar el audio generado." };
  }

  if (!voiceover) {
    return { error: "No se pudo guardar el audio generado." };
  }

  const voiceoverId = voiceover.id;

  after(async () => {
    try {
      const audio = await fishCreateTts(apiKey, {
        text: input.text,
        voiceId: input.voiceId,
        ttsModel,
        language: input.languageCode,
        speed: input.speed,
      });

      await saveVoiceAudio(voiceoverId, audio);
      await updateVoiceover(input.userId, voiceoverId, {
        status: "completed",
        progress: 100,
        audio_url: voiceAudioUrl(voiceoverId),
        characters_used: input.text.length,
      });
    } catch (error) {
      const message =
        error instanceof FishApiError
          ? error.message
          : "No se pudo generar la voz con Fish Audio.";
      console.error("[fish] error al generar la voz", error);
      await updateVoiceover(input.userId, voiceoverId, {
        status: "failed",
        error: message,
      });
    }
  });

  revalidatePath("/guiones");
  return { ok: true, id: voiceover.id, voiceover };
}

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

  const script = await getScript(user.id, scriptId);
  if (!script) return { error: "El guion no existe." };

  const text = script.content.trim();
  if (!text) return { error: "El guion está vacío." };

  if (provider === "fishaudio") {
    return startFishVoiceover({
      userId: user.id,
      scriptId,
      text,
      voiceId,
      languageCode,
      modelId,
      speed,
    });
  }

  const apiKey = await getVibiApiKey(user.id);
  if (!apiKey) {
    return { error: "Configura tu clave de Vibi en Ajustes para generar voz." };
  }

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

    revalidatePath("/guiones");
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

  // Fish Audio genera el audio en segundo plano; el estado ya está en la fila.
  if (voiceover.provider === "fishaudio") {
    return { ok: true, voiceover };
  }

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
      revalidatePath("/guiones");
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

  const voiceover = await getVoiceover(user.id, id);
  if (!voiceover) return { error: "El audio no existe." };

  try {
    await deleteVoiceoverRow(user.id, id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo borrar el audio." };
  }

  await deleteVoiceAudio(id);

  revalidatePath("/guiones");
  return { ok: true };
}
