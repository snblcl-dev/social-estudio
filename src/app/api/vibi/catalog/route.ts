import { NextRequest, NextResponse } from "next/server";

import { getVibiApiKey } from "@/lib/data/vibi";
import { getCurrentUser } from "@/lib/supabase/server";
import type { VibiProvider } from "@/lib/types";
import { vibiListLanguages, vibiListModels, vibiListVoices } from "@/lib/vibi";

export const dynamic = "force-dynamic";

const VIBI_PROVIDERS: VibiProvider[] = ["elevenlabs", "minimax", "capcut"];
const KINDS = ["voices", "languages", "models"] as const;

type Kind = (typeof KINDS)[number];

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const provider = params.get("provider") as VibiProvider | null;
  const kind = params.get("kind") as Kind | null;
  const search = params.get("search") ?? undefined;

  if (!provider || !VIBI_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Proveedor de voz inválido." }, { status: 400 });
  }

  if (!kind || !KINDS.includes(kind)) {
    return NextResponse.json({ error: "Recurso inválido." }, { status: 400 });
  }

  const apiKey = await getVibiApiKey(user.id);
  if (!apiKey) {
    return NextResponse.json({ error: "No hay una clave de Vibi guardada." }, { status: 400 });
  }

  try {
    if (kind === "voices") {
      return NextResponse.json({ items: await vibiListVoices(apiKey, provider, search) });
    }
    if (kind === "languages") {
      return NextResponse.json({ items: await vibiListLanguages(apiKey, provider) });
    }
    return NextResponse.json({ items: await vibiListModels(apiKey, provider) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo consultar Vibi." },
      { status: 502 },
    );
  }
}
