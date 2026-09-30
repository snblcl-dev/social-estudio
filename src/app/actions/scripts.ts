"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo guardar el cambio.";
}

export async function saveScript(input: ScriptInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = scriptSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    const created = await prisma.script.create({
      data: {
        user_id: user.id,
        conversation_id: parsed.data.conversationId,
        profile_id: parsed.data.profileId,
        title: parsed.data.title,
        content: parsed.data.content,
        image_prompts: JSON.stringify(parsed.data.imagePrompts),
      },
      select: { id: true },
    });

    revalidatePath("/guiones");
    return { ok: true, id: created.id };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

const updateScriptSchema = z.object({
  id: z.string().uuid("Guion inválido."),
  title: z.string().trim().min(1, "El título es obligatorio.").max(160),
  content: z.string().trim().min(1, "El guion está vacío."),
  imagePrompts: z.array(imagePromptSchema).optional(),
});

export type UpdateScriptInput = z.input<typeof updateScriptSchema>;

export async function updateScript(input: UpdateScriptInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = updateScriptSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    await prisma.script.updateMany({
      where: { id: parsed.data.id, user_id: user.id },
      data: {
        title: parsed.data.title,
        content: parsed.data.content,
        ...(parsed.data.imagePrompts !== undefined
          ? { image_prompts: JSON.stringify(parsed.data.imagePrompts) }
          : {}),
      },
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath("/guiones");
  return { ok: true };
}

export async function updateScriptImagePrompts(
  id: string,
  imagePrompts: ScriptInput["imagePrompts"],
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  try {
    await prisma.script.updateMany({
      where: { id, user_id: user.id },
      data: { image_prompts: JSON.stringify(imagePrompts ?? []) },
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath("/guiones");
  return { ok: true };
}

export async function deleteScript(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  try {
    await prisma.script.deleteMany({ where: { id, user_id: user.id } });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath("/guiones");
  return { ok: true };
}
