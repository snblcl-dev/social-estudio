import "server-only";

import type {
  VideoMode,
  VideoPriceRule,
  VideoQuote,
  VideoSettings,
  VideoWalletInfo,
} from "@/lib/types";
import { VideoApiError } from "@/lib/video/errors";
import type {
  VideoBatchResult,
  VideoCreateInput,
  VideoProviderAdapter,
  VideoProviderJob,
  VideoQuoteInput,
  VideoUploadFileMeta,
  VideoUploadTarget,
} from "@/lib/video/types";

const BASE_URL = (process.env.KLING_API_BASE_URL ?? "https://klinggiare.com").replace(
  /\/+$/,
  "",
);

interface RawPriceRule {
  provider?: string;
  operation?: string;
  model?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
  audio?: boolean;
  freeAudio?: boolean;
  currency?: string;
  amount?: number;
  textToVideo?: boolean;
  motionControl?: boolean;
  tailImage?: boolean;
  description?: string;
  enabled?: boolean;
  discountBadge?: { label?: string; endsAt?: string };
}

interface RawQuote {
  perImageAmount?: number;
  originalPerImageAmount?: number;
  totalAmount?: number;
  originalTotal?: number;
  currency?: string;
  imageCount?: number;
  discount?: {
    programName?: string;
    kind?: string;
    value?: number;
    originalTotal?: number;
    discountTotal?: number;
    finalTotal?: number;
    endsAt?: string;
  } | null;
}

interface RawJob {
  id?: number;
  batchId?: number;
  status?: string;
  errorCode?: string | null;
  etaMs?: number | null;
  thumbnailUrl?: string;
  inputObjectKey?: string;
  tailObjectKey?: string;
  providerVideoUrl?: string;
  prompt?: string;
  model?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
  audio?: boolean;
  jobType?: string;
  priceSnapshot?: { amount?: number; currency?: string } | null;
}

interface RawBatch {
  id?: number;
  status?: string;
  jobs?: RawJob[];
}

