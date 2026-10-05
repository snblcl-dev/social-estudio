import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  pruneMessages,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { NextResponse, after } from "next/server";
import { z } from "zod";

import { MissingApiKeyError, resolveModelForUser } from "@/lib/ai/model";
import { getProfile } from "@/lib/data/profiles";
import { prisma } from "@/lib/db";
import { isProviderKey } from "@/lib/providers";
import { REASONING_EFFORT_VALUES } from "@/lib/reasoning";
import { getCurrentUser } from "@/lib/session";
import type { Profile, ProviderKey } from "@/lib/types";

export const maxDuration = 60;

// Sin esto, el AI SDK no asigna id a los mensajes del asistente y llegan con
// id vacío; al ser `id` la clave primaria, todos colisionarían y se perderían.
const generateMessageId = createIdGenerator({ prefix: "msg", size: 16 });

const bodySchema = z.object({
  conversationId: z.string().uuid("Conversación inválida."),
  profileId: z.string().uuid().nullable().optional(),
  provider: z.string(),
  model: z.string(),
  reasoning: z.enum(REASONING_EFFORT_VALUES).optional(),
  mode: z.enum(["chat", "image-prompts"]).optional(),
});

const BASE_INSTRUCTIONS = `Eres un guionista experto en contenido para redes sociales.
Escribes guiones claros, con gancho en los primeros segundos, ritmo ágil y lenguaje natural.
Cuando el usuario pida un guion, entrégalo completo y listo para grabar, con estructura visible
(por ejemplo: gancho, desarrollo, cierre y llamada a la acción) y sin explicaciones innecesarias.
Si el usuario solo conversa o pregunta algo, responde de forma breve y directa.`;

const BASE_IMAGE_INSTRUCTIONS = `## Prompts de imagen
Cuando el usuario pida los prompts de imagen (o prompts para ilustrar el guion), actúa como un
director de arte especializado en imágenes para redes sociales. A partir del guion de la
conversación, escribe los prompts de imagen necesarios para ilustrarlo, en el mismo idioma del
guion. Cada prompt debe ser una descripción visual autosuficiente, lista para pegar en un
generador de imágenes, e incluir sujeto, acción, entorno, iluminación, encuadre y estilo.
No incluyas texto, marcas de agua ni logotipos en la descripción.
Responde con una lista numerada, un prompt por escena, con este formato:

**Escena 1 — <título breve>**
<prompt de imagen>

**Escena 2 — <título breve>**
<prompt de imagen>

Sé conciso: una o dos frases por prompt, sin repetir información entre escenas.`;

const BASE_THEMES = `## Recomendación de temas
Propón temas concretos, originales y con potencial de alcance. Para cada tema indica en una línea
el ángulo o enfoque que lo hace interesante.`;

function buildInstructions(profile: Profile | null) {
  const blocks: string[] = [BASE_INSTRUCTIONS];

  if (profile) {
    blocks.push(`## Perfil activo: ${profile.name}`);
    if (profile.description) {
      blocks.push(`Descripción del perfil: ${profile.description}`);
    }
  } else {
    blocks.push("No hay un perfil activo: usa un tono neutro y profesional.");
  }

  if (profile?.script_instructions) {
    blocks.push(`## Instrucciones de estilo y formato de guion (prioritarias)\n${profile.script_instructions}`);
  }

  if (profile?.theme_instructions) {
    blocks.push(`## Instrucciones sobre los temas\n${profile.theme_instructions}`);
  } else {
    blocks.push(BASE_THEMES);
  }

  // Las instrucciones de prompts de imagen están siempre disponibles para que
  // funcionen tanto si el usuario lo pide en el chat como si usa el botón.
  blocks.push(BASE_IMAGE_INSTRUCTIONS);

  if (profile?.image_prompt_instructions) {
    blocks.push(
      `## Instrucciones de prompts de imagen del perfil (prioritarias)\n${profile.image_prompt_instructions}`,
    );
  } else {
    blocks.push(
      "No hay instrucciones de prompts de imagen en el perfil: usa un estilo cinematográfico realista y genera entre 3 y 6 escenas.",
    );
  }

  return blocks.join("\n\n");
}

