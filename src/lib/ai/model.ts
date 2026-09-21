import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

import { decryptSecret } from "@/lib/crypto";
import { getApiKeyRow } from "@/lib/data/settings";
import { normalizeModel } from "@/lib/providers";
import { resolveProvider, type ResolvedProvider } from "@/lib/providers-server";
import type { ProviderKey } from "@/lib/types";

export class MissingApiKeyError extends Error {
  constructor(label: string) {
    super(`No hay una API key guardada para ${label}. Añádela en Ajustes.`);
    this.name = "MissingApiKeyError";
  }
}

/** Construye una instancia de modelo del AI SDK para el proveedor indicado. */
export function buildModel(
  provider: ProviderKey,
  model: string,
  apiKey: string,
  baseURL?: string,
): LanguageModel {
  // Proveedores compatibles con la API de OpenAI (gateways personalizados).
  // Se usa Chat Completions porque es lo que exponen estos servicios.
  if (baseURL) {
    return createOpenAI({ apiKey, baseURL, name: provider }).chat(model);
  }

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
    default:
      throw new Error(`Proveedor no soportado: ${provider}`);
  }
}

/** Resuelve el modelo a usar para un usuario, leyendo y descifrando su API key. */
export async function resolveModelForUser(
  userId: string,
  provider: ProviderKey,
  model: string | null | undefined,
): Promise<LanguageModel> {
  const resolved = await resolveProvider(userId, provider);

  if (!resolved) {
    throw new Error("El proveedor seleccionado no existe o fue eliminado.");
  }

  const row = await getApiKeyRow(userId, provider);

  // Los endpoints personalizados pueden funcionar sin clave (por ejemplo, un
  // servidor local). Si no hay clave guardada, enviamos un marcador.
  if (resolved.custom && !row) {
    return buildResolved(resolved, model, "not-needed");
  }

  if (!row) {
    throw new MissingApiKeyError(resolved.label);
  }

  return buildResolved(resolved, model, decryptSecret(row.encrypted_key));
}

function buildResolved(
  resolved: ResolvedProvider,
  model: string | null | undefined,
  apiKey: string,
): LanguageModel {
  const finalModel = normalizeModel(resolved.key, model, resolved.defaultModel);
  if (!finalModel) {
    throw new Error(`Selecciona un modelo para ${resolved.label}.`);
  }
  return buildModel(resolved.key, finalModel, apiKey, resolved.baseURL);
}
