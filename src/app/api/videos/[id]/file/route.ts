import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";

import { getVideoJob } from "@/lib/data/video-jobs";
import { getCurrentUser } from "@/lib/session";
import { createVideoReadStream, statVideoFile } from "@/lib/video-storage";

export const dynamic = "force-dynamic";

function safeFilename(value: string): string {
  const cleaned = value.replace(/[\r\n"\\/:*?<>|]+/g, " ").trim().slice(0, 80);
  return cleaned || "video";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const job = await getVideoJob(user.id, id);
  if (!job) {
    return NextResponse.json({ error: "El video no existe." }, { status: 404 });
  }

  const info = await statVideoFile(id);
  if (!info) {
    return NextResponse.json({ error: "El video no está disponible." }, { status: 404 });
  }

  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });

  if (request.nextUrl.searchParams.get("download") === "1") {
    const filename = `${safeFilename(job.prompt || job.id)}.mp4`;
    headers.set(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
  }

  const range = request.headers.get("range");

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);

    if (!match) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${info.size}` },
      });
    }

    const hasStart = match[1] !== "";
    const hasEnd = match[2] !== "";

    let start = hasStart ? Number(match[1]) : 0;
    let end = hasEnd ? Number(match[2]) : info.size - 1;

    if (!hasStart && hasEnd) {
      start = Math.max(info.size - Number(match[2]), 0);
      end = info.size - 1;
    }

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      start > end ||
      start >= info.size
    ) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${info.size}` },
      });
    }

    end = Math.min(end, info.size - 1);

    headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
    headers.set("Content-Length", String(end - start + 1));

    const stream = createVideoReadStream(id, { start, end });

    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", String(info.size));

  const stream = createVideoReadStream(id);

  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status: 200,
    headers,
  });
}
