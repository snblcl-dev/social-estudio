"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  clearVideoApiKey,
  getVideoApiKey,
  saveVideoApiKey,
} from "@/lib/data/video-keys";
import {
  deleteVideoJobRow,
  getVideoJob,
  getVideoJobsByIds,
  insertVideoJobs,
  updateVideoJob as updateVideoJobRow,
  type VideoJobUpdate,
} from "@/lib/data/video-jobs";
import { getCurrentUser } from "@/lib/session";
import type {
  VideoJob,
  VideoJobType,
  VideoPriceRule,
  VideoQuote,
  VideoWalletInfo,
} from "@/lib/types";
import { VideoApiError, videoErrorMessage } from "@/lib/video/errors";
import { VIDEO_PROVIDER_IDS } from "@/lib/video/providers";
import { getVideoProvider } from "@/lib/video/registry";
import type { VideoProviderAdapter, VideoProviderJob } from "@/lib/video/types";
import { deleteVideoFile, downloadVideoFile } from "@/lib/video-storage";

const TERMINAL_STATUSES = new Set(["success", "failed", "canceled"]);

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES];

const MAX_MOTION_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

const providerSchema = z.enum(VIDEO_PROVIDER_IDS);

const settingsSchema = z.object({
  model: z.string().trim().min(1).max(80),
  durationSeconds: z.number().int().min(0).max(60),
  aspectRatio: z.string().trim().min(1).max(20),
  resolution: z.enum(["480p", "720p", "768p", "1080p", "4k"]),
  audio: z.boolean(),
});

const modeSchema = z.enum(["text", "image", "motion"]);

export interface VideoActionResult {
  error?: string;
  ok?: boolean;
  code?: string;
  priceChanged?: VideoQuote;
}

export interface VideoQuoteActionResult extends VideoActionResult {
  quote?: VideoQuote;
}

export interface VideoWalletActionResult extends VideoActionResult {
  wallet?: VideoWalletInfo;
}

export interface VideoJobsActionResult extends VideoActionResult {
  jobs?: VideoJob[];
  warning?: string;
}

export interface VideoCatalogActionResult extends VideoActionResult {
  rules?: VideoPriceRule[];
}

export interface VideoUploadInitResult extends VideoActionResult {
  items?: {
    objectKey: string;
    uploadUrl: string;
    contentType: string;
    headers?: Record<string, string>;
  }[];
}

// ---------------------------------------------------------------------------
// Clave de API y wallet
// ---------------------------------------------------------------------------

export async function saveVideoKey(input: {
  provider: string;
  apiKey: string;
}): Promise<VideoActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = z
    .object({ provider: providerSchema, apiKey: z.string().trim().min(8, "Esa clave parece demasiado corta.") })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    await saveVideoApiKey(user.id, parsed.data.provider, parsed.data.apiKey);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar la clave." };
  }

  revalidatePath("/ajustes");
  revalidatePath("/videos");
  return { ok: true };
}

export async function deleteVideoKey(provider: string): Promise<VideoActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = providerSchema.safeParse(provider);
  if (!parsed.success) return { error: "Proveedor de video inválido." };

  try {
    await clearVideoApiKey(user.id, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo borrar la clave." };
  }

  revalidatePath("/ajustes");
  revalidatePath("/videos");
  return { ok: true };
}

