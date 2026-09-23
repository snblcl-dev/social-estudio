import "server-only";

import type { VibiLanguage, VibiModel, VibiProvider, VibiVoice } from "@/lib/types";

const VIBI_BASE_URL = (process.env.VIBI_API_BASE_URL ?? "https://api.vibi.pro").replace(
  /\/+$/,
  "",
);

export const VIBI_PROVIDERS: { id: VibiProvider; label: string }[] = [
  { id: "elevenlabs", label: "ElevenLabs" },
  { id: "minimax", label: "MiniMax" },
  { id: "capcut", label: "CapCut" },
];

export const VIBI_DEFAULT_LANGUAGE: Record<VibiProvider, string> = {
  elevenlabs: "es",
  minimax: "Spanish",
  capcut: "es",
};

export const VIBI_DEFAULT_MODEL: Record<VibiProvider, string> = {
  elevenlabs: "eleven_multilingual_v2",
  minimax: "speech-2.8-turbo",
  capcut: "",
};

export class VibiApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VibiApiError";
  }
}

async function vibiFetch<T>(path: string, apiKey: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${VIBI_BASE_URL}${path}`, {
      ...init,
      headers: {
        "xi-api-key": apiKey,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new VibiApiError("No se pudo conectar con Vibi. Revisa tu conexión.");
  }

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const record = (json ?? {}) as Record<string, unknown>;
    const message =
      (typeof record.message === "string" && record.message) ||
      (typeof record.detail === "string" && record.detail) ||
      (typeof record.error === "string" && record.error) ||
      `Vibi respondió con un error ${response.status}.`;
    throw new VibiApiError(message);
  }

  return (json ?? {}) as T;
}

export interface VibiTask {
  id: string;
  status: string;
  progress?: number;
  provider?: string;
  result?: { audio_url?: string } | null;
  error?: string | null;
  characters_used?: number | null;
  text?: string;
}

export interface VibiTtsBody {
  text: string;
  provider: VibiProvider;
  model_id?: string;
  language_code: string;
  voice_settings?: Record<string, unknown>;
}

export function vibiCreateTts(apiKey: string, voiceId: string, body: VibiTtsBody) {
  return vibiFetch<{ id: string; status: string }>(
    `/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function vibiGetTask(apiKey: string, taskId: string) {
  return vibiFetch<VibiTask>(`/v1/history/${encodeURIComponent(taskId)}`, apiKey);
}

export function vibiGetMe(apiKey: string) {
  return vibiFetch<{ credit_balance?: number; email?: string; name?: string }>(
    "/v1/auth/me",
    apiKey,
  );
}

export function vibiListLanguages(apiKey: string, provider: VibiProvider) {
  return vibiFetch<VibiLanguage[]>(`/v1/languages?provider=${provider}`, apiKey);
}

export function vibiListModels(apiKey: string, provider: VibiProvider) {
  return vibiFetch<VibiModel[]>(`/v1/models?provider=${provider}`, apiKey);
}

export async function vibiListVoices(
  apiKey: string,
  provider: VibiProvider,
  search?: string,
): Promise<VibiVoice[]> {
  const query = search?.trim() ? `&search=${encodeURIComponent(search.trim())}` : "";

  if (provider === "minimax") {
    const data = await vibiFetch<{
      voice_list?: {
        voice_id?: string;
        uniq_id?: string;
        voice_name?: string;
        description?: string;
        sample_audio?: string;
        cover_url?: string;
        tag_list?: string[];
      }[];
    }>(`/v1/minimax/system-voices?page=1&page_size=60${query}`, apiKey);

    return (data.voice_list ?? []).map((voice) => ({
      voice_id: String(voice.voice_id ?? voice.uniq_id ?? ""),
      name: voice.voice_name ?? String(voice.voice_id ?? ""),
      description: voice.description,
      preview_url: voice.sample_audio,
      gender: voice.tag_list?.find((tag) => tag === "Male" || tag === "Female"),
      language: voice.tag_list?.[0],
    }));
  }

  if (provider === "capcut") {
    const data = await vibiFetch<{
      voice_list?: {
        voice_id?: string;
        name?: string;
        language?: string;
        gender?: string;
        preview_url?: string;
      }[];
    }>(`/v1/capcut/system-voices?page=1&page_size=60${query}`, apiKey);

    return (data.voice_list ?? []).map((voice) => ({
      voice_id: String(voice.voice_id ?? ""),
      name: voice.name ?? String(voice.voice_id ?? ""),
      preview_url: voice.preview_url,
      gender: voice.gender,
      language: voice.language,
    }));
  }

  const data = await vibiFetch<{
    voices?: {
      voice_id?: string;
      name?: string;
      description?: string;
      preview_url?: string;
      gender?: string;
      language?: string;
    }[];
  }>(`/v1/default-voices?page_size=60${query}`, apiKey);

  return (data.voices ?? []).map((voice) => ({
    voice_id: String(voice.voice_id ?? ""),
    name: voice.name ?? String(voice.voice_id ?? ""),
    description: voice.description,
    preview_url: voice.preview_url,
    gender: voice.gender,
    language: voice.language,
  }));
}
