"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { isProviderKey } from "@/lib/providers";
import { getCurrentUser } from "@/lib/session";

const settingsSchema = z.object({
  default_provider: z.string(),
  default_model: z.string().trim().max(200),
});

export interface SettingsInput {
  default_provider: string;
  default_model: string;
}

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

function revalidateSettings() {
  revalidatePath("/ajustes");
  revalidatePath("/");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo guardar el cambio.";
}

export async function saveSettings(input: SettingsInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  if (!isProviderKey(parsed.data.default_provider)) {
    return { error: "Proveedor por defecto inválido." };
  }

  try {
    await prisma.settings.upsert({
      where: { user_id: user.id },
      create: {
        user_id: user.id,
        default_provider: parsed.data.default_provider,
        default_model: parsed.data.default_model,
      },
      update: {
        default_provider: parsed.data.default_provider,
        default_model: parsed.data.default_model,
      },
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidateSettings();
  return { ok: true };
}

export async function saveApiKey(input: {
  provider: string;
  apiKey: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  if (!isProviderKey(input.provider)) {
    return { error: "Proveedor inválido." };
  }

  const rawKey = input.apiKey.trim();
  if (rawKey.length < 8) {
    return { error: "Esa clave parece demasiado corta." };
  }

  try {
    const encrypted_key = encryptSecret(rawKey);
    await prisma.apiKey.upsert({
      where: { user_id_provider: { user_id: user.id, provider: input.provider } },
      create: { user_id: user.id, provider: input.provider, encrypted_key },
      update: { encrypted_key },
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidateSettings();
  return { ok: true };
}

export async function deleteApiKey(provider: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  if (!isProviderKey(provider)) {
    return { error: "Proveedor inválido." };
  }

  try {
    await prisma.apiKey.deleteMany({
      where: { user_id: user.id, provider },
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidateSettings();
  return { ok: true };
}
