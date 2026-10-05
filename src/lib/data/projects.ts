import "server-only";

import { prisma, serializeDates } from "@/lib/db";
import type { Project } from "@/lib/types";

export async function listProjects(userId: string): Promise<Project[]> {
  const rows = await prisma.project.findMany({
    where: { user_id: userId },
    orderBy: { name: "asc" },
  });

  return serializeDates(rows) as Project[];
}

export async function getProject(userId: string, id: string): Promise<Project | null> {
  const row = await prisma.project.findFirst({
    where: { id, user_id: userId },
  });

  return row ? (serializeDates(row) as Project) : null;
}
