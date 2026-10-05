import "server-only";

import { prisma, serializeDates } from "@/lib/db";
import type { Profile, ProfileType } from "@/lib/types";

export async function listProfiles(
  userId: string,
  type?: ProfileType,
): Promise<Profile[]> {
  const rows = await prisma.profile.findMany({
    where: { user_id: userId, ...(type ? { type } : {}) },
    orderBy: { name: "asc" },
  });

  return serializeDates(rows) as Profile[];
}

export async function getProfile(userId: string, id: string): Promise<Profile | null> {
  const row = await prisma.profile.findFirst({
    where: { id, user_id: userId },
  });

  return row ? (serializeDates(row) as Profile) : null;
}