export async function getVideoWallet(
  provider: string,
): Promise<VideoWalletActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = providerSchema.safeParse(provider);
  if (!parsed.success) return { error: "Proveedor de video inválido." };

  const apiKey = await getVideoApiKey(user.id, parsed.data);
  if (!apiKey) {
    return { error: "Configura tu clave de Klinggiare en Ajustes." };
  }

  try {
    const wallet = await getVideoProvider(parsed.data).getWallet(apiKey);
    return { ok: true, wallet };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function loadVideoCatalog(
  provider: string,
): Promise<VideoCatalogActionResult> {
  const parsed = providerSchema.safeParse(provider);
  if (!parsed.success) return { error: "Proveedor de video inválido." };

  try {
    const rules = await getVideoProvider(parsed.data).getPrices();
    return { ok: true, rules };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Subidas
// ---------------------------------------------------------------------------

const uploadInitSchema = z.object({
  provider: providerSchema,
  files: z
    .array(
      z.object({
        filename: z.string().trim().min(1).max(200),
        contentType: z.string().trim().min(1),
        sizeBytes: z.number().int().positive(),
      }),
    )
    .min(1, "Selecciona al menos un archivo.")
    .max(50),
});

export type VideoUploadInitInput = z.input<typeof uploadInitSchema>;

export async function prepareVideoUploads(
  input: VideoUploadInitInput,
): Promise<VideoUploadInitResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = uploadInitSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  let totalBytes = 0;

  for (const file of parsed.data.files) {
    if (!ALLOWED_TYPES.includes(file.contentType)) {
      return { error: "Formato de archivo no admitido." };
    }
    if (VIDEO_TYPES.includes(file.contentType) && file.sizeBytes > MAX_MOTION_VIDEO_BYTES) {
      return { error: "El video de muestra supera los 100 MB." };
    }
    totalBytes += file.sizeBytes;
  }

  if (totalBytes > MAX_TOTAL_BYTES) {
    return { error: "Los archivos superan el límite de 200 MB por envío." };
  }

  const apiKey = await getVideoApiKey(user.id, parsed.data.provider);
  if (!apiKey) {
    return { error: "Configura tu clave de Klinggiare en Ajustes." };
  }

  try {
    const items = await getVideoProvider(parsed.data.provider).initUploads(
      apiKey,
      parsed.data.files,
    );

    if (items.length !== parsed.data.files.length) {
      return { error: "El proveedor no devolvió una URL para cada archivo." };
    }

    return { ok: true, items };
  } catch (error) {
    console.error("[video-upload-init]", parsed.data.provider, error);
    return { error: errorMessage(error) };
  }
}

const uploadCompleteSchema = z.object({
  provider: providerSchema,
  objectKeys: z.array(z.string().trim().min(1)).min(1).max(50),
});

export type VideoUploadCompleteInput = z.input<typeof uploadCompleteSchema>;

export async function completeVideoUploads(
  input: VideoUploadCompleteInput,
): Promise<VideoActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = uploadCompleteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const apiKey = await getVideoApiKey(user.id, parsed.data.provider);
  if (!apiKey) {
    return { error: "Configura tu clave de Klinggiare en Ajustes." };
  }

  try {
    await getVideoProvider(parsed.data.provider).completeUploads(
      apiKey,
      parsed.data.objectKeys,
    );
    return { ok: true };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Cotización y creación
// ---------------------------------------------------------------------------

const quoteSchema = z.object({
  provider: providerSchema,
  mode: modeSchema,
  settings: settingsSchema,
  imageCount: z.number().int().min(1).max(100),
  hasEndFrame: z.boolean().optional().default(false),
});

export type QuoteVideoInput = z.input<typeof quoteSchema>;

export async function quoteVideo(
  input: QuoteVideoInput,
): Promise<VideoQuoteActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const apiKey = await getVideoApiKey(user.id, parsed.data.provider);
  if (!apiKey) {
    return { error: "Configura tu clave de Klinggiare en Ajustes." };
  }

  try {
    const quote = await getVideoProvider(parsed.data.provider).quote(apiKey, {
      mode: parsed.data.mode,
      settings: parsed.data.settings,
      imageCount: parsed.data.mode === "text" ? 1 : parsed.data.imageCount,
      hasEndFrame: parsed.data.mode === "image" && parsed.data.hasEndFrame,
    });

    return { ok: true, quote };
  } catch (error) {
    console.error("[video-quote]", parsed.data.provider, error);
    return { error: errorMessage(error) };
  }
}

const createSchema = z.object({
  provider: providerSchema,
  mode: modeSchema,
  prompt: z.string().trim().min(1, "Escribe un prompt.").max(5000),
  settings: settingsSchema,
  imageKeys: z.array(z.string().trim().min(1)).max(100).default([]),
  endFrameKey: z.string().trim().min(1).nullable().optional(),
  motionVideoKey: z.string().trim().min(1).nullable().optional(),
  motionCharacterOrientation: z.enum(["FULL", "HALF"]).default("FULL"),
  keepOriginalSound: z.boolean().default(true),
  idempotencyKey: z.string().trim().min(8).max(100),
  expectedTotal: z.number().int().positive().nullable().optional(),
});

export type CreateVideoBatchInput = z.input<typeof createSchema>;

export async function createVideoBatch(
  input: CreateVideoBatchInput,
): Promise<VideoJobsActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const data = parsed.data;
  const modeError = validateMode(data);
  if (modeError) return { error: modeError };

  const apiKey = await getVideoApiKey(user.id, data.provider);
  if (!apiKey) {
    return { error: "Configura tu clave de Klinggiare en Ajustes." };
  }

  const adapter = getVideoProvider(data.provider);

  try {
    const status = await adapter.getSystemStatus().catch(() => null);
    if (status?.maintenance) {
      return { error: videoErrorMessage("MAINTENANCE_MODE"), code: "MAINTENANCE_MODE" };
    }

    const imageCount = data.mode === "text" ? 1 : data.imageKeys.length;

    const quote = await adapter.quote(apiKey, {
      mode: data.mode,
      settings: data.settings,
      imageCount,
      hasEndFrame: data.mode === "image" && Boolean(data.endFrameKey),
    });

    const batch = await adapter.createBatch(apiKey, {
      mode: data.mode,
      prompt: data.prompt,
      settings: data.settings,
      imageKeys: data.imageKeys,
      endFrameKey: data.mode === "image" ? (data.endFrameKey ?? null) : null,
      motionVideoKey: data.mode === "motion" ? (data.motionVideoKey ?? null) : null,
      motionCharacterOrientation: data.motionCharacterOrientation,
      keepOriginalSound: data.keepOriginalSound,
      expectedTotal: data.expectedTotal ?? quote.totalAmount,
      idempotencyKey: data.idempotencyKey,
    });

    const jobType: VideoJobType =
      data.mode === "text"
        ? "text_to_video"
        : data.mode === "image"
          ? "image_to_video"
          : "motion_control";

    const rows = await insertVideoJobs(
      batch.jobs.map((job, index) => ({
        id: randomUUID(),
        userId: user.id,
        provider: data.provider,
        providerBatchId: job.batchId ?? (batch.id ? batch.id : null),
        providerJobId: job.id,
        status: job.status,
        jobType,
        prompt: data.prompt,
        model: job.model ?? data.settings.model,
        durationSeconds: job.durationSeconds ?? data.settings.durationSeconds,
        aspectRatio: job.aspectRatio ?? data.settings.aspectRatio,
        resolution: job.resolution ?? data.settings.resolution,
        audio: job.audio ?? (data.mode === "motion" ? true : data.settings.audio),
        hasEndFrame: Boolean(data.endFrameKey),
        inputObjectKey:
          job.inputObjectKey ??
          (data.mode === "text" ? null : (data.imageKeys[index] ?? null)),
        tailObjectKey: job.tailObjectKey ?? data.endFrameKey ?? null,
        motionVideoKey: data.mode === "motion" ? (data.motionVideoKey ?? null) : null,
        thumbnailUrl: job.thumbnailUrl ?? null,
        priceAmount: job.priceSnapshot?.amount ?? quote.perVideoAmount,
        priceCurrency: job.priceSnapshot?.currency ?? quote.currency,
        priceSnapshot: job.priceSnapshot ? { ...job.priceSnapshot } : {},
        etaMs: job.etaMs ?? null,
      })),
    );

    revalidatePath("/videos");
    return {
      ok: true,
      jobs: rows,
      ...(batch.warnings && batch.warnings.length > 0
        ? { warning: batch.warnings.join(" ") }
        : {}),
    };
  } catch (error) {
    if (error instanceof VideoApiError) {
      console.error(
        "[video-create]",
        data.provider,
        error.status,
        error.code,
        error.message,
        JSON.stringify(error.body ?? null).slice(0, 1000),
      );

      if (error.code === "PRICE_CHANGED" && error.quote) {
        return {
          error: videoErrorMessage("PRICE_CHANGED"),
          code: error.code,
          priceChanged: error.quote,
        };
      }
      return { error: videoErrorMessage(error.code, error.message), code: error.code };
    }
    return { error: errorMessage(error) };
  }
}

function validateMode(input: {
  mode: "text" | "image" | "motion";
  imageKeys: string[];
  endFrameKey?: string | null;
  motionVideoKey?: string | null;
}): string | null {
  if (input.mode === "text") {
    if (input.imageKeys.length > 0 || input.endFrameKey || input.motionVideoKey) {
      return "El modo texto no admite imágenes ni videos de muestra.";
    }
    return null;
  }

  if (input.imageKeys.length === 0) {
    return input.mode === "motion"
      ? "Sube al menos una imagen de personaje."
      : "Sube al menos una imagen.";
  }

  if (input.mode === "image") {
    if (input.motionVideoKey) return "El modo imagen no admite video de muestra.";
    return null;
  }

  if (!input.motionVideoKey) return "Sube un video de muestra para Motion Control.";
  if (input.endFrameKey) return "Motion Control no admite imagen final.";
  return null;
}

// ---------------------------------------------------------------------------
// Seguimiento y descarga
// ---------------------------------------------------------------------------

const refreshSchema = z.array(z.string().uuid()).min(1).max(30);

const DOWNLOADING = new Set<string>();

export async function refreshVideoJobs(ids: string[]): Promise<VideoJobsActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  const parsed = refreshSchema.safeParse(ids);
  if (!parsed.success) return { error: "Datos inválidos." };

  const userId = user.id;
  const uniqueIds = Array.from(new Set(parsed.data));
  const current = await getVideoJobsByIds(userId, uniqueIds);
  const pending = current.filter(
    (job) => !TERMINAL_STATUSES.has(job.status) && job.provider_job_id !== null,
  );

  if (pending.length === 0) {
    return { ok: true, jobs: current };
  }

  const keyCache = new Map<string, string | null>();
  const adapterCache = new Map<string, VideoProviderAdapter>();
  const updated = new Map<string, VideoJob>(current.map((job) => [job.id, job]));

  async function keyFor(provider: string): Promise<string | null> {
    if (!keyCache.has(provider)) {
      keyCache.set(provider, await getVideoApiKey(userId, provider));
    }
    return keyCache.get(provider) ?? null;
  }

  function adapterFor(provider: string): VideoProviderAdapter {
    if (!adapterCache.has(provider)) {
      adapterCache.set(provider, getVideoProvider(provider));
    }
    return adapterCache.get(provider) as VideoProviderAdapter;
  }

  const batches = new Map<string, VideoJob[]>();
  const singles: VideoJob[] = [];

  for (const job of pending) {
    if (job.provider_batch_id !== null) {
      const groupKey = `${job.provider}:${job.provider_batch_id}`;
      const group = batches.get(groupKey) ?? [];
      group.push(job);
      batches.set(groupKey, group);
    } else {
      singles.push(job);
    }
  }

  for (const group of batches.values()) {
    const [first] = group;
    const apiKey = await keyFor(first.provider);
    if (!apiKey || first.provider_batch_id === null) continue;
    const adapter = adapterFor(first.provider);

    let snapshots = new Map<string, VideoProviderJob>();
    try {
      const list = await adapter.listJobsByBatch(apiKey, first.provider_batch_id);
      snapshots = new Map(list.map((snapshot) => [snapshot.id, snapshot]));
    } catch (error) {
      console.error(
        "[video-refresh] fallo el listado del batch",
        first.provider,
        first.provider_batch_id,
        error,
      );
    }

    for (const job of group) {
      if (job.provider_job_id === null) continue;

      let snapshot = snapshots.get(job.provider_job_id);

      // Si el listado no trae el job, se consulta individualmente.
      if (!snapshot) {
        try {
          snapshot = await adapter.getJob(apiKey, job.provider_job_id, {
            model: job.model,
            resolution: job.resolution,
          });
        } catch (error) {
          console.error(
            "[video-refresh] fallo al consultar el job",
            job.id,
            job.provider_job_id,
            error,
          );
          continue;
        }
      }

      const row = await applySnapshot(user.id, job, snapshot, apiKey, adapter);
      if (row) {
        if (row.status !== job.status) {
          console.log("[video-refresh]", job.id, job.status, "->", row.status);
        }
        updated.set(job.id, row);
      }
    }
  }

  for (const job of singles) {
    if (job.provider_job_id === null) continue;
    const apiKey = await keyFor(job.provider);
    if (!apiKey) {
      console.error("[video-refresh] sin clave para", job.provider);
      continue;
    }
    const adapter = adapterFor(job.provider);

    try {
      const snapshot = await adapter.getJob(apiKey, job.provider_job_id, {
        model: job.model,
        resolution: job.resolution,
      });
      const row = await applySnapshot(user.id, job, snapshot, apiKey, adapter);
      if (row) {
        if (row.status !== job.status) {
          console.log("[video-refresh]", job.id, job.status, "->", row.status);
        }
        updated.set(job.id, row);
      }
    } catch (error) {
      console.error(
        "[video-refresh] fallo al consultar el job",
        job.id,
        job.provider_job_id,
        error,
      );
      continue;
    }
  }

  return {
    ok: true,
    jobs: uniqueIds.map((id) => updated.get(id)).filter((job): job is VideoJob => Boolean(job)),
  };
}

