import type { ProviderId, ProviderInfo } from "@/lib/types";

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
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProviderId(value: string): value is ProviderId {
  return value in PROVIDERS;
}

export function getProvider(provider: ProviderId) {
  return PROVIDERS[provider];
}

const FALLBACK_MODEL = "gpt-4o-mini";

export function normalizeModel(provider: ProviderId, model: string | null | undefined) {
  const trimmed = model?.trim();
  return trimmed ? trimmed : (PROVIDERS[provider]?.defaultModel ?? FALLBACK_MODEL);
}
