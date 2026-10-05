"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const nameSchema = z.string().trim().min(1, "El nombre es obligatorio.").max(80);

export interface ActionResult {
  error?: string;
  ok?: boolean;
  id?: string;
}

function errorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  ) {
    return "Ya existe un proyecto con ese nombre.";
  }
  return error instanceof Error ? error.message : "No se pudo guardar el cambio.";
}

function revalidateProjects() {
  revalidatePath("/");
}

export async function createProject(input: { name: string }): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = nameSchema.safeParse(input.name);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    const created = await prisma.project.create({
      data: { user_id: user.id, name: parsed.data },
      select: { id: true },
    });

    revalidateProjects();
    return { ok: true, id: created.id };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function renameProject(id: string, name: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    await prisma.project.updateMany({
      where: { id, user_id: user.id },
      data: { name: parsed.data },
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidateProjects();
  return { ok: true };
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  try {
    // Las conversaciones del proyecto (y sus mensajes/adjuntos) se borran en
    // cascada por la relación Conversation.project (onDelete: Cascade).
    await prisma.project.deleteMany({ where: { id, user_id: user.id } });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidateProjects();
  return { ok: true };
}
