"use server";

import { revalidatePath } from "next/cache";

import { clearFishApiKey, saveFishApiKey } from "@/lib/data/fish";
import { getCurrentUser } from "@/lib/session";

export interface FishActionResult {
  error?: string;
  ok?: boolean;
}

export async function saveFishKey(input: { apiKey: string }): Promise<FishActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const rawKey = input.apiKey?.trim() ?? "";
  if (rawKey.length < 8) {
    return { error: "Esa clave parece demasiado corta." };
  }

  try {
    await saveFishApiKey(user.id, rawKey);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar la clave." };
  }

  revalidatePath("/ajustes");
  return { ok: true };
}

export async function deleteFishKey(): Promise<FishActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  try {
    await clearFishApiKey(user.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo borrar la clave." };
  }

  revalidatePath("/ajustes");
  return { ok: true };
}
