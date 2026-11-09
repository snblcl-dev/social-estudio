import "server-only";

import type {
  VideoPriceRule,
  VideoQuote,
  VideoWalletInfo,
} from "@/lib/types";
import { VideoApiError } from "@/lib/video/errors";
import type {
  VideoBatchResult,
  VideoCreateInput,
  VideoJobContext,
  VideoProviderAdapter,
  VideoProviderJob,
  VideoQuoteInput,
  VideoUploadFileMeta,
  VideoUploadTarget,
} from "@/lib/video/types";

const BASE_URL = (process.env.MAGNIFIC_API_BASE_URL ?? "https://api.magnific.com").replace(
  /\/+$/,
  "",
);

const MAX_UPLOAD_FILES = 14;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const KLING_DURATIONS = Array.from({ length: 13 }, (_, index) => index + 3);

interface MagnificModelConfig {
  /** Nombre visible y clave usada en las reglas de precio y en la BD. */
  id: string;
  endpoint: string;
  statusPath: string;
  resolution: "720p" | "768p" | "1080p";
  creditsPerSecond: number;
  durations: number[];
  aspects: string[];
  supportsEndFrame: boolean;
  supportsAudio: boolean;
  imageField: "image" | "first_frame_image";
  endFrameField: "image_end" | "last_frame_image" | null;
  durationAsString: boolean;
}

