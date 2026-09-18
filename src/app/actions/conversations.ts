"use server";

import { revalidatePath } from "next/cache";

import { isProviderId } from "@/lib/providers";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
  ok?: boolean;
  id?: string;
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
