import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

import { decryptSecret } from "@/lib/crypto";
import { getApiKeyRow } from "@/lib/data/settings";
import { normalizeModel, PROVIDERS } from "@/lib/providers";
import type { ProviderId } from "@/lib/types";

export class MissingApiKeyError extends Error {
  constructor(provider: ProviderId) {
    super(`No hay una API key guardada para ${PROVIDERS[provider].label}. Añádela en Ajustes.`);
    this.name = "MissingApiKeyError";
  }
}

/** Construye una instancia de modelo del AI SDK para el proveedor indicado. */
export function buildModel(provider: ProviderId, model: string, apiKey: string): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "google":
      return createGoogle({ apiKey })(model);
    case "deepseek":
      return createDeepSeek({ apiKey })(model);
    case "openrouter":
      return createOpenRouter({ apiKey })(model);
    default: {
      const exhaustive: never = provider;
      throw new Error(`Proveedor no soportado: ${exhaustive}`);
    }
  }
}

/** Resuelve el modelo a usar para un usuario, leyendo y descifrando su API key. */
export async function resolveModelForUser(
  userId: string,
  provider: ProviderId,
  model: string | null | undefined,
): Promise<LanguageModel> {
  const row = await getApiKeyRow(userId, provider);

  if (!row) {
    throw new MissingApiKeyError(provider);
  }

  const apiKey = decryptSecret(row.encrypted_key);

  return buildModel(provider, normalizeModel(provider, model), apiKey);
}
