import "server-only";

import { decryptSecret } from "@/lib/crypto";
import { listCustomModelsForProvider } from "@/lib/data/custom-providers";
import { getApiKeyRow } from "@/lib/data/settings";
import { normalizeBaseUrl } from "@/lib/providers";
import { resolveProvider, type ResolvedProvider } from "@/lib/providers-server";
import type { ProviderKey } from "@/lib/types";

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

/** Devuelve la clave descifrada o `null` si el proveedor no tiene una guardada. */
async function getOptionalApiKey(userId: string, provider: ProviderKey) {
  const row = await getApiKeyRow(userId, provider);
  return row ? decryptSecret(row.encrypted_key) : null;
}

async function requireApiKey(userId: string, provider: ProviderKey) {
  const apiKey = await getOptionalApiKey(userId, provider);
  if (!apiKey) throw new Error("No hay una API key guardada para este proveedor.");
  return apiKey;
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

/**
 * Anthropic expone su catálogo en `/v1/models`, pero con cabeceras propias
 * (`x-api-key` y `anthropic-version`) en lugar de `Authorization: Bearer`, y
 * con paginación por cursor (`after_id`).
 */
async function listAnthropicModels(apiKey: string) {
  const base = "https://api.anthropic.com/v1/models?limit=1000";
  const ids: string[] = [];
  let afterId: string | null = null;

  for (let page = 0; page < 20; page += 1) {
    const url = afterId ? `${base}&after_id=${encodeURIComponent(afterId)}` : base;
    const json = await fetchJson(url, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });

    const list = json.data;
    if (!Array.isArray(list)) throw new Error("Respuesta inesperada del proveedor.");

    for (const item of list) {
      const entry = item as { id?: unknown };
      if (typeof entry.id === "string") ids.push(entry.id);
    }

    const hasMore = json.has_more === true;
    const lastId = typeof json.last_id === "string" ? json.last_id : null;
    if (!hasMore || !lastId) break;
    afterId = lastId;
  }

  return cleanModelIds(ids);
}

/** Consulta al proveedor si expone un endpoint de modelos. */
async function fetchRemoteModels(
  userId: string,
  provider: ProviderKey,
  resolved: ResolvedProvider,
): Promise<string[]> {
  // Proveedores compatibles con la API de OpenAI (gateways personalizados).
  if (resolved.openaiCompatible && resolved.baseURL) {
    const apiKey = (await getOptionalApiKey(userId, provider)) ?? "not-needed";
    return extractIds(
      await fetchWithKey(`${normalizeBaseUrl(resolved.baseURL)}/models`, apiKey),
      "data",
    );
  }

  switch (provider) {
    case "openai":
    case "deepseek":
    case "openrouter":
    case "google":
    case "anthropic": {
      const apiKey = await requireApiKey(userId, provider);
      if (provider === "anthropic") return listAnthropicModels(apiKey);
      if (provider === "openai") return listOpenAIModels(apiKey);
      if (provider === "deepseek") return listDeepSeekModels(apiKey);
      if (provider === "openrouter") return listOpenRouterModels(apiKey);
      return listGoogleModels(apiKey);
    }

    default:
      return [];
  }
}

/**
 * Combina los modelos manuales del usuario con los que devuelve el proveedor.
 * Si la consulta automática falla, igualmente devuelve los modelos manuales.
 */
export async function listModelsForProvider(userId: string, provider: ProviderKey) {
  const resolved = await resolveProvider(userId, provider);
  if (!resolved) throw new Error("El proveedor no existe o fue eliminado.");

  const manual = await listCustomModelsForProvider(userId, provider);

  let remote: string[] = [];
  try {
    remote = await fetchRemoteModels(userId, provider, resolved);
  } catch {
    // El listado automático no está disponible: nos quedamos con los manuales.
  }

  return cleanModelIds([...manual, ...remote]);
}
