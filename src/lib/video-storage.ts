import "server-only";

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const VIDEO_EXTENSION = "mp4";

function videosDir(): string {
  const configured = process.env.VIDEO_STORAGE_DIR?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), "data", "videos");
}

export function videoFilePath(id: string): string {
  return path.join(videosDir(), `${id}.${VIDEO_EXTENSION}`);
}

export function videoFileUrl(id: string): string {
  return `/api/videos/${id}/file`;
}

export async function saveVideoFile(id: string, bytes: Uint8Array): Promise<void> {
  await mkdir(videosDir(), { recursive: true });
  await writeFile(videoFilePath(id), bytes);
}

/** Descarga el MP4 desde una URL (posiblemente temporal) y lo guarda en disco. */
export async function downloadVideoFile(id: string, url: string): Promise<void> {
  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(240_000),
    });
  } catch {
    throw new Error("No se pudo descargar el video generado.");
  }

  if (!response.ok || !response.body) {
    throw new Error(`No se pudo descargar el video generado (${response.status}).`);
  }

  await mkdir(videosDir(), { recursive: true });

  const stream = Readable.fromWeb(
    response.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>,
  );

  await pipeline(stream, createWriteStream(videoFilePath(id)));
}

export async function statVideoFile(id: string): Promise<{ size: number } | null> {
  try {
    const info = await stat(videoFilePath(id));
    return { size: info.size };
  } catch {
    return null;
  }
}

export function createVideoReadStream(
  id: string,
  range?: { start: number; end: number },
) {
  return createReadStream(videoFilePath(id), range);
}

export async function readVideoFile(id: string): Promise<Buffer | null> {
  try {
    return await readFile(videoFilePath(id));
  } catch {
    return null;
  }
}

export async function deleteVideoFile(id: string): Promise<void> {
  try {
    await unlink(videoFilePath(id));
  } catch {
    // El archivo pudo no existir; no es un error.
  }
}
