import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { MissingApiKeyError, resolveModelForUser } from "@/lib/ai/model";
import { getProfile } from "@/lib/data/profiles";
import { isProviderId } from "@/lib/providers";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { Profile, ProviderId } from "@/lib/types";

export const maxDuration = 60;

const bodySchema = z.object({
  conversationId: z.string().uuid("Conversación inválida."),
  profileId: z.string().uuid().nullable().optional(),
  provider: z.string(),
  model: z.string(),
});

const BASE_INSTRUCTIONS = `Eres un guionista experto en contenido para redes sociales.
Escribes guiones claros, con gancho en los primeros segundos, ritmo ágil y lenguaje natural.
Cuando el usuario pida un guion, entrégalo completo y listo para grabar, con estructura visible
(por ejemplo: gancho, desarrollo, cierre y llamada a la acción) y sin explicaciones innecesarias.
Si el usuario solo conversa o pregunta algo, responde de forma breve y directa.`;

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

  return blocks.join("\n\n");
}

async function persistConversation(
  userId: string,
  conversationId: string,
  messages: UIMessage[],
  meta: { provider: string; model: string; profileId: string | null },
) {
  const supabase = await createClient();

  const rows = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      id: message.id,
      conversation_id: conversationId,
      user_id: userId,
      role: message.role,
      parts: message.parts,
    }));

  if (rows.length > 0) {
    await supabase.from("messages").upsert(rows, { onConflict: "id" });
  }

  const firstUserMessage = messages.find((message) => message.role === "user");
  const title = firstUserMessage
    ? extractText(firstUserMessage).slice(0, 80) || "Nueva conversación"
    : undefined;

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    provider: meta.provider,
    model: meta.model,
  };

  if (title) updates.title = title;
  if (meta.profileId) updates.profile_id = meta.profileId;

  await supabase.from("conversations").update(updates).eq("id", conversationId).eq("user_id", userId);
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

  const { conversationId, profileId, provider, model } = parsed.data;

  if (!isProviderId(provider)) {
    return NextResponse.json({ error: "Proveedor inválido." }, { status: 400 });
  }

  const messages = (payload as { messages?: UIMessage[] }).messages ?? [];

  if (messages.length === 0) {
    return NextResponse.json({ error: "No hay mensajes." }, { status: 400 });
  }

  try {
    const profile = profileId ? await getProfile(user.id, profileId) : null;
    const languageModel = await resolveModelForUser(user.id, provider as ProviderId, model);

    const result = streamText({
      model: languageModel,
      instructions: buildInstructions(profile),
      messages: await convertToModelMessages(messages),
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        onEnd: async ({ messages: finalMessages }) => {
          await persistConversation(user.id, conversationId, finalMessages, {
            provider,
            model,
            profileId: profileId ?? null,
          });
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
