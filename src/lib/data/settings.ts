import "server-only";

import { decryptSecret, maskSecret } from "@/lib/crypto";
import { prisma, serializeDates } from "@/lib/db";
import type { ApiKeyRow, ApiKeySummary, ProviderKey, UserSettings } from "@/lib/types";

export async function getSettings(userId: string): Promise<UserSettings> {
  const row = await prisma.settings.findUnique({ where: { user_id: userId } });

  if (row) {
    return {
      user_id: row.user_id,
      default_provider: row.default_provider as ProviderKey,
      default_model: row.default_model,
      updated_at: row.updated_at.toISOString(),
    };
  }

  return {
    user_id: userId,
    default_provider: "openai",
    default_model: "",
    updated_at: new Date().toISOString(),
  };
}

export async function getApiKeyRow(
  userId: string,
  provider: ProviderKey,
): Promise<ApiKeyRow | null> {
  const row = await prisma.apiKey.findFirst({
    where: { user_id: userId, provider },
  });

  return row ? (serializeDates(row) as ApiKeyRow) : null;
}

export async function listApiKeyRows(userId: string): Promise<ApiKeyRow[]> {
  const rows = await prisma.apiKey.findMany({
    where: { user_id: userId },
    orderBy: { provider: "asc" },
  });

  return serializeDates(rows) as ApiKeyRow[];
}

export async function listConfiguredProviders(userId: string): Promise<ProviderKey[]> {
  const rows = await listApiKeyRows(userId);
  return rows.map((row) => row.provider);
}

/** Resumen de claves configuradas con la clave enmascarada (nunca completa). */
export async function listApiKeySummaries(userId: string): Promise<ApiKeySummary[]> {
  const rows = await listApiKeyRows(userId);

  return rows
    .map((row) => {
      let masked = "••••••••";

      try {
        masked = maskSecret(decryptSecret(row.encrypted_key));
      } catch {
        // Si el secreto de cifrado cambió, no podemos mostrarla.
      }

      return { provider: row.provider, masked, updated_at: row.updated_at };
    })
    .sort((a, b) => a.provider.localeCompare(b.provider));
}
