import "server-only";

import type { VibiLanguage, VibiModel, VibiVoice } from "@/lib/types";

const FISH_BASE_URL = (process.env.FISH_API_BASE_URL ?? "https://api.fish.audio").replace(
  /\/+$/,
  "",
);

/** Modelos TTS de Fish Audio. Se envían en la cabecera `model`. */
export const FISH_TTS_MODELS: VibiModel[] = [
  { model_id: "s2.1-pro-free", name: "S2.1 Pro (gratis)" },
  { model_id: "s2.1-pro", name: "S2.1 Pro" },
  { model_id: "s2-pro", name: "S2 Pro" },
  { model_id: "drama-3", name: "Drama 3" },
];

export const FISH_DEFAULT_MODEL = "s2.1-pro-free";

/** Idiomas admitidos por la normalización de texto de Fish Audio (BCP-47). */
export const FISH_LANGUAGES: VibiLanguage[] = [
  { code: "es", name: "Español (España)" },
  { code: "es-MX", name: "Español (México)" },
  { code: "en", name: "Inglés" },
  { code: "en-US", name: "Inglés (EE. UU.)" },
  { code: "pt-BR", name: "Portugués (Brasil)" },
  { code: "fr", name: "Francés" },
  { code: "de", name: "Alemán" },
  { code: "it", name: "Italiano" },
  { code: "ja", name: "Japonés" },
  { code: "ko", name: "Coreano" },
  { code: "zh-CN", name: "Chino simplificado" },
  { code: "zh-TW", name: "Chino tradicional" },
  { code: "ru", name: "Ruso" },
  { code: "ar", name: "Árabe" },
  { code: "tr", name: "Turco" },
  { code: "tl", name: "Tagalo" },
];

export class FishApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FishApiError";
  }
}

interface FishModelSample {
  audio?: string;
  url?: string;
  audio_url?: string;
  path?: string;
}

interface FishModel {
  _id?: string;
  title?: string;
  description?: string;
  languages?: string[];
  samples?: FishModelSample[];
}

interface FishListResponse {
  items?: FishModel[];
  has_more?: boolean;
}

const OWN_PAGE_SIZE = 100;
const MAX_OWN_PAGES = 5;
const PUBLIC_PAGE_SIZE = 50;

function readErrorMessage(text: string, status: number): string {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const message =
      (typeof json.message === "string" && json.message) ||
      (typeof json.reason === "string" && json.reason) ||
      (typeof json.detail === "string" && json.detail) ||
      (typeof json.error === "string" && json.error);
    if (message) return message;
  } catch {
    // La respuesta no era JSON.
  }

  return `Fish Audio respondió con un error ${status}.`;
}

async function fishFetch<T>(path: string, apiKey: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${FISH_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    throw new FishApiError("No se pudo conectar con Fish Audio. Revisa tu conexión.");
  }

  const text = await response.text();
  if (!response.ok) {
    throw new FishApiError(readErrorMessage(text, response.status));
  }

  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new FishApiError("Fish Audio devolvió una respuesta inválida.");
  }
}

export interface FishTtsInput {
  text: string;
  voiceId: string;
  ttsModel: string;
  language: string;
  speed: number;
}

/** Genera el audio del texto y devuelve los bytes MP3. */
export async function fishCreateTts(
  apiKey: string,
  input: FishTtsInput,
): Promise<Uint8Array> {
  let response: Response;

  try {
    response = await fetch(`${FISH_BASE_URL}/v1/tts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model: input.ttsModel,
      },
      body: JSON.stringify({
        text: input.text,
        reference_id: input.voiceId,
        format: "mp3",
        mp3_bitrate: 128,
        language: input.language || undefined,
        prosody: { speed: input.speed },
        normalize: true,
        latency: "normal",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(180_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new FishApiError("Fish Audio tardó demasiado en responder.");
    }
    throw new FishApiError("No se pudo conectar con Fish Audio. Revisa tu conexión.");
  }

  if (!response.ok) {
    throw new FishApiError(readErrorMessage(await response.text(), response.status));
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new FishApiError("Fish Audio devolvió un audio vacío.");
  }

  return new Uint8Array(buffer);
}

function samplePreviewUrl(samples: FishModelSample[] | undefined): string | undefined {
  const sample = samples?.[0];
  if (!sample) return undefined;
  return sample.audio ?? sample.url ?? sample.audio_url ?? sample.path;
}

function toVoice(model: FishModel, cloned: boolean): VibiVoice {
  return {
    voice_id: String(model._id ?? ""),
    name: model.title ?? String(model._id ?? ""),
    description: model.description || undefined,
    preview_url: samplePreviewUrl(model.samples),
    language: model.languages?.[0],
    cloned,
  };
}

async function listOwnVoices(apiKey: string): Promise<VibiVoice[]> {
  const voices: VibiVoice[] = [];

  for (let page = 1; page <= MAX_OWN_PAGES; page += 1) {
    const data = await fishFetch<FishListResponse>(
      `/model?self=true&page_size=${OWN_PAGE_SIZE}&page_number=${page}`,
      apiKey,
    );

    const items = data.items ?? [];
    voices.push(...items.map((model) => toVoice(model, true)));

    if (!data.has_more || items.length === 0) break;
  }

  return voices.filter((voice) => voice.voice_id);
}

async function listPublicVoices(apiKey: string, search?: string): Promise<VibiVoice[]> {
  const params = new URLSearchParams({
    page_size: String(PUBLIC_PAGE_SIZE),
    page_number: "1",
    sort_by: "score",
  });

  if (search?.trim()) {
    params.set("title", search.trim());
  }

  const data = await fishFetch<FishListResponse>(`/model?${params.toString()}`, apiKey);

  return (data.items ?? []).map((model) => toVoice(model, false)).filter((voice) => voice.voice_id);
}

/**
 * Devuelve las voces propias del usuario seguidas de la biblioteca pública.
 * La búsqueda se aplica en el servidor de Fish sobre el título del modelo.
 */
export async function fishListVoices(
  apiKey: string,
  options?: { search?: string },
): Promise<VibiVoice[]> {
  const [own, publicVoices] = await Promise.all([
    listOwnVoices(apiKey),
    listPublicVoices(apiKey, options?.search),
  ]);

  const seen = new Set<string>();
  const merged: VibiVoice[] = [];

  for (const voice of [...own, ...publicVoices]) {
    if (!voice.voice_id || seen.has(voice.voice_id)) continue;
    seen.add(voice.voice_id);
    merged.push(voice);
  }

  return merged;
}
