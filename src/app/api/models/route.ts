import { NextRequest, NextResponse } from "next/server";

import { listModelsForProvider } from "@/lib/ai/model-lists";
import { isProviderId, PROVIDERS } from "@/lib/providers";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const providerParam = request.nextUrl.searchParams.get("provider");

  if (!providerParam || !isProviderId(providerParam)) {
    return NextResponse.json({ error: "Proveedor inválido." }, { status: 400 });
  }

  const provider = providerParam;

  try {
    const models = await listModelsForProvider(user.id, provider);

    return NextResponse.json({
      models: models.length > 0 ? models : PROVIDERS[provider].suggestedModels,
    });
  } catch (error) {
    return NextResponse.json({
      models: PROVIDERS[provider].suggestedModels,
      error: error instanceof Error ? error.message : "No se pudieron cargar los modelos.",
    });
  }
}
