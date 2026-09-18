"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, getCurrentUser } from "@/lib/supabase/server";

const profileSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(80),
  description: z.string().trim().max(300).optional().default(""),
  script_instructions: z.string().trim().max(50000).optional().default(""),
  theme_instructions: z.string().trim().max(50000).optional().default(""),
  image_prompt_instructions: z.string().trim().max(50000).optional().default(""),
});

export type ProfileInput = z.input<typeof profileSchema>;

export interface ActionResult {
  error?: string;
  ok?: boolean;
  id?: string;
}

function revalidateProfilePaths() {
  revalidatePath("/perfiles");
  revalidatePath("/");
}

export async function createProfile(input: ProfileInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .insert({ user_id: user.id, ...parsed.data })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidateProfilePaths();
  return { ok: true, id: data?.id as string | undefined };
}

export async function updateProfile(
  id: string,
  input: ProfileInput,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidateProfilePaths();
  return { ok: true };
}

export async function deleteProfile(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidateProfilePaths();
  return { ok: true };
}
