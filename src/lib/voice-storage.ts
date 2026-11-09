import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

function audioDir(): string {
  const configured = process.env.VOICE_AUDIO_DIR?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), "data", "audio");
}

function audioPath(id: string): string {
  return path.join(audioDir(), `${id}.mp3`);
}

/** URL interna desde la que se sirve el audio generado. */
export function voiceAudioUrl(id: string): string {
  return `/api/voiceovers/${id}/audio`;
}

export async function saveVoiceAudio(id: string, bytes: Uint8Array): Promise<void> {
  await mkdir(audioDir(), { recursive: true });
  await writeFile(audioPath(id), bytes);
}

export async function readVoiceAudio(id: string): Promise<Buffer | null> {
  try {
    return await readFile(audioPath(id));
  } catch {
    return null;
  }
}

export async function deleteVoiceAudio(id: string): Promise<void> {
  try {
    await unlink(audioPath(id));
  } catch {
    // El archivo pudo no existir; no es un error.
  }
}