async function applySnapshot(
  userId: string,
  job: VideoJob,
  snapshot: {
    id: string;
    status: string;
    errorCode: string | null;
    etaMs: number | null;
    thumbnailUrl: string | null;
    providerVideoUrl: string | null;
  },
  apiKey: string,
  adapter: VideoProviderAdapter,
): Promise<VideoJob | null> {
  const patch: VideoJobUpdate = {
    status: snapshot.status,
    eta_ms: snapshot.etaMs ?? null,
    thumbnail_url: snapshot.thumbnailUrl ?? job.thumbnail_url,
    provider_video_url: snapshot.providerVideoUrl ?? job.provider_video_url,
  };

  if (snapshot.status === "success" && !job.has_video) {
    // Si otra petición ya está descargando, no marcamos success todavía:
    // así el cliente sigue sondeando hasta tener el archivo local.
    if (DOWNLOADING.has(job.id)) return null;

    DOWNLOADING.add(job.id);

    try {
      const url =
        snapshot.providerVideoUrl ?? (await adapter.getVideoUrl(apiKey, snapshot.id));
      await downloadVideoFile(job.id, url);
      patch.video_path = `${job.id}.mp4`;
      patch.provider_video_url = url;
      patch.error_code = null;
      patch.error_message = null;
      patch.finished_at = new Date();
    } catch {
      patch.error_code = "DOWNLOAD_FAILED";
      patch.error_message = videoErrorMessage("DOWNLOAD_FAILED");
      patch.finished_at = new Date();
    } finally {
      DOWNLOADING.delete(job.id);
    }
  }

  if (snapshot.status === "failed" || snapshot.status === "canceled") {
    patch.finished_at = new Date();

    if (snapshot.status === "canceled") {
      patch.error_code = null;
      patch.error_message = "La generación se canceló y el importe fue reembolsado.";
    } else {
      patch.error_code = snapshot.errorCode ?? "INTERNAL_ERROR";
      patch.error_message = videoErrorMessage(snapshot.errorCode);
    }
  }

  return updateVideoJobRow(userId, job.id, patch);
}

