import { NextRequest, NextResponse } from "next/server";

import { getVideoApiKey } from "@/lib/data/video-keys";
import { getCurrentUser } from "@/lib/session";
import { isVideoProvider } from "@/lib/video/providers";
import { getVideoProvider } from "@/lib/video/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILES = 14;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el formulario." },
      { status: 400 },
    );
  }

  const provider = String(form.get("provider") ?? "");
  if (!isVideoProvider(provider)) {
    return NextResponse.json(
      { error: "Proveedor de video inválido." },
      { status: 400 },
    );
  }

  const files = form
    .getAll("files")
    .filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return NextResponse.json(
      { error: "Selecciona al menos un archivo." },
      { status: 400 },
    );
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Hasta ${MAX_FILES} archivos por envío.` },
      { status: 400 },
    );
  }

  let totalBytes = 0;
  for (const file of files) {
    if (file.size <= 0) {
      return NextResponse.json(
        { error: "Hay un archivo vacío." },
        { status: 400 },
      );
    }
    totalBytes += file.size;
  }

  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "Los archivos superan el límite de 200 MB." },
      { status: 400 },
    );
  }

  const apiKey = await getVideoApiKey(user.id, provider);
  if (!apiKey) {
    return NextResponse.json(
      { error: "Configura tu clave del proveedor en Ajustes." },
      { status: 400 },
    );
  }

  const adapter = getVideoProvider(provider);

  try {
    const targets = await adapter.initUploads(
      apiKey,
      files.map((file) => ({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      })),
    );

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      const bytes = await files[index].arrayBuffer();

      const response = await fetch(target.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": target.contentType,
          ...(target.headers ?? {}),
        },
        body: bytes,
        cache: "no-store",
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error(
          "[video-upload] fallo al subir",
          provider,
          response.status,
          detail.slice(0, 500),
        );
        return NextResponse.json(
          { error: `El proveedor rechazó la subida (${response.status}).` },
          { status: 502 },
        );
      }
    }

    await adapter.completeUploads(
      apiKey,
      targets.map((target) => target.objectKey),
    );

    return NextResponse.json({
      items: targets.map((target) => ({
        objectKey: target.objectKey,
        contentType: target.contentType,
      })),
    });
  } catch (error) {
    console.error("[video-upload] error", provider, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron subir los archivos.",
      },
      { status: 502 },
    );
  }
}
