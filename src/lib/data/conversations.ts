import "server-only";

import { parseJson, prisma, serializeDates } from "@/lib/db";
import type { Conversation, MessageRow } from "@/lib/types";

export async function listConversations(
  userId: string,
  limit = 30,
): Promise<Conversation[]> {
  const rows = await prisma.conversation.findMany({
    where: { user_id: userId },
    orderBy: { updated_at: "desc" },
    take: limit,
  });

  return serializeDates(rows) as Conversation[];
}

export async function listConversationsByProject(
  userId: string,
  projectId: string,
  limit = 200,
): Promise<Conversation[]> {
  const rows = await prisma.conversation.findMany({
    where: { user_id: userId, project_id: projectId },
    orderBy: { updated_at: "desc" },
    take: limit,
  });

  return serializeDates(rows) as Conversation[];
}

export async function getConversation(
  userId: string,
  id: string,
): Promise<Conversation | null> {
  const row = await prisma.conversation.findFirst({
    where: { id, user_id: userId },
  });

  return row ? (serializeDates(row) as Conversation) : null;
}

export async function listMessages(
  userId: string,
  conversationId: string,
): Promise<MessageRow[]> {
  const rows = await prisma.message.findMany({
    where: { user_id: userId, conversation_id: conversationId },
    orderBy: [{ position: "asc" }, { created_at: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    conversation_id: row.conversation_id,
    user_id: row.user_id,
    role: row.role as MessageRow["role"],
    parts: parseJson<unknown[]>(row.parts, []),
    created_at: row.created_at.toISOString(),
  }));
}