export async function retryVideoDownload(
  id: string,
): Promise<VideoActionResult & { job?: VideoJob }> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Video inválido." };
  }

  const job = await getVideoJob(user.id, id);
  if (!job) return { error: "El video no existe." };
  if (job.has_video) return { ok: true, job };
  if (job.status !== "success") return { error: "El video todavía no está listo." };
  if (job.provider_job_id === null) return { error: "El video no tiene un identificador válido." };
  if (DOWNLOADING.has(job.id)) {
    return { error: "El video se está preparando. Espera unos segundos." };
  }

  const apiKey = await getVideoApiKey(user.id, job.provider);
  if (!apiKey) return { error: "Configura tu clave de Klinggiare en Ajustes." };

  try {
    const url =
      job.provider_video_url ??
      (await getVideoProvider(job.provider).getVideoUrl(apiKey, job.provider_job_id));

    await downloadVideoFile(job.id, url);

    const updated = await updateVideoJobRow(user.id, job.id, {
      video_path: `${job.id}.mp4`,
      provider_video_url: url,
      error_code: null,
      error_message: null,
    });

    revalidatePath("/videos");
    return { ok: true, job: updated ?? job };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function deleteVideoJob(id: string): Promise<VideoActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "No autenticado." };

  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Video inválido." };
  }

  const job = await getVideoJob(user.id, id);
  if (!job) return { error: "El video no existe." };

  try {
    await deleteVideoJobRow(user.id, id);
    await deleteVideoFile(id);
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath("/videos");
  return { ok: true };
}

function errorMessage(error: unknown): string {
  if (error instanceof VideoApiError) {
    return videoErrorMessage(error.code, error.message);
  }
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación con el proveedor de video.";
}
