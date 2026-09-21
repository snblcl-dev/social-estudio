import type {
  CustomProviderKey,
  ProviderId,
  ProviderInfo,
  ProviderKey,
} from "@/lib/types";

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    hint: "Consigue tu clave en platform.openai.com/api-keys",
    keyPlaceholder: "sk-...",
    defaultModel: "gpt-4o-mini",
    suggestedModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    hint: "Consigue tu clave en console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-...",
    defaultModel: "claude-sonnet-4-5",
    suggestedModels: [
      "claude-sonnet-4-5",
      "claude-opus-4-5",
      "claude-haiku-4-5",
      "claude-sonnet-4-0",
    ],
  },
  google: {
    id: "google",
    label: "Google (Gemini)",
    hint: "Consigue tu clave en aistudio.google.com/apikey",
    keyPlaceholder: "AIza...",
    defaultModel: "gemini-2.5-flash",
    suggestedModels: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    hint: "Consigue tu clave en platform.deepseek.com/api_keys",
    keyPlaceholder: "sk-...",
    defaultModel: "deepseek-flash",
    suggestedModels: ["deepseek-flash", "deepseek-v4-pro"],
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    hint: "Consigue tu clave en openrouter.ai/keys. Da acceso a cientos de modelos.",
    keyPlaceholder: "sk-or-...",
    defaultModel: "openai/gpt-4o-mini",
    suggestedModels: [
      "openai/gpt-4o-mini",
      "anthropic/claude-sonnet-4.5",
      "google/gemini-2.5-flash",
      "deepseek/deepseek-chat",
      "meta-llama/llama-3.3-70b-instruct",
    ],
  },
  airai: {
    id: "airai",
    label: "AIRAI",
    hint: "Introduce tu clave de api.airai.cc",
    keyPlaceholder: "sk-...",
    baseURL: "https://api.airai.cc/v1",
    openaiCompatible: true,
    defaultModel: "deepseek-v4-flash",
    suggestedModels: ["deepseek-v4-flash", "deepseek-v4.1-flash", "claude-sonnet-4-6"],
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export const CUSTOM_PROVIDER_PREFIX = "custom:";

export function isProviderId(value: string): value is ProviderId {
  return value in PROVIDERS;
}

/** `true` si la clave corresponde a un proveedor personalizado (`custom:<uuid>`). */
export function isCustomProviderKey(value: string): value is CustomProviderKey {
  return (
    value.startsWith(CUSTOM_PROVIDER_PREFIX) &&
    value.length > CUSTOM_PROVIDER_PREFIX.length
  );
}

/** `true` si la clave identifica a un proveedor integrado o personalizado. */
export function isProviderKey(value: string): value is ProviderKey {
  return isProviderId(value) || isCustomProviderKey(value);
}

export function toCustomProviderKey(id: string): CustomProviderKey {
  return `${CUSTOM_PROVIDER_PREFIX}${id}`;
}

/** Extrae el uuid de la fila `custom_providers` a partir de la clave. */
export function customProviderId(key: string): string | null {
  return isCustomProviderKey(key)
    ? key.slice(CUSTOM_PROVIDER_PREFIX.length)
    : null;
}

export function getProvider(provider: ProviderId) {
  return PROVIDERS[provider];
}

/** Quita espacios y barras finales de una URL base de proveedor. */
export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

const FALLBACK_MODEL = "gpt-4o-mini";

export function normalizeModel(
  provider: ProviderKey,
  model: string | null | undefined,
  fallback = FALLBACK_MODEL,
) {
  const trimmed = model?.trim();
  if (trimmed) return trimmed;
  if (isProviderId(provider)) return PROVIDERS[provider].defaultModel;
  return fallback;
}
