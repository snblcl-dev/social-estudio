"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { isProviderKey } from "@/lib/providers";
import { getCurrentUser } from "@/lib/session";

export interface ActionResult {
  error?: string;
  ok?: boolean;
  id?: string;
}

const saveMessagesSchema = z.object({
  conversationId: z.string().uuid("Conversación inválida."),
  provider: z.string(),
  model: z.string(),
  profileId: z.string().uuid().nullable().optional(),
  messages: z
    .array(
      z.object({
        // El AI SDK puede entregar ids vacíos; se sustituyen por uno estable.
        id: z.string(),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(z.unknown()),
      }),
    )
    .min(1, "No hay mensajes que guardar."),
});

export type SaveMessagesInput = z.input<typeof saveMessagesSchema>;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo guardar el cambio.";
}

function partsToText(parts: unknown[]) {
  return parts
    .map((part) => {
      const candidate = part as { type?: string; text?: string };
      return candidate?.type === "text" && typeof candidate.text === "string"
        ? candidate.text
        : "";
    })
    .join("")
    .trim();
}

/** Guarda el historial completo de una conversación desde el cliente. */
export async function saveConversationMessages(input: SaveMessagesInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = saveMessagesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  if (!isProviderKey(parsed.data.provider)) {
    return { error: "Proveedor inválido." };
  }

  const rows = parsed.data.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message, index) => ({
      id: message.id || `${parsed.data.conversationId}:${index}`,
      conversation_id: parsed.data.conversationId,
      user_id: user.id,
      role: message.role,
      parts: JSON.stringify(message.parts),
      position: index,
    }));

  if (rows.length === 0) {
    return { error: "No hay mensajes que guardar." };
  }

  const firstUserMessage = parsed.data.messages.find((message) => message.role === "user");
  const title = firstUserMessage
    ? partsToText(firstUserMessage.parts).slice(0, 80) || "Nueva conversación"
    : undefined;

  try {
    await prisma.$transaction(
      rows.map((row) =>
        prisma.message.upsert({
          where: { id: row.id },
          create: row,
          update: { role: row.role, parts: row.parts, position: row.position },
        }),
      ),
    );

    await prisma.conversation.updateMany({
      where: { id: parsed.data.conversationId, user_id: user.id },
      data: {
        provider: parsed.data.provider,
        model: parsed.data.model,
        ...(title ? { title } : {}),
        ...(parsed.data.profileId ? { profile_id: parsed.data.profileId } : {}),
      },
    });
  } catch (error) {
    console.error("[saveConversationMessages]", error);
    return { error: errorMessage(error) };
  }

  revalidatePath("/");
  return { ok: true };
}

export async function createConversation(input: {
  profileId: string | null;
  provider: string;
  model: string;
  title?: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  if (!isProviderKey(input.provider)) {
    return { error: "Proveedor inválido." };
  }

  try {
    const created = await prisma.conversation.create({
      data: {
        user_id: user.id,
        profile_id: input.profileId,
        provider: input.provider,
        model: input.model,
        title: input.title?.trim() || "Nueva conversación",
      },
      select: { id: true },
    });

    revalidatePath("/");
    return { ok: true, id: created.id };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function updateConversation(input: {
  id: string;
  title?: string;
  profileId?: string | null;
  provider?: string;
  model?: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const data: Prisma.ConversationUncheckedUpdateManyInput = {};

  if (typeof input.title === "string") data.title = input.title.trim() || "Sin título";
  if (input.profileId !== undefined) data.profile_id = input.profileId;
  if (input.model) data.model = input.model;
  if (input.provider) {
    if (!isProviderKey(input.provider)) return { error: "Proveedor inválido." };
    data.provider = input.provider;
  }

  try {
    await prisma.conversation.updateMany({
      where: { id: input.id, user_id: user.id },
      data,
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath("/");
  return { ok: true };
}

export async function deleteConversation(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  try {
    await prisma.conversation.deleteMany({
      where: { id, user_id: user.id },
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath("/");
  return { ok: true };
}
