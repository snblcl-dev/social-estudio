import "server-only";

import type { Prisma, VideoJob as VideoJobRecord } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { VideoJob, VideoJobType } from "@/lib/types";

function toVideoJob(row: VideoJobRecord): VideoJob {
  return {
    id: row.id,
    user_id: row.user_id,
    provider: row.provider,
    provider_batch_id: row.provider_batch_id,
    provider_job_id: row.provider_job_id,
    status: row.status,
    job_type: row.job_type as VideoJobType,
    prompt: row.prompt,
    model: row.model,
    duration_seconds: row.duration_seconds,
    aspect_ratio: row.aspect_ratio,
    resolution: row.resolution,
    audio: row.audio,
    has_end_frame: row.has_end_frame,
    thumbnail_url: row.thumbnail_url,
    provider_video_url: row.provider_video_url,
    has_video: Boolean(row.video_path),
    price_amount: row.price_amount,
    price_currency: row.price_currency,
    error_code: row.error_code,
    error_message: row.error_message,
    eta_ms: row.eta_ms,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    finished_at: row.finished_at ? row.finished_at.toISOString() : null,
  };
}

export async function listVideoJobs(userId: string, limit = 60): Promise<VideoJob[]> {
  const rows = await prisma.videoJob.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    take: limit,
  });

  return rows.map(toVideoJob);
}

export async function getVideoJob(userId: string, id: string): Promise<VideoJob | null> {
  const row = await prisma.videoJob.findFirst({ where: { id, user_id: userId } });
  return row ? toVideoJob(row) : null;
}

export async function getVideoJobsByIds(
  userId: string,
  ids: string[],
): Promise<VideoJob[]> {
  if (ids.length === 0) return [];

  const rows = await prisma.videoJob.findMany({
    where: { user_id: userId, id: { in: ids } },
    orderBy: { created_at: "desc" },
  });

  return rows.map(toVideoJob);
}

export interface InsertVideoJobInput {
  id: string;
  userId: string;
  provider: string;
  providerBatchId: number | null;
  providerJobId: number | null;
  status: string;
  jobType: VideoJobType;
  prompt: string;
  model: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: string;
  audio: boolean;
  hasEndFrame: boolean;
  inputObjectKey: string | null;
  tailObjectKey: string | null;
  motionVideoKey: string | null;
  thumbnailUrl: string | null;
  priceAmount: number | null;
  priceCurrency: string;
  priceSnapshot: Record<string, unknown>;
  etaMs: number | null;
}

export async function insertVideoJobs(
  inputs: InsertVideoJobInput[],
): Promise<VideoJob[]> {
  if (inputs.length === 0) return [];

  await prisma.videoJob.createMany({
    data: inputs.map((input) => ({
      id: input.id,
      user_id: input.userId,
      provider: input.provider,
      provider_batch_id: input.providerBatchId,
      provider_job_id: input.providerJobId,
      status: input.status,
      job_type: input.jobType,
      prompt: input.prompt,
      model: input.model,
      duration_seconds: input.durationSeconds,
      aspect_ratio: input.aspectRatio,
      resolution: input.resolution,
      audio: input.audio,
      has_end_frame: input.hasEndFrame,
      input_object_key: input.inputObjectKey,
      tail_object_key: input.tailObjectKey,
      motion_video_key: input.motionVideoKey,
      thumbnail_url: input.thumbnailUrl,
      price_amount: input.priceAmount,
      price_currency: input.priceCurrency,
      price_snapshot: JSON.stringify(input.priceSnapshot),
      eta_ms: input.etaMs,
    })),
  });

  const rows = await prisma.videoJob.findMany({
    where: { user_id: inputs[0].userId, id: { in: inputs.map((input) => input.id) } },
    orderBy: { created_at: "desc" },
  });

  return rows.map(toVideoJob);
}

export interface VideoJobUpdate {
  status?: string;
  provider_batch_id?: number | null;
  provider_job_id?: number | null;
  thumbnail_url?: string | null;
  provider_video_url?: string | null;
  price_amount?: number | null;
  price_currency?: string;
  price_snapshot?: Record<string, unknown>;
  error_code?: string | null;
  error_message?: string | null;
  eta_ms?: number | null;
  video_path?: string | null;
  finished_at?: Date | null;
}

export async function updateVideoJob(
  userId: string,
  id: string,
  patch: VideoJobUpdate,
): Promise<VideoJob | null> {
  const data: Prisma.VideoJobUpdateManyMutationInput = {};

  if (patch.status !== undefined) data.status = patch.status;
  if (patch.provider_batch_id !== undefined) data.provider_batch_id = patch.provider_batch_id;
  if (patch.provider_job_id !== undefined) data.provider_job_id = patch.provider_job_id;
  if (patch.thumbnail_url !== undefined) data.thumbnail_url = patch.thumbnail_url;
  if (patch.provider_video_url !== undefined) data.provider_video_url = patch.provider_video_url;
  if (patch.price_amount !== undefined) data.price_amount = patch.price_amount;
  if (patch.price_currency !== undefined) data.price_currency = patch.price_currency;
  if (patch.price_snapshot !== undefined) {
    data.price_snapshot = JSON.stringify(patch.price_snapshot);
  }
  if (patch.error_code !== undefined) data.error_code = patch.error_code;
  if (patch.error_message !== undefined) data.error_message = patch.error_message;
  if (patch.eta_ms !== undefined) data.eta_ms = patch.eta_ms;
  if (patch.video_path !== undefined) data.video_path = patch.video_path;
  if (patch.finished_at !== undefined) data.finished_at = patch.finished_at;

  const result = await prisma.videoJob.updateMany({
    where: { id, user_id: userId },
    data,
  });

  if (result.count === 0) return null;

  const row = await prisma.videoJob.findUnique({ where: { id } });
  return row ? toVideoJob(row) : null;
}

export async function deleteVideoJobRow(userId: string, id: string): Promise<void> {
  await prisma.videoJob.deleteMany({ where: { id, user_id: userId } });
}
