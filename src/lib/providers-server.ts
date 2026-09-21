import "server-only";

import { listCustomProviders, getCustomProvider } from "@/lib/data/custom-providers";
import {
  customProviderId,
  isProviderId,
  PROVIDERS,
  PROVIDER_IDS,
  toCustomProviderKey,
} from "@/lib/providers";
import type { ProviderKey, ProviderOption } from "@/lib/types";

export interface ResolvedProvider {
  key: ProviderKey;
  label: string;
  baseURL?: string;
  openaiCompatible: boolean;
  defaultModel: string;
  suggestedModels: string[];
  custom: boolean;
}

/** Resuelve un proveedor integrado o personalizado del usuario a datos usables. */
export async function resolveProvider(
  userId: string,
  key: ProviderKey,
): Promise<ResolvedProvider | null> {
  if (isProviderId(key)) {
    const info = PROVIDERS[key];
    return {
      key,
      label: info.label,
      baseURL: info.baseURL,
      openaiCompatible: Boolean(info.openaiCompatible),
      defaultModel: info.defaultModel,
      suggestedModels: info.suggestedModels,
      custom: false,
    };
  }

  const id = customProviderId(key);
  if (!id) return null;

  const custom = await getCustomProvider(userId, id);
  if (!custom) return null;

  return {
    key,
    label: custom.name,
    baseURL: custom.base_url,
    openaiCompatible: true,
    defaultModel: custom.default_model,
    suggestedModels: [],
    custom: true,
  };
}

/** Lista de proveedores (integrados + personalizados) para los selectores de la UI. */
export async function listProviderOptions(userId: string): Promise<ProviderOption[]> {
  const customs = await listCustomProviders(userId);

  return [
    ...PROVIDER_IDS.map((id) => ({
      key: id,
      label: PROVIDERS[id].label,
      defaultModel: PROVIDERS[id].defaultModel,
      suggestedModels: PROVIDERS[id].suggestedModels,
      custom: false,
    })),
    ...customs.map((custom) => ({
      key: toCustomProviderKey(custom.id),
      label: custom.name,
      defaultModel: custom.default_model,
      suggestedModels: [] as string[],
      custom: true,
    })),
  ];
}
