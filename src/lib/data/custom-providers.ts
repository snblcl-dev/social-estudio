import "server-only";

import { prisma, serializeDates } from "@/lib/db";
import type { CustomModel, CustomProvider, ProviderKey } from "@/lib/types";

export async function listCustomProviders(userId: string): Promise<CustomProvider[]> {
  const rows = await prisma.customProvider.findMany({
    where: { user_id: userId },
    orderBy: { name: "asc" },
  });

  return serializeDates(rows) as CustomProvider[];
}

export async function getCustomProvider(
  userId: string,
  id: string,
): Promise<CustomProvider | null> {
  const row = await prisma.customProvider.findFirst({
    where: { id, user_id: userId },
  });

  return row ? (serializeDates(row) as CustomProvider) : null;
}

export async function listCustomModels(userId: string): Promise<CustomModel[]> {
  const rows = await prisma.customModel.findMany({
    where: { user_id: userId },
    orderBy: [{ provider: "asc" }, { model: "asc" }],
  });

  return serializeDates(rows) as CustomModel[];
}

export async function listCustomModelsForProvider(
  userId: string,
  provider: ProviderKey,
): Promise<string[]> {
  const rows = await prisma.customModel.findMany({
    where: { user_id: userId, provider },
    orderBy: { model: "asc" },
    select: { model: true },
  });

  return rows.map((row) => row.model);
}
