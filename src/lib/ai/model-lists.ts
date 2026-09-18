import "server-only";

import { decryptSecret } from "@/lib/crypto";
import { getApiKeyRow } from "@/lib/data/settings";
import type { ProviderId } from "@/lib/types";

const EXCLUDED_PATTERNS = [
  /embedding/i,
  /image/i,
  /audio/i,
  /tts/i,
  /whisper/i,
  /moderation/i,
  /realtime/i,
  /rerank/i,
  /video/i,
  /reward/i,
  /^davinci/i,
  /^babbage/i,
  /^curie/i,
  /^ada/i,
];

function cleanModelIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of ids) {
    const id = raw.trim();
    if (!id) continue;
    if (EXCLUDED_PATTERNS.some((pattern) => pattern.test(id))) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result.sort((a, b) => a.localeCompare(b));
}

async function fetchJson(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", ...(options?.headers ?? {}) },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Error ${response.status} al consultar los modelos.`);
  }

  return (await response.json()) as Record<string, unknown>;
}

function fetchWithKey(url: string, apiKey: string) {
  return fetchJson(url, { headers: { Authorization: `Bearer ${apiKey}` } });
}

function extractIds(json: Record<string, unknown>, key: "data" | "models") {
  const list = json[key];
  if (!Array.isArray(list)) throw new Error("Respuesta inesperada del proveedor.");

  return cleanModelIds(
    list
      .map((item) => {
        const entry = item as { id?: unknown; name?: unknown };
        return typeof entry.id === "string"
          ? entry.id
          : typeof entry.name === "string"
            ? entry.name.replace(/^models\//, "")
            : "";
      })
      .filter(Boolean),
  );
}

async function listOpenAIModels(apiKey: string) {
  return extractIds(
    await fetchWithKey("https://api.openai.com/v1/models", apiKey),
    "data",
  );
}

async function listDeepSeekModels(apiKey: string) {
  return extractIds(
    await fetchWithKey("https://api.deepseek.com/models", apiKey),
    "data",
  );
}

async function listOpenRouterModels(apiKey: string) {
  return extractIds(
    await fetchWithKey("https://openrouter.ai/api/v1/models", apiKey),
    "data",
  );
}

async function listGoogleModels(apiKey: string) {
  const json = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
  );
  return extractIds(json, "models");
}

export async function listModelsForProvider(userId: string, provider: ProviderId) {
  switch (provider) {
    case "anthropic":
      // Anthropic no expone un endpoint público para listar modelos.
      return [] as string[];

    case "openai":
    case "deepseek":
    case "openrouter":
    case "google": {
      const row = await getApiKeyRow(userId, provider);

      if (!row) {
        throw new Error(`No hay una API key guardada para este proveedor.`);
      }

      const apiKey = decryptSecret(row.encrypted_key);

      if (provider === "openai") return listOpenAIModels(apiKey);
      if (provider === "deepseek") return listDeepSeekModels(apiKey);
      if (provider === "openrouter") return listOpenRouterModels(apiKey);
      return listGoogleModels(apiKey);
    }

    default: {
      const exhaustive: never = provider;
      throw new Error(`Proveedor no soportado: ${exhaustive}`);
    }
  }
}
