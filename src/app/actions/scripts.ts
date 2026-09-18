"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, getCurrentUser } from "@/lib/supabase/server";

const imagePromptSchema = z.object({
  index: z.number().int().nonnegative(),
  scene: z.string(),
  prompt: z.string(),
});

const scriptSchema = z.object({
  conversationId: z.string().uuid().nullable(),
  profileId: z.string().uuid().nullable(),
  title: z.string().trim().min(1, "El título es obligatorio.").max(160),
  content: z.string().trim().min(1, "El guion está vacío."),
  imagePrompts: z.array(imagePromptSchema).default([]),
});

export type ScriptInput = z.input<typeof scriptSchema>;

export interface ActionResult {
  error?: string;
  ok?: boolean;
  id?: string;
}

export async function saveScript(input: ScriptInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = scriptSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scripts")
    .insert({
      user_id: user.id,
      conversation_id: parsed.data.conversationId,
      profile_id: parsed.data.profileId,
      title: parsed.data.title,
      content: parsed.data.content,
      image_prompts: parsed.data.imagePrompts,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/historial");
  return { ok: true, id: data?.id as string | undefined };
}

export async function updateScriptImagePrompts(
  id: string,
  imagePrompts: ScriptInput["imagePrompts"],
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("scripts")
    .update({ image_prompts: imagePrompts })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/historial");
  return { ok: true };
}

export async function deleteScript(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const supabase = await createClient();
  const { error } = await supabase.from("scripts").delete().eq("id", id).eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/historial");
  return { ok: true };
}