const MODELS: MagnificModelConfig[] = [
  {
    id: "Kling 2.5 Turbo Pro · 720p",
    endpoint: "/v1/ai/image-to-video/kling-v2-5-720p",
    statusPath: "/v1/ai/image-to-video/kling-v2-5-720p",
    resolution: "720p",
    creditsPerSecond: 28,
    durations: [5, 10],
    aspects: ["auto"],
    supportsEndFrame: false,
    supportsAudio: false,
    imageField: "image",
    endFrameField: null,
    durationAsString: true,
  },
  {
    id: "Kling 2.5 Turbo Pro · 1080p",
    endpoint: "/v1/ai/image-to-video/kling-v2-5-pro",
    statusPath: "/v1/ai/image-to-video/kling-v2-5-pro",
    resolution: "1080p",
    creditsPerSecond: 65,
    durations: [5, 10],
    aspects: ["auto"],
    supportsEndFrame: false,
    supportsAudio: false,
    imageField: "image",
    endFrameField: null,
    durationAsString: true,
  },
  {
    id: "Kling 3.0 Turbo · 720p",
    endpoint: "/v1/ai/image-to-video/kling-v3-turbo-720p",
    statusPath: "/v1/ai/image-to-video/kling-v3-turbo",
    resolution: "720p",
    creditsPerSecond: 210,
    durations: KLING_DURATIONS,
    aspects: ["auto"],
    supportsEndFrame: false,
    supportsAudio: false,
    imageField: "image",
    endFrameField: null,
    durationAsString: true,
  },
  {
    id: "Kling 3.0 Turbo · 1080p",
    endpoint: "/v1/ai/image-to-video/kling-v3-turbo-1080p",
    statusPath: "/v1/ai/image-to-video/kling-v3-turbo",
    resolution: "1080p",
    creditsPerSecond: 260,
    durations: KLING_DURATIONS,
    aspects: ["auto"],
    supportsEndFrame: false,
    supportsAudio: false,
    imageField: "image",
    endFrameField: null,
    durationAsString: true,
  },
  {
    id: "Kling 2.6 Pro · 1080p",
    endpoint: "/v1/ai/image-to-video/kling-v2-6-pro",
    statusPath: "/v1/ai/image-to-video/kling-v2-6",
    resolution: "1080p",
    creditsPerSecond: 45,
    durations: [5, 10],
    aspects: ["16:9", "9:16", "1:1"],
    supportsEndFrame: false,
    supportsAudio: true,
    imageField: "image",
    endFrameField: null,
    durationAsString: true,
  },
  {
    id: "Hailuo 2.3 · 768p",
    endpoint: "/v1/ai/image-to-video/minimax-hailuo-2-3-768p",
    statusPath: "/v1/ai/image-to-video/minimax-hailuo-2-3-768p",
    resolution: "768p",
    creditsPerSecond: 25,
    durations: [6, 10],
    aspects: ["auto"],
    supportsEndFrame: true,
    supportsAudio: false,
    imageField: "first_frame_image",
    endFrameField: "last_frame_image",
    durationAsString: false,
  },
  {
    id: "Hailuo 2.3 · 1080p",
    endpoint: "/v1/ai/image-to-video/minimax-hailuo-2-3-1080p",
    statusPath: "/v1/ai/image-to-video/minimax-hailuo-2-3-1080p",
    resolution: "1080p",
    creditsPerSecond: 40,
    durations: [6, 10],
    aspects: ["auto"],
    supportsEndFrame: true,
    supportsAudio: false,
    imageField: "first_frame_image",
    endFrameField: "last_frame_image",
    durationAsString: false,
  },
  {
    id: "Hailuo 2.3 Fast · 768p",
    endpoint: "/v1/ai/image-to-video/minimax-hailuo-2-3-768p-fast",
    statusPath: "/v1/ai/image-to-video/minimax-hailuo-2-3-768p-fast",
    resolution: "768p",
    creditsPerSecond: 25,
    durations: [6, 10],
    aspects: ["auto"],
    supportsEndFrame: true,
    supportsAudio: false,
    imageField: "first_frame_image",
    endFrameField: "last_frame_image",
    durationAsString: false,
  },
  {
    id: "Hailuo 2.3 Fast · 1080p",
    endpoint: "/v1/ai/image-to-video/minimax-hailuo-2-3-1080p-fast",
    statusPath: "/v1/ai/image-to-video/minimax-hailuo-2-3-1080p-fast",
    resolution: "1080p",
    creditsPerSecond: 43,
    durations: [6, 10],
    aspects: ["auto"],
    supportsEndFrame: true,
    supportsAudio: false,
    imageField: "first_frame_image",
    endFrameField: "last_frame_image",
    durationAsString: false,
  },
  {
    id: "Hailuo 02 · 768p",
    endpoint: "/v1/ai/image-to-video/minimax-hailuo-02-768p",
    statusPath: "/v1/ai/image-to-video/minimax-hailuo-02-768p",
    resolution: "768p",
    creditsPerSecond: 35,
    durations: [6, 10],
    aspects: ["auto"],
    supportsEndFrame: true,
    supportsAudio: false,
    imageField: "first_frame_image",
    endFrameField: "last_frame_image",
    durationAsString: false,
  },
  {
    id: "Hailuo 02 · 1080p",
    endpoint: "/v1/ai/image-to-video/minimax-hailuo-02-1080p",
    statusPath: "/v1/ai/image-to-video/minimax-hailuo-02-1080p",
    resolution: "1080p",
    creditsPerSecond: 120,
    durations: [6, 10],
    aspects: ["auto"],
    supportsEndFrame: true,
    supportsAudio: false,
    imageField: "first_frame_image",
    endFrameField: "last_frame_image",
    durationAsString: false,
  },
];

const MODELS_BY_ID = new Map(MODELS.map((model) => [model.id, model]));

function buildRules(): VideoPriceRule[] {
  const rules: VideoPriceRule[] = [];

  for (const model of MODELS) {
    for (const duration of model.durations) {
      for (const aspect of model.aspects) {
        const base: Omit<VideoPriceRule, "audio" | "freeAudio" | "tailImage"> = {
          provider: "magnific",
          operation: "image-to-video",
          model: model.id,
          durationSeconds: duration,
          aspectRatio: aspect,
          resolution: model.resolution,
          currency: "CREDITS",
          amount: model.creditsPerSecond * duration,
          textToVideo: false,
          motionControl: false,
          description: `${model.id} · ${duration}s`,
          enabled: true,
        };

        rules.push({
          ...base,
          audio: false,
          freeAudio: !model.supportsAudio,
          tailImage: false,
        });

        if (model.supportsEndFrame) {
          rules.push({
            ...base,
            audio: false,
            freeAudio: true,
            tailImage: true,
          });
        }

        if (model.supportsAudio) {
          rules.push({
            ...base,
            audio: true,
            freeAudio: false,
            tailImage: false,
          });

          if (model.supportsEndFrame) {
            rules.push({
              ...base,
              audio: true,
              freeAudio: false,
              tailImage: true,
            });
          }
        }
      }
    }
  }

  return rules;
}