async function persistConversation(
  userId: string,
  conversationId: string,
  messages: UIMessage[],
  meta: { provider: string; model: string; profileId: string | null },
) {
  const rows = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message, index) => ({
      id: message.id || `${conversationId}:${index}`,
      conversation_id: conversationId,
      user_id: userId,
      role: message.role,
      parts: JSON.stringify(message.parts),
      position: index,
    }));

  if (rows.length > 0) {
    try {
      await prisma.$transaction(
        rows.map((row) =>
          prisma.message.upsert({
            where: { id: row.id },
            create: row,
            update: { role: row.role, parts: row.parts, position: row.position },
          }),
        ),
      );
    } catch (messagesError) {
      console.error("[api/chat] error al guardar mensajes", messagesError);
    }
  }

  const firstUserMessage = messages.find((message) => message.role === "user");
  const title = firstUserMessage
    ? extractText(firstUserMessage).slice(0, 80) || "Nueva conversación"
    : undefined;

  try {
    await prisma.conversation.updateMany({
      where: { id: conversationId, user_id: userId },
      data: {
        provider: meta.provider,
        model: meta.model,
        ...(title ? { title } : {}),
        ...(meta.profileId ? { profile_id: meta.profileId } : {}),
      },
    });
  } catch (conversationError) {
    console.error("[api/chat] error al actualizar la conversación", conversationError);
  }
}

function extractText(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
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
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const { conversationId, profileId, provider, model, reasoning, mode } = parsed.data;

  if (!isProviderKey(provider)) {
    return NextResponse.json({ error: "Proveedor inválido." }, { status: 400 });
  }

  const messages = (payload as { messages?: UIMessage[] }).messages ?? [];

  if (messages.length === 0) {
    return NextResponse.json({ error: "No hay mensajes." }, { status: 400 });
  }

  try {
    const profile = profileId ? await getProfile(user.id, profileId) : null;
    const languageModel = await resolveModelForUser(
      user.id,
      provider as ProviderKey,
      model,
      reasoning,
    );

    if (mode === "image-prompts") {
      console.log("[api/chat] petición de prompts de imagen", {
        profileId: profileId ?? null,
        perfilEncontrado: Boolean(profile),
        caracteresInstruccionesImagen: profile?.image_prompt_instructions?.trim().length ?? 0,
      });
    }

    const result = streamText({
      model: languageModel,
      instructions: buildInstructions(profile),
      // El razonamiento se guarda en el historial, pero no se reenvía al
      // modelo: evita errores de firmas y ahorra tokens.
      messages: pruneMessages({
        messages: await convertToModelMessages(messages),
        reasoning: "all",
      }),
      reasoning,
    });

    // Garantiza que el stream se consuma del todo (y que onEnd se dispare)
    // aunque el cliente cierre la pestaña o se desconecte.
    result.consumeStream();

    let resolveFinalMessages: (value: UIMessage[]) => void = () => {};
    const finalMessages = new Promise<UIMessage[]>((resolve) => {
      resolveFinalMessages = resolve;
    });

    // `after` se ejecuta cuando la respuesta ha terminado. Escribimos con
    // Prisma directamente usando el `userId` ya resuelto.
    after(async () => {
      try {
        const completed = await Promise.race([
          finalMessages,
          new Promise<UIMessage[]>((resolve) => setTimeout(() => resolve([]), 30000)),
        ]);

        if (completed.length === 0) {
          console.warn("[api/chat] no se recibieron mensajes finales para guardar");
          return;
        }

        await persistConversation(user.id, conversationId, completed, {
          provider,
          model,
          profileId: profileId ?? null,
        });
      } catch (persistError) {
        console.error("[api/chat] error al guardar la conversación", persistError);
      }
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        generateMessageId,
        onEnd: ({ messages: done }) => {
          resolveFinalMessages(done);
        },
      }),
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[api/chat]", error);

    const message =
      error instanceof Error ? error.message : "Error inesperado al contactar con el modelo.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
