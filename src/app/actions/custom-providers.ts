"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { encryptSecret } from "@/lib/crypto";
import { getCustomProvider } from "@/lib/data/custom-providers";
import { prisma } from "@/lib/db";
import { isProviderKey, normalizeBaseUrl, toCustomProviderKey } from "@/lib/providers";
import { getCurrentUser } from "@/lib/session";

export interface CustomActionResult {
  error?: string;
  ok?: boolean;
  id?: string;
}

function revalidateProviders() {
  revalidatePath("/ajustes");
  revalidatePath("/");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo guardar el cambio.";
}

const providerSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre al proveedor.").max(80),
  baseUrl: z.string().trim().url("La URL base no es válida."),
  defaultModel: z.string().trim().max(200).optional(),
  apiKey: z.string().optional(),
});

export type SaveCustomProviderInput = z.input<typeof providerSchema> & { id?: string };

export async function saveCustomProvider(
  input: SaveCustomProviderInput,
): Promise<CustomActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = providerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const baseUrl = normalizeBaseUrl(parsed.data.baseUrl);
  const defaultModel = parsed.data.defaultModel?.trim() ?? "";
  const rawKey = parsed.data.apiKey?.trim() ?? "";

  let providerId = input.id?.trim() || "";

  try {
    if (providerId) {
      const existing = await getCustomProvider(user.id, providerId);
      if (!existing) return { error: "El proveedor no existe." };

      await prisma.customProvider.updateMany({
        where: { id: providerId, user_id: user.id },
        data: { name: parsed.data.name, base_url: baseUrl, default_model: defaultModel },
      });
    } else {
      const created = await prisma.customProvider.create({
        data: {
          user_id: user.id,
          name: parsed.data.name,
          base_url: baseUrl,
          default_model: defaultModel,
        },
        select: { id: true },
      });
      providerId = created.id;
    }

    if (rawKey) {
      if (rawKey.length < 8) {
        return { error: "Esa clave parece demasiado corta." };
      }

      const encrypted_key = encryptSecret(rawKey);
      const provider = toCustomProviderKey(providerId);

      await prisma.apiKey.upsert({
        where: { user_id_provider: { user_id: user.id, provider } },
        create: { user_id: user.id, provider, encrypted_key },
        update: { encrypted_key },
      });
    }
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidateProviders();
  return { ok: true, id: providerId };
}

export async function deleteCustomProvider(id: string): Promise<CustomActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const existing = await getCustomProvider(user.id, id);
  if (!existing) return { error: "El proveedor no existe." };

  const providerKey = toCustomProviderKey(id);

  try {
    await prisma.$transaction([
      prisma.customModel.deleteMany({ where: { user_id: user.id, provider: providerKey } }),
      prisma.apiKey.deleteMany({ where: { user_id: user.id, provider: providerKey } }),
      prisma.customProvider.deleteMany({ where: { id, user_id: user.id } }),
    ]);
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidateProviders();
  return { ok: true };
}

const modelSchema = z.object({
  provider: z.string(),
  model: z.string().trim().min(1, "Escribe el identificador del modelo.").max(200),
});

export type SaveCustomModelInput = z.input<typeof modelSchema>;

export async function saveCustomModel(
  input: SaveCustomModelInput,
): Promise<CustomActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = modelSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  if (!isProviderKey(parsed.data.provider)) {
    return { error: "Proveedor inválido." };
  }

  try {
    await prisma.customModel.upsert({
      where: {
        user_id_provider_model: {
          user_id: user.id,
          provider: parsed.data.provider,
          model: parsed.data.model,
        },
      },
      create: {
        user_id: user.id,
        provider: parsed.data.provider,
        model: parsed.data.model,
      },
      update: {},
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidateProviders();
  return { ok: true };
}

export async function deleteCustomModel(id: string): Promise<CustomActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  try {
    await prisma.customModel.deleteMany({
      where: { id, user_id: user.id },
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidateProviders();
  return { ok: true };
}
