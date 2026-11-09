import { NextRequest, NextResponse } from "next/server";

import { getScript } from "@/lib/data/scripts";
import { getVoiceover } from "@/lib/data/vibi";
import { getCurrentUser } from "@/lib/session";
import { readVoiceAudio } from "@/lib/voice-storage";

export const dynamic = "force-dynamic";

function safeFilename(value: string): string {
  const cleaned = value.replace(/[\r\n"\\/:*?<>|]+/g, " ").trim().slice(0, 80);
  return cleaned || "audio";
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
  const voiceover = await getVoiceover(user.id, id);
  if (!voiceover) {
    return NextResponse.json({ error: "El audio no existe." }, { status: 404 });
  }

  if (voiceover.audio_url && /^https?:\/\//i.test(voiceover.audio_url)) {
    return NextResponse.redirect(voiceover.audio_url);
  }

  const audio = await readVoiceAudio(id);
  if (!audio) {
    return NextResponse.json({ error: "El audio no está disponible." }, { status: 404 });
  }

  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Content-Length": String(audio.byteLength),
    "Cache-Control": "private, max-age=3600",
  });

  if (request.nextUrl.searchParams.get("download") === "1") {
    const script = voiceover.script_id
      ? await getScript(user.id, voiceover.script_id)
      : null;
    const filename = `${safeFilename(script?.title ?? `audio-${id}`)}.mp3`;
    headers.set(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
  }

  return new Response(new Uint8Array(audio), { status: 200, headers });
}
