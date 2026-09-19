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
Sé conciso: una o dos frases por prompt, sin repetir información entre prompts.
No incluyas texto, marcas de agua ni logotipos en la descripción.

FORMATO DE SALIDA OBLIGATORIO: responde ÚNICAMENTE con un objeto JSON válido, sin explicaciones,
sin markdown y sin bloques de código. Ejemplo exacto de la forma requerida:
${JSON_FORMAT}`;

const SCENE_KEYS = [
  "scene",
  "escena",
  "title",
  "titulo",
  "name",
  "nombre",
  "encuadre",
  "plano",
];

const PROMPT_KEYS = [
  "prompt",
  "image_prompt",
  "imagePrompt",
  "prompt_imagen",
  "promptImagen",
  "text",
  "texto",
  "descripcion",
  "description",
];

function pickString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function coerceItem(item: unknown, index: number) {
  if (typeof item === "string") {
    const text = item.trim();
    return text ? { scene: `Escena ${index + 1}`, prompt: text } : null;
  }

  if (!item || typeof item !== "object") return null;

  const source = item as Record<string, unknown>;
  const prompt = pickString(source, PROMPT_KEYS);
  if (!prompt) return null;

  const scene = pickString(source, SCENE_KEYS) ?? `Escena ${index + 1}`;
  return { scene, prompt };
}

/** Busca el primer array dentro de la estructura JSON, sea cual sea la clave. */
function findPromptArray(value: unknown, depth = 0): unknown[] | null {
  if (depth > 4) return null;
  if (Array.isArray(value)) return value;

  if (value && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const found = findPromptArray((value as Record<string, unknown>)[key], depth + 1);
      if (found) return found;
    }
  }

  return null;
}

/** Intenta parsear JSON tolerando texto alrededor, bloques de código y NDJSON. */
function parseJsonLoose(rawText: string): unknown | null {
  const cleaned = rawText.replace(/```(?:json)?/gi, "").trim();
  const firstBracket = cleaned.search(/[[{]/);
  if (firstBracket === -1) return null;

  const candidate = cleaned.slice(firstBracket);
  const lastClose = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (lastClose === -1) return null;

  const sliced = candidate.slice(0, lastClose + 1);

  try {
    return JSON.parse(sliced);
  } catch {
    // Respaldo: varios objetos JSON, uno por línea.
    const items: unknown[] = [];
    for (const line of sliced.split(/\r?\n/)) {
      const trimmed = line.trim().replace(/,$/, "");
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;
      try {
        items.push(JSON.parse(trimmed));
      } catch {
        // Se ignora la línea que no sea JSON.
      }
    }
    return items.length > 0 ? items : null;
  }
}

/**
 * Extrae los prompts de la respuesta del modelo con tolerancia: acepta
 * `{prompts:[...]}`, un array directo, claves en español, bloques de código, etc.
 */
function extractPrompts(rawText: string) {
  const parsed = parseJsonLoose(rawText);
  if (parsed === null) return null;

  const array = findPromptArray(parsed);
  if (!array) return null;

  const prompts = array
    .map((item, index) => coerceItem(item, index))
    .filter((item): item is { scene: string; prompt: string } => item !== null);

  return prompts.length > 0 ? { prompts } : null;
}

/**
 * No todos los proveedores/gateways respetan el "structured output" nativo
 * (por ejemplo Claude a través de AIRAI devolvía prosa). Por eso pedimos JSON
 * en el propio prompt y lo parseamos de forma tolerante.
 *
 * Se limita el tiempo y los tokens para no superar el límite de duración de la
 * función en Vercel (FUNCTION_INVOCATION_TIMEOUT).
 */
const GENERATION_TIMEOUT_MS = 50_000;

async function generateImagePrompts(
  languageModel: LanguageModel,
  instructions: string,
  prompt: string,
) {
  const result = await generateText({
    model: languageModel,
    instructions,
    prompt,
    maxOutputTokens: 6000,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });

  const parsed = extractPrompts(result.text);

  if (!parsed) {
    const excerpt = result.text.replace(/\s+/g, " ").trim().slice(0, 160);
    console.error("[api/image-prompts] respuesta no parseable:", {
      text: result.text.slice(0, 2000),
      finishReason: result.finishReason,
    });

    throw new Error(
      excerpt
        ? `El modelo no devolvió prompts en JSON válido. Respuesta recibida: "${excerpt}"`
        : "El modelo no devolvió texto (puede que haya agotado el límite de tokens). Prueba con otro modelo o menos escenas.",
    );
  }

  return parsed;
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

    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      return NextResponse.json(
        {
          error:
            "La generación tardó demasiado. Prueba con un modelo más rápido (por ejemplo deepseek-v4-flash) o reduce el número de escenas.",
        },
        { status: 504 },
      );
    }

    console.error("[api/image-prompts]", error);

    const message =
      error instanceof Error ? error.message : "Error inesperado al generar los prompts.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
