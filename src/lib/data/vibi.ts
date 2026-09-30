import "server-only";

import type { Prisma } from "@prisma/client";

import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";
import { parseJson, prisma } from "@/lib/db";
import type { Voiceover } from "@/lib/types";

type VoiceoverRow = {
  id: string;
  user_id: string;
  script_id: string | null;
  task_id: string;
  provider: string;
  voice_id: string;
  model_id: string;
  language_code: string;
  status: string;
  progress: number;
  audio_url: string | null;
  error: string | null;
  text: string;
  voice_settings: string;
  characters_used: number | null;
  created_at: Date;
  updated_at: Date;
};

function toVoiceover(row: VoiceoverRow): Voiceover {
  return {
    id: row.id,
    user_id: row.user_id,
    script_id: row.script_id,
    task_id: row.task_id,
    provider: row.provider as Voiceover["provider"],
    voice_id: row.voice_id,
    model_id: row.model_id,
    language_code: row.language_code,
    status: row.status,
    progress: row.progress,
    audio_url: row.audio_url,
    error: row.error,
    text: row.text,
    voice_settings: parseJson<Record<string, unknown>>(row.voice_settings, {}),
    characters_used: row.characters_used,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/** Devuelve la clave de Vibi descifrada o `null` si no hay ninguna guardada. */
export async function getVibiApiKey(userId: string): Promise<string | null> {
  const row = await prisma.settings.findUnique({
    where: { user_id: userId },
    select: { vibi_api_key: true },
  });

  if (!row?.vibi_api_key) return null;

  try {
    return decryptSecret(row.vibi_api_key);
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

export async function saveVibiApiKey(userId: string, apiKey: string): Promise<void> {
  const encrypted = encryptSecret(apiKey);

  await prisma.settings.upsert({
    where: { user_id: userId },
    create: { user_id: userId, vibi_api_key: encrypted },
    update: { vibi_api_key: encrypted },
  });
}

export async function clearVibiApiKey(userId: string): Promise<void> {
  await prisma.settings.updateMany({
    where: { user_id: userId },
    data: { vibi_api_key: null },
  });
}

export async function listVoiceoversForScript(
  userId: string,
  scriptId: string,
): Promise<Voiceover[]> {
  const rows = await prisma.voiceover.findMany({
    where: { user_id: userId, script_id: scriptId },
    orderBy: { created_at: "desc" },
  });

  return rows.map(toVoiceover);
}

export async function getVoiceover(
  userId: string,
  id: string,
): Promise<Voiceover | null> {
  const row = await prisma.voiceover.findFirst({
    where: { id, user_id: userId },
  });

  return row ? toVoiceover(row) : null;
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
  const row = await prisma.voiceover.create({
    data: {
      user_id: input.userId,
      script_id: input.scriptId,
      task_id: input.taskId,
      provider: input.provider,
      voice_id: input.voiceId,
      model_id: input.modelId,
      language_code: input.languageCode,
      status: input.status,
      text: input.text,
      voice_settings: JSON.stringify(input.voiceSettings),
    },
  });

  return toVoiceover(row);
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
  const data: Prisma.VoiceoverUpdateManyMutationInput = {};

  if (patch.status !== undefined) data.status = patch.status;
  if (patch.progress !== undefined) data.progress = patch.progress;
  if (patch.audio_url !== undefined) data.audio_url = patch.audio_url;
  if (patch.error !== undefined) data.error = patch.error;
  if (patch.characters_used !== undefined) data.characters_used = patch.characters_used;
  if (patch.voice_settings !== undefined) {
    data.voice_settings = JSON.stringify(patch.voice_settings);
  }

  const result = await prisma.voiceover.updateMany({
    where: { id, user_id: userId },
    data,
  });

  if (result.count === 0) return null;

  const row = await prisma.voiceover.findUnique({ where: { id } });
  return row ? toVoiceover(row) : null;
}

export async function deleteVoiceover(userId: string, id: string): Promise<void> {
  await prisma.voiceover.deleteMany({ where: { id, user_id: userId } });
}
