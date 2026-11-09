import { NextRequest, NextResponse } from "next/server";

import { getFishApiKey } from "@/lib/data/fish";
import { FISH_LANGUAGES, FISH_TTS_MODELS, fishListVoices } from "@/lib/fish";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const KINDS = ["voices", "languages", "models"] as const;

type Kind = (typeof KINDS)[number];

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const kind = params.get("kind") as Kind | null;
  const search = params.get("search") ?? undefined;

  if (!kind || !KINDS.includes(kind)) {
    return NextResponse.json({ error: "Recurso inválido." }, { status: 400 });
  }

  const apiKey = await getFishApiKey(user.id);
  if (!apiKey) {
    return NextResponse.json(
      { error: "No hay una clave de Fish Audio guardada." },
      { status: 400 },
    );
  }

  try {
    if (kind === "voices") {
      return NextResponse.json({ items: await fishListVoices(apiKey, { search }) });
    }
    if (kind === "languages") {
      return NextResponse.json({ items: FISH_LANGUAGES });
    }
    return NextResponse.json({ items: FISH_TTS_MODELS });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo consultar Fish Audio." },
      { status: 502 },
    );
  }
}