interface RequestOptions {
  apiKey?: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  attempts?: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorFromBody(json: unknown, status: number): VideoApiError {
  const record = (json ?? {}) as { error?: { code?: string; message?: string } };
  const code = record.error?.code ?? "UNKNOWN";
  const message = record.error?.message ?? `Klinggiare respondió con un error ${status}.`;

  return new VideoApiError({ message, status, code, body: json });
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 3;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      let response: Response;

      try {
        response = await fetch(`${BASE_URL}${path}`, {
          method: options.method ?? "GET",
          headers: {
            Accept: "application/json",
            ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
            ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(options.headers ?? {}),
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          cache: "no-store",
          signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
        });
      } catch (error) {
        const timedOut = error instanceof Error && error.name === "TimeoutError";
        throw new VideoApiError({
          message: timedOut
            ? "Klinggiare tardó demasiado en responder."
            : "No se pudo conectar con Klinggiare.",
          status: 0,
          code: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
        });
      }

      const text = (await response.text()).replace(/^\uFEFF/, "");
      const trimmed = text.trim();
      let json: unknown = null;

      if (trimmed) {
        try {
          json = JSON.parse(trimmed) as unknown;
        } catch {
          json = null;
        }
      }

      if (!response.ok) {
        const error =
          json === null
            ? new VideoApiError({
                message: `Klinggiare respondió con un error ${response.status}: ${
                  trimmed.slice(0, 160) || "sin cuerpo"
                }`,
                status: response.status,
                code: "UNKNOWN",
                body: trimmed.slice(0, 500),
              })
            : errorFromBody(json, response.status);
        const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
        error.retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
        throw error;
      }

      if (!trimmed) return {} as T;
      if (json === null) {
        throw new VideoApiError({
          message: `Klinggiare devolvió una respuesta inválida en ${path}: ${
            trimmed.slice(0, 160) || "sin cuerpo"
          }`,
          status: response.status,
          code: "INVALID_RESPONSE",
          body: trimmed.slice(0, 500),
        });
      }

      return json as T;
    } catch (error) {
      lastError = error;

      const retryable =
        !(error instanceof VideoApiError) ||
        error.status === 0 ||
        error.status === 429 ||
        error.status >= 500;

      if (!retryable || attempt === attempts - 1) throw error;

      const waitMs =
        error instanceof VideoApiError && error.retryAfterSeconds
          ? Math.min(error.retryAfterSeconds * 1000, 6000)
          : Math.min(500 * 2 ** attempt, 4000);

      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new VideoApiError({
        message: "No se pudo completar la petición a Klinggiare.",
        status: 0,
        code: "UNKNOWN",
      });
}

function mapPriceRule(raw: RawPriceRule): VideoPriceRule {
  return {
    provider: raw.provider ?? "kling",
    operation: raw.operation ?? "image-to-video",
    model: raw.model ?? "",
    durationSeconds: raw.durationSeconds ?? 5,
    aspectRatio: raw.aspectRatio ?? "*",
    resolution: raw.resolution ?? "720p",
    audio: Boolean(raw.audio),
    freeAudio: Boolean(raw.freeAudio),
    currency: raw.currency ?? "VND",
    amount: raw.amount ?? 0,
    textToVideo: Boolean(raw.textToVideo),
    motionControl: Boolean(raw.motionControl),
    tailImage: Boolean(raw.tailImage),
    description: raw.description ?? "",
    enabled: raw.enabled ?? true,
    ...(raw.discountBadge?.label && raw.discountBadge.endsAt
      ? { discountBadge: { label: raw.discountBadge.label, endsAt: raw.discountBadge.endsAt } }
      : {}),
  };
}

function mapQuote(raw: RawQuote): VideoQuote {
  return {
    perVideoAmount: raw.perImageAmount ?? 0,
    originalPerVideoAmount: raw.originalPerImageAmount ?? raw.perImageAmount ?? 0,
    totalAmount: raw.totalAmount ?? 0,
    originalTotal: raw.originalTotal ?? raw.totalAmount ?? 0,
    currency: raw.currency ?? "VND",
    imageCount: raw.imageCount ?? 1,
    discount: raw.discount
      ? {
          programName: raw.discount.programName ?? "Descuento",
          kind: raw.discount.kind === "percent" ? "percent" : "fixed",
          value: raw.discount.value ?? 0,
          originalTotal: raw.discount.originalTotal ?? 0,
          discountTotal: raw.discount.discountTotal ?? 0,
          finalTotal: raw.discount.finalTotal ?? raw.totalAmount ?? 0,
          endsAt: raw.discount.endsAt ?? "",
        }
      : null,
  };
}

function mapJob(raw: RawJob): VideoProviderJob {
  return {
    id: raw.id !== undefined && raw.id !== null ? String(raw.id) : "",
    batchId: raw.batchId !== undefined && raw.batchId !== null ? String(raw.batchId) : null,
    status: raw.status ?? "queued",
    errorCode: raw.errorCode ?? null,
    etaMs: raw.etaMs ?? null,
    thumbnailUrl: raw.thumbnailUrl ?? null,
    inputObjectKey: raw.inputObjectKey || null,
    tailObjectKey: raw.tailObjectKey || null,
    providerVideoUrl: raw.providerVideoUrl || null,
    prompt: raw.prompt ?? null,
    model: raw.model ?? null,
    durationSeconds: raw.durationSeconds ?? null,
    aspectRatio: raw.aspectRatio ?? null,
    resolution: raw.resolution ?? null,
    audio: typeof raw.audio === "boolean" ? raw.audio : null,
    jobType: raw.jobType ?? null,
    priceSnapshot: raw.priceSnapshot ?? null,
  };
}

function settingsForMode(mode: VideoMode, settings: VideoSettings) {
  if (mode === "motion") {
    // La regla de Motion Control tiene duración 0: el clip sigue al video de muestra.
    return {
      model: "2.6",
      durationSeconds: 0,
      aspectRatio: settings.aspectRatio || "9:16",
      resolution: "720p",
      audio: true,
    };
  }

  return {
    model: settings.model,
    durationSeconds: settings.durationSeconds,
    aspectRatio: settings.aspectRatio,
    resolution: settings.resolution,
    audio: settings.audio,
  };
}

async function getPrices(): Promise<VideoPriceRule[]> {
  const data = await request<RawPriceRule[]>("/api/v1/prices");
  return (Array.isArray(data) ? data : []).map(mapPriceRule);
}

async function getSystemStatus(): Promise<{ maintenance: boolean }> {
  const data = await request<{ maintenance?: boolean }>("/api/v1/system/status", {
    attempts: 2,
  });

  return { maintenance: Boolean(data.maintenance) };
}

async function getWallet(apiKey: string): Promise<VideoWalletInfo> {
  const data = await request<{ balance?: number; heldReserve?: number }>(
    "/api/v1/ext/wallet",
    { apiKey },
  );

  return {
    balance: data.balance ?? 0,
    heldReserve: data.heldReserve ?? 0,
    currency: "VND",
  };
}

async function initUploads(
  apiKey: string,
  files: VideoUploadFileMeta[],
): Promise<VideoUploadTarget[]> {
  const data = await request<{
    items?: { objectKey?: string; uploadUrl?: string; contentType?: string }[];
  }>("/api/v1/ext/batches/uploads/init", {
    apiKey,
    method: "POST",
    body: { files },
  });

  return (data.items ?? [])
    .filter((item) => item.objectKey && item.uploadUrl)
    .map((item) => ({
      objectKey: item.objectKey as string,
      uploadUrl: item.uploadUrl as string,
      contentType: item.contentType ?? "application/octet-stream",
    }));
}

async function completeUploads(apiKey: string, objectKeys: string[]): Promise<void> {
  await request("/api/v1/ext/batches/uploads/complete", {
    apiKey,
    method: "POST",
    body: { items: objectKeys.map((objectKey) => ({ objectKey })) },
  });
}

async function quote(apiKey: string, input: VideoQuoteInput): Promise<VideoQuote> {
  const data = await request<RawQuote>("/api/v1/ext/batches/quote", {
    apiKey,
    method: "POST",
    body: {
      settings: settingsForMode(input.mode, input.settings),
      imageCount: input.imageCount,
      textToVideo: input.mode === "text",
      motionControl: input.mode === "motion",
      tailImage: input.hasEndFrame,
    },
  });

  return mapQuote(data);
}

async function createBatch(
  apiKey: string,
  input: VideoCreateInput,
): Promise<VideoBatchResult> {
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    settings: settingsForMode(input.mode, input.settings),
  };

  if (input.mode === "image") {
    payload.imageKeys = input.imageKeys;
    if (input.endFrameKey) payload.endFrameKey = input.endFrameKey;
  }

  if (input.mode === "motion") {
    payload.imageKeys = input.imageKeys;
    payload.jobType = "motion_control";
    payload.motionVideoObjectKey = input.motionVideoKey;
    payload.motionCharacterOrientation = input.motionCharacterOrientation;
    payload.keepOriginalSound = input.keepOriginalSound;
  }

  if (input.expectedTotal !== null) {
    payload.expectedTotal = input.expectedTotal;
  }

  try {
    const data = await request<RawBatch>("/api/v1/ext/batches", {
      apiKey,
      method: "POST",
      body: payload,
      headers: { "Idempotency-Key": input.idempotencyKey },
    });

    return {
      id: data.id !== undefined && data.id !== null ? String(data.id) : "",
      status: data.status ?? "queued",
      jobs: (data.jobs ?? []).map(mapJob),
    };
  } catch (error) {
    if (error instanceof VideoApiError && error.code === "PRICE_CHANGED") {
      const rawQuote = (error.body as { quote?: RawQuote } | null)?.quote;
      if (rawQuote) error.quote = mapQuote(rawQuote);
    }
    throw error;
  }
}

async function getJob(apiKey: string, jobId: string): Promise<VideoProviderJob> {
  const data = await request<RawJob>(
    `/api/v1/ext/jobs/${encodeURIComponent(jobId)}`,
    { apiKey },
  );
  return mapJob(data);
}

async function listJobsByBatch(
  apiKey: string,
  batchId: string,
): Promise<VideoProviderJob[]> {
  const data = await request<{ items?: RawJob[] }>(
    `/api/v1/ext/jobs?batchId=${encodeURIComponent(batchId)}&pageSize=100`,
    { apiKey },
  );

  return (data.items ?? []).map(mapJob);
}

async function getVideoUrl(apiKey: string, jobId: string): Promise<string> {
  const data = await request<{ url?: string }>(
    `/api/v1/ext/jobs/${encodeURIComponent(jobId)}/video-url`,
    { apiKey, attempts: 2 },
  );

  if (!data.url) {
    throw new VideoApiError({
      message: "El proveedor no devolvió una URL de video.",
      status: 502,
      code: "NO_OUTPUT",
    });
  }

  return data.url;
}

export const klinggiareProvider: VideoProviderAdapter = {
  id: "klinggiare",
  label: "Kling (Klinggiare)",
  getPrices,
  getSystemStatus,
  getWallet,
  initUploads,
  completeUploads,
  quote,
  createBatch,
  getJob,
  listJobsByBatch,
  getVideoUrl,
};