const PRICE_RULES = buildRules();

function mapStatus(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "failed";
    case "IN_PROGRESS":
      return "processing";
    case "CREATED":
    default:
      return "queued";
  }
}

function toMagnificAspect(aspect: string): string {
  switch (aspect) {
    case "16:9":
      return "widescreen_16_9";
    case "9:16":
      return "social_story_9_16";
    case "1:1":
      return "square_1_1";
    default:
      return aspect;
  }
}

function friendlyMessage(status: number, message: string): string {
  if (status === 401) return "La clave de Magnific no es válida. Revísala en Ajustes.";
  if (status === 429) return "Magnific limitó las peticiones. Espera un momento e inténtalo de nuevo.";
  if (status === 503) return "Magnific está ocupado. Inténtalo de nuevo en unos segundos.";
  if (status >= 500) return "Error interno de Magnific. Inténtalo de nuevo.";
  return message || `Magnific respondió con un error ${status}.`;
}

interface MagnificRequestOptions {
  apiKey: string;
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  attempts?: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function magnificFetch<T>(
  path: string,
  options: MagnificRequestOptions,
): Promise<T> {
  const attempts = options.attempts ?? 1;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      let response: Response;

      try {
        response = await fetch(`${BASE_URL}${path}`, {
          method: options.method ?? "GET",
          headers: {
            "x-magnific-api-key": options.apiKey,
            Accept: "application/json",
            ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          cache: "no-store",
          signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
        });
      } catch (error) {
        const timedOut = error instanceof Error && error.name === "TimeoutError";
        throw new VideoApiError({
          message: timedOut
            ? "Magnific tardó demasiado en responder."
            : "No se pudo conectar con Magnific.",
          status: 0,
          code: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
        });
      }

      const text = await response.text();
      let json: unknown = null;

      if (text) {
        try {
          json = JSON.parse(text) as unknown;
        } catch {
          json = null;
        }
      }

      if (!response.ok) {
        const record = (json ?? {}) as {
          message?: string;
          problem?: { message?: string };
        };
        const rawMessage = record.message ?? record.problem?.message ?? "";
        const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
        const error = new VideoApiError({
          message: friendlyMessage(response.status, rawMessage),
          status: response.status,
          code:
            response.status === 401
              ? "UNAUTHORIZED"
              : response.status === 429
                ? "RATE_LIMITED"
                : response.status === 503
                  ? "MAINTENANCE_MODE"
                  : response.status >= 500
                    ? "INTERNAL"
                    : "VALIDATION_ERROR",
          retryAfterSeconds:
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
          body: json,
        });
        throw error;
      }

      if (!text) return {} as T;
      if (json === null) {
        throw new VideoApiError({
          message: "Magnific devolvió una respuesta inválida.",
          status: response.status,
          code: "INVALID_RESPONSE",
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
        message: "No se pudo completar la petición a Magnific.",
        status: 0,
        code: "UNKNOWN",
      });
}

function requireModel(modelId: string): MagnificModelConfig {
  const model = MODELS_BY_ID.get(modelId);
  if (!model) {
    throw new VideoApiError({
      message: "El modelo de Magnific no existe.",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }
  return model;
}

async function getPrices(): Promise<VideoPriceRule[]> {
  return PRICE_RULES;
}

async function getSystemStatus(): Promise<{ maintenance: boolean }> {
  return { maintenance: false };
}

async function getWallet(): Promise<VideoWalletInfo> {
  throw new VideoApiError({
    message: "Magnific no expone el saldo por API.",
    status: 400,
    code: "WALLET_UNAVAILABLE",
  });
}

async function initUploads(
  apiKey: string,
  files: VideoUploadFileMeta[],
): Promise<VideoUploadTarget[]> {
  if (files.length > MAX_UPLOAD_FILES) {
    throw new VideoApiError({
      message: `Magnific permite subir hasta ${MAX_UPLOAD_FILES} archivos por envío.`,
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }

  for (const file of files) {
    if (!ALLOWED_CONTENT_TYPES.has(file.contentType)) {
      throw new VideoApiError({
        message: "Magnific no admite ese formato de archivo.",
        status: 400,
        code: "INVALID_CONTENT_TYPE",
      });
    }
  }

  const data = await magnificFetch<{
    files?: {
      file_id?: string;
      upload_url?: string;
      asset_url?: string;
      headers?: Record<string, string>;
    }[];
  }>("/v1/ai/uploads/request-url", {
    apiKey,
    method: "POST",
    body: { files: files.map((file) => ({ content_type: file.contentType })) },
    attempts: 2,
  });

  const items = data.files ?? [];

  if (items.length !== files.length) {
    throw new VideoApiError({
      message: "Magnific no devolvió una URL para cada archivo.",
      status: 502,
      code: "INVALID_RESPONSE",
    });
  }

  return items.map((item, index) => {
    if (!item.upload_url || !item.asset_url) {
      throw new VideoApiError({
        message: "Magnific no devolvió una URL válida para el archivo.",
        status: 502,
        code: "INVALID_RESPONSE",
      });
    }

    return {
      objectKey: item.asset_url,
      uploadUrl: item.upload_url,
      contentType: files[index].contentType,
      headers: item.headers,
    };
  });
}

async function completeUploads(): Promise<void> {
  // Magnific no requiere confirmación: el asset_url queda disponible tras el PUT.
}

async function quote(_apiKey: string, input: VideoQuoteInput): Promise<VideoQuote> {
  if (input.mode !== "image") {
    throw new VideoApiError({
      message: "Magnific solo está habilitado para imagen a video.",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }

  const model = requireModel(input.settings.model);

  if (!model.durations.includes(input.settings.durationSeconds)) {
    throw new VideoApiError({
      message: "Esa duración no está disponible para el modelo elegido.",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }

  if (input.settings.audio && !model.supportsAudio) {
    throw new VideoApiError({
      message: "Ese modelo no admite audio.",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }

  const perVideoAmount = model.creditsPerSecond * input.settings.durationSeconds;
  const totalAmount = perVideoAmount * input.imageCount;

  return {
    perVideoAmount,
    originalPerVideoAmount: perVideoAmount,
    totalAmount,
    originalTotal: totalAmount,
    currency: "CREDITS",
    imageCount: input.imageCount,
    discount: null,
  };
}

function buildPayload(
  model: MagnificModelConfig,
  input: VideoCreateInput,
  imageKey: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { prompt: input.prompt };
  payload[model.imageField] = imageKey;
  payload.duration = model.durationAsString
    ? String(input.settings.durationSeconds)
    : input.settings.durationSeconds;

  if (input.endFrameKey && model.supportsEndFrame && model.endFrameField) {
    payload[model.endFrameField] = input.endFrameKey;
  }

  if (model.supportsAudio) {
    payload.generate_audio = Boolean(input.settings.audio);
  }

  if (model.aspects.length > 1) {
    payload.aspect_ratio = toMagnificAspect(input.settings.aspectRatio);
  }

  return payload;
}

async function createBatch(
  apiKey: string,
  input: VideoCreateInput,
): Promise<VideoBatchResult> {
  if (input.mode !== "image") {
    throw new VideoApiError({
      message: "Magnific solo está habilitado para imagen a video.",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }

  if (input.imageKeys.length === 0) {
    throw new VideoApiError({
      message: "Sube al menos una imagen.",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }

  const model = requireModel(input.settings.model);

  if (!model.durations.includes(input.settings.durationSeconds)) {
    throw new VideoApiError({
      message: "Esa duración no está disponible para el modelo elegido.",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }

  const perVideoAmount = model.creditsPerSecond * input.settings.durationSeconds;
  const results = await Promise.allSettled(
    input.imageKeys.map(async (imageKey) => {
      const data = await magnificFetch<{
        data?: { task_id?: string; status?: string };
      }>(model.endpoint, {
        apiKey,
        method: "POST",
        body: buildPayload(model, input, imageKey),
        attempts: 1,
      });

      const taskId = data.data?.task_id;
      if (!taskId) {
        throw new VideoApiError({
          message: "Magnific no devolvió el identificador de la tarea.",
          status: 502,
          code: "INVALID_RESPONSE",
        });
      }

      const job: VideoProviderJob = {
        id: taskId,
        batchId: null,
        status: mapStatus(data.data?.status ?? "CREATED"),
        errorCode: null,
        etaMs: null,
        thumbnailUrl: null,
        inputObjectKey: imageKey,
        tailObjectKey: input.endFrameKey,
        providerVideoUrl: null,
        prompt: input.prompt,
        model: model.id,
        durationSeconds: input.settings.durationSeconds,
        aspectRatio: input.settings.aspectRatio,
        resolution: model.resolution,
        audio: model.supportsAudio ? Boolean(input.settings.audio) : false,
        jobType: "image_to_video",
        priceSnapshot: { amount: perVideoAmount, currency: "CREDITS" },
      };

      return job;
    }),
  );

  const jobs: VideoProviderJob[] = [];
  const warnings: string[] = [];

  results.forEach((result) => {
    if (result.status === "fulfilled") {
      jobs.push(result.value);
    } else {
      const reason = result.reason;
      warnings.push(
        reason instanceof VideoApiError
          ? reason.message
          : "No se pudo crear una de las tareas en Magnific.",
      );
    }
  });

  if (jobs.length === 0) {
    const first = results[0];
    if (first?.status === "rejected") throw first.reason;
    throw new VideoApiError({
      message: "No se pudo crear ninguna tarea en Magnific.",
      status: 502,
      code: "INVALID_RESPONSE",
    });
  }

  return {
    id: "",
    status: "queued",
    jobs,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function getJob(
  apiKey: string,
  jobId: string,
  context: VideoJobContext,
): Promise<VideoProviderJob> {
  const model = requireModel(context.model);
  const data = await magnificFetch<{
    data?: { task_id?: string; status?: string; generated?: string[] };
  }>(`${model.statusPath}/${encodeURIComponent(jobId)}`, {
    apiKey,
    attempts: 2,
  });

  const status = data.data?.status ?? "CREATED";
  const generated = data.data?.generated ?? [];

  return {
    id: data.data?.task_id ?? jobId,
    batchId: null,
    status: mapStatus(status),
    errorCode: status === "FAILED" ? "FAILED" : null,
    etaMs: null,
    thumbnailUrl: null,
    inputObjectKey: null,
    tailObjectKey: null,
    providerVideoUrl: generated[0] ?? null,
    prompt: null,
    model: context.model,
    durationSeconds: null,
    aspectRatio: null,
    resolution: context.resolution,
    audio: null,
    jobType: "image_to_video",
    priceSnapshot: null,
  };
}

async function listJobsByBatch(): Promise<VideoProviderJob[]> {
  // Magnific no agrupa varias tareas: cada job se consulta por separado.
  return [];
}

async function getVideoUrl(): Promise<string> {
  throw new VideoApiError({
    message: "Magnific entrega la URL del video en el estado de la tarea.",
    status: 400,
    code: "NO_OUTPUT",
  });
}

export const magnificProvider: VideoProviderAdapter = {
  id: "magnific",
  label: "Magnific",
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
