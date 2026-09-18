import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { MissingApiKeyError, resolveModelForUser } from "@/lib/ai/model";
import { getSettings } from "@/lib/data/settings";
import { isProviderId } from "@/lib/providers";
import { getCurrentUser } from "@/lib/supabase/server";
import type { ImagePrompt, ProviderId } from "@/lib/types";

export const maxDuration = 60;

const bodySchema = z.object({
  script: z.string().trim().min(1, "No hay guion para analizar."),
  provider: z.string(),
  model: z.string(),
  scenes: z.number().int().min(1).max(20).optional(),
});

const BASE_INSTRUCTIONS = `Eres un director de arte especializado en imágenes para redes sociales.
Recibes un guion y devuelves los prompts de imagen necesarios para ilustrarlo, en el mismo idioma
del guion. Cada prompt debe ser una descripción visual autosuficiente, lista para pegar en un
generador de imágenes, e incluir sujeto, acción, entorno, iluminación, encuadre y estilo.
No incluyas texto, marcas de agua ni logotipos en la descripción.`;

const outputSchema = z.object({
  prompts: z
    .array(
      z.object({
        scene: z.string().describe("Qué parte del guion ilustra esta imagen."),
        prompt: z.string().describe("El prompt de imagen listo para usar."),
      }),
    )
    .describe("Un prompt por cada plano o escena relevante del guion."),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }

  const { script, provider, model, scenes } = parsed.data;

  if (!isProviderId(provider)) {
    return NextResponse.json({ error: "Proveedor inválido." }, { status: 400 });
  }

  try {
    const settings = await getSettings(user.id);
    const languageModel = await resolveModelForUser(user.id, provider as ProviderId, model);

    const instructions = settings.image_prompt_instructions
      ? `${BASE_INSTRUCTIONS}\n\n## Instrucciones de estilo del usuario (prioritarias)\n${settings.image_prompt_instructions}`
      : BASE_INSTRUCTIONS;

    const prompt = [
      scenes ? `Genera exactamente ${scenes} prompts de imagen.` : "Genera entre 3 y 6 prompts de imagen.",
      "Guion:",
      script,
    ].join("\n\n");

    const { output } = await generateText({
      model: languageModel,
      instructions,
      prompt,
      output: Output.object({
        schema: outputSchema,
        name: "imagePrompts",
        description: "Lista de prompts de imagen derivados del guion.",
      }),
    });

    const imagePrompts: ImagePrompt[] = (output?.prompts ?? []).map((item, index) => ({
      index: index + 1,
      scene: item.scene,
      prompt: item.prompt,
    }));

    if (imagePrompts.length === 0) {
      return NextResponse.json(
        { error: "El modelo no devolvió ningún prompt. Inténtalo de nuevo." },
        { status: 502 },
      );
    }

    return NextResponse.json({ imagePrompts });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[api/image-prompts]", error);

    const message =
      error instanceof Error ? error.message : "Error inesperado al generar los prompts.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
