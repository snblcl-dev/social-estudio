import { NextRequest, NextResponse } from "next/server";

import { listModelsForProvider } from "@/lib/ai/model-lists";
import { isProviderKey } from "@/lib/providers";
import { resolveProvider } from "@/lib/providers-server";
import { getCurrentUser } from "@/lib/supabase/server";
import type { ProviderKey } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const providerParam = request.nextUrl.searchParams.get("provider");

  if (!providerParam || !isProviderKey(providerParam)) {
    return NextResponse.json({ error: "Proveedor inválido." }, { status: 400 });
  }

  const provider = providerParam as ProviderKey;
  const resolved = await resolveProvider(user.id, provider);

  if (!resolved) {
    return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });
  }

  try {
    const models = await listModelsForProvider(user.id, provider);

    return NextResponse.json({
      models: models.length > 0 ? models : resolved.suggestedModels,
    });
  } catch (error) {
    return NextResponse.json({
      models: resolved.suggestedModels,
      error: error instanceof Error ? error.message : "No se pudieron cargar los modelos.",
    });
  }
}
