"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const profileSchema = z.object({
  type: z.enum(["script", "video"]).default("script"),
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(80),
  description: z.string().trim().max(300).optional().default(""),
  script_instructions: z.string().trim().max(50000).optional().default(""),
  theme_instructions: z.string().trim().max(50000).optional().default(""),
  image_prompt_instructions: z.string().trim().max(50000).optional().default(""),
  video_prompt_instructions: z.string().trim().max(50000).optional().default(""),
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo guardar el cambio.";
}

export async function createProfile(input: ProfileInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    const created = await prisma.profile.create({
      data: { user_id: user.id, ...parsed.data },
      select: { id: true },
    });

    revalidateProfilePaths();
    return { ok: true, id: created.id };
  } catch (error) {
    return { error: errorMessage(error) };
  }
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

  try {
    await prisma.profile.updateMany({
      where: { id, user_id: user.id },
      data: parsed.data,
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidateProfilePaths();
  return { ok: true };
}

export async function deleteProfile(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  try {
    await prisma.profile.deleteMany({
      where: { id, user_id: user.id },
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidateProfilePaths();
  return { ok: true };
}
