import "server-only";

import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";

/** Devuelve la clave de Fish Audio descifrada o `null` si no hay ninguna guardada. */
export async function getFishApiKey(userId: string): Promise<string | null> {
  const row = await prisma.settings.findUnique({
    where: { user_id: userId },
    select: { fish_api_key: true },
  });

  if (!row?.fish_api_key) return null;

  try {
    return decryptSecret(row.fish_api_key);
  } catch {
    return null;
  }
}

/** Resumen de la clave guardada (enmascarada) para mostrar en Ajustes. */
export async function getFishKeySummary(
  userId: string,
): Promise<{ masked: string } | null> {
  const apiKey = await getFishApiKey(userId);
  if (!apiKey) return null;
  return { masked: maskSecret(apiKey) };
}

export async function saveFishApiKey(userId: string, apiKey: string): Promise<void> {
  const encrypted = encryptSecret(apiKey);

  await prisma.settings.upsert({
    where: { user_id: userId },
    create: { user_id: userId, fish_api_key: encrypted },
    update: { fish_api_key: encrypted },
  });
}

export async function clearFishApiKey(userId: string): Promise<void> {
  await prisma.settings.updateMany({
    where: { user_id: userId },
    data: { fish_api_key: null },
  });
}
