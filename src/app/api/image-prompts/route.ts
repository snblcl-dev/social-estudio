import { generateText, type LanguageModel } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { MissingApiKeyError, resolveModelForUser } from "@/lib/ai/model";
import { getProfile } from "@/lib/data/profiles";
import { isProviderId } from "@/lib/providers";
import { getCurrentUser } from "@/lib/supabase/server";
import type { ImagePrompt, ProviderId } from "@/lib/types";

export const maxDuration = 60;

const bodySchema = z.object({
  script: z.string().trim().min(1, "No hay guion para analizar."),
  provider: z.string(),
  model: z.string(),
  profileId: z.string().uuid().nullable().optional(),
  scenes: z.number().int().min(1).max(50).optional(),
});

const JSON_FORMAT = `{"prompts":[{"scene":"...","prompt":"..."}]}`;

const BASE_INSTRUCTIONS = `Eres un director de arte especializado en imágenes para redes sociales.
Recibes un guion y devuelves los prompts de imagen necesarios para ilustrarlo, en el mismo idioma
del guion. Cada prompt debe ser una descripción visual autosuficiente, lista para pegar en un
generador de imágenes, e incluir sujeto, acción, entorno, iluminación, encuadre y estilo.
No incluyas texto, marcas de agua ni logotipos en la descripción.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni bloques de código, con esta
forma exacta: ${JSON_FORMAT}`;

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

/**
 * Extrae el JSON de la respuesta del modelo aunque venga envuelto en texto o
 * en un bloque de código markdown.
 */
function extractPrompts(rawText: string) {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : rawText;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end <= start) return null;

  try {
    const parsed = outputSchema.safeParse(JSON.parse(candidate.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * No todos los proveedores/gateways respetan el "structured output" nativo
 * (por ejemplo Claude a través de AIRAI devolvía prosa). Por eso pedimos JSON
 * en el propio prompt y lo parseamos, con un reintento más estricto.
 */
async function generateImagePrompts(
  languageModel: LanguageModel,
  instructions: string,
  prompt: string,
) {
  const first = await generateText({ model: languageModel, instructions, prompt });
  const parsedFirst = extractPrompts(first.text);
  if (parsedFirst) return parsedFirst;

  const second = await generateText({
    model: languageModel,
    instructions: `${instructions}\n\nIMPORTANTE: tu respuesta anterior no era JSON válido. Devuelve SOLO el JSON, empezando por { y terminando por }, sin explicaciones ni bloques de código.`,
    prompt,
  });
  const parsedSecond = extractPrompts(second.text);
  if (parsedSecond) return parsedSecond;

  throw new Error("El modelo no devolvió un JSON válido con los prompts. Inténtalo de nuevo.");
}

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

  const { script, provider, model, profileId, scenes } = parsed.data;

  if (!isProviderId(provider)) {
    return NextResponse.json({ error: "Proveedor inválido." }, { status: 400 });
  }

  try {
    const profile = profileId ? await getProfile(user.id, profileId) : null;
    const userInstructions = profile?.image_prompt_instructions?.trim() ?? "";
    const languageModel = await resolveModelForUser(user.id, provider as ProviderId, model);

    const instructions = userInstructions
      ? `${BASE_INSTRUCTIONS}\n\n## Instrucciones de estilo del usuario (prioritarias)\n${userInstructions}`
      : BASE_INSTRUCTIONS;

    const countLine = scenes
      ? `Genera exactamente ${scenes} prompts de imagen.`
      : userInstructions
        ? "Genera un prompt de imagen por cada escena del guion, respetando el número de escenas y el estilo indicados en las instrucciones del usuario."
        : "Genera entre 3 y 6 prompts de imagen.";

    const prompt = [countLine, "Guion:", script].join("\n\n");

    const generated = await generateImagePrompts(languageModel, instructions, prompt);

    const imagePrompts: ImagePrompt[] = generated.prompts.map((item, index) => ({
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
