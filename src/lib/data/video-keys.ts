import "server-only";

import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import type { VideoKeySummary } from "@/lib/types";

function envKeyFor(provider: string): string | null {
  if (provider === "klinggiare") {
    return process.env.KLING_API_KEY?.trim() || null;
  }
  if (provider === "magnific") {
    return process.env.MAGNIFIC_API_KEY?.trim() || null;
  }
  return null;
}

/** Devuelve la clave del proveedor: primero la guardada por el usuario, luego el entorno. */
export async function getVideoApiKey(
  userId: string,
  provider: string,
): Promise<string | null> {
  const row = await prisma.videoProviderKey.findUnique({
    where: { user_id_provider: { user_id: userId, provider } },
  });

  if (row?.encrypted_key) {
    try {
      return decryptSecret(row.encrypted_key);
    } catch {
      // Si no se puede descifrar, se intenta la variable de entorno.
    }
  }

  return envKeyFor(provider);
}

export async function getVideoKeySummary(
  userId: string,
  provider: string,
): Promise<VideoKeySummary | null> {
  const row = await prisma.videoProviderKey.findUnique({
    where: { user_id_provider: { user_id: userId, provider } },
  });

  if (row?.encrypted_key) {
    try {
      return { masked: maskSecret(decryptSecret(row.encrypted_key)), source: "user" };
    } catch {
      // Sigue con la variable de entorno.
    }
  }

  const envKey = envKeyFor(provider);
  if (envKey) return { masked: maskSecret(envKey), source: "env" };

  return null;
}

export async function saveVideoApiKey(
  userId: string,
  provider: string,
  apiKey: string,
): Promise<void> {
  const encrypted = encryptSecret(apiKey);

  await prisma.videoProviderKey.upsert({
    where: { user_id_provider: { user_id: userId, provider } },
    create: { user_id: userId, provider, encrypted_key: encrypted },
    update: { encrypted_key: encrypted },
  });
}

export async function clearVideoApiKey(userId: string, provider: string): Promise<void> {
  await prisma.videoProviderKey.deleteMany({ where: { user_id: userId, provider } });
}
