import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  extractReasoningMiddleware,
  wrapLanguageModel,
  type LanguageModel,
} from "ai";

import { decryptSecret } from "@/lib/crypto";
import { getApiKeyRow } from "@/lib/data/settings";
import { normalizeModel } from "@/lib/providers";
import { resolveProvider, type ResolvedProvider } from "@/lib/providers-server";
import { toOpenRouterEffort } from "@/lib/reasoning";
import type { ProviderKey, ReasoningEffort } from "@/lib/types";

export class MissingApiKeyError extends Error {
  constructor(label: string) {
    super(`No hay una API key guardada para ${label}. Añádela en Ajustes.`);
    this.name = "MissingApiKeyError";
  }
}

/** Modelo aceptado por `wrapLanguageModel` (V2/V3/V4 del AI SDK). */
type WrappableLanguageModel = Parameters<typeof wrapLanguageModel>[0]["model"];

/** Construye una instancia de modelo del AI SDK para el proveedor indicado. */
export function buildModel(
  provider: ProviderKey,
  model: string,
  apiKey: string,
  baseURL?: string,
  effort?: ReasoningEffort,
): LanguageModel {
  const base = buildBaseModel(provider, model, apiKey, baseURL, effort);

  // Algunos modelos escriben su razonamiento como texto con etiquetas
  // `<think>` / `<thinking>`. El middleware lo separa en partes `reasoning`
  // para poder mostrarlo u ocultarlo en la interfaz.
  const middleware = [
    extractReasoningMiddleware({ tagName: "think" }),
    extractReasoningMiddleware({ tagName: "thinking" }),
  ];

  return wrapLanguageModel({ model: base, middleware });
}

function buildBaseModel(
  provider: ProviderKey,
  model: string,
  apiKey: string,
  baseURL?: string,
  effort?: ReasoningEffort,
): WrappableLanguageModel {
  // Proveedores compatibles con la API de OpenAI (gateways personalizados).
  // Se usa el provider específico porque reconoce los campos nativos de
  // razonamiento (`reasoning` / `reasoning_content`) y siempre envía el rol
  // `system` (nunca `developer`, que estos gateways rechazan).
  if (baseURL) {
    return createOpenAICompatible({
      name: provider,
      apiKey,
      baseURL,
      includeUsage: true,
    }).chatModel(model);
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
    case "openrouter": {
      // OpenRouter no lee la opción unificada `reasoning`; se configura aquí.
      const orEffort = toOpenRouterEffort(effort);
      return createOpenRouter({ apiKey })(
        model,
        orEffort ? { reasoning: { effort: orEffort } } : undefined,
      );
    }
    default:
      throw new Error(`Proveedor no soportado: ${provider}`);
  }
}

/** Resuelve el modelo a usar para un usuario, leyendo y descifrando su API key. */
export async function resolveModelForUser(
  userId: string,
  provider: ProviderKey,
  model: string | null | undefined,
  effort?: ReasoningEffort,
): Promise<LanguageModel> {
  const resolved = await resolveProvider(userId, provider);

  if (!resolved) {
    throw new Error("El proveedor seleccionado no existe o fue eliminado.");
  }

  const row = await getApiKeyRow(userId, provider);

  // Los endpoints personalizados pueden funcionar sin clave (por ejemplo, un
  // servidor local). Si no hay clave guardada, enviamos un marcador.
  if (resolved.custom && !row) {
    return buildResolved(resolved, model, "not-needed", effort);
  }

  if (!row) {
    throw new MissingApiKeyError(resolved.label);
  }

  return buildResolved(resolved, model, decryptSecret(row.encrypted_key), effort);
}

function buildResolved(
  resolved: ResolvedProvider,
  model: string | null | undefined,
  apiKey: string,
  effort?: ReasoningEffort,
): LanguageModel {
  const finalModel = normalizeModel(resolved.key, model, resolved.defaultModel);
  if (!finalModel) {
    throw new Error(`Selecciona un modelo para ${resolved.label}.`);
  }
  return buildModel(resolved.key, finalModel, apiKey, resolved.baseURL, effort);
}
