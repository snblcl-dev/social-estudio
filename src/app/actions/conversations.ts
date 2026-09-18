"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isProviderId } from "@/lib/providers";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

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
        id: z.string().min(1),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(z.unknown()),
      }),
    )
    .min(1, "No hay mensajes que guardar."),
});

export type SaveMessagesInput = z.input<typeof saveMessagesSchema>;

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

  if (!isProviderId(parsed.data.provider)) {
    return { error: "Proveedor inválido." };
  }

  const supabase = await createClient();

  const rows = parsed.data.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message, index) => ({
      id: message.id,
      conversation_id: parsed.data.conversationId,
      user_id: user.id,
      role: message.role,
      parts: message.parts,
      position: index,
    }));

  if (rows.length === 0) {
    return { error: "No hay mensajes que guardar." };
  }

  const { error: messagesError } = await supabase
    .from("messages")
    .upsert(rows, { onConflict: "id" });

  if (messagesError) {
    console.error("[saveConversationMessages] messages", messagesError);
    return { error: messagesError.message };
  }

  const firstUserMessage = parsed.data.messages.find((message) => message.role === "user");
  const title = firstUserMessage
    ? partsToText(firstUserMessage.parts).slice(0, 80) || "Nueva conversación"
    : undefined;

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    provider: parsed.data.provider,
    model: parsed.data.model,
  };

  if (title) updates.title = title;
  if (parsed.data.profileId) updates.profile_id = parsed.data.profileId;

  const { error: conversationError } = await supabase
    .from("conversations")
    .update(updates)
    .eq("id", parsed.data.conversationId)
    .eq("user_id", user.id);

  if (conversationError) {
    console.error("[saveConversationMessages] conversation", conversationError);
    return { error: conversationError.message };
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

  if (!isProviderId(input.provider)) {
    return { error: "Proveedor inválido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: user.id,
      profile_id: input.profileId,
      provider: input.provider,
      model: input.model,
      title: input.title?.trim() || "Nueva conversación",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/");
  return { ok: true, id: data?.id as string | undefined };
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

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof input.title === "string") updates.title = input.title.trim() || "Sin título";
  if (input.profileId !== undefined) updates.profile_id = input.profileId;
  if (input.model) updates.model = input.model;
  if (input.provider) {
    if (!isProviderId(input.provider)) return { error: "Proveedor inválido." };
    updates.provider = input.provider;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update(updates)
    .eq("id", input.id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/");
  return { ok: true };
}

export async function deleteConversation(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/");
  return { ok: true };
}
