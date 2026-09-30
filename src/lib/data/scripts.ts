import "server-only";

import { parseJson, prisma } from "@/lib/db";
import type { ImagePrompt, Script } from "@/lib/types";

function toScript(row: {
  id: string;
  user_id: string;
  conversation_id: string | null;
  profile_id: string | null;
  title: string;
  content: string;
  image_prompts: string;
  created_at: Date;
}): Script {
  return {
    id: row.id,
    user_id: row.user_id,
    conversation_id: row.conversation_id,
    profile_id: row.profile_id,
    title: row.title,
    content: row.content,
    image_prompts: parseJson<ImagePrompt[]>(row.image_prompts, []),
    created_at: row.created_at.toISOString(),
  };
}

export async function listScripts(userId: string, limit = 50): Promise<Script[]> {
  const rows = await prisma.script.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    take: limit,
  });

  return rows.map(toScript);
}

export async function getScript(userId: string, id: string): Promise<Script | null> {
  const row = await prisma.script.findFirst({
    where: { id, user_id: userId },
  });

  return row ? toScript(row) : null;
}
